import { BookOpen, ExternalLink, ShieldCheck } from "lucide-react";
import { tradeSettingsOwnershipRegistry } from "../trade-settings-ownership";

type TradeSettingsAdminGuideProps = {
  onNavigate: (target: string, focus?: string) => void;
};

type GuideOwnerLink = { routeId: string; label: string; target: string; focus?: string; description: string };
type GuideTroubleshootingItem = { issue: string; routeId: string; route: string; target: string; focus?: string; description: string };

/** Read-only Guide links; route IDs and destinations mirror the Trade Settings navigation registry. */
export const ownerLinks: readonly GuideOwnerLink[] = [
  { routeId: "trade-settings-overview", label: "Trading Overview", target: "tradeSystemOverview", description: "Read the current operational snapshot, delivery counts and system-status indicators. A configured policy or worker heartbeat is not proof of a customer delivery." },
  { routeId: "trade-package-configuration", label: "Package Configuration", target: "tradePackageConfiguration", description: "Manage the single persisted global trade-controls record, including the audited previous-settlement ON/OFF prerequisite (default ON), and allocation-safety gate. OFF bypasses only that prerequisite for future allocation checks; per-tier lifecycle and terms remain separate." },
  { routeId: "trade-tiers-eligibility", label: "Tiers & Eligibility", target: "packages", focus: "tiers", description: "Review administrator-managed tier thresholds, terms and automatic eligibility. Only qualifying manual administrator credits count; customers do not choose or activate tiers." },
  { routeId: "trade-daily-delivery-caps", label: "Per-tier Daily Delivery Caps", target: "packages", focus: "quotas", description: "Review daily delivery ceilings and visible-offer limits. Operational caps may reduce a tier entitlement, never increase it." },
  { routeId: "trade-delivery-policy", label: "Per-tier Offer Rules & Capital Limits", target: "packages", focus: "policy", description: "Review per-tier offer policy and capital bounds. A displayed informational opportunity is not a capital allocation." },
  { routeId: "trade-opportunity-publishing", label: "Opportunity Generation & Management", target: "opportunity", description: "Manage automatic generation directly from the existing approved company catalogue, the generation pause control, worker batches and customer-specific package assignments. Brand-only companies need no ticker, exchange listing or market feed. Optional display templates are not required; if used, their source notes are administrator-provided and not independently verified. Customer pop-ups use each qualifying package's saved policy." },
  { routeId: "trade-delivery-schedule", label: "Per-tier Delivery Schedule", target: "packages", focus: "delivery", description: "Review per-tier spacing and delivery cadence. Schedule eligibility describes when informational delivery may be attempted, not a delivery guarantee." },
  { routeId: "trade-duration-closing", label: "Global Trade Timing & Settlement", target: "tradeDurationRules", description: "Review global timing defaults and their separate lifecycle clocks. A timer or elapsed duration does not establish a result or settle a record." },
  { routeId: "trade-popup-display", label: "Post-completion Display Delay", target: "tradeCustomerDisplay", description: "Review the short completed-card display delay. The package duration range controls both opportunity expiry and popup countdown." },
  { routeId: "trade-company-rotation", label: "Per-tier Company Rotation Rules", target: "packages", focus: "rotation", description: "Review per-tier approved-company filters and repeat rules. Company identity is reference metadata, not evidence of listing, execution or profit." },
  { routeId: "trade-company-catalogue", label: "Company Catalogue", target: "companyCatalogue", description: "Review company reference records and their administrator approval status. Approval controls display eligibility only; it does not verify a security or trade." },
  { routeId: "trade-capital-funding", label: "Capital & Wallet Funding Rules", target: "transactionReview", focus: "capital", description: "The capital and wallet-funding queue is unavailable in the current source. This route is read-only; it cannot accept or post funds." },
  { routeId: "trade-fees-earnings", label: "Fees & Earnings Limits", target: "transactionReview", focus: "fees", description: "Review the legacy global fee record and configured earnings ceilings. The single active package-specific fee editor is under Tiers & Eligibility; this route is read-only. Configured terms are not realized earnings or a posted wallet credit." },
  { routeId: "trade-retries", label: "Retries & Carry-Forward", target: "tradeRetryPolicy", description: "Review technical delivery retries and their status. Carry-forward across daily windows is not available; a delivery retry is not a trade-execution retry." },
  { routeId: "trade-active-pending", label: "Active & Pending Opportunities", target: "deliveryMonitor", description: "Inspect informational opportunities waiting for delivery or further processing. Pending work is not an allocation, settlement or payout." },
  { routeId: "trade-opportunity-usage-reset", label: "Opportunity Usage Reset", target: "tradeOpportunityReset", description: "Reset one customer’s or all customers’ opportunity usage and delivery cooldown with a required reason and audit record. Eligible untraded opportunities are withdrawn; linked/in-flight trades, wallets, ledger entries, packages, subscriptions and trade history are preserved." },
  { routeId: "trade-manual-payouts", label: "Manual Payouts", target: "manualPayouts", description: "Review and resolve internal manual payout requests. A request or status change does not itself transfer funds through a bank or blockchain provider." },
  { routeId: "trade-settlement", label: "Settlement & Reconciliation", target: "transactionReview", focus: "reconciliation", description: "Review recorded result evidence and reconcile persisted trade/settlement records with ledger entries. A review confirmation alone is not a posted wallet credit." },
  { routeId: "trade-history", label: "Trading History", target: "tradeHistory", description: "Inspect bounded read-only windows of persisted trade lifecycle and confirmed-result evidence. This route cannot confirm results or change ledger/trade records." },
  { routeId: "trade-worker-health", label: "Worker Health & Recovery", target: "tradeWorkerHealth", description: "Inspect worker heartbeat, due work and supported recovery status. A saved setting or recent heartbeat does not guarantee delivery or financial processing." },
  { routeId: "trade-audit-policy-history", label: "Audit & Policy History", target: "audit", description: "Review recorded administrator changes, reasons and policy versions. This is history, not a second editor or operational action." },
];

