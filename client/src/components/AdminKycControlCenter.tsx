import { useEffect, useState } from "react";
import {
  Activity, AlertTriangle, BadgeCheck, BarChart3, Check, ChevronLeft, ChevronRight, ClipboardCheck,
  Clock3, DatabaseZap, FileCheck2, FileText, Fingerprint, Gauge, ListChecks, LockKeyhole, MailCheck,
  MapPin, Phone, Radio, RefreshCw, Search, Settings2, ShieldAlert, ShieldCheck, TimerReset, Users,
  type LucideIcon,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import "../admin-kyc.css";

const CORE_STAGES = [
  { code: "EMAIL", title: "Email verification", detail: "Confirm inbox control before collecting further information.", icon: MailCheck },
  { code: "PHONE", title: "Phone verification", detail: "Verify a controlled phone number with an expiring one-time code.", icon: Phone },
  { code: "ADDRESS", title: "Address verification", detail: "Collect residency details only in the secured customer flow; route declarations to review.", icon: MapPin },
  { code: "IDENTITY_DOCUMENT", title: "ID document verification", detail: "Use a secure capture provider and manual review; never treat metadata as proof.", icon: FileCheck2 },
] as const;

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started", IN_PROGRESS: "In progress", PROCESSING: "Processing",
  VERIFIED: "Verified", REVIEW_REQUIRED: "In review", RETRY_AVAILABLE: "Retry required",
  FAILED: "Failed", REJECTED: "Rejected", EXPIRED: "Expired",
};
const statusClass = (value?: string) => (value || "NOT_STARTED").toLowerCase().replaceAll("_", "-");
const statusLabel = (value?: string) => STATUS_LABEL[value || "NOT_STARTED"] || value || "Not started";
const dateLabel = (value?: string | Date | null) => value ? new Date(value).toLocaleString() : "—";

type KycPolicyDraft = {
  emailExpiryMinutes: number;
  phoneExpiryMinutes: number;
  rawRetentionDays: number;
  extractedRetentionDays: number;
  resultRetentionDays: number;
  faceMatchPassThreshold: number;
  faceMatchReviewThreshold: number;
  reviewSlaHours: number;
};
const DEFAULT_POLICY: KycPolicyDraft = {
  emailExpiryMinutes: 15, phoneExpiryMinutes: 10, rawRetentionDays: 1,
  extractedRetentionDays: 365, resultRetentionDays: 2555,
  faceMatchPassThreshold: 0.82, faceMatchReviewThreshold: 0.68, reviewSlaHours: 24,
};

type Region = "overview" | "workflow" | "customers" | "reviews" | "audit";
const REGIONS: Array<{ id: Region; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "workflow", label: "Workflow & settings", icon: Settings2 },
  { id: "customers", label: "Customers", icon: Users },
  { id: "reviews", label: "Review queue", icon: ClipboardCheck },
  { id: "audit", label: "Audit trail", icon: FileText },
];

