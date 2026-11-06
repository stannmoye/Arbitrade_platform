import { useMemo, useState } from "react";

export type CustomerOpportunityHistoryKind = "available" | "missed" | "allocated" | "settled";

export type CustomerOpportunityHistoryEntry = {
  id: string;
  kind: CustomerOpportunityHistoryKind;
  title: string;
  subtitle: string;
  status: string;
  occurredAt: string | null;
  searchable: string;
};

type HistoryInput = {
  offers?: any[];
  missed?: any[];
  trades?: any[];
};

function dateValue(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function displayName(item: any): string {
  return String(item?.companyDisplayName || item?.companyName || item?.symbol || item?.name || "Opportunity");
}

/**
 * Builds a read-only timeline exclusively from records already returned by the
 * authenticated customer opportunity and trade queries. It never infers a
 * viewed, dismissed, expired, or settled state that the server did not return.
 */
export function buildCustomerOpportunityHistory(input: HistoryInput): CustomerOpportunityHistoryEntry[] {
  const offers = Array.isArray(input.offers) ? input.offers : [];
  const missed = Array.isArray(input.missed) ? input.missed : [];
  const trades = Array.isArray(input.trades) ? input.trades : [];

  const entries: CustomerOpportunityHistoryEntry[] = [];

  for (const offer of offers) {
    const status = String(offer?.offerStatus || offer?.status || "open").toLowerCase();
    if (status !== "open") continue;
    const id = String(offer?.id ?? offer?.offerId ?? "");
    if (!id) continue;
    const title = displayName(offer);
    const occurredAt = dateValue(offer?.opensAt || offer?.createdAt);
    entries.push({
      id: `available:${id}`,
      kind: "available",
      title,
      subtitle: [offer?.venueFrom, offer?.venueTo].filter((part: unknown) => typeof part === "string" && part && part !== "Informational").join(" → ") || `Opportunity ${id}`,
      status: "Open · available for review",
      occurredAt,
      searchable: `${title} ${id} ${offer?.symbol || ""} available open`.toLowerCase(),
    });
  }

  for (const item of missed) {
    const id = String(item?.id ?? item?.offerId ?? "");
    if (!id) continue;
    const title = displayName(item);
    const reason = String(item?.reason || "Insufficient available balance").replaceAll("_", " ").toLowerCase();
    const occurredAt = dateValue(item?.createdAt || item?.occurredAt);
    entries.push({
      id: `missed:${id}`,
      kind: "missed",
      title,
      subtitle: `Opportunity ${item?.offerId ?? id} · ${reason}`,
      status: "Missed · not allocated",
      occurredAt,
      searchable: `${title} ${id} ${item?.offerId || ""} ${reason} missed`.toLowerCase(),
    });
  }

  for (const trade of trades) {
    const id = String(trade?.id ?? "");
    if (!id) continue;
    const settled = String(trade?.status || "").toLowerCase() === "settled";
    const title = displayName(trade);
    const occurredAt = dateValue(trade?.settledAt || trade?.confirmedAt || trade?.createdAt);
    const stage = String(trade?.stage || (settled ? "Settlement recorded" : "Awaiting settlement"));
    entries.push({
      id: `trade:${id}`,
      kind: settled ? "settled" : "allocated",
      title,
      subtitle: `Trade #${id} · ${stage}`,
      status: settled ? "Settled · server recorded" : "Allocated · settlement pending",
      occurredAt,
      searchable: `${title} ${id} ${stage} ${settled ? "settled" : "allocated"}`.toLowerCase(),
    });
  }

  return entries.sort((left, right) => {
    const timeDifference = (right.occurredAt ? Date.parse(right.occurredAt) : 0) - (left.occurredAt ? Date.parse(left.occurredAt) : 0);
    return timeDifference || left.id.localeCompare(right.id);
  });
}

const filters: Array<{ id: "all" | CustomerOpportunityHistoryKind; label: string }> = [
  { id: "all", label: "All activity" },
  { id: "available", label: "Available" },
  { id: "missed", label: "Missed" },
  { id: "allocated", label: "Allocated" },
  { id: "settled", label: "Settled" },
];

export function CustomerOpportunityHistoryPanel({ offers, missed, trades }: HistoryInput) {
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const [search, setSearch] = useState("");
  const entries = useMemo(() => buildCustomerOpportunityHistory({ offers, missed, trades }), [offers, missed, trades]);
  const normalizedSearch = search.trim().toLowerCase();
  const visible = entries.filter(entry =>
    (filter === "all" || entry.kind === filter) &&
    (!normalizedSearch || entry.searchable.includes(normalizedSearch))
  );
  const countFor = (kind: string) => kind === "all" ? entries.length : entries.filter(entry => entry.kind === kind).length;

  return <section className="customer-panel customer-opportunity-history" aria-labelledby="customer-opportunity-history-title">
    <div className="customer-panel-head">
      <div><div className="eyebrow">Server-recorded activity</div><h2 id="customer-opportunity-history-title">Opportunity history</h2></div>
      <span>{entries.length} records</span>
    </div>
    <p className="customer-opportunity-history__note">A read-only timeline of open opportunities, recorded missed events and persisted trades. Only statuses supplied by the server are shown.</p>
    <label className="customer-opportunity-history__search-label" htmlFor="customer-opportunity-history-search">Search company, reference or status</label>
    <input id="customer-opportunity-history-search" className="customer-opportunity-history__search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search opportunity history" autoComplete="off" />
    <div className="customer-opportunity-history__filters" role="group" aria-label="Filter opportunity history">
      {filters.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} className={filter === item.id ? "is-active" : ""} onClick={() => setFilter(item.id)}>{item.label}<span>{countFor(item.id)}</span></button>)}
    </div>
    {visible.length ? <div className="customer-opportunity-history__list">
      {visible.map(entry => <article className="customer-opportunity-history__item" key={entry.id}>
        <span className={`customer-opportunity-history__marker customer-opportunity-history__marker--${entry.kind}`} aria-hidden="true" />
        <div className="customer-opportunity-history__body">
          <div className="customer-opportunity-history__topline"><strong>{entry.title}</strong><span className={`customer-opportunity-history__status customer-opportunity-history__status--${entry.kind}`}>{entry.status}</span></div>
          <p>{entry.subtitle}</p>
          <time dateTime={entry.occurredAt || undefined}>{entry.occurredAt ? new Date(entry.occurredAt).toLocaleString() : "Server timestamp unavailable"}</time>
        </div>
      </article>)}
    </div> : <div className="customer-opportunity-history__empty" role="status">{entries.length ? "No history records match this filter." : "No opportunity or trade activity has been recorded for this account yet."}</div>}
  </section>;
}
