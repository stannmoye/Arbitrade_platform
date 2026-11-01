import { Check } from "lucide-react";
import "./trading-package-card-colors.css";

export type TradingDeliveryPolicyRow={packageName:string;enabled:boolean;automaticDelivery:boolean;automaticTradingEnabled:boolean;badgeLabel:string;badgeStyle:"neutral"|"blue"|"purple"|"gold"|"green";minimumPayoutRateBps:number|null;maximumPayoutRateBps:number|null;minimumTradeDurationSeconds:number|null;maximumTradeDurationSeconds:number|null;companyRotationEnabled:boolean;companyRotationCountryNames:string;companyRotationRepeatPolicy:"avoid_until_exhausted"|"allow_repeats";maxPopupsPerDay:number;maxVisibleOffers:number;minimumTradeUnits:number;maximumTradeUnits:number;minHourlyTarget:number;normalHourlyTarget:number;marketInfluenceBps:number;burstEnabled:boolean;maxBurstSize:number;dailyPopupTarget:number;schedulingPeriod:"rolling_24h"|"calendar_day";minIntervalSeconds:number;maxIntervalSeconds:number;randomizationEnabled:boolean;popupDisplayTargetSeconds:number;completionDisplaySeconds:number;postCompletionIntervalSeconds:number;maxPendingDeliveries:number;maxDeliveryAttempts:number;maxTradeAttemptsPerDay:number;tradeRetryDelaySeconds:number;maxSuccessfulTradesPerDay:number;maxConcurrentActiveTrades:number;requirePreviousSettlement:boolean;minSettlementDelaySeconds:number;maxSettlementDelaySeconds:number;minimumRewardBps:number;maxDailyRewardMinor:number;maxRewardPerTradeMinor:number;closePolicy:"after_completion"|"after_final_display"};

type PolicyEditorFocus = "policy" | "quotas" | "delivery" | "display" | "retries" | "rotation";
type Props = {
  focus?: PolicyEditorFocus;
  policyRows: TradingDeliveryPolicyRow[];
  policyMessage: string;
  policyReason: string;
  isLoading: boolean;
  isSaving: boolean;
  updateRow: (index: number, key: Exclude<keyof TradingDeliveryPolicyRow, "packageName">, value: number | boolean | string | null) => void;
  onPolicyReasonChange: (reason: string) => void;
  policyRowValid: (row: TradingDeliveryPolicyRow) => boolean;
  onSave: () => void;
};

