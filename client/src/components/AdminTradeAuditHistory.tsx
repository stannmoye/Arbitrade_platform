import { useState, type FormEvent } from "react";
import { FileText, RefreshCw, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";

type AuditScope = "global" | "package" | "record";

type AuditFilters = {
  actorUserId?: number;
  fromDate?: string;
  toDate?: string;
  key?: string;
  entityType?: string;
  entityId?: string;
  package?: string;
  scope?: AuditScope;
  pageSize: number;
};

type FilterDraft = {
  actorUserId: string;
  fromDate: string;
  toDate: string;
  key: string;
  entityType: string;
  entityId: string;
  package: string;
  scope: AuditScope | "";
  pageSize: number;
};

const emptyDraft: FilterDraft = { actorUserId: "", fromDate: "", toDate: "", key: "", entityType: "", entityId: "", package: "", scope: "", pageSize: 50 };
const unavailable = "Unavailable — this audit event did not persist this field.";
function formatValue(value: unknown) {
  if (value === null || value === undefined) return "Unavailable";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export default function AdminTradeAuditHistory() {
  const [draft, setDraft] = useState<FilterDraft>(emptyDraft);
  const [filters, setFilters] = useState<AuditFilters>({ pageSize: 50 });
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [formError, setFormError] = useState("");
  const cursor = cursors[cursors.length - 1];
  const queryInput = { ...filters, cursor };
  const query = trpc.adminOperations.tradeAuditHistory.useQuery(queryInput, { refetchOnWindowFocus: false });

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const actorUserId = draft.actorUserId.trim() ? Number(draft.actorUserId) : undefined;
    if (actorUserId !== undefined && (!Number.isSafeInteger(actorUserId) || actorUserId < 1 || actorUserId > 2_147_483_647)) {
      setFormError("Actor ID must be a positive whole number within the supported 32-bit user-ID range.");
      return;
    }
    if (draft.fromDate && draft.toDate && draft.fromDate > draft.toDate) {
      setFormError("Start date must not follow end date.");
      return;
    }
    setFormError("");
    setFilters({
      actorUserId,
      fromDate: draft.fromDate || undefined,
      toDate: draft.toDate || undefined,
      key: draft.key.trim() || undefined,
      entityType: draft.entityType.trim() || undefined,
      entityId: draft.entityId.trim() || undefined,
      package: draft.package.trim() || undefined,
      scope: draft.scope || undefined,
      pageSize: draft.pageSize,
    });
    setCursors([undefined]);
  };

  const resetFilters = () => {
    setDraft(emptyDraft);
    setFilters({ pageSize: 50 });
    setCursors([undefined]);
    setFormError("");
  };

  const rows = query.data?.events ?? [];
  const showValue = (label: string, value: unknown, persisted: boolean) => (
    <div className="trade-audit-field" key={label}>
      <strong>{label}</strong>
      {persisted ? <pre>{formatValue(value)}</pre> : <span>{unavailable}</span>}
    </div>
  );

  return <div className="arb-page portal-page trade-audit-history">
    <header className="portal-page-top">
      <div><div className="eyebrow">Trade Settings · immutable history</div><h1>Audit &amp; Policy History</h1>
        <p>Read-only history of persisted Trade Settings administrator events. This view does not edit policies or expose unrelated customer activity.</p></div>
      <button type="button" className="portal-action" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={15}/> Refresh history</button>
    </header>
    <form className="settings-card trade-audit-filters" onSubmit={applyFilters}>
      <h2>Filter recorded events</h2>
      <div className="trade-audit-filter-grid">
        <label>Actor user ID<input type="number" min={1} max={2_147_483_647} step={1} inputMode="numeric" value={draft.actorUserId} onChange={event => setDraft({ ...draft, actorUserId: event.target.value })} placeholder="Administrator ID" /></label>
        <label>From date (UTC)<input type="date" value={draft.fromDate} onChange={event => setDraft({ ...draft, fromDate: event.target.value })} /></label>
        <label>Through date (UTC)<input type="date" value={draft.toDate} onChange={event => setDraft({ ...draft, toDate: event.target.value })} /></label>
        <label>Changed key<input maxLength={160} value={draft.key} onChange={event => setDraft({ ...draft, key: event.target.value })} placeholder="Key or saved field name" /></label>
        <label>Entity type<input maxLength={80} value={draft.entityType} onChange={event => setDraft({ ...draft, entityType: event.target.value })} /></label>
        <label>Entity ID<input maxLength={128} value={draft.entityId} onChange={event => setDraft({ ...draft, entityId: event.target.value })} /></label>
        <label>Package / tier<input maxLength={100} value={draft.package} onChange={event => setDraft({ ...draft, package: event.target.value })} /></label>
        <label>Scope (derived from persisted event)<select value={draft.scope} onChange={event => setDraft({ ...draft, scope: event.target.value as FilterDraft["scope"] })}><option value="">All scopes</option><option value="global">Global</option><option value="package">Package / tier</option><option value="record">Operational record</option></select></label>
        <label>Rows per page<select value={draft.pageSize} onChange={event => setDraft({ ...draft, pageSize: Number(event.target.value) })}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label>
      </div>
      <small>Scope is derived from the persisted action and entity type. Source and effective time are shown only when the audit event recorded them.</small>
      {formError && <div className="test-notice error" role="alert">{formError}</div>}
      {query.error && <div className="test-notice error" role="alert">History could not be loaded: {query.error.message}</div>}
      <div className="trade-audit-actions"><button type="submit" className="primary-button" disabled={query.isFetching}>Apply filters</button><button type="button" className="secondary-button" onClick={resetFilters}>Clear filters</button></div>
    </form>
    <section className="settings-card" aria-labelledby="trade-audit-results-heading">
      <div className="portal-section-heading"><div><div className="eyebrow">Persisted administrator events</div><h2 id="trade-audit-results-heading">History results</h2></div><span>{rows.length} event{rows.length === 1 ? "" : "s"} on this page</span></div>
      {query.isLoading ? <div className="empty-state" role="status">Loading persisted Trade Settings audit events…</div> : null}
      {query.data?.scanCapped && <div className="empty-state" role="status">This request reached the 1,000-candidate safety limit and more candidate events remain. Use {rows.length === 0 ? "Continue search" : "Next page"} to keep searching.</div>}
      {!query.isLoading && rows.length === 0 && !query.data?.scanCapped && <div className="empty-state"><FileText size={20}/><strong>No matching Trade Settings audit events.</strong><span>Only events in the supported Trade Settings audit scope are included.</span></div>}
      <div className="admin-audit-list">
        {rows.map(event => <article className="admin-audit-row trade-audit-row" key={event.id}>
          <div className="audit-time">{new Date(event.createdAt).toISOString()} UTC</div>
          <div className="audit-event"><ShieldCheck size={14}/><strong>{event.action}</strong><span>Actor {event.actorUserId ?? "system"} · {event.entityType} {event.entityId}</span>
            {event.reason && <p><b>Reason:</b> {event.reason}</p>}
            <div className="trade-audit-metadata">
              <div><strong>Reference</strong><span>{event.reference ?? unavailable}</span></div>
              <div><strong>Changed key</strong><span>{event.changedKey ?? unavailable}</span></div>
              <div><strong>Package / tier</strong><span>{event.packageName ?? unavailable}</span></div>
              <div><strong>Scope</strong><span>{event.scope ? `${event.scope} · derived from persisted action/entity type` : unavailable}</span></div>
              <div><strong>Source</strong><span>{event.source ?? unavailable}</span></div>
              <div><strong>Policy / terms version</strong><span>{event.policyVersion ?? unavailable}</span></div>
              <div><strong>Effective time</strong><span>{event.effectiveAt ?? unavailable}</span></div>
            </div>
            <div className="trade-audit-values">{showValue("Before", event.before, event.beforeAvailable)}{showValue("After", event.after, event.afterAvailable)}</div>
          </div>
          <span className="audit-verified">Persisted</span>
        </article>)}
      </div>
      <nav className="trade-audit-pagination" aria-label="Audit history pagination">
        <button type="button" className="secondary-button" disabled={cursors.length <= 1 || query.isFetching} onClick={() => setCursors(current => current.length > 1 ? current.slice(0, -1) : current)}>Previous page</button>
        <button type="button" className="secondary-button" disabled={!query.data?.nextCursor || query.isFetching} onClick={() => { if (query.data?.nextCursor) setCursors(current => [...current, query.data!.nextCursor!]); }}>{query.data?.scanCapped && rows.length === 0 ? "Continue search" : "Next page"}</button>
      </nav>
    </section>
  </div>;
}
