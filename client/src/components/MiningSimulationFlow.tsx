import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, Cpu, Database, Sparkles, WalletCards, Wind } from "lucide-react";

type MiningSimulationFlowProps = {
  activePackageName: string;
  hashPowerThs: number;
  walletCki: number;
  latestRewardReference?: string;
  latestRewardCreatedAt?: string;
};

const DEMO_CKI = 1;
const FLOW_STEPS = [
  { label: "Wind intake", detail: "Turbine · demo telemetry", Icon: Wind },
  { label: "ASIC hashing", detail: "Active package power", Icon: Cpu },
  { label: "Reward minted", detail: "+1.000000 CKI · dummy", Icon: Sparkles },
  { label: "Vault receipt", detail: "Demo receipt secured", Icon: Database },
  { label: "CKI wallet", detail: "Preview balance only", Icon: WalletCards },
  { label: "Conversion", detail: "USD reference preview", Icon: ArrowDownUp },
];

const fmt = (value: number, digits = 8) => Number.isFinite(value)
  ? value.toLocaleString(undefined, { maximumFractionDigits: digits })
  : "—";

export function MiningSimulationFlow({
  activePackageName,
  hashPowerThs,
  walletCki,
  latestRewardReference,
  latestRewardCreatedAt,
}: MiningSimulationFlowProps) {
  const [now, setNow] = useState(Date.now());
  const [runId, setRunId] = useState(0);
  const [demoStage, setDemoStage] = useState(-1);
  const [receiptPulse, setReceiptPulse] = useState(false);
  const seenReceiptRef = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!runId) return;
    let stage = 0;
    setDemoStage(0);
    const timer = window.setInterval(() => {
      stage += 1;
      if (stage >= FLOW_STEPS.length - 1) {
        setDemoStage(FLOW_STEPS.length - 1);
        window.clearInterval(timer);
      } else {
        setDemoStage(stage);
      }
    }, 1050);
    return () => window.clearInterval(timer);
  }, [runId]);

  useEffect(() => {
    if (!latestRewardReference) return;
    if (seenReceiptRef.current === null) {
      seenReceiptRef.current = latestRewardReference;
      return;
    }
    if (seenReceiptRef.current === latestRewardReference) return;
    seenReceiptRef.current = latestRewardReference;
    setReceiptPulse(true);
    const timer = window.setTimeout(() => setReceiptPulse(false), 2600);
    return () => window.clearTimeout(timer);
  }, [latestRewardReference]);

  const fanRpm = 2280 + Math.round(Math.sin(now / 950) * 46);
  const turbineRpm = 38 + Math.round(Math.sin(now / 1450) * 3);
  const isRunning = demoStage >= 0 && demoStage < FLOW_STEPS.length - 1;
  const isComplete = demoStage === FLOW_STEPS.length - 1;
  const progress = demoStage < 0 ? 0 : demoStage / (FLOW_STEPS.length - 1);
  const tokenLeft = demoStage < 0 ? 8.333 : 8.333 + progress * 83.334;
  const demoState = demoStage < 0
    ? "Ready · click to replay the complete dummy-data path"
    : isComplete
      ? "Preview complete · no wallet, quote or ledger records were changed"
      : `Step ${demoStage + 1} of ${FLOW_STEPS.length} · ${FLOW_STEPS[demoStage]?.label}`;
  const packageLabel = activePackageName || "No active package entitlement";

  return <section className={`cm-flow-panel ${receiptPulse ? "has-live-receipt" : ""}`} aria-label="End-to-end mining simulation walkthrough">
    <header className="cm-flow-header">
      <div className="cm-flow-heading">
        <span className="cm-flow-kicker"><span className="cm-flow-live-led"/> SANDBOX SIMULATION · END-TO-END FLOW</span>
        <h2>Follow a reward from turbine to wallet</h2>
        <p>Live package, pending accrual and CKI wallet balance are read from the sandbox database. The conversion replay below uses dummy data only.</p>
      </div>
      <div className="cm-flow-header-actions">
        <span className="cm-flow-demo-badge">DEMO · NO LEDGER WRITE</span>
        <button type="button" className="cm-flow-run-button" onClick={() => setRunId(value => value + 1)} disabled={isRunning}>
          <Sparkles size={15}/>{isRunning ? "Running demo…" : isComplete ? "Replay demo flow" : "Run demo flow"}
        </button>
      </div>
    </header>

    <div className="cm-flow-sensors" aria-label="Illustrative machine telemetry">
      <div className="cm-flow-sensor">
        <div className="cm-flow-fan" aria-hidden="true"><span/><span/><span/><i/></div>
        <div><small>ASIC COOLING · DEMO</small><strong>{fanRpm.toLocaleString()} <em>RPM</em></strong><span>Rotor animation · not hardware telemetry</span></div>
      </div>
      <div className="cm-flow-sensor">
        <div className="cm-flow-turbine" aria-hidden="true"><span className="cm-flow-turbine-mast"/><div className="cm-flow-turbine-rotor"><i/><i/><i/><b/></div></div>
        <div><small>WIND INPUT · DEMO</small><strong>{turbineRpm} <em>RPM</em></strong><span>Simulated turbine rotation</span></div>
      </div>
      <div className="cm-flow-sensor cm-flow-package-sensor">
        <span className="cm-flow-package-icon"><Cpu size={18}/></span>
        <div><small>ACTIVE HASH-POWER PACKAGE</small><strong>{fmt(hashPowerThs, 3)} TH/s</strong><span>{packageLabel}</span></div>
      </div>
    </div>

    <div className={`cm-flow-track-wrap ${demoStage >= 0 ? "is-replaying" : ""} ${isComplete ? "is-complete" : ""}`}>
      <div className="cm-flow-track" role="list" aria-label="Dummy reward journey">
        <div className="cm-flow-rail"><i style={{ width: `${progress * 100}%` }}/></div>
        {FLOW_STEPS.map(({ label, detail, Icon }, index) => <div className={`cm-flow-step ${demoStage >= index ? "is-complete" : ""} ${demoStage === index ? "is-current" : ""}`} role="listitem" key={label}>
          <span className="cm-flow-step-icon"><Icon size={17}/></span>
          <strong>{label}</strong>
          <small>{detail}</small>
        </div>)}
        {demoStage >= 0 && <span className="cm-flow-token" style={{ left: `${tokenLeft}%` }} aria-hidden="true">₵</span>}
      </div>
      <div className="cm-flow-stage-note" aria-live="polite"><span className={isComplete ? "is-done" : isRunning ? "is-active" : ""}/>{demoState}</div>
    </div>

    <footer className="cm-flow-footer">
      <span><b>Latest database receipt</b> {latestRewardReference ? <code>{latestRewardReference}</code> : "Waiting for the first posted reward"}{latestRewardCreatedAt ? ` · ${new Date(latestRewardCreatedAt).toLocaleTimeString()}` : ""}</span>
      <span className="cm-flow-projector-note">Demo wallet projection: {fmt(walletCki + DEMO_CKI)} CKI after +1 dummy CKI · actual balance remains unchanged.</span>
    </footer>
  </section>;
}
