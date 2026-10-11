import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Activity, ArrowDownUp, ArrowRight, BadgeCheck, Bolt, CheckCircle2, Clock3, Cog,
  Cpu, Database, Gauge, Info, LockKeyhole, RefreshCw, ShieldAlert, ShieldCheck,
  Sparkles, WalletCards, Zap,
} from "lucide-react";

const ASSETS = ["CKI", "USD", "EUR", "GBP", "BTC", "ETH", "USDT"];
const TARGET_ASSETS = ASSETS.filter(asset => asset !== "CKI");
const requestId = () => globalThis.crypto?.randomUUID?.() || `mining-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const dateText = (value?: string | null) => value ? new Date(value).toLocaleString() : "—";
const fmt = (value: unknown, max = 8) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: max }) : "—";
};
const durationText = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [h, m, s].map(value => String(value).padStart(2, "0")).join(":");
};

export function CustomerMining({ push }: { push: (message: string) => void }) {
  const dashboard = trpc.customer.mining.dashboard.useQuery(undefined, { refetchInterval: 5000 });
  const packages = trpc.customer.mining.packages.useQuery(undefined, { refetchInterval: 30000 });
  const boostStatus = trpc.customer.mining.boostStatus.useQuery(undefined, { refetchInterval: 5000 });
  const history = trpc.customer.mining.transactions.useQuery(undefined, { refetchInterval: 12000 });

  const [now, setNow] = useState(Date.now());
  const [paymentAsset, setPaymentAsset] = useState("USD");
  const [selectedPackage, setSelectedPackage] = useState<any | null>(null);
  const [purchaseQuote, setPurchaseQuote] = useState<any | null>(null);
  const [swapQuote, setSwapQuote] = useState<any | null>(null);
  const [swapTarget, setSwapTarget] = useState("USD");
  const [prefEnabled, setPrefEnabled] = useState(false);
  const [prefTarget, setPrefTarget] = useState("USD");
  const [prefThreshold, setPrefThreshold] = useState("0");
  const [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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
    onSuccess: result => {
      setPurchaseQuote(null);
      setSelectedPackage(null);
      setAcknowledged(false);
      void dashboard.refetch(); void history.refetch(); void packages.refetch();
      push(`Simulated package activated · ${result.receiptReference}`);
      setMessage("Package entitlement activated in the Mining simulation ledger. Package switches do not refund earlier purchases.");
    },
    onError: error => setMessage(error.message),
  });
  const boostMutation = trpc.customer.mining.activateBoost.useMutation({
    onSuccess: result => { void dashboard.refetch(); void boostStatus.refetch(); void history.refetch(); push(`Simulated boost activated until ${dateText(result.endsAt)}`); setMessage("Boost module engaged in the simulation; its added TH/s affects the modeled reward rate until it expires."); },
    onError: error => setMessage(error.message),
  });
  const preferenceMutation = trpc.customer.mining.updateConversionPreference.useMutation({
    onSuccess: result => { void dashboard.refetch(); setMessage(`Conversion preference saved as version ${result.version}. It applies to future reward events.`); },
    onError: error => setMessage(error.message),
  });
  const swapMutation = trpc.customer.mining.confirmSwap.useMutation({
    onSuccess: result => {
      setSwapQuote(null);
      void dashboard.refetch(); void history.refetch();
      push(`Simulated full-balance conversion · ${result.receiptReference}`);
      setMessage(`${fmt(result.sourceAmount, 8)} CKI converted to ${fmt(result.destinationAmount, 8)} simulated ${result.destinationAsset}. This is an internal simulation-ledger conversion, not a cash payout.`);
    },
    onError: error => { setSwapQuote(null); void dashboard.refetch(); setMessage(error.message); },
  });
  const swapQuoteMutation = trpc.customer.mining.quoteSwap.useMutation({
    onSuccess: quote => {
      setSwapQuote(quote);
      setMessage("");
      // One customer action: obtain a fresh server quote for the entire vault and post it immediately.
      swapMutation.mutate({ quoteId: quote.quoteId, idempotencyKey: requestId() });
    },
    onError: error => setMessage(error.message),
  });

  const data = dashboard.data;
  const tokenName = data?.tokenName || "CoinKi";
  const tokenSymbol = data?.tokenSymbol || "CKI";
  const packageRows = packages.data || [];
  const boost = boostStatus.data;
  const active = data?.packages || [];
  const recent = history.data || [];
  const isRunning = Boolean(data?.miningStatus?.startsWith("Simulated") && Number(data?.activeThs) > 0);
  const availableCki = Number(data?.balances?.CKI || data?.tokenBalance || 0);
  const availableUsd = Number(data?.balances?.USD || 0);
  const selectedCanPurchase = selectedPackage?.status === "published" && Boolean(data?.miningStatus && !String(data.miningStatus).startsWith("Paused"));
  const availablePayment = useMemo(() => String(data?.balances?.[paymentAsset] || "0"), [data?.balances, paymentAsset]);
  const quoteExpired = purchaseQuote ? new Date(purchaseQuote.expiresAt).getTime() <= now : false;
  const swapExpired = swapQuote ? new Date(swapQuote.expiresAt).getTime() <= now : false;
  // The server reward worker posts minute-aligned intervals. Use the current interval position
  // so a five-second dashboard refresh does not reset the visual output counter.
  const timeSinceSnapshot = data?.serverTime ? Math.max(0, Math.min(59.999, (now / 1000) % 60)) : 0;
  const simulatedOutputPerSecond = isRunning ? Number(data?.rewardTokensPerThsHour || 0) * Number(data?.activeThs || 0) / 3600 : 0;
  const liveOutputEstimate = Math.max(0, Number(data?.tokenBalance || 0) + simulatedOutputPerSecond * timeSinceSnapshot);
  const ratePerMinute = simulatedOutputPerSecond * 60;
  const activeBoostEnds = boost?.activeBoost?.endsAt ? new Date(boost.activeBoost.endsAt).getTime() : null;
  const countdownTarget = activeBoostEnds || (boost?.nextEligibleAt ? new Date(boost.nextEligibleAt).getTime() : null);
  const boostCountdown = countdownTarget ? durationText(Math.max(0, Math.ceil((countdownTarget - now) / 1000))) : "--:--:--";
  const activeBase = Number(data?.baseThs || 0);

  const startFullBalanceSwap = () => {
    if (availableCki <= 0) return;
    setSwapQuote(null);
    swapQuoteMutation.mutate({ tokenAmount: String(data?.tokenBalance || data?.balances?.CKI || "0"), targetAsset: swapTarget });
  };

  return <div className="customer-mining cm-industrial">
    <header className="cm-hero">
      <div className="cm-hero-copy">
        <div className="cm-kicker"><span className="cm-live-dot"/> SIMULATED HASH-POWER FACILITY · CKI</div>
        <h1>Mining operations</h1>
        <p>Watch the model run, follow CKI accrual, engage a timed hash-power boost, and manage your simulation packages.</p>
      </div>
      <div className="cm-hero-status"><span><Database size={14}/> SIMULATION LEDGER</span><strong className={isRunning ? "is-running" : ""}>{data?.miningStatus || "Connecting to Mining service"}</strong><small>{data?.serverTime ? `Server sync · ${dateText(data.serverTime)}` : "Connecting to Mining service"}</small></div>
    </header>

    <div className="cm-disclosure" role="note"><ShieldAlert size={18}/><div><strong>Live-updating simulation · not physical mining or money movement</strong><span>The animated engine is a visual simulation. CKI rewards are calculated by the server model and posted to the separate Mining ledger; no hardware, mining pool, real-world exchange, cash payout, or withdrawal is involved. Currency balances below are simulated ledger denominations.</span></div></div>

    {message && <div className="cm-message" role="status"><Info size={15}/><span>{message}</span><button type="button" onClick={()=>setMessage("")} aria-label="Dismiss">×</button></div>}
    {dashboard.error && <div className="cm-error" role="alert">Mining service unavailable: {dashboard.error.message}</div>}

    <section className={`cm-engine-deck ${isRunning ? "is-running" : "is-idle"}`} aria-label="Simulated CoinKi mining engine">
      <div className="cm-engine-main">
        <div className="cm-engine-topline"><span className="cm-engine-chip"><Activity size={13}/> ENGINE TELEMETRY</span><span className="cm-engine-state"><i/>{isRunning ? "MODEL RUNNING" : "STANDBY"}</span></div>
        <div className="cm-engine-content">
          <div className="cm-machine-art" aria-hidden="true">
            <div className="cm-machine-beam beam-a"/><div className="cm-machine-beam beam-b"/>
            <div className="cm-machine-housing"><div className="cm-machine-rim"><div className="cm-machine-rotor"><Cog size={72} strokeWidth={1.15}/><span className="cm-rotor-core"/></div></div><div className="cm-machine-bolts"><i/><i/><i/><i/></div></div>
            <div className="cm-machine-conveyor"><i/><i/><i/><i/><i/><i/><i/><i/></div>
            <div className="cm-machine-output"><Sparkles size={15}/><b>CKI</b><span/></div>
            <div className="cm-machine-led led-one"/><div className="cm-machine-led led-two"/>
            <div className="cm-machine-label">SIM CORE · 01</div>
          </div>
          <div className="cm-engine-readout">
            <div className="cm-kicker">SERVER-MODELED OUTPUT</div>
            <div className="cm-engine-counter" aria-live="off">{fmt(liveOutputEstimate, 8)} <small>{tokenSymbol}</small></div>
            <div className="cm-engine-subline"><span><i/> Accruing at modeled rate</span><span>{fmt(ratePerMinute, 8)} {tokenSymbol}/min</span></div>
            <div className="cm-engine-progress"><span style={{width:`${Math.min(100, timeSinceSnapshot / 60 * 100)}%`}}/></div>
            <div className="cm-engine-progress-meta"><span>Current ledger interval</span><b>Posts on server cycle</b></div>
            <div className="cm-engine-foot"><span><Database size={13}/> Confirmed vault balance</span><strong>{fmt(data?.tokenBalance, 8)} {tokenSymbol}</strong><small>Live counter is an estimate within the current interval; only posted ledger entries are spendable.</small></div>
          </div>
        </div>
        <div className="cm-engine-bottomline"><span><span className="cm-led-pulse"/> {isRunning ? "Reward model synchronized" : "Waiting for an active hash-power package"}</span><span>Package-driven · server calculated · simulation only</span></div>
      </div>

      <article className={`cm-boost-machine ${boost?.active ? "boost-active" : ""}`}>
        <div className="cm-boost-machine-head"><span className="cm-engine-chip"><Bolt size={13}/> HASH-POWER BOOST MODULE</span><span className={`cm-state ${boost?.active ? "active" : boost?.ready ? "ready" : ""}`}>{boost?.active ? "ENGAGED" : boost?.ready ? "READY" : "CHARGING"}</span></div>
        <div className="cm-boost-instrument"><div className="cm-boost-cog"><Cog size={51}/><span/></div><div><small>{boost?.active ? "BOOST TIME REMAINING" : "NEXT BOOST AVAILABLE"}</small><strong>{boostCountdown}</strong><span>{boost?.active ? `+${fmt(boost.activeBoost?.bonusThs, 4)} TH/s added to the model` : `${fmt(boost?.bonusThsAvailable, 4)} TH/s boost capacity`}</span></div></div>
        <div className="cm-boost-track"><span style={{width: boost?.active ? "100%" : boost?.ready ? "100%" : "12%"}}/></div>
        <div className="cm-boost-machine-meta"><span><Clock3 size={13}/> Cycle ends {dateText(boost?.cycleExpiresAt)}</span><span>Duration {Math.max(1, Math.round(Number(boost?.durationSeconds || 0) / 60))} min</span></div>
        <button className="cm-engine-action" type="button" disabled={!boost?.ready || boostMutation.isPending} onClick={()=>boostMutation.mutate({idempotencyKey:requestId()})}>{boostMutation.isPending ? "Engaging boost…" : boost?.active ? "Boost engaged" : boost?.ready ? "Engage hash-power boost" : boost?.reason || "Boost module charging"}<Zap size={15}/></button>
        <small className="cm-boost-footnote">One server-anchored activation per cycle. Boost changes simulated output only.</small>
      </article>
    </section>

    <section className="cm-console-metrics" aria-label="Mining and vault status">
      <article className="cm-console-stat"><span><Gauge size={15}/> CURRENT HASH RATE</span><strong>{fmt(data?.activeThs, 4)} <small>TH/s</small></strong><div>Base {fmt(data?.baseThs, 4)} · Boost {fmt(data?.boostThs, 4)} TH/s</div></article>
      <article className="cm-console-stat cm-console-stat-cki"><span><Sparkles size={15}/> UNSWAPPED CKI VAULT</span><strong>{fmt(data?.tokenBalance, 8)} <small>{tokenSymbol}</small></strong><div>{tokenName} accumulated, not yet converted</div></article>
      <article className="cm-console-stat"><span><Activity size={15}/> MODELED REWARD RATE</span><strong>{fmt(data?.rewardTokensPerThsHour, 6)} <small>CKI/TH/s·h</small></strong><div>Estimated today {fmt(data?.todayTokens, 8)} {tokenSymbol}</div></article>
      <article className="cm-console-stat"><span><Database size={15}/> SIMULATED USD VAULT</span><strong>{fmt(availableUsd, 2)} <small>USD</small></strong><div>Internal balance · not a payout</div></article>
    </section>

    <section className="cm-vault-panel">
      <div className="cm-vault-copy"><span className="cm-kicker"><LockKeyhole size={13}/> CKI CONVERSION VAULT</span><h2>Convert the full available balance</h2><p>One action requests a fresh server-side quote for the entire available CKI balance and submits it to the separate simulation ledger. No amount entry required.</p><div className="cm-vault-balance"><span>AVAILABLE TO CONVERT</span><strong>{fmt(data?.tokenBalance, 8)} <small>{tokenSymbol}</small></strong><span>1 {tokenSymbol} = ${fmt(data?.usdPerToken, 2)} USD internal reference · not a live market price</span></div></div>
      <div className="cm-vault-action"><label>Simulated destination<select value={swapTarget} onChange={e=>setSwapTarget(e.target.value)}>{TARGET_ASSETS.map(asset=><option key={asset}>{asset}</option>)}</select></label>
        <button className="cm-swap-all-button" type="button" disabled={availableCki <= 0 || swapQuoteMutation.isPending || swapMutation.isPending} onClick={startFullBalanceSwap}><ArrowDownUp size={17}/>{swapQuoteMutation.isPending ? "Preparing full-balance quote…" : swapMutation.isPending ? "Posting conversion…" : `Swap all ${tokenSymbol} to ${swapTarget}`}</button>
        <span className="cm-vault-note"><ShieldCheck size={13}/> Fresh quote · fee and feed guards apply · no real currency is transferred</span>
        {swapQuote && <div className="cm-swap-progress"><span><CheckCircle2 size={14}/> Quote ready · {fmt(swapQuote.sourceAmount, 8)} {tokenSymbol} → {fmt(swapQuote.destinationAmount, 8)} {swapQuote.targetAsset}</span>{swapMutation.isPending && <small>Posting to your simulated Mining ledger…</small>}{swapExpired && <small>Quote expired; retry Swap all for a fresh quote.</small>}</div>}
      </div>
    </section>

    <section className="cm-section-heading cm-packages-heading"><div><span className="cm-kicker">CAPACITY CATALOGUE</span><h2>Packages · upgrades · plan changes</h2><p>Buy another package, upgrade to more modeled hash power, or switch to a smaller plan.</p></div><button className="cm-icon-button" type="button" onClick={()=>{void packages.refetch();void dashboard.refetch()}} aria-label="Refresh packages"><RefreshCw size={15}/></button></section>
    {active.length > 0 && <div className="cm-active-packages"><div><Cpu size={15}/><b>ACTIVE PACKAGE ENTITLEMENTS</b></div>{active.map((item:any)=><span key={`${item.purchaseId}:${item.code}`}>{item.packageName} · {fmt(item.baseThs, 4)} TH/s{item.expiresAt ? ` · until ${dateText(item.expiresAt)}` : " · no expiry"}</span>)}</div>}
    <div className="cm-package-grid">
      {packages.isLoading && <div className="cm-empty">Loading published packages…</div>}
      {!packages.isLoading && !packageRows.length && <div className="cm-empty">No customer packages are published yet. Check back after the operations team completes setup.</div>}
      {packageRows.map((item:any)=>{
        const activeSame = active.some((current:any) => current.code === item.code);
        const replaces = item.stackingPolicy === "replace" && active.length > 0;
        const intent = !replaces ? "Add package" : Number(item.baseThs) > activeBase ? "Upgrade package" : Number(item.baseThs) < activeBase ? "Downgrade / switch" : "Change package";
        return <article className={`cm-package-card ${activeSame ? "is-current" : ""}`} key={item.versionId}>
          <div className="cm-package-top"><span className="cm-package-icon"><Cpu size={18}/></span><span className="cm-package-status">{activeSame ? "IN YOUR ENGINE" : item.status === "published" ? "AVAILABLE" : "PAUSED"}</span></div>
          <div className="cm-package-version">{item.code} · VERSION {item.version}</div><h3>{item.name}</h3>
          <div className="cm-package-price"><strong>{fmt(item.priceAmount, 8)}</strong><span>{item.priceAsset}</span></div>
          <div className="cm-package-stats"><div><span>Base hash power</span><strong>{fmt(item.baseThs, 4)} TH/s</strong></div><div><span>Boost capacity</span><strong>+{fmt(item.boostBonusThs, 4)} TH/s</strong></div><div><span>Illustrative 24h reward</span><strong>{fmt(item.estimatedDailyTokens, 8)} {item.tokenSymbol || tokenSymbol}</strong></div><div><span>Activation mode</span><strong>{item.stackingPolicy === "replace" ? "Switches active plan" : "Adds alongside active plan"}</strong></div></div>
          <p className="cm-package-terms">{item.termsText}</p>
          <button type="button" className="cm-primary-button" disabled={!selectedCanPurchase || item.status !== "published"} onClick={()=>{setSelectedPackage(item);setPurchaseQuote(null);setAcknowledged(false)}}>{activeSame ? "Buy this package again" : intent}<ArrowRight size={15}/></button>
        </article>;
      })}
    </div>

    <details className="cm-autoconvert cm-advanced-conversion"><summary><div><span className="cm-kicker">ADVANCED · FUTURE REWARDS ONLY</span><strong>Automatic conversion preferences</strong></div><span className="cm-preference-version">Version {data?.conversionPreference?.version || 0}</span></summary>
      <p>Optional background conversion for eligible future reward intervals. A failed or stale quote leaves CKI in the CKI balance. This does not convert your existing vault balance.</p>
      <div className="cm-auto-controls"><label className="cm-checkbox"><input type="checkbox" checked={prefEnabled} onChange={e=>setPrefEnabled(e.target.checked)}/><span>Automatically convert eligible future rewards</span></label><label>Destination<select value={prefTarget} onChange={e=>setPrefTarget(e.target.value)}>{TARGET_ASSETS.map(asset=><option key={asset}>{asset}</option>)}</select></label><label>Minimum {tokenSymbol} balance<input value={prefThreshold} onChange={e=>setPrefThreshold(e.target.value)} inputMode="decimal"/></label><button type="button" className="cm-secondary-button" disabled={preferenceMutation.isPending} onClick={()=>preferenceMutation.mutate({enabled:prefEnabled,targetDenomination:prefTarget,minimumThreshold:prefThreshold})}>{preferenceMutation.isPending ? "Saving…" : "Save preference"}</button></div>
      <div className="cm-queue-note"><Clock3 size={14}/> Pending conversion jobs: <strong>{data?.pendingConversionJobs || 0}</strong> · the full-vault button above is a separate manual conversion.</div>
    </details>

    <section className="cm-panel cm-history"><div className="cm-panel-head"><div><span className="cm-kicker">IMMUTABLE SIMULATION RECEIPTS</span><h2>Reward & transaction history</h2></div><button className="cm-icon-button" type="button" onClick={()=>history.refetch()} aria-label="Refresh history"><RefreshCw size={15}/></button></div>
      {history.isLoading ? <div className="cm-empty">Loading ledger history…</div> : !recent.length ? <div className="cm-empty">No Mining transactions have been recorded yet.</div> : <div className="cm-table-wrap"><table className="cm-table"><thead><tr><th>Event</th><th>Reference</th><th>Status</th><th>When</th></tr></thead><tbody>{recent.map((row:any)=><tr key={row.id}><td><strong>{String(row.type).replaceAll("_", " ")}</strong>{row.details?.destinationAmount && <small>{fmt(row.details.destinationAmount, 8)} {row.details.destinationAsset}</small>}</td><td>{row.reference}</td><td><span className="cm-history-status">{row.status}</span></td><td>{dateText(row.createdAt)}</td></tr>)}</tbody></table></div>}
    </section>

    <footer className="cm-footer-disclaimer"><ShieldCheck size={15}/><span>Machine visuals and live output estimate are a simulation. Server-posted CKI is recorded in the isolated Mining ledger; the internal USD reference is not an exchange execution, cash payout, guaranteed return, or withdrawal.</span><span>Economics v{data?.economicsVersion || "—"}</span></footer>

    {selectedPackage && <div className="cm-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget){setSelectedPackage(null);setPurchaseQuote(null)}}}><div className="cm-modal" role="dialog" aria-modal="true" aria-labelledby="cm-buy-title"><button className="cm-modal-close" type="button" onClick={()=>{setSelectedPackage(null);setPurchaseQuote(null)}} aria-label="Close">×</button><span className="cm-kicker">PACKAGE REVIEW · VERSION {selectedPackage.version}</span><h2 id="cm-buy-title">{selectedPackage.name}</h2><p className="cm-modal-disclosure">Simulation-only package. No real mining, guaranteed reward, or cash payout.</p>{selectedPackage.stackingPolicy === "replace" && active.length > 0 && <p className="cm-switch-note">This package replaces active package entitlements when confirmed. Previous package purchases are not refunded or prorated.</p>}<div className="cm-form-row"><label>Pay with<select value={paymentAsset} onChange={e=>{setPaymentAsset(e.target.value);setPurchaseQuote(null)}}>{ASSETS.map(asset=><option key={asset}>{asset}</option>)}</select></label><div className="cm-available"><span>Available simulated balance</span><strong>{fmt(availablePayment, 8)} {paymentAsset}</strong></div></div><button type="button" className="cm-secondary-button" disabled={purchaseQuoteMutation.isPending || !selectedCanPurchase} onClick={()=>purchaseQuoteMutation.mutate({packageVersionId:selectedPackage.versionId,paymentAsset})}>{purchaseQuoteMutation.isPending ? "Preparing quote…" : "Request fresh package quote"}<ArrowRight size={14}/></button>
      {purchaseQuote && <div className="cm-quote-card"><div className="cm-quote-title"><BadgeCheck size={15}/> FRESH QUOTE · {purchaseQuote.quoteId}</div><div className="cm-quote-grid"><span>Package price <b>{fmt(purchaseQuote.packagePrice, 8)} {purchaseQuote.packagePriceAsset}</b></span><span>Payment <b>{fmt(purchaseQuote.sourceAmount, 8)} {purchaseQuote.sourceAsset}</b></span><span>Fee <b>{fmt(purchaseQuote.fee, 8)} {purchaseQuote.feeAsset}</b></span><span>Balance check <b>{purchaseQuote.sufficientBalance ? "Sufficient" : "Insufficient"}</b></span></div><small>{purchaseQuote.provider} · observed {dateText(purchaseQuote.priceObservedAt)} · expires {dateText(purchaseQuote.expiresAt)}</small><label className="cm-checkbox cm-ack"><input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/><span>I understand this is simulated mining-style activity only; no real compute, guaranteed returns, or withdrawal is provided.</span></label><button type="button" className="cm-primary-button" disabled={!acknowledged || !purchaseQuote.sufficientBalance || quoteExpired || purchaseMutation.isPending} onClick={()=>purchaseMutation.mutate({quoteId:purchaseQuote.quoteId,idempotencyKey:requestId(),acknowledgedSimulation:acknowledged})}>{quoteExpired ? "Quote expired" : purchaseMutation.isPending ? "Activating package…" : "Confirm simulated package"}<ArrowRight size={15}/></button></div>}
      <div className="cm-modal-note"><Info size={14}/><span>Terms: {selectedPackage.termsText}</span></div></div></div>}
  </div>;
}
