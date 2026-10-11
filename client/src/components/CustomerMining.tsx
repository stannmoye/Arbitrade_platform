import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Activity, ArrowDownUp, ArrowRight, BadgeCheck, Bolt, Clock3, Cpu, Database, Gauge, Info, LockKeyhole, RefreshCw, ShieldAlert, ShieldCheck, Sparkles, WalletCards } from "lucide-react";

const ASSETS = ["TOKEN", "USD", "EUR", "GBP", "BTC", "ETH", "USDT"];
const TARGET_ASSETS = ASSETS.filter(asset => asset !== "TOKEN");
const requestId = () => globalThis.crypto?.randomUUID?.() || `mining-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const dateText = (value?: string | null) => value ? new Date(value).toLocaleString() : "—";
const fmt = (value: unknown, max = 8) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: max }) : "—";
};

export function CustomerMining({ push }: { push: (message: string) => void }) {
  const dashboard = trpc.customer.mining.dashboard.useQuery(undefined, { refetchInterval: 8000 });
  const packages = trpc.customer.mining.packages.useQuery(undefined, { refetchInterval: 30000 });
  const boostStatus = trpc.customer.mining.boostStatus.useQuery(undefined, { refetchInterval: 5000 });
  const history = trpc.customer.mining.transactions.useQuery(undefined, { refetchInterval: 12000 });
  const [paymentAsset, setPaymentAsset] = useState("TOKEN");
  const [selectedPackage, setSelectedPackage] = useState<any | null>(null);
  const [purchaseQuote, setPurchaseQuote] = useState<any | null>(null);
  const [swapQuote, setSwapQuote] = useState<any | null>(null);
  const [swapAmount, setSwapAmount] = useState("");
  const [swapTarget, setSwapTarget] = useState("USD");
  const [prefEnabled, setPrefEnabled] = useState(false);
  const [prefTarget, setPrefTarget] = useState("USD");
  const [prefThreshold, setPrefThreshold] = useState("0");
  const [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState("");
  const [busyKey, setBusyKey] = useState("");

  useEffect(() => {
    const preference = dashboard.data?.conversionPreference;
    if (preference) {
      setPrefEnabled(Boolean(preference.enabled));
      setPrefTarget(String(preference.targetDenomination || "USD"));
      setPrefThreshold(String(preference.minimumThreshold || "0"));
    }
  }, [dashboard.data?.conversionPreference?.version]);

  const purchaseQuoteMutation = trpc.customer.mining.quotePurchase.useMutation({
    onSuccess: quote => { setPurchaseQuote(quote); setAcknowledged(false); setMessage(""); },
    onError: error => setMessage(error.message),
  });
  const purchaseMutation = trpc.customer.mining.confirmPurchase.useMutation({
    onSuccess: result => { setPurchaseQuote(null); setSelectedPackage(null); setAcknowledged(false); void dashboard.refetch(); void history.refetch(); void packages.refetch(); push(`Simulated package activated · ${result.receiptReference}`); setMessage("Purchase posted to the separate Mining simulation ledger."); },
    onError: error => setMessage(error.message),
  });
  const boostMutation = trpc.customer.mining.activateBoost.useMutation({
    onSuccess: result => { void dashboard.refetch(); void boostStatus.refetch(); void history.refetch(); push(`Simulated boost activated until ${dateText(result.endsAt)}`); },
    onError: error => setMessage(error.message),
  });
  const preferenceMutation = trpc.customer.mining.updateConversionPreference.useMutation({
    onSuccess: result => { void dashboard.refetch(); setMessage(`Conversion preference saved as version ${result.version}. It applies to future reward events.`); },
    onError: error => setMessage(error.message),
  });
  const swapQuoteMutation = trpc.customer.mining.quoteSwap.useMutation({
    onSuccess: quote => { setSwapQuote(quote); setMessage(""); },
    onError: error => setMessage(error.message),
  });
  const swapMutation = trpc.customer.mining.confirmSwap.useMutation({
    onSuccess: result => { setSwapQuote(null); setSwapAmount(""); void dashboard.refetch(); void history.refetch(); push(`Simulated conversion receipt · ${result.receiptReference}`); setMessage(`${result.destinationAmount} ${result.destinationAsset} was posted to the Mining simulation ledger.`); },
    onError: error => setMessage(error.message),
  });

  const data = dashboard.data;
  const packageRows = packages.data || [];
  const boost = boostStatus.data;
  const active = data?.packages || [];
  const recent = history.data || [];
  const selectedCanPurchase = selectedPackage?.status === "published" && Boolean(data?.miningStatus && !String(data.miningStatus).startsWith("Paused"));
  const availablePayment = useMemo(() => String(data?.balances?.[paymentAsset] || "0"), [data?.balances, paymentAsset]);
  const quoteExpired = purchaseQuote ? new Date(purchaseQuote.expiresAt).getTime() <= Date.now() : false;
  const swapExpired = swapQuote ? new Date(swapQuote.expiresAt).getTime() <= Date.now() : false;

  return <div className="customer-mining">
    <header className="cm-hero">
      <div className="cm-hero-copy">
        <div className="cm-kicker"><span className="cm-live-dot"/> DIGITAL INFRASTRUCTURE · MINING</div>
        <h1>Mining command centre</h1>
        <p>Review hash-power packages, simulated rewards, boosts, and conversion preferences in one transparent workspace.</p>
      </div>
      <div className="cm-hero-status"><span><Database size={14}/> Separate simulation ledger</span><strong className={data?.miningStatus?.startsWith("Simulated") ? "is-running" : ""}>{data?.miningStatus || "Loading status"}</strong><small>{data?.serverTime ? `Updated ${dateText(data.serverTime)}` : "Connecting to Mining service"}</small></div>
    </header>

    <div className="cm-disclosure" role="note"><ShieldAlert size={18}/><div><strong>Simulation-only feature · no external mining or cash payout</strong><span>No physical mining hardware, pool activity, guaranteed return, real-world settlement, or withdrawal is represented. TOKEN is an admin-configured internal reference; simulated balances are not redeemable.</span></div></div>

    {message && <div className="cm-message" role="status"><Info size={15}/><span>{message}</span><button type="button" onClick={()=>setMessage("")} aria-label="Dismiss">×</button></div>}
    {dashboard.error && <div className="cm-error" role="alert">Mining service unavailable: {dashboard.error.message}</div>}

    <section className="cm-metrics" aria-label="Mining summary">
      <article className="cm-metric"><span><Cpu size={15}/> HASH POWER</span><strong>{fmt(data?.activeThs,4)} <small>TH/s</small></strong><div><i/>Base {fmt(data?.baseThs,4)} · Boost {fmt(data?.boostThs,4)}</div></article>
      <article className="cm-metric"><span><Sparkles size={15}/> SIMULATED TOKEN BALANCE</span><strong>{fmt(data?.tokenBalance,8)} <small>TOKEN</small></strong><div>Earned today {fmt(data?.todayTokens,8)} TOKEN</div></article>
      <article className="cm-metric"><span><Gauge size={15}/> DAILY REWARD ESTIMATE</span><strong>{fmt(data?.estimatedDailyTokens,8)} <small>TOKEN / day</small></strong><div>{data?.estimateAssumption || "Estimate only · not guaranteed"}</div></article>
      <article className="cm-metric"><span><LockKeyhole size={15}/> PAYOUT STATUS</span><strong className="cm-payout-disabled">Not available</strong><div>{data?.payoutStatus || "Simulated balances are not withdrawable"}</div></article>
    </section>

    <section className="cm-section-heading"><div><span className="cm-kicker">ACCOUNT POSITION</span><h2>Mining balances</h2></div><span className="cm-muted">Isolated from your regular wallet</span></section>
    <div className="cm-balance-grid">{ASSETS.map(asset=><div className={`cm-balance ${asset==="TOKEN"?"is-token":""}`} key={asset}><span>{asset==="TOKEN"?<Sparkles size={15}/>:<WalletCards size={15}/>} {asset}</span><strong>{fmt(data?.balances?.[asset],asset==="USD"||asset==="EUR"||asset==="GBP"?2:8)}</strong><small>{asset==="TOKEN"?"Internal simulated unit":"Available simulated balance"}</small></div>)}</div>

    <section className="cm-section-heading"><div><span className="cm-kicker">CAPACITY CATALOGUE</span><h2>Mining packages</h2></div><button className="cm-icon-button" type="button" onClick={()=>{void packages.refetch();void dashboard.refetch()}} aria-label="Refresh packages"><RefreshCw size={15}/></button></section>
    <div className="cm-package-grid">
      {packages.isLoading && <div className="cm-empty">Loading published packages…</div>}
      {!packages.isLoading && !packageRows.length && <div className="cm-empty">No customer packages are published yet. Check back after the operations team completes setup.</div>}
      {packageRows.map((item:any)=><article className="cm-package-card" key={item.versionId}>
        <div className="cm-package-top"><span className="cm-package-icon"><Cpu size={18}/></span><span className="cm-package-status">{item.status === "published" ? "AVAILABLE" : "PAUSED"}</span></div>
        <div className="cm-package-version">{item.code} · VERSION {item.version}</div><h3>{item.name}</h3>
        <div className="cm-package-price"><strong>{fmt(item.priceAmount,8)}</strong><span>{item.priceAsset}</span></div>
        <div className="cm-package-stats"><div><span>Base hash power</span><strong>{fmt(item.baseThs,4)} TH/s</strong></div><div><span>Boost capacity</span><strong>{fmt(item.boostBonusThs,4)} TH/s</strong></div><div><span>Illustrative 24h reward</span><strong>{fmt(item.estimatedDailyTokens,8)} TOKEN</strong></div><div><span>Stacking</span><strong>{item.stackingPolicy === "replace" ? "Replaces active package" : "Stacks with active packages"}</strong></div></div>
        <p className="cm-package-terms">{item.termsText}</p>
        <button type="button" className="cm-primary-button" disabled={!selectedCanPurchase && item.status !== "published"} onClick={()=>{setSelectedPackage(item);setPurchaseQuote(null);setAcknowledged(false)}}>Review package <ArrowRight size={15}/></button>
      </article>)}
    </div>

    <section className="cm-dual-grid">
      <article className="cm-panel cm-boost-panel"><div className="cm-panel-head"><div><span className="cm-kicker">MANUAL CYCLE CONTROL</span><h2>Boost cycle</h2></div><span className={`cm-state ${boost?.active?"active":""}`}>{boost?.active?"ACTIVE":boost?.ready?"READY":"LOCKED"}</span></div>
        {boost?.activeBoost ? <div className="cm-boost-count"><strong>{fmt(boost.activeBoost.bonusThs,4)} TH/s</strong><span>Simulated boost ends {dateText(boost.activeBoost.endsAt)}</span><small>Boost applies only to the reward model and does not represent real compute.</small></div> : <div className="cm-boost-count"><strong>{fmt(boost?.bonusThsAvailable,4)} TH/s</strong><span>{boost?.reason || "Available for this fixed cycle"}</span><small>Cycle ends {dateText(boost?.cycleExpiresAt)}</small></div>}
        <div className="cm-cycle-strip"><span>Cycle start <b>{dateText(boost?.cycleStart)}</b></span><span>Next eligible <b>{dateText(boost?.nextEligibleAt)}</b></span><span>Duration <b>{Math.round(Number(boost?.durationSeconds||0)/60)} min</b></span></div>
        <button className="cm-primary-button" type="button" disabled={!boost?.ready||boostMutation.isPending} onClick={()=>boostMutation.mutate({idempotencyKey:requestId()})}>{boostMutation.isPending?"Activating…":"Activate available boost"}<Bolt size={15}/></button>
        <div className="cm-caveat">One explicit activation per server-anchored cycle. Unused boosts expire at the cycle boundary.</div>
      </article>

      <article className="cm-panel cm-convert-panel"><div className="cm-panel-head"><div><span className="cm-kicker">TOKEN CONVERSION</span><h2>Convert simulated TOKEN</h2></div><ArrowDownUp size={18}/></div>
        <p>Choose a target denomination. A fresh quote, fee, market source, timestamp, and confirmation are required before any ledger entry.</p>
        <div className="cm-form-row"><label>Amount in TOKEN<input inputMode="decimal" value={swapAmount} onChange={e=>{setSwapAmount(e.target.value);setSwapQuote(null)}} placeholder="0.00000000"/></label><label>Target denomination<select value={swapTarget} onChange={e=>{setSwapTarget(e.target.value);setSwapQuote(null)}}>{TARGET_ASSETS.map(asset=><option key={asset}>{asset}</option>)}</select></label></div>
        <button className="cm-secondary-button" type="button" disabled={swapQuoteMutation.isPending||!swapAmount} onClick={()=>swapQuoteMutation.mutate({tokenAmount:swapAmount,targetAsset:swapTarget})}>{swapQuoteMutation.isPending?"Quoting…":"Get fresh swap quote"}<ArrowRight size={14}/></button>
        {swapQuote && <div className="cm-quote-card"><div className="cm-quote-title"><BadgeCheck size={15}/> QUOTE {swapQuote.quoteId} · EXPIRES {dateText(swapQuote.expiresAt)}</div><div className="cm-quote-grid"><span>Debit <b>{fmt(swapQuote.sourceAmount,8)} TOKEN</b></span><span>Gross <b>{fmt(swapQuote.grossAmount,8)} {swapQuote.targetAsset}</b></span><span>Fee <b>{fmt(swapQuote.fee,8)} {swapQuote.feeAsset}</b></span><span>Receive <b>{fmt(swapQuote.destinationAmount,8)} {swapQuote.targetAsset}</b></span></div><small>{swapQuote.provider} · observed {dateText(swapQuote.marketObservedAt)} · round-down precision</small><button type="button" className="cm-primary-button" disabled={swapExpired||swapMutation.isPending} onClick={()=>swapMutation.mutate({quoteId:swapQuote.quoteId,idempotencyKey:requestId()})}>{swapExpired?"Quote expired":swapMutation.isPending?"Posting…":"Confirm simulated conversion"}<ArrowRight size={15}/></button></div>}
      </article>
    </section>

    <section className="cm-panel cm-autoconvert"><div className="cm-panel-head"><div><span className="cm-kicker">OPTIONAL · FUTURE REWARDS ONLY</span><h2>Automatic conversion preference</h2></div><span className="cm-preference-version">Version {data?.conversionPreference?.version||0}</span></div>
      <p>When enabled, future reward events can enter a retryable conversion queue. Stale or out-of-bound rates pause conversion; tokens remain in the TOKEN balance. Existing balance is not converted by this setting.</p>
      <div className="cm-auto-controls"><label className="cm-checkbox"><input type="checkbox" checked={prefEnabled} onChange={e=>setPrefEnabled(e.target.checked)}/><span>Automatically convert eligible future rewards</span></label><label>Destination<select value={prefTarget} onChange={e=>setPrefTarget(e.target.value)}>{TARGET_ASSETS.map(asset=><option key={asset}>{asset}</option>)}</select></label><label>Minimum TOKEN balance<input value={prefThreshold} onChange={e=>setPrefThreshold(e.target.value)} inputMode="decimal"/></label><button type="button" className="cm-secondary-button" disabled={preferenceMutation.isPending} onClick={()=>preferenceMutation.mutate({enabled:prefEnabled,targetDenomination:prefTarget,minimumThreshold:prefThreshold})}>{preferenceMutation.isPending?"Saving…":"Save preference"}</button></div>
      <div className="cm-queue-note"><Clock3 size={14}/> Pending conversion jobs: <strong>{data?.pendingConversionJobs||0}</strong> · failures never debit the source balance.</div>
    </section>

    <section className="cm-panel cm-history"><div className="cm-panel-head"><div><span className="cm-kicker">IMMUTABLE RECEIPTS</span><h2>Reward & transaction history</h2></div><button className="cm-icon-button" type="button" onClick={()=>history.refetch()} aria-label="Refresh history"><RefreshCw size={15}/></button></div>
      {history.isLoading?<div className="cm-empty">Loading ledger history…</div>:!recent.length?<div className="cm-empty">No Mining transactions have been recorded yet.</div>:<div className="cm-table-wrap"><table className="cm-table"><thead><tr><th>Event</th><th>Reference</th><th>Status</th><th>When</th></tr></thead><tbody>{recent.map((row:any)=><tr key={row.id}><td><strong>{String(row.type).replaceAll("_"," ")}</strong>{row.details?.destinationAmount&&<small>{fmt(row.details.destinationAmount,8)} {row.details.destinationAsset}</small>}</td><td>{row.reference}</td><td><span className="cm-history-status">{row.status}</span></td><td>{dateText(row.createdAt)}</td></tr>)}</tbody></table></div>}
    </section>

    <footer className="cm-footer-disclaimer"><ShieldCheck size={15}/><span>Mining figures use server-side versioned assumptions and the existing high-precision ledger. This is a simulated mining-style feature: no external compute, investment advice, guaranteed return, custody, or withdrawal.</span><span>Economics v{data?.economicsVersion||"—"}</span></footer>

    {selectedPackage&&<div className="cm-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget){setSelectedPackage(null);setPurchaseQuote(null)}}}><div className="cm-modal" role="dialog" aria-modal="true" aria-labelledby="cm-buy-title"><button className="cm-modal-close" type="button" onClick={()=>{setSelectedPackage(null);setPurchaseQuote(null)}} aria-label="Close">×</button><span className="cm-kicker">PACKAGE REVIEW · VERSION {selectedPackage.version}</span><h2 id="cm-buy-title">{selectedPackage.name}</h2><p className="cm-modal-disclosure">Simulation-only package. No real mining, guaranteed reward, or cash payout.</p><div className="cm-form-row"><label>Pay with<select value={paymentAsset} onChange={e=>{setPaymentAsset(e.target.value);setPurchaseQuote(null)}}>{ASSETS.map(asset=><option key={asset}>{asset}</option>)}</select></label><div className="cm-available"><span>Available simulated balance</span><strong>{fmt(availablePayment,8)} {paymentAsset}</strong></div></div><button type="button" className="cm-secondary-button" disabled={purchaseQuoteMutation.isPending||!selectedCanPurchase} onClick={()=>purchaseQuoteMutation.mutate({packageVersionId:selectedPackage.versionId,paymentAsset})}>{purchaseQuoteMutation.isPending?"Preparing quote…":"Request indicative quote"}<ArrowRight size={14}/></button>
      {purchaseQuote&&<div className="cm-quote-card"><div className="cm-quote-title"><BadgeCheck size={15}/> FRESH QUOTE · {purchaseQuote.quoteId}</div><div className="cm-quote-grid"><span>Package price <b>{fmt(purchaseQuote.packagePrice,8)} {purchaseQuote.packagePriceAsset}</b></span><span>Payment <b>{fmt(purchaseQuote.sourceAmount,8)} {purchaseQuote.sourceAsset}</b></span><span>Fee <b>{fmt(purchaseQuote.fee,8)} {purchaseQuote.feeAsset}</b></span><span>Balance check <b>{purchaseQuote.sufficientBalance?"Sufficient":"Insufficient"}</b></span></div><small>{purchaseQuote.provider} · observed {dateText(purchaseQuote.priceObservedAt)} · expires {dateText(purchaseQuote.expiresAt)}</small><label className="cm-checkbox cm-ack"><input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/><span>I understand this is simulated mining-style activity only; no real compute, guaranteed returns, or withdrawal is provided.</span></label><button type="button" className="cm-primary-button" disabled={!acknowledged||!purchaseQuote.sufficientBalance||quoteExpired||purchaseMutation.isPending} onClick={()=>purchaseMutation.mutate({quoteId:purchaseQuote.quoteId,idempotencyKey:requestId(),acknowledgedSimulation:acknowledged})}>{quoteExpired?"Quote expired":purchaseMutation.isPending?"Posting purchase…":"Confirm simulated purchase"}<ArrowRight size={15}/></button></div>}
      <div className="cm-modal-note"><Info size={14}/><span>Terms: {selectedPackage.termsText}</span></div></div></div>}
  </div>;
}
