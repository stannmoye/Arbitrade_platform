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
  tradingEnabled?: boolean;
  autoTradeEnabled?: boolean;
  opportunitiesEnabled?: boolean;
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
          <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Customer risk watchlist"><table className="admin-ops-table"><thead><tr><th>Customer</th><th>Risk tier</th><th>Account state</th><th>Trading</th><th>Auto-trade</th><th>Opportunities</th></tr></thead><tbody>
            {watchlist.map((customer) => {
              const tier = customer.riskTier || "standard";
              const state = customer.accountState || customer.status || "active";
              return <tr key={customer.id}><td><strong>{customer.name || "Customer"}</strong><small>{customer.email || `Account ${customer.id}`}</small></td><td><StatusPill tone={rank(tier) >= 3 ? "high" : rank(tier) >= 2 ? "watch" : "neutral"}>{tier}</StatusPill></td><td><StatusPill tone={["active", "open"].includes(state.toLowerCase()) ? "good" : "watch"}>{state}</StatusPill></td><td>{customer.tradingEnabled === false ? "Disabled" : "Enabled"}</td><td>{customer.autoTradeEnabled ? "Enabled" : "Disabled"}</td><td>{customer.opportunitiesEnabled === false ? "Disabled" : "Enabled"}</td></tr>;
            })}
            {!watchlist.length && <tr><td colSpan={6} className="admin-ops-table-empty">No elevated risk tiers or restricted accounts are recorded.</td></tr>}
          </tbody></table></div>
        </section>
        <div className="admin-ops-note"><ShieldCheck size={16} /><span><strong>Review only</strong> Risk flags are based on saved account controls. This view does not assign a credit, investment or suitability score and does not change any account.</span></div>
      </>}
    </ToolPage>
  );
}

export function AdminTransactionReview() {
  const ledgerQuery = trpc.adminOperations.ledgerActivity.useQuery(undefined, { refetchInterval: 10_000 });
  const pendingQuery = trpc.adminOperations.pendingSettlements.useQuery(undefined, { refetchInterval: 5_000 });
  const confirmSettlement = trpc.adminOperations.confirmManualSettlement.useMutation({ onSuccess: () => { pendingQuery.refetch(); ledgerQuery.refetch(); } });
  const [drafts, setDrafts] = useState<Record<number, { rewardMinor: string; reference: string }>>({});
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
    <ToolPage eyebrow="Append-only balance ledger" title="Transaction review" description="Review wallet ledger entries and confirm manually settled trades. Elapsed time never credits a reward or releases principal." icon={CircleDollarSign} action={<button className="admin-ops-button" type="button" onClick={() => { ledgerQuery.refetch(); pendingQuery.refetch(); }} disabled={ledgerQuery.isFetching || pendingQuery.isFetching}><RefreshCw size={14} /> Refresh</button>}>
      {ledgerQuery.isLoading ? <LoadingState /> : ledgerQuery.isError ? <div className="admin-ops-empty error">The balance ledger could not be loaded.</div> : <>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Manual settlement queue</span><h2>Trades awaiting administrator confirmation</h2></div><span className="admin-ops-subtle">{pendingQuery.data?.length ?? 0} pending</span></div>
          {!pendingQuery.data?.length ? <div className="admin-ops-empty compact">No trades are awaiting manual settlement.</div> : <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Trades awaiting manual settlement"><table className="admin-ops-table"><thead><tr><th>Trade / customer</th><th>Principal</th><th>Reserved reward</th><th>Settlement reference</th><th>Action</th></tr></thead><tbody>
            {(pendingQuery.data as any[]).map((trade) => { const draft = drafts[trade.id] || { rewardMinor: String(trade.rewardReservedMinor ?? 0), reference: `manual-${trade.id}` }; return <tr key={trade.id}><td><strong>Trade {trade.id} · {trade.symbol || "Opportunity"}</strong><small>{trade.customerName || trade.customerEmail || `Account ${trade.userId}`} · {trade.currency}</small></td><td>{trade.principalMinor}</td><td>{trade.rewardReservedMinor}</td><td><input value={draft.reference} onChange={(event) => setDrafts((current) => ({ ...current, [trade.id]: { ...draft, reference: event.target.value } }))} placeholder="External/manual reference" /><input value={draft.rewardMinor} onChange={(event) => setDrafts((current) => ({ ...current, [trade.id]: { ...draft, rewardMinor: event.target.value } }))} inputMode="numeric" aria-label={`Reward minor units for trade ${trade.id}`} /></td><td><button className="admin-ops-button" type="button" disabled={confirmSettlement.isPending} onClick={() => confirmSettlement.mutate({ tradeId: trade.id, rewardMinor: Number(draft.rewardMinor), settlementReference: draft.reference })}><CheckCircle2 size={14} /> Confirm manual settlement</button></td></tr>; })}
          </tbody></table></div>}
          <div className="admin-ops-note"><ShieldCheck size={16} /><span>The administrator enters the externally confirmed result and payment reference. This action atomically releases principal, credits the reward once, updates the wallet, and records lifecycle events.</span></div>
        </section>
        <section className="admin-ops-metrics compact-metrics">
          <Metric label="Entries shown" value={rows.length} icon={FileText} />
          <Metric label="Positive entries" value={rows.filter((row) => Number(row.amountMinor) > 0).length} icon={CheckCircle2} />
          <Metric label="Negative entries" value={rows.filter((row) => Number(row.amountMinor) < 0).length} icon={AlertTriangle} />
          <Metric label="Currencies represented" value={new Set(rows.map((row) => row.currency)).size} icon={CircleDollarSign} />
        </section>
        <section className="admin-ops-panel">
          <div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Latest database entries</span><h2>Wallet activity</h2></div><span className="admin-ops-subtle">Up to 150 records</span></div>
          <div className="admin-ops-table-wrap" role="region" tabIndex={0} aria-label="Wallet activity ledger"><table className="admin-ops-table"><thead><tr><th>Recorded</th><th>Customer</th><th>Entry type</th><th>Amount</th><th>Withdrawable</th></tr></thead><tbody>
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
