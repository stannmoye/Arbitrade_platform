import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const policyEditor = readFileSync(new URL("../client/src/components/TradingDeliveryPolicyEditor.tsx", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");

describe("administrator Trading delivery policy controls", () => {
  it("hydrates saved policy fields and exposes timing, retry, concurrency and reward eligibility controls", () => {
    for (const field of [
      "dailyPopupTarget", "schedulingPeriod", "minIntervalSeconds", "maxIntervalSeconds",
      "popupDisplayTargetSeconds", "completionDisplaySeconds", "postCompletionIntervalSeconds",
      "maxPendingDeliveries", "maxDeliveryAttempts", "maxTradeAttemptsPerDay",
      "tradeRetryDelaySeconds", "maxSuccessfulTradesPerDay", "maxConcurrentActiveTrades",
      "requirePreviousSettlement", "minSettlementDelaySeconds", "maxSettlementDelaySeconds",
      "minimumRewardBps", "maxDailyRewardMinor", "maxRewardPerTradeMinor", "closePolicy",
    ]) {
      expect(app).toContain(field);
      expect(router).toContain(field);
      expect(schema).toContain(field);
    }
    expect(app).toContain("enabled:Boolean(x.enabled),automaticDelivery:Boolean(x.automaticDelivery),automaticTradingEnabled:Boolean(x.automaticTradingEnabled)");
    expect(app).toContain("minimumPayoutRateBps:x.minimumPayoutRateBps");
    expect(app).toContain("companyRotationCountryNames:String(x.companyRotationCountryNames??\"\")");
    expect(policyEditor).toContain("value={row.enabled?\"true\":\"false\"}");
    expect(app).toContain("({...x,packageName:x.packageName");
    for (const binding of [
      "value={row.popupDisplayTargetSeconds}", "value={row.minIntervalSeconds}",
      "value={row.maxIntervalSeconds}", "value={row.maxTradeAttemptsPerDay}",
      "value={row.maxDailyRewardMinor}",
    ]) expect(policyEditor).toContain(binding);
  });

  it("merges partial policy updates against locked rows before a transactional, versioned and audited write", () => {
    expect(database).toContain("const requested=policies.map(policy=>");
    expect(database).toContain("await db.transaction(async tx=>");
    const rowLock = database.indexOf('where(eq(opportunityPackagePolicies.packageName,policy.packageName)).limit(1).for("update")');
    const merge = database.indexOf("const effective:any={...UNCONFIGURED_TIER_POLICY_SENTINELS,...(current||{}),...supplied,packageName:policy.packageName,updatedBy}");
    const validation = database.indexOf("validatePackageAutomationPolicy(automation)", merge);
    expect(rowLock).toBeGreaterThanOrEqual(0);
    expect(merge).toBeGreaterThan(rowLock);
    expect(validation).toBeGreaterThan(merge);
    expect(database).toContain("const nextVersion=current?currentVersion+1:1");
    expect(database).toContain('action:"trading_delivery_policy_updated"');
    expect(database).toContain("validatePackageAutomationPolicy(automation)");
    expect(router).toContain("updatePackagePolicies: adminProcedure.input");
    expect(app).toContain('onError:error=>{setPolicyMessage(error.message);window.alert("Trading policy could not be saved.');
    expect(app).toContain('if(policyReason.trim().length<5){window.alert("Requirement not met: A reason for changing Trading tier policies is required for audit.');
  });

  it("keeps display timeout presentation-only and avoids promising a configured reward as earned profit", () => {
    expect(policyEditor).toContain("Controls display only; must not cancel an active trade.");
    expect(app).toContain("active trade snapshots were preserved");
    expect(policyEditor).toContain("This is a minimum eligibility constraint, not a generated or guaranteed return.");
    expect(database).toContain("packagePolicyVersionSnapshot:snapshotVersion");
  });
});
