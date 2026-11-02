import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminApp = readFileSync(
  new URL("../client/src/App.tsx", import.meta.url),
  "utf8"
);
const packageConfiguration = readFileSync(
  new URL(
    "../client/src/components/TradeSettingsAdministration.tsx",
    import.meta.url
  ),
  "utf8"
);
const policyEditor = readFileSync(
  new URL(
    "../client/src/components/TradingDeliveryPolicyEditor.tsx",
    import.meta.url
  ),
  "utf8"
);
const tierFields = readFileSync(
  new URL(
    "../client/src/components/AdminTierPolicyFields.tsx",
    import.meta.url
  ),
  "utf8"
);
const timingPage = readFileSync(
  new URL("../client/src/components/AdminOperationsPages.tsx", import.meta.url),
  "utf8"
);
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const marketSync = readFileSync(
  new URL("./marketSync.ts", import.meta.url),
  "utf8"
);
const globalMigration = readFileSync(
  new URL(
    "../drizzle/0099_trade_settings_global_registry.sql",
    import.meta.url
  ),
  "utf8"
);
const policyRoute = router.slice(
  router.indexOf("updatePackagePolicies: adminProcedure.input"),
  router.indexOf("createOffer: adminProcedure.input")
);

describe("Trade Settings single-owner global masters", () => {
  it("mounts Package Configuration as the only editor and removes the persistent duplicate panel", () => {
    expect(adminApp).toContain('section==="tradePackageConfiguration"');
    expect(adminApp).not.toContain("AdminTradingGlobalControls");
    expect(adminApp).not.toContain("Pause all new delivery");
    for (const key of [
      "tierPolicyMaster",
      "popupDelivery",
      "companyRotation",
      "randomizedTiming",
      "burstDelivery",
      "requirePreviousSettlement",
    ]) {
      expect(packageConfiguration).toContain(`"${key}"`);
    }
  });

  it("preserves dirty global drafts and confirms changed values by a fresh read", () => {
    expect(packageConfiguration).toContain(
      "const [draftDirty, setDraftDirty] = useState(false)"
    );
    expect(packageConfiguration).toContain(
      "settings?.available && !draftDirty"
    );
    expect(packageConfiguration).toContain(
      "const refreshed = await query.refetch()"
    );
    expect(packageConfiguration).toContain("Object.entries(changed).every");
    expect(packageConfiguration).toContain("Your draft is still available");
    expect(packageConfiguration).toContain("reactivatingAfterLegacyPause");
    expect(packageConfiguration).toContain("unsafePackageNames");
    expect(database).toContain("legacyReviewCompleted");
    expect(database).toContain(
      "detailed authorization reason of at least 10 characters before re-enabling a global master"
    );
    expect(database).toContain(
      "current.settingsVersion !== input.expectedVersion"
    );
    expect(packageConfiguration).toContain(
      "stored?.settingsVersion === expectedVersion + 1"
    );
    expect(router).toContain(
      "}).strict().refine(input => Object.entries(input)"
    );
  });

  it("prevents per-tier editors and mutations from changing global-master copies", () => {
    for (const field of [
      "enabled",
      "automaticDelivery",
      "companyRotationEnabled",
      "randomizationEnabled",
      "burstEnabled",
      "requirePreviousSettlement",
    ]) {
      expect(policyEditor).not.toContain(`updateRow(index,"${field}"`);
      expect(tierFields).not.toContain(`set(i, "${field}"`);
      expect(policyRoute).not.toContain(`${field}: z.`);
    }
    expect(policyRoute).toContain("}).strict()).min(1).max(1000)");
    expect(database).toContain("retiredPackageMasters");
    expect(database).toContain("cannot be changed per package");
    expect(policyEditor).toContain(
      "Company rotation ON/OFF is owned by Trade Settings → Package Configuration"
    );
  });

  it("initializes global masters fail-closed and records all conflicting legacy package switches", () => {
    for (const legacyField of [
      "enabled",
      "automaticDelivery",
      "companyRotationEnabled",
      "randomizationEnabled",
      "burstEnabled",
      "requirePreviousSettlement",
    ]) {
      expect(globalMigration).toContain("p.`" + legacyField + "`");
    }
    expect(globalMigration).toContain("'legacySafetyPaused'");
    expect(globalMigration).toContain("'unsafePackageNames'");
    expect(globalMigration).toContain("'settingsVersion', 0");
    expect(globalMigration).toContain(
      "review that report and enter a detailed reason before re-enabling a master"
    );
  });

  it("wires master OFF states to future behavior without hiding existing customer cards", () => {
    expect(database).toContain(
      "globalSettings.available&&globalSettings.tierPolicyMaster&&globalSettings.popupDelivery"
    );
    expect(database).toContain(
      "enabled:true,newDeliveryEnabled:globalDeliveryEnabled"
    );
    expect(database).toContain(
      "companyDisplayAllowed=(companyId:any)=>Boolean(globalSettings.available&&globalSettings.companyRotation"
    );
    expect(database).toContain(
      "randomizationEnabled:Boolean(globalSettings.available&&globalSettings.randomizedTiming)"
    );
    expect(database).toContain(
      "burstEnabled:Boolean(globalSettings.available&&globalSettings.burstDelivery)"
    );
    expect(database).toContain(
      "mayAssignNewTier=globalTradeSettings.available&&globalTradeSettings.tierPolicyMaster"
    );
  });

  it("keeps per-customer settlement safety separate from the system-wide publication pause", () => {
    expect(packageConfiguration).toContain("future allocations");
    expect(database).toContain("globalTradeSettings.requirePreviousSettlement");
    expect(database).toContain(
      'getAppSetting("trade.blockOpportunitiesUntilSettled", "true")'
    );
    expect(database).toContain(
      '"trade.blockOpportunitiesUntilSettled": "true"'
    );
    expect(database).toContain('action: "trade_timing_policy_updated"');
    expect(database).toContain("const nextVersion = currentVersion + 1");
    expect(database).toContain("currentVersion !== input.expectedVersion");
    expect(database).toContain("reason,");
    expect(timingPage).toContain(
      "const trade={...tradeValues,reason:tradeReason.trim()}"
    );
    expect(timingPage).toContain(
      "Number(stored?.settingsVersion)===expectedVersion+1"
    );
    expect(timingPage).toContain("10 characters required to disable the pause");
    expect(marketSync).toContain("settlementPolicy.blockUntilSettled");
    expect(timingPage).toContain(
      "Block new offers while any trade is unsettled"
    );
    expect(timingPage).toContain(
      "separate from the per-customer Require Previous Settlement master"
    );
  });
});