export function AdminKycControlCenter() {
  const [region, setRegion] = useState<Region>("overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [policy, setPolicy] = useState<KycPolicyDraft>(DEFAULT_POLICY);
  const [policyMessage, setPolicyMessage] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const dashboard = trpc.adminOperations.kycDashboard.useQuery(undefined, { refetchInterval: 15_000 });
  const customers = trpc.adminOperations.kycCustomers.useQuery({
    page, pageSize: 25, search: search.trim() || undefined,
    status: statusFilter === "ALL" ? undefined : statusFilter as "NOT_STARTED" | "IN_PROGRESS" | "VERIFIED" | "REVIEW_REQUIRED" | "RETRY_AVAILABLE" | "REJECTED",
  }, { refetchInterval: 15_000 });
  const queue = trpc.adminOperations.kycQueue.useQuery(undefined, { refetchInterval: 10_000 });
  const settings = trpc.adminOperations.kycSettings.useQuery(undefined, { staleTime: 30_000 });
  const auditChain = trpc.adminOperations.kycVerifyAudit.useQuery(undefined, { refetchInterval: 30_000 });
  const auditEvents = trpc.adminOperations.kycAuditEvents.useQuery(undefined, { refetchInterval: 30_000 });

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);
  useEffect(() => {
    if (settings.data?.settings) setPolicy({ ...DEFAULT_POLICY, ...settings.data.settings });
  }, [settings.data]);

  const savePolicy = trpc.adminOperations.updateKycSettings.useMutation({
    onSuccess: () => { setPolicyMessage("KYC settings saved. Provider-backed identity, SMS, and liveness automation remains unavailable until those services are configured."); void settings.refetch(); void auditChain.refetch(); void auditEvents.refetch(); },
    onError: error => setPolicyMessage(error.message),
  });
  const decide = trpc.adminOperations.kycDecision.useMutation({
    onSuccess: () => {
      void dashboard.refetch(); void queue.refetch(); void customers.refetch();
      void auditChain.refetch(); void auditEvents.refetch();
    },
  });

  const total = Number(dashboard.data?.total || 0);
  const coreMetrics = (dashboard.data?.stageMetrics || []) as Array<{ stageCode: string; started: number | string; verified: number | string; inReview: number | string; inProgress: number | string }>;
  const currentCustomers = customers.data?.items || [];
  const reviewItems = queue.data || [];

  const changePolicy = (key: keyof KycPolicyDraft, value: number) => setPolicy(current => ({ ...current, [key]: value }));
  const submitDecision = (item: any, decision: "APPROVE" | "REJECT") => {
    const key = `${item.profileId}-${item.stageCode}`;
    const reason = (reasons[key] || "").trim();
    if (reason.length < 5) return;
    const action = decision === "APPROVE" ? "approve" : "reject";
    if (!window.confirm(`${action === "approve" ? "Approve" : "Reject"} ${item.stageName} for ${item.email}? This decision will be recorded in the audit trail.`)) return;
    decide.mutate({ profileId: item.profileId, stage: item.stageCode, decision, reason });
  };

  const renderOverview = () => {
    const kpis: Array<{ label: string; value: number; note: string; icon: LucideIcon; tone: string }> = [
      { label: "Customers", value: Number(dashboard.data?.total || 0), note: "Customer accounts in scope", icon: Users, tone: "mint" },
      { label: "Fully verified", value: Number(dashboard.data?.verified || 0), note: "All core stages complete", icon: BadgeCheck, tone: "green" },
      { label: "In review", value: Number(dashboard.data?.manualReview || 0), note: "Stage decisions awaiting staff", icon: ClipboardCheck, tone: "amber" },
      { label: "In progress", value: Number(dashboard.data?.inProgress || 0), note: "Customer journey started", icon: Activity, tone: "blue" },
      { label: "High risk", value: Number(dashboard.data?.highRisk || 0), note: "Requires risk-team attention", icon: ShieldAlert, tone: "red" },
    ];
    const verifiedCustomers = Number(dashboard.data?.verified || 0);
    const reviewCustomers = Number(dashboard.data?.manualReview || 0);
    const completionRate = total ? Math.round(verifiedCustomers / total * 100) : 0;
    const reviewRate = total ? Math.round(reviewCustomers / total * 100) : 0;
    const readyProviders = settings.data ? Object.values(settings.data.providers || {}).filter((provider: any) => provider?.configured).length : 0;
    const providerTotal = settings.data ? Object.keys(settings.data.providers || {}).filter(key => key !== "registry").length : 5;
    const updatedAt = dashboard.dataUpdatedAt ? new Date(dashboard.dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "syncing";
    return <>
      <section className="kyc-admin-command-deck">
        <div className="kyc-admin-posture-card">
          <div className="kyc-admin-posture-head"><div><span className="kyc-admin-kicker">Live operating posture</span><h2>Verification confidence</h2><p>One view across journey completion, human review load, provider readiness, and audit integrity.</p></div><span className="kyc-admin-posture-badge"><Radio size={12} /> {updatedAt}</span></div>
          <div className="kyc-admin-posture-body">
            <div className="kyc-admin-dial" style={{ background: `conic-gradient(#74ddbc ${completionRate * 3.6}deg, #203746 0deg)` }}><div><strong>{completionRate}%</strong><span>core journey<br />verified</span></div></div>
            <div className="kyc-admin-posture-copy"><div className="kyc-admin-posture-score"><strong>{completionRate >= 80 ? "Controlled" : completionRate >= 45 ? "Building" : "Early-stage"}</strong><span>launch posture</span></div><div className="kyc-admin-posture-stats"><div><span>Decision coverage</span><strong>{verifiedCustomers} / {total}</strong></div><div><span>Review load</span><strong>{reviewRate}%</strong></div><div><span>Provider readiness</span><strong>{readyProviders} / {providerTotal}</strong></div></div></div>
          </div>
        </div>
        <div className="kyc-admin-signal-rail">
          <div className="kyc-admin-signal-head"><span className="kyc-admin-kicker">Control signals</span><span className="kyc-admin-live-mark"><i /> live</span></div>
          <div className="kyc-admin-signal-row"><span className="kyc-admin-signal-icon amber"><ClipboardCheck size={15} /></span><div><strong>{reviewCustomers ? `${reviewCustomers} customer${reviewCustomers === 1 ? "" : "s"} need attention` : "No customer reviews waiting"}</strong><small>Human decision queue · SLA {policy.reviewSlaHours}h</small></div><button onClick={() => setRegion("reviews")} aria-label="Open review queue"><ChevronRight size={15} /></button></div>
          <div className="kyc-admin-signal-row"><span className="kyc-admin-signal-icon mint"><ShieldCheck size={15} /></span><div><strong>{auditChain.data?.valid ? "Audit chain verified" : "Audit chain checking"}</strong><small>{Number(auditChain.data?.records || 0).toLocaleString()} signed entries · append-only</small></div><button onClick={() => setRegion("audit")} aria-label="Open audit trail"><ChevronRight size={15} /></button></div>
          <div className="kyc-admin-signal-row"><span className="kyc-admin-signal-icon blue"><DatabaseZap size={15} /></span><div><strong>{readyProviders === providerTotal ? "Provider plane ready" : "Provider setup incomplete"}</strong><small>Secrets stay server-side · {readyProviders}/{providerTotal} configured</small></div><button onClick={() => setRegion("workflow")} aria-label="Open workflow settings"><ChevronRight size={15} /></button></div>
        </div>
      </section>
      <section className="kyc-admin-signal-grid" aria-label="KYC control signals">
        <article><span className="kyc-admin-signal-grid-icon"><Gauge size={16} /></span><div><span>Risk posture</span><strong>{Number(dashboard.data?.highRisk || 0) ? "Escalate" : "Within guardrails"}</strong><small>{Number(dashboard.data?.highRisk || 0)} high-risk profiles in scope</small></div></article>
        <article><span className="kyc-admin-signal-grid-icon"><TimerReset size={16} /></span><div><span>Retention policy</span><strong>{policy.rawRetentionDays}d raw capture</strong><small>{policy.resultRetentionDays}d decision record horizon</small></div></article>
        <article><span className="kyc-admin-signal-grid-icon"><BarChart3 size={16} /></span><div><span>Journey mode</span><strong>Sequential gates</strong><small>Later stages unlock after verified predecessors</small></div></article>
        <article><span className="kyc-admin-signal-grid-icon"><LockKeyhole size={16} /></span><div><span>Data exposure</span><strong>Minimized</strong><small>Queue excludes raw images, document numbers, and full addresses</small></div></article>
      </section>
      <section className="kyc-admin-kpis" aria-label="KYC overview metrics">
        {kpis.map(item => { const Icon = item.icon; return <article className="kyc-admin-kpi" key={item.label}>
          <span className={`kyc-admin-kpi-icon ${item.tone}`}><Icon size={17} /></span>
          <span className="kyc-admin-kpi-label">{item.label}</span><strong>{item.value.toLocaleString()}</strong><small>{item.note}</small>
        </article>; })}
      </section>
      <section className="kyc-admin-panel">
        <div className="kyc-admin-panel-head"><div><span className="kyc-admin-kicker">Required customer journey</span><h2>Stage completion funnel</h2><p>Four core checkpoints, in order. A later step remains locked until its predecessors are verified.</p></div><span className="kyc-admin-count">{total} customers</span></div>
        <div className="kyc-admin-funnel">
          {CORE_STAGES.map((stage, index) => {
            const Icon = stage.icon;
            const metric = coreMetrics.find(item => item.stageCode === stage.code);
            const verified = Number(metric?.verified || 0);
            const inReview = Number(metric?.inReview || 0);
            const percent = total ? Math.min(100, Math.round(verified / total * 100)) : 0;
            return <article className="kyc-admin-funnel-card" key={stage.code}>
              <div className="kyc-admin-funnel-top"><span className="kyc-admin-step-number">0{index + 1}</span><span className="kyc-admin-funnel-icon"><Icon size={17} /></span></div>
              <h3>{stage.title}</h3><div className="kyc-admin-progress"><i style={{ width: `${percent}%` }} /></div>
              <div className="kyc-admin-funnel-foot"><strong>{verified}<small> / {total} verified</small></strong><span>{inReview} in review</span></div>
            </article>;
          })}
        </div>
      </section>
      <div className="kyc-admin-two-col">
        <section className="kyc-admin-panel kyc-admin-callout"><div className="kyc-admin-panel-head"><div><span className="kyc-admin-kicker">Decision discipline</span><h2>Review before approval</h2></div><ShieldCheck size={20} /></div><p>Address and ID decisions require available evidence, a mandatory reason, role-protected review, and an audit entry. No image, document number, or full address is displayed in this queue.</p><button className="kyc-admin-link-button" onClick={() => setRegion("reviews")}>Open review queue <ChevronRight size={14} /></button></section>
        <section className="kyc-admin-panel"><div className="kyc-admin-panel-head"><div><span className="kyc-admin-kicker">System integrity</span><h2>Audit-chain status</h2></div><span className={`kyc-admin-pill ${auditChain.data?.valid ? "verified" : "attention"}`}>{auditChain.isLoading ? "Checking" : auditChain.data?.valid ? "Valid" : "Review"}</span></div><p className="kyc-admin-audit-count">{Number(auditChain.data?.records || 0).toLocaleString()} signed-chain entries checked</p><button className="kyc-admin-link-button" onClick={() => setRegion("audit")}>Inspect audit trail <ChevronRight size={14} /></button></section>
      </div>
    </>;
  };

  const renderWorkflow = () => {
    const settingsData = settings.data;
    const providers = settingsData?.providers;
    const providerCards = [
      ["Email", providers?.email?.label || "Checking", Boolean(providers?.email?.configured)],
      ["Phone / SMS", providers?.phone?.label || "Checking", Boolean(providers?.phone?.configured)],
      ["ID capture", providers?.identityDocument?.label || "Checking", Boolean(providers?.identityDocument?.configured)],
      ["Liveness", providers?.faceLiveness?.label || "Checking", Boolean(providers?.faceLiveness?.configured)],
    ] as Array<[string, string, boolean]>;
    return <>
      <div className="kyc-admin-safety-note"><LockKeyhole size={17} /><div><strong>Admin design phase · customer enforcement is not enabled here</strong><span>The settings below are saved as a draft for the next customer-portal phase. This sandbox does not collect real identity documents, addresses, or biometrics.</span></div></div>
      <section className="kyc-admin-panel">
        <div className="kyc-admin-panel-head"><div><span className="kyc-admin-kicker">Workflow map</span><h2>Required stages & gates</h2><p>Core order requested for the KYC journey. The administrator portal does not change customer screens in this phase.</p></div><span className="kyc-admin-pill required">4 core stages</span></div>
        <div className="kyc-admin-workflow">
          {CORE_STAGES.map((stage, index) => { const Icon = stage.icon; return <article className="kyc-admin-workflow-step" key={stage.code}><div className="kyc-admin-workflow-num">{String(index + 1).padStart(2, "0")}</div><span className="kyc-admin-workflow-icon"><Icon size={18} /></span><div><h3>{stage.title}</h3><p>{stage.detail}</p><span className="kyc-admin-pill required">Required · sequential</span></div>{index < CORE_STAGES.length - 1 && <ChevronRight className="kyc-admin-workflow-arrow" size={17} />}</article>; })}
        </div>
        <div className="kyc-admin-optional-stage"><Fingerprint size={17} /><div><strong>Face & liveness</strong><span>Optional extension; not part of the four required launch stages. Keep disabled until a suitable provider, consent flow, and retention controls are configured.</span></div><span className="kyc-admin-pill neutral">Not enabled</span></div>
      </section>
      <section className="kyc-admin-panel">
        <div className="kyc-admin-panel-head"><div><span className="kyc-admin-kicker">Provider readiness</span><h2>Integration status</h2><p>Provider status is informational; no secrets or credentials are shown in the browser.</p></div><span className="kyc-admin-count">{providerCards.filter(item => item[2]).length} / {providerCards.length} ready</span></div>
        <div className="kyc-admin-provider-grid">{providerCards.map(([name, detail, ready]) => <article className="kyc-admin-provider" key={name}><span className={`kyc-admin-provider-led ${ready ? "ready" : "off"}`} /><div><strong>{name}</strong><small>{detail}</small></div><span className={`kyc-admin-pill ${ready ? "verified" : "attention"}`}>{ready ? "Ready" : "Pending"}</span></article>)}</div>
      </section>
      <section className="kyc-admin-panel">
        <div className="kyc-admin-panel-head"><div><span className="kyc-admin-kicker">Policy parameters</span><h2>KYC settings draft</h2><p>Values are persisted for design and review. They will not affect customer verification until that portal phase is connected.</p></div><button className="kyc-admin-primary" onClick={() => savePolicy.mutate(policy)} disabled={savePolicy.isPending || settings.isLoading}><Check size={14} />{savePolicy.isPending ? "Saving…" : "Save draft settings"}</button></div>
        {policyMessage && <div className="kyc-admin-message" role="status">{policyMessage}</div>}
        {settings.isError ? <div className="kyc-admin-error">KYC settings could not be loaded.</div> : <div className="kyc-admin-settings-grid">
          <label>Email code expiry (minutes)<input type="number" min={5} max={60} value={policy.emailExpiryMinutes} onChange={event => changePolicy("emailExpiryMinutes", Number(event.target.value))} /></label>
          <label>Phone code expiry (minutes)<input type="number" min={1} max={30} value={policy.phoneExpiryMinutes} onChange={event => changePolicy("phoneExpiryMinutes", Number(event.target.value))} /></label>
          <label>Raw capture retention (days)<input type="number" min={1} max={30} value={policy.rawRetentionDays} onChange={event => changePolicy("rawRetentionDays", Number(event.target.value))} /></label>
          <label>Extracted data retention (days)<input type="number" min={30} max={3650} value={policy.extractedRetentionDays} onChange={event => changePolicy("extractedRetentionDays", Number(event.target.value))} /></label>
          <label>Verification result retention (days)<input type="number" min={365} max={3650} value={policy.resultRetentionDays} onChange={event => changePolicy("resultRetentionDays", Number(event.target.value))} /></label>
          <label>Manual review SLA (hours)<input type="number" min={1} max={168} value={policy.reviewSlaHours} onChange={event => changePolicy("reviewSlaHours", Number(event.target.value))} /></label>
          <label>Face-match pass threshold<input type="number" min={0.7} max={0.99} step={0.01} value={policy.faceMatchPassThreshold} onChange={event => changePolicy("faceMatchPassThreshold", Number(event.target.value))} /></label>
          <label>Face-match review threshold<input type="number" min={0.5} max={0.98} step={0.01} value={policy.faceMatchReviewThreshold} onChange={event => changePolicy("faceMatchReviewThreshold", Number(event.target.value))} /></label>
        </div>}
        <p className="kyc-admin-footnote"><ShieldAlert size={13} /> Thresholds are draft-only, not a substitute for provider validation, jurisdiction-specific counsel, or a documented risk policy.</p>
      </section>
    </>;
  };

  const renderCustomers = () => <section className="kyc-admin-panel">
    <div className="kyc-admin-panel-head"><div><span className="kyc-admin-kicker">Customer KYC directory</span><h2>Stage-by-stage completion</h2><p>Only the minimum account and stage-status information is shown here. No document numbers or raw identity data.</p></div><span className="kyc-admin-count">{Number(customers.data?.total || 0).toLocaleString()} customers</span></div>
    <div className="kyc-admin-directory-tools"><label className="kyc-admin-search"><Search size={15} /><input aria-label="Search customers" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or email" /></label><select aria-label="Filter by KYC status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="ALL">All KYC statuses</option><option value="NOT_STARTED">Not started</option><option value="IN_PROGRESS">In progress</option><option value="REVIEW_REQUIRED">In review</option><option value="VERIFIED">Verified</option><option value="RETRY_AVAILABLE">Retry required</option><option value="REJECTED">Rejected</option></select><button className="kyc-admin-icon-button" onClick={() => void customers.refetch()} disabled={customers.isFetching} aria-label="Refresh customers"><RefreshCw size={14} /></button></div>
    {customers.isLoading ? <div className="kyc-admin-empty">Loading customer records…</div> : customers.isError ? <div className="kyc-admin-error">The KYC customer directory could not be loaded.</div> : !currentCustomers.length ? <div className="kyc-admin-empty"><Users size={21} /><strong>No customers match this view</strong><span>Clear the search or status filter to see more accounts.</span></div> : <div className="kyc-admin-table-wrap"><table className="kyc-admin-table"><thead><tr><th>Customer</th><th>KYC status</th><th>Core stages complete</th><th>Stage detail</th><th>Level</th><th>Last updated</th></tr></thead><tbody>
      {currentCustomers.map((customer: any) => <tr key={customer.customerId}><td><strong>{customer.name || "Customer"}</strong><small>{customer.email || `Account ${customer.customerId}`}</small></td><td><span className={`kyc-admin-pill ${statusClass(customer.overallStatus)}`}>{statusLabel(customer.overallStatus)}</span></td><td><strong>{customer.coreCompleted} / {customer.coreRequired}</strong><small>{customer.coreCompleted === customer.coreRequired ? "All core stages verified" : customer.nextStage ? `Next: ${CORE_STAGES.find(stage => stage.code === customer.nextStage)?.title || customer.nextStage}` : "Core journey pending"}</small></td><td><div className="kyc-admin-stage-chips">{customer.stages.filter((stage: any) => stage.required).map((stage: any) => <span key={stage.stageCode} className={`kyc-admin-stage-chip ${statusClass(stage.state)}`} title={`${stage.name}: ${statusLabel(stage.state)}`}><i />{stage.name.replace(" verification", "").replace("ID document verification", "ID document")}</span>)}</div></td><td>{customer.currentLevel}</td><td>{dateLabel(customer.updatedAt)}</td></tr>)}
    </tbody></table></div>}
    <div className="kyc-admin-pagination"><span>Page {customers.data?.page || page} of {customers.data?.pages || 1}</span><div><button className="kyc-admin-secondary" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page <= 1 || customers.isFetching}><ChevronLeft size={14} />Previous</button><button className="kyc-admin-secondary" onClick={() => setPage(value => Math.min(customers.data?.pages || 1, value + 1))} disabled={page >= (customers.data?.pages || 1) || customers.isFetching}>Next<ChevronRight size={14} /></button></div></div>
  </section>;

  const renderReviews = () => <section className="kyc-admin-panel">
    <div className="kyc-admin-panel-head"><div><span className="kyc-admin-kicker">Human decision queue</span><h2>Evidence-led stage reviews</h2><p>Approvals and rejections require stage evidence and a reason. Decisions are audited.</p></div><span className="kyc-admin-count">{reviewItems.length} pending</span></div>
    {queue.isLoading ? <div className="kyc-admin-empty">Loading review queue…</div> : queue.isError ? <div className="kyc-admin-error">The KYC review queue could not be loaded.</div> : !reviewItems.length ? <div className="kyc-admin-empty"><ClipboardCheck size={22} /><strong>No stages awaiting manual review</strong><span>New customer submissions that require a human decision will appear here.</span></div> : <div className="kyc-admin-review-list">
      {reviewItems.map((item: any) => {
        const key = `${item.profileId}-${item.stageCode}`;
        const reason = reasons[key] || "";
        const evidence = item.reviewEvidence;
        const evidenceText = item.stageCode === "ADDRESS" && evidence ? [evidence.city, evidence.stateProvince, evidence.countryCode].filter(Boolean).join(", ") || "Address evidence recorded" : item.stageCode === "IDENTITY_DOCUMENT" && evidence ? `${evidence.documentType} · ${evidence.countryCode} · ${statusLabel(evidence.status)}` : item.stageCode === "FACE_LIVENESS" && evidence ? `${evidence.outcome} · ${evidence.provider}` : "No review evidence is available";
        const canDecide = Boolean(evidence) && reason.trim().length >= 5 && !decide.isPending;
        return <article className="kyc-admin-review-card" key={key}>
          <div className="kyc-admin-review-top"><div><span className="kyc-admin-pill attention">{item.stageName} · In review</span><h3>{item.name || "Customer"}</h3><p>{item.email}</p></div><span className="kyc-admin-review-risk">{item.riskLevel || "LOW_RISK"}</span></div>
          <div className="kyc-admin-evidence"><FileCheck2 size={15} /><div><strong>Available evidence summary</strong><span>{evidenceText}</span><small>Restricted summary only; no document number, full address, image, or storage key is exposed.</small></div></div>
          <label className="kyc-admin-reason">Decision rationale <textarea value={reason} maxLength={2000} onChange={event => setReasons(current => ({ ...current, [key]: event.target.value }))} placeholder="Record the evidence reviewed and the reason for this decision (5–2000 characters). Do not include document numbers or unnecessary sensitive details." /></label>
          <div className="kyc-admin-review-actions"><button className="kyc-admin-secondary" onClick={() => { setRegion("customers"); setSearch(item.email || ""); }}><Search size={13} />View customer</button><span className="kyc-admin-action-spacer" /><button className="kyc-admin-danger" onClick={() => submitDecision(item, "REJECT")} disabled={!canDecide}>Reject</button><button className="kyc-admin-primary" onClick={() => submitDecision(item, "APPROVE")} disabled={!canDecide}><Check size={14} />Approve stage</button></div>
        </article>;
      })}
    </div>}
  </section>;

  const renderAudit = () => <>
    <section className="kyc-admin-audit-banner"><span className={`kyc-admin-audit-mark ${auditChain.data?.valid ? "valid" : "invalid"}`}><ShieldCheck size={22} /></span><div><span className="kyc-admin-kicker">Integrity verification</span><h2>{auditChain.isLoading ? "Checking hash chain…" : auditChain.data?.valid ? "KYC audit chain is valid" : "Audit chain needs investigation"}</h2><p>{auditChain.data?.valid ? `${Number(auditChain.data?.records || 0).toLocaleString()} records verified in sequence.` : auditChain.data?.brokenAt ? `Chain check failed at record ${auditChain.data.brokenAt}.` : "Audit validation is unavailable."}</p></div><button className="kyc-admin-secondary" onClick={() => { void auditChain.refetch(); void auditEvents.refetch(); }} disabled={auditChain.isFetching}><RefreshCw size={14} />Recheck</button></section>
    <section className="kyc-admin-panel"><div className="kyc-admin-panel-head"><div><span className="kyc-admin-kicker">Append-only activity</span><h2>Recent KYC events</h2><p>Latest 100 actions. Sensitive payload fields are excluded from this view.</p></div><span className="kyc-admin-count">{auditEvents.data?.length || 0} events</span></div>
      {auditEvents.isLoading ? <div className="kyc-admin-empty">Loading audit events…</div> : auditEvents.isError ? <div className="kyc-admin-error">Audit events could not be loaded.</div> : !auditEvents.data?.length ? <div className="kyc-admin-empty"><FileText size={20} /><strong>No KYC events recorded yet</strong><span>Journey and reviewer events will be listed here.</span></div> : <div className="kyc-admin-table-wrap"><table className="kyc-admin-table kyc-admin-audit-table"><thead><tr><th>Time</th><th>Event</th><th>Customer</th><th>Actor</th><th>Result</th><th>Reason</th></tr></thead><tbody>{auditEvents.data.map((event: any) => <tr key={event.id}><td>{dateLabel(event.createdAt)}</td><td><strong>{event.event}</strong><small>Profile {event.profileId ?? "—"}</small></td><td>{event.customerEmail || (event.customerId ? `Customer ${event.customerId}` : "—")}</td><td>{event.actorType}{event.actorEmail ? <small>{event.actorEmail}</small> : null}</td><td><span className={`kyc-admin-pill ${statusClass(event.result)}`}>{event.result || "—"}</span></td><td className="kyc-admin-audit-reason">{event.reason || "—"}</td></tr>)}</tbody></table></div>}
    </section>
  </>;

  const activeRegion = REGIONS.find(item => item.id === region)!;
  const ActiveIcon = activeRegion.icon;
  return <div className="portal-page kyc-admin-page arb-page">
    <header className="kyc-admin-header"><div><div className="kyc-admin-overline"><ShieldCheck size={14} /> Compliance operations · Administrator <span className="kyc-admin-header-divider">/</span> control plane 02</div><h1>KYC Control Center</h1><p>Configure the staged verification policy, review customer progress, and record evidence-based decisions from one workspace.</p></div><div className="kyc-admin-header-status"><span className={`kyc-admin-pill ${auditChain.data?.valid ? "verified" : "neutral"}`}><span className="kyc-admin-status-dot" />{auditChain.data?.valid ? "Audit chain valid" : "Audit check pending"}</span><span className="kyc-admin-pill neutral">Admin phase · customer flow pending</span><span className="kyc-admin-header-meta"><span>REFRESH</span> 15s · minimal-data view</span></div></header>
    <nav className="kyc-admin-tabs" aria-label="KYC control regions">{REGIONS.map(item => { const Icon = item.icon; return <button key={item.id} type="button" className={region === item.id ? "active" : ""} aria-current={region === item.id ? "page" : undefined} onClick={() => setRegion(item.id)}><Icon size={15} />{item.label}{item.id === "reviews" && reviewItems.length > 0 ? <span className="kyc-admin-tab-count">{reviewItems.length}</span> : null}</button>; })}</nav>
    <div className="kyc-admin-region-heading"><span className="kyc-admin-region-icon"><ActiveIcon size={17} /></span><div><span className="kyc-admin-kicker">KYC Control Center</span><h2>{activeRegion.label}</h2></div></div>
    {region === "overview" && renderOverview()}
    {region === "workflow" && renderWorkflow()}
    {region === "customers" && renderCustomers()}
    {region === "reviews" && renderReviews()}
    {region === "audit" && renderAudit()}
  </div>;
}
