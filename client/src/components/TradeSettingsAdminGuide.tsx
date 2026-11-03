import { BookOpen, ExternalLink, ShieldCheck } from "lucide-react";

type TradeSettingsAdminGuideProps = {
  onNavigate: (target: string, focus?: string) => void;
};

type GuideOwnerLink = { routeId: string; label: string; target: string; focus?: string; description: string };
type GuideTroubleshootingItem = { issue: string; routeId: string; route: string; target: string; focus?: string; description: string };

/** Read-only Guide links; route IDs and destinations mirror the Trade Settings navigation registry. */
export const ownerLinks: readonly GuideOwnerLink[] = [
  { routeId: "trade-settings-overview", label: "Trading Overview", target: "tradeSystemOverview", description: "Read the current operational snapshot, delivery counts and system-status indicators. A configured policy or worker heartbeat is not proof of a customer delivery." },
  { routeId: "trade-package-configuration", label: "Package Configuration", target: "tradePackageConfiguration", description: "Manage the single persisted global trade-controls record and allocation-safety gate. Per-tier lifecycle and terms remain separate." },
  { routeId: "trade-tiers-eligibility", label: "Tiers & Eligibility", target: "packages", focus: "tiers", description: "Review administrator-managed tier thresholds, terms and automatic eligibility. Only qualifying manual administrator credits count; customers do not choose or activate tiers." },
  { routeId: "trade-daily-delivery-caps", label: "Per-tier Daily Delivery Caps", target: "packages", focus: "quotas", description: "Review daily delivery ceilings and visible-offer limits. Operational caps may reduce a tier entitlement, never increase it." },
  { routeId: "trade-delivery-policy", label: "Per-tier Offer Rules & Capital Limits", target: "packages", focus: "policy", description: "Review per-tier offer policy and capital bounds. A displayed informational opportunity is not a capital allocation." },
  { routeId: "trade-opportunity-publishing", label: "Publish & Manage Opportunities", target: "opportunity", description: "Review manually published or validated-import opportunities and their open/expiry state. Market-data refresh stores reference data; it does not publish offers." },
  { routeId: "trade-delivery-schedule", label: "Per-tier Delivery Schedule", target: "packages", focus: "delivery", description: "Review per-tier spacing and delivery cadence. Schedule eligibility describes when informational delivery may be attempted, not a delivery guarantee." },
  { routeId: "trade-duration-closing", label: "Global Trade Timing & Settlement", target: "tradeDurationRules", description: "Review global timing defaults and their separate lifecycle clocks. A timer or elapsed duration does not establish a result or settle a record." },
  { routeId: "trade-popup-display", label: "Per-tier Pop-up Display", target: "tradeCustomerDisplay", description: "Review per-tier presentation and completion-card display settings. Display duration and dismissal affect presentation only." },
  { routeId: "trade-company-rotation", label: "Per-tier Company Rotation Rules", target: "packages", focus: "rotation", description: "Review per-tier approved-company filters and repeat rules. Company identity is reference metadata, not evidence of listing, execution or profit." },
  { routeId: "trade-company-catalogue", label: "Company Catalogue", target: "companyCatalogue", description: "Review company reference records and their administrator approval status. Approval controls display eligibility only; it does not verify a security or trade." },
  { routeId: "trade-capital-funding", label: "Capital & Wallet Funding Rules", target: "transactionReview", focus: "capital", description: "Review the current capital and permitted-funding information. This destination is not a customer-credit action or proof that funds moved." },
  { routeId: "trade-fees-earnings", label: "Fees & Earnings Limits", target: "transactionReview", focus: "fees", description: "Review fee and earnings-limit information in its current source-supported scope. Configured terms are not realized earnings or a posted wallet credit." },
  { routeId: "trade-retries", label: "Retries & Carry-Forward", target: "tradeRetryPolicy", description: "Review technical delivery retries and their status. Carry-forward across daily windows is not available; a delivery retry is not a trade-execution retry." },
  { routeId: "trade-active-pending", label: "Active & Pending Opportunities", target: "deliveryMonitor", description: "Inspect informational opportunities waiting for delivery or further processing. Pending work is not an allocation, settlement or payout." },
  { routeId: "trade-settlement", label: "Settlement & Reconciliation", target: "transactionReview", focus: "reconciliation", description: "Review recorded result evidence and reconcile persisted trade/settlement records with ledger entries. A review confirmation alone is not a posted wallet credit." },
  { routeId: "trade-worker-health", label: "Worker Health & Recovery", target: "tradeWorkerHealth", description: "Inspect worker heartbeat, due work and supported recovery status. A saved setting or recent heartbeat does not guarantee delivery or financial processing." },
  { routeId: "trade-audit-policy-history", label: "Audit & Policy History", target: "audit", description: "Review recorded administrator changes, reasons and policy versions. This is history, not a second editor or operational action." },
];

