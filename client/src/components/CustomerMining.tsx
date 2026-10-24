import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import "../factory-cockpit.css";
import { MiningCoreCanvas } from "./MiningCoreCanvas";
import { MiningOperationsFlow } from "./MiningOperationsFlow";
import { CustomerSlideMenu } from "./CustomerSlideMenu";
import {
  Activity, ArrowDownUp, ArrowRight,
  ChevronDown, ChevronLeft, ChevronRight, Clock3, Cpu, Info,
  RefreshCw, ShieldCheck, Sparkles, WalletCards, Zap,
} from "lucide-react";

const TARGET_ASSETS = ["USD", "EUR", "GBP", "BTC", "ETH", "USDT"];
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
  const walletPreferences = trpc.customer.walletPreferences.useQuery(undefined, { refetchInterval: 30000 });
  const mainWallet = trpc.customer.balances.useQuery(undefined, { refetchInterval: 10000 });

  const [now, setNow] = useState(Date.now());
  const [swapQuote, setSwapQuote] = useState<any | null>(null);
  const [swapTarget, setSwapTarget] = useState("");
  const [packageTab, setPackageTab] = useState("all");
  const [historyPage, setHistoryPage] = useState(0);
  const [prefEnabled, setPrefEnabled] = useState(false);
  const [prefTarget, setPrefTarget] = useState("USD");
  const [prefThreshold, setPrefThreshold] = useState("0");
  const [message, setMessage] = useState("");
  const boostAudioRef = useRef<HTMLAudioElement | null>(null);

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

  useEffect(() => {
    const preferredSwap = String(walletPreferences.data?.swapCurrency || "").toUpperCase();
    if (TARGET_ASSETS.includes(preferredSwap)) setSwapTarget(preferredSwap);
  }, [walletPreferences.data?.tradingCurrency, walletPreferences.data?.swapCurrency]);

  const purchaseMutation = trpc.customer.mining.purchasePackage.useMutation({
    onSuccess: result => {
      void dashboard.refetch(); void mainWallet.refetch(); void history.refetch(); void packages.refetch();
      push(`${result.packageName} purchased · ${result.receiptReference}`);
      setMessage(`${result.packageName} is active from ${dateText(result.startsAt)}. ${result.paymentAmount} ${result.paymentAsset} was immediately debited from your main wallet. ${result.rewardPostingReady ? "Eligible CKI rewards are processed automatically." : "Reward processing is currently paused or this package has no configured daily CKI rate."}`);
    },
    onError: error => setMessage(error.message),
  });
  const boostMutation = trpc.customer.mining.activateBoost.useMutation({
    onSuccess: result => { void dashboard.refetch(); void boostStatus.refetch(); void history.refetch(); push(`Boost activated until ${dateText(result.endsAt)}`); setMessage(`Package boost active until ${dateText(result.endsAt)}. It is next available after the customer-specific cooldown.`); },
    onError: error => setMessage(error.message),
  });
  const preferenceMutation = trpc.customer.mining.updateConversionPreference.useMutation({
    onSuccess: result => { void dashboard.refetch(); setMessage(`Conversion preference saved as version ${result.version}. It applies to future reward events.`); },
    onError: error => setMessage(error.message),
  });
  const mainWalletPreferenceMutation = trpc.customer.updateWalletPreferences.useMutation({
    onSuccess: () => { void walletPreferences.refetch(); },
    onError: error => setMessage(error.message),
  });
  const swapMutation = trpc.customer.mining.confirmSwap.useMutation({
    onSuccess: result => {
      setSwapQuote(null); void dashboard.refetch(); void mainWallet.refetch(); void history.refetch();
      push(`CKI converted to ${result.destinationAsset} main wallet · ${result.receiptReference}`);
      setMessage(`${fmt(result.sourceAmount, 8)} CKI converted to ${fmt(result.destinationAmount, 8)} ${result.destinationAsset} and credited to your main wallet. This does not initiate a payout; CKI itself is not a payout currency.`);
    },
    onError: error => { setSwapQuote(null); void dashboard.refetch(); void mainWallet.refetch(); setMessage(error.message); },
  });
  const swapQuoteMutation = trpc.customer.mining.quoteSwap.useMutation({
    onSuccess: quote => {
      setSwapQuote(quote); setMessage("");
      swapMutation.mutate({ quoteId: quote.quoteId, idempotencyKey: requestId() });
    },
    onError: error => setMessage(error.message),
  });

  const data = dashboard.data;
  const tokenName = data?.tokenName ?? "";
  const tokenSymbol = data?.tokenSymbol ?? "";
  const minedTodayDisplay = data ? `+${fmt(data.todayTokens, 6)} ${tokenSymbol || "CKI"}` : dashboard.isLoading ? "Loading…" : "0 CKI";
  const packageRows = packages.data || [];
  const boost = boostStatus.data;
  const boostCapacityAvailable = Number.isFinite(Number(boost?.bonusThsAvailable)) && Number(boost?.bonusThsAvailable) > 0;
  const active = data?.packages || [];
  const recent = (history.data || []).slice(0, 30);
  const historyPageCount = Math.max(1, Math.ceil(recent.length / 5));
  const currentHistoryPage = Math.min(historyPage, historyPageCount - 1);
  const pagedRecent = recent.slice(currentHistoryPage * 5, (currentHistoryPage + 1) * 5);
  const latestReward = recent.find((row: any) => row.type === "reward" && row.status === "posted");
  const availableCki = Number(data?.balances?.CKI || data?.tokenBalance || 0);
  const canSwapAll = availableCki > 0 && Boolean(swapTarget);
  const mainWalletAvailable = (asset: string) => {
    const currency = mainWallet.data?.currencies?.find((item: any) => item.code === asset);
    const balance = mainWallet.data?.balances?.find((item: any) => item.currency === asset);
    const scale = Number(currency?.scale ?? 0);
    return Number(balance?.availableMinor ?? 0) / (10 ** scale);
  };
  const mainWalletScale = (asset: string) => Number(mainWallet.data?.currencies?.find((item: any) => item.code === asset)?.scale ?? 0);
  const availableUsd = mainWalletAvailable("USD");
  const dailyUsdReference = (Number(data?.estimatedDailyTokens || 0) * Number(data?.usdPerToken || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const configuredUsdReference = Number(data?.usdPerToken || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const swapExpired = swapQuote ? new Date(swapQuote.expiresAt).getTime() <= now : false;
  const activeBoostEnds = boost?.activeBoost?.endsAt ? new Date(boost.activeBoost.endsAt).getTime() : null;
  const cycleStart = boost?.cycleStart ? new Date(boost.cycleStart).getTime() : null;
  const nextBoostTime = boost?.nextEligibleAt ? new Date(boost.nextEligibleAt).getTime() : null;
  const isBoostActive = Boolean(boost?.activeBoost && activeBoostEnds && activeBoostEnds > now);
  const isCoolingDown = Boolean(!boost?.ready && !isBoostActive && cycleStart && nextBoostTime && nextBoostTime > now);
  const countdownTarget = activeBoostEnds || (isCoolingDown ? nextBoostTime : null);
  useEffect(() => {
    const shouldPlay = Boolean(boost?.activeBoost);
    if (shouldPlay) {
      const audio = boostAudioRef.current || new Audio("/audio/boost/mixkit-1093.mp3");
      boostAudioRef.current = audio;
      audio.loop = true;
      audio.volume = 0.55;
      void audio.play().catch(() => { /* browsers require a user gesture; activation click retries below */ });
    } else if (boostAudioRef.current) {
      boostAudioRef.current.pause();
      boostAudioRef.current.currentTime = 0;
    }
    return () => {
      if (boostAudioRef.current && !shouldPlay) { boostAudioRef.current.pause(); boostAudioRef.current.currentTime = 0; }
    };
  }, [boost?.activeBoost?.startedAt, boost?.activeBoost?.endsAt]);

  const boostCountdown = countdownTarget
    ? durationText(Math.max(0, Math.ceil(((activeBoostEnds || countdownTarget)! - now) / 1000)))
    : boost?.ready ? "READY NOW" : "—";
  const boostStatusLabel = isBoostActive ? "BOOST ACTIVE · ENDS IN" : boost?.ready ? "BOOST READY" : isCoolingDown ? "BOOST READY IN" : "BOOST UNAVAILABLE";
  const boostCycleCharge = isBoostActive && boost?.activeBoost?.startedAt && activeBoostEnds
    ? Math.max(0, Math.min(100, Math.round((activeBoostEnds - now) / (activeBoostEnds - new Date(boost.activeBoost.startedAt).getTime()) * 100)))
    : boost?.ready ? 100 : isCoolingDown && cycleStart && nextBoostTime
      ? Math.max(0, Math.min(100, Math.round((now - cycleStart) / (nextBoostTime - cycleStart) * 100))) : 0;
  const boostPhase = isBoostActive ? "active" : isCoolingDown ? "cooldown" : boost?.ready ? "ready" : "unavailable";
  const activeBase = Number(data?.baseThs || 0);
  const activeHashPower = activeBase + (Number(boost?.activeBoost?.bonusThs) || 0);
  const globalHashPowerDisplay = dashboard.isLoading || dashboard.isError ? "—" : fmt(data?.globalHashPowerThs, 3);
  const currentHashRateDisplay = dashboard.isLoading || dashboard.isError ? "—" : fmt(activeHashPower, 3);
  const hasActiveHashPowerPackage = active.some((item: any) => item.status === "active");
  const activeBoostCapacity = active.reduce((sum: number, item: any) => sum + (Number.isFinite(Number(item.boostBonusThs)) ? Number(item.boostBonusThs) : 0), 0);
  const activePackageNames = active.length ? active.slice(0, 3).map((item: any) => item.packageName).join(" · ") + (active.length > 3 ? ` · +${active.length - 3} more` : "") : "No active package entitlement";
  const engineIsRunning = hasActiveHashPowerPackage;
  const filteredPackages = packageRows.filter((item: any) => {
    if (packageTab === "mine") return Boolean(item.alreadyPurchased) || active.some((current: any) => current.code === item.code);
    if (packageTab === "upgrade") return Number(item.baseThs) > activeBase;
    if (packageTab === "downgrade") return Number(item.baseThs) < activeBase;
    return true;
  });

  const startFullBalanceSwap = () => {
    if (!canSwapAll) return;
    setSwapQuote(null);
    swapQuoteMutation.mutate({ tokenAmount: String(data?.balances?.CKI ?? data?.tokenBalance ?? "0"), targetAsset: swapTarget });
  };
  const selectSwapTarget = (asset: string) => {
    setSwapTarget(asset);
    mainWalletPreferenceMutation.mutate({ swapCurrency: asset });
  };
  const activateBoost = () => { const audio = boostAudioRef.current || new Audio("/audio/boost/mixkit-1093.mp3"); boostAudioRef.current = audio; audio.loop = true; audio.volume = 0.55; void audio.play().catch(() => {}); boostMutation.mutate({ idempotencyKey: requestId() }); };
  const goTo = (section: string) => {
    if (section !== "crypto-mining") window.dispatchEvent(new CustomEvent("arbitrade:customer-navigate", { detail: section }));
  };
  const toggleFullscreen = () => {
    const el = document.querySelector(".cm-factory") as HTMLElement | null;
    if (!el) return;
    if (!document.fullscreenElement) void el.requestFullscreen?.();
    else void document.exitFullscreen?.();
  };

  return <div className="cm-dashboard-frame arb-page">
    <CustomerSlideMenu section="crypto-mining" onNavigate={goTo} />
    <header className="cm-topbar">
      <a className="cm-brand" href="#mining-dashboard" onClick={e=>e.preventDefault()} aria-label="CoinKi mining dashboard home">
        <span className="cm-brand-mark">₵</span><span><strong>CoinKi</strong><small>Mine Today, Build Tomorrow</small></span>
      </a>
      <div className="cm-header-summaries" aria-label="Mining wallet summary">
        <div className="cm-header-summary">
          <span>CKI BALANCE</span>
          <strong>{fmt(availableCki, 6)} CKI</strong>
        </div>
        <div className="cm-header-summary">
          <span>MINED TODAY</span>
          <strong className="cm-mined-today-value" aria-live="polite">{minedTodayDisplay}</strong>
        </div>
        <div className="cm-header-summary">
          <span>CKI RATE TO DOLLAR</span>
          <strong>1 CKI → ≈${configuredUsdReference}</strong>
        </div>
      </div>
      <div className="cm-top-actions"><div className="cm-asset-strip" aria-label="Available wallet assets">{(mainWallet.data?.currencies || []).map((currency: any) => <span className="cm-asset-chip" key={currency.code} title={currency.name}><b>{currency.code}</b><small>{currency.symbol || ""}{fmt(mainWalletAvailable(currency.code), Number(currency.scale ?? 0))}</small></span>)}</div></div>
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
          <div className="cm-factory-label"><span><Cpu size={16}/> MINING ENGINE</span><b className={hasActiveHashPowerPackage?"online":"offline"}><i aria-hidden="true"/>{hasActiveHashPowerPackage?"MINING STATUS ACTIVE":"MINING STATUS INACTIVE"}</b></div>
          <div className="cm-video-controls" role="group" aria-label="Mining engine hash-rate readouts and fullscreen control">
            <div className="cm-engine-hash-readouts">
              <div className="cm-engine-hash-stat" title="Signed-in account's current hash rate, including any active boost.">
                <span>CURRENT HASH RATE</span><strong>{currentHashRateDisplay} <small>TH/s</small></strong>
              </div>
              <div className="cm-engine-hash-stat" title="Global Hash Power configured by operations and shown consistently to every customer.">
                <span>GLOBAL HASH POWER</span><strong>{globalHashPowerDisplay} <small>TH/s</small></strong>
              </div>
            </div>
            <button type="button" className="cm-fullscreen-control" onClick={toggleFullscreen} aria-label="Toggle mining engine fullscreen" title="Toggle mining engine fullscreen">⛶</button>
          </div>
        </article>

        <div className="cm-side-stack">
          <article className="cm-glass cm-progress-card">
            <div className="cm-progress-copy">
              <div className="cm-progress-head"><span className="cm-eyebrow">HASH-POWER ENGINE</span><strong className="cm-status-time">{hasActiveHashPowerPackage?"ACTIVE":"IDLE"}</strong><small>{hasActiveHashPowerPackage?"Customer package is active":"No active package"}</small></div>
              <div className="cm-divider"/>
              <div className="cm-progress-metrics">
                <div className="cm-progress-metric"><span className="cm-eyebrow">CKI REWARDS CREDITED TODAY</span><strong className="cm-token-amount">{fmt(data?.todayTokens,4)} <small>{tokenSymbol}</small></strong></div>
                <div className="cm-progress-metric"><span className="cm-eyebrow">REWARD PROCESSING</span><strong className="cm-daily-amount">{data?.rewardPostingEnabled ? "Enabled" : "Paused"}</strong><small className="cm-simulation-note">{data?.rewardPostingEnabled ? "Configured CKI rates accrue by eligible time." : "Reward processing is paused by operations."}</small></div>
              </div>
              <div className="cm-coin-display"><span className="cm-coin-glow"/><b>₵</b><small>{tokenSymbol}</small></div>
              <div className="cm-mining-vault" aria-hidden="true"><span className="cm-vault-frame"/><span className="cm-vault-beam"/><span className="cm-vault-spark spark-a"/><span className="cm-vault-spark spark-b"/><span className="cm-vault-spark spark-c"/><div className="cm-vault-coin">₵</div><span className="cm-vault-platform"/><span className="cm-vault-orbit"/></div>
            </div>
          </article>
          <article className={`cm-glass cm-boost-card is-${boostPhase}`}>
            <div className="cm-boost-machine" role="img" aria-label="Mining reward boost engine"><span className="cm-engine-aura"/><span className="cm-engine-pipe cm-engine-pipe-left"/><span className="cm-engine-pipe cm-engine-pipe-right"/><div className="cm-engine-shell"><span className="cm-engine-topcap"/><span className="cm-engine-front-glass"/><span className="cm-engine-rotor"><i/><i/><b/></span><span className="cm-engine-vents"/><span className="cm-engine-mark"/><span className="cm-engine-leds"><i/><i/><i/></span><span className="cm-engine-base"/></div></div>
            <div className="cm-boost-copy"><div className="cm-boost-topline"><b>MINING REWARD BOOST</b><span className="cm-boost-readout"><small>{boostStatusLabel}</small><strong>{boostCountdown}</strong></span></div><div className="cm-boost-bottomline"><small className="cm-boost-reward-note">+{fmt(boost?.boostRewardCkiPerDay, 6)} CKI / 24h while active · +{fmt(boost?.bonusThsAvailable, 3)} TH/s extra power</small><span className="cm-boost-charge" role="progressbar" aria-label={isBoostActive ? "Boost active time remaining" : isCoolingDown ? "Boost cooldown progress" : "Boost readiness"} aria-valuenow={boostCycleCharge} aria-valuemin={0} aria-valuemax={100} title={boost?.reason || (isBoostActive ? "The blue tube empties while the boost is active." : isCoolingDown ? "The blue tube refills until the boost is ready again." : "Boost is ready to activate.")}><i style={{width:`${boostCycleCharge}%`}}/></span></div></div>
            <button type="button" className="cm-glow-button" title={boost?.reason || "Activate Mining Reward Boost"} aria-label="Activate Mining Reward Boost" disabled={boostMutation.isPending || !boost?.ready} onClick={activateBoost}><ArrowDownUp size={15}/>{boostMutation.isPending?"Activating…":"Activate Boost"}</button>
          </article>
        </div>

      </section>

	      <MiningOperationsFlow
	        hasActivePackage={hasActiveHashPowerPackage}
	        activePackageName={activePackageNames}
	        hashPowerThs={activeHashPower}
	        walletCki={availableCki}
	        engineActivityIntervals={Number(data?.engineActivity?.intervalCount || 0)}
	        engineActivitySeconds={Number(data?.engineActivity?.eligibleSeconds || 0)}
	        latestRewardReference={latestReward?.reference}
	        latestRewardCreatedAt={latestReward?.createdAt}
      />

      <section className="cm-wallet-hash-grid" aria-label="Mining wallet and hash rate">
        <article className="cm-glass cm-wallet-card"><div className="cm-wallet-total"><div className="cm-card-title"><span className="cm-icon-cyan"><WalletCards size={19}/></span><b>{tokenSymbol} WALLET BALANCE</b></div><div className="cm-wallet-value"><span className="cm-wallet-coin">₵</span><div><small>Total {tokenSymbol}</small><strong>{fmt(data?.balances?.CKI ?? data?.tokenBalance,6)} <small>{tokenSymbol}</small></strong><span className="cm-positive">Historical Mining ledger total</span></div></div></div><div className="cm-wallet-currencies"><div className="cm-currency-list">{TARGET_ASSETS.map(asset=><button type="button" key={asset} className={`cm-currency ${swapTarget===asset?"selected":""}`} onClick={()=>selectSwapTarget(asset)} aria-pressed={swapTarget===asset}><i className={`currency-${asset.toLowerCase()}`}>{currencyIcons[asset]}</i><small>{asset}</small></button>)}</div><small className="cm-swap-note">Selected main-wallet balance: {fmt(mainWalletAvailable(swapTarget),mainWalletScale(swapTarget))} {swapTarget||"—"}</small><button type="button" className="cm-glow-button cm-swap-all" disabled={!canSwapAll || swapQuoteMutation.isPending || swapMutation.isPending} onClick={startFullBalanceSwap}><ArrowDownUp size={15}/>{swapMutation.isPending?"Posting conversion…":`Swap All to ${swapTarget}`}</button>{!canSwapAll&&<small className="cm-swap-note">A positive available CKI balance and a selected main-wallet currency are required.</small>}</div></article>
        <article className="cm-glass cm-hash-card"><div className="cm-card-title"><span className="cm-icon-cyan"><Zap size={19}/></span><b>CURRENT HASH RATE</b></div><div className="cm-hash-content"><div><strong>{fmt(data?.activeThs,3)} <small>TH/s</small></strong><span className="cm-positive">Base {fmt(data?.baseThs,3)} · Boost {fmt(data?.boostThs,3)} TH/s</span></div><div className="cm-hash-details"><small>Total Power</small><b>{fmt(data?.activeThs,3)} TH/s</b><small>Package</small><b>{activePackageNames}</b></div><svg className="cm-sparkline" viewBox="0 0 170 70" preserveAspectRatio="none" aria-label="Illustrative hash rate trace"><defs><linearGradient id="cm-hash-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#10d9ff" stopOpacity=".35"/><stop offset="1" stopColor="#10d9ff" stopOpacity="0"/></linearGradient></defs><path d="M0 54 C12 47 12 24 25 32 S42 54 52 39 S66 11 78 28 S94 49 105 35 S124 52 135 25 S153 32 170 5 L170 70 L0 70Z" fill="url(#cm-hash-fill)"/><path d="M0 54 C12 47 12 24 25 32 S42 54 52 39 S66 11 78 28 S94 49 105 35 S124 52 135 25 S153 32 170 5" fill="none" stroke="#18dfff" strokeWidth="2"/></svg></div></article>
      </section>

      <section className="cm-glass cm-packages-panel">
        <div className="cm-packages-header"><div><h2>Mining Packages</h2><p>Choose from packages currently published by operations</p><p className="cm-purchase-disclosure">Clicking Buy immediately purchases the displayed package and charges your saved {walletPreferences.data?.tradingCurrency ? `${String(walletPreferences.data.tradingCurrency).toUpperCase()} main wallet` : "main-wallet purchase currency"} using a fresh exchange quote. By clicking Buy, you accept the package terms shown on each card. Package capacity activates immediately and is added to your existing TH/s; configured CKI rewards accrue automatically while reward processing is enabled.</p></div><div className="cm-package-tabs" role="tablist" aria-label="Filter packages">{[["all","All Packages"],["mine","My Packages"],["upgrade","Upgrade"],["downgrade","Downgrade"]].map(([id,label])=><button type="button" role="tab" aria-selected={packageTab===id} className={packageTab===id?"selected":""} key={id} onClick={()=>setPackageTab(id)}>{label}</button>)}</div><button className="cm-refresh-button" type="button" onClick={()=>{void packages.refetch();void dashboard.refetch()}} aria-label="Refresh packages"><RefreshCw size={15}/></button></div>
        {active.length>0&&<div className="cm-active-note"><Cpu size={14}/><b>YOUR ACTIVE CAPACITY</b><span>{activePackageNames} · {fmt(activeBase,3)} TH/s</span></div>}
        <div className="cm-package-carousel">
          {packages.isLoading&&<div className="cm-empty">Loading published packages…</div>}
          {!packages.isLoading&&!filteredPackages.length&&<div className="cm-empty">{packageRows.length?"No packages match this filter.":"No mining packages are currently published. Package terms and prices will appear here after operations publishes them."}</div>}
          {filteredPackages.map((item:any,index:number)=>{
            const activeSame=active.some((current:any)=>current.code===item.code);
            const intent=Number(item.baseThs)>activeBase?"Add hash power":"Buy package";
            const color=palette[index%palette.length];
            const canPurchase=item.purchaseAvailable===true;
            const purchaseInProgress=purchaseMutation.isPending&&purchaseMutation.variables?.packageVersionId===item.versionId;
            const unavailableReason=String(item.purchaseUnavailableReason||"");
            const statusLabel=activeSame?"ACTIVE":item.alreadyPurchased?"PURCHASED":canPurchase?"AVAILABLE":item.status!=="published"?"PAUSED":"PURCHASES PAUSED";
            const buttonLabel=item.alreadyPurchased?"Already purchased":purchaseInProgress?"Purchasing…":canPurchase?intent:item.status!=="published"?"Paused":"Purchases paused";
            return <article className={`cm-package-card ${activeSame?"is-current":""}`} key={item.versionId} style={{"--package-accent":color} as React.CSSProperties}>
              <div className="cm-package-art"><div className="cm-cube"><i/><i/><b>₵</b></div><span className="cm-package-glow"/></div>
              <div className="cm-package-label"><h3>{item.name}</h3><span>{statusLabel}</span></div>
              <div className="cm-package-price"><strong>{fmt(item.priceAmount,2)}</strong><small>{item.priceAsset}</small></div>
              <div className="cm-package-facts"><b>{fmt(item.baseThs,3)} <small>TH/s</small></b><span>Boost +{fmt(item.boostBonusThs,3)} TH/s</span><span>Term {item.durationMonths==null?"not set":`${item.durationMonths} months`}</span><span>{item.expectedDailyRewardCki==null?"Daily CKI rate not configured":`${fmt(item.expectedDailyRewardCki,8)} CKI/day · prorated by eligible seconds`}</span></div>
              {item.termsText&&<details className="cm-package-terms"><summary>Review package terms</summary><p>{item.termsText}</p></details>}
              <button type="button" className="cm-package-buy" disabled={!canPurchase||purchaseMutation.isPending} title={canPurchase?"Click to purchase now; the saved main wallet will be charged immediately.":(unavailableReason||"Unavailable")} aria-label={`Buy ${item.name} now; the saved main wallet will be charged immediately`} onClick={()=>{if(!canPurchase||purchaseMutation.isPending)return;setMessage("");purchaseMutation.mutate({packageVersionId:item.versionId,idempotencyKey:requestId()})}}>{buttonLabel}<ArrowRight size={13}/></button>
            </article>;
          })}
        </div>
      </section>

      <section className="cm-bottom-strip" aria-label="Mining platform features"><div><Cpu/><span><b>PACKAGE HASHPOWER</b><small>Active purchased capacity</small></span></div><div><Activity/><span><b>LIVE ACCOUNT DATA</b><small>Refreshes every few seconds</small></span></div><div><ArrowDownUp/><span><b>INTERNAL SWAPS</b><small>Quote and ledger guarded</small></span></div><div><Zap/><span><b>HASH POWER BOOST</b><small>{boost?.activeBoost?"Active now":"2-minute boost · 4-hour customer cooldown"}</small></span></div><div><ShieldCheck/><span><b>ACCOUNT SECURITY</b><small>Customer session protected</small></span></div></section>

      <details className="cm-advanced-conversion"><summary><span><Sparkles size={16}/><b>Automatic conversion preferences</b><small>Future rewards only · Version {data?.conversionPreference?.version||0}</small></span><ChevronDown size={16}/></summary><p>Optional background conversion for eligible future reward intervals. A failed or stale quote leaves CKI in your wallet. This preference does not convert your existing balance.</p><div className="cm-auto-controls"><label className="cm-checkbox"><input type="checkbox" checked={prefEnabled} onChange={e=>setPrefEnabled(e.target.checked)}/><span>Automatically convert eligible future rewards</span></label><label>Destination<select value={prefTarget} onChange={e=>setPrefTarget(e.target.value)}>{TARGET_ASSETS.map(asset=><option key={asset}>{asset}</option>)}</select></label><label>Minimum {tokenSymbol}<input value={prefThreshold} onChange={e=>setPrefThreshold(e.target.value)} inputMode="decimal"/></label><button type="button" className="cm-secondary-button" disabled={preferenceMutation.isPending} onClick={()=>preferenceMutation.mutate({enabled:prefEnabled,targetDenomination:prefTarget,minimumThreshold:prefThreshold})}>{preferenceMutation.isPending?"Saving…":"Save preference"}</button></div><div className="cm-queue-note"><Clock3 size={14}/> Pending conversion jobs: <strong>{data?.pendingConversionJobs||0}</strong></div></details>

      <section className="cm-glass cm-history">
        <div className="cm-history-heading">
          <div>
            <span className="cm-eyebrow">MINING ACCOUNT LEDGER</span>
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
                <td><span className="cm-history-status">{String(row.status).toLowerCase() === "posted" ? "Paid" : row.status}</span></td>
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

      <footer className="cm-disclaimer"><ShieldCheck size={15}/><span>Configured package rewards are internal estimates, prorated by eligible contract time and recorded in the CKI ledger. They are not verified pool output, withdrawable funds, or a cash payout. CKI swaps credit the selected main wallet; no external transfer is initiated here.</span><b>Economics v{data?.economicsVersion||"—"}</b></footer>
    </main>

  </div>;
}
