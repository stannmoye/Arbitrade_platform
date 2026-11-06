import { useMemo, useState } from "react";

export type CustomerOpportunityHistoryKind = "available" | "missed" | "allocated" | "settled" | "dismissed" | "expired";

export type CustomerOpportunityHistoryEntry = {
  id: string;
  reference: string;
  kind: CustomerOpportunityHistoryKind;
  title: string;
  subtitle: string;
  status: string;
  occurredAt: string | null;
  searchable: string;
};

export type CustomerOpportunityHistoryGroup = {
  key: string;
  label: string;
  entries: CustomerOpportunityHistoryEntry[];
};

type HistoryInput = {
  offers?: any[];
  missed?: any[];
  trades?: any[];
};

const HISTORY_PAGE_SIZE = 8;

function dateValue(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function displayName(item: any): string {
  return String(item?.companyDisplayName || item?.companyName || item?.symbol || item?.name || "Opportunity");
}

/** Builds a conservative, read-only timeline from records already returned by customer queries. */
export function buildCustomerOpportunityHistory(input: HistoryInput): CustomerOpportunityHistoryEntry[] {
  const offers = Array.isArray(input.offers) ? input.offers : [];
  const missed = Array.isArray(input.missed) ? input.missed : [];
  const trades = Array.isArray(input.trades) ? input.trades : [];
  const entries: CustomerOpportunityHistoryEntry[] = [];

  for (const offer of offers) {
    const deliveryStatus = String(offer?.deliveryStatus || "").toLowerCase();
    const id = String(offer?.id ?? offer?.offerId ?? "");
    if (!id) continue;
    const title = displayName(offer);

    if (deliveryStatus === "dismissed") {
      const occurredAt = dateValue(offer?.dismissedAt);
      entries.push({ id: "dismissed:" + id, reference: id, kind: "dismissed", title, subtitle: "Opportunity " + id + " · notice dismissed", status: "Dismissed · presentation only", occurredAt, searchable: (title + " " + id + " dismissed presentation notice").toLowerCase() });
      continue;
    }
    if (deliveryStatus === "expired") {
      const occurredAt = dateValue(offer?.expiredAt || offer?.closesAt);
      entries.push({ id: "expired:" + id, reference: id, kind: "expired", title, subtitle: "Opportunity " + id + " · delivery window ended", status: "Expired · delivery ended", occurredAt, searchable: (title + " " + id + " expired delivery ended").toLowerCase() });
      continue;
    }

    const offerStatus = String(offer?.offerStatus ?? offer?.status ?? "").toLowerCase();
    if (offerStatus !== "open") continue;
    const occurredAt = dateValue(offer?.opensAt || offer?.createdAt);
    entries.push({
      id: "available:" + id,
      reference: id,
      kind: "available",
      title,
      subtitle: [offer?.venueFrom, offer?.venueTo].filter((part: unknown) => typeof part === "string" && part && part !== "Informational").join(" → ") || ("Opportunity " + id),
      status: "Open · available for review",
      occurredAt,
      searchable: (title + " " + id + " " + (offer?.symbol || "") + " available open").toLowerCase(),
    });
  }

  for (const item of missed) {
    const id = String(item?.id ?? item?.offerId ?? "");
    if (!id) continue;
    const title = displayName(item);
    const reason = String(item?.reason || "reason not supplied").replaceAll("_", " ").toLowerCase();
    const occurredAt = dateValue(item?.createdAt || item?.occurredAt);
    entries.push({ id: "missed:" + id, reference: String(item?.offerId ?? id), kind: "missed", title, subtitle: "Opportunity " + (item?.offerId ?? id) + " · " + reason, status: "Missed · not allocated", occurredAt, searchable: (title + " " + id + " " + (item?.offerId || "") + " " + reason + " missed").toLowerCase() });
  }

  for (const trade of trades) {
    const id = String(trade?.id ?? "");
    if (!id) continue;
    const tradeStatus = String(trade?.status || "").toLowerCase();
    if (tradeStatus !== "confirmed" && tradeStatus !== "settled") continue;
    const settled = tradeStatus === "settled";
    const title = displayName(trade);
    const occurredAt = dateValue(trade?.settledAt || trade?.confirmedAt || trade?.createdAt);
    const stage = String(trade?.stage || (settled ? "Settlement recorded" : "Awaiting settlement"));
    entries.push({ id: "trade:" + id, reference: id, kind: settled ? "settled" : "allocated", title, subtitle: "Trade #" + id + " · " + stage, status: settled ? "Settled · server recorded" : "Allocated · settlement pending", occurredAt, searchable: (title + " " + id + " " + stage + " " + (settled ? "settled" : "allocated")).toLowerCase() });
  }

  return entries.sort((left, right) => {
    const timeDifference = (right.occurredAt ? Date.parse(right.occurredAt) : 0) - (left.occurredAt ? Date.parse(left.occurredAt) : 0);
    return timeDifference || left.id.localeCompare(right.id);
  });
}

/** Groups an already ordered page into local calendar days without changing event order. */
export function groupCustomerOpportunityHistoryByDate(entries: CustomerOpportunityHistoryEntry[]): CustomerOpportunityHistoryGroup[] {
  const groups = new Map<string, CustomerOpportunityHistoryGroup>();
  for (const entry of entries) {
    const date = entry.occurredAt ? new Date(entry.occurredAt) : null;
    const key = date && Number.isFinite(date.getTime())
      ? [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-")
      : "unknown-date";
    const label = date
      ? date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : "Date unavailable";
    const group = groups.get(key) || { key, label, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

export function paginateCustomerOpportunityHistory<T>(entries: T[], page: number, pageSize = HISTORY_PAGE_SIZE): { items: T[]; page: number; pageCount: number; total: number; start: number; end: number } {
  const safePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : HISTORY_PAGE_SIZE;
  const pageCount = Math.ceil(entries.length / safePageSize);
  const requestedPage = Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0;
  const safePage = pageCount ? Math.min(requestedPage, pageCount - 1) : 0;
  const start = safePage * safePageSize;
  const items = entries.slice(start, start + safePageSize);
  return { items, page: safePage, pageCount, total: entries.length, start: entries.length ? start + 1 : 0, end: start + items.length };
}

export type CustomerOpportunityHistorySummary = { total: number } & Record<CustomerOpportunityHistoryKind, number>;

export function summarizeCustomerOpportunityHistory(entries: CustomerOpportunityHistoryEntry[]): CustomerOpportunityHistorySummary {
  const summary: CustomerOpportunityHistorySummary = { total: entries.length, available: 0, missed: 0, allocated: 0, settled: 0, dismissed: 0, expired: 0 };
  for (const entry of entries) summary[entry.kind] += 1;
  return summary;
}

const summaryItems: Array<{ id: CustomerOpportunityHistoryKind; label: string }> = [
  { id: "available", label: "Available" },
  { id: "missed", label: "Missed" },
  { id: "allocated", label: "Allocated" },
  { id: "settled", label: "Settled" },
  { id: "dismissed", label: "Dismissed" },
  { id: "expired", label: "Expired" },
];

const filters: Array<{ id: "all" | CustomerOpportunityHistoryKind; label: string }> = [
  { id: "all", label: "All activity" },
  { id: "available", label: "Available" },
  { id: "missed", label: "Missed" },
  { id: "dismissed", label: "Dismissed" },
  { id: "expired", label: "Expired" },
  { id: "allocated", label: "Allocated" },
  { id: "settled", label: "Settled" },
];

export function CustomerOpportunityHistoryPanel({ offers, missed, trades }: HistoryInput) {
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const entries = useMemo(() => buildCustomerOpportunityHistory({ offers, missed, trades }), [offers, missed, trades]);
  const normalizedSearch = search.trim().toLowerCase();
  const visible = entries.filter(entry =>
    (filter === "all" || entry.kind === filter) &&
    (!normalizedSearch || entry.searchable.includes(normalizedSearch))
  );
  const pageData = paginateCustomerOpportunityHistory(visible, page, HISTORY_PAGE_SIZE);
  const groups = groupCustomerOpportunityHistoryByDate(pageData.items);
  const summary = summarizeCustomerOpportunityHistory(entries);
  const countFor = (kind: "all" | CustomerOpportunityHistoryKind) => kind === "all" ? summary.total : summary[kind];

  return <section className="customer-panel customer-opportunity-history" aria-labelledby="customer-opportunity-history-title">
    <div className="customer-panel-head">
      <div><div className="eyebrow">Server-recorded activity</div><h2 id="customer-opportunity-history-title">Opportunity history</h2></div>
      <span>{entries.length} records</span>
    </div>
    <p className="customer-opportunity-history__note">A read-only timeline of available opportunities, recorded missed events, persisted delivery dismissals/expiries and trade history. Dismissed and expired labels appear only when the server records those exact delivery states.</p>
    <div className="customer-opportunity-history__overview" aria-label="History totals">
      {summaryItems.map(item => <div className={"customer-opportunity-history__metric customer-opportunity-history__metric--" + item.id} key={item.id}><span>{item.label}</span><strong>{summary[item.id]}</strong></div>)}
    </div>
    <label className="customer-opportunity-history__search-label" htmlFor="customer-opportunity-history-search">Search company, reference or status</label>
    <input id="customer-opportunity-history-search" className="customer-opportunity-history__search" type="search" aria-controls="customer-opportunity-history-results" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Search opportunity history" autoComplete="off" />
    <div className="customer-opportunity-history__filters" role="group" aria-label="Filter opportunity history">
      {filters.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} className={filter === item.id ? "is-active" : ""} onClick={() => { setFilter(item.id); setPage(0); }}>{item.label}<span>{countFor(item.id)}</span></button>)}
    </div>
    <div id="customer-opportunity-history-results" className="customer-opportunity-history__results" aria-live="polite" aria-relevant="all">
      {visible.length ? <>
        <div className="customer-opportunity-history__summary">Showing {pageData.start}–{pageData.end} of {pageData.total} matching records</div>
        <div className="customer-opportunity-history__groups">
          {groups.map(group => <section className="customer-opportunity-history__group" key={group.key} aria-label={group.label}>
            <h3>{group.label}<span>{group.entries.length} {group.entries.length === 1 ? "event" : "events"}</span></h3>
            <div className="customer-opportunity-history__list">
              {group.entries.map(entry => <article className="customer-opportunity-history__item" key={entry.id}>
                <span className={"customer-opportunity-history__marker customer-opportunity-history__marker--" + entry.kind} aria-hidden="true" />
                <div className="customer-opportunity-history__body">
                  <div className="customer-opportunity-history__topline"><strong>{entry.title}</strong><span className={"customer-opportunity-history__status customer-opportunity-history__status--" + entry.kind}>{entry.status}</span></div>
                  <p>{entry.subtitle}</p>
                  <time dateTime={entry.occurredAt || undefined}>{entry.occurredAt ? new Date(entry.occurredAt).toLocaleString() : "Server timestamp unavailable"}</time>
                  <details className="customer-opportunity-history__details">
                    <summary>View record details</summary>
                    <dl>
                      <div><dt>Record reference</dt><dd>{entry.reference}</dd></div>
                      <div><dt>Recorded category</dt><dd>{entry.kind}</dd></div>
                      <div><dt>Recorded status</dt><dd>{entry.status}</dd></div>
                      <div><dt>Server timestamp</dt><dd>{entry.occurredAt ? new Date(entry.occurredAt).toLocaleString() : "Not supplied"}</dd></div>
                    </dl>
                    <p>Informational record only. This view does not perform or request any account action.</p>
                  </details>
                </div>
              </article>)}
            </div>
          </section>)}
        </div>
        {pageData.pageCount > 1 && <nav className="customer-opportunity-history__pagination" aria-label="Opportunity history pages">
          <button type="button" onClick={() => setPage(Math.max(0, pageData.page - 1))} disabled={pageData.page === 0}>Previous</button>
          <span aria-current="page">Page {pageData.page + 1} of {pageData.pageCount}</span>
          <button type="button" onClick={() => setPage(Math.min(pageData.pageCount - 1, pageData.page + 1))} disabled={pageData.page >= pageData.pageCount - 1}>Next</button>
        </nav>}
      </> : <div className="customer-opportunity-history__empty" role="status">{entries.length ? "No history records match this filter." : "No opportunity or trade activity has been recorded for this account yet."}</div>}
    </div>
  </section>;
}