/** Cross-links to owner screens outside Trade Settings; these are references, not duplicate owners. */
export const relatedOwnerLinks: readonly GuideOwnerLink[] = [
  { routeId: "wallet-ledger", label: "Finance → Wallet & Ledger / Database Entries", target: "transactionReview", focus: "ledger", description: "Read-only wallet activity for one selected customer and one UTC day. Finance remains the sole owner; this shortcut does not add a Trade Settings ledger editor or settlement action." },
];

/** Read-only glossary projection of the canonical ownership registry; no policy values are copied here. */
export const fieldGlossary = tradeSettingsOwnershipRegistry.map((entry) => ({
  key: entry.key,
  label: entry.label,
  scope: entry.scope === "global" ? "Global" : entry.scope === "package" ? "One package/tier" : "One operational record",
  units: entry.units,
  validation: entry.validation,
  effectiveTime: entry.effectiveTime,
  customerImpact: entry.customerImpact,
  ownerRoute: entry.ownerRoute,
}));

export const troubleshooting: readonly GuideTroubleshootingItem[] = [
  { issue: "No active entitlement", routeId: "trade-tiers-eligibility", route: "Tiers & Eligibility", target: "packages", focus: "tiers", description: "Check for a current server-assigned entitlement from qualifying manual administrator credits. Customer/provider deposits, signup credits, profits and other credits do not qualify." },
  { issue: "No open opportunities", routeId: "trade-opportunity-publishing", route: "Opportunity Generation & Management", target: "opportunity", description: "Check the automatic-generation control, latest worker batches, active qualifying package, saved delivery policy and quotas, and a currently verified/enabled/non-archived company in the catalogue pool. No approved template is required. Customer delivery uses only offers assigned to that customer." },
  { issue: "Policy paused or invalid", routeId: "trade-package-configuration", route: "Package Configuration", target: "tradePackageConfiguration", description: "Check saved policy and the allocation safety status. Missing or invalid policy must remain unavailable rather than being replaced with an invented default." },
  { issue: "Quota exhausted", routeId: "trade-daily-delivery-caps", route: "Per-tier Daily Delivery Caps", target: "packages", focus: "quotas", description: "Compare the current delivery count with the operational cap and the customer's saved entitlement; the cap can reduce but not add entitlement." },
  { issue: "Cooldown or schedule not due", routeId: "trade-duration-closing", route: "Global Trade Timing & Settlement", target: "tradeDurationRules", description: "Check the configured server-side timing gates and persisted timestamps. Browser time or a countdown does not change the authoritative schedule." },
  { issue: "Worker unhealthy or delayed", routeId: "trade-worker-health", route: "Worker Health & Recovery", target: "tradeWorkerHealth", description: "Check last attempt/success, freshness, lag and retry state. A configured setting is not proof that an informational event was delivered." },
  { issue: "Waiting for review or settlement", routeId: "trade-settlement", route: "Settlement & Reconciliation", target: "transactionReview", focus: "reconciliation", description: "Review the persisted record and its evidence. Elapsed time, a display timer or review confirmation alone does not prove settlement or wallet posting." },
  { issue: "Inspect a saved trade record", routeId: "trade-history", route: "Trading History", target: "tradeHistory", description: "Use bounded trade-ID scan windows and persisted filters. Continue scanning when a sparse filter returns no matches; one empty window does not establish a whole-history result." },
];