export default function TradingDeliveryPolicyEditor({ focus, policyRows, policyMessage, policyReason, isLoading, isSaving, updateRow, onPolicyReasonChange, policyRowValid, onSave }: Props) {
  const show = (section: PolicyEditorFocus) => !focus || focus === section;
  return <div className="settings-card package-policy-card">
  <div className="eyebrow">Administrator-managed Trading settings</div>
  <h2>{focus==="quotas"?"Daily delivery caps":focus==="policy"?"Offer rules and capital limits":focus==="delivery"?"Delivery schedule":focus==="display"?"Customer pop-up display":focus==="retries"?"Retries and settlement safeguards":focus==="rotation"?"Company rotation rules":"Trading policy settings"}</h2>
  <p>Each section below edits only the settings named on this page. Changes are validated, audited and versioned by the server. Existing customer entitlement snapshots and active trade records are not silently rewritten. Automatic financial execution remains protected OFF.</p>
  {focus==="quotas"&&<div className="admin-policy-note" role="note"><strong>Important: two different limits.</strong> The daily opportunity entitlement is set in <strong>Trade Settings → Tiers &amp; Eligibility</strong>. This page sets delivery ceilings that can reduce that entitlement. To make a 600-per-day tier allowance available, set the hard daily pop-up ceiling to at least 600 and leave the optional target at 0. Existing customer entitlements keep their original saved quota; edits apply to future automatic assignments.</div>}
  {focus==="policy"&&<div className="admin-policy-note" role="note"><strong>Scope:</strong> This page contains offer eligibility and capital bounds only. The shared Trading controls panel above this page is the single place to turn policy and pop-up delivery ON or OFF. Tier threshold, duration and daily opportunity entitlement are maintained only in <strong>Tiers &amp; Eligibility</strong>.</div>}
  {policyMessage&&<div className="test-notice" role="status" aria-live="polite">{policyMessage}</div>}
  {policyRows.map((row,index)=><article className="package-admin-card" key={row.packageName} style={{marginBottom:16}}>
    <div className="package-admin-head"><div><span className="eyebrow">Tier policy</span><h3>{row.packageName}</h3></div><span className="admin-live-chip">Versioned</span></div>
    {show("quotas")&&<>
    <div className="eyebrow">Operational delivery ceilings</div>
    <div className="form-two">
      <label>Hard daily pop-up ceiling<input aria-label={row.packageName+" maximum pop-ups per day"} type="number" min="1" max="1000" step="1" value={row.maxPopupsPerDay} onChange={e=>updateRow(index,"maxPopupsPerDay",Number(e.target.value))}/><small>This is an operational ceiling, not the tier entitlement. It can reduce delivery below the allowance assigned in Tiers &amp; Eligibility. Values up to 1,000 are supported here.</small></label>
      <label>Maximum visible offers at once<input aria-label={row.packageName+" maximum visible offers at once"} type="number" min="1" max="10000" step="1" value={row.maxVisibleOffers} onChange={e=>updateRow(index,"maxVisibleOffers",Number(e.target.value))}/><small>Limits how many offers can be pending or visible at once. This is not a daily quota.</small></label>
      <label>Optional daily target cap (0 = no extra cap)<input type="number" min="0" max="10000" step="1" value={row.dailyPopupTarget} onChange={e=>updateRow(index,"dailyPopupTarget",Number(e.target.value))}/><small>A positive value adds another ceiling across eligible tiers. Leave at 0 to use the full allowance permitted by the tier entitlement and hard daily pop-up ceiling.</small></label>
      <label>Delivery counting window<select value={row.schedulingPeriod} onChange={e=>updateRow(index,"schedulingPeriod",e.target.value)}><option value="rolling_24h">Rolling 24 hours</option><option value="calendar_day">Calendar day (UTC)</option></select><small>Controls the time window used to count the operational delivery ceiling across eligible tiers.</small></label>
    </div>
    </>}
    {show("policy")&&<>
    <div className="eyebrow">Capital bounds</div>
    <div className="form-two">
      <label>Minimum required capital (USD units)<input type="number" min="1" max="2147483647" step="1" value={row.minimumTradeUnits} onChange={e=>updateRow(index,"minimumTradeUnits",Number(e.target.value))}/><small>Whole USD units in the existing policy schema.</small></label>
      <label>Maximum required capital (USD units)<input type="number" min="1" max="2147483647" step="1" value={row.maximumTradeUnits} onChange={e=>updateRow(index,"maximumTradeUnits",Number(e.target.value))}/><small>Must be greater than or equal to the minimum.</small></label>
    </div>
    </>}
    {(show("delivery")||show("display"))&&<>
    <div className="eyebrow">Delivery cadence and display</div>
    <div className="form-two">
      {show("delivery")&&<>
      <label>Minimum interval between deliveries (seconds)<input type="number" min="0" max="604800" step="1" value={row.minIntervalSeconds} onChange={e=>updateRow(index,"minIntervalSeconds",Number(e.target.value))}/></label>
      <label>Maximum interval between deliveries (seconds)<input type="number" min="0" max="604800" step="1" value={row.maxIntervalSeconds} onChange={e=>updateRow(index,"maxIntervalSeconds",Number(e.target.value))}/></label>
      </>}
      {show("display")&&<>
      <label>Expanded pop-up display duration (seconds)<input type="number" min="1" max="604800" step="1" value={row.popupDisplayTargetSeconds} onChange={e=>updateRow(index,"popupDisplayTargetSeconds",Number(e.target.value))}/><small>Controls display only; must not cancel an active trade.</small></label>
      <label>Completed card display duration (seconds)<input type="number" min="1" max="3600" step="1" value={row.completionDisplaySeconds} onChange={e=>updateRow(index,"completionDisplaySeconds",Number(e.target.value))}/></label>
      </>}
      {show("delivery")&&<>
      <label>Interval after completion (seconds)<input type="number" min="0" max="604800" step="1" value={row.postCompletionIntervalSeconds} onChange={e=>updateRow(index,"postCompletionIntervalSeconds",Number(e.target.value))}/></label>
      <label>Maximum pending deliveries<input type="number" min="0" max="1000" step="1" value={row.maxPendingDeliveries} onChange={e=>updateRow(index,"maxPendingDeliveries",Number(e.target.value))}/></label>
      </>}
    </div>
    </>}
    {show("retries")&&<>
    <div className="eyebrow">Trade retry and concurrency limits</div>
    <p className="policy-note">Carry-forward across daily windows is not enabled. A retry window that expires is marked failed for review.</p>
    <div className="form-two">
      <label>Maximum delivery attempts<input type="number" min="1" max="20" step="1" value={row.maxDeliveryAttempts} onChange={e=>updateRow(index,"maxDeliveryAttempts",Number(e.target.value))}/></label>
      <label>Maximum trade attempts per day<input type="number" min="0" max="10000" step="1" value={row.maxTradeAttemptsPerDay} onChange={e=>updateRow(index,"maxTradeAttemptsPerDay",Number(e.target.value))}/><small>Customer-wide daily cap across all opportunities, including technical retries. Set to 0 for no daily cap.</small></label>
      <label>Trade retry delay (seconds)<input type="number" min="5" max="3600" step="1" value={row.tradeRetryDelaySeconds} onChange={e=>updateRow(index,"tradeRetryDelaySeconds",Number(e.target.value))}/></label>
      <label>Maximum successful trades per day<input type="number" min="0" max="10000" step="1" value={row.maxSuccessfulTradesPerDay} onChange={e=>updateRow(index,"maxSuccessfulTradesPerDay",Number(e.target.value))}/></label>
      <label>Maximum concurrent active trades<input type="number" min="1" max="1000" step="1" value={row.maxConcurrentActiveTrades} onChange={e=>updateRow(index,"maxConcurrentActiveTrades",Number(e.target.value))}/></label>
      <label>Require previous trade settlement<select aria-label={row.packageName+" previous settlement safety gate"} value={row.requirePreviousSettlement?"true":"false"} disabled><option value="true">Yes — wait for settlement</option><option value="false">No — saved legacy state</option></select><small>The settlement safety gate cannot be disabled in the admin UI.</small></label>{!row.requirePreviousSettlement&&<button className="secondary-button" type="button" onClick={()=>updateRow(index,"requirePreviousSettlement",true)}>Enable settlement guard</button>}
      <label>Minimum settlement delay (seconds)<input type="number" min="900" max="604800" step="1" value={row.minSettlementDelaySeconds} onChange={e=>updateRow(index,"minSettlementDelaySeconds",Math.max(900,Number(e.target.value)||900))}/><small>UI minimum: 900 seconds (15 minutes). One-minute settlement timing is not available.</small></label>
      <label>Maximum settlement delay (seconds)<input type="number" min="900" max="604800" step="1" value={row.maxSettlementDelaySeconds} onChange={e=>updateRow(index,"maxSettlementDelaySeconds",Math.max(900,Number(e.target.value)||900))}/><small>Must be at least the minimum delay and at least 900 seconds.</small></label>
    </div>
    </>}
    {show("policy")&&<>
    <div className="eyebrow">Package badge</div>
    <div className="form-two">
      <label>Badge label<input type="text" maxLength={40} value={row.badgeLabel} onChange={e=>updateRow(index,"badgeLabel",e.target.value)}/><small>Leave blank to show no badge. Existing popup badges do not change after delivery.</small></label>
      <label>Badge style<select value={row.badgeStyle} onChange={e=>updateRow(index,"badgeStyle",e.target.value as TradingDeliveryPolicyRow["badgeStyle"])}><option value="neutral">Neutral</option><option value="blue">Blue</option><option value="purple">Purple</option><option value="gold">Gold</option><option value="green">Green</option></select><small>Only approved built-in styles are accepted.</small></label>
    </div>
    <div className="eyebrow">Configured return and duration per pop-up</div>
    <p className="policy-help">Each newly delivered pop-up selects one rate and one duration inside the saved tier ranges. Both values are captured with that pop-up and reused by trade allocation and retries; existing pop-ups keep their original snapshots. These are configured terms, not a guarantee of market performance.</p>
    <div className="form-two">
      <label>Minimum configured return rate (%)<input type="number" min="0.01" max="50" step="0.01" value={row.minimumPayoutRateBps===null?"":(row.minimumPayoutRateBps/100).toFixed(2)} onChange={e=>updateRow(index,"minimumPayoutRateBps",e.target.value===""?null:Math.round(Number(e.target.value)*100))}/><small>Stored in basis points; 2.70% = 270 bps.</small></label>
      <label>Maximum configured return rate (%)<input type="number" min="0.01" max="50" step="0.01" value={row.maximumPayoutRateBps===null?"":(row.maximumPayoutRateBps/100).toFixed(2)} onChange={e=>updateRow(index,"maximumPayoutRateBps",e.target.value===""?null:Math.round(Number(e.target.value)*100))}/><small>Both bounds must be set together; minimum must be positive and cannot exceed maximum.</small></label>
      <label>Minimum trade duration (seconds)<input type="number" min="10" max="86400" step="1" value={row.minimumTradeDurationSeconds??""} onChange={e=>updateRow(index,"minimumTradeDurationSeconds",e.target.value===""?null:Number(e.target.value))}/></label>
      <label>Maximum trade duration (seconds)<input type="number" min="10" max="86400" step="1" value={row.maximumTradeDurationSeconds??""} onChange={e=>updateRow(index,"maximumTradeDurationSeconds",e.target.value===""?null:Number(e.target.value))}/><small>Both duration bounds must be set together. Existing pop-ups retain their original snapshots.</small></label>
    </div>
    </>}
    {show("rotation")&&<>
    <div className="eyebrow">Company spotlight rotation</div>
    <div className="form-two">
      <p>Company rotation ON/OFF is controlled in the persistent Trading controls panel above this page. Use the remaining settings here to define which approved companies can rotate and how repeats are handled.</p>
      <label>Repeat policy<select value={row.companyRotationRepeatPolicy} onChange={e=>updateRow(index,"companyRotationRepeatPolicy",e.target.value as TradingDeliveryPolicyRow["companyRotationRepeatPolicy"])}><option value="avoid_until_exhausted">Avoid repeats until the pool is traversed</option><option value="allow_repeats">Allow repeats</option></select></label>
      <label>Country-folder filters<input type="text" maxLength={2000} value={row.companyRotationCountryNames} onChange={e=>updateRow(index,"companyRotationCountryNames",e.target.value)}/><small>Comma-separated exact catalogue folder labels; blank includes all administrator-verified, non-archived records. Country folders do not verify headquarters or listing status.</small></label>
    </div>
    </>}
    {show("policy")&&<>
    <div className="eyebrow">Reward policy limits</div>
    <div className="form-two">
      <label>Minimum eligible reward rate (basis points)<input type="number" min="0" max="10000" step="1" value={row.minimumRewardBps} onChange={e=>updateRow(index,"minimumRewardBps",Number(e.target.value))}/><small>100 basis points = 1%. This is a minimum eligibility constraint, not a generated or guaranteed return.</small></label>
      <label>Maximum daily reward cap (currency minor units)<input type="number" min="0" max="2147483647" step="1" value={row.maxDailyRewardMinor} onChange={e=>updateRow(index,"maxDailyRewardMinor",Number(e.target.value))}/></label>
      <label>Maximum reward per trade (currency minor units)<input type="number" min="0" max="2147483647" step="1" value={row.maxRewardPerTradeMinor} onChange={e=>updateRow(index,"maxRewardPerTradeMinor",Number(e.target.value))}/></label>
    </div>
    </>}
    {show("display")&&<>
    <div className="eyebrow">Card close policy</div>
    <div className="form-two">
      <label>Card close policy<select value={row.closePolicy} onChange={e=>updateRow(index,"closePolicy",e.target.value)}><option value="after_completion">After completion</option><option value="after_final_display">After final status display</option></select><small>Pending, retrying and awaiting-settlement cards remain accessible.</small></label>
    </div>
    </>}
  </article>)}
  {policyRows.length===0&&<div className="empty-state">{isLoading?"Loading saved tier policies…":"No tier policies were returned. Refresh the policy list before editing."}</div>}
  <label>Reason for changing Trading tier policies (required for audit)<textarea value={policyReason} maxLength={500} minLength={5} onChange={e=>onPolicyReasonChange(e.target.value)} placeholder="Explain why these delivery, automation, rate or duration controls are changing."/><small>Enter 5–500 characters for the administrator audit record.</small></label>
  <button className="primary-button" type="button" disabled={!policyRows.length||isLoading||isSaving} aria-busy={isSaving} onClick={onSave}>{isSaving?"Saving policy…":"Save delivery and retry policy"} <Check size={14}/></button>
</div>;
}
