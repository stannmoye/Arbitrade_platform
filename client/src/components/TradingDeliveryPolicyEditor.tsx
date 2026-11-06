import { Check } from "lucide-react";
import "./trading-package-card-colors.css";

export type TradingDeliveryPolicyRow={packageName:string;policyVersion?:number;enabled:boolean;automaticDelivery:boolean;automaticTradingEnabled:boolean;badgeLabel:string;badgeStyle:"neutral"|"blue"|"purple"|"gold"|"green";minimumPayoutRateBps:number|null;maximumPayoutRateBps:number|null;minimumTradeDurationSeconds:number|null;maximumTradeDurationSeconds:number|null;companyRotationEnabled:boolean;companyRotationCountryNames:string;companyRotationRepeatPolicy:"avoid_until_exhausted"|"allow_repeats";maxPopupsPerDay:number;maxVisibleOffers:number;minimumTradeUnits:number;maximumTradeUnits:number;minHourlyTarget:number;normalHourlyTarget:number;marketInfluenceBps:number;burstEnabled:boolean;maxBurstSize:number;dailyPopupTarget:number;schedulingPeriod:"rolling_24h"|"calendar_day";minIntervalSeconds:number;maxIntervalSeconds:number;randomizationEnabled:boolean;completionDisplaySeconds:number;postCompletionIntervalSeconds:number;maxPendingDeliveries:number;maxTradeAttemptsPerDay:number;tradeRetryDelaySeconds:number;maxSuccessfulTradesPerDay:number;maxConcurrentActiveTrades:number;requirePreviousSettlement:boolean;minSettlementDelaySeconds:number;maxSettlementDelaySeconds:number;minimumRewardBps:number;maxDailyRewardMinor:number;maxRewardPerTradeMinor:number;closePolicy:"after_completion"|"after_final_display"};

type PolicyEditorFocus = "policy" | "quotas" | "delivery" | "display" | "retries" | "rotation";
type Props = {
  focus?: PolicyEditorFocus;
  policyRows: TradingDeliveryPolicyRow[];
  policyMessage: string;
  policyMessageKind: "success" | "error";
  policyReason: string;
  isLoading: boolean;
  isSaving: boolean;
  updateRow: (index: number, key: Exclude<keyof TradingDeliveryPolicyRow, "packageName">, value: number | boolean | string | null) => void;
  onPolicyReasonChange: (reason: string) => void;
  policyRowValid: (row: TradingDeliveryPolicyRow) => boolean;
  onSave: () => void;
};