export const statusDefinitions = [
  { term: "Generated", description: "The opportunity-generation assignment and its customer/package offer were successfully persisted. Generated is counted independently from delivery; it does not mean a delivery record was queued, received or rendered." },
  { term: "Generated / open customer offer", description: "A customer-facing open offer is a worker-generated record assigned to a customer/package with saved terms and an unexpired validity window. Historical unassigned manual/imported rows are not popup inputs. Template source references and review notes are administrator-supplied and are not independently verified. Open does not mean delivered." },
  { term: "Queued delivery", description: "Persisted deliveryStatus=queued: the informational delivery event is waiting for a worker attempt. It is not a customer receipt or a trade allocation." },
  { term: "Delivery in progress", description: "Persisted deliveryStatus=in_progress: a worker attempt holds the event for processing. It does not prove that the customer received or rendered the item." },
  { term: "Delivery retry wait", description: "Persisted deliveryStatus=retry_wait: a technical delivery retry is scheduled. It is not a trade-execution retry or carry-forward across daily windows." },
  { term: "Persisted delivery record", description: "A durable server-side delivery row exists. The administrator monitor reports this as Queued while it is queued, in progress or retry-wait; persistence alone is never reported as customer receipt or display." },
  { term: "Received", description: "Persisted deliveryStatus=received: the customer client acknowledged receipt of an informational item. Receipt is not allocation or financial evidence." },
  { term: "Rendered", description: "Persisted deliveryStatus=rendered: the customer client acknowledged rendering an informational item. Display is still not allocation or financial evidence." },
  { term: "Failed delivery", description: "Persisted deliveryStatus=failed is terminal for delivery: the attempt failed permanently or the configured retry path was unavailable or exhausted. It is distinct from a trade-execution failure and does not imply a financial result." },
  { term: "Dismissed delivery", description: "Persisted deliveryStatus=dismissed is terminal for delivery after dismissal. Dismissal changes presentation/lifecycle state only; it does not cancel a trade or settle funds." },
  { term: "Expired delivery", description: "Persisted deliveryStatus=expired is terminal for delivery when the offer is no longer open or valid. It does not establish a trade result or settlement." },
  { term: "Allocation", description: "Automatic financial allocation/execution is locked OFF in the current source. An informational offer or delivery is not allocated and does not move funds." },
  { term: "Awaiting review", description: "Persisted trade settlementStatus=pending: the record is waiting for authorized, evidence-based review. A due time or elapsed timer is not a result." },
  { term: "Funding delayed", description: "Persisted settlementStatus=confirmed_awaiting_credit: a reviewed result is confirmed, but its scheduled wallet-ledger credit has not posted yet. Confirmation is not a credit, and this is not a payout or external transfer." },
  { term: "Settled", description: "Persisted trade status=settled and settlementStatus=completed: the authoritative settlement and corresponding ledger posting are complete. A display status or elapsed time alone is not enough." },
  { term: "Funding unavailable", description: "An informational event may persist balanceStatus=insufficient when its saved available-balance snapshot is below the offer minimum. The separate capital and wallet-funding queue is unavailable in this source; this Guide offers no funding, top-up, acceptance or posting action." },
  { term: "Payout requested", description: "A separate customer withdrawal request exists, distinct from trade review/settlement. A request status does not by itself mean an external bank or blockchain transfer completed." },
] as const;

