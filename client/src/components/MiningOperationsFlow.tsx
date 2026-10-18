import { useEffect, useState } from "react";
import { Activity, ArrowDownUp, Cpu, Database, WalletCards } from "lucide-react";

type MiningOperationsFlowProps = {
  hasActivePackage: boolean;
  activePackageName: string;
  hashPowerThs: number;
  walletCki: number;
  engineActivityIntervals: number;
  engineActivitySeconds: number;
  latestRewardReference?: string;
  latestRewardCreatedAt?: string;
};

const FLOW_STEPS = [
  { label: "Purchased package", detail: "Customer contract entitlement", Icon: Cpu },
  { label: "Hash-power allocation", detail: "Package TH/s × eligible time", Icon: Activity },
  { label: "Farm settlement", detail: "Recorded third-party settlement", Icon: Database },
  { label: "Customer CKI ledger", detail: "Posted database credit", Icon: WalletCards },
  { label: "Main-wallet conversion", detail: "Customer-selected asset", Icon: ArrowDownUp },
];

const fmt = (value: number, digits = 8) => Number.isFinite(value)
  ? value.toLocaleString(undefined, { maximumFractionDigits: digits })
  : "—";

export function MiningOperationsFlow({
  hasActivePackage,
  activePackageName,
  hashPowerThs,
  walletCki,
  engineActivityIntervals,
  engineActivitySeconds,
  latestRewardReference,
  latestRewardCreatedAt,
}: MiningOperationsFlowProps) {
  const [stage, setStage] = useState(0);
  const [receiptPulse, setReceiptPulse] = useState(false);

  // A deliberately slow, continuous visualization of the operational path. It
  // never creates a token, receipt, hash-rate sample, or wallet transaction.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStage(0);
      return;
    }
    if (!hasActivePackage) {
      setStage(0);
      return;
    }
    const timer = window.setInterval(() => {
      setStage(current => (current + 1) % FLOW_STEPS.length);
    }, 9000);
    return () => window.clearInterval(timer);
  }, [hasActivePackage]);

  useEffect(() => {
    if (!latestRewardReference) return;
    setReceiptPulse(true);
    const timer = window.setTimeout(() => setReceiptPulse(false), 1800);
    return () => window.clearTimeout(timer);
  }, [latestRewardReference]);

  const active = hasActivePackage && hashPowerThs > 0;
  const progress = active ? stage / (FLOW_STEPS.length - 1) : 0;
  const status = !active
    ? "Idle · customer has no active package"
    : latestRewardReference
      ? `Active · latest posted reward ${latestRewardReference}`
      : "Active · waiting for a recorded third-party settlement";

  return <section className={`cm-flow-panel arb-page ${receiptPulse ? "has-live-receipt" : ""}`} aria-label="Mining package and settlement status">
    <header className="cm-flow-header">
      <div className="cm-flow-heading">
        <span className="cm-flow-kicker"><span className="cm-flow-live-led"/> MINING OPERATIONS · DATABASE STATUS</span>
        <h2>Package power to customer wallet</h2>
        <p>Hash power follows the customer's active package. CKI credits must come from a persisted farm settlement; this display does not fabricate hardware telemetry or earnings.</p>
      </div>
      <div className="cm-flow-header-actions">
        <span className={`cm-flow-status-badge ${active ? "is-active" : ""}`}>{active ? "PACKAGE ACTIVE" : "ENGINE IDLE"}</span>
      </div>
    </header>

    <div className="cm-flow-sensors" aria-label="Database-backed Mining account state">
      <div className="cm-flow-sensor">
        <span className="cm-flow-package-icon"><Cpu size={18}/></span>
        <div><small>PURCHASED PACKAGE</small><strong>{activePackageName || "No active package"}</strong><span>Customer contract record</span></div>
      </div>
      <div className="cm-flow-sensor">
        <span className="cm-flow-package-icon"><Activity size={18}/></span>
        <div><small>ACTIVE HASH POWER</small><strong>{fmt(hashPowerThs, 3)} <em>TH/s</em></strong><span>From active package snapshots</span></div>
      </div>
      <div className="cm-flow-sensor">
        <span className="cm-flow-package-icon"><WalletCards size={18}/></span>
        <div><small>CKI WALLET BALANCE</small><strong>{fmt(walletCki)} <em>CKI</em></strong><span>Database balance · no projected credits</span></div>
      </div>
    </div>

    <div className={`cm-flow-track-wrap ${active ? "is-replaying" : ""}`}>
      <div className="cm-flow-track" role="list" aria-label="Mining settlement processing stages">
        <div className="cm-flow-rail"><i style={{ width: `${progress * 100}%` }}/></div>
        {FLOW_STEPS.map(({ label, detail, Icon }, index) => <div className={`cm-flow-step ${active && stage >= index ? "is-complete" : ""} ${active && stage === index ? "is-current" : ""}`} role="listitem" key={label}>
          <span className="cm-flow-step-icon"><Icon size={17}/></span>
          <strong>{label}</strong>
          <small>{detail}</small>
        </div>)}
        {active && <span className="cm-flow-token" style={{ left: `${8.333 + progress * 83.334}%` }} aria-hidden="true">•</span>}
      </div>
      <div className="cm-flow-stage-note" aria-live="polite"><span className={active ? "is-active" : ""}/>{status}</div>
    </div>

    <footer className="cm-flow-footer">
        <span><b>Mining activity stored today</b> {engineActivityIntervals} intervals · {fmt(engineActivitySeconds, 3)} eligible seconds · <b>Latest database reward</b> {latestRewardReference ? <code>{latestRewardReference}</code> : "No reward receipt has been posted"}{latestRewardCreatedAt ? ` · ${new Date(latestRewardCreatedAt).toLocaleString()}` : ""}</span>
      <span className="cm-flow-projector-note">CKI wallet: {fmt(walletCki)} CKI · no demo amount or projected balance</span>
    </footer>
  </section>;
}
