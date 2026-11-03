import { useState, type FormEvent } from "react";
import { History, RefreshCw, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";

type HistoryFilters = {
  userId?: number;
  status?: "pending" | "confirmed" | "settled" | "cancelled";
  settlementStatus?: "pending" | "confirmed_awaiting_credit" | "completed";
  fromDate?: string;
  toDate?: string;
  scanLimit: number;
};

type HistoryRow = {
  id: number;
  userId: number;
  currency: string;
  principalMinor: number;
  status: string;
  settlementStatus: string;
  lifecycleStage: string;
  confirmedAt: Date;
  completionAt: Date | null;
  settledAt: Date | null;
  actualResultAvailable: boolean;
  settlementConfirmedAt: Date | null;
  settlementReference: string | null;
  settlementOutcome: string | null;
  realizedGrossProfitMinor: number | null;
  platformFeeMinor: number | null;
  netProfitMinor: number | null;
  walletUpdatedAt: Date | null;
};

function persistedTimestamp(value: Date | string | null | undefined) {
  if (!value) return "Not recorded";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "Unavailable";
}

export default function AdminTradingHistory() {
  const [userIdDraft, setUserIdDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState("");
  const [settlementStatusDraft, setSettlementStatusDraft] = useState("");
  const [fromDateDraft, setFromDateDraft] = useState("");
  const [toDateDraft, setToDateDraft] = useState("");
  const [filters, setFilters] = useState<HistoryFilters>({ scanLimit: 100 });
  const [beforeTradeId, setBeforeTradeId] = useState<number | undefined>();
  const [filterError, setFilterError] = useState("");
  const query = trpc.adminOperations.tradingHistory.useQuery({ ...filters, beforeTradeId }, { refetchOnWindowFocus: false });
  const rows = (query.data?.rows ?? []) as HistoryRow[];

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilterError("");
    const parsedUserId = userIdDraft.trim() ? Number(userIdDraft) : undefined;
    if (parsedUserId !== undefined && (!Number.isSafeInteger(parsedUserId) || parsedUserId < 1 || parsedUserId > 2_147_483_647)) {
      setFilterError("Customer ID must be a positive whole number within the supported database range.");
      return;
    }
    if (fromDateDraft && toDateDraft && fromDateDraft > toDateDraft) {
      setFilterError("The UTC start date must not follow the end date.");
      return;
    }
    setBeforeTradeId(undefined);
    setFilters({
      scanLimit: 100,
      userId: parsedUserId,
      status: statusDraft ? statusDraft as HistoryFilters["status"] : undefined,
      settlementStatus: settlementStatusDraft ? settlementStatusDraft as HistoryFilters["settlementStatus"] : undefined,
      fromDate: fromDateDraft || undefined,
      toDate: toDateDraft || undefined,
    });
  };

  const clearFilters = () => {
    setUserIdDraft("");
    setStatusDraft("");
    setSettlementStatusDraft("");
    setFromDateDraft("");
    setToDateDraft("");
    setBeforeTradeId(undefined);
    setFilterError("");
    setFilters({ scanLimit: 100 });
  };

  return <div className="arb-page portal-page trade-history-page">
    <header className="portal-page-top">
      <div>
        <div className="eyebrow">Trade Settings · persisted records · read only</div>
        <h1>Trading History</h1>
        <p>Inspect saved trade lifecycle fields and evidence references. This page does not confirm results, reconcile or post ledger entries, or edit a trade.</p>
      </div>
      <button className="secondary-button" type="button" onClick={() => query.refetch()} disabled={query.isFetching}>
        <RefreshCw size={14} /> {query.isFetching ? "Loading…" : "Refresh scan"}
      </button>
    </header>

    <form className="settings-card trade-history-filters" onSubmit={applyFilters}>
      <div className="portal-section-heading"><div><div className="eyebrow">Supported filters</div><h2>Filter persisted records</h2></div><span>All filters apply only to each bounded scan window</span></div>
      <div className="admin-ops-form-grid">
        <label>Customer ID
          <input type="number" min="1" max="2147483647" step="1" value={userIdDraft} onChange={(event) => setUserIdDraft(event.target.value)} placeholder="Any customer" />
        </label>
        <label>Trade status
          <select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)}>
            <option value="">All supported statuses</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="settled">Settled</option><option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label>Settlement status
          <select value={settlementStatusDraft} onChange={(event) => setSettlementStatusDraft(event.target.value)}>
            <option value="">All supported statuses</option><option value="pending">Pending</option><option value="confirmed_awaiting_credit">Confirmed — awaiting credit</option><option value="completed">Completed</option>
          </select>
        </label>
        <label>Trade record date from (UTC)
          <input type="date" value={fromDateDraft} onChange={(event) => setFromDateDraft(event.target.value)} />
        </label>
        <label>Trade record date through (UTC)
          <input type="date" value={toDateDraft} onChange={(event) => setToDateDraft(event.target.value)} />
        </label>
      </div>
      {filterError && <div className="admin-ops-empty error" role="alert">{filterError}</div>}
      <div className="trade-history-actions">
        <button className="primary-button" type="submit" disabled={query.isFetching}>Apply filters</button>
        <button className="secondary-button" type="button" onClick={clearFilters}>Clear filters</button>
      </div>
    </form>

    <section className="admin-ops-panel" aria-labelledby="trading-history-results-heading">
      <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Saved trade-position records</span><h2 id="trading-history-results-heading">History scan</h2></div><span className="admin-ops-subtle">{query.data ? `${rows.length} matches · ${query.data.scannedCount} records scanned` : "Awaiting read"}</span></div>
      <p className="admin-ops-subtle">Scans are ordered by descending persisted trade ID for stable keyset continuation; that order is not represented as a timestamp sort. UTC date filters use the saved trade confirmedAt field.</p>
      {query.isLoading && <div className="admin-ops-empty compact" role="status">Loading a bounded Trading History window…</div>}
      {query.isError && <div className="admin-ops-empty error" role="alert">Trading History could not be loaded. No changes were made.</div>}
      {query.isSuccess && rows.length === 0 && <div className="admin-ops-empty compact" role="status">No matching records in this scanned window. {query.data.hasMore ? "Older trade IDs remain; continue scanning before concluding there are no matches." : "No older trade records remain to scan."}</div>}
      {rows.length > 0 && <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Persisted Trading History records">
        <table className="admin-ops-table"><thead><tr><th>Trade / customer</th><th>Persisted lifecycle</th><th>Principal</th><th>Actual result</th><th>Evidence / posting</th></tr></thead>
          <tbody>{rows.map((trade) => {
            const actualResultAvailable = trade.actualResultAvailable;
            return <tr key={trade.id}>
              <td><strong>Trade {trade.id}</strong><small>Customer ID {trade.userId} · {trade.currency}</small><small>Trade confirmed {persistedTimestamp(trade.confirmedAt)} UTC</small></td>
              <td><strong>{trade.status} / {trade.settlementStatus}</strong><small>{trade.lifecycleStage || "Lifecycle stage not recorded"}</small><small>Completion {persistedTimestamp(trade.completionAt)} UTC</small><small>Settled {persistedTimestamp(trade.settledAt)} UTC</small></td>
              <td>{trade.principalMinor} {trade.currency} minor units</td>
              <td>{actualResultAvailable ? <><strong>{trade.settlementOutcome}</strong><small>Gross {trade.realizedGrossProfitMinor ?? "Unavailable"} · fee {trade.platformFeeMinor ?? "Unavailable"} · net {trade.netProfitMinor ?? "Unavailable"} {trade.currency} minor units</small><small>Confirmed {persistedTimestamp(trade.settlementConfirmedAt)} UTC</small></> : <span>Actual result not recorded with confirmation evidence</span>}</td>
              <td><small>Reference: {actualResultAvailable ? trade.settlementReference : "Not recorded"}</small><small>Wallet posting: {persistedTimestamp(trade.walletUpdatedAt)} UTC</small></td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
      {query.data?.hasMore && <div className="trade-history-actions"><span>More persisted trade IDs remain after this bounded window.</span><button className="secondary-button" type="button" onClick={() => setBeforeTradeId(query.data.nextBeforeTradeId ?? undefined)} disabled={query.isFetching || !query.data.nextBeforeTradeId}>Scan next window</button></div>}
      <div className="admin-ops-note"><ShieldCheck size={16} /><span>Each request processes no more than 250 persisted trade rows plus a continuation sentinel. A filtered window with no matches is not proof that no older match exists. The API returns actual-result fields only when a persisted confirmer, confirmation time, reference, and recognized outcome are all present; otherwise those fields are null. No missing values are reconstructed.</span></div>
    </section>
    <div className="admin-ops-note"><History size={16} /><span>Settlement &amp; Reconciliation remains the owner for confirming an actual result and reconciling trade/ledger records. Finance → Wallet &amp; Ledger and Database Entries remain separate ledger destinations.</span></div>
  </div>;
}