export function TradeSettingsAdminGuide({ onNavigate }: TradeSettingsAdminGuideProps) {
  const navigate = (target: string, focus?: string) => onNavigate(target, focus);

  return (
    <article className="arb-page portal-page trade-settings-guide" aria-labelledby="trade-settings-guide-title">
      <header className="portal-page-top">
        <div>
          <div className="eyebrow">Read-only administrator help · Guide 1.1</div>
          <h1 id="trade-settings-guide-title">Trade Settings Guide</h1>
          <p>This mounted Guide follows the current Trade Settings navigation and ownership registry. It explains the source-backed owner screens and links to them; it does not save settings or perform operational actions, and it does not verify deployment state.</p>
        </div>
        <BookOpen size={24} aria-hidden="true" />
      </header>

      <section className="settings-card" aria-labelledby="guide-principles-title">
        <h2 id="guide-principles-title">Current scope and safety</h2>
        <p>The current delivery path uses administrator-published, open opportunities. Published reference-market data does not create an offer. Informational delivery is separate from financial allocation, result review, settlement and payout. The previous-settlement prerequisite defaults ON and can be turned OFF in Package Configuration; OFF bypasses only that gate for future allocation checks and does not enable automatic financial activity.</p>
        <div className="admin-policy-note" role="note"><ShieldCheck size={16} /><span>Automatic financial allocation/execution is hard-locked OFF in the current source. Automatic financial execution remains hard-disabled by the release guard. An informational pop-up is not an offer generated from market refresh, a trade, wallet movement, evidence of execution, profit or settlement.</span></div>
        <p>Carry-forward across daily windows is not available. Where an owner screen shows a locked or unavailable status, do not treat it as an active control. Global delivery, company-rotation, randomized-timing and burst masters are stored together in the single persisted <code>trade.globalControls</code> record under Package Configuration. Legacy per-package master columns are inert compatibility fields, not separate switch owners.</p>
      </section>

      <section className="settings-card" aria-labelledby="guide-prepare-package-title">
        <h2 id="guide-prepare-package-title">Prepare a package (tier)</h2>
        <p>Use the existing owner screens in order. This Guide is explanatory only: it has no package editor or save action.</p>
        <ol className="trade-settings-guide__troubleshooting">
          <li><div><strong>Define the tier terms.</strong><p>Open Tiers &amp; Eligibility to create or review one administrator-managed tier. Supply its name, cumulative qualifying threshold in USD minor units, entitlement duration in calendar months and daily opportunity allowance. Add a start/expiry time only when the intended effective dates are known. A tier does not enrol a customer: only eligible, explicitly qualifying manual administrator wallet credits can lead to automatic server assignment.</p></div><button type="button" className="text-button" onClick={() => navigate("packages", "tiers")}>Open Tiers &amp; Eligibility</button></li>
          <li><div><strong>Set that tier’s offer bounds.</strong><p>In Per-tier Offer Rules &amp; Capital Limits, review the source-backed capital bounds and any configured-return and duration bounds available for the tier. Read the displayed units and validation limits; do not substitute guessed values. A configured return is a policy term, not evidence of market-earned profit or a wallet credit. Automatic financial allocation/execution remains locked OFF.</p></div><button type="button" className="text-button" onClick={() => navigate("packages", "policy")}>Open Per-tier Offer Rules &amp; Capital Limits</button></li>
          <li><div><strong>Check operational limits and presentation.</strong><p>Review the separate per-tier delivery ceiling, schedule, pop-up display and company-rotation rules. Delivery ceilings can reduce—but never increase—the entitlement. Display duration affects presentation only. Global delivery masters are not copied into tier rows.</p></div><button type="button" className="text-button" onClick={() => navigate("packages", "quotas")}>Open Per-tier Daily Delivery Caps</button></li>
          <li><div><strong>Review shared gates once.</strong><p>Package Configuration owns the single global eligibility/delivery controls and allocation-safety status. A global gate does not replace tier terms, and turning on an informational-delivery gate does not enable financial execution.</p></div><button type="button" className="text-button" onClick={() => navigate("tradePackageConfiguration")}>Open Package Configuration</button></li>
          <li><div><strong>Confirm an eligible offer can be delivered.</strong><p>Informational pop-ups require an active automatically assigned entitlement, valid saved policy, an administrator-published open opportunity, remaining quota, due schedule and a healthy delivery worker. Market-data refresh is not opportunity publication; worker health or saved settings are not a delivery guarantee. Review the owner screens and status; this Guide performs no changes.</p></div><button type="button" className="text-button" onClick={() => navigate("opportunity")}>Open Publish &amp; Manage Opportunities</button></li>
        </ol>
        <p>Tier-term edits apply to future automatic assignments; existing entitlement snapshots are not rewritten. Active records keep their saved terms under the documented effective-time policy. Do not treat a badge as eligibility or a delivery as allocation, execution or settlement.</p>
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

      <section className="settings-card" aria-labelledby="guide-related-owner-title">
        <h2 id="guide-related-owner-title">Related owner outside Trade Settings</h2>
        <p>Use this shortcut to reach the existing owner. It does not create a duplicate Trade Settings destination or action.</p>
        <div className="trade-settings-guide__links">
          {relatedOwnerLinks.map((link) => <div className="trade-settings-guide__link" key={link.routeId}>
            <div><strong>{link.label}</strong><p>{link.description}</p></div>
            <button type="button" className="secondary-button" onClick={() => navigate(link.target, link.focus)} aria-label={`Open related owner: ${link.label}`}>
              Open owner <ExternalLink size={14} aria-hidden="true" />
            </button>
          </div>)}
        </div>
      </section>

      <section className="settings-card" aria-labelledby="guide-glossary-title">
        <h2 id="guide-glossary-title">Read-only field glossary</h2>
        <p>Entries below are projected from the Trade Settings ownership registry. Units and limits use its recorded units and validation text. The registry has no separate default-value field, so no defaults are inferred; a missing or unavailable value remains exactly that rather than being guessed.</p>
        <div className="trade-settings-guide__glossary-wrap">
          <table className="trade-settings-guide__glossary">
            <thead><tr><th scope="col">Setting</th><th scope="col">Scope</th><th scope="col">Units / range</th><th scope="col">Effective time</th><th scope="col">Customer impact</th><th scope="col">Owner</th></tr></thead>
            <tbody>{fieldGlossary.map((entry) => {
              const owner = ownerLinks.find((link) => link.routeId === entry.ownerRoute);
              return <tr key={entry.key}>
                <th scope="row">{entry.label}</th>
                <td>{entry.scope}</td>
                <td><span>{entry.units}</span><br /><span>{entry.validation}</span></td>
                <td>{entry.effectiveTime}</td>
                <td>{entry.customerImpact}</td>
                <td>{owner
                  ? <button type="button" className="text-button" onClick={() => navigate(owner.target, owner.focus)} aria-label={`Open owner screen ${owner.label} for ${entry.label}`}>{owner.label}</button>
                  : <span>Owner route not linked: {entry.ownerRoute}</span>}</td>
              </tr>;
            })}</tbody>
          </table>
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
        <p>Delivery entries name persisted <code>deliveryStatus</code> values; they are separate from opportunity event state, trade settlement state and wallet posting.</p>
        <dl className="trade-settings-guide__statuses">
          {statusDefinitions.map((status) => <div key={status.term}><dt>{status.term}</dt><dd>{status.description}</dd></div>)}
        </dl>
      </section>
    </article>
  );
}
