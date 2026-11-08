import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, FileSearch, Filter, RefreshCw, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Tab = "records" | "customers" | "failures" | "queue" | "worker";
type DraftFilters = {
  customerName: string; customerId: string; opportunityId: string; packageName: string; companyName: string;
  status: string; from: string; to: string; minRetries: string;
  failedOnly: boolean; expiredOnly: boolean; queuedOnly: boolean; stalledOnly: boolean;
};

const initialFilters: DraftFilters = {
  customerName: "", customerId: "", opportunityId: "", packageName: "", companyName: "", status: "",
  from: "", to: "", minRetries: "", failedOnly: false, expiredOnly: false, queuedOnly: false, stalledOnly: false,
};
const statuses = ["queued", "in_progress", "retry_wait", "received", "rendered", "failed", "expired", "dismissed", "generated", "queue_record_unavailable"];
const latencyLabels: Record<string, string> = {
  generationToQueue: "Generation → queue record",
  queueToClaim: "Queue → request-scoped dispatch claim",
  claimToReceipt: "Dispatch claim → browser receipt",
  receiptToRender: "Browser receipt → popup render",
  generationToRender: "Generation → confirmed popup render",
};

function timestamp(value: string | null | undefined) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unavailable";
}
function duration(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)} sec`;
  if (value < 3_600_000) return `${(value / 60_000).toFixed(1)} min`;
  return `${(value / 3_600_000).toFixed(1)} hr`;
}
function age(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  if (value < 60_000) return `${Math.round(value / 1000)} sec`;
  if (value < 3_600_000) return `${Math.floor(value / 60_000)} min`;
  if (value < 86_400_000) return `${Math.floor(value / 3_600_000)} hr`;
  return `${Math.floor(value / 86_400_000)} day`;
}
function csvCell(value: unknown) {
  const raw = value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}
function downloadCsv(rows: Array<Record<string, unknown>>, filename: string) {
  if (!rows.length) return;
  const columns = ["opportunityId", "customerId", "customerName", "packageName", "companyName", "generatedAt", "assignedAt", "deliveryStatus", "lastAttemptAt", "browserReceivedAt", "popupRenderedAt", "retryCount", "lastErrorCode", "lastErrorMessage"];
  const text = [columns.join(","), ...rows.map(row => columns.map(key => csvCell(row[key])).join(","))].join("\r\n");
  const blob = new Blob(["\uFEFF", text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
function Status({ value }: { value: string }) {
  const kind = ["healthy", "rendered", "received", "complete", "generated"].includes(value) ? "good" : ["degraded", "failed", "expired", "stale"].includes(value) ? "high" : ["in_progress", "retry_wait", "queued", "running", "not_started"].includes(value) ? "watch" : "";
  const label = value === "stale" ? "Inactive (stale)" : value === "not_started" ? "Inactive (not started)" : value === "unavailable" ? "Unavailable" : value.replace(/_/g, " ");
  return <span className={`admin-ops-status ${kind}`}>{label}</span>;
}
function SmallMetric({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return <div className="delivery-diagnostic-metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}
function Empty({ children }: { children: ReactNode }) { return <div className="admin-ops-empty compact">{children}</div>; }

function toApiFilters(draft: DraftFilters, failureAnalysisOnly = false) {
  const customerId = draft.customerId.trim() ? Number(draft.customerId) : undefined;
  const opportunityId = draft.opportunityId.trim() ? Number(draft.opportunityId) : undefined;
  const minRetries = draft.minRetries.trim() ? Number(draft.minRetries) : undefined;
  if (draft.customerName.trim() && draft.customerName.trim().length < 2) return { error: "Customer name prefix must contain at least two characters." } as const;
  if (customerId !== undefined && (!Number.isSafeInteger(customerId) || customerId < 1)) return { error: "Customer ID must be a positive whole number." } as const;
  if (opportunityId !== undefined && (!Number.isSafeInteger(opportunityId) || opportunityId < 1)) return { error: "Opportunity ID must be a positive whole number." } as const;
  if (minRetries !== undefined && (!Number.isInteger(minRetries) || minRetries < 0 || minRetries > 20)) return { error: "Retry count must be from 0 to 20." } as const;
  const from = draft.from ? new Date(`${draft.from}T00:00:00`).toISOString() : undefined;
  const to = draft.to ? new Date(`${draft.to}T23:59:59.999`).toISOString() : undefined;
  if (from && to && Date.parse(from) > Date.parse(to)) return { error: "Start date must not be after end date." } as const;
  return {
    filters: {
      ...(draft.customerName.trim() ? { customerName: draft.customerName.trim() } : {}),
      ...(customerId ? { customerId } : {}), ...(opportunityId ? { opportunityId } : {}),
      ...(draft.packageName.trim() ? { packageName: draft.packageName.trim() } : {}),
      ...(draft.companyName.trim() ? { companyName: draft.companyName.trim() } : {}),
      ...(draft.status ? { status: draft.status as (typeof statuses)[number] } : {}),
      ...(from ? { from } : {}), ...(to ? { to } : {}),
      ...(draft.failedOnly ? { failedOnly: true } : {}), ...(draft.expiredOnly ? { expiredOnly: true } : {}),
      ...(draft.queuedOnly ? { queuedOnly: true } : {}), ...(draft.stalledOnly ? { stalledOnly: true } : {}),
      ...(minRetries !== undefined ? { minRetries } : {}), ...(failureAnalysisOnly ? { failureAnalysisOnly: true } : {}),
    },
  } as const;
}

export function AdminOpportunityDeliveryDiagnostics() {
  const [activeTab, setActiveTab] = useState<Tab>("records");
  const [draft, setDraft] = useState<DraftFilters>(initialFilters);
  const [applied, setApplied] = useState<DraftFilters>(initialFilters);
  const [page, setPage] = useState(1);
  const [selectedRecord, setSelectedRecord] = useState<{ customerId: number; opportunityId: number } | null>(null);
  const [filterError, setFilterError] = useState("");
  const [customerTerm, setCustomerTerm] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [exportMessage, setExportMessage] = useState("");
  const appliedResult = useMemo(() => toApiFilters(applied), [applied]);
  const failureResult = useMemo(() => toApiFilters(applied, true), [applied]);
  const activeFilters = activeTab === "failures" ? failureResult : appliedResult;
  const safeFilters = "filters" in activeFilters ? activeFilters.filters : {};
  const listQuery = trpc.adminOperations.opportunityDeliveryRecords.useQuery(
    { filters: safeFilters as any, page, pageSize: 20 },
    { enabled: activeTab === "records" || activeTab === "failures", refetchInterval: 30_000, refetchOnWindowFocus: true },
  );
  const detailsQuery = trpc.adminOperations.opportunityDeliveryDetails.useQuery(
    { customerId: selectedRecord?.customerId ?? 1, offerId: selectedRecord?.opportunityId ?? 1 }, { enabled: selectedRecord !== null },
  );
  const customerSearchQuery = trpc.adminOperations.opportunityDeliveryCustomerSearch.useQuery(
    { query: customerTerm.trim().length >= 2 ? customerTerm.trim() : "search" },
    { enabled: activeTab === "customers" && customerTerm.trim().length >= 2 && selectedCustomerId === null, refetchOnWindowFocus: false },
  );
  const customerQuery = trpc.adminOperations.opportunityDeliveryCustomer.useQuery(
    { customerId: selectedCustomerId ?? 1 }, { enabled: activeTab === "customers" && selectedCustomerId !== null, refetchOnWindowFocus: false },
  );
  const queueQuery = trpc.adminOperations.opportunityDeliveryQueueDiagnostics.useQuery(undefined, {
    enabled: activeTab === "queue", refetchInterval: 15_000, refetchOnWindowFocus: true,
  });
  const workerQuery = trpc.adminOperations.workerHealth.useQuery(undefined, {
    enabled: activeTab === "worker", refetchInterval: 15_000, refetchOnWindowFocus: true,
  });
  const exportQuery = trpc.adminOperations.exportOpportunityDeliveryRecords.useQuery(
    { filters: "filters" in activeFilters ? activeFilters.filters as any : {}, maxRows: 10_000 },
    { enabled: false },
  );
  const rows = ((listQuery.data as any)?.rows ?? []) as any[];
  const total = Number((listQuery.data as any)?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / 20));
  const patchDraft = (key: keyof DraftFilters, value: string | boolean) => setDraft(current => ({ ...current, [key]: value }));
  const applyFilters = () => {
    const result = toApiFilters(draft);
    if ("error" in result) { setFilterError(result.error ?? "The supplied filter is invalid."); return; }
    setFilterError(""); setApplied(draft); setPage(1); setSelectedRecord(null);
  };
  const resetFilters = () => { setDraft(initialFilters); setApplied(initialFilters); setFilterError(""); setPage(1); setSelectedRecord(null); };
  const refresh = () => {
    if (activeTab === "records" || activeTab === "failures") void listQuery.refetch();
    else if (activeTab === "customers") { if (selectedCustomerId) void customerQuery.refetch(); else if (customerTerm.trim().length >= 2) void customerSearchQuery.refetch(); }
    else if (activeTab === "queue") void queueQuery.refetch();
    else void workerQuery.refetch();
    if (selectedRecord !== null) void detailsQuery.refetch();
  };
  const doExport = async () => {
    setExportMessage("");
    const result = await exportQuery.refetch();
    const data = result.data as any;
    if (!data?.sourceAvailable) { setExportMessage("Export source is unavailable."); return; }
    downloadCsv(data.rows ?? [], "opportunity-delivery-diagnostics.csv");
    setExportMessage(`${Math.min(data.rows?.length ?? 0, data.total)} records exported${data.truncated ? " (10,000-row limit reached; narrow the filters for more)" : ""}.`);
  };
  const searchTab = (tab: Tab) => { setActiveTab(tab); if (tab === "failures") setPage(1); };
  const tabs: Array<[Tab, string, typeof Search]> = [["records", "Opportunity records", FileSearch], ["customers", "Customer search", UserRound], ["failures", "Failure analysis", AlertTriangle], ["queue", "Queue & latency", Clock3], ["worker", "Worker health", ShieldCheck]];
  const detail = detailsQuery.data as any;
  const customer = customerQuery.data as any;
  const queue = queueQuery.data as any;
  const workerData = workerQuery.data as any;
  const worker = workerData?.workers?.find((item: any) => item.workerKey === "trading-opportunities" && item.isCurrentInstance)
    ?? workerData?.workers?.find((item: any) => item.workerKey === "trading-opportunities");
  const openDetails = (opportunityId: number, customerId: number) => { setSelectedRecord({ opportunityId, customerId }); setActiveTab("records"); };
  const openCustomer = (id: number, name: string) => { setCustomerTerm(name); setSelectedCustomerId(id); setSelectedRecord(null); setActiveTab("customers"); };

  return <section className="delivery-diagnostics admin-ops-panel" aria-label="Opportunity delivery investigations">
    <div className="admin-ops-panel-head delivery-diagnostic-heading">
      <div><span className="admin-ops-kicker">Read-only investigation</span><h2>Delivery diagnostics</h2><p>Find persisted opportunity evidence and distinguish confirmed browser receipt/rendering from queued or attempted delivery.</p></div>
      <div className="delivery-diagnostic-actions">
        {(activeTab === "records" || activeTab === "failures") && <button className="admin-ops-button" type="button" onClick={() => void doExport()} disabled={exportQuery.isFetching}><Download size={14}/>{exportQuery.isFetching ? "Preparing…" : "Export filtered CSV"}</button>}
        <button className="admin-ops-button" type="button" onClick={refresh} disabled={listQuery.isFetching || queueQuery.isFetching || workerQuery.isFetching}><RefreshCw size={14}/>Refresh</button>
      </div>
    </div>
    <div className="delivery-diagnostic-tabs" role="tablist" aria-label="Delivery diagnostics views">
      {tabs.map(([id, label, Icon]) => <button key={id} role="tab" aria-selected={activeTab === id} className={activeTab === id ? "active" : ""} type="button" onClick={() => searchTab(id)}><Icon size={14}/>{label}</button>)}
    </div>
    {exportMessage && <div className="admin-ops-note" role="status"><Download size={14}/><span>{exportMessage}</span><button type="button" className="delivery-diagnostic-close" aria-label="Dismiss export message" onClick={() => setExportMessage("")}><X size={14}/></button></div>}

    {(activeTab === "records" || activeTab === "failures") && <>
      <div className="delivery-diagnostic-filter-grid">
        <label>Customer name starts with<input value={draft.customerName} onChange={e => patchDraft("customerName", e.target.value)} maxLength={100} placeholder="Name prefix" /></label>
        <label>Customer ID<input value={draft.customerId} onChange={e => patchDraft("customerId", e.target.value)} inputMode="numeric" type="number" min="1" placeholder="Exact ID" /></label>
        <label>Opportunity ID<input value={draft.opportunityId} onChange={e => patchDraft("opportunityId", e.target.value)} inputMode="numeric" type="number" min="1" placeholder="Exact ID" /></label>
        <label>Package / tier<input value={draft.packageName} onChange={e => patchDraft("packageName", e.target.value)} maxLength={80} placeholder="Package prefix" /></label>
        <label>Company<input value={draft.companyName} onChange={e => patchDraft("companyName", e.target.value)} maxLength={120} placeholder="Company prefix" /></label>
        <label>Current delivery status<select value={draft.status} onChange={e => patchDraft("status", e.target.value)}><option value="">Any status</option>{statuses.map(status => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}</select></label>
        <label>Generated from<input type="date" value={draft.from} onChange={e => patchDraft("from", e.target.value)} /></label>
        <label>Generated through<input type="date" value={draft.to} onChange={e => patchDraft("to", e.target.value)} /></label>
        <label>Minimum retry attempts<input type="number" min="0" max="20" value={draft.minRetries} onChange={e => patchDraft("minRetries", e.target.value)} placeholder="0" /></label>
      </div>
      <div className="delivery-diagnostic-checks">
        <label><input type="checkbox" checked={draft.failedOnly} onChange={e => patchDraft("failedOnly", e.target.checked)} /> Failed</label>
        <label><input type="checkbox" checked={draft.expiredOnly} onChange={e => patchDraft("expiredOnly", e.target.checked)} /> Expired</label>
        <label><input type="checkbox" checked={draft.queuedOnly} onChange={e => patchDraft("queuedOnly", e.target.checked)} /> Pending delivery</label>
        <label><input type="checkbox" checked={draft.stalledOnly} onChange={e => patchDraft("stalledOnly", e.target.checked)} /> Overdue lease/retry</label>
        <button className="admin-ops-button" type="button" onClick={applyFilters}><Filter size={14}/>Apply filters</button>
        <button className="delivery-diagnostic-reset" type="button" onClick={resetFilters}>Reset</button>
      </div>
      {activeTab === "failures" && <div className="admin-ops-note"><AlertTriangle size={15}/><span>Includes persisted terminal failures/expiry and overdue lease/retry states. An overdue acknowledgement does not prove the customer did not see or render the popup. Terminal records have no manual retry action here.</span></div>}
      {filterError && <div className="admin-ops-empty error" role="alert">{filterError}</div>}
      {listQuery.isError ? <div className="admin-ops-empty error">Delivery investigation records are unavailable. Confirm migration 0110 and database connectivity.</div> : listQuery.isLoading ? <Empty>Loading persisted opportunity records…</Empty> : <>
        <div className="admin-ops-meta-line"><span>{total.toLocaleString()} matching opportunities · page {page} of {pages}</span><span>Updated {timestamp((listQuery.data as any)?.generatedAt)}</span></div>
        {activeTab === "records" ? <div className="admin-ops-table-wrap"><table className="admin-ops-table"><thead><tr><th>Opportunity / customer</th><th>Package</th><th>Company</th><th>Generated</th><th>Status</th><th>Age</th><th>Retries</th><th>Last request claim</th><th>Browser receipt</th><th>Rendered</th><th>Last known error</th><th>Inspect</th><th>Customer</th></tr></thead><tbody>
          {!rows.length ? <tr><td className="admin-ops-table-empty" colSpan={13}>No persisted opportunities match the current filters.</td></tr> : rows.map(row => <tr key={`${row.customerId}-${row.opportunityId}`}>
            <td><strong>#{row.opportunityId}</strong><small>{row.customerName} · customer {row.customerId}</small></td><td>{row.packageName}</td><td>{row.companyName}</td><td>{timestamp(row.generatedAt)}</td><td><Status value={row.deliveryStatus}/></td><td>{age(row.ageMs)}</td><td>{row.retryCount}</td><td>{timestamp(row.lastAttemptAt)}</td><td>{row.browserReceivedAt ? timestamp(row.browserReceivedAt) : "No acknowledgement timestamp"}</td><td>{row.popupRenderedAt ? timestamp(row.popupRenderedAt) : "No acknowledgement timestamp"}</td><td>{row.lastErrorCode ?? "—"}{row.lastErrorMessage && row.lastErrorCode && <small>{row.lastErrorMessage}</small>}</td><td><button className="delivery-diagnostic-inspect" type="button" onClick={() => setSelectedRecord({ opportunityId: row.opportunityId, customerId: row.customerId })} aria-label={`Inspect opportunity ${row.opportunityId} for customer ${row.customerId}`}>Inspect</button></td><td><button className="delivery-diagnostic-inspect" type="button" onClick={() => openCustomer(row.customerId, row.customerName)}>History</button></td>
          </tr>)}</tbody></table></div> : <div className="admin-ops-table-wrap"><table className="admin-ops-table"><thead><tr><th>Finding</th><th>Opportunity / customer</th><th>Package</th><th>Current state</th><th>Observed at</th><th>Retries</th><th>Last result</th><th>Error code</th><th>Safe diagnostic</th><th>Retry eligibility</th><th>Inspect</th></tr></thead><tbody>
          {!rows.length ? <tr><td className="admin-ops-table-empty" colSpan={11}>No persisted failures, expiry conditions, or overdue leases/retries match these filters.</td></tr> : rows.map(row => <tr key={`${row.customerId}-${row.opportunityId}`}>
            <td><Status value={row.failure?.category ?? "unknown failure"}/></td><td><strong>#{row.opportunityId}</strong><small>{row.customerName} · customer {row.customerId}</small></td><td>{row.packageName}</td><td><Status value={row.deliveryStatus}/></td><td>{timestamp(row.failureAt)}</td><td>{row.retryCount}</td><td>{row.lastRetryResult}</td><td>{row.lastFailureErrorCode ?? row.lastErrorCode ?? "Unavailable"}</td><td>{row.failure?.message ?? row.lastErrorMessage ?? "Historical reason unavailable."}</td><td>{row.retryPermitted ? "Eligible" : "Not permitted"}</td><td><button className="delivery-diagnostic-inspect" type="button" onClick={() => setSelectedRecord({ opportunityId: row.opportunityId, customerId: row.customerId })}>Inspect</button></td>
          </tr>)}</tbody></table></div>}
        <div className="delivery-diagnostic-pagination"><span>Showing {rows.length} of {total.toLocaleString()}</span><div><button className="admin-ops-button" type="button" disabled={page <= 1 || listQuery.isFetching} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft size={14}/>Previous</button><button className="admin-ops-button" type="button" disabled={page >= pages || listQuery.isFetching} onClick={() => setPage(value => Math.min(pages, value + 1))}>Next<ChevronRight size={14}/></button></div></div>
      </>}
      {selectedRecord !== null && <div className="delivery-diagnostic-detail" aria-live="polite">
        <div className="delivery-diagnostic-detail-head"><div><span className="admin-ops-kicker">Opportunity #{selectedRecord.opportunityId} · customer {selectedRecord.customerId}</span><h3>Evidence timeline</h3></div><button className="delivery-diagnostic-close" type="button" aria-label="Close opportunity details" onClick={() => setSelectedRecord(null)}><X size={16}/></button></div>
        {detailsQuery.isError ? <div className="admin-ops-empty error">Details could not be loaded.</div> : detailsQuery.isLoading ? <Empty>Loading persisted timeline…</Empty> : !detail?.record ? <Empty>Opportunity not found in persisted assignment or popup history.</Empty> : <>
          <div className="delivery-diagnostic-detail-summary"><span>{detail.record.customerName} · customer {detail.record.customerId}</span><span>{detail.record.packageName}</span><span>{detail.record.companyName}</span><span>Generated: {timestamp(detail.record.generatedAt)}</span><span>Assignment persisted: {timestamp(detail.record.assignmentPersistedAt)}</span><span>Assigned: {timestamp(detail.record.assignedAt)}</span><span>Expiry deadline: {timestamp(detail.record.assignmentExpiresAt ?? detail.record.offerClosesAt)}</span><Status value={detail.record.deliveryStatus}/></div>
          {(detail.record.lastErrorCode || detail.record.lastFailureErrorCode) && <div className="admin-ops-note"><AlertTriangle size={15}/><span><strong>{detail.record.lastFailureErrorCode ?? detail.record.lastErrorCode}</strong> · {detail.record.lastErrorMessage ?? "A safe diagnostic code is persisted; historical detail unavailable."}</span></div>}
          <ol className="delivery-diagnostic-timeline">{(detail.timeline ?? []).map((item: any, index: number) => <li key={`${item.label}-${index}`} className={item.occurredAt ? "confirmed" : "unavailable"}><i/><div><strong>{item.label}</strong><time>{timestamp(item.occurredAt)}</time><small>{item.evidence}</small>{item.errorCode && <small>{item.errorCode}{item.status ? ` · ${item.status}` : ""}</small>}</div></li>)}</ol>
          <div className="delivery-diagnostic-latency"><strong>Confirmed stage durations</strong>{Object.entries(detail.durationsMs ?? {}).map(([key, value]) => <span key={key}>{key.replace(/([A-Z])/g, " $1")}: {duration(value as number | null)}</span>)}</div>
          <div className="admin-ops-table-wrap"><table className="admin-ops-table"><thead><tr><th>Attempt history</th><th>Attempt</th><th>Timestamp</th><th>State</th><th>Safe code</th><th>Diagnostic</th></tr></thead><tbody>
            {(detail.attempts ?? []).length ? detail.attempts.map((item: any, index: number) => <tr key={`${item.eventType}-${index}`}><td>{item.eventType.replace(/_/g, " ")}</td><td>{item.attemptNumber ?? "—"}</td><td>{timestamp(item.occurredAt)}</td><td>{item.status ?? "—"}</td><td>{item.errorCode ?? "—"}</td><td>{item.message ?? "No failure detail recorded."}</td></tr>) : <tr><td colSpan={6} className="admin-ops-table-empty">No attempt-level history was recorded. Historical attempts before diagnostics migration may be unavailable.</td></tr>}
          </tbody></table></div>
        </>}
      </div>}
      {activeTab !== "failures" && <div className="admin-ops-note"><ShieldCheck size={15}/><span>“Received” and “rendered” require persisted customer-browser acknowledgements. Assignment persistence or queue creation alone is not proof of delivery or display.</span></div>}
    </>}

    {activeTab === "customers" && <div className="delivery-diagnostic-customer">
      <label className="delivery-diagnostic-customer-search">Search customer by name prefix or exact ID<input value={customerTerm} onChange={e => { setCustomerTerm(e.target.value); setSelectedCustomerId(null); }} maxLength={100} placeholder="Type at least two characters"/><Search size={15}/></label>
      {customerSearchQuery.isError && <div className="admin-ops-empty error">Customer search is unavailable.</div>}
      {customerTerm.trim().length >= 2 && !selectedCustomerId && <div className="delivery-diagnostic-customer-results">{customerSearchQuery.isLoading ? <Empty>Searching customers…</Empty> : (customerSearchQuery.data as any)?.customers?.length ? (customerSearchQuery.data as any).customers.map((item: any) => <button key={item.id} type="button" onClick={() => setSelectedCustomerId(item.id)}><strong>{item.name}</strong><span>Customer {item.id} · {item.packageName}</span></button>) : <Empty>No customers matched that name prefix or ID.</Empty>}</div>}
      {selectedCustomerId !== null && <>
        {customerQuery.isLoading ? <Empty>Loading customer opportunity diagnostics…</Empty> : customerQuery.isError ? <div className="admin-ops-empty error">Customer delivery diagnostics are unavailable.</div> : !customer?.customer ? <Empty>Customer record not found.</Empty> : <>
          <div className="delivery-diagnostic-customer-head"><div><span className="admin-ops-kicker">Customer {customer.customer.id}</span><h3>{customer.customer.name}</h3><p>Current account package: {customer.customer.packageName}</p></div><button className="admin-ops-button" type="button" onClick={() => setSelectedCustomerId(null)}><X size={14}/>Close</button></div>
          <div className="delivery-diagnostic-metrics">{[["Generated", customer.aggregates.generated], ["Pending", customer.aggregates.pending], ["Browser received", customer.aggregates.received], ["Rendered", customer.aggregates.rendered], ["Failed", customer.aggregates.failed], ["Expired", customer.aggregates.expired]].map(([label, value]: any) => <SmallMetric key={label} label={label} value={Number(value).toLocaleString()}/>)}</div>
          <div className="delivery-diagnostic-latency"><span>Last confirmed render: <strong>{timestamp(customer.aggregates.lastRenderedAt)}</strong></span><span>Most recent failure/expiry: <strong>{timestamp(customer.aggregates.mostRecentFailureAt)}</strong></span><span>Failure code: <strong>{customer.aggregates.mostRecentFailureCode ?? "Unavailable"}</strong></span><span>Average generation → render: <strong>{duration(customer.aggregates.averageDeliveryLatencyMs)}</strong> · {customer.aggregates.averageDeliveryLatencySamples} samples</span></div>
          <div className="delivery-diagnostic-detail-head"><div><h3>Recent opportunities</h3><p>Click inspect to open the persisted event timeline.</p></div></div>
          <div className="admin-ops-table-wrap"><table className="admin-ops-table"><thead><tr><th>Opportunity</th><th>Company</th><th>Current state</th><th>Generated</th><th>Browser receipt</th><th>Rendered</th><th>Retries</th><th>Inspect</th></tr></thead><tbody>{customer.recent?.length ? customer.recent.map((row: any) => <tr key={`${row.customerId}-${row.opportunityId}`}><td>#{row.opportunityId}</td><td>{row.companyName}</td><td><Status value={row.deliveryStatus}/></td><td>{timestamp(row.generatedAt)}</td><td>{timestamp(row.browserReceivedAt)}</td><td>{timestamp(row.popupRenderedAt)}</td><td>{row.retryCount}</td><td><button className="delivery-diagnostic-inspect" type="button" onClick={() => openDetails(row.opportunityId, row.customerId)}>Inspect</button></td></tr>) : <tr><td colSpan={8} className="admin-ops-table-empty">No recent persisted opportunities.</td></tr>}</tbody></table></div>
        </>}
      </>}
      <div className="admin-ops-note"><UserRound size={15}/><span>Customer search is prefix-based and paginated to the first 20 recent opportunities. Counts distinguish persisted generation assignments from delivery acknowledgement states.</span></div>
    </div>}

    {activeTab === "queue" && <>
      {queueQuery.isError ? <div className="admin-ops-empty error">Queue diagnostics are unavailable; confirm migration 0110 and database connectivity.</div> : queueQuery.isLoading ? <Empty>Loading queue and latency metrics…</Empty> : !(queue as any)?.sourceAvailable ? <Empty>Queue diagnostics source unavailable.</Empty> : <>
        <div className="delivery-diagnostic-metrics">
          <SmallMetric label="Queued" value={queue.counts.queued} detail={`Oldest: ${timestamp(queue.counts.oldestQueuedAt)}`}/><SmallMetric label="Processing" value={queue.counts.processing} detail={`Oldest: ${timestamp(queue.counts.oldestProcessingAt)}`}/><SmallMetric label="Waiting for retry" value={queue.counts.waitingRetry}/><SmallMetric label="Overdue delivery attempts" value={queue.counts.overdueAttempts} detail={`${queue.counts.overdueRetries} overdue retries + ${queue.counts.expiredLeases} expired leases`}/><SmallMetric label="Expired processing leases" value={queue.counts.expiredLeases}/><SmallMetric label="Repeated lease expiries" value={queue.counts.repeatedLeaseExpiries} detail="At least two persisted lease-expiry events"/><SmallMetric label="Near offer deadline" value={queue.counts.approachingExpiration} detail={`Within the existing ${queue.counts.leaseDurationSeconds}s lease horizon`}/><SmallMetric label="Retry/lease due after close" value={queue.counts.retryOrLeaseBeyondDeadline}/><SmallMetric label="Pending past offer deadline" value={queue.counts.pendingPastDeadline}/>
        </div>
        <div className="delivery-diagnostic-detail-head"><div><h3>Observed lifecycle latency</h3><p>Means are based only on valid persisted start/end timestamp pairs; sample counts are shown.</p></div></div>
        <div className="admin-ops-table-wrap"><table className="admin-ops-table"><thead><tr><th>Stage pair</th><th>Average</th><th>Valid samples</th></tr></thead><tbody>{Object.entries(queue.latency ?? {}).map(([key, item]: any) => <tr key={key}><td>{latencyLabels[key] ?? key}</td><td>{duration(item.averageMs)}</td><td>{item.samples}</td></tr>)}</tbody></table></div>
        <div className="admin-ops-note"><Clock3 size={15}/><span>Delivery dispatch is customer-request scoped, not a dedicated dispatcher. The system has a 60-second processing lease and retry due-times, but no configured queue-wait SLA or persisted historical backlog snapshots; queued-age breach and backlog-growth trend are therefore unavailable, not assumed zero.</span></div>
      </>}
    </>}

    {activeTab === "worker" && <>
      {workerQuery.isError ? <div className="admin-ops-empty error">Worker health is unavailable.</div> : workerQuery.isLoading ? <Empty>Loading worker health…</Empty> : !worker ? <Empty>No trading-opportunity worker record is available.</Empty> : <>
        <div className="delivery-diagnostic-worker-card"><div><span className="admin-ops-kicker">Trading opportunities and lifecycle</span><h3>{worker.displayName}</h3><p>{worker.description}</p></div><Status value={worker.status}/></div>
        <div className="delivery-diagnostic-metrics"><SmallMetric label="Heartbeat" value={timestamp(worker.heartbeatAt)} detail={`Expected every ${Math.round(worker.expectedIntervalMs / 1000)}s; stale after ${Math.round(worker.staleAfterMs / 1000)}s`}/><SmallMetric label="Last successful cycle" value={timestamp(worker.lastSuccessAt)}/><SmallMetric label="Last failed cycle" value={timestamp(worker.lastFailureAt)}/><SmallMetric label="Consecutive failures" value={worker.consecutiveFailures}/><SmallMetric label="Last duration" value={duration(worker.lastDurationMs)}/><SmallMetric label="Safe error code" value={worker.lastErrorCode ?? "None recorded"}/></div>
        <div className="admin-ops-note"><ShieldCheck size={15}/><span>Dispatch mode: user-scoped customer requests. A dedicated dispatcher heartbeat is not available. Worker Health stores current status plus latest success/failure timestamps, not a durable recovery-event stream; earlier worker transition history is unavailable. Queue state is shown separately in Queue &amp; latency.</span></div>
      </>}
    </>}
  </section>;
}
