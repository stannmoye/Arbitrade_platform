import { Check } from "lucide-react";
import "./trading-package-card-colors.css";

export type TradingDeliveryPolicyRow={packageName:string;enabled:boolean;automaticDelivery:boolean;automaticTradingEnabled:boolean;badgeLabel:string;badgeStyle:"neutral"|"blue"|"purple"|"gold"|"green";minimumPayoutRateBps:number|null;maximumPayoutRateBps:number|null;minimumTradeDurationSeconds:number|null;maximumTradeDurationSeconds:number|null;companyRotationEnabled:boolean;companyRotationCountryNames:string;companyRotationRepeatPolicy:"avoid_until_exhausted"|"allow_repeats";maxPopupsPerDay:number;maxVisibleOffers:number;minimumTradeUnits:number;maximumTradeUnits:number;minHourlyTarget:number;normalHourlyTarget:number;marketInfluenceBps:number;burstEnabled:boolean;maxBurstSize:number;dailyPopupTarget:number;schedulingPeriod:"rolling_24h"|"calendar_day";minIntervalSeconds:number;maxIntervalSeconds:number;randomizationEnabled:boolean;popupDisplayTargetSeconds:number;completionDisplaySeconds:number;postCompletionIntervalSeconds:number;maxPendingDeliveries:number;maxDeliveryAttempts:number;maxTradeAttemptsPerDay:number;tradeRetryDelaySeconds:number;maxSuccessfulTradesPerDay:number;maxConcurrentActiveTrades:number;requirePreviousSettlement:boolean;minSettlementDelaySeconds:number;maxSettlementDelaySeconds:number;minimumRewardBps:number;maxDailyRewardMinor:number;maxRewardPerTradeMinor:number;closePolicy:"after_completion"|"after_final_display"};

