import { Activity, CalendarClock, CircleDollarSign, Database, FileText, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

type Row = Record<string, any>;

function Page({ title, description, icon: Icon, children, onRefresh, refreshing }: { title: string; description: string; icon: typeof Activity; children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean }) {
  return <div className="admin-ops-page arb-page"><header className="admin-ops-head"><div className="admin-ops-heading"><span className="admin-ops-kicker"><Icon size={14} /> Trade Settings · owner route</span><h1>{title}</h1><p>{description}</p></div>{onRefresh && <button className="admin-ops-button" type="button" onClick={onRefresh} disabled={refreshing}><RefreshCw size={14} /> {refreshing ? "Refreshing…" : "Refresh"}</button>}</header>{children}</div>;
}
function Table({ columns, rows, empty = "No records found." }: { columns: string[]; rows: Row[]; empty?: string }) {
  return <div className="admin-ops-table-wrap" role="region" tabIndex={0}><table className="admin-ops-table"><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? row.tradeId ?? index)}>{columns.map(column => <td key={column}>{String(row[column] ?? "—")}</td>)}</tr>)}{!rows.length && <tr><td className="admin-ops-table-empty" colSpan={columns.length}>{empty}</td></tr>}</tbody></table></div>;
}
function State({ children }: { children: React.ReactNode }) { return <div className="admin-ops-note"><ShieldCheck size={16} /><span>{children}</span></div>; }

export function AdminTradeHistory() {
  const pending = trpc.adminOperations.pendingSettlements.useQuery(undefined, { refetchInterval: 15_000 });
  const integrity = trpc.adminOperations.settlementIntegrityIssues.useQuery({ limit: 100 }, { refetchInterval: 30_000 });
  const reconciliation = trpc.adminOperations.walletLedgerReconciliation.useQuery({ limit: 100 }, { refetchInterval: 30_000 });
  const refresh = () => { void Promise.all([pending.refetch(), integrity.refetch(), reconciliation.refetch()]); };
  const rows = ((pending.data ?? []) as Row[]).map(row => ({ id: row.tradeId, Trade: row.tradeId, Customer: row.userId, Status: row.status, "Review due": row.settlementReviewAt, "Credit due": row.creditAt }));
  return <Page title="Trading History" description="The single owner for recorded trade lifecycle evidence, delayed settlement review and reconciliation. Review never equates elapsed time with execution or settlement." icon={FileText} onRefresh={refresh} refreshing={pending.isFetching || integrity.isFetching || reconciliation.isFetching}><div className="admin-ops-meta-line"><span><CalendarClock size={14} /> Read-only operational evidence</span><span>Pending settlement queue: {pending.isError ? "Unavailable" : rows.length}</span></div><section className="admin-ops-panel"><div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Settlement & delayed-credit queue</span><h2>Recorded trades awaiting review or credit</h2></div></div>{pending.isLoading ? <div className="admin-ops-empty">Loading saved trade records…</div> : pending.isError ? <div className="admin-ops-empty error">Trade history is unavailable. No state is inferred.</div> : <Table columns={["Trade", "Customer", "Status", "Review due", "Credit due"]} rows={rows} />}</section><State>Integrity findings: {integrity.isError ? "Unavailable" : (integrity.data?.issues ?? []).length}. Wallet reconciliation rows: {reconciliation.isError ? "Unavailable" : (reconciliation.data?.walletIssues ?? []).length}. High-impact review and wallet-credit actions remain on the existing authorized settlement screen and are not duplicated here.</State></Page>;
}

export function AdminManualPayouts() {
  const query = trpc.adminOperations.payoutRequests.useQuery(undefined, { refetchInterval: 15_000 });
  const rows = ((query.data ?? []) as Row[]).map(row => ({ id: row.id, Request: row.id, Customer: row.userId, Amount: row.amountMinor, Currency: row.currency, Status: row.status, Requested: row.createdAt }));
  return <Page title="Manual Payouts" description="Customer-requested payout and withdrawal records only. This route does not approve, reject, settle trades or adjust wallets." icon={WalletCards} onRefresh={() => void query.refetch()} refreshing={query.isFetching}><State>Approval and rejection require the existing permissioned payout workflow, reason, idempotency and fresh read-back. No payout action is duplicated in Trading History.</State>{query.isLoading ? <div className="admin-ops-empty">Loading payout requests…</div> : query.isError ? <div className="admin-ops-empty error">Payout requests are unavailable.</div> : <Table columns={["Request", "Customer", "Amount", "Currency", "Status", "Requested"]} rows={rows} />}</Page>;
}

