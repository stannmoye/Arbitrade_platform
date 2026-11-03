import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Download,
  FileText,
  RefreshCw,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Users,
  XCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useEffect, useRef, useState, type ReactNode } from "react";

type CustomerRecord = {
  id: number;
  role?: string;
  name?: string | null;
  email?: string | null;
  package?: string;
  status?: string;
  accountState?: string;
  emailVerified?: boolean;
  kyc?: boolean;
  riskTier?: string;
  withdrawals?: boolean;
  twofa?: boolean;
  createdAt?: Date | string;
};

type LedgerRecord = {
  id: number;
  userId: number;
  customerName?: string | null;
  customerEmail?: string | null;
  currency: string;
  amountMinor: number;
  entryType: string;
  withdrawable: boolean;
  createdAt: Date | string;
};

type LifecycleSummary = {
  sourceAvailable?: boolean;
  last24Hours?: Record<string, number | string | null>;
  retainedDaily?: Array<Record<string, number | string | null>>;
  generatedAt?: string;
};

function ToolPage({
  eyebrow,
  title,
  description,
  icon: Icon,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof Activity;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="admin-ops-page arb-page">
      <header className="admin-ops-head">
        <div className="admin-ops-heading">
          <span className="admin-ops-kicker"><Icon size={14} /> {eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {action && <div className="admin-ops-actions">{action}</div>}
      </header>
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: typeof Activity;
}) {
  return (
    <article className="admin-ops-metric">
      <span className="admin-ops-metric-icon"><Icon size={17} /></span>
      <span className="admin-ops-metric-label">{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

function LoadingState({ children = "Loading saved records…" }: { children?: string }) {
  return <div className="admin-ops-empty"><Clock3 size={18} />{children}</div>;
}

function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "watch" | "high" }) {
  return <span className={`admin-ops-status ${tone}`}>{children}</span>;
}

function timestamp(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function durationLabel(milliseconds: number | null | undefined) {
  if (milliseconds == null || !Number.isFinite(milliseconds)) return "Unavailable";
  if (milliseconds < 60_000) return `${Math.floor(milliseconds / 1_000)}s`;
  if (milliseconds < 3_600_000) return `${Math.floor(milliseconds / 60_000)}m ${Math.floor((milliseconds % 60_000) / 1_000)}s`;
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

export function AdminSettings({focus}:{focus?:"tradeDuration"}={}){ const q=trpc.adminOperations.settings.useQuery(); const save=trpc.adminOperations.updateSettings.useMutation(); const [tab,setTab]=useState<"ticket"|"trade"|"password">(focus==="tradeDuration"?"trade":"ticket"); useEffect(()=>{if(focus==="tradeDuration")setTab("trade")},[focus]); const [maxMb,setMaxMb]=useState(25); const [types,setTypes]=useState("image/*,application/pdf,text/plain,.doc,.docx,.xls,.xlsx");  const [settlementMinutes,setSettlementMinutes]=useState(15); const [creditDelaySeconds,setCreditDelaySeconds]=useState(0); const [cooldownSeconds,setCooldownSeconds]=useState(30); const [nextPopupFormulaDelaySeconds,setNextPopupFormulaDelaySeconds]=useState(30); const [popupCooldownSeconds,setPopupCooldownSeconds]=useState(45); const [popupDisplaySeconds,setPopupDisplaySeconds]=useState(8); const [popupPreAlertSeconds,setPopupPreAlertSeconds]=useState(4); const [popupJitterSeconds,setPopupJitterSeconds]=useState(90); const [popupMaxPerHour,setPopupMaxPerHour]=useState(12); const [marketRefreshIntervalMinutes,setMarketRefreshIntervalMinutes]=useState(120); const [blockUntilSettled,setBlockUntilSettled]=useState(true); const [tradeReason,setTradeReason]=useState(""); const hydratedSettings=useRef(false); const [saved,setSaved]=useState(false); const [settingsMessage,setSettingsMessage]=useState(""); const [settingsMessageKind,setSettingsMessageKind]=useState<"success"|"error">("success"); useEffect(()=>{if(q.data&&!hydratedSettings.current){hydratedSettings.current=true;setMaxMb(q.data.ticket.maxAttachmentMb);setTypes(q.data.ticket.allowedMimeTypes.join(","));setSettlementMinutes(Math.max(15,Math.ceil(Number(q.data.trade?.settlementDelaySeconds||900)/60)));setCreditDelaySeconds(Number(q.data.trade?.creditDelaySeconds||0));setCooldownSeconds(Number(q.data.trade?.cooldownSeconds||30));setNextPopupFormulaDelaySeconds(Number(q.data.trade?.nextPopupFormulaDelaySeconds||30));setPopupCooldownSeconds(Number(q.data.trade?.popupCooldownSeconds||45));setPopupDisplaySeconds(Number(q.data.trade?.popupDisplaySeconds||8));setPopupPreAlertSeconds(Number(q.data.trade?.popupPreAlertSeconds||4));setPopupJitterSeconds(Number(q.data.trade?.popupJitterSeconds||90));setPopupMaxPerHour(Number(q.data.trade?.popupMaxPerHour||12));setMarketRefreshIntervalMinutes(Number(q.data.trade?.marketRefreshIntervalMinutes||120));setBlockUntilSettled(q.data.trade?.blockUntilSettled!==false)}},[q.data]); const submit=async()=>{
    setSaved(false);
    setSettingsMessage("");
    try{
      if(focus==="tradeDuration"){
        const trade={settlementDelaySeconds:Math.round(settlementMinutes*60),creditDelaySeconds,cooldownSeconds,nextPopupFormulaDelaySeconds,popupCooldownSeconds,popupDisplaySeconds,popupPreAlertSeconds,popupJitterSeconds,popupMaxPerHour,marketRefreshIntervalMinutes,blockUntilSettled};
        const expectedPolicyVersion=Number(q.data?.trade?.policyVersion??1);
        await save.mutateAsync({trade:{...trade,reason:tradeReason.trim(),expectedPolicyVersion}});
        const refreshed=await q.refetch();
        const stored=refreshed.data?.trade as Record<string,unknown>|undefined;
        const confirmed=!refreshed.isError&&Boolean(stored)&&Object.entries(trade).every(([key,value])=>typeof value==="boolean"?stored?.[key]===value:Number(stored?.[key])===value)&&Number(stored?.policyVersion)===expectedPolicyVersion+1;
        if(!confirmed)throw new Error("Global Trade settings were submitted, but a fresh server read did not confirm every saved value. Your changes remain on screen; please refresh and check the settings.");
        setSettingsMessageKind("success");
        setSettingsMessage("Global Trade timing and settlement settings saved, audited, and verified from the database. Other settings sections were not changed.");
        setTradeReason("");
      }else if(tab==="ticket"){
        const ticket={maxAttachmentMb:maxMb,allowedMimeTypes:types.split(",").map(v=>v.trim()).filter(Boolean)};
        await save.mutateAsync({ticket});
        const refreshed=await q.refetch();
        const stored=refreshed.data?.ticket;
        const confirmed=!refreshed.isError&&Boolean(stored)&&Number(stored?.maxAttachmentMb)===ticket.maxAttachmentMb&&stored?.allowedMimeTypes.join(",")===ticket.allowedMimeTypes.join(",");
        if(!confirmed)throw new Error("Ticket settings were submitted, but a fresh server read did not confirm the saved values. Your changes remain on screen; please refresh and check the settings.");
        setSettingsMessageKind("success");
        setSettingsMessage("Ticket settings saved and verified from the database. Trade and other settings were not changed.");
      }else{
        return;
      }
      setSaved(true);
      setTimeout(()=>setSaved(false),1800);
    }catch(error){
      setSettingsMessageKind("error");
      setSettingsMessage(error instanceof Error?error.message:"Settings could not be saved.");
    }
  }; return <div className="arb-page portal-page settings-page"><div className="portal-page-top"><div><div className="eyebrow">Administration</div><h1>{focus==="tradeDuration"?"Global Trade Timing & Settlement":"Settings"}</h1><p>{focus==="tradeDuration"?"Manage global settlement, wallet-credit and pop-up timing defaults. Per-tier daily caps, delivery schedules and display overrides are configured in their dedicated Trade Settings pages. Scheduled time is not proof of execution or settlement.":"Manage application settings. Each save updates only the section currently open."}</p></div><span className="admin-live-chip"><span className="pulse"/> Policy control</span></div>{settingsMessage&&<div className={"test-notice "+(settingsMessageKind==="error"?"error":"success")} role={settingsMessageKind==="error"?"alert":"status"} aria-live="polite">{settingsMessage}</div>}{!focus&&<div className="settings-tabs"><button className={tab==="ticket"?"active":""} onClick={()=>setTab("ticket")}>Ticket settings</button><button className={tab==="password"?"active":""} onClick={()=>setTab("password")}>Password & security</button></div>}{tab==="ticket"&&!focus&&<div className="settings-card"><div className="eyebrow">Customer support uploads</div><h2>Attachment policy</h2><label>Maximum attachment size (MB)<input type="number" min="1" max="100" value={maxMb} onChange={e=>setMaxMb(Number(e.target.value))}/></label><label>Accepted file types<input value={types} onChange={e=>setTypes(e.target.value)}/></label></div>}{tab==="trade"&&focus==="tradeDuration"&&<div className="settings-card"><div className="eyebrow">Wallet settlement gate</div><h2>Global timing and settlement defaults</h2><p>The scheduled time is an estimate only; elapsed time never confirms execution or credits funds. An authorized administrator must record the actual settlement result and reference before principal or realized profit is posted. While a confirmed trade is outstanding, new opportunities are blocked globally.</p><label>Settlement review delay (minutes)<input type="number" min="15" max="10080" value={settlementMinutes} onChange={e=>setSettlementMinutes(Math.max(15,Number(e.target.value)||15))}/><small>Wait after trade completion before an administrator may review the actual result. Saved as settlementReviewAt.</small></label><label>Wallet credit delay after review becomes due (seconds)<input type="number" min="0" max="604800" value={creditDelaySeconds} onChange={e=>setCreditDelaySeconds(Math.max(0,Number(e.target.value)||0))}/><small>Added to settlementReviewAt to create creditAt. The result must still be administrator-confirmed before the worker can post it.</small></label><label>Global cooldown before the next opportunity (seconds)<input type="number" min="0" max="604800" value={cooldownSeconds} onChange={e=>setCooldownSeconds(Math.max(0,Number(e.target.value)||0))}/><small>After wallet credit, wait before allowing the next eligible opportunity window.</small></label><>
<div className="form-two"><label>Global formula delay before next pop-up (seconds)<input type="number" min="0" max="604800" value={nextPopupFormulaDelaySeconds} onChange={e=>setNextPopupFormulaDelaySeconds(Math.max(0,Number(e.target.value)||0))}/><small>Server-side delay before the next opportunity calculation can deliver.</small></label><label>Global notification gap (seconds)<input type="number" min="0" max="604800" value={popupCooldownSeconds} onChange={e=>setPopupCooldownSeconds(Math.max(0,Number(e.target.value)||0))}/><small>Minimum client notification spacing.</small></label></div><div className="form-two"><label>Global pop-up display default (seconds)<input type="number" min="1" max="3600" value={popupDisplaySeconds} onChange={e=>setPopupDisplaySeconds(Math.max(1,Number(e.target.value)||1))}/></label><label>Global pre-alert duration (seconds)<input type="number" min="0" max="3600" value={popupPreAlertSeconds} onChange={e=>setPopupPreAlertSeconds(Math.max(0,Number(e.target.value)||0))}/></label></div><div className="form-two"><label>Global pop-up timing jitter (seconds)<input type="number" min="0" max="604800" value={popupJitterSeconds} onChange={e=>setPopupJitterSeconds(Math.max(0,Number(e.target.value)||0))}/></label><label>Global pop-up hourly ceiling<input type="number" min="1" max="10000" value={popupMaxPerHour} onChange={e=>setPopupMaxPerHour(Math.max(1,Number(e.target.value)||1))}/></label></div><label>Market-data refresh interval (minutes)<input type="number" min="1" max="10080" value={marketRefreshIntervalMinutes} onChange={e=>setMarketRefreshIntervalMinutes(Math.max(1,Number(e.target.value)||1))}/><small>Worker restart is not required; future refresh scheduling uses the persisted value.</small></label>
</><div className="admin-toggle-row"><div><strong>Block opportunities until all trades settle</strong><span>No new offers are published or delivered while principal and profit remain outstanding.</span></div><button className={`toggle-switch ${blockUntilSettled?"on":""}`} onClick={()=>setBlockUntilSettled(!blockUntilSettled)}>{blockUntilSettled?<ToggleRight size={28}/>:<ToggleLeft size={28}/>}</button></div><label>Reason for this global policy change (required)<textarea value={tradeReason} onChange={event=>setTradeReason(event.target.value)} minLength={5} maxLength={500} rows={3} placeholder="Explain why this timing or safety policy is changing"/><small>5–500 characters. This reason is stored in the immutable audit history. Policy version: {q.data?.trade?.policyVersion??"loading"}. Changes apply to future timing decisions; existing trade snapshots are not rewritten.</small></label></div>}{tab==="password"&&!focus&&<div className="settings-card"><div className="eyebrow">Identity security</div><h2>Password & security</h2><p>The admin password is managed by the configured local identity session. Passwords are stored as salted hashes.</p></div>}{(focus==="tradeDuration"||tab==="ticket")&&<div className="settings-actions"><button className="primary-button" onClick={submit} disabled={save.isPending||q.isLoading||q.isError||(focus==="tradeDuration"&&(tradeReason.trim().length<5||tradeReason.trim().length>500))}>{save.isPending?"Saving…":saved?"Saved":focus?"Save global Trade timing settings":"Save ticket settings"} <Check size={14}/></button><span>Only the section shown on this page is submitted; other saved settings are left unchanged.</span></div>}</div>; }

export function AdminOpportunityDelivery() {
  const query = trpc.adminOperations.popupLifecycleSummary.useQuery(undefined, { refetchInterval: 10_000 });
  const data = (query.data ?? {}) as unknown as LifecycleSummary;
  const totals = data.last24Hours ?? {};
  const daily = data.retainedDaily ?? [];
  const delivered = Number(totals.delivered ?? 0);
  const opened = Number(totals.opened ?? 0);
  const traded = Number(totals.traded ?? 0);
  const openRate = delivered ? `${((opened / delivered) * 100).toFixed(1)}%` : "—";
  const tradeRate = opened ? `${((traded / opened) * 100).toFixed(1)}%` : "—";
  const maxDelivered = Math.max(1, ...daily.map((row) => Number(row.delivered ?? 0)));
  const metrics: Array<[string, string, typeof Activity]> = [
    ["Delivered", "delivered", Activity],
    ["Noticed", "noticed", BadgeCheck],
    ["Opened", "opened", CheckCircle2],
    ["Dismissed", "dismissed", Clock3],
    ["Withdrawn", "withdrawn", CircleDollarSign],
    ["Traded", "traded", Activity],
    ["Settled", "settled", CheckCircle2],
    ["Insufficient balance", "zeroBalance", AlertTriangle],
  ];

  return (
    <ToolPage
      eyebrow="Opportunity operations"
      title="Opportunity delivery"
      description="Observe persisted popup delivery and customer follow-through. Counts are sourced from the lifecycle event store, not demo placeholders."
      icon={Activity}
      action={<button className="admin-ops-button" type="button" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw size={14} /> {query.isFetching ? "Refreshing…" : "Refresh"}</button>}
    >
      <div className="admin-ops-meta-line"><span><CalendarClock size={14} /> Rolling 24-hour event window</span><span>Updated {timestamp(data.generatedAt)}</span></div>
      {query.isLoading ? <LoadingState /> : query.isError ? <div className="admin-ops-empty error">Delivery records could not be loaded. Confirm the database is available.</div> : <>
        <section className="admin-ops-metrics">
          {metrics.map(([label, key, icon]) => <Metric key={key} label={label} value={Number(totals[key] ?? 0).toLocaleString()} icon={icon} />)}
          <Metric label="Opened / delivered" value={openRate} detail="Observed opens divided by deliveries" icon={CheckCircle2} />
          <Metric label="Traded / opened" value={tradeRate} detail="Observed trades divided by opens" icon={CircleDollarSign} />
        </section>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Retained history</span><h2>Daily delivery volume</h2></div><span className="admin-ops-subtle">Up to 30 days</span></div>
          {!daily.length ? <div className="admin-ops-empty compact">No retained daily lifecycle rows yet. New deliveries will appear here.</div> : <div className="admin-ops-chart" role="img" aria-label="Daily delivered opportunities over the retained history">
            {daily.slice().reverse().map((row, index) => {
              const count = Number(row.delivered ?? 0);
              const height = Math.max(4, Math.round((count / maxDelivered) * 100));
              return <div className="admin-ops-bar-column" key={`${String(row.eventDate ?? index)}-${index}`} title={`${String(row.eventDate ?? "Day")}: ${count} delivered`}><span>{count}</span><i style={{ height: `${height}%` }} /><small>{String(row.eventDate ?? "").slice(5, 10)}</small></div>;
            })}
          </div>}
        </section>
        <div className="admin-ops-note"><ShieldCheck size={16} /><span><strong>Operational interpretation</strong> A zero is a recorded count, not by itself proof of a delivery failure. Compare delivered, noticed and opened events with the selected time window.</span></div>
      </>}
    </ToolPage>
  );
}

export function AdminTradeSettingsOverview() {
  const lifecycle = trpc.adminOperations.popupLifecycleSummary.useQuery(undefined, { refetchInterval: 15_000 });
  const offers = trpc.adminOperations.offers.useQuery(undefined, { refetchInterval: 15_000 });
  const policies = trpc.adminOperations.overviewPackagePolicies.useQuery(undefined, { refetchInterval: 30_000 });
  const pending = trpc.adminOperations.pendingSettlements.useQuery(undefined, { refetchInterval: 10_000 });
  const allocation = trpc.adminOperations.tradeAllocationControls.useQuery(undefined, { refetchInterval: 10_000 });
  const data = (lifecycle.data ?? {}) as unknown as LifecycleSummary;
  const totals = data.last24Hours ?? {};
  const sourceAvailable = data.sourceAvailable === true;
  const count = (loading: boolean, failed: boolean, value: unknown, available = true) => {
    if (loading) return "Loading";
    if (failed) return "Unavailable";
    if (!available || value == null) return "Unavailable";
    const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    return Number.isFinite(parsed) ? parsed.toLocaleString() : "Unavailable";
  };
  const lifecycleUpdated = lifecycle.isLoading ? "Loading" : lifecycle.isError || !sourceAvailable ? "Unavailable" : timestamp(data.generatedAt);
  const allocationState = allocation.isLoading ? "Loading" : allocation.isError ? "Unavailable" : allocation.data?.allocationsPaused === undefined ? "Unavailable" : allocation.data.allocationsPaused ? "Paused" : "Open";
  const refresh = () => { void Promise.all([lifecycle.refetch(), offers.refetch(), policies.refetch(), pending.refetch(), allocation.refetch()]); };

  return (
    <ToolPage
      eyebrow="Trading operations"
      title="Trading overview"
      description="A read-only snapshot of persisted opportunity, lifecycle, settlement-queue and allocation-control data."
      icon={Activity}
      action={<button className="admin-ops-button" type="button" onClick={refresh} disabled={lifecycle.isFetching || offers.isFetching || policies.isFetching || pending.isFetching || allocation.isFetching}><RefreshCw size={14} /> Refresh</button>}
    >
      <div className="admin-ops-meta-line"><span><CalendarClock size={14} /> Rolling 24-hour lifecycle window</span><span>Updated {lifecycleUpdated}</span></div>
      <section className="admin-ops-metrics">
        <Metric label="Global allocation gate" value={allocationState} detail="Open means new allocations are not paused" icon={Activity} />
        <Metric label="Enabled package policies" value={count(policies.isLoading, policies.isError, (policies.data ?? []).filter((policy) => policy.enabled).length)} icon={BadgeCheck} />
        <Metric label="Open opportunities" value={count(offers.isLoading, offers.isError, offers.data?.length)} detail="Current database offer registry" icon={Activity} />
        <Metric label="Opportunities delivered" value={count(lifecycle.isLoading, lifecycle.isError, totals.delivered, sourceAvailable)} detail="Rolling 24-hour lifecycle events" icon={Activity} />
        <Metric label="Trades recorded" value={count(lifecycle.isLoading, lifecycle.isError, totals.traded, sourceAvailable)} detail="Rolling 24-hour lifecycle events" icon={CircleDollarSign} />
        <Metric label="Settled trade events" value={count(lifecycle.isLoading, lifecycle.isError, totals.settled, sourceAvailable)} detail="Rolling 24-hour lifecycle events" icon={CheckCircle2} />
        <Metric label="Insufficient-balance events" value={count(lifecycle.isLoading, lifecycle.isError, totals.zeroBalance, sourceAvailable)} detail="Rolling 24-hour lifecycle events" icon={AlertTriangle} />
        <Metric label="Manual settlements pending" value={count(pending.isLoading, pending.isError, pending.data?.length)} detail="Current administrator queue" icon={Clock3} />
      </section>
      {(lifecycle.isError || offers.isError || policies.isError || pending.isError || allocation.isError) && <div className="admin-ops-empty error" role="status">One or more data sources could not be loaded. Unavailable metrics are not zero; refresh after verifying the database-backed service.</div>}
      <div className="admin-ops-note"><ShieldCheck size={16} /><span><strong>Data scope</strong> This view reports open opportunity records, enabled package-policy rows, the global new-allocation gate, the current manual-settlement queue, and rolling 24-hour lifecycle events. It does not infer calendar-day totals, all in-flight trade states, or worker/provider health from these sources.</span></div>
    </ToolPage>
  );
}

export function AdminVerificationOversight() {
  const query = trpc.adminOperations.customers.useQuery(undefined, { refetchInterval: 10_000 });
  const customers = (query.data ?? []) as unknown as CustomerRecord[];
  const flagged = customers.filter((customer) => customer.emailVerified === false || customer.kyc === true);
  const emailPending = customers.filter((customer) => customer.emailVerified === false).length;
  const kycRequired = customers.filter((customer) => customer.kyc === true).length;

  return (
    <ToolPage eyebrow="Account controls" title="Verification oversight" description="Review the verification-related account controls currently stored for customer accounts." icon={BadgeCheck}>
      <div className="admin-ops-note"><ShieldCheck size={16} /><span><strong>Scope note</strong> The current data model exposes email-verification state and the KYC-required policy flag; it does not expose uploaded identity documents or an approval decision. This page is informational and does not approve documents.</span></div>
      {query.isLoading ? <LoadingState /> : query.isError ? <div className="admin-ops-empty error">Customer verification controls could not be loaded.</div> : <>
        <section className="admin-ops-metrics compact-metrics">
          <Metric label="Customer accounts" value={customers.length} icon={Users} />
          <Metric label="Email not verified" value={emailPending} icon={Clock3} />
          <Metric label="KYC required by policy" value={kycRequired} icon={ShieldCheck} />
          <Metric label="Accounts with flags" value={flagged.length} icon={AlertTriangle} />
        </section>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Customer controls</span><h2>Verification-related accounts</h2></div><span className="admin-ops-subtle">{flagged.length} records</span></div>
          <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Customer verification controls"><table className="admin-ops-table"><thead><tr><th>Customer</th><th>Account</th><th>Email</th><th>KYC policy</th><th>Package</th></tr></thead><tbody>
            {flagged.map((customer) => <tr key={customer.id}><td><strong>{customer.name || "Customer"}</strong><small>{customer.email || `Account ${customer.id}`}</small></td><td>{customer.accountState || customer.status || "active"}</td><td><StatusPill tone={customer.emailVerified ? "good" : "watch"}>{customer.emailVerified ? "Verified" : "Not verified"}</StatusPill></td><td><StatusPill tone={customer.kyc ? "watch" : "neutral"}>{customer.kyc ? "Required" : "Not required"}</StatusPill></td><td>{customer.package || "—"}</td></tr>)}
            {!flagged.length && <tr><td colSpan={5} className="admin-ops-table-empty">No accounts currently have verification-related flags.</td></tr>}
          </tbody></table></div>
        </section>
      </>}
    </ToolPage>
  );
}

export function AdminRiskWatchlist() {
  const query = trpc.adminOperations.customers.useQuery(undefined, { refetchInterval: 10_000 });
  const customers = (query.data ?? []) as unknown as CustomerRecord[];
  const rank = (tier: string) => ({ critical: 4, high: 3, elevated: 2, medium: 1 }[tier.toLowerCase()] ?? 0);
  const watchlist = customers.filter((customer) => rank(customer.riskTier || "") > 0 || ["suspended", "restricted", "deactivated"].includes((customer.accountState || customer.status || "").toLowerCase())).sort((a, b) => rank(b.riskTier || "") - rank(a.riskTier || ""));
  const elevated = customers.filter((customer) => rank(customer.riskTier || "") >= 2).length;
  const restricted = customers.filter((customer) => ["suspended", "restricted", "deactivated"].includes((customer.accountState || customer.status || "").toLowerCase())).length;

  return (
    <ToolPage eyebrow="Risk & account state" title="Risk watchlist" description="A read-only overview of stored risk tiers, account restrictions and customer trading controls." icon={AlertTriangle}>
      {query.isLoading ? <LoadingState /> : query.isError ? <div className="admin-ops-empty error">The risk watchlist could not be loaded.</div> : <>
        <section className="admin-ops-metrics compact-metrics">
          <Metric label="Customers monitored" value={customers.length} icon={Users} />
          <Metric label="Elevated or higher" value={elevated} icon={AlertTriangle} />
          <Metric label="Restricted accounts" value={restricted} icon={ShieldCheck} />
          <Metric label="Watchlist entries" value={watchlist.length} icon={Activity} />
        </section>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Policy-derived watchlist</span><h2>Accounts to review</h2></div><span className="admin-ops-subtle">Read only</span></div>
          <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Customer risk watchlist"><table className="admin-ops-table"><thead><tr><th>Customer</th><th>Risk tier</th><th>Account state</th></tr></thead><tbody>
            {watchlist.map((customer) => {
              const tier = customer.riskTier || "standard";
              const state = customer.accountState || customer.status || "active";
              return <tr key={customer.id}><td><strong>{customer.name || "Customer"}</strong><small>{customer.email || `Account ${customer.id}`}</small></td><td><StatusPill tone={rank(tier) >= 3 ? "high" : rank(tier) >= 2 ? "watch" : "neutral"}>{tier}</StatusPill></td><td><StatusPill tone={["active", "open"].includes(state.toLowerCase()) ? "good" : "watch"}>{state}</StatusPill></td></tr>;
            })}
            {!watchlist.length && <tr><td colSpan={3} className="admin-ops-table-empty">No elevated risk tiers or restricted accounts are recorded.</td></tr>}
          </tbody></table></div>
        </section>
        <div className="admin-ops-note"><ShieldCheck size={16} /><span><strong>Review only</strong> Risk flags are based on saved account controls. This view does not assign a credit, investment or suitability score and does not change any account.</span></div>
      </>}
    </ToolPage>
  );
}

export function AdminTransactionReview({ focus }: { focus?: "ledger" | "capital" | "fees" | "reconciliation" }) {
  const [ledgerCustomerId, setLedgerCustomerId] = useState("");
  const [ledgerUtcDay, setLedgerUtcDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [ledgerCursor, setLedgerCursor] = useState<string | undefined>(undefined);
  const ledgerUserId = /^[1-9]\d*$/.test(ledgerCustomerId.trim()) && Number.isSafeInteger(Number(ledgerCustomerId)) ? Number(ledgerCustomerId) : undefined;
  const ledgerUtcDayValid = /^\d{4}-\d{2}-\d{2}$/.test(ledgerUtcDay) && Number.isFinite(new Date(`${ledgerUtcDay}T00:00:00.000Z`).getTime()) && new Date(`${ledgerUtcDay}T00:00:00.000Z`).toISOString().slice(0, 10) === ledgerUtcDay;
  const ledgerFilterValid = ledgerUserId !== undefined && ledgerUtcDayValid;
  const ledgerCustomersQuery = trpc.adminOperations.customers.useQuery(undefined, { enabled: focus === "ledger" || !focus, staleTime: 60_000 });
  const ledgerFilter = { userId: ledgerUserId ?? 1, utcDay: ledgerUtcDayValid ? ledgerUtcDay : "1970-01-01", ...(ledgerCursor ? { cursor: ledgerCursor } : {}) };
  const ledgerQuery = trpc.adminOperations.ledgerActivity.useQuery(ledgerFilter, { enabled: ledgerFilterValid && (focus === "ledger" || !focus), refetchInterval: 10_000 });
  const pendingQuery = trpc.adminOperations.pendingSettlements.useQuery(undefined, { enabled: focus === "reconciliation", refetchInterval: 5_000 });
  const [integrityBeforeTradeId, setIntegrityBeforeTradeId] = useState<number | undefined>(undefined);
  const [settlementLedgerBeforeTradeId, setSettlementLedgerBeforeTradeId] = useState<number | undefined>(undefined);
  const integrityQuery = trpc.adminOperations.settlementIntegrityIssues.useQuery({
    limit: 250,
    ...(integrityBeforeTradeId === undefined ? {} : { beforeTradeId: integrityBeforeTradeId }),
  }, { enabled: focus === "reconciliation", refetchInterval: 30_000 });
  const walletLedgerReconciliationQuery = trpc.adminOperations.walletLedgerReconciliation.useQuery({
    limit: 250,
    ...(settlementLedgerBeforeTradeId === undefined ? {} : { beforeTradeId: settlementLedgerBeforeTradeId }),
  }, { enabled: focus === "reconciliation", refetchInterval: 30_000 });
  const confirmSettlement = trpc.adminOperations.confirmManualSettlement.useMutation({ onSuccess: () => { pendingQuery.refetch(); integrityQuery.refetch(); walletLedgerReconciliationQuery.refetch(); } });
  const tradeFeePolicyQuery = trpc.adminOperations.tradeFeePolicy.useQuery(undefined, { enabled: focus === "fees", staleTime: 60_000 });
  const [feePolicyDraft, setFeePolicyDraft] = useState<{ feePercent: string; roundingMode: "half_up" | "down" | "up" | "half_even" } | null>(null);
  const feePolicy = tradeFeePolicyQuery.data;
  const feeDraft = feePolicyDraft ?? { feePercent: feePolicy ? String(feePolicy.feeRateBps / 100) : "15", roundingMode: feePolicy?.roundingMode ?? "half_up" };
  const updateTradeFeePolicy = trpc.adminOperations.updateTradeFeePolicy.useMutation({ onSuccess: () => { setFeePolicyDraft(null); tradeFeePolicyQuery.refetch(); } });
  const [drafts, setDrafts] = useState<Record<number, { grossProfitMinor: string; reference: string }>>({});
  const currencyQuery = trpc.adminOperations.currencies.useQuery(undefined, { enabled: focus === "ledger", staleTime: 60_000 });
  const rows = (ledgerQuery.data?.entries ?? []) as unknown as LedgerRecord[];
  const ledgerCustomers = (ledgerCustomersQuery.data ?? []) as unknown as CustomerRecord[];
  const currencies = (currencyQuery.data ?? []) as unknown as Array<{ code: string; scale: number }>;
  const scales = new Map(currencies.map((currency) => [currency.code.toUpperCase(), Math.max(0, Math.min(8, Number(currency.scale) || 0))]));
  const formatAmount = (amountMinor: number, currency: string) => {
    const code = currency.toUpperCase();
    const scale = scales.get(code) ?? 2;
    const value = Number(amountMinor) / (10 ** scale);
    return `${code} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: scale, maximumFractionDigits: scale }).format(value)}`;
  };

  return (
    <ToolPage eyebrow={focus === "reconciliation" ? "Trade settlement records" : focus === "fees" ? "Trading fee policy" : focus === "capital" ? "Capital and wallet funding" : "Append-only balance ledger"} title={focus === "fees" ? "Returns and fees" : focus === "capital" ? "Capital & Wallet Funding" : focus === "reconciliation" ? "Settlement & Reconciliation" : "Wallet & Ledger"} description={focus === "fees" ? "Set the fee taken only from confirmed positive profit. Losses and zero-profit trades have no profit fee." : focus === "capital" ? "Read-only availability status for the unimplemented capital and wallet-funding queue." : focus === "reconciliation" ? "Review and reconcile trade settlement records only." : "Read-only wallet activity for one selected customer and one UTC calendar day."} icon={CircleDollarSign} action={<button className="admin-ops-button" type="button" onClick={() => { if (focus === "fees") tradeFeePolicyQuery.refetch(); else if (focus === "reconciliation") { pendingQuery.refetch(); integrityQuery.refetch(); walletLedgerReconciliationQuery.refetch(); } else if (focus === "ledger" || !focus) { ledgerQuery.refetch(); currencyQuery.refetch(); } }} disabled={focus === "fees" ? tradeFeePolicyQuery.isFetching : focus === "reconciliation" ? pendingQuery.isFetching || integrityQuery.isFetching || walletLedgerReconciliationQuery.isFetching : focus === "ledger" || !focus ? !ledgerFilterValid || ledgerQuery.isFetching || currencyQuery.isFetching : false}><RefreshCw size={14} /> Refresh</button>}>
      {focus === "capital" && <section className="admin-ops-panel" aria-label="Capital and wallet funding availability">
        <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Read-only availability</span><h2>Capital &amp; Wallet Funding</h2></div><span className="admin-ops-subtle">Unavailable</span></div>
        <div className="admin-ops-empty compact">A capital and wallet-funding queue is not implemented. No funding, payout, or settlement actions are available on this route.</div>
      </section>}
      {focus === "capital" ? null : ledgerQuery.isLoading && (focus === "ledger" || !focus) ? <LoadingState /> : ledgerQuery.isError && (focus === "ledger" || !focus) ? <div className="admin-ops-empty error">The balance ledger could not be loaded.</div> : <>
        {focus === "fees" && <>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Realized-profit fee policy</span><h2>Trading platform fee</h2></div><span className="admin-ops-subtle">Policy v{feePolicy?.policyVersion ?? 1}</span></div>
          <p>Applies only to confirmed positive gross profit. Zero-profit and loss settlements incur no profit-based fee. The default policy is 15%.</p>
          {tradeFeePolicyQuery.isError && <div className="admin-ops-empty error">Trading fee policy could not be loaded; changes are disabled.</div>}
          {updateTradeFeePolicy.error && <div className="admin-ops-empty error">{updateTradeFeePolicy.error.message}</div>}
          <div className="admin-ops-form-grid">
            <label>Fee rate (%)
              <input type="number" min={0} max={100} step={0.01} value={feeDraft.feePercent} disabled={tradeFeePolicyQuery.isLoading || tradeFeePolicyQuery.isError} onChange={(event) => setFeePolicyDraft({ ...feeDraft, feePercent: event.target.value })} />
            </label>
            <label>Fee rounding
              <select value={feeDraft.roundingMode} disabled={tradeFeePolicyQuery.isLoading || tradeFeePolicyQuery.isError} onChange={(event) => setFeePolicyDraft({ ...feeDraft, roundingMode: event.target.value as "half_up" | "down" | "up" | "half_even" })}>
                <option value="half_up">Half up</option>
                <option value="down">Down</option>
                <option value="up">Up</option>
                <option value="half_even">Half even</option>
              </select>
            </label>
            <div className="admin-ops-form-actions">
              <button className="admin-ops-button" type="button" disabled={tradeFeePolicyQuery.isLoading || tradeFeePolicyQuery.isError || updateTradeFeePolicy.isPending || !feeDraft.feePercent.trim() || !Number.isFinite(Number(feeDraft.feePercent)) || Number(feeDraft.feePercent) < 0 || Number(feeDraft.feePercent) > 100} onClick={() => updateTradeFeePolicy.mutate({ feeRateBps: Math.round(Number(feeDraft.feePercent) * 100), roundingMode: feeDraft.roundingMode })}>{updateTradeFeePolicy.isPending ? "Saving…" : "Save fee policy"}</button>
            </div>
          </div>
          <div className="admin-ops-note"><ShieldCheck size={16} /><span>Changes are audited and versioned. Each settlement stores the fee rate, rounding rule, and policy version used.</span></div>
        </section>
        </>}
        {focus === "reconciliation" && <>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Settlement and delayed-credit queue</span><h2>Review results and track wallet credits</h2></div><span className="admin-ops-subtle">{pendingQuery.data?.length ?? 0} waiting</span></div>
          {pendingQuery.isError && <div className="admin-ops-empty error">Pending settlements could not be loaded. Refresh before attempting any settlement.</div>}
          {confirmSettlement.error && <div className="admin-ops-empty error" role="alert">Settlement was not confirmed: {confirmSettlement.error.message}. Verify the trade's due time and evidence reference before retrying.</div>}
          {confirmSettlement.isSuccess && <div className="admin-ops-note" role="status">Actual result confirmed. Principal and earnings remain locked until the saved wallet-credit time; the worker will post the ledger entries automatically.</div>}
          {pendingQuery.isLoading ? <LoadingState /> : !pendingQuery.data?.length ? <div className="admin-ops-empty compact">No trades are awaiting manual settlement.</div> : <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Trades awaiting manual settlement" onKeyDown={(event) => { if (event.key === "ArrowRight") { event.preventDefault(); event.currentTarget.scrollLeft += 80; } else if (event.key === "ArrowLeft") { event.preventDefault(); event.currentTarget.scrollLeft -= 80; } }}><table className="admin-ops-table"><thead><tr><th>Trade / customer</th><th>Due status / evidence health</th><th>Principal</th><th>Reserved reward (estimate)</th><th>Actual gross profit/loss (minor units)</th><th>Settlement evidence reference</th><th>Action</th></tr></thead><tbody>
            {(pendingQuery.data as any[]).map((trade) => {
              const draft = drafts[trade.id] || { grossProfitMinor: "", reference: "" };
              const enteredGross = Number(draft.grossProfitMinor);
              const reserved = Number(trade.rewardReservedMinor || 0);
              const reservationAmount = trade.reservationAmountMinor == null ? null : Number(trade.reservationAmountMinor);
              const reservationConsistent = reservationAmount === null
                ? reserved === 0 && !trade.reservationStatus
                : Number.isSafeInteger(reservationAmount) && reservationAmount === reserved && trade.reservationStatus === "reserved";
              const dueAt = trade.settlementReviewAt || trade.creditAt || trade.settlesAt;
              const creditDueAt = trade.creditAt || trade.settlementReviewAt || trade.settlesAt;
              const isDue = !!dueAt && Number.isFinite(new Date(dueAt).getTime()) && new Date(dueAt).getTime() <= Date.now();
              const alreadyConfirmed = trade.settlementStatus === "confirmed_awaiting_credit";
              const canConfirm = trade.settlementStatus === "pending" && isDue && reservationConsistent && draft.grossProfitMinor.trim() !== "" && Number.isSafeInteger(enteredGross) && draft.reference.trim().length >= 3;
              return <tr key={trade.id}>
                <td><strong>Trade {trade.id} · {trade.symbol || "Opportunity"}</strong><small>{trade.customerName || trade.customerEmail || ("Account " + trade.userId)} · {trade.currency}</small><small>Subscription: {trade.packageSubscriptionId ?? "Legacy / none"}</small></td>
                <td><strong>{alreadyConfirmed ? "Result confirmed — awaiting wallet credit" : trade.lifecycleStage || "Stage not recorded"}</strong><small>{dueAt ? (isDue ? "Review available " : "Review scheduled ") + new Date(dueAt).toLocaleString() : "Missing trade completion timestamp"}</small><small>{alreadyConfirmed ? "Wallet credit scheduled " + new Date(creditDueAt).toLocaleString() : reservationConsistent ? "Reward reservation consistent" : "Reservation mismatch — investigate before settlement"}</small><small>{alreadyConfirmed ? "Evidence reference: " + (trade.settlementReference || "missing") : trade.reservationStatus ? "Reservation: " + trade.reservationStatus : "No reservation record"}</small></td>
                <td>{trade.principalMinor}</td>
                <td>{trade.rewardReservedMinor}<small>Estimate only; not a settlement result.</small></td>
                <td>{alreadyConfirmed ? <><strong>{trade.realizedGrossProfitMinor}</strong><small>Actual gross result · Fee {trade.platformFeeMinor} · Net {trade.netProfitMinor}</small></> : <input type="number" step={1} value={draft.grossProfitMinor} onChange={(event) => setDrafts((current) => ({ ...current, [trade.id]: { ...draft, grossProfitMinor: event.target.value } }))} placeholder="Positive profit or negative loss" aria-label={"Actual gross profit/loss in minor units for trade " + trade.id} />}</td>
                <td><input value={alreadyConfirmed ? (trade.settlementReference || draft.reference) : draft.reference} disabled={alreadyConfirmed} maxLength={160} onChange={(event) => setDrafts((current) => ({ ...current, [trade.id]: { ...draft, reference: event.target.value } }))} placeholder="Actual settlement reference (required)" aria-label={"Settlement evidence reference for trade " + trade.id} /></td>
                <td><button className="admin-ops-button" type="button" disabled={confirmSettlement.isPending || !canConfirm} onClick={() => confirmSettlement.mutate({ tradeId: trade.id, grossProfitMinor: enteredGross, settlementReference: draft.reference.trim() })}><CheckCircle2 size={14} /> {alreadyConfirmed ? "Awaiting wallet credit" : "Confirm actual result"}</button></td>
              </tr>;
            })}
          </tbody></table></div>}
          <div className="admin-ops-note"><ShieldCheck size={16} /><span>Confirm only after independently verifying the actual result and evidence reference. Review becomes available when the configured settlement-review delay ends. Confirmation records the result and fee-policy snapshot but does not release principal or credit earnings. The server-side worker posts the wallet and ledger exactly once when the saved creditAt is reached; elapsed time alone never confirms a result.</span></div>
        </section>
        </>}
        {focus === "ledger" && <section className="admin-ops-note"><ShieldCheck size={16} /><span>Settlement reconciliation belongs to the separate “Trade Settings → Settlement &amp; Reconciliation” report. Database Entries only displays wallet activity for the selected customer and UTC day.</span></section>}
        {focus === "reconciliation" && <>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head">
            <div><span className="admin-ops-kicker">Read-only settlement ledger audit</span><h2>Expected postings versus recorded ledger</h2></div>
            <span className="admin-ops-subtle">{walletLedgerReconciliationQuery.data?.settlementIssues.length ?? 0} flagged settlements</span>
          </div>
          <p>Settled trades with a recorded result are compared with expected principal, realized profit/loss and fee postings using their stored fee-policy snapshot. Legacy results are never estimated or backfilled.</p>
          {walletLedgerReconciliationQuery.isLoading ? <LoadingState /> : walletLedgerReconciliationQuery.isError ? <div className="admin-ops-empty error">Settlement ledger reconciliation could not be loaded.</div> : <>
            <div className="admin-ops-subtle">Examined {walletLedgerReconciliationQuery.data?.settlementScan.tradesExamined ?? 0} settled trades · Batch limit {walletLedgerReconciliationQuery.data?.settlementScan.limit ?? 250} · {walletLedgerReconciliationQuery.data?.settlementScan.hasMore ? "More settled trades remain" : "No further settled trades in this scan"} · {walletLedgerReconciliationQuery.data?.settlementScan.ledgerEntriesExamined ?? 0} matching ledger rows inspected</div>
            {walletLedgerReconciliationQuery.data?.settlementScan.ledgerEntriesTruncated && <div className="admin-ops-empty error" role="alert">Matching ledger evidence reached the scan safety cap. Missing/duplicate posting conclusions are suppressed for this batch; narrow the batch or review the saved evidence before drawing conclusions.</div>}
            <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Settlement ledger reconciliation results">
              <table className="admin-ops-table"><thead><tr><th>Trade / customer</th><th>Settlement reference</th><th>Recorded gross / fee / net</th><th>Reconciliation flags</th></tr></thead><tbody>
                {(walletLedgerReconciliationQuery.data?.settlementIssues ?? []).map((item) => <tr key={item.tradeId}>
                  <td><strong>Trade {item.tradeId}</strong><small>Account {item.userId} · {item.currency}</small></td>
                  <td>{item.settlementReference || "Missing reference"}</td>
                  <td>{item.realizedGrossProfitMinor ?? "Not recorded"} / {item.platformFeeMinor ?? "—"} / {item.netProfitMinor ?? "—"}<small>Minor units; read from saved trade result</small></td>
                  <td>{item.issues.map((issue) => <div key={issue.code}><strong>{issue.confidence}</strong>: {issue.code.replaceAll("_", " ")}<small>{issue.explanation}</small></div>)}</td>
                </tr>)}
                {!(walletLedgerReconciliationQuery.data?.settlementIssues ?? []).length && <tr><td colSpan={4} className="admin-ops-table-empty">No flagged settlements in this batch. Check the scan metadata before treating this as a full audit.</td></tr>}
              </tbody></table>
            </div>
            <div className="admin-payout-actions">
              {walletLedgerReconciliationQuery.data?.settlementScan.hasMore && walletLedgerReconciliationQuery.data.settlementScan.nextBeforeTradeId && <button className="admin-ops-button" type="button" onClick={() => setSettlementLedgerBeforeTradeId(walletLedgerReconciliationQuery.data!.settlementScan.nextBeforeTradeId ?? undefined)}>Load next settled trades</button>}
              {settlementLedgerBeforeTradeId !== undefined && <button className="admin-ops-button" type="button" onClick={() => setSettlementLedgerBeforeTradeId(undefined)}>Restart settlement ledger scan</button>}
            </div>
          </>}
          <div className="admin-ops-note"><ShieldCheck size={16} /><span>This audit is investigative, not a repair command. Missing historical results or references remain inconclusive. Any justified correction must be separately authorized, evidence-backed, idempotent, and recorded with compensating ledger entries rather than rewriting old entries.</span></div>
        </section>
        </>}
        {focus === "reconciliation" && <>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Read-only settlement integrity scan</span><h2>Settlement state and reservation issues</h2></div><span className="admin-ops-subtle">{integrityQuery.data?.issues.length ?? 0} flagged</span></div>
          <p>This scan checks saved settlement state, claims and reservation transitions. It is paginated and never changes balances, creates ledger entries, or infers missing profit results.</p>
          {integrityQuery.isLoading ? <LoadingState /> : integrityQuery.isError ? <div className="admin-ops-empty error">Settlement integrity results could not be loaded. Refresh before relying on this review.</div> : <>
            <div className="admin-ops-subtle">Examined {integrityQuery.data?.scan.candidatesExamined ?? 0} candidates · Batch limit {integrityQuery.data?.scan.limit ?? 250} · {integrityQuery.data?.scan.hasMore ? "More candidates remain" : "No additional candidates in this scan"}</div>
            <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Settlement integrity issues"><table className="admin-ops-table"><thead><tr><th>Trade</th><th>State</th><th>Recorded settlement</th><th>Reservation</th><th>Review flags</th></tr></thead><tbody>
              {(integrityQuery.data?.issues ?? []).map((item) => <tr key={item.tradeId}>
                <td><strong>Trade {item.tradeId}</strong><small>Account {item.userId} · {item.currency}</small></td>
                <td>{item.status} / {item.settlementStatus}<small>{item.lifecycleStage || "No lifecycle stage"}</small></td>
                <td>{item.settlementReference || "No reference"}<small>Outcome: {item.settlementOutcome || "Not recorded"}</small><small>Gross: {item.realizedGrossProfitMinor} · Fee: {item.platformFeeMinor} · Net: {item.netProfitMinor}</small></td>
                <td>{item.reservationStatus || "No reservation"}<small>Reserved: {item.reservationAmountMinor ?? item.rewardReservedMinor}</small></td>
                <td>{(item.issues as string[]).map((issue) => <div key={issue}>{issue.replaceAll("_", " ")}</div>)}</td>
              </tr>)}
              {!(integrityQuery.data?.issues ?? []).length && <tr><td colSpan={5} className="admin-ops-table-empty">No settlement integrity issues in this batch.</td></tr>}
            </tbody></table></div>
            <div className="admin-payout-actions">
              {integrityQuery.data?.scan.hasMore && integrityQuery.data.scan.nextBeforeTradeId && <button className="admin-ops-button" type="button" onClick={() => setIntegrityBeforeTradeId(integrityQuery.data!.scan.nextBeforeTradeId ?? undefined)}>Load next integrity batch</button>}
              {integrityBeforeTradeId !== undefined && <button className="admin-ops-button" type="button" onClick={() => setIntegrityBeforeTradeId(undefined)}>Restart integrity scan</button>}
            </div>
          </>}
        </section>
        </>}
        {focus === "ledger" && (
          <section className="admin-ops-metrics compact-metrics">
          <Metric label="Entries shown" value={rows.length} icon={FileText} />
          <Metric label="Positive entries" value={rows.filter((row) => Number(row.amountMinor) > 0).length} icon={CheckCircle2} />
          <Metric label="Negative entries" value={rows.filter((row) => Number(row.amountMinor) < 0).length} icon={AlertTriangle} />
          <Metric label="Currencies represented" value={new Set(rows.map((row) => row.currency)).size} icon={CircleDollarSign} />
          </section>
        )}
        {focus === "ledger" && <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Database Entries · read only</span><h2>Wallet activity</h2></div><span className="admin-ops-subtle">Up to 50 · {ledgerUserId ? `Customer ${ledgerUserId}` : "Select one customer"} · {ledgerUtcDay} UTC</span></div>
          <div className="admin-ops-form-grid" aria-label="Filter wallet database entries">
            <label>Customer (required)
              <select value={ledgerCustomerId} onChange={event => { setLedgerCustomerId(event.target.value); setLedgerCursor(undefined); }} aria-label="Customer (required)">
                <option value="">Select one customer</option>
                {ledgerCustomers.filter(customer => customer.role === "user").map(customer => <option key={customer.id} value={customer.id}>{`Account ${customer.id} · ${customer.name || customer.email || "Customer"}`}</option>)}
              </select>
            </label>
            <label>Calendar day (required, UTC)
              <input type="date" required value={ledgerUtcDay} onChange={event => { setLedgerUtcDay(event.target.value); setLedgerCursor(undefined); }} aria-label="Calendar day (required, UTC)" />
            </label>
            <div className="admin-ops-form-actions">
              <button className="admin-ops-button" type="button" onClick={() => { setLedgerCustomerId(""); setLedgerUtcDay(new Date().toISOString().slice(0, 10)); setLedgerCursor(undefined); }}>Clear selection</button>
            </div>
          </div>
          <div className="admin-ops-subtle">Timezone: UTC. This page includes entries at {ledgerUtcDay} 00:00:00 UTC and excludes entries at the next day’s 00:00:00 UTC. Timestamps below are shown in UTC.</div>
          {!ledgerCustomerId && <div className="admin-ops-empty compact">Select exactly one customer to inspect that customer’s wallet activity.</div>}
          {!ledgerUtcDayValid && <div className="admin-ops-empty error" role="alert">Select a valid UTC calendar day.</div>}
          {ledgerCustomersQuery.isError && <div className="admin-ops-empty error" role="alert">The customer list could not be loaded; choose a customer after refreshing.</div>}
          <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Wallet activity ledger" onKeyDown={(event) => { if (event.key === "ArrowRight") { event.preventDefault(); event.currentTarget.scrollLeft += 80; } else if (event.key === "ArrowLeft") { event.preventDefault(); event.currentTarget.scrollLeft -= 80; } }}><table className="admin-ops-table"><thead><tr><th>Recorded (UTC)</th><th>Customer</th><th>Entry type</th><th>Amount</th><th>Withdrawable</th></tr></thead><tbody>
            {rows.map((row) => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleString("en-GB", { timeZone: "UTC", timeZoneName: "short" })}</td><td><strong>{row.customerName || "Customer"}</strong><small>{row.customerEmail || `Account ${row.userId}`}</small></td><td><span className="admin-ops-entry-type">{row.entryType}</span></td><td className={Number(row.amountMinor) < 0 ? "amount-negative" : "amount-positive"}>{formatAmount(Number(row.amountMinor), row.currency)}</td><td><StatusPill tone={row.withdrawable ? "good" : "neutral"}>{row.withdrawable ? "Yes" : "No"}</StatusPill></td></tr>)}
            {!rows.length && ledgerFilterValid && !ledgerQuery.isLoading && !ledgerQuery.isError && <tr><td colSpan={5} className="admin-ops-table-empty">No wallet activity for this customer on this UTC day.</td></tr>}
          </tbody></table></div>
          {ledgerQuery.isError && <div className="admin-ops-empty error" role="alert">Wallet activity could not be loaded for this customer and UTC day.</div>}
          <div className="admin-payout-actions">
            {ledgerQuery.data?.hasMore && ledgerQuery.data.nextCursor && <button className="admin-ops-button" type="button" disabled={ledgerQuery.isFetching} onClick={() => setLedgerCursor(ledgerQuery.data!.nextCursor ?? undefined)}>Load next 50 entries</button>}
            {ledgerCursor && <button className="admin-ops-button" type="button" disabled={ledgerQuery.isFetching} onClick={() => setLedgerCursor(undefined)}>Restart day</button>}
          </div>
        </section>}
        {focus === "ledger" && <div className="admin-ops-note"><CircleDollarSign size={16} /><span>Amounts are formatted from the configured currency scale and the ledger’s stored minor-unit integer. The ledger view is read-only.</span></div>}
      </>}
    </ToolPage>
  );
}


export function AdminManualPayouts() {
  const payoutQuery = trpc.adminOperations.payoutRequests.useQuery(undefined, { refetchInterval: 5_000 });
  const resolvePayout = trpc.adminOperations.resolvePayoutRequest.useMutation({ onSuccess: () => { payoutQuery.refetch(); } });
  const [payoutDrafts, setPayoutDrafts] = useState<Record<number, { externalReference: string; note: string }>>({});
  const currencyQuery = trpc.adminOperations.currencies.useQuery(undefined, { staleTime: 60_000 });
  const currencies = (currencyQuery.data ?? []) as unknown as Array<{ code: string; scale: number }>;
  const scales = new Map(currencies.map((currency) => [currency.code.toUpperCase(), Math.max(0, Math.min(8, Number(currency.scale) || 0))]));
  const formatAmount = (amountMinor: number, currency: string) => {
    const code = currency.toUpperCase();
    const scale = scales.get(code) ?? 2;
    const value = Number(amountMinor) / (10 ** scale);
    return `${code} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: scale, maximumFractionDigits: scale }).format(value)}`;
  };

  return (
    <ToolPage eyebrow="Manual payout review" title="Manual Payouts" description="Review pending customer payout requests and record a manual outcome. No external bank or blockchain transfer is initiated here." icon={CircleDollarSign} action={<button className="admin-ops-button" type="button" onClick={() => payoutQuery.refetch()} disabled={payoutQuery.isFetching}><RefreshCw size={14} /> Refresh</button>}>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head">
            <div><span className="admin-ops-kicker">Manual payout processing</span><h2>Customer payout requests</h2></div>
            <span className="admin-ops-subtle">{((payoutQuery.data || []) as any[]).filter((request) => request.status === "pending").length} pending</span>
          </div>
          <div className="admin-ops-note"><ShieldCheck size={16} /><span>Funds were reserved when the request was created. Mark a request paid only after independently confirming the external transfer and entering its reference. Arbitrade does not send transfers from this screen.</span></div>
          {resolvePayout.error && <div className="admin-ops-empty error">{resolvePayout.error.message}</div>}
          {payoutQuery.isLoading ? <LoadingState /> : payoutQuery.isError ? <div className="admin-ops-empty error">Payout requests could not be loaded.</div> : <>
            {!(payoutQuery.data || []).some((request: any) => request.status === "pending") ? <div className="admin-ops-empty compact">No payout requests are awaiting review.</div> : <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Customer payout requests">
              <table className="admin-ops-table"><thead><tr><th>Customer / reference</th><th>Requested amount</th><th>Destination details</th><th>External reference / note</th><th>Resolution</th></tr></thead>
                <tbody>{((payoutQuery.data || []) as any[]).filter((request) => request.status === "pending").map((request) => {
                  const draft = payoutDrafts[request.id] || { externalReference: "", note: "" };
                  return <tr key={request.id}>
                    <td><strong>{request.customerName || request.customerEmail || `Account ${request.userId}`}</strong><small>{request.requestReference}</small><small>{request.destinationType === "bank_transfer" ? "Bank transfer" : "Crypto wallet transfer"}</small></td>
                    <td>{formatAmount(Number(request.amountMinor), request.currency)}</td>
                    <td><div className="admin-payout-destination">{request.destinationDetails}</div></td>
                    <td>
                      <input aria-label={`External transfer reference for ${request.requestReference}`} value={draft.externalReference} onChange={(event) => setPayoutDrafts((current) => ({ ...current, [request.id]: { ...draft, externalReference: event.target.value } }))} placeholder="External reference (required)" />
                      <textarea aria-label={`Resolution note for ${request.requestReference}`} rows={2} value={draft.note} onChange={(event) => setPayoutDrafts((current) => ({ ...current, [request.id]: { ...draft, note: event.target.value } }))} placeholder="Note; required for rejection" />
                    </td>
                    <td><div className="admin-payout-actions">
                      <button className="admin-ops-button" type="button" disabled={resolvePayout.isPending || draft.externalReference.trim().length < 3} onClick={() => resolvePayout.mutate({ requestId: Number(request.id), action: "paid", externalReference: draft.externalReference.trim(), note: draft.note.trim() || undefined })}><CheckCircle2 size={14} /> Mark paid</button>
                      <button className="admin-ops-button" type="button" disabled={resolvePayout.isPending || !draft.note.trim()} onClick={() => resolvePayout.mutate({ requestId: Number(request.id), action: "rejected", note: draft.note.trim() })}><XCircle size={14} /> Reject and release</button>
                    </div></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>}
            <div className="admin-ops-panel-head admin-payout-history-head"><div><span className="admin-ops-kicker">Recent outcomes</span><h2>Payout history</h2></div></div>
            <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Payout request history">
              <table className="admin-ops-table"><thead><tr><th>Created</th><th>Customer</th><th>Request</th><th>Amount</th><th>Status / external reference</th></tr></thead><tbody>
                {((payoutQuery.data || []) as any[]).map((request) => <tr key={request.id}>
                  <td>{timestamp(request.createdAt)}</td>
                  <td><strong>{request.customerName || "Customer"}</strong><small>{request.customerEmail || `Account ${request.userId}`}</small></td>
                  <td><small>{request.requestReference}</small><small>{request.destinationType === "bank_transfer" ? "Bank transfer" : "Crypto transfer"}</small></td>
                  <td>{formatAmount(Number(request.amountMinor), request.currency)}</td>
                  <td><span className="admin-ops-entry-type">{request.status}</span>{request.externalReference && <small>External: {request.externalReference}</small>}{request.resolutionNote && <small>{request.resolutionNote}</small>}</td>
                </tr>)}
                {!(payoutQuery.data || []).length && <tr><td colSpan={5} className="admin-ops-table-empty">No payout history is available.</td></tr>}
              </tbody></table>
            </div>
          </>}
        </section>
    </ToolPage>
  );
}

function csvCell(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const csv = [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}


function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AdminReportsExports() {
  const customersQuery = trpc.adminOperations.customers.useQuery(undefined, { staleTime: 15_000 });
  const auditQuery = trpc.adminOperations.audit.useQuery(undefined, { staleTime: 15_000 });
  const customers = (customersQuery.data ?? []) as unknown as CustomerRecord[];
  const audit = (auditQuery.data ?? []) as unknown as Array<Record<string, unknown> & { id: number; createdAt?: Date | string; action?: string; actorUserId?: number | null; entityType?: string; entityId?: number | string | null; reason?: string | null }>;
  const loading = customersQuery.isLoading || auditQuery.isLoading;
  const error = customersQuery.isError || auditQuery.isError;
  const customerExport = customers.map((row) => ({ id: row.id, name: row.name, email: row.email, package: row.package, accountState: row.accountState || row.status, emailVerified: row.emailVerified, kycRequired: row.kyc, riskTier: row.riskTier, createdAt: row.createdAt }));
  const auditExport = audit.map((row) => ({ id: row.id, createdAt: row.createdAt, action: row.action, actorUserId: row.actorUserId, entityType: row.entityType, entityId: row.entityId, reason: row.reason }));
  const totalRecords = customers.length + audit.length;

  return (
    <ToolPage eyebrow="Operational reporting" title="Reports & exports" description="Download admin-visible customer and audit records as CSV files. Customer wallet activity is available only in Database Entries with one customer and one UTC day selected." icon={Download}>
      {error && <div className="admin-ops-empty error">One or more report datasets could not be loaded. Retry after checking database availability.</div>}
      {loading ? <LoadingState /> : <>
        <section className="admin-ops-metrics compact-metrics">
          <Metric label="Customer records" value={customers.length} icon={Users} />
          <Metric label="Audit events" value={audit.length} icon={ShieldCheck} />
          <Metric label="Available records" value={totalRecords} icon={FileText} />
        </section>
        <section className="admin-ops-export-grid">
          <article className="admin-ops-export-card"><span className="admin-ops-export-icon"><Users size={18} /></span><div><strong>Customer register</strong><p>Customer identity, package, account state, verification controls and risk tier.</p><small>{customers.length} records available</small></div><button className="admin-ops-button" type="button" disabled={!customerExport.length} onClick={() => downloadCsv("arbitrade-customers.csv", customerExport)}><Download size={14} /> Export CSV</button></article>
          <article className="admin-ops-export-card"><span className="admin-ops-export-icon"><ShieldCheck size={18} /></span><div><strong>Admin audit log</strong><p>Recorded administrative actions and their entity references.</p><small>{audit.length} records available</small></div><button className="admin-ops-button" type="button" disabled={!auditExport.length} onClick={() => downloadCsv("arbitrade-admin-audit.csv", auditExport)}><Download size={14} /> Export CSV</button></article>
        </section>
        {!totalRecords && <div className="admin-ops-empty compact">No report rows are available yet.</div>}
        <div className="admin-ops-note"><ShieldCheck size={16} /><span>Exports require an authenticated administrator session. CSV values that could be interpreted as spreadsheet formulas are escaped. Wallet activity is deliberately excluded from all-customer exports; inspect one customer and one UTC day at a time in Database Entries.</span></div>
      </>}
    </ToolPage>
  );
}


type WorkerHealthEntry = {
  workerKey: string;
  displayName: string;
  description: string;
  expectedIntervalMs: number;
  staleAfterMs: number;
  instanceId: string;
  status: "running" | "healthy" | "degraded" | "stale" | "not_started";
  healthRecordAvailable: boolean;
  heartbeatAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastDurationMs: number | null;
  consecutiveFailures: number;
  lastError: string | null;
  lastErrorCode: string | null;
};

type DeadQualificationJob = {
  id: number;
  userId: number;
  sourceLedgerId: number;
  attempts: number;
  lastError: string | null;
  lastErrorCode: string | null;
  updatedAt: string | null;
};

type QualificationQueueDiagnostics = {
  backlog: number;
  oldestPendingCreatedAt: string | null;
  oldestPendingAgeMs: number | null;
  oldestProcessingLease: { leaseOwner: null; lockedAt: string | null; expiresAt: string | null; stale: boolean | null } | null;
};

type WorkerHealthData = {
  generatedAt: string;
  workers: WorkerHealthEntry[];
  qualificationQueue: { pending: number; processing: number; completed: number; dead: number; total: number } | null;
  qualificationQueueDiagnostics: QualificationQueueDiagnostics | null;
  deadQualificationJobs: DeadQualificationJob[] | null;
};

function workerStatusTone(status: WorkerHealthEntry["status"]): "neutral" | "good" | "watch" | "high" {
  if (status === "healthy") return "good";
  if (status === "running") return "neutral";
  if (status === "degraded" || status === "not_started") return "high";
  return "watch";
}

function workerStatusLabel(status: WorkerHealthEntry["status"]): string {
  return status === "not_started" ? "Not started" : status === "stale" ? "Stale heartbeat" : status[0].toUpperCase() + status.slice(1);
}

type DiagnosticSnapshot = {
  generatedAt: string;
  overallStatus: string;
  summary: { pass: number; warning: number; fail: number; not_run: number };
  checks: Array<{ id: string; area: string; status: "pass" | "warning" | "fail" | "not_run"; title: string; detail: string; recommendation: string | null }>;
};

function diagnosticSeverity(check: DiagnosticSnapshot["checks"][number]) {
  if (check.status === "fail") return check.area === "database" || check.area === "configuration" ? "Critical" : "High";
  if (check.status === "warning") return "Medium";
  if (check.status === "not_run") return "Low";
  return "Informational";
}

function diagnosticFeatureState(feature: { label: string; status: string; sourceFiles?: Array<{ present: boolean }> }, checks: DiagnosticSnapshot["checks"]) {
  if (feature.status === "source_incomplete" || feature.sourceFiles?.some((file) => !file.present)) return "Not Working";
  const terms = feature.label.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 3);
  const related = checks.filter((item) => item.status !== "pass" && terms.some((term) =>
    (item.title + " " + item.detail + " " + item.area).toLowerCase().includes(term)
  ));
  if (related.some((item) => item.status === "fail")) return "Degraded";
  // Source presence is not runtime acceptance. Do not label a feature working without
  // an authenticated feature-level test result from the deployed revision.
  return "Not Verified";
}

function escapeReportHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function downloadDiagnosticsCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((value) => '"' + String(value ?? "").replace(/"/g, '""') + '"').join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AdminWorkerHealth() {
  const query = trpc.adminOperations.workerHealth.useQuery(undefined, { refetchInterval: 15_000, refetchOnWindowFocus: true });
  const exportQuery = trpc.adminOperations.systemDiagnostics.useQuery(undefined, { enabled: true, retry: false, staleTime: 60_000, refetchOnWindowFocus: false });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [verification, setVerification] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ generatedAt: string; overallStatus: string; pass: number; warning: number; fail: number; not_run: number }>>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("arbitrade-diagnostic-history-v1") || "[]");
      return Array.isArray(saved) ? saved.slice(0, 30) : [];
    } catch { return []; }
  });

  const rememberSnapshot = (report: any) => {
    const next = [{
      generatedAt: report.generatedAt,
      overallStatus: report.overallStatus,
      pass: report.summary?.pass ?? 0,
      warning: report.summary?.warning ?? 0,
      fail: report.summary?.fail ?? 0,
      not_run: report.summary?.not_run ?? 0,
    }, ...history.filter((item) => item.generatedAt !== report.generatedAt)].slice(0, 30);
    setHistory(next);
    try { window.localStorage.setItem("arbitrade-diagnostic-history-v1", JSON.stringify(next)); } catch { /* Browser storage may be disabled or full. */ }
  };

  const fetchReport = async () => {
    const result = await exportQuery.refetch();
    if (result.error || !result.data) throw result.error ?? new Error("The diagnostics report returned no data.");
    return result.data as any;
  };

  const exportReport = async (format: "json" | "csv" | "pdf") => {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    const printWindow = format === "pdf" ? window.open("", "_blank") : null;
    if (format === "pdf" && !printWindow) {
      setExportError("The PDF print window was blocked. Allow pop-ups for this site and try again.");
      setExporting(false);
      return;
    }
    try {
      const report = await fetchReport();
      rememberSnapshot(report);
      const workerRows = (report.workerHealth?.workers ?? []).map((worker: any) => {
        const recordAvailable = worker.healthRecordAvailable === true;
        const runtimeRecord = recordAvailable ? "Recorded" : "Unavailable";
        return {
          ...worker,
          runtimeRecord,
          reportLabel: `${worker.displayName} (runtime record: ${runtimeRecord})`,
          heartbeatAt: recordAvailable ? worker.heartbeatAt ?? "Not recorded" : "Unavailable",
          lastAttemptAt: recordAvailable ? worker.lastAttemptAt ?? "Not recorded" : "Unavailable",
          lastSuccessAt: recordAvailable ? worker.lastSuccessAt ?? "Not recorded" : "Unavailable",
          consecutiveFailures: recordAvailable ? worker.consecutiveFailures ?? "Not recorded" : "Unavailable",
          lastErrorCode: recordAvailable ? worker.lastErrorCode ?? "—" : "Unavailable",
        };
      });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      if (format === "json") {
        downloadJson("arbitrade-full-system-diagnostics-" + stamp + ".json", report);
      } else if (format === "csv") {
        const rows: string[][] = [
          ["Severity", "Status", "Area", "Check", "Finding", "Recommended correction"],
          ...(report.checks ?? []).map((item: any) => [diagnosticSeverity(item), item.status, item.area, item.title, item.detail, item.recommendation ?? ""]),
          [],
          ["Feature", "Status", "Evidence note"],
          ...(report.featureCoverage ?? []).map((feature: any) => [feature.label, diagnosticFeatureState(feature, report.checks ?? []), feature.note ?? ""]),
          [],
          ["Worker", "Runtime record", "Status", "Instance", "Heartbeat", "Last attempt", "Last success", "Failures", "Safe error code"],
          ...workerRows.map((worker: any) => [worker.displayName, worker.runtimeRecord, worker.status, worker.instanceId, worker.heartbeatAt, worker.lastAttemptAt, worker.lastSuccessAt, worker.consecutiveFailures, worker.lastErrorCode]),
          [],
          ["Source file", "Code area", "Bytes", "Test file"],
          ...(report.sourceInventory?.files ?? []).map((file: any) => [file.path, file.area, file.bytes, file.testFile ? "Yes" : "No"]),
          [],
          ["Review marker file", "Line", "Marker"],
          ...(report.sourceInventory?.reviewMarkers ?? []).map((marker: any) => [marker.path, marker.line, marker.marker]),
          [],
          ["Runtime metric", "Value"],
          ["Application version", report.application?.version ?? ""],
          ["Source revision", report.application?.sourceRevision ?? ""],
          ["Node version", report.server?.nodeVersion ?? ""],
          ["Platform", report.server?.platform ?? ""],
          ["Architecture", report.server?.architecture ?? ""],
          ["Uptime seconds", report.server?.uptimeSeconds ?? ""],
          ["CPU cores", report.server?.cpuCount ?? ""],
          ["CPU load average (1m, 5m, 15m)", JSON.stringify(report.server?.cpuLoadAverage ?? [])],
          ["System total memory bytes", report.server?.totalMemoryBytes ?? ""],
          ["System free memory bytes", report.server?.freeMemoryBytes ?? ""],
          ["Heap used percent", report.server?.heapUsePercent ?? ""],
          ["Process memory bytes", JSON.stringify(report.server?.memoryBytes ?? {})],
          ["Database status", report.database?.status ?? ""],
          ["Database tables checked", report.database?.schema?.checked ? "Yes" : "No"],
          ["Database tables available", (report.database?.schema?.available ?? []).join("; ")],
          ["Database tables missing", (report.database?.schema?.missing ?? []).join("; ")],
          [],
          ["Required configuration variable", "Configured"],
          ...(report.configuration?.requiredVariables ?? []).map((variable: any) => [variable.name, variable.configured ? "Yes" : "No"]),
          [],
          ["Recommended correction"],
          ...(report.recommendations ?? []).map((recommendation: string) => [recommendation]),
        ];
        downloadDiagnosticsCsv("arbitrade-system-diagnostics-" + stamp + ".csv", rows);
      } else {
        if (!printWindow) throw new Error("The PDF print window is unavailable.");
        const checks = (report.checks ?? []).map((item: any) => `<tr><td>${escapeReportHtml(diagnosticSeverity(item))}</td><td>${escapeReportHtml(item.status)}</td><td>${escapeReportHtml(item.area)}</td><td><strong>${escapeReportHtml(item.title)}</strong><br>${escapeReportHtml(item.detail)}${item.recommendation ? `<br><em>Action: ${escapeReportHtml(item.recommendation)}</em>` : ""}</td></tr>`).join("");
        const features = (report.featureCoverage ?? []).map((feature: any) => `<tr><td>${escapeReportHtml(feature.label)}</td><td>${escapeReportHtml(diagnosticFeatureState(feature, report.checks ?? []))}</td><td>${escapeReportHtml(feature.note)}</td></tr>`).join("");
        const workers = workerRows.map((worker: any) => `<tr><td>${escapeReportHtml(worker.reportLabel)}</td><td>${escapeReportHtml(worker.status)}</td><td>${escapeReportHtml(worker.instanceId)}</td><td>${escapeReportHtml(worker.heartbeatAt ?? "—")}</td><td>${escapeReportHtml(worker.lastAttemptAt ?? "—")}</td><td>${escapeReportHtml(worker.lastSuccessAt ?? "—")}</td><td>${escapeReportHtml(worker.consecutiveFailures ?? "Unavailable")}</td><td>${escapeReportHtml(worker.lastErrorCode ?? "—")}</td></tr>`).join("");
        const sourceFiles = (report.sourceInventory?.files ?? []).map((file: any) => `<tr><td>${escapeReportHtml(file.path)}</td><td>${escapeReportHtml(file.area)}</td><td>${escapeReportHtml(file.bytes)}</td><td>${file.testFile ? "Yes" : "No"}</td></tr>`).join("");
        const markers = (report.sourceInventory?.reviewMarkers ?? []).map((marker: any) => `<tr><td>${escapeReportHtml(marker.path)}</td><td>${escapeReportHtml(marker.line)}</td><td>${escapeReportHtml(marker.marker)}</td></tr>`).join("");
        const recommendations = (report.recommendations ?? []).map((item: string) => `<li>${escapeReportHtml(item)}</li>`).join("");
        printWindow.document.write(`<!doctype html><html><head><title>Arbitrade System Diagnostics</title><style>body{font:12px Arial,sans-serif;color:#172033;margin:28px}h1{font-size:22px}h2{font-size:16px;margin-top:24px}.meta{color:#526078}table{width:100%;border-collapse:collapse;margin:12px 0 20px}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left;vertical-align:top}th{background:#eef2f7}em{display:block;margin-top:5px;color:#475569}.summary{display:flex;gap:18px;flex-wrap:wrap;margin:14px 0}.summary b{font-size:18px}footer{margin-top:24px;color:#64748b}@media print{body{margin:12mm}tr{break-inside:avoid}}</style></head><body><h1>Arbitrade — Full System Diagnostics</h1><p class="meta">Generated: ${escapeReportHtml(report.generatedAt)} · Revision: ${escapeReportHtml(report.application?.sourceRevision || "Not supplied")} · Overall: ${escapeReportHtml(report.overallStatus)}</p><div class="summary"><span>Critical/High findings: <b>${(report.summary?.fail ?? 0)}</b></span><span>Warnings: <b>${(report.summary?.warning ?? 0)}</b></span><span>Not run: <b>${(report.summary?.not_run ?? 0)}</b></span><span>Passed: <b>${(report.summary?.pass ?? 0)}</b></span></div><h2>Detected issues and corrective actions</h2><table><thead><tr><th>Severity</th><th>Status</th><th>Area</th><th>Finding and recommended correction</th></tr></thead><tbody>${checks}</tbody></table><h2>Feature health assessment</h2><p>“Not Verified” means source files are present but live feature acceptance has not been proven by this diagnostic.</p><table><thead><tr><th>Feature</th><th>Assessment</th><th>Evidence</th></tr></thead><tbody>${features}</tbody></table><h2>Server and database details</h2><table><tbody><tr><th>Node / platform</th><td>${escapeReportHtml(report.server?.nodeVersion)} / ${escapeReportHtml(report.server?.platform)} (${escapeReportHtml(report.server?.architecture)})</td></tr><tr><th>Uptime / process</th><td>${escapeReportHtml(report.server?.uptimeSeconds)} seconds / PID ${escapeReportHtml(report.server?.pid)}</td></tr><tr><th>CPU cores / load avg (1m, 5m, 15m)</th><td>${escapeReportHtml(report.server?.cpuCount)} / ${escapeReportHtml(JSON.stringify(report.server?.cpuLoadAverage ?? []))}</td></tr><tr><th>System RAM total / free</th><td>${escapeReportHtml(report.server?.totalMemoryBytes)} / ${escapeReportHtml(report.server?.freeMemoryBytes)} bytes</td></tr><tr><th>Process memory bytes</th><td>${escapeReportHtml(JSON.stringify(report.server?.memoryBytes ?? {}))}</td></tr><tr><th>Database</th><td>${escapeReportHtml(report.database?.status)} · checked ${escapeReportHtml(report.database?.checkedAt ?? report.generatedAt)}</td></tr><tr><th>Available tables</th><td>${escapeReportHtml((report.database?.schema?.available ?? []).join(", "))}</td></tr><tr><th>Missing tables</th><td>${escapeReportHtml((report.database?.schema?.missing ?? []).join(", ") || "None reported")}</td></tr></tbody></table><h2>Worker detail</h2><table><thead><tr><th>Worker</th><th>Status</th><th>Instance</th><th>Heartbeat</th><th>Last attempt</th><th>Last success</th><th>Failures</th><th>Safe error code</th></tr></thead><tbody>${workers}</tbody></table><h2>Source inventory (${escapeReportHtml(report.sourceInventory?.filesScanned ?? 0)} files)</h2><p>Scan complete: ${escapeReportHtml(report.sourceInventory?.complete ? "Yes" : "No")} · Test files: ${escapeReportHtml(report.sourceInventory?.testFiles ?? 0)} · Total bytes: ${escapeReportHtml(report.sourceInventory?.totalBytes ?? 0)}</p><table><thead><tr><th>Source path</th><th>Area</th><th>Bytes</th><th>Test</th></tr></thead><tbody>${sourceFiles}</tbody></table><h2>Potential source review markers</h2><table><thead><tr><th>File</th><th>Line</th><th>Marker</th></tr></thead><tbody>${markers}</tbody></table><h2>Recommended corrections</h2><ul>${recommendations}</ul><h2>Deployment readiness</h2><p>${escapeReportHtml(report.overallStatus)} — ${(report.summary?.fail ?? 0) ? "Do not treat this deployment as ready until critical/high findings are corrected and rechecked." : (report.summary?.warning ?? 0) || (report.summary?.not_run ?? 0) ? "Review warnings and complete checks not run before release." : "No issues were detected by the checks that ran; complete CI and hosted acceptance before production sign-off."}</p><h2>Required configuration presence (values redacted)</h2><ul>${(report.configuration?.requiredVariables ?? []).map((item: any) => `<li>${escapeReportHtml(item.name)}: ${item.configured ? "Configured" : "Missing"}</li>`).join("")}</ul><h2>Scope and limitations</h2><ul>${(report.scope?.limitations ?? []).map((item: string) => `<li>${escapeReportHtml(item)}</li>`).join("")}</ul><footer>Read-only diagnostic snapshot. Recommendations do not modify production code or database records.</footer></body></html>`);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
      }
    } catch (error) {
      if (printWindow && !printWindow.closed) printWindow.close();
      setExportError(error instanceof Error ? error.message : "The diagnostics report could not be generated.");
    } finally {
      setExporting(false);
    }
  };

  const verifyAfterFix = async () => {
    if (exporting) return;
    setExporting(true);
    setVerification(null);
    setExportError(null);
    try {
      const previous = history[0];
      const report = await fetchReport();
      rememberSnapshot(report);
      if (!previous) {
        setVerification("Baseline saved. Apply a correction, then run verification again to compare the result.");
      } else {
        const before = previous.fail + previous.warning;
        const after = (report.summary?.fail ?? 0) + (report.summary?.warning ?? 0);
        const delta = before - after;
        setVerification(delta > 0
          ? `Verification improved: ${delta} fewer failed/warning checks than the previous saved snapshot.`
          : delta < 0
            ? `Verification regressed: ${Math.abs(delta)} more failed/warning checks than the previous saved snapshot.`
            : "Verification complete: failed/warning check count is unchanged. Review individual check statuses for movement.");
      }
      await query.refetch();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Post-fix verification failed.");
    } finally { setExporting(false); }
  };

  const data = (query.data ?? {}) as unknown as WorkerHealthData;
  const workers = data.workers ?? [];
  const recordedWorkers = workers.filter((worker) => worker.healthRecordAvailable);
  const healthy = recordedWorkers.filter((worker) => worker.status === "healthy").length;
  const attention = recordedWorkers.filter((worker) => worker.status === "degraded" || worker.status === "stale").length;
  const queue = data.qualificationQueue;
  const queueDiagnostics = data.qualificationQueueDiagnostics;
  const [recoveryReasons, setRecoveryReasons] = useState<Record<number, string>>({});
  const [lastRequeuedJobId, setLastRequeuedJobId] = useState<number | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const retryMutation = trpc.adminOperations.requeueDeadQualificationJob.useMutation({
    onSuccess: (result, variables) => {
      setRecoveryReasons((current) => ({ ...current, [variables.jobId]: "" }));
      setLastRequeuedJobId(result.jobId);
      setRecoveryError(null);
      void query.refetch();
    },
    onError: (error) => { setRecoveryError(error.message); setLastRequeuedJobId(null); },
  });
  const refresh = () => { void Promise.all([query.refetch(), exportQuery.refetch()]); };
  const retryJob = (job: DeadQualificationJob) => {
    const reason = (recoveryReasons[job.id] ?? "").trim();
    if (reason.length < 8 || reason.length > 500 || retryMutation.isPending) return;
    setRecoveryError(null);
    setLastRequeuedJobId(null);
    retryMutation.mutate({ jobId: job.id, reason });
  };

  return (
    <ToolPage
      eyebrow="Trading operations"
      title="Worker health & recovery"
      description="Live server worker health, issue severity, application coverage, deployment readiness and post-fix verification. All assessments are read-only."
      icon={Activity}
      action={<>
        <button className="admin-ops-button" type="button" onClick={refresh} disabled={query.isFetching}><RefreshCw size={14} /> Refresh</button>
        <button className="admin-ops-button" type="button" onClick={() => void exportReport("json")} disabled={exporting}><Download size={14} /> JSON</button>
        <button className="admin-ops-button" type="button" onClick={() => void exportReport("csv")} disabled={exporting}><Download size={14} /> Excel / CSV</button>
        <button className="admin-ops-button" type="button" onClick={() => void exportReport("pdf")} disabled={exporting}><FileText size={14} /> Print / PDF</button>
        <button className="admin-ops-button" type="button" onClick={() => void verifyAfterFix()} disabled={exporting}><CheckCircle2 size={14} /> {exporting ? "Checking…" : "Verify after fix"}</button>
      </>}
    >
      <div className="admin-ops-meta-line"><span><Activity size={14} /> Auto-refresh every 15 seconds</span><span>Snapshot {timestamp(data.generatedAt)}</span></div>
      <div className="admin-ops-note"><Activity size={16} /><span><strong>Configured is not running</strong> Worker definitions describe expected services; only persisted attempts, heartbeats and queue timestamps are runtime evidence.</span></div>
      {exportError && <div className="admin-ops-empty error" role="alert">{exportError}</div>}
      {verification && <div className="admin-ops-note" role="status"><CheckCircle2 size={16} /><span><strong>Post-fix comparison</strong> {verification}</span></div>}
      <div className="admin-ops-note"><Download size={16} /><span><strong>Complete diagnostic exports</strong> JSON contains the full structured report; Excel/CSV exports checks and feature assessments; Print/PDF opens a print-ready report that can be saved as PDF. Snapshots are retained locally in this administrator's browser only. No secrets are exported.</span></div>

      {exportQuery.data && <section className="admin-ops-panel">
        <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">System health overview</span><h2>Latest full-system assessment</h2></div><span className="admin-ops-subtle">{exportQuery.data.overallStatus?.replaceAll("_", " ") ?? "Not checked"}</span></div>
        <section className="admin-ops-metrics compact-metrics">
          <Metric label="Critical / high findings" value={exportQuery.data.summary?.fail ?? "—"} detail="Failed diagnostic checks" icon={AlertTriangle} />
          <Metric label="Warnings" value={exportQuery.data.summary?.warning ?? "—"} icon={AlertTriangle} />
          <Metric label="Checks not run" value={exportQuery.data.summary?.not_run ?? "—"} icon={Clock3} />
          <Metric label="Passed checks" value={exportQuery.data.summary?.pass ?? "—"} icon={CheckCircle2} />
          <Metric label="Persisted worker records" value={exportQuery.data.workerHealth?.workers ? exportQuery.data.workerHealth.workers.filter((worker: any) => worker.healthRecordAvailable).length : "Unavailable"} icon={Activity} />
          <Metric label="Dead-letter jobs" value={exportQuery.data.workerHealth?.qualificationQueue?.dead ?? "Unavailable"} icon={AlertTriangle} />
          <Metric label="Database" value={exportQuery.data.database?.status ?? "Unavailable"} icon={ShieldCheck} />
          <Metric label="Heap used" value={exportQuery.data.server?.heapUsePercent == null ? "Unavailable" : exportQuery.data.server.heapUsePercent + "%"} detail={exportQuery.data.server?.cpuCount == null ? "CPU data unavailable" : exportQuery.data.server.cpuCount + " CPU cores"} icon={Activity} />
          <Metric label="CPU load average" value={exportQuery.data.server?.cpuLoadAverage?.length ? exportQuery.data.server.cpuLoadAverage.map((value: number) => value.toFixed(2)).join(" / ") : "Unavailable"} detail="1 / 5 / 15 minutes" icon={Activity} />
          <Metric label="System RAM free" value={exportQuery.data.server?.freeMemoryBytes == null ? "Unavailable" : (exportQuery.data.server.freeMemoryBytes / (1024 ** 3)).toFixed(2) + " GB"} detail={exportQuery.data.server?.totalMemoryBytes == null ? "Total memory unavailable" : "of " + (exportQuery.data.server.totalMemoryBytes / (1024 ** 3)).toFixed(2) + " GB"} icon={Activity} />
          <Metric label="Application version" value={exportQuery.data.application?.version ?? "Unknown"} detail={exportQuery.data.application?.sourceRevision ?? "Revision not supplied"} icon={FileText} />
          <Metric label="Last full check" value={timestamp(exportQuery.data.generatedAt)} icon={CalendarClock} />
        </section>
        <div className="admin-ops-note"><ShieldCheck size={16} /><span><strong>Deployment readiness</strong> {exportQuery.data.summary?.fail ? "Not ready: correct failed checks before deployment." : exportQuery.data.summary?.warning || exportQuery.data.summary?.not_run ? "Review required: warnings and checks not run must be resolved or explicitly accepted before release." : "No issues detected by checks that ran. CI and hosted feature acceptance are still required for sign-off."}</span></div>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Feature-by-feature assessment</span><h2>Application feature health</h2></div></div>
          <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Application feature health"><table className="admin-ops-table"><thead><tr><th>Feature</th><th>Assessment</th><th>Evidence</th></tr></thead><tbody>
            {(exportQuery.data.featureCoverage ?? []).map((feature: any) => <tr key={feature.key}><td><strong>{feature.label}</strong></td><td><StatusPill tone={diagnosticFeatureState(feature, exportQuery.data.checks ?? []) === "Not Working" ? "high" : diagnosticFeatureState(feature, exportQuery.data.checks ?? []) === "Degraded" ? "watch" : "neutral"}>{diagnosticFeatureState(feature, exportQuery.data.checks ?? [])}</StatusPill></td><td>{feature.note}</td></tr>)}
          </tbody></table></div>
        </section>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Automatic issue detection</span><h2>Findings and recommended corrections</h2></div><span className="admin-ops-subtle">{(exportQuery.data.findings ?? []).length} findings</span></div>
          <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Detected issues"><table className="admin-ops-table"><thead><tr><th>Severity</th><th>Finding</th><th>Recommended correction</th></tr></thead><tbody>
            {(exportQuery.data.findings ?? []).map((item: any) => <tr key={item.id}><td><StatusPill tone={diagnosticSeverity(item) === "Critical" || diagnosticSeverity(item) === "High" ? "high" : diagnosticSeverity(item) === "Medium" ? "watch" : "neutral"}>{diagnosticSeverity(item)}</StatusPill></td><td><strong>{item.title}</strong><small>{item.area} · {item.status}</small>{item.detail}</td><td>{item.recommendation || "No automated recommendation. Review the evidence manually."}</td></tr>)}
            {!exportQuery.data.findings?.length && <tr><td colSpan={3} className="admin-ops-table-empty">No issues were detected by the checks that ran.</td></tr>}
          </tbody></table></div>
        </section>
      </section>}

      {history.length > 0 && <section className="admin-ops-panel">
        <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Historical snapshots</span><h2>Diagnostic trend</h2></div><span className="admin-ops-subtle">Latest {history.length} on this browser</span></div>
        <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Diagnostic history"><table className="admin-ops-table"><thead><tr><th>Generated</th><th>Overall status</th><th>Failed</th><th>Warnings</th><th>Not run</th><th>Passed</th></tr></thead><tbody>
          {history.map((item) => <tr key={item.generatedAt}><td>{timestamp(item.generatedAt)}</td><td>{item.overallStatus.replaceAll("_", " ")}</td><td>{item.fail}</td><td>{item.warning}</td><td>{item.not_run}</td><td>{item.pass}</td></tr>)}
        </tbody></table></div>
      </section>}

      {query.isLoading ? <LoadingState /> : query.isError ? (
        <div className="admin-ops-empty error" role="alert">Worker health could not be loaded. Verify migration 0084 and the database connection; an unavailable monitor must not be interpreted as a healthy worker.</div>
      ) : <>
        <section className="admin-ops-metrics">
          <Metric label="Worker records" value={recordedWorkers.length} detail={`${workers.length - recordedWorkers.length} configured definitions without a runtime record`} icon={Activity} />
          <Metric label="Healthy workers" value={recordedWorkers.length ? healthy : "Unavailable"} detail="A health record is required to count a worker as healthy" icon={CheckCircle2} />
          <Metric label="Needs attention" value={recordedWorkers.length ? attention : "Unavailable"} detail={`${workers.filter((worker) => !worker.healthRecordAvailable).length} configured definitions have no recent health record`} icon={AlertTriangle} />
          <Metric label="Dead-lettered qualification jobs" value={queue === null ? "Unavailable" : queue.dead.toLocaleString()} detail="Requires operator review" icon={FileText} />
        </section>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Background services</span><h2>Worker status</h2></div><span className="admin-ops-subtle">{workers.length} rows</span></div>
          <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Background worker health"><table className="admin-ops-table"><thead><tr><th>Worker</th><th>Status</th><th>Instance</th><th>Last heartbeat</th><th>Last attempt started</th><th>Last success</th><th>Failures</th><th>Last cycle</th><th>Safe error code</th></tr></thead><tbody>
            {workers.map((worker) => <tr key={worker.workerKey + ":" + worker.instanceId}>
              <td><strong>{worker.displayName}</strong><small>{worker.description}</small><small>Expected interval: {Math.max(1, Math.round(worker.expectedIntervalMs / 1000))} seconds</small></td>
              <td><StatusPill tone={workerStatusTone(worker.status)}>{workerStatusLabel(worker.status)}</StatusPill></td>
              <td><code>{worker.instanceId}</code></td><td>{worker.healthRecordAvailable ? timestamp(worker.heartbeatAt) : "Unavailable"}</td><td>{worker.healthRecordAvailable ? worker.lastAttemptAt ? timestamp(worker.lastAttemptAt) : "Unavailable" : "Unavailable"}</td><td>{worker.healthRecordAvailable ? timestamp(worker.lastSuccessAt) : "Unavailable"}</td>
              <td>{worker.healthRecordAvailable ? worker.consecutiveFailures : "Unavailable"}</td><td>{worker.healthRecordAvailable && worker.lastDurationMs !== null ? worker.lastDurationMs.toLocaleString() + " ms" : "Unavailable"}</td><td>{worker.healthRecordAvailable ? worker.lastErrorCode || "—" : "Unavailable"}</td>
            </tr>)}
            {!workers.length && <tr><td colSpan={9} className="admin-ops-table-empty">No worker records are available yet.</td></tr>}
          </tbody></table></div>
        </section>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Durable qualification queue</span><h2>Tier assignment jobs</h2></div></div>
          {queue === null ? <div className="admin-ops-empty">Queue counts and lag diagnostics are unavailable. Verify migration 0082 and database access; this is not an empty queue.</div> : <>
            <section className="admin-ops-metrics compact-metrics">
              <Metric label="Pending backlog" value={queueDiagnostics == null ? "Unavailable" : queueDiagnostics.backlog.toLocaleString()} icon={Clock3} />
              <Metric label="Oldest pending job age since creation" value={queueDiagnostics == null ? "Unavailable" : queueDiagnostics.oldestPendingAgeMs === null ? queueDiagnostics.backlog === 0 ? "None" : "Unavailable" : durationLabel(queueDiagnostics.oldestPendingAgeMs)} detail={queueDiagnostics?.oldestPendingCreatedAt ? `Created ${timestamp(queueDiagnostics.oldestPendingCreatedAt)}` : undefined} icon={Clock3} />
              <Metric label="Processing" value={queue.processing} icon={Activity} />
            <Metric label="Completed" value={queue.completed} icon={CheckCircle2} /><Metric label="Dead-lettered" value={queue.dead} icon={AlertTriangle} />
            </section>
            {queueDiagnostics == null ? <div className="admin-ops-empty">Queue backlog age and lease details are unavailable; queue counts alone do not prove there is no lag.</div> : queueDiagnostics.oldestProcessingLease === null ? <div className="admin-ops-note"><Activity size={16} /><span>No processing lease is currently recorded.</span></div> : queueDiagnostics.oldestProcessingLease.lockedAt === null ? <div className="admin-ops-empty">Processing jobs exist, but their lease timestamp is unavailable.</div> : <div className="admin-ops-note"><Clock3 size={16} /><span><strong>Oldest processing lease</strong> Locked {timestamp(queueDiagnostics.oldestProcessingLease.lockedAt)}; derived reclaim threshold {timestamp(queueDiagnostics.oldestProcessingLease.expiresAt)}; {queueDiagnostics.oldestProcessingLease.stale === null ? "staleness unavailable" : queueDiagnostics.oldestProcessingLease.stale ? "stale under the five-minute reclaim rule" : "within the five-minute reclaim window"}. Lease owner: not persisted by this queue.</span></div>}
          </>}
          <div className="admin-ops-note"><ShieldCheck size={16} /><span><strong>Safe recovery boundary</strong> Retry uses a guarded, audited transaction; it does not change a wallet balance, grant an entitlement directly, or force a trade settlement. A missing monitor or queue is reported as unavailable, never as zero. No generic force-complete action exists.</span></div>
        </section>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Operator recovery</span><h2>Dead-lettered qualification jobs</h2></div><span className="admin-ops-subtle">Latest 25</span></div>
          {recoveryError && <div className="admin-ops-empty error" role="alert">{recoveryError}</div>}
          {lastRequeuedJobId !== null && <div className="admin-ops-note" role="status"><CheckCircle2 size={16} /><span>Qualification job #{lastRequeuedJobId} was requeued. The background worker will process it under the normal idempotent workflow.</span></div>}
          {data.deadQualificationJobs === null ? <div className="admin-ops-empty">Dead-letter details are unavailable. Verify the qualification queue migration and database connection.</div> : data.deadQualificationJobs.length === 0 ? <div className="admin-ops-empty">No dead-lettered qualification jobs need review.</div> : (
            <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Dead-lettered qualification jobs"><table className="admin-ops-table"><thead><tr><th>Job / customer</th><th>Source ledger</th><th>Attempts</th><th>Safe error code</th><th>Last update</th><th>Audited retry</th></tr></thead><tbody>
              {data.deadQualificationJobs.map((job) => <tr key={job.id}>
                <td><strong>Job #{job.id}</strong><small>Customer ID {job.userId}</small></td><td>Ledger #{job.sourceLedgerId}</td><td>{job.attempts}</td>
                <td>{job.lastErrorCode || "—"}</td><td>{timestamp(job.updatedAt)}</td>
                <td><div className="admin-ops-actions" style={{ alignItems: "stretch", flexDirection: "column", gap: 8 }}>
                  <input type="text" aria-label={"Recovery reason for qualification job " + job.id} minLength={8} maxLength={500}
                    value={recoveryReasons[job.id] ?? ""} onChange={(event) => setRecoveryReasons((current) => ({ ...current, [job.id]: event.target.value }))}
                    placeholder="Reason for retry (min. 8 chars)" style={{ minWidth: 220, padding: "8px 10px", border: "1px solid var(--admin-ops-border, #cbd5e1)", borderRadius: 8 }} />
                  <button className="admin-ops-button" type="button" disabled={retryMutation.isPending || (recoveryReasons[job.id] ?? "").trim().length < 8} onClick={() => retryJob(job)}>
                    <RefreshCw size={14} /> {retryMutation.isPending ? "Queueing…" : "Retry job"}
                  </button>
                </div></td>
              </tr>)}
            </tbody></table></div>
          )}
          <div className="admin-ops-note"><ShieldCheck size={16} /><span>Retry requires an administrator session and a reason. The server locks the job, revalidates its original attributed ledger event, and writes the audit event in the same transaction as the queue update. Only jobs still marked dead can be retried.</span></div>
        </section>
      </>}
    </ToolPage>
  );
}