type PolicyEditorFocus = "tiers" | "quotas" | "delivery" | "display" | "retries" | "rotation";
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
  <div className="eyebrow">Administrator-managed Trading policy</div>
  <h2>{focus==="quotas"?"Daily delivery allowance":focus==="delivery"?"Offer delivery cadence":focus==="display"?"Customer display timing":focus==="retries"?"Retry and settlement controls":focus==="rotation"?"Company spotlight rotation":"Tier policy and automation"}</h2>
  <p>Every row is loaded from saved administrator policy. Changes are validated and versioned by the server; active trade snapshots are not rewritten. Newly created tiers remain disabled until their delivery policy is configured and saved. USD capital limits in this legacy policy are expressed in whole USD units.</p>
  {policyMessage&&<div className="test-notice" role="status" aria-live="polite">{policyMessage}</div>}
  {policyRows.map((row,index)=><article className="package-admin-card" key={row.packageName} style={{marginBottom:16}}>
    <div className="package-admin-head"><div><span className="eyebrow">Tier policy</span><h3>{row.packageName}</h3></div><span className="admin-live-chip">Versioned</span></div>
    {show("tiers")&&<>
    <div className="eyebrow">Policy and automation switches</div>
    <div className="form-two">
      <label>Policy enabled<select value={row.enabled?"true":"false"} onChange={e=>updateRow(index,"enabled",e.target.value==="true")}><option value="false">Disabled</option><option value="true">Enabled</option></select><small>Enabling policy is separate from enabling the Trading tier.</small></label>
      <label>Automatic pop-up delivery<select value={row.automaticDelivery?"true":"false"} onChange={e=>updateRow(index,"automaticDelivery",e.target.value==="true")}><option value="false">Disabled</option><option value="true">Enabled</option></select></label>
      <label>Automatic trade execution<select value={row.automaticTradingEnabled?"true":"false"} onChange={e=>updateRow(index,"automaticTradingEnabled",e.target.value==="true")}><option value="false">Disabled</option><option value="true">Enabled</option></select><small>Requires valid published reward-rate and duration bounds.</small></label>
    </div>
    </>}
    {show("quotas")&&<>
    <div className="eyebrow">Daily delivery</div>
    <div className="form-two">
      <label>Maximum pop-ups per day<input aria-label={row.packageName+" maximum pop-ups per day"} type="number" min="1" max="1000" step="1" value={row.maxPopupsPerDay} onChange={e=>updateRow(index,"maxPopupsPerDay",Number(e.target.value))}/></label>
      <label>Maximum visible offers<input aria-label={row.packageName+" maximum visible offers"} type="number" min="1" max="10000" step="1" value={row.maxVisibleOffers} onChange={e=>updateRow(index,"maxVisibleOffers",Number(e.target.value))}/></label>
      <label>Daily delivery target<input type="number" min="0" max="10000" step="1" value={row.dailyPopupTarget} onChange={e=>updateRow(index,"dailyPopupTarget",Number(e.target.value))}/></label>
      <label>Daily quota window<select value={row.schedulingPeriod} onChange={e=>updateRow(index,"schedulingPeriod",e.target.value)}><option value="rolling_24h">Rolling 24 hours</option><option value="calendar_day">Calendar day (UTC)</option></select></label>
    </div>
    </>}
    {show("tiers")&&<>
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
      <label>Maximum trade attempts per day<input type="number" min="0" max="10000" step="1" value={row.maxTradeAttemptsPerDay} onChange={e=>updateRow(index,"maxTradeAttemptsPerDay",Number(e.target.value))}/></label>
      <label>Trade retry delay (seconds)<input type="number" min="5" max="3600" step="1" value={row.tradeRetryDelaySeconds} onChange={e=>updateRow(index,"tradeRetryDelaySeconds",Number(e.target.value))}/></label>
      <label>Maximum successful trades per day<input type="number" min="0" max="10000" step="1" value={row.maxSuccessfulTradesPerDay} onChange={e=>updateRow(index,"maxSuccessfulTradesPerDay",Number(e.target.value))}/></label>
      <label>Maximum concurrent active trades<input type="number" min="1" max="1000" step="1" value={row.maxConcurrentActiveTrades} onChange={e=>updateRow(index,"maxConcurrentActiveTrades",Number(e.target.value))}/></label>
      <label>Require previous trade settlement<select value={row.requirePreviousSettlement?"true":"false"} onChange={e=>updateRow(index,"requirePreviousSettlement",e.target.value==="true")}><option value="true">Yes — wait for settlement</option><option value="false">No — allow configured concurrency</option></select></label>
      <label>Minimum settlement delay (seconds)<input type="number" min="0" max="604800" step="1" value={row.minSettlementDelaySeconds} onChange={e=>updateRow(index,"minSettlementDelaySeconds",Number(e.target.value))}/></label>
      <label>Maximum settlement delay (seconds)<input type="number" min="0" max="604800" step="1" value={row.maxSettlementDelaySeconds} onChange={e=>updateRow(index,"maxSettlementDelaySeconds",Number(e.target.value))}/></label>
    </div>
    </>}
    {show("tiers")&&<>
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
      <label>Enable company spotlight rotation<select value={row.companyRotationEnabled?"true":"false"} onChange={e=>updateRow(index,"companyRotationEnabled",e.target.value==="true")}><option value="true">Enabled</option><option value="false">Disabled</option></select><small>Informational company references only; this never creates or authorizes a trade. Only administrator-verified, non-archived companies appear in customer opportunity pop-ups.</small></label>
      <label>Repeat policy<select value={row.companyRotationRepeatPolicy} onChange={e=>updateRow(index,"companyRotationRepeatPolicy",e.target.value as TradingDeliveryPolicyRow["companyRotationRepeatPolicy"])}><option value="avoid_until_exhausted">Avoid repeats until the pool is traversed</option><option value="allow_repeats">Allow repeats</option></select></label>
      <label>Country-folder filters<input type="text" maxLength={2000} value={row.companyRotationCountryNames} onChange={e=>updateRow(index,"companyRotationCountryNames",e.target.value)}/><small>Comma-separated exact catalogue folder labels; blank includes all administrator-verified, non-archived records. Country folders do not verify headquarters or listing status.</small></label>
    </div>
    </>}
    {show("tiers")&&<>
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