export function AdminCapitalWalletFunding() {
  const query = trpc.adminOperations.ledgerActivity.useQuery(undefined, { refetchInterval: 15_000 });
  const rows = ((query.data ?? []) as Row[]).filter(row => /deposit|fund|credit/i.test(String(row.entryType))).map(row => ({ id: row.id, Ledger: row.id, Customer: row.customerEmail ?? row.userId, Currency: row.currency, Amount: row.amountMinor, Type: row.entryType, Created: row.createdAt }));
  return <Page title="Capital & Wallet Funding" description="Read-only view of recorded wallet ledger activity that may relate to inbound funding. A ledger row is not independently verified provider evidence." icon={CircleDollarSign} onRefresh={() => void query.refetch()} refreshing={query.isFetching}><State>Only a verified funding workflow may credit a wallet. Trade delayed credits are owned by Trading History, not inbound funding.</State>{query.isLoading ? <div className="admin-ops-empty">Loading ledger activity…</div> : query.isError ? <div className="admin-ops-empty error">Wallet funding records are unavailable.</div> : <Table columns={["Ledger", "Customer", "Currency", "Amount", "Type", "Created"]} rows={rows} empty="No funding-like ledger activity is recorded in the current window." />}</Page>;
}

export function AdminDatabaseEntries() {
  const customers = trpc.adminOperations.customers.useQuery(undefined, { staleTime: 60_000 });
  const [userId, setUserId] = useState("");
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const query = trpc.adminOperations.ledgerActivity.useQuery({ userId: userId ? Number(userId) : undefined, day }, { enabled: Boolean(userId && day), refetchOnWindowFocus: false });
  const rows = ((query.data ?? []) as Row[]).map(row => ({ id: row.id, Ledger: row.id, Currency: row.currency, Amount: row.amountMinor, Type: row.entryType, Created: row.createdAt }));
  return <Page title="Database Entries" description="A read-only customer wallet-activity view. Select one customer and one UTC calendar day; credentials, secrets and edit/delete controls are never shown." icon={Database} onRefresh={userId && day ? () => void query.refetch() : undefined} refreshing={query.isFetching}><div className="admin-control-card"><div className="settings-form-grid"><label>Customer<select value={userId} onChange={event => setUserId(event.target.value)}><option value="">Select a customer</option>{(customers.data ?? []).map((customer: any) => <option key={customer.id} value={customer.id}>{customer.name || customer.email || `Customer ${customer.id}`}</option>)}</select></label><label>UTC calendar day<input type="date" value={day} onChange={event => setDay(event.target.value)} /></label></div><small>Results are scoped server-side to the selected customer and UTC day.</small></div>{!userId ? <div className="admin-ops-empty">Select a customer to read wallet activity.</div> : query.isLoading ? <div className="admin-ops-empty">Loading customer-day activity…</div> : query.isError ? <div className="admin-ops-empty error">Customer-day activity is unavailable.</div> : <Table columns={["Ledger", "Currency", "Amount", "Type", "Created"]} rows={rows} empty="No wallet activity is recorded for this customer on this UTC day." />}</Page>;
}

export function AdminRetryCarryForward() {
  const query = trpc.adminOperations.packagePolicies.useQuery(undefined, { refetchInterval: 30_000 });
  return <Page title="Retry & Carry-Forward" description="The shared retry boundary for delivery and settlement work. Carry-forward is explicitly unavailable until its state machine, expiry and idempotency rules are implemented." icon={Activity} onRefresh={() => void query.refetch()} refreshing={query.isFetching}><State>Current policy rows: {query.isError ? "Unavailable" : (query.data ?? []).length}. This page is informational; it does not expose a switch that promises carry-forward behavior or rerun financial work.</State><div className="admin-ops-panel"><div className="admin-ops-panel-head"><div><span className="admin-ops-kicker">Availability</span><h2>Carry-forward: Off / not available</h2></div></div><p>Retry applies only to explicitly implemented technical queues. It is not an opportunity generator, settlement confirmation or wallet-credit shortcut.</p></div></Page>;
}