export const troubleshooting: readonly GuideTroubleshootingItem[] = [
  { issue: "No active entitlement", routeId: "trade-tiers-eligibility", route: "Tiers & Eligibility", target: "packages", focus: "tiers", description: "Check for a current server-assigned entitlement from qualifying manual administrator credits. Customer/provider deposits, signup credits, profits and other credits do not qualify." },
  { issue: "No open opportunities", routeId: "trade-opportunity-publishing", route: "Publish & Manage Opportunities", target: "opportunity", description: "Check for a reviewed, administrator-published offer that is still open and time-valid. Market-data refresh does not create offers." },
  { issue: "Policy paused or invalid", routeId: "trade-package-configuration", route: "Package Configuration", target: "tradePackageConfiguration", description: "Check saved policy and the allocation safety status. Missing or invalid policy must remain unavailable rather than being replaced with an invented default." },
  { issue: "Quota exhausted", routeId: "trade-daily-delivery-caps", route: "Per-tier Daily Delivery Caps", target: "packages", focus: "quotas", description: "Compare the current delivery count with the operational cap and the customer's saved entitlement; the cap can reduce but not add entitlement." },
  { issue: "Cooldown or schedule not due", routeId: "trade-duration-closing", route: "Global Trade Timing & Settlement", target: "tradeDurationRules", description: "Check the configured server-side timing gates and persisted timestamps. Browser time or a countdown does not change the authoritative schedule." },
  { issue: "Worker unhealthy or delayed", routeId: "trade-worker-health", route: "Worker Health & Recovery", target: "tradeWorkerHealth", description: "Check last attempt/success, freshness, lag and retry state. A configured setting is not proof that an informational event was delivered." },
  { issue: "Waiting for review or settlement", routeId: "trade-settlement", route: "Settlement & Reconciliation", target: "transactionReview", focus: "reconciliation", description: "Review the persisted record and its evidence. Elapsed time, a display timer or review confirmation alone does not prove settlement or wallet posting." },
];

export const statusDefinitions = [
  { term: "Published / open offer", description: "A reviewed opportunity record is still within its saved validity window and may be considered for delivery. Open does not mean delivered." },
  { term: "Delivered", description: "A durable server-side informational delivery event exists. It is not a synthetic offer, trade allocation, debit, profit or proof of execution." },
  { term: "Received / rendered", description: "The customer client received or displayed an informational item, where that lifecycle detail is available. Display is still not allocation or financial evidence." },
  { term: "Allocation", description: "Automatic financial allocation/execution is locked OFF in the current source. An informational offer or delivery is not allocated and does not move funds." },
  { term: "Awaiting review", description: "A persisted record is waiting for an authorized, evidence-based review. A due time or elapsed timer is not a result." },
  { term: "Confirmed / awaiting credit", description: "A reviewed result and evidence reference are recorded, but the separate wallet-ledger posting is not yet complete; confirmation alone is not a credit." },
  { term: "Settled", description: "The authoritative settlement and corresponding ledger posting are complete in persisted state. A display status or elapsed time alone is not enough." },
  { term: "Payout requested", description: "A separate customer withdrawal request exists. It is distinct from trade review/settlement and does not by itself mean an external bank or blockchain transfer completed." },
] as const;

export function TradeSettingsAdminGuide({ onNavigate }: TradeSettingsAdminGuideProps) {
  const navigate = (target: string, focus?: string) => onNavigate(target, focus);

  return (
    <article className="arb-page portal-page trade-settings-guide" aria-labelledby="trade-settings-guide-title">
      <header className="portal-page-top">
        <div>
          <div className="eyebrow">Read-only administrator help · Guide 1.1</div>
          <h1 id="trade-settings-guide-title">Trade Settings Guide</h1>
          <p>Reviewed 3 November 2026 against repository source baseline <code>32215a3f48b52fb901d9efc4b0760e25eb74faf9</code>. This mounted Guide explains current owner screens and links to them; it does not save settings or perform operational actions, and it does not verify deployment state.</p>
        </div>
        <BookOpen size={24} aria-hidden="true" />
      </header>

      <section className="settings-card" aria-labelledby="guide-principles-title">
        <h2 id="guide-principles-title">Current scope and safety</h2>
        <p>The current delivery path uses administrator-published, open opportunities. Published reference-market data does not create an offer. Informational delivery is separate from financial allocation, result review, settlement and payout.</p>
        <div className="admin-policy-note" role="note"><ShieldCheck size={16} /><span>Automatic financial allocation/execution is hard-locked OFF in the current source. Automatic financial execution remains hard-disabled by the release guard. An informational pop-up is not an offer generated from market refresh, a trade, wallet movement, evidence of execution, profit or settlement.</span></div>
        <p>Carry-forward across daily windows is not available. Where an owner screen shows a locked or unavailable status, do not treat it as an active control. Global delivery, company-rotation, randomized-timing and burst masters are stored together in the single persisted <code>trade.globalControls</code> record under Package Configuration. Legacy per-package master columns are inert compatibility fields, not separate switch owners.</p>
      </section>

      <section className="settings-card" aria-labelledby="guide-owner-routes-title">
        <h2 id="guide-owner-routes-title">Owner screens</h2>
        <p>Each link opens the current navigation destination and, where needed, its registered section. This list excludes the Guide route itself.</p>
        <div className="trade-settings-guide__links">
          {ownerLinks.map((link) => <div className="trade-settings-guide__link" key={link.routeId}>
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
          {statusDefinitions.map((status) => <div key={status.term}><dt>{status.term}</dt><dd>{status.description}</dd></div>)}
        </dl>
      </section>
    </article>
  );
}
