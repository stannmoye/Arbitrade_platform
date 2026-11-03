import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const policyEditor = readFileSync(new URL("../client/src/components/TradingDeliveryPolicyEditor.tsx", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");

describe("administrator Trading delivery policy controls", () => {
  it("keeps timing, retry, concurrency and reward eligibility fields in the tier editor", () => {
    for (const field of [
      "dailyPopupTarget", "schedulingPeriod", "minIntervalSeconds", "maxIntervalSeconds",
      "popupDisplayTargetSeconds", "completionDisplaySeconds", "postCompletionIntervalSeconds",
      "maxPendingDeliveries", "maxDeliveryAttempts", "maxTradeAttemptsPerDay",
      "tradeRetryDelaySeconds", "maxSuccessfulTradesPerDay", "maxConcurrentActiveTrades",
      "minSettlementDelaySeconds", "maxSettlementDelaySeconds",
      "minimumRewardBps", "maxDailyRewardMinor", "maxRewardPerTradeMinor", "closePolicy",
    ]) {
      expect(policyEditor).toContain(field);
      expect(router).toContain(field);
      expect(schema).toContain(field);
    }
    expect(app).toContain("trpc.adminOperations.globalTradeControls.useQuery");
    expect(app).toContain("trpc.adminOperations.updateGlobalTradeControl.useMutation");
    expect(app).toContain("minimumPayoutRateBps:x.minimumPayoutRateBps??null");
    expect(app).toContain('companyRotationCountryNames:x.companyRotationCountryNames??""');
    expect(app).not.toContain('{ key: "enabled", label: "Tier policy" }');
    expect(app).not.toContain('aria-checked={active}');
    expect(app).toContain("({...x,packageName:x.packageName");
    for (const binding of [
      "value={row.popupDisplayTargetSeconds}", "value={row.minIntervalSeconds}",
      "value={row.maxIntervalSeconds}", "value={row.maxTradeAttemptsPerDay}",
      "value={row.maxDailyRewardMinor}",
    ]) expect(policyEditor).toContain(binding);
  });

  it("routes the Customer tiers menu to the editable package catalogue", () => {
    expect(app).toContain('(!focus||focus==="tiers")&&<AdminTradingPackageCatalogue/>');
    expect(app).toContain('section==="packages"&&<AdminPackages focus={focus as "tiers"|"policy"|"quotas"');
  });

  it("submits only changed tier policy fields and rejects global master fields at the tier API", () => {
    expect(app).toContain("function AdminTradingPolicySettings(");
    expect(app).toContain("buildChangedPolicyPatches(policyBaseline,policyRows)");
    expect(router).toContain("maxPopupsPerDay: z.number().int().min(1).max(1000).optional()");
    expect(router).toContain("maxVisibleOffers: z.number().int().min(1).max(10000).optional()");
    expect(router).toContain("minimumTradeUnits: z.number().int().min(1).max(2147483647).optional()");
    const start = router.indexOf("updatePackagePolicies: adminProcedure.input");
    const end = router.indexOf("createOffer: adminProcedure.input", start);
    const tierMutation = router.slice(start, end);
    for (const field of ["enabled", "automaticDelivery", "companyRotationEnabled", "randomizationEnabled", "burstEnabled", "automaticTradingEnabled", "requirePreviousSettlement"]) {
      expect(tierMutation).not.toContain(`${field}: z.boolean().optional()`);
    }
    expect(tierMutation).toContain("}).strict()).min(1).max(1000)");
    expect(database).toContain("...supplied,packageName:policy.packageName,updatedBy");
  });

  it("merges partial policy updates against locked rows before a transactional, versioned and audited write", () => {
    expect(database).toContain("const requested=policies.map(policy=>");
    expect(database).toContain("await db.transaction(async tx=>");
    const rowLock = database.indexOf('where(eq(opportunityPackagePolicies.packageName,policy.packageName)).limit(1).for("update")');
    const merge = database.indexOf("const effective:any={...DEFAULT_NEW_TIER_POLICY,...(current||{}),...supplied,packageName:policy.packageName,updatedBy}");
    const validation = database.indexOf("validatePackageAutomationPolicy(automation)", merge);
    expect(rowLock).toBeGreaterThanOrEqual(0);
    expect(merge).toBeGreaterThan(rowLock);
    expect(validation).toBeGreaterThan(merge);
    expect(database).toContain("const nextVersion=current?currentVersion+1:1");
    expect(database).toContain('action:"trading_delivery_policy_updated"');
    expect(database).toContain("validatePackageAutomationPolicy(automation)");
    expect(router).toContain("updatePackagePolicies: adminProcedure.input");
    expect(app).toContain('onError:error=>{setPolicyMessageKind("error");setPolicyMessage(error.message)}');
    expect(app).toContain('setPolicyMessage("Enter at least 5 characters explaining this policy change.");');
  });

  it("keeps display timeout presentation-only and avoids promising a configured reward as earned profit", () => {
    expect(policyEditor).toContain("Controls display only; must not cancel an active trade.");
    expect(app).toContain("existing customer and trade snapshots were preserved.");
    expect(policyEditor).toContain("This is a minimum eligibility constraint, not a generated or guaranteed return.");
    expect(database).toContain("packagePolicyVersionSnapshot:snapshotVersion");
  });
});
