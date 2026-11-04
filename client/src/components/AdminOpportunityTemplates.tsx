import { useMemo, useState } from "react";
import { Building2, Check, Pause, Play, RefreshCw, Save, ShieldCheck, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";

type TemplateForm = {
  templateName: string;
  companyReferenceId: string;
  symbol: string;
  venueFrom: string;
  venueTo: string;
  currency: "USD" | "EUR" | "GBP" | "BTC" | "ETH";
  minimumMinor: number;
  sourceReference: string;
  reviewNotes: string;
};
const emptyForm: TemplateForm = {
  templateName: "", companyReferenceId: "", symbol: "", venueFrom: "", venueTo: "",
  currency: "USD", minimumMinor: 0, sourceReference: "", reviewNotes: "",
};

export default function AdminOpportunityTemplates() {
  const utils = trpc.useUtils();
  const templates = trpc.adminOperations.opportunityGenerationTemplates.useQuery(undefined, { refetchInterval: 15_000 });
  const monitor = trpc.adminOperations.opportunityGenerationMonitor.useQuery(undefined, { refetchInterval: 15_000 });
  const control = trpc.adminOperations.opportunityGenerationControl.useQuery(undefined, { refetchInterval: 15_000 });
  const companyRecords = trpc.companyCatalogueReference.search.useQuery({ offset: 0, limit: 1811 });
  const companySummary = trpc.companyCatalogueReference.summary.useQuery(undefined, { refetchInterval: 60_000 });
  const companyState = trpc.companyCatalogueReference.adminState.useQuery();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [editing, setEditing] = useState<{ id: number; version: number } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const [reason, setReason] = useState("Admin-reviewed opportunity generation template");
  const [controlReason, setControlReason] = useState("");

  const eligibleCompanies = useMemo(() => (companyRecords.data ?? []).filter((company) =>
    companyState.data?.statusById?.[company.id]?.status === "verified"), [companyRecords.data, companyState.data]);
  const companyStatusCounts = useMemo(() => {
    const statuses = Object.values(companyState.data?.statusById ?? {}).map((record) => record.status);
    return { verified: statuses.filter((status) => status === "verified").length, disabled: statuses.filter((status) => status === "disabled").length, archived: statuses.filter((status) => status === "archived").length };
  }, [companyState.data]);
  const matchingCompanies = useMemo(() => {
    const query = search.trim().toLowerCase();
    return eligibleCompanies.filter((company) => !query || `${company.id} ${company.name} ${company.countryName} ${company.ticker ?? ""} ${company.exchangeCode ?? ""}`.toLowerCase().includes(query));
  }, [eligibleCompanies, search]);

  const invalidate = async () => {
    await Promise.all([
      utils.adminOperations.opportunityGenerationTemplates.invalidate(),
      utils.adminOperations.opportunityGenerationMonitor.invalidate(),
      utils.adminOperations.opportunityGenerationControl.invalidate(),
    ]);
  };
  const saveTemplate = trpc.adminOperations.saveOpportunityGenerationTemplate.useMutation({
    onSuccess: async (saved) => {
      setFeedback(`Template #${saved.id} saved as ${saved.status}; version ${saved.version} was persisted.`);
      setFeedbackIsError(false);
      setEditing({ id: saved.id, version: saved.version });
      await invalidate();
    },
    onError: (error) => { setFeedback(error.message); setFeedbackIsError(true); },
  });
  const changeControl = trpc.adminOperations.updateOpportunityGenerationControl.useMutation({
    onSuccess: async (saved) => { setControlReason(""); setFeedback(`Automatic generation is ${saved.enabled ? "ON" : "PAUSED"} at control version ${saved.version}.`); setFeedbackIsError(false); await invalidate(); },
    onError: (error) => { setFeedback(error.message); setFeedbackIsError(true); },
  });

  const put = <K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const clearForm = () => { setForm(emptyForm); setEditing(null); };
  const submitTemplate = (action: "draft" | "approve") => {
    if (reason.trim().length < 5) { setFeedback("An audit reason of at least 5 characters is required."); setFeedbackIsError(true); return; }
    setFeedback("");
    saveTemplate.mutate({ ...(editing ? { id: editing.id, expectedVersion: editing.version } : {}), action, reason: reason.trim(), template: form });
  };
  const actionOnTemplate = (row: NonNullable<typeof templates.data>[number], action: "approve" | "disable" | "archive") => {
    const enteredReason = window.prompt(`Enter a case-specific audit reason (5–500 characters) to ${action} template #${row.id}:`);
    if (enteredReason === null) return;
    if (enteredReason.trim().length < 5 || enteredReason.trim().length > 500) { setFeedback("A case-specific audit reason of 5–500 characters is required."); setFeedbackIsError(true); return; }
    setFeedback("");
    saveTemplate.mutate({ id: row.id, expectedVersion: row.version, action, reason: enteredReason.trim(), template: {
      templateName: row.templateName, companyReferenceId: row.companyReferenceId, symbol: row.symbol, venueFrom: row.venueFrom,
      venueTo: row.venueTo, currency: row.currency as TemplateForm["currency"], minimumMinor: Number(row.minimumMinor),
      sourceReference: row.sourceReference, reviewNotes: row.reviewNotes,
    } });
  };
  const editTemplate = (row: NonNullable<typeof templates.data>[number]) => {
    setEditing({ id: row.id, version: row.version });
    setForm({ templateName: row.templateName, companyReferenceId: row.companyReferenceId, symbol: row.symbol,
      venueFrom: row.venueFrom, venueTo: row.venueTo, currency: row.currency as TemplateForm["currency"],
      minimumMinor: Number(row.minimumMinor), sourceReference: row.sourceReference, reviewNotes: row.reviewNotes });
    setFeedback("");
  };
  const toggleGeneration = () => {
    const next = !(control.data?.available && control.data.enabled);
    const promptValue = window.prompt(`Enter the reason to ${next ? "resume" : "pause"} automatic informational opportunity generation (5–500 characters):`);
    if (promptValue === null) return;
    const value = promptValue.trim();
    if (value.length < 5 || value.length > 500) { setFeedback("A generation-control reason of 5–500 characters is required."); setFeedbackIsError(true); return; }
    changeControl.mutate({ enabled: next, reason: value, expectedVersion: control.data?.version ?? 0 });
  };
  const statusLabel = control.data?.available ? (control.data.enabled ? "Running · generation enabled" : "Paused · generation disabled") : "Unavailable · fail-closed";

  return <section className="settings-card automatic-opportunity-templates" aria-labelledby="automatic-opportunity-heading">
    <div className="panel-heading">
      <div><div className="eyebrow">Automatic opportunity generation</div><h2 id="automatic-opportunity-heading">Automatic company generation & customer assignments</h2></div>
      <button className="secondary-button" type="button" onClick={() => { void templates.refetch(); void monitor.refetch(); void control.refetch(); void companyRecords.refetch(); void companySummary.refetch(); void companyState.refetch(); }} disabled={templates.isFetching || monitor.isFetching || control.isFetching || companySummary.isFetching}>
        <RefreshCw size={14}/> Refresh
      </button>
    </div>
    <p>The worker reads current server-assigned package entitlements and generates a separate persisted opportunity for each due customer directly from the existing 1,811-company catalogue. Each opportunity snapshots the customer's package-specific configured payout rate and duration. Approved templates are optional display-term overrides; no template is required and no manual opportunity publication or CSV import is part of this workflow.</p>
    <div className="test-notice" role="note"><ShieldCheck size={14}/><span>Company identity uses the existing brand name and logo for a currently admin-verified, enabled, non-archived Logo ID. Brand-only records do not need a ticker, exchange, or live market feed. Optional template details are administrator-provided and are not independently verified. Configured payout is not evidence of market-earned profit, execution, or settlement; financial execution remains hard-disabled.</span></div>
    <div className="opportunity-admin-grid">
      <div className="settings-card">
        <div className="eyebrow">Generation control</div><h3>{statusLabel}</h3>
        <p>{control.data?.available ? `Policy version ${control.data.version}${control.data.updatedAt ? ` · Updated ${new Date(control.data.updatedAt).toLocaleString()}` : ""}` : "The saved control row is missing or malformed. Generation is disabled until an administrator repairs it."}</p>
        <button className={control.data?.available && control.data.enabled ? "secondary-button" : "primary-button"} type="button" onClick={toggleGeneration} disabled={changeControl.isPending || !control.data}>
          {control.data?.available && control.data.enabled ? <><Pause size={14}/> Pause automatic generation</> : <><Play size={14}/> Enable automatic generation</>}
        </button>
        <small>Default is ON after migration 0103. Saving OFF is preserved across restarts and stops new customer assignments; already-generated offers remain subject to their saved expiry and the independent delivery gates. New generation requires an active qualifying package, valid saved package bounds, enabled delivery, quota, schedule and an eligible company; no template is required.</small>
      </div>
      <div className="settings-card">
        <div className="eyebrow">Worker results · UTC day</div><h3>Generated opportunity batches</h3>
        <div className="admin-kpi-grid">
          <div><span>Generated</span><strong>{monitor.data?.today.generated ?? "—"}</strong><b>Customer-specific opportunities</b></div>
          <div><span>Delivered</span><strong>{monitor.data?.today.delivered ?? "—"}</strong><b>Persisted popup assignments</b></div>
          <div><span>Failures</span><strong>{monitor.data?.today.failed ?? "—"}</strong><b>Worker batches + assignments</b></div>
          <div><span>Optional templates</span><strong>{templates.data?.filter((row) => row.status === "approved").length ?? "—"}</strong><b>Reusable configured terms</b></div>
        </div>
        <small>{monitor.data?.available ? `${monitor.data.batches.filter((row) => row.status === "running").length} running batch(es) · most recent ${monitor.data.batches[0]?.status ?? "not yet recorded"}` : "Generation monitor unavailable; no health state is inferred."}</small>
      </div>
    </div>

    <div className="opportunity-admin-grid">
      <div className="settings-card">
        <div className="eyebrow">Package breakdown · UTC day</div><h3>Saved generation rules and assignment counts</h3>
        <div className="published-offers">
          {monitor.data?.packageBreakdown.map((row) => <article className="trade-history-row" key={row.packageName}>
            <strong>{row.packageName}</strong><b>{row.packageEnabled && row.policyEnabled && row.automaticDelivery ? "Global delivery controls ON" : "Paused / disabled"}</b>
            <span>Daily entitlement {row.dailyOpportunityAllowance} · package delivery cap {row.maxPopupsPerDay}</span>
            <span>Return {row.minimumPayoutRateBps == null || row.maximumPayoutRateBps == null ? "Unavailable" : `${Number(row.minimumPayoutRateBps) / 100}%–${Number(row.maximumPayoutRateBps) / 100}%`}</span>
            <span>Duration {row.minimumTradeDurationSeconds ?? "?"}–{row.maximumTradeDurationSeconds ?? "?"} sec · pending {row.maxPendingDeliveries} · visible {row.maxVisibleOffers}</span>
            <span>Generated {row.generated} · delivered {row.delivered} · assignment failures {row.failed}</span>
          </article>)}
          {monitor.data?.packageBreakdown.length === 0 && <p className="admin-ops-empty" role="status">No persisted package policy rows are available.</p>}
        </div>
      </div>
      <div className="settings-card">
        <div className="eyebrow">Company catalogue · existing source records</div><h3>{companySummary.data?.total ?? "—"} catalogue companies</h3>
        <div className="admin-kpi-grid">
          <div><span>Verified</span><strong>{companyStatusCounts.verified}</strong></div>
          <div><span>Disabled</span><strong>{companyStatusCounts.disabled}</strong></div>
          <div><span>Archived</span><strong>{companyStatusCounts.archived}</strong></div>
          <div><span>Eligible pool</span><strong>{eligibleCompanies.length}</strong></div>
        </div>
        <small>Only verified, enabled, non-archived companies are eligible. Package country filters apply at generation. Company names and logos provide brand identity only; no ticker, exchange listing, live market price, execution, or realized profit is implied.</small>
      </div>
    </div>

    {monitor.data?.batches.filter((batch) => batch.failures > 0).slice(0, 5).map((batch) => <div className="test-notice" role="status" key={batch.id}>
      <strong>Batch {batch.id} · {batch.failures} failure(s): </strong><code>{batch.failureSummary ?? "Failure summary unavailable"}</code>
    </div>)}

    <div className="settings-card">
      <div className="eyebrow">Optional company-specific display overrides</div><h3>{editing ? `Edit template #${editing.id}` : "Add an optional template override"}</h3>
      <p>Templates do not contain a payout rate or duration. Those are selected from the current saved policy of the package assigned to the customer. The generator works without a template. When an approved override exists for the selected company, its display metadata may be used; the package policy remains authoritative for capital, configured return range and duration.</p>
      <p>Source references and review notes are administrator-supplied and are not independently verified. They do not prove a market listing, execution, realized profit, or a customer entitlement to funds.</p>
      <div className="company-catalogue-filters">
        <label>Search eligible company catalogue<input type="search" value={search} maxLength={100} placeholder="Company, country or Logo ID…" onChange={(event) => setSearch(event.target.value)}/></label>
        <label>Verified company · stable Logo ID<select value={form.companyReferenceId} onChange={(event) => put("companyReferenceId", event.target.value)}>
          <option value="">Select an admin-verified company</option>
          {matchingCompanies.slice(0, 250).map((company) => <option key={company.id} value={company.id}>{company.name} · {company.id} · {company.countryName}</option>)}
        </select></label>
      </div>
      {companyRecords.isLoading || companyState.isLoading ? <p role="status">Loading the existing company catalogue and verification status…</p> : null}
      {companyRecords.isError || companyState.isError ? <p className="admin-ops-empty error" role="alert">The company catalogue could not be verified; template approval is unavailable.</p> : null}
      {!companyRecords.isLoading && !companyState.isLoading && eligibleCompanies.length === 0 && <p className="admin-ops-empty" role="status">No currently verified, enabled company is available. Verify/enable a source-catalogue Logo ID before approving a template.</p>}
      <div className="form-two">
        <label>Template name<input value={form.templateName} maxLength={120} onChange={(event) => put("templateName", event.target.value)}/></label>
        <label>Base symbol / code<input value={form.symbol} maxLength={40} onChange={(event) => put("symbol", event.target.value)}/></label>
      </div>
      <div className="form-two">
        <label>Opening venue<input value={form.venueFrom} maxLength={80} onChange={(event) => put("venueFrom", event.target.value)}/></label>
        <label>Closing venue<input value={form.venueTo} maxLength={80} onChange={(event) => put("venueTo", event.target.value)}/></label>
      </div>
      <div className="form-two">
        <label>Currency<select value={form.currency} onChange={(event) => put("currency", event.target.value as TemplateForm["currency"])}><option>USD</option><option>EUR</option><option>GBP</option><option>BTC</option><option>ETH</option></select></label>
        <label>Minimum native minor units<input type="number" min="1" step="1" value={form.minimumMinor || ""} onChange={(event) => put("minimumMinor", Number(event.target.value))}/></label>
      </div>
      <label>Source reference<input value={form.sourceReference} maxLength={160} onChange={(event) => put("sourceReference", event.target.value)}/></label>
      <label>Administrator review notes<textarea value={form.reviewNotes} maxLength={2000} rows={3} onChange={(event) => put("reviewNotes", event.target.value)}/></label>
      <label>Audit reason<input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)}/></label>
      <div className="company-catalogue-bulk-actions">
        <button className="secondary-button" type="button" onClick={() => submitTemplate("draft")} disabled={saveTemplate.isPending || !form.companyReferenceId || !form.templateName.trim() || !form.symbol.trim() || !form.venueFrom.trim() || !form.venueTo.trim() || !Number.isSafeInteger(form.minimumMinor) || form.minimumMinor <= 0 || !form.sourceReference.trim() || !form.reviewNotes.trim()}><Save size={14}/> {saveTemplate.isPending ? "Saving…" : editing ? "Save as draft" : "Save draft"}</button>
        <button className="primary-button" type="button" onClick={() => submitTemplate("approve")} disabled={saveTemplate.isPending || !eligibleCompanies.some((company) => company.id === form.companyReferenceId) || !form.templateName.trim() || !form.symbol.trim() || !form.venueFrom.trim() || !form.venueTo.trim() || !Number.isSafeInteger(form.minimumMinor) || form.minimumMinor <= 0 || !form.sourceReference.trim() || !form.reviewNotes.trim()}><Check size={14}/> Approve template</button>
        {editing && <button className="secondary-button" type="button" onClick={clearForm}>New template</button>}
      </div>
      {feedback && <div className="test-notice" role={feedbackIsError ? "alert" : "status"}>{feedback}</div>}
    </div>

    <div className="settings-card">
      <div className="panel-heading"><div><div className="eyebrow">Template registry</div><h3>{templates.data?.length ?? 0} template(s)</h3></div><span>{eligibleCompanies.length.toLocaleString()} eligible verified companies</span></div>
      {templates.isLoading && <p role="status">Loading saved templates…</p>}
      {templates.isError && <p className="admin-ops-empty error" role="alert">{templates.error.message}</p>}
      {!templates.isLoading && !templates.isError && !templates.data?.length && <p className="admin-ops-empty" role="status">No optional templates exist. Automatic generation continues directly from the approved brand catalogue.</p>}
      <div className="published-offers">
        {templates.data?.map((row) => <article className="trade-history-row" key={row.id}>
          <Building2 size={16}/><strong>#{row.id} · {row.templateName}</strong>
          <span>{row.company?.name ?? row.companyReferenceId} · {row.companyReferenceId}</span>
          <span>{row.symbol} · {row.venueFrom} → {row.venueTo} · {row.currency}</span>
          <span>Min {Number(row.minimumMinor).toLocaleString()} · v{row.version}</span>
          <b className={row.status === "approved" && row.companyCurrentlyApproved ? "open" : "closed"}>{row.status}{row.status === "approved" && !row.companyCurrentlyApproved ? " · company approval removed" : ""}</b>
          <button className="secondary-button" type="button" onClick={() => editTemplate(row)}>Edit</button>
          {row.status !== "approved" && row.companyCurrentlyApproved && <button className="secondary-button" type="button" onClick={() => actionOnTemplate(row, "approve")}>Approve</button>}
          {row.status === "approved" && <button className="secondary-button" type="button" onClick={() => actionOnTemplate(row, "disable")}>Disable</button>}
          {row.status !== "archived" && <button className="secondary-button" type="button" onClick={() => actionOnTemplate(row, "archive")}>Archive</button>}
          <small>Source: {row.sourceReference} · Review: {row.reviewNotes}</small>
        </article>)}
      </div>
    </div>

    <div className="settings-card">
      <div className="panel-heading"><div><div className="eyebrow">Customer-specific generation history</div><h3>Latest persisted assignments</h3></div><Zap size={16}/></div>
      <div className="published-offers">
        {monitor.data?.recentAssignments.slice(0, 25).map((row) => <article className="trade-history-row" key={row.id}>
          <strong>Customer #{row.userId}</strong><span>{row.packageName} · package #{row.packageId}</span>
          <span>{row.company?.name ?? row.companyReferenceId}</span><span>{row.configuredProfitRateBps / 100}% configured payout</span>
          <span>{row.configuredDurationSeconds}s · offer #{row.offerId}</span><b>{row.status}</b>
          <small>{new Date(row.generatedAt).toLocaleString()} · batch {row.batchId}</small>
        </article>)}
        {monitor.data?.recentAssignments.length === 0 && <p className="admin-ops-empty">No generated customer assignments have been recorded yet.</p>}
      </div>
    </div>
  </section>;
}