export default function TradingDeliveryPolicyEditor({ focus, policyRows, policyMessage, policyMessageKind, policyReason, isLoading, isSaving, updateRow, onPolicyReasonChange, policyRowValid, onSave }: Props) {
  const show = (section: PolicyEditorFocus) => !focus || focus === section;
  return <div className="settings-card package-policy-card">
  <div className="eyebrow">Administrator-managed Trading settings</div>
  <h2>{focus==="quotas"?"Per-tier daily delivery caps":focus==="policy"?"Per-tier offer rules and capital limits":focus==="delivery"?"Per-tier delivery schedule":focus==="display"?"Per-tier pop-up display":focus==="retries"?"Per-tier retries and settlement safeguards":focus==="rotation"?"Per-tier company rotation rules":"Trading policy settings"}</h2>
  <p>Each section edits settings for the named tier. Changes are validated, audited and versioned by the server. Existing customer entitlement, delivered pop-up and active trade snapshots are not silently rewritten; display controls affect presentation only. Automatic financial execution remains protected OFF.</p>
  {focus==="quotas"&&<div className="admin-policy-note" role="note"><strong>Important: two different limits.</strong> The daily opportunity entitlement is set in <strong>Trade Settings → Tiers &amp; Eligibility</strong>. This page sets per-tier operational delivery ceilings that can reduce that entitlement but never increase it. To make a 600-per-day tier allowance available, set the hard daily pop-up ceiling to at least 600 and leave the optional target at 0. Existing customer entitlements keep their original saved quota; edits apply to future automatic assignments.</div>}
  {focus==="policy"&&<div className="admin-policy-note" role="note"><strong>Scope:</strong> This page contains per-tier offer eligibility and capital bounds only. Per-tier policy and pop-up delivery switches are controlled in the shared Trading controls panel above this page; no global switch is edited here. Tier threshold, entitlement duration and daily opportunity entitlement are maintained only in <strong>Tiers &amp; Eligibility</strong>.</div>}
  {policyMessage&&<div className={"test-notice "+(policyMessageKind==="error"?"error":"success")} role={policyMessageKind==="error"?"alert":"status"} aria-live="polite">{policyMessage}</div>}
  {policyRows.map((row,index)=><article className="package-admin-card" key={row.packageName} style={{marginBottom:16}}>
    <div className="package-admin-head"><div><span className="eyebrow">Tier policy</span><h3>{row.packageName}</h3></div><span className="admin-live-chip">Versioned</span></div>
    {show("quotas")&&<>
    <div className="eyebrow">Operational delivery ceilings</div>
    <div className="form-two">
      <label>Hard daily pop-up ceiling<input aria-label={row.packageName+" maximum pop-ups per day"} type="number" min="1" max="1000" step="1" value={row.maxPopupsPerDay} onChange={e=>updateRow(index,"maxPopupsPerDay",Number(e.target.value))}/><small>This is an operational ceiling, not the tier entitlement. It is the per-tier operational ceiling: 1–1,000 pop-ups in the selected counting window. It can reduce, never raise, the customer's separate daily entitlement; it applies to later delivery eligibility, not already delivered offers or saved entitlement terms.</small></label>
      <label>Maximum visible offers at once<input aria-label={row.packageName+" maximum visible offers at once"} type="number" min="1" max="10000" step="1" value={row.maxVisibleOffers} onChange={e=>updateRow(index,"maxVisibleOffers",Number(e.target.value))}/><small>Per-tier concurrent pending/visible-offer limit: 1–10,000 offers. This is not a daily quota. It is presentation capacity, not an entitlement; occupied slots can hold back later deliveries.</small></label>
      <label>Optional daily target cap (0 = no extra cap)<input type="number" min="0" max="10000" step="1" value={row.dailyPopupTarget} onChange={e=>updateRow(index,"dailyPopupTarget",Number(e.target.value))}/><small>Additional per-tier operational target: 0–10,000 pop-ups per counting window; 0 = no extra cap. It can reduce but never increase the cumulative tier entitlement and applies to delivery counting, not display duration.</small></label>
      <label>Delivery counting window<select value={row.schedulingPeriod} onChange={e=>updateRow(index,"schedulingPeriod",e.target.value)}><option value="rolling_24h">Rolling 24 hours</option><option value="calendar_day">Calendar day (UTC)</option></select><small>Selects the supported window for counting operational deliveries on this tier: rolling 24 hours or a UTC calendar day. It changes neither the tier entitlement nor offer terms.</small></label>
    </div>
    </>}
    {show("policy")&&<>
    <div className="eyebrow">Capital bounds</div>
    <div className="form-two">
      <label>Minimum required capital (USD units)<input type="number" min="1" max="2147483647" step="1" value={row.minimumTradeUnits} onChange={e=>updateRow(index,"minimumTradeUnits",Number(e.target.value))}/><small>Lower per-tier required-capital bound, in whole USD units: 1–2,147,483,647. The server converts this bound for the offer currency and checks available balance separately; it is not the qualifying threshold or entitlement amount.</small></label>
      <label>Maximum required capital (USD units)<input type="number" min="1" max="2147483647" step="1" value={row.maximumTradeUnits} onChange={e=>updateRow(index,"maximumTradeUnits",Number(e.target.value))}/><small>Upper per-tier required-capital bound in whole USD units: 1–2,147,483,647, and it must be at least the minimum. New delivered offers use the saved bound; existing offer/trade snapshots are not rewritten.</small></label>
    </div>
    </>}
    {(show("delivery")||show("display"))&&<>
    <div className="eyebrow">Delivery cadence and display</div>
    <div className="form-two">
      {show("delivery")&&<>
      <label>Minimum interval between deliveries (seconds)<input type="number" min="0" max="604800" step="1" value={row.minIntervalSeconds} onChange={e=>updateRow(index,"minIntervalSeconds",Number(e.target.value))}/><small>Per-tier lower wait bound between deliveries: 0–604,800 whole seconds; it must not exceed the maximum. Saved bounds affect later delivery eligibility, not the creation of source opportunities.</small></label>
      <label>Maximum interval between deliveries (seconds)<input type="number" min="0" max="604800" step="1" value={row.maxIntervalSeconds} onChange={e=>updateRow(index,"maxIntervalSeconds",Number(e.target.value))}/><small>Per-tier upper wait bound between deliveries: 0–604,800 whole seconds; it must be at least the minimum. Whether timing varies within these bounds is controlled separately in the shared Trading controls panel.</small></label>
      </>}
      {show("display")&&<>
      <label>Post-completion card display delay (seconds)<input type="number" min="1" max="3600" step="1" value={row.completionDisplaySeconds} onChange={e=>updateRow(index,"completionDisplaySeconds",Number(e.target.value))}/><small>Short display delay after an opportunity reaches its completed state: 1–3,600 seconds. This is the only separate presentation delay; it does not extend or change the selected opportunity duration.</small></label>
      </>}
      {show("delivery")&&<>
      <label>Interval after completion (seconds)<input type="number" min="0" max="604800" step="1" value={row.postCompletionIntervalSeconds} onChange={e=>updateRow(index,"postCompletionIntervalSeconds",Number(e.target.value))}/><small>Additional per-tier wait after the customer's latest completed trade before later delivery eligibility: 0–604,800 whole seconds; 0 = no extra wait. It is a delivery cooldown, not trade duration or card display time.</small></label>
      <label>Maximum pending deliveries<input type="number" min="0" max="1000" step="1" value={row.maxPendingDeliveries} onChange={e=>updateRow(index,"maxPendingDeliveries",Number(e.target.value))}/><small>Per-customer/per-package cap on queued, in-progress and retry-wait informational deliveries: 0–1,000 items. Delivered, dismissed, failed and expired rows do not count. A value of 0 blocks new pending deliveries; a positive daily target also requires this cap to be positive.</small></label>
      </>}
    </div>
    </>}
    {show("retries")&&<>
    <div className="eyebrow">Per-tier financial retry and concurrency safeguards</div>
    <p className="policy-note">Carry-forward across daily windows is not enabled. A retry window that expires is marked failed for review.</p>
    <div className="form-two">
      <label>Maximum trade attempts per day<input type="number" min="0" max="10000" step="1" value={row.maxTradeAttemptsPerDay} onChange={e=>updateRow(index,"maxTradeAttemptsPerDay",Number(e.target.value))}/><small>Per-tier policy sets a customer-wide daily attempt ceiling across opportunities, including technical retries: 0–10,000; 0 = no extra daily cap. It limits server-side attempts, not pop-up display.</small></label>
      <label>Trade retry delay (seconds)<input type="number" min="5" max="3600" step="1" value={row.tradeRetryDelaySeconds} onChange={e=>updateRow(index,"tradeRetryDelaySeconds",Number(e.target.value))}/><small>Wait before an eligible technical retry: 5–3,600 whole seconds. The server records an already scheduled retry time; editing this policy does not reset that timer or enable financial execution.</small></label>
      <label>Maximum successful trades per day<input type="number" min="0" max="10000" step="1" value={row.maxSuccessfulTradesPerDay} onChange={e=>updateRow(index,"maxSuccessfulTradesPerDay",Number(e.target.value))}/><small>Per-tier policy's customer-wide daily ceiling for settled successful trades: 0–10,000; 0 = no extra cap. The server counts the UTC-day limit; this is not a delivery quota.</small></label>
      <label>Maximum concurrent active trades<input type="number" min="1" max="1000" step="1" value={row.maxConcurrentActiveTrades} onChange={e=>updateRow(index,"maxConcurrentActiveTrades",Number(e.target.value))}/><small>Per-tier policy's customer-wide active-trade limit: 1–1,000 at allocation checks. It limits active trades, not the number of informational pop-ups shown.</small></label>
      <div className="admin-policy-note" role="note"><strong>Previous-settlement prerequisite is global.</strong> Its ON/OFF state is controlled in <strong>Trade Settings → Package Configuration</strong>; this tier has no separate override.</div>
      <label>Minimum settlement delay (seconds)<input type="number" min="900" max="604800" step="1" value={row.minSettlementDelaySeconds} onChange={e=>updateRow(index,"minSettlementDelaySeconds",Math.max(900,Number(e.target.value)||900))}/><small>Lower per-tier bound for the wait from scheduled trade completion to settlement review: 900–604,800 whole seconds (15 minutes–7 days). It must not exceed the maximum; saved deadlines on existing trades remain unchanged.</small></label>
      <label>Maximum settlement delay (seconds)<input type="number" min="900" max="604800" step="1" value={row.maxSettlementDelaySeconds} onChange={e=>updateRow(index,"maxSettlementDelaySeconds",Math.max(900,Number(e.target.value)||900))}/><small>Upper per-tier bound for the wait from scheduled completion to settlement review: 900–604,800 whole seconds, and at least the minimum. This is separate from trade duration and any wallet-credit delay.</small></label>
    </div>
    </>}
    {show("policy")&&<>
    <div className="eyebrow">Package badge</div>
    <div className="form-two">
      <label>Badge label<input type="text" maxLength={40} value={row.badgeLabel} onChange={e=>updateRow(index,"badgeLabel",e.target.value)}/><small>Optional visual label for this tier, up to 40 characters; blank means no badge. It never changes eligibility or financial terms, and an already delivered pop-up keeps its badge snapshot.</small></label>
      <label>Badge style<select value={row.badgeStyle} onChange={e=>updateRow(index,"badgeStyle",e.target.value as TradingDeliveryPolicyRow["badgeStyle"])}><option value="neutral">Neutral</option><option value="blue">Blue</option><option value="purple">Purple</option><option value="gold">Gold</option><option value="green">Green</option></select><small>Visual style for this tier's badge; only the listed built-in styles are accepted. It cannot grant eligibility or alter an existing pop-up.</small></label>
    </div>
    <div className="eyebrow">Configured return and duration per pop-up</div>
    <p className="policy-help">These are this tier's configured offer bounds, not market profit or a guarantee. Each newly delivered pop-up selects one rate and one duration inside the saved tier ranges. Each newly delivered pop-up stores its selected rate, duration and policy version; retries reuse the saved offer terms, and already delivered pop-ups and allocated trades keep their snapshots; existing pop-ups keep their original snapshots. Package duration, trade duration and display duration are separate clocks.</p>
    <div className="form-two">
      <label>Minimum configured return rate (%)<input type="number" min="0.01" max="50" step="0.01" value={row.minimumPayoutRateBps===null?"":(row.minimumPayoutRateBps/100).toFixed(2)} onChange={e=>updateRow(index,"minimumPayoutRateBps",e.target.value===""?null:Math.round(Number(e.target.value)*100))}/><small>Lower per-tier configured-return bound: 0.01%–50.00%, entered in 0.01 percentage-point steps and stored as basis points (2.70% = 270 bps). Set both bounds; enabled delivery requires a positive minimum no greater than the maximum. This is not market profit.</small></label>
      <label>Maximum configured return rate (%)<input type="number" min="0.01" max="50" step="0.01" value={row.maximumPayoutRateBps===null?"":(row.maximumPayoutRateBps/100).toFixed(2)} onChange={e=>updateRow(index,"maximumPayoutRateBps",e.target.value===""?null:Math.round(Number(e.target.value)*100))}/><small>Upper per-tier configured-return bound: 0.01%–50.00% (basis points; 1 bp = 0.01 percentage point). Set both bounds and keep the maximum at least the minimum; the selected configured rate is saved on new pop-ups, not derived from market performance.</small></label>
      <label>Minimum trade duration (seconds)<input type="number" min="10" max="86400" step="1" value={row.minimumTradeDurationSeconds??""} onChange={e=>updateRow(index,"minimumTradeDurationSeconds",e.target.value===""?null:Number(e.target.value))}/><small>Lower per-tier allowed trade lifetime: 10–86,400 whole seconds (10 seconds–24 hours). Set both bounds; it governs the server-owned trade countdown, not package entitlement lifetime or expanded-card display.</small></label>
      <label>Maximum trade duration (seconds)<input type="number" min="10" max="86400" step="1" value={row.maximumTradeDurationSeconds??""} onChange={e=>updateRow(index,"maximumTradeDurationSeconds",e.target.value===""?null:Number(e.target.value))}/><small>Upper per-tier allowed trade lifetime: 10–86,400 whole seconds, and at least the minimum. The server saves the selected duration on each new pop-up; existing pop-ups/trades keep their original timing snapshot.</small></label>
    </div>
    </>}
    {show("rotation")&&<>
    <div className="eyebrow">Company spotlight rotation</div>
    <div className="form-two">
      <p>Informational company references only; this never creates or authorizes a trade. Company rotation ON/OFF is controlled in the persistent Trading controls panel above this page. Use the remaining settings here to define which approved companies can rotate and how repeats are handled.</p>
      <label>Repeat policy<select value={row.companyRotationRepeatPolicy} onChange={e=>updateRow(index,"companyRotationRepeatPolicy",e.target.value as TradingDeliveryPolicyRow["companyRotationRepeatPolicy"])}><option value="avoid_until_exhausted">Avoid repeats until the pool is traversed</option><option value="allow_repeats">Allow repeats</option></select></label>
      <label>Country-folder filters<input type="text" maxLength={2000} value={row.companyRotationCountryNames} onChange={e=>updateRow(index,"companyRotationCountryNames",e.target.value)}/><small>Comma-separated exact catalogue folder labels; blank includes all administrator-verified, non-archived records. Country folders do not verify headquarters or listing status.</small></label>
    </div>
    </>}
    {show("policy")&&<>
    <div className="eyebrow">Reward policy limits</div>
    <p className="policy-help">This is a minimum eligibility constraint, not a generated or guaranteed return.</p>
    <div className="form-two">
      <label>Minimum eligible reward rate (basis points)<input type="number" min="0" max="10000" step="1" value={row.minimumRewardBps} onChange={e=>updateRow(index,"minimumRewardBps",Number(e.target.value))}/><small>Per-tier server eligibility floor: 0–10,000 whole basis points (0%–100%; 100 bps = 1%). It is a minimum check, not the configured return rate, market profit or a display value.</small></label>
      <label>Maximum daily reward cap (currency minor units)<input type="number" min="0" max="2147483647" step="1" value={row.maxDailyRewardMinor} onChange={e=>updateRow(index,"maxDailyRewardMinor",Number(e.target.value))}/><small>Per-tier daily reward ceiling: 0–2,147,483,647 whole currency minor units; 0 = no additional cap. It limits the server-tracked reward allowance, not capital, the configured rate or pop-up display.</small></label>
      <label>Maximum reward per trade (currency minor units)<input type="number" min="0" max="2147483647" step="1" value={row.maxRewardPerTradeMinor} onChange={e=>updateRow(index,"maxRewardPerTradeMinor",Number(e.target.value))}/><small>Per-tier per-trade reward ceiling: 0–2,147,483,647 whole currency minor units; 0 = no additional cap. This caps reward amount rather than capital or the configured return rate; it does not change card display.</small></label>
    </div>
    </>}
    {show("display")&&<>
    <div className="eyebrow">Card close policy</div>
    <div className="form-two">
      <label>Card close policy<select value={row.closePolicy} onChange={e=>updateRow(index,"closePolicy",e.target.value)}><option value="after_completion">After completion</option><option value="after_final_display">After final status display</option></select><small>Per-tier presentation rule for when a card may close: after completion or after its final status display. Pending, retrying and awaiting-settlement cards remain accessible; this does not settle a trade or change its result.</small></label>
    </div>
    </>}
  </article>)}
  {policyRows.length===0&&<div className="empty-state">{isLoading?"Loading saved tier policies…":"No tier policies were returned. Refresh the policy list before editing."}</div>}
  <label>Reason for changing Trading tier policies (required for audit)<textarea value={policyReason} maxLength={500} minLength={5} onChange={e=>onPolicyReasonChange(e.target.value)} placeholder="Explain why these delivery, automation, rate or duration controls are changing."/><small>Enter 5–500 characters for the administrator audit record.</small></label>
  <button className="primary-button" type="button" disabled={!policyRows.length||isLoading||isSaving} aria-busy={isSaving} onClick={onSave}>{isSaving?"Saving policy…":"Save per-tier policy"} <Check size={14}/></button>
</div>;
}
