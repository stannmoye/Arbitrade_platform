import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { MiningCoreCanvas } from "./MiningCoreCanvas";
import { MiningSimulationFlow } from "./MiningSimulationFlow";
import { CustomerSlideMenu } from "./CustomerSlideMenu";
import {
  Activity, ArrowDownUp, ArrowRight, BadgeCheck, Bell,
  ChevronDown, ChevronLeft, ChevronRight, Clock3, Cpu, Info,
  RefreshCw, ShieldCheck, Sparkles, WalletCards, Zap,
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
const palette = ["#12a8ff", "#f59a38", "#b4d7ff", "#f4c525", "#825fff", "#20c8d9", "#18d69a", "#ffbf36"];
const currencyIcons: Record<string, string> = { BTC: "₿", USD: "$", EUR: "€", GBP: "£", ETH: "◆", USDT: "₮" };

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
  const [packageTab, setPackageTab] = useState("all");
  const [historyPage, setHistoryPage] = useState(0);
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
      setPurchaseQuote(null); setSelectedPackage(null); setAcknowledged(false);
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
      setSwapQuote(null); void dashboard.refetch(); void history.refetch();
      push(`Simulated full-balance conversion · ${result.receiptReference}`);
      setMessage(`${fmt(result.sourceAmount, 8)} CKI converted to ${fmt(result.destinationAmount, 8)} simulated ${result.destinationAsset}. This is an internal simulation-ledger conversion, not a cash payout.`);
    },
    onError: error => { setSwapQuote(null); void dashboard.refetch(); setMessage(error.message); },
  });
  const swapQuoteMutation = trpc.customer.mining.quoteSwap.useMutation({
    onSuccess: quote => {
      setSwapQuote(quote); setMessage("");
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
  const recent = (history.data || []).slice(0, 30);
  const historyPageCount = Math.max(1, Math.ceil(recent.length / 5));
  const currentHistoryPage = Math.min(historyPage, historyPageCount - 1);
  const pagedRecent = recent.slice(currentHistoryPage * 5, (currentHistoryPage + 1) * 5);
  const latestReward = recent.find((row: any) => row.type === "reward" && row.status === "posted");
  const availableCki = Number(data?.balances?.CKI || data?.tokenBalance || 0);
  const minimumSwapTokens = Number(data?.minSwapTokens || 1);
  const canSwapAll = minimumSwapTokens > 0 && availableCki >= minimumSwapTokens;
  const availableUsd = Number(data?.balances?.USD || 0);
  const dailyUsdReference = (Number(data?.estimatedDailyTokens || 0) * Number(data?.usdPerToken || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dummyUsdReference = Number(data?.usdPerToken || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nextRewardAt = data?.nextRewardAt ? new Date(data.nextRewardAt).getTime() : null;
  const nextRewardCountdown = nextRewardAt ? durationText(Math.max(0, Math.ceil((nextRewardAt - now) / 1000))) : "—:—:—";
  const selectedCanPurchase = selectedPackage?.status === "published" && Boolean(data?.miningStatus && !String(data.miningStatus).startsWith("Paused"));
  const availablePayment = useMemo(() => String(data?.balances?.[paymentAsset] || "0"), [data?.balances, paymentAsset]);
  const quoteExpired = purchaseQuote ? new Date(purchaseQuote.expiresAt).getTime() <= now : false;
  const swapExpired = swapQuote ? new Date(swapQuote.expiresAt).getTime() <= now : false;
  const activeBoostEnds = boost?.activeBoost?.endsAt ? new Date(boost.activeBoost.endsAt).getTime() : null;
  const cycleTarget = boost?.nextEligibleAt ? new Date(boost.nextEligibleAt).getTime() : null;
  const cycleIsActionable = Boolean(boost?.ready || boost?.activeBoost || boost?.reason?.toLowerCase().includes("cycle"));
  const countdownTarget = activeBoostEnds || (cycleIsActionable && cycleTarget && cycleTarget > now ? cycleTarget : null);
  const boostCountdown = activeBoostEnds || countdownTarget
    ? durationText(Math.max(0, Math.ceil(((activeBoostEnds || countdownTarget)! - now) / 1000)))
    : boost?.ready ? "READY NOW" : "—";
  const boostStatusLabel = boost?.activeBoost ? "BOOST ENDS IN" : boost?.ready ? "BOOST READY" : cycleIsActionable ? "BOOST READY IN" : "BOOST UNAVAILABLE";
  const cycleStart = boost?.cycleStart ? new Date(boost.cycleStart).getTime() : null;
  const nextBoostTime = boost?.nextEligibleAt ? new Date(boost.nextEligibleAt).getTime() : null;
  const boostCycleCharge = boost?.ready || boost?.activeBoost ? 100 : cycleIsActionable && cycleStart && nextBoostTime && nextBoostTime > cycleStart
    ? Math.max(0, Math.min(100, Math.round((now - cycleStart) / (nextBoostTime - cycleStart) * 100))) : 0;
  const activeBase = Number(data?.baseThs || 0);
  const activeHashPower = activeBase + (Number(boost?.activeBoost?.bonusThs) || 0);
  const hasActiveHashPowerPackage = active.some((item: any) => item.status === "active");
  const activeBoostCapacity = active.reduce((sum: number, item: any) => sum + (Number.isFinite(Number(item.boostBonusThs)) ? Number(item.boostBonusThs) : 0), 0);
  const activePackageNames = active.length ? active.slice(0, 3).map((item: any) => item.packageName).join(" · ") + (active.length > 3 ? ` · +${active.length - 3} more` : "") : "No active package entitlement";
  const engineIsRunning = Boolean(data?.miningStatus && !String(data.miningStatus).toLowerCase().includes("paused") && !String(data.miningStatus).toLowerCase().includes("disabled"));
  const filteredPackages = packageRows.filter((item: any) => {
    if (packageTab === "mine") return active.some((current: any) => current.code === item.code);
    if (packageTab === "upgrade") return Number(item.baseThs) > activeBase;
    if (packageTab === "downgrade") return Number(item.baseThs) < activeBase;
    return true;
  });

  const startFullBalanceSwap = () => {
    if (!canSwapAll) return;
    setSwapQuote(null);
    swapQuoteMutation.mutate({ tokenAmount: String(data?.tokenBalance || data?.balances?.CKI || "0"), targetAsset: swapTarget });
  };
  const activateBoost = () => boostMutation.mutate({ idempotencyKey: requestId() });
  const goTo = (section: string) => {
    if (section !== "crypto-mining") window.dispatchEvent(new CustomEvent("arbitrade:customer-navigate", { detail: section }));
  };
  const toggleFullscreen = () => {
    const el = document.querySelector(".cm-factory") as HTMLElement | null;
    if (!el) return;
    if (!document.fullscreenElement) void el.requestFullscreen?.();
    else void document.exitFullscreen?.();
  };

  return <div className="cm-dashboard-frame">
    <CustomerSlideMenu section="crypto-mining" onNavigate={goTo} />
    <header className="cm-topbar">
      <a className="cm-brand" href="#mining-dashboard" onClick={e=>e.preventDefault()} aria-label="CoinKi mining dashboard home">
        <span className="cm-brand-mark">₵</span><span><strong>CoinKi</strong><small>Mine Today, Build Tomorrow</small></span>
      </a>
      <div className="cm-header-summaries" aria-label="Mining wallet summary">
        <div className="cm-header-summary">
          <span>LIVE CKI WALLET BALANCE</span>
          <strong>{fmt(availableCki, 6)} CKI</strong>
          <small>Server-posted · database-backed</small>
        </div>
        <div className="cm-header-summary">
          <span>ACCRUAL IN PROGRESS</span>
          <strong>+{fmt(data?.pendingTokens, 6)} CKI</strong>
          <small>Estimate only · not in wallet</small>
        </div>
        <div className="cm-header-summary">
          <span>DUMMY CONVERSION PREVIEW</span>
          <strong>1 CKI → ≈${dummyUsdReference}</strong>
          <small>USD reference · not executed</small>
        </div>
      </div>
      <div className="cm-top-actions"><span className="cm-top-email">{data?.miningStatus || "Mining workspace"}</span><button type="button" className="cm-top-icon" onClick={()=>{void dashboard.refetch();void packages.refetch()}} aria-label="Refresh dashboard"><Bell size={19}/><i/></button><button type="button" className="cm-profile-chip" onClick={()=>goTo("account")}><span className="cm-profile-avatar">{tokenSymbol.slice(0,1)}</span><span><small>YOUR ACCOUNT</small><strong>Mining customer</strong></span><ChevronDown size={15}/></button></div>
    </header>

    <main className="cm-dashboard-main" id="mining-dashboard">
      {message && <div className="cm-message" role="status"><Info size={15}/><span>{message}</span><button type="button" onClick={()=>setMessage("")} aria-label="Dismiss">×</button></div>}
      {dashboard.error && <div className="cm-error" role="alert">Mining service unavailable: {dashboard.error.message}</div>}

      <section className="cm-top-grid" aria-label="Mining engine status and controls">
        <article className="cm-factory scene-playing">
          <div className="cm-factory-scene cm-core-canvas-host" aria-hidden="true">
            <MiningCoreCanvas running={engineIsRunning && hasActiveHashPowerPackage} playing={true} boosted={Boolean(boost?.activeBoost)} hashPowerThs={activeHashPower} rewardPulseKey={Number(data?.todayTokens || 0)}/>
          </div>
          <div className="cm-factory-shade"/>
          <div className="cm-factory-label"><span><Cpu size={16}/> MINING ENGINE</span><b className={hasActiveHashPowerPackage?"online":"offline"}><i/>{hasActiveHashPowerPackage?"HASH-POWER PACKAGE ACTIVE":"NO ACTIVE HASH-POWER PACKAGE"}</b></div>
          <div className="cm-video-controls"><button type="button" className="cm-fullscreen-control" onClick={toggleFullscreen} aria-label="Toggle mining engine fullscreen" title="Toggle mining engine fullscreen">⛶</button></div>
        </article>

        <div className="cm-side-stack">
          <article className="cm-glass cm-progress-card">
            <div className="cm-progress-copy">
              <div className="cm-progress-head"><span className="cm-eyebrow">MINING IN PROGRESS</span><strong className="cm-status-time">{engineIsRunning?nextRewardCountdown:"—:—:—"}</strong><small>Next reward in</small></div>
              <div className="cm-divider"/>
              <div className="cm-progress-metrics">
                <div className="cm-progress-metric"><span className="cm-eyebrow">TOKENS GENERATED</span><strong className="cm-token-amount">{fmt(data?.todayTokens,4)} <small>{tokenSymbol}</small></strong><span className="cm-positive">↗ +{fmt(engineIsRunning?data?.pendingTokens:0,4)} {engineIsRunning?"(in progress)":"· cycle paused"}</span></div>
                <div className="cm-progress-metric"><span className="cm-eyebrow">EST. DAILY EARNINGS</span><strong className="cm-daily-amount">{fmt(data?.estimatedDailyTokens,2)} <small>{tokenSymbol}</small></strong><small className="cm-simulation-note">≈ ${dailyUsdReference} USD</small></div>
              </div>
              <div className="cm-coin-display"><span className="cm-coin-glow"/><b>₵</b><small>{tokenSymbol}</small></div>
              <div className="cm-mining-vault" aria-hidden="true"><span className="cm-vault-frame"/><span className="cm-vault-beam"/><span className="cm-vault-spark spark-a"/><span className="cm-vault-spark spark-b"/><span className="cm-vault-spark spark-c"/><div className="cm-vault-coin">₵</div><span className="cm-vault-platform"/><span className="cm-vault-orbit"/></div>
            </div>
          </article>
          <article className={`cm-glass cm-boost-card ${boost?.ready?"is-ready":"is-locked"}`}>
            <div className="cm-boost-machine" role="img" aria-label="Animated Hash Power Engine simulation"><span className="cm-engine-aura"/><span className="cm-engine-pipe cm-engine-pipe-left"/><span className="cm-engine-pipe cm-engine-pipe-right"/><div className="cm-engine-shell"><span className="cm-engine-topcap"/><span className="cm-engine-front-glass"/><span className="cm-engine-rotor"><i/><i/><b/></span><span className="cm-engine-vents"/><span className="cm-engine-mark"/><span className="cm-engine-leds"><i/><i/><i/></span><span className="cm-engine-base"/></div></div>
            <div className="cm-boost-copy"><div className="cm-boost-topline"><b>HASH POWER ENGINE</b><span className="cm-boost-readout"><small>{boostStatusLabel}</small><strong>{boostCountdown}</strong></span></div><div className="cm-boost-bottomline"><span className="cm-boost-charge" role="progressbar" aria-label="Boost charge" aria-valuenow={boostCycleCharge} aria-valuemin={0} aria-valuemax={100} title={boost?.reason || "One boost is available per server cycle."}><i style={{width:`${boostCycleCharge}%`}}/></span></div></div>
            <button type="button" className="cm-glow-button" title={boost?.reason || "Activate Hash Power Boost"} aria-label="Activate Hash Power Boost" disabled={boostMutation.isPending || !boost?.ready} onClick={activateBoost}><ArrowDownUp size={15}/>{boostMutation.isPending?"Activating…":"Activate Boost"}</button>
          </article>
        </div>

      </section>

      <MiningSimulationFlow
        activePackageName={activePackageNames}
        hashPowerThs={activeHashPower}
        walletCki={availableCki}
        latestRewardReference={latestReward?.reference}
        latestRewardCreatedAt={latestReward?.createdAt}
      />

      <section className="cm-wallet-hash-grid" aria-label="Mining wallet and hash rate">
        <article className="cm-glass cm-wallet-card"><div className="cm-wallet-total"><div className="cm-card-title"><span className="cm-icon-cyan"><WalletCards size={19}/></span><b>{tokenSymbol} WALLET BALANCE</b></div><div className="cm-wallet-value"><span className="cm-wallet-coin">₵</span><div><small>Total {tokenSymbol}</small><strong>{fmt(data?.balances?.CKI ?? data?.tokenBalance,6)} <small>{tokenSymbol}</small></strong><span className="cm-positive">{fmt(data?.todayTokens,6)} today · modeled</span></div></div></div><div className="cm-wallet-currencies"><div className="cm-currency-list">{TARGET_ASSETS.map(asset=><button type="button" key={asset} className={`cm-currency ${swapTarget===asset?"selected":""}`} onClick={()=>setSwapTarget(asset)} aria-pressed={swapTarget===asset}><i className={`currency-${asset.toLowerCase()}`}>{currencyIcons[asset]}</i><small>{asset}</small></button>)}</div><button type="button" className="cm-glow-button cm-swap-all" disabled={!canSwapAll || swapQuoteMutation.isPending || swapMutation.isPending} onClick={startFullBalanceSwap}><ArrowDownUp size={15}/>{swapMutation.isPending?"Posting conversion…":`Swap All to ${swapTarget}`}</button>{!canSwapAll&&<small className="cm-swap-note">Minimum {fmt(minimumSwapTokens,8)} {tokenSymbol} required to swap</small>}</div></article>
        <article className="cm-glass cm-hash-card"><div className="cm-card-title"><span className="cm-icon-cyan"><Zap size={19}/></span><b>CURRENT HASH RATE</b></div><div className="cm-hash-content"><div><strong>{fmt(data?.activeThs,3)} <small>TH/s</small></strong><span className="cm-positive">Base {fmt(data?.baseThs,3)} · Boost {fmt(data?.boostThs,3)} TH/s</span></div><div className="cm-hash-details"><small>Total Power</small><b>{fmt(data?.activeThs,3)} TH/s</b><small>Package</small><b>{activePackageNames}</b></div><svg className="cm-sparkline" viewBox="0 0 170 70" preserveAspectRatio="none" aria-label="Illustrative hash rate trace"><defs><linearGradient id="cm-hash-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#10d9ff" stopOpacity=".35"/><stop offset="1" stopColor="#10d9ff" stopOpacity="0"/></linearGradient></defs><path d="M0 54 C12 47 12 24 25 32 S42 54 52 39 S66 11 78 28 S94 49 105 35 S124 52 135 25 S153 32 170 5 L170 70 L0 70Z" fill="url(#cm-hash-fill)"/><path d="M0 54 C12 47 12 24 25 32 S42 54 52 39 S66 11 78 28 S94 49 105 35 S124 52 135 25 S153 32 170 5" fill="none" stroke="#18dfff" strokeWidth="2"/></svg></div></article>
      </section>

      <section className="cm-glass cm-packages-panel">
        <div className="cm-packages-header"><div><h2>Mining Packages</h2><p>Choose from packages currently published by operations</p></div><div className="cm-package-tabs" role="tablist" aria-label="Filter packages">{[["all","All Packages"],["mine","My Packages"],["upgrade","Upgrade"],["downgrade","Downgrade"]].map(([id,label])=><button type="button" role="tab" aria-selected={packageTab===id} className={packageTab===id?"selected":""} key={id} onClick={()=>setPackageTab(id)}>{label}</button>)}</div><button className="cm-refresh-button" type="button" onClick={()=>{void packages.refetch();void dashboard.refetch()}} aria-label="Refresh packages"><RefreshCw size={15}/></button></div>
        {active.length>0&&<div className="cm-active-note"><Cpu size={14}/><b>YOUR ACTIVE CAPACITY</b><span>{activePackageNames} · {fmt(activeBase,3)} TH/s</span></div>}
        <div className="cm-package-carousel">
          {packages.isLoading&&<div className="cm-empty">Loading published packages…</div>}
          {!packages.isLoading&&!filteredPackages.length&&<div className="cm-empty">{packageRows.length?"No packages match this filter.":"No mining packages are currently published. Package terms and prices will appear here after operations publishes them."}</div>}
          {filteredPackages.map((item:any,index:number)=>{
            const activeSame=active.some((current:any)=>current.code===item.code);
            const replaces=item.stackingPolicy==="replace"&&active.length>0;
            const intent=!replaces?"Choose package":Number(item.baseThs)>activeBase?"Upgrade plan":Number(item.baseThs)<activeBase?"Switch plan":"Change plan";
            const color=palette[index%palette.length];
            return <article className={`cm-package-card ${activeSame?"is-current":""}`} key={item.versionId} style={{"--package-accent":color} as React.CSSProperties}>
              <div className="cm-package-art"><div className="cm-cube"><i/><i/><b>₵</b></div><span className="cm-package-glow"/></div>
              <div className="cm-package-label"><h3>{item.name}</h3><span>{activeSame?"ACTIVE":item.status==="published"?"AVAILABLE":"PAUSED"}</span></div>
              <div className="cm-package-price"><strong>{fmt(item.priceAmount,2)}</strong><small>{item.priceAsset}</small></div>
              <div className="cm-package-facts"><b>{fmt(item.baseThs,3)} <small>TH/s</small></b><span>Boost +{fmt(item.boostBonusThs,3)} TH/s</span><span>Est. {fmt(item.estimatedDailyTokens,5)} {item.tokenSymbol||tokenSymbol}/day</span></div>
              <button type="button" className="cm-package-buy" disabled={!selectedCanPurchase||item.status!=="published"} onClick={()=>{setSelectedPackage(item);setPurchaseQuote(null);setAcknowledged(false)}}>{selectedCanPurchase&&item.status==="published"?intent:"Unavailable"}<ArrowRight size={13}/></button>
            </article>;
          })}
        </div>
      </section>

      <section className="cm-bottom-strip" aria-label="Mining platform features"><div><Cpu/><span><b>SIMULATED MINING</b><small>Server-posted records</small></span></div><div><Activity/><span><b>LIVE ACCOUNT DATA</b><small>Refreshes every few seconds</small></span></div><div><ArrowDownUp/><span><b>INTERNAL SWAPS</b><small>Quote and ledger guarded</small></span></div><div><Zap/><span><b>HASH POWER BOOST</b><small>{boost?.activeBoost?"Active now":"Time-limited simulation"}</small></span></div><div><ShieldCheck/><span><b>ACCOUNT SECURITY</b><small>Customer session protected</small></span></div></section>

      <details className="cm-advanced-conversion"><summary><span><Sparkles size={16}/><b>Automatic conversion preferences</b><small>Future rewards only · Version {data?.conversionPreference?.version||0}</small></span><ChevronDown size={16}/></summary><p>Optional background conversion for eligible future reward intervals. A failed or stale quote leaves CKI in your wallet. This preference does not convert your existing balance.</p><div className="cm-auto-controls"><label className="cm-checkbox"><input type="checkbox" checked={prefEnabled} onChange={e=>setPrefEnabled(e.target.checked)}/><span>Automatically convert eligible future rewards</span></label><label>Destination<select value={prefTarget} onChange={e=>setPrefTarget(e.target.value)}>{TARGET_ASSETS.map(asset=><option key={asset}>{asset}</option>)}</select></label><label>Minimum {tokenSymbol}<input value={prefThreshold} onChange={e=>setPrefThreshold(e.target.value)} inputMode="decimal"/></label><button type="button" className="cm-secondary-button" disabled={preferenceMutation.isPending} onClick={()=>preferenceMutation.mutate({enabled:prefEnabled,targetDenomination:prefTarget,minimumThreshold:prefThreshold})}>{preferenceMutation.isPending?"Saving…":"Save preference"}</button></div><div className="cm-queue-note"><Clock3 size={14}/> Pending conversion jobs: <strong>{data?.pendingConversionJobs||0}</strong></div></details>

      <section className="cm-glass cm-history">
        <div className="cm-history-heading">
          <div>
            <span className="cm-eyebrow">IMMUTABLE SIMULATION RECEIPTS</span>
            <h2>Mining activity</h2>
            <small className="cm-history-count">Latest 30 entries · 5 per page</small>
          </div>
          <button className="cm-refresh-button" type="button" onClick={() => history.refetch()} aria-label="Refresh activity"><RefreshCw size={15}/></button>
        </div>
        {history.isLoading ? <div className="cm-empty">Loading ledger history…</div> : !recent.length ? <div className="cm-empty">No Mining transactions have been recorded yet.</div> : <>
          <div className="cm-table-wrap">
            <table className="cm-table">
              <thead><tr><th>Event</th><th>Reference</th><th>Status</th><th>When</th></tr></thead>
              <tbody>{pagedRecent.map((row: any) => <tr key={row.id}>
                <td><strong>{String(row.type).replaceAll("_", " ")}</strong>{row.details?.destinationAmount && <small>{fmt(row.details.destinationAmount, 8)} {row.details.destinationAsset}</small>}</td>
                <td>{row.reference}</td>
                <td><span className="cm-history-status">{row.status}</span></td>
                <td>{dateText(row.createdAt)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {recent.length > 5 && <nav className="cm-history-pagination" aria-label="Mining activity pages">
            <span>Showing {currentHistoryPage * 5 + 1}–{Math.min((currentHistoryPage + 1) * 5, recent.length)} of {recent.length} latest</span>
            <div className="cm-history-pagination-controls">
              <button className="cm-history-page-btn" type="button" onClick={() => setHistoryPage(Math.max(0, currentHistoryPage - 1))} disabled={currentHistoryPage === 0} aria-label="Previous activity page"><ChevronLeft size={14}/><span>Previous</span></button>
              <span className="cm-page-indicator">Page {currentHistoryPage + 1} of {historyPageCount}</span>
              <button className="cm-history-page-btn" type="button" onClick={() => setHistoryPage(Math.min(historyPageCount - 1, currentHistoryPage + 1))} disabled={currentHistoryPage >= historyPageCount - 1} aria-label="Next activity page"><span>Next</span><ChevronRight size={14}/></button>
            </div>
          </nav>}
        </>}
      </section>

      <footer className="cm-disclaimer"><ShieldCheck size={15}/><span>Mining artwork and estimates are illustrative. CKI recorded by the server is part of an isolated simulation ledger; the internal USD reference is not an exchange execution, payout, guaranteed return, or withdrawal.</span><b>Economics v{data?.economicsVersion||"—"}</b></footer>
    </main>

    {selectedPackage&&<div className="cm-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget){setSelectedPackage(null);setPurchaseQuote(null)}}}><div className="cm-modal" role="dialog" aria-modal="true" aria-labelledby="cm-buy-title"><button className="cm-modal-close" type="button" onClick={()=>{setSelectedPackage(null);setPurchaseQuote(null)}} aria-label="Close">×</button><span className="cm-eyebrow">PACKAGE REVIEW · VERSION {selectedPackage.version}</span><h2 id="cm-buy-title">{selectedPackage.name}</h2><p className="cm-modal-disclosure">Simulation-only package. No real mining, guaranteed reward, or cash payout.</p>{selectedPackage.stackingPolicy==="replace"&&active.length>0&&<p className="cm-switch-note">This package replaces active package entitlements when confirmed. Previous package purchases are not refunded or prorated.</p>}<div className="cm-form-row"><label>Pay with<select value={paymentAsset} onChange={e=>{setPaymentAsset(e.target.value);setPurchaseQuote(null)}}>{ASSETS.map(asset=><option key={asset}>{asset}</option>)}</select></label><div className="cm-available"><span>Available simulated balance</span><strong>{fmt(availablePayment,8)} {paymentAsset}</strong></div></div><button type="button" className="cm-secondary-button" disabled={purchaseQuoteMutation.isPending||!selectedCanPurchase} onClick={()=>purchaseQuoteMutation.mutate({packageVersionId:selectedPackage.versionId,paymentAsset})}>{purchaseQuoteMutation.isPending?"Preparing quote…":"Request fresh package quote"}<ArrowRight size={14}/></button>{purchaseQuote&&<div className="cm-quote-card"><div className="cm-quote-title"><BadgeCheck size={15}/> FRESH QUOTE · {purchaseQuote.quoteId}</div><div className="cm-quote-grid"><span>Package price <b>{fmt(purchaseQuote.packagePrice,8)} {purchaseQuote.packagePriceAsset}</b></span><span>Payment <b>{fmt(purchaseQuote.sourceAmount,8)} {purchaseQuote.sourceAsset}</b></span><span>Fee <b>{fmt(purchaseQuote.fee,8)} {purchaseQuote.feeAsset}</b></span><span>Balance check <b>{purchaseQuote.sufficientBalance?"Sufficient":"Insufficient"}</b></span></div><small>{purchaseQuote.provider} · observed {dateText(purchaseQuote.priceObservedAt)} · expires {dateText(purchaseQuote.expiresAt)}</small><label className="cm-checkbox cm-ack"><input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/><span>I understand this is simulated mining-style activity only; no real compute, guaranteed returns, or withdrawal is provided.</span></label><button type="button" className="cm-primary-button" disabled={!acknowledged||!purchaseQuote.sufficientBalance||quoteExpired||purchaseMutation.isPending} onClick={()=>purchaseMutation.mutate({quoteId:purchaseQuote.quoteId,idempotencyKey:requestId(),acknowledgedSimulation:acknowledged})}>{quoteExpired?"Quote expired":purchaseMutation.isPending?"Activating package…":"Confirm simulated package"}<ArrowRight size={15}/></button></div>}<div className="cm-modal-note"><Info size={14}/><span>Terms: {selectedPackage.termsText}</span></div></div></div>}
  </div>;
}
