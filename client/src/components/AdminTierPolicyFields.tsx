import type { ReactElement } from "react";

type PolicyRow = Record<string, any>;
type PolicyMode = "allocation" | "safeguards";

export function AdminTierPolicyFields({ mode, x, i, set }: {
  mode: PolicyMode;
  x: PolicyRow;
  i: number;
  set: (index: number, key: string, value: any) => void;
}): ReactElement {
  if (mode === "allocation") {
    return <div className="package-policy-section">
      <strong>Opportunity allocation &amp; tier limits</strong>
      <div className="form-two">
        <label>Maximum pop-ups per day<input type="number" min="1" max="1000" value={x.maxPopupsPerDay} onChange={e => set(i, "maxPopupsPerDay", Number(e.target.value))} /></label>
        <label>Maximum visible offers<input type="number" min="1" max="10000" value={x.maxVisibleOffers} onChange={e => set(i, "maxVisibleOffers", Number(e.target.value))} /></label>
      </div>
      <div className="form-two">
        <label>Minimum trade units<input type="number" min="1" value={x.minimumTradeUnits} onChange={e => set(i, "minimumTradeUnits", Number(e.target.value))} /></label>
        <label>Maximum trade units<input type="number" min="1" value={x.maximumTradeUnits} onChange={e => set(i, "maximumTradeUnits", Number(e.target.value))} /></label>
      </div>
      <div className="form-two">
        <label>Minimum hourly target<input type="number" min="0" max="100" value={x.minHourlyTarget} onChange={e => set(i, "minHourlyTarget", Number(e.target.value))} /></label>
        <label>Normal hourly target<input type="number" min="0" max="100" value={x.normalHourlyTarget} onChange={e => set(i, "normalHourlyTarget", Number(e.target.value))} /></label>
      </div>
      <div className="form-two">
        <label>Market influence (bps)<input type="number" min="0" max="10000" value={x.marketInfluenceBps} onChange={e => set(i, "marketInfluenceBps", Number(e.target.value))} /></label>
        <label>Maximum burst size<input type="number" min="0" max="100" value={x.maxBurstSize} onChange={e => set(i, "maxBurstSize", Number(e.target.value))} /></label>
      </div>
      <label>Enable burst delivery <input type="checkbox" checked={Boolean(x.burstEnabled)} onChange={e => set(i, "burstEnabled", e.target.checked)} /></label>
    </div>;
  }

  return <>
    <div className="package-policy-section">
      <strong>Delivery safeguards &amp; notification settings</strong>
      <label>Retry policy<select value={x.deliveryRetryPolicy ?? "temporary"} onChange={e => set(i, "deliveryRetryPolicy", e.target.value)}><option value="none">No retry</option><option value="temporary">Retry temporary failures</option></select></label>
      <label>Expiry handling<select value={x.expiryHandling ?? "expire"} onChange={e => set(i, "expiryHandling", e.target.value)}><option value="expire">Expire overdue deliveries</option><option value="retry">Retry expired deliveries</option></select></label>
      <label>Prevent duplicate deliveries <input type="checkbox" checked={Boolean(x.duplicatePrevention ?? true)} onChange={e => set(i, "duplicatePrevention", e.target.checked)} /></label>
      <label>Enable pop-up sound <input type="checkbox" checked={Boolean(x.audioEnabled ?? true)} onChange={e => set(i, "audioEnabled", e.target.checked)} /></label>
      <label>Sound theme<input maxLength={80} value={x.audioSound ?? "soft-chime"} onChange={e => set(i, "audioSound", e.target.value)} /></label>
      <label>Allowed opportunity types (comma-separated; blank = all)<input value={x.allowedOpportunityTypes ?? ""} onChange={e => set(i, "allowedOpportunityTypes", e.target.value || null)} /></label>
    </div>
    <div className="package-policy-section">
      <strong>Settlement &amp; reward safeguards</strong>
      <label>Reward limit currency<input maxLength={12} value={x.rewardLimitCurrency ?? "USD"} onChange={e => set(i, "rewardLimitCurrency", e.target.value.toUpperCase())} /></label>
      <label>Daily reward window<select value={x.dailyRewardWindow ?? "calendar_day"} onChange={e => set(i, "dailyRewardWindow", e.target.value)}><option value="calendar_day">Calendar day</option><option value="rolling_24h">Rolling 24 hours</option></select></label>
      <label>Unsettled reward handling<select value={x.unsettledRewardPolicy ?? "reserve"} onChange={e => set(i, "unsettledRewardPolicy", e.target.value)}><option value="reserve">Reserve unsettled rewards</option><option value="ignore">Ignore unsettled rewards</option></select></label>
      <label>When reward cap is reached<select value={x.capReachedPolicy ?? "stop_new_trades"} onChange={e => set(i, "capReachedPolicy", e.target.value)}><option value="stop_new_trades">Stop new trades</option><option value="allow_principal_only">Allow principal only</option></select></label>
      <label>Settlement confirmation<select value={x.settlementConfirmationState ?? "ledger_and_wallet"} onChange={e => set(i, "settlementConfirmationState", e.target.value)}><option value="ledger_and_wallet">Ledger and wallet</option><option value="ledger_only">Ledger only</option></select></label>
      <label>Settlement retry policy<select value={x.settlementRetryPolicy ?? "temporary"} onChange={e => set(i, "settlementRetryPolicy", e.target.value)}><option value="temporary">Retry temporary failures</option><option value="manual">Manual review</option></select></label>
      <label>Maximum settlement attempts<input type="number" min="1" max="20" value={x.maxSettlementAttempts ?? 3} onChange={e => set(i, "maxSettlementAttempts", Number(e.target.value))} /></label>
      <label>Minimum settlement delay (seconds)<input type="number" min="0" max="604800" value={x.minSettlementDelaySeconds ?? 900} onChange={e => set(i, "minSettlementDelaySeconds", Number(e.target.value))} /></label>
      <label>Maximum settlement delay (seconds)<input type="number" min="0" max="604800" value={x.maxSettlementDelaySeconds ?? 900} onChange={e => set(i, "maxSettlementDelaySeconds", Number(e.target.value))} /></label>
      <label>Require previous settlement <input type="checkbox" checked={Boolean(x.requirePreviousSettlement ?? true)} onChange={e => set(i, "requirePreviousSettlement", e.target.checked)} /></label>
      <label>Close pop-up policy<select value={x.closePolicy ?? "after_final_display"} onChange={e => set(i, "closePolicy", e.target.value)}><option value="after_completion">After completion</option><option value="after_final_display">After final display</option></select></label>
    </div>
  </>;
}
