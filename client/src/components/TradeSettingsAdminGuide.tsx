import { BookOpen, ExternalLink, ShieldCheck } from "lucide-react";

type TradeSettingsAdminGuideProps = {
  onNavigate: (target: string, focus?: string) => void;
};

const ownerLinks = [
  { label: "Package Configuration", target: "tradePackageConfiguration", description: "Current package-policy controls and the system-wide allocation gate." },
  { label: "Package Settings", target: "packages", description: "Tier eligibility, package terms, quotas, amounts and saved policy settings." },
  { label: "Publish & Manage Opportunities", target: "opportunity", description: "Reviewed source opportunities, imports and the open published feed." },
  { label: "Global Trade Timing & Settlement", target: "tradeDurationRules", description: "Global review, posting and cooldown timing defaults." },
  { label: "Worker Health & Recovery", target: "tradeWorkerHealth", description: "Worker heartbeat, due work and safely supported recovery status." },
  { label: "Settlement & Reconciliation", target: "transactionReview", focus: "reconciliation", description: "Evidence-based settlement review and read-only ledger reconciliation." },
];

const troubleshooting = [
  { issue: "No active entitlement", route: "Package Settings", target: "packages", description: "Verify the customer has a current automatically assigned entitlement from qualifying administrator credits; customer/provider deposits, signup credits and profits do not qualify." },
  { issue: "No open opportunities", route: "Publish & Manage Opportunities", target: "opportunity", description: "Check the count of open, time-valid, reviewed opportunities. Market-data refresh does not publish offers." },
  { issue: "Policy paused or invalid", route: "Package Configuration", target: "tradePackageConfiguration", description: "Review persisted package controls and the global allocation gate; do not create policy defaults to hide missing data." },
  { issue: "Quota or cooldown blocks delivery", route: "Package Settings", target: "packages", description: "Check the entitlement snapshot, remaining allowance, delivery caps and schedule. A cap can reduce but never increase an entitlement." },
  { issue: "Worker unhealthy or delayed", route: "Worker Health & Recovery", target: "tradeWorkerHealth", description: "Check last attempt/success, freshness and retry/backlog state; a configured setting is not proof of delivery." },
  { issue: "Waiting for review or settlement", route: "Settlement & Reconciliation", target: "transactionReview", focus: "reconciliation", description: "Elapsed time alone never proves execution or settles a trade. Review the recorded evidence and persisted state." },
];

export function TradeSettingsAdminGuide({ onNavigate }: TradeSettingsAdminGuideProps) {
  const navigate = (target: string, focus?: string) => onNavigate(target, focus);

  return (
    <article className="arb-page portal-page trade-settings-guide" aria-labelledby="trade-settings-guide-title">
      <header className="portal-page-top">
        <div>
          <div className="eyebrow">Read-only administrator help · Guide 1.0</div>
          <h1 id="trade-settings-guide-title">Trade Settings Guide</h1>
          <p>Last reviewed 3 November 2026 · Source baseline: <code>main</code> at <code>59c425414b981bc2fd8720119f2d4b650b97ab15</code>. This guide explains the current settings and links to their owner screens; it does not save settings or perform operational actions.</p>
        </div>
        <BookOpen size={24} aria-hidden="true" />
      </header>

      <section className="settings-card" aria-labelledby="guide-principles-title">
        <h2 id="guide-principles-title">Before changing a setting</h2>
        <p>Every editor or action belongs on one owner screen. A summary elsewhere is read-only. Each field should state its scope, units, range, effective time and customer impact; a save is not confirmed until the persisted value is read back.</p>
        <div className="admin-policy-note" role="note"><ShieldCheck size={16} /><span>Customer opportunities are informational records created only from administrator-published, open opportunities. They do not execute a trade, debit or credit a wallet, prove profit, or settle funds. Automatic financial execution remains hard-disabled.</span></div>
        <p>The existing delivery-control rows are currently saved per package, not as a separate global master record. Until that storage/runtime checkpoint is completed, do not describe a package-level switch as a new global setting.</p>
      </section>

      <section className="settings-card" aria-labelledby="guide-owner-routes-title">
        <h2 id="guide-owner-routes-title">Owner screens</h2>
        <div className="trade-settings-guide__links">
          {ownerLinks.map((link) => <div className="trade-settings-guide__link" key={link.label}>
            <div><strong>{link.label}</strong><p>{link.description}</p></div>
            <button type="button" className="secondary-button" onClick={() => navigate(link.target, link.focus)} aria-label={`Open owner screen: ${link.label}`}>
              Open owner <ExternalLink size={14} aria-hidden="true" />
            </button>
          </div>)}
        </div>
      </section>

      <section className="settings-card" aria-labelledby="guide-no-popup-title">
        <h2 id="guide-no-popup-title">Troubleshooting: why a customer may see no opportunity</h2>
        <ol className="trade-settings-guide__troubleshooting">
          {troubleshooting.map((item) => <li key={item.issue}>
            <div><strong>{item.issue}</strong><p>{item.description}</p></div>
            <button type="button" className="text-button" onClick={() => navigate(item.target, item.focus)}>Open {item.route}</button>
          </li>)}
        </ol>
      </section>

      <section className="settings-card" aria-labelledby="guide-status-title">
        <h2 id="guide-status-title">Status terms</h2>
        <dl className="trade-settings-guide__statuses">
          <div><dt>Published / open</dt><dd>A reviewed opportunity is available within its saved validity window; this alone does not mean it was delivered.</dd></div>
          <div><dt>Delivered</dt><dd>A durable server-side delivery event exists. It is informational, not a trade or wallet movement.</dd></div>
          <div><dt>Insufficient balance</dt><dd>The opportunity was not allocated. No debit or execution is implied.</dd></div>
          <div><dt>Awaiting review</dt><dd>A recorded item still requires an authorized, evidence-based decision.</dd></div>
          <div><dt>Awaiting wallet credit</dt><dd>A confirmed result has not yet reached its saved posting time or durable ledger transaction.</dd></div>
          <div><dt>Settled</dt><dd>The authoritative settlement and ledger posting are complete; elapsed time or a display timer is not enough.</dd></div>
          <div><dt>Payout requested</dt><dd>A separate customer withdrawal request exists. It is not trade settlement or a bank/blockchain transfer.</dd></div>
        </dl>
      </section>
    </article>
  );
}
