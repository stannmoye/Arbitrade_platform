import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Download,
  FileText,
  RefreshCw,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState, type ReactNode } from "react";

type CustomerRecord = {
  id: number;
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
  const count = (loading: boolean, failed: boolean, value: unknown) => {
    if (loading) return "Loading";
    if (failed) return "Unavailable";
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed.toLocaleString() : "—";
  };
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
      <div className="admin-ops-meta-line"><span><CalendarClock size={14} /> Rolling 24-hour lifecycle window</span><span>Updated {timestamp(data.generatedAt)}</span></div>
      <section className="admin-ops-metrics">
        <Metric label="Global allocation gate" value={allocationState} detail="Open means new allocations are not paused" icon={Activity} />
        <Metric label="Enabled package policies" value={count(policies.isLoading, policies.isError, (policies.data ?? []).filter((policy) => policy.enabled).length)} icon={BadgeCheck} />
        <Metric label="Open opportunities" value={count(offers.isLoading, offers.isError, offers.data?.length)} detail="Current database offer registry" icon={Activity} />
        <Metric label="Opportunities delivered" value={count(lifecycle.isLoading, lifecycle.isError, totals.delivered)} detail="Rolling 24-hour lifecycle events" icon={Activity} />
        <Metric label="Trades recorded" value={count(lifecycle.isLoading, lifecycle.isError, totals.traded)} detail="Rolling 24-hour lifecycle events" icon={CircleDollarSign} />
        <Metric label="Settled trade events" value={count(lifecycle.isLoading, lifecycle.isError, totals.settled)} detail="Rolling 24-hour lifecycle events" icon={CheckCircle2} />
        <Metric label="Insufficient-balance events" value={count(lifecycle.isLoading, lifecycle.isError, totals.zeroBalance)} detail="Rolling 24-hour lifecycle events" icon={AlertTriangle} />
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

export function AdminTransactionReview({ focus }: { focus?: "capital" | "fees" | "reconciliation" }) {
  const ledgerQuery = trpc.adminOperations.ledgerActivity.useQuery(undefined, { refetchInterval: 10_000 });
  const pendingQuery = trpc.adminOperations.pendingSettlements.useQuery(undefined, { refetchInterval: 5_000 });
  const [integrityBeforeTradeId, setIntegrityBeforeTradeId] = useState<number | undefined>(undefined);
  const [walletReconciliationAfter, setWalletReconciliationAfter] = useState<{ afterUserId: number; afterCurrency: string } | undefined>(undefined);
  const [settlementLedgerBeforeTradeId, setSettlementLedgerBeforeTradeId] = useState<number | undefined>(undefined);
  const integrityQuery = trpc.adminOperations.settlementIntegrityIssues.useQuery({
    limit: 250,
    ...(integrityBeforeTradeId === undefined ? {} : { beforeTradeId: integrityBeforeTradeId }),
  }, { refetchInterval: 30_000 });
  const walletLedgerReconciliationQuery = trpc.adminOperations.walletLedgerReconciliation.useQuery({
    limit: 250,
    ...(walletReconciliationAfter === undefined ? {} : {
      afterUserId: walletReconciliationAfter.afterUserId,
      afterCurrency: walletReconciliationAfter.afterCurrency,
    }),
    ...(settlementLedgerBeforeTradeId === undefined ? {} : { beforeTradeId: settlementLedgerBeforeTradeId }),
  }, { refetchInterval: 30_000 });
  const confirmSettlement = trpc.adminOperations.confirmManualSettlement.useMutation({ onSuccess: () => { pendingQuery.refetch(); ledgerQuery.refetch(); integrityQuery.refetch(); walletLedgerReconciliationQuery.refetch(); } });
  const tradeFeePolicyQuery = trpc.adminOperations.tradeFeePolicy.useQuery(undefined, { staleTime: 60_000 });
  const [feePolicyDraft, setFeePolicyDraft] = useState<{ feePercent: string; roundingMode: "half_up" | "down" | "up" | "half_even" } | null>(null);
  const feePolicy = tradeFeePolicyQuery.data;
  const feeDraft = feePolicyDraft ?? { feePercent: feePolicy ? String(feePolicy.feeRateBps / 100) : "15", roundingMode: feePolicy?.roundingMode ?? "half_up" };
  const updateTradeFeePolicy = trpc.adminOperations.updateTradeFeePolicy.useMutation({ onSuccess: () => { setFeePolicyDraft(null); tradeFeePolicyQuery.refetch(); } });
  const payoutQuery = trpc.adminOperations.payoutRequests.useQuery(undefined, { refetchInterval: 5_000 });
  const resolvePayout = trpc.adminOperations.resolvePayoutRequest.useMutation({ onSuccess: () => { payoutQuery.refetch(); ledgerQuery.refetch(); } });
  const [payoutDrafts, setPayoutDrafts] = useState<Record<number, { externalReference: string; note: string }>>({});
  const [drafts, setDrafts] = useState<Record<number, { grossProfitMinor: string; reference: string }>>({});
  const currencyQuery = trpc.adminOperations.currencies.useQuery(undefined, { staleTime: 60_000 });
  const rows = (ledgerQuery.data ?? []) as unknown as LedgerRecord[];
  const currencies = (currencyQuery.data ?? []) as unknown as Array<{ code: string; scale: number }>;
  const scales = new Map(currencies.map((currency) => [currency.code.toUpperCase(), Math.max(0, Math.min(8, Number(currency.scale) || 0))]));
  const formatAmount = (amountMinor: number, currency: string) => {
    const code = currency.toUpperCase();
    const scale = scales.get(code) ?? 2;
    const value = Number(amountMinor) / (10 ** scale);
    return `${code} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: scale, maximumFractionDigits: scale }).format(value)}`;
  };

  return (
    <ToolPage eyebrow="Append-only balance ledger" title={focus === "fees" ? "Returns and fees" : focus === "capital" ? "Money used for trades" : focus === "reconciliation" ? "Check finished trades" : "Transaction review"} description={focus === "fees" ? "Set the fee taken only from confirmed positive profit. Losses and zero-profit trades have no profit fee." : focus === "capital" ? "Review wallet movements and the money reserved for trade activity." : focus === "reconciliation" ? "Compare finished trades with their ledger records before treating them as settled." : "Review wallet ledger entries and confirm manually settled trades. Elapsed time never credits a reward or releases principal."} icon={CircleDollarSign} action={<button className="admin-ops-button" type="button" onClick={() => { ledgerQuery.refetch(); pendingQuery.refetch(); integrityQuery.refetch(); walletLedgerReconciliationQuery.refetch(); payoutQuery.refetch(); }} disabled={ledgerQuery.isFetching || pendingQuery.isFetching || integrityQuery.isFetching || walletLedgerReconciliationQuery.isFetching || payoutQuery.isFetching}><RefreshCw size={14} /> Refresh</button>}>
      {ledgerQuery.isLoading ? <LoadingState /> : ledgerQuery.isError ? <div className="admin-ops-empty error">The balance ledger could not be loaded.</div> : <>
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
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Manual settlement queue</span><h2>Trades awaiting administrator confirmation</h2></div><span className="admin-ops-subtle">{pendingQuery.data?.length ?? 0} pending</span></div>
          {pendingQuery.isError && <div className="admin-ops-empty error">Pending settlements could not be loaded. Refresh before attempting any settlement.</div>}
          {confirmSettlement.error && <div className="admin-ops-empty error" role="alert">Settlement was not confirmed: {confirmSettlement.error.message}. Verify the trade's due time and evidence reference before retrying.</div>}
          {confirmSettlement.isSuccess && <div className="admin-ops-note" role="status">Settlement recorded. The queue and ledger are being refreshed.</div>}
          {pendingQuery.isLoading ? <LoadingState /> : !pendingQuery.data?.length ? <div className="admin-ops-empty compact">No trades are awaiting manual settlement.</div> : <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Trades awaiting manual settlement" onKeyDown={(event) => { if (event.key === "ArrowRight") { event.preventDefault(); event.currentTarget.scrollLeft += 80; } else if (event.key === "ArrowLeft") { event.preventDefault(); event.currentTarget.scrollLeft -= 80; } }}><table className="admin-ops-table"><thead><tr><th>Trade / customer</th><th>Due status / evidence health</th><th>Principal</th><th>Reserved reward (estimate)</th><th>Actual gross profit/loss (minor units)</th><th>Settlement evidence reference</th><th>Action</th></tr></thead><tbody>
            {(pendingQuery.data as any[]).map((trade) => {
              const draft = drafts[trade.id] || { grossProfitMinor: "", reference: "" };
              const enteredGross = Number(draft.grossProfitMinor);
              const reserved = Number(trade.rewardReservedMinor || 0);
              const reservationAmount = trade.reservationAmountMinor == null ? null : Number(trade.reservationAmountMinor);
              const reservationConsistent = reservationAmount === null
                ? reserved === 0 && !trade.reservationStatus
                : Number.isSafeInteger(reservationAmount) && reservationAmount === reserved && trade.reservationStatus === "reserved";
              const dueAt = trade.creditAt || trade.settlesAt;
              const isDue = !!dueAt && Number.isFinite(new Date(dueAt).getTime()) && new Date(dueAt).getTime() <= Date.now();
              const canConfirm = isDue && reservationConsistent && draft.grossProfitMinor.trim() !== "" && Number.isSafeInteger(enteredGross) && draft.reference.trim().length >= 3;
              return <tr key={trade.id}>
                <td><strong>Trade {trade.id} · {trade.symbol || "Opportunity"}</strong><small>{trade.customerName || trade.customerEmail || ("Account " + trade.userId)} · {trade.currency}</small><small>Subscription: {trade.packageSubscriptionId ?? "Legacy / none"}</small></td>
                <td><strong>{trade.lifecycleStage || "Stage not recorded"}</strong><small>{dueAt ? (isDue ? "Due " : "Not due ") + new Date(dueAt).toLocaleString() : "Missing settlement due timestamp"}</small><small>{reservationConsistent ? "Reward reservation consistent" : "Reservation mismatch — investigate before settlement"}</small><small>{trade.reservationStatus ? "Reservation: " + trade.reservationStatus : "No reservation record"}</small></td>
                <td>{trade.principalMinor}</td>
                <td>{trade.rewardReservedMinor}<small>Estimate only; not a settlement result.</small></td>
                <td><input type="number" step={1} value={draft.grossProfitMinor} onChange={(event) => setDrafts((current) => ({ ...current, [trade.id]: { ...draft, grossProfitMinor: event.target.value } }))} placeholder="Positive profit or negative loss" aria-label={"Actual gross profit/loss in minor units for trade " + trade.id} /></td>
                <td><input value={draft.reference} maxLength={160} onChange={(event) => setDrafts((current) => ({ ...current, [trade.id]: { ...draft, reference: event.target.value } }))} placeholder="Actual settlement reference (required)" aria-label={"Settlement evidence reference for trade " + trade.id} /></td>
                <td><button className="admin-ops-button" type="button" disabled={confirmSettlement.isPending || !canConfirm} onClick={() => confirmSettlement.mutate({ tradeId: trade.id, grossProfitMinor: enteredGross, settlementReference: draft.reference.trim() })}><CheckCircle2 size={14} /> Confirm actual result</button></td>
              </tr>;
            })}
          </tbody></table></div>}
          <div className="admin-ops-note"><ShieldCheck size={16} /><span>Only settle after independently verifying the actual trade result and its evidence reference. The reserved reward is an estimate, not a settlement result. The server rejects early settlement and atomically records returned principal, actual gross result, applicable fee, net result, and loss. A client-side due-time display is informational; the server check is authoritative.</span></div>
        </section>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head">
            <div><span className="admin-ops-kicker">Read-only wallet reconciliation</span><h2>Available balances versus signed ledger entries</h2></div>
            <span className="admin-ops-subtle">{walletLedgerReconciliationQuery.data?.walletIssues.length ?? 0} flagged groups</span>
          </div>
          <p>Ledger-net totals are compared with available balances, not available plus locked funds. Missing opening-balance history is shown as inconclusive. Known trade principal and pending payouts are checked separately against locked funds.</p>
          {walletLedgerReconciliationQuery.isLoading ? <LoadingState /> : walletLedgerReconciliationQuery.isError ? <div className="admin-ops-empty error">Wallet and ledger reconciliation could not be loaded. Refresh before relying on this review.</div> : <>
            <div className="admin-ops-note"><ShieldCheck size={16} /><span>Read only: this report does not change wallets or post adjustments. Confirmed flags identify structural contradictions; balance deltas without a trusted opening snapshot remain inconclusive.</span></div>
            <div className="admin-ops-subtle">Generated {walletLedgerReconciliationQuery.data?.generatedAt ? new Date(walletLedgerReconciliationQuery.data.generatedAt).toLocaleString() : "—"} · Examined {walletLedgerReconciliationQuery.data?.walletScan.groupsExamined ?? 0} account/currency groups · Batch limit {walletLedgerReconciliationQuery.data?.walletScan.limit ?? 250} · {walletLedgerReconciliationQuery.data?.walletScan.hasMore ? "More groups remain" : "No further groups in this scan"}</div>
            <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Wallet ledger reconciliation results">
              <table className="admin-ops-table"><thead><tr><th>Customer / currency</th><th>Wallet rows</th><th>Available balance</th><th>Signed ledger net</th><th>Delta (available − ledger)</th><th>Locked / known obligations</th><th>Review flags</th></tr></thead><tbody>
                {(walletLedgerReconciliationQuery.data?.walletIssues ?? []).map((item) => <tr key={String(item.userId) + ":" + item.currency}>
                  <td><strong>Account {item.userId}</strong><small>{item.currency}</small></td>
                  <td>{item.walletCount ?? "Unsafe total"}</td>
                  <td>{item.availableMinor === null ? "Unsafe total" : formatAmount(Number(item.availableMinor), item.currency)}</td>
                  <td>{item.ledgerNetMinor === null ? "Unsafe total" : formatAmount(Number(item.ledgerNetMinor), item.currency)}<small>{item.ledgerEntryCount ?? "?"} ledger entries</small></td>
                  <td>{item.availableLedgerDeltaMinor === null ? "Not comparable" : formatAmount(Number(item.availableLedgerDeltaMinor), item.currency)}</td>
                  <td>{item.lockedMinor === null ? "Unsafe total" : formatAmount(Number(item.lockedMinor), item.currency)}<small>Known trades: {item.knownActiveTradePrincipalMinor === null ? "unknown" : formatAmount(Number(item.knownActiveTradePrincipalMinor), item.currency)} · Pending payouts: {item.pendingPayoutMinor === null ? "unknown" : formatAmount(Number(item.pendingPayoutMinor), item.currency)}</small></td>
                  <td>{item.issues.map((issue) => <div key={issue.code}><strong>{issue.confidence}</strong>: {issue.code.replaceAll("_", " ")}<small>{issue.explanation}</small></div>)}</td>
                </tr>)}
                {!(walletLedgerReconciliationQuery.data?.walletIssues ?? []).length && <tr><td colSpan={7} className="admin-ops-table-empty">No flagged groups in this batch. This does not mean unscanned groups were reviewed.</td></tr>}
              </tbody></table>
            </div>
            <div className="admin-payout-actions">
              {walletLedgerReconciliationQuery.data?.walletScan.hasMore && walletLedgerReconciliationQuery.data.walletScan.nextCursor && <button className="admin-ops-button" type="button" onClick={() => setWalletReconciliationAfter(walletLedgerReconciliationQuery.data!.walletScan.nextCursor ?? undefined)}>Load next wallet groups</button>}
              {walletReconciliationAfter && <button className="admin-ops-button" type="button" onClick={() => setWalletReconciliationAfter(undefined)}>Restart wallet scan</button>}
            </div>
          </>}
        </section>
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
        <section className="admin-ops-metrics compact-metrics">
          <Metric label="Entries shown" value={rows.length} icon={FileText} />
          <Metric label="Positive entries" value={rows.filter((row) => Number(row.amountMinor) > 0).length} icon={CheckCircle2} />
          <Metric label="Negative entries" value={rows.filter((row) => Number(row.amountMinor) < 0).length} icon={AlertTriangle} />
          <Metric label="Currencies represented" value={new Set(rows.map((row) => row.currency)).size} icon={CircleDollarSign} />
        </section>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Latest database entries</span><h2>Wallet activity</h2></div><span className="admin-ops-subtle">Up to 150 records</span></div>
          <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Wallet activity ledger" onKeyDown={(event) => { if (event.key === "ArrowRight") { event.preventDefault(); event.currentTarget.scrollLeft += 80; } else if (event.key === "ArrowLeft") { event.preventDefault(); event.currentTarget.scrollLeft -= 80; } }}><table className="admin-ops-table"><thead><tr><th>Recorded</th><th>Customer</th><th>Entry type</th><th>Amount</th><th>Withdrawable</th></tr></thead><tbody>
            {rows.map((row) => <tr key={row.id}><td>{timestamp(row.createdAt)}</td><td><strong>{row.customerName || "Customer"}</strong><small>{row.customerEmail || `Account ${row.userId}`}</small></td><td><span className="admin-ops-entry-type">{row.entryType}</span></td><td className={Number(row.amountMinor) < 0 ? "amount-negative" : "amount-positive"}>{formatAmount(Number(row.amountMinor), row.currency)}</td><td><StatusPill tone={row.withdrawable ? "good" : "neutral"}>{row.withdrawable ? "Yes" : "No"}</StatusPill></td></tr>)}
            {!rows.length && <tr><td colSpan={5} className="admin-ops-table-empty">No wallet ledger entries have been recorded.</td></tr>}
          </tbody></table></div>
        </section>
        <div className="admin-ops-note"><CircleDollarSign size={16} /><span>Amounts are formatted from the configured currency scale and the ledger’s stored minor-unit integer. The ledger view is read-only.</span></div>
      </>}
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
  const ledgerQuery = trpc.adminOperations.ledgerActivity.useQuery(undefined, { staleTime: 15_000 });
  const auditQuery = trpc.adminOperations.audit.useQuery(undefined, { staleTime: 15_000 });
  const customers = (customersQuery.data ?? []) as unknown as CustomerRecord[];
  const ledger = (ledgerQuery.data ?? []) as unknown as LedgerRecord[];
  const audit = (auditQuery.data ?? []) as unknown as Array<Record<string, unknown> & { id: number; createdAt?: Date | string; action?: string; actorUserId?: number | null; entityType?: string; entityId?: number | string | null; reason?: string | null }>;
  const loading = customersQuery.isLoading || ledgerQuery.isLoading || auditQuery.isLoading;
  const error = customersQuery.isError || ledgerQuery.isError || auditQuery.isError;
  const customerExport = customers.map((row) => ({ id: row.id, name: row.name, email: row.email, package: row.package, accountState: row.accountState || row.status, emailVerified: row.emailVerified, kycRequired: row.kyc, riskTier: row.riskTier, createdAt: row.createdAt }));
  const ledgerExport = ledger.map((row) => ({ id: row.id, userId: row.userId, customerName: row.customerName, customerEmail: row.customerEmail, currency: row.currency, amountMinor: row.amountMinor, entryType: row.entryType, withdrawable: row.withdrawable, createdAt: row.createdAt }));
  const auditExport = audit.map((row) => ({ id: row.id, createdAt: row.createdAt, action: row.action, actorUserId: row.actorUserId, entityType: row.entityType, entityId: row.entityId, reason: row.reason }));
  const totalRecords = customers.length + ledger.length + audit.length;

  return (
    <ToolPage eyebrow="Operational reporting" title="Reports & exports" description="Download the latest admin-visible customer, wallet-ledger and audit records as CSV files. Export generation happens in this browser; no data is sent to another service." icon={Download}>
      {error && <div className="admin-ops-empty error">One or more report datasets could not be loaded. Retry after checking database availability.</div>}
      {loading ? <LoadingState /> : <>
        <section className="admin-ops-metrics compact-metrics">
          <Metric label="Customer records" value={customers.length} icon={Users} />
          <Metric label="Ledger entries" value={ledger.length} icon={CircleDollarSign} />
          <Metric label="Audit events" value={audit.length} icon={ShieldCheck} />
          <Metric label="Available records" value={totalRecords} icon={FileText} />
        </section>
        <section className="admin-ops-export-grid">
          <article className="admin-ops-export-card"><span className="admin-ops-export-icon"><Users size={18} /></span><div><strong>Customer register</strong><p>Customer identity, package, account state, verification controls and risk tier.</p><small>{customers.length} records available</small></div><button className="admin-ops-button" type="button" disabled={!customerExport.length} onClick={() => downloadCsv("arbitrade-customers.csv", customerExport)}><Download size={14} /> Export CSV</button></article>
          <article className="admin-ops-export-card"><span className="admin-ops-export-icon"><CircleDollarSign size={18} /></span><div><strong>Wallet ledger</strong><p>Most recent append-only balance entries with native minor-unit values.</p><small>{ledger.length} records available</small></div><button className="admin-ops-button" type="button" disabled={!ledgerExport.length} onClick={() => downloadCsv("arbitrade-wallet-ledger.csv", ledgerExport)}><Download size={14} /> Export CSV</button></article>
          <article className="admin-ops-export-card"><span className="admin-ops-export-icon"><ShieldCheck size={18} /></span><div><strong>Admin audit log</strong><p>Recorded administrative actions and their entity references.</p><small>{audit.length} records available</small></div><button className="admin-ops-button" type="button" disabled={!auditExport.length} onClick={() => downloadCsv("arbitrade-admin-audit.csv", auditExport)}><Download size={14} /> Export CSV</button></article>
        </section>
        {!totalRecords && <div className="admin-ops-empty compact">No report rows are available yet.</div>}
        <div className="admin-ops-note"><ShieldCheck size={16} /><span>Exports require an authenticated administrator session. CSV values that could be interpreted as spreadsheet formulas are escaped.</span></div>
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
  heartbeatAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastDurationMs: number | null;
  consecutiveFailures: number;
  lastError: string | null;
};

type DeadQualificationJob = {
  id: number;
  userId: number;
  sourceLedgerId: number;
  attempts: number;
  lastError: string | null;
  updatedAt: string | null;
};

type WorkerHealthData = {
  generatedAt: string;
  workers: WorkerHealthEntry[];
  qualificationQueue: { pending: number; processing: number; completed: number; dead: number; total: number } | null;
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

function diagnosticFeatureState(feature: { status: string; sourceFiles?: Array<{ present: boolean }> }, checks: DiagnosticSnapshot["checks"]) {
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
        ];
        downloadDiagnosticsCsv("arbitrade-system-diagnostics-" + stamp + ".csv", rows);
      } else {
        if (!printWindow) throw new Error("The PDF print window is unavailable.");
        const checks = (report.checks ?? []).map((item: any) => `<tr><td>${escapeReportHtml(diagnosticSeverity(item))}</td><td>${escapeReportHtml(item.status)}</td><td>${escapeReportHtml(item.area)}</td><td><strong>${escapeReportHtml(item.title)}</strong><br>${escapeReportHtml(item.detail)}${item.recommendation ? `<br><em>Action: ${escapeReportHtml(item.recommendation)}</em>` : ""}</td></tr>`).join("");
        const features = (report.featureCoverage ?? []).map((feature: any) => `<tr><td>${escapeReportHtml(feature.label)}</td><td>${escapeReportHtml(diagnosticFeatureState(feature, report.checks ?? []))}</td><td>${escapeReportHtml(feature.note)}</td></tr>`).join("");
        printWindow.document.write(`<!doctype html><html><head><title>Arbitrade System Diagnostics</title><style>body{font:12px Arial,sans-serif;color:#172033;margin:28px}h1{font-size:22px}h2{font-size:16px;margin-top:24px}.meta{color:#526078}table{width:100%;border-collapse:collapse;margin:12px 0 20px}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left;vertical-align:top}th{background:#eef2f7}em{display:block;margin-top:5px;color:#475569}.summary{display:flex;gap:18px;flex-wrap:wrap;margin:14px 0}.summary b{font-size:18px}footer{margin-top:24px;color:#64748b}@media print{body{margin:12mm}tr{break-inside:avoid}}</style></head><body><h1>Arbitrade — Full System Diagnostics</h1><p class="meta">Generated: ${escapeReportHtml(report.generatedAt)} · Revision: ${escapeReportHtml(report.application?.sourceRevision || "Not supplied")} · Overall: ${escapeReportHtml(report.overallStatus)}</p><div class="summary"><span>Critical/High findings: <b>${(report.summary?.fail ?? 0)}</b></span><span>Warnings: <b>${(report.summary?.warning ?? 0)}</b></span><span>Not run: <b>${(report.summary?.not_run ?? 0)}</b></span><span>Passed: <b>${(report.summary?.pass ?? 0)}</b></span></div><h2>Detected issues and corrective actions</h2><table><thead><tr><th>Severity</th><th>Status</th><th>Area</th><th>Finding and recommended correction</th></tr></thead><tbody>${checks}</tbody></table><h2>Feature health assessment</h2><p>“Not Verified” means source files are present but live feature acceptance has not been proven by this diagnostic.</p><table><thead><tr><th>Feature</th><th>Assessment</th><th>Evidence</th></tr></thead><tbody>${features}</tbody></table><h2>Deployment readiness</h2><p>${escapeReportHtml(report.overallStatus)} — ${(report.summary?.fail ?? 0) ? "Do not treat this deployment as ready until critical/high findings are corrected and rechecked." : (report.summary?.warning ?? 0) || (report.summary?.not_run ?? 0) ? "Review warnings and complete checks not run before release." : "No issues were detected by the checks that ran; complete CI and hosted acceptance before production sign-off."}</p><h2>Scope and limitations</h2><ul>${(report.scope?.limitations ?? []).map((item: string) => `<li>${escapeReportHtml(item)}</li>`).join("")}</ul><footer>Read-only diagnostic snapshot. Recommendations do not modify production code or database records.</footer></body></html>`);
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
  const healthy = workers.filter((worker) => worker.status === "healthy").length;
  const attention = workers.filter((worker) => worker.status === "degraded" || worker.status === "stale" || worker.status === "not_started").length;
  const queue = data.qualificationQueue;
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
          <Metric label="Workers registered" value={exportQuery.data.workerHealth?.workers?.length ?? "Unavailable"} icon={Activity} />
          <Metric label="Dead-letter jobs" value={exportQuery.data.workerHealth?.qualificationQueue?.dead ?? "Unavailable"} icon={AlertTriangle} />
          <Metric label="Database" value={exportQuery.data.database?.status ?? "Unavailable"} icon={ShieldCheck} />
          <Metric label="Heap used" value={exportQuery.data.server?.heapUsePercent == null ? "Unavailable" : exportQuery.data.server.heapUsePercent + "%"} detail={exportQuery.data.server?.cpuCount == null ? "CPU data unavailable" : exportQuery.data.server.cpuCount + " CPU cores"} icon={Activity} />
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
          <Metric label="Worker records" value={workers.length} detail="Includes recent server instances" icon={Activity} />
          <Metric label="Healthy workers" value={healthy} detail="Last cycle completed successfully" icon={CheckCircle2} />
          <Metric label="Needs attention" value={attention} detail="Degraded, stale, or not started" icon={AlertTriangle} />
          <Metric label="Dead-lettered qualification jobs" value={queue === null ? "Unavailable" : queue.dead.toLocaleString()} detail="Requires operator review" icon={FileText} />
        </section>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Background services</span><h2>Worker status</h2></div><span className="admin-ops-subtle">{workers.length} rows</span></div>
          <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Background worker health"><table className="admin-ops-table"><thead><tr><th>Worker</th><th>Status</th><th>Instance</th><th>Last heartbeat</th><th>Last success</th><th>Failures</th><th>Last cycle</th><th>Last error</th></tr></thead><tbody>
            {workers.map((worker) => <tr key={worker.workerKey + ":" + worker.instanceId}>
              <td><strong>{worker.displayName}</strong><small>{worker.description}</small><small>Expected interval: {Math.max(1, Math.round(worker.expectedIntervalMs / 1000))} seconds</small></td>
              <td><StatusPill tone={workerStatusTone(worker.status)}>{workerStatusLabel(worker.status)}</StatusPill></td>
              <td><code>{worker.instanceId}</code></td><td>{timestamp(worker.heartbeatAt)}</td><td>{timestamp(worker.lastSuccessAt)}</td>
              <td>{worker.consecutiveFailures}</td><td>{worker.lastDurationMs === null ? "—" : worker.lastDurationMs.toLocaleString() + " ms"}</td><td>{worker.lastError || "—"}</td>
            </tr>)}
            {!workers.length && <tr><td colSpan={8} className="admin-ops-table-empty">No worker records are available yet.</td></tr>}
          </tbody></table></div>
        </section>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Durable qualification queue</span><h2>Tier assignment jobs</h2></div></div>
          {queue === null ? <div className="admin-ops-empty">Queue counts are unavailable. Verify migration 0082 and database access.</div> : <section className="admin-ops-metrics compact-metrics">
            <Metric label="Pending" value={queue.pending} icon={Clock3} /><Metric label="Processing" value={queue.processing} icon={Activity} />
            <Metric label="Completed" value={queue.completed} icon={CheckCircle2} /><Metric label="Dead-lettered" value={queue.dead} icon={AlertTriangle} />
          </section>}
          <div className="admin-ops-note"><ShieldCheck size={16} /><span><strong>Safe recovery boundary</strong> Retry uses a guarded, audited transaction; it does not change a wallet balance, grant an entitlement directly, or force a trade settlement. A missing monitor or queue is reported as unavailable, never as zero.</span></div>
        </section>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Operator recovery</span><h2>Dead-lettered qualification jobs</h2></div><span className="admin-ops-subtle">Latest 25</span></div>
          {recoveryError && <div className="admin-ops-empty error" role="alert">{recoveryError}</div>}
          {lastRequeuedJobId !== null && <div className="admin-ops-note" role="status"><CheckCircle2 size={16} /><span>Qualification job #{lastRequeuedJobId} was requeued. The background worker will process it under the normal idempotent workflow.</span></div>}
          {data.deadQualificationJobs === null ? <div className="admin-ops-empty">Dead-letter details are unavailable. Verify the qualification queue migration and database connection.</div> : data.deadQualificationJobs.length === 0 ? <div className="admin-ops-empty">No dead-lettered qualification jobs need review.</div> : (
            <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Dead-lettered qualification jobs"><table className="admin-ops-table"><thead><tr><th>Job / customer</th><th>Source ledger</th><th>Attempts</th><th>Last error</th><th>Last update</th><th>Audited retry</th></tr></thead><tbody>
              {data.deadQualificationJobs.map((job) => <tr key={job.id}>
                <td><strong>Job #{job.id}</strong><small>Customer ID {job.userId}</small></td><td>Ledger #{job.sourceLedgerId}</td><td>{job.attempts}</td>
                <td>{job.lastError || "No error detail retained"}</td><td>{timestamp(job.updatedAt)}</td>
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
