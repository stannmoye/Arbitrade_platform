import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tradeSettingsOwnershipRegistry } from "../client/src/trade-settings-ownership";

const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const packageEditor = readFileSync(new URL("../client/src/components/TradingDeliveryPolicyEditor.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0100_global_trade_master_controls.sql", import.meta.url), "utf8");
const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
const migrationRunner = readFileSync(new URL("../scripts/apply-portal-migrations.mjs", import.meta.url), "utf8");
const installerRunner = readFileSync(new URL("../installer/migration-recovery-status.mjs", import.meta.url), "utf8");

describe("global Trade master policy ownership and migration", () => {
  it("assigns each global master exactly one global owner and keeps package lifecycle separate", () => {
    const masterKeys = [
      "trade.global.tierPolicyMasterEnabled",
      "trade.global.popupDeliveryEnabled",
      "trade.global.companyRotationEnabled",
      "trade.global.randomizedTimingEnabled",
      "trade.global.burstDeliveryEnabled",
      "trade.global.requirePreviousSettlement",
    ];
    for (const key of masterKeys) {
      const matches = tradeSettingsOwnershipRegistry.filter(owner => owner.key === key);
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        scope: "global",
        ownerRoute: "trade-package-configuration",
        readQuery: "adminOperations.globalTradeControls",
      });
      if (key === "trade.global.requirePreviousSettlement") {
        expect(matches[0]).toMatchObject({ saveMutation: null, availability: "locked" });
      } else {
        expect(matches[0].saveMutation).toBe("adminOperations.updateGlobalTradeControl");
      }
    }
    expect(tradeSettingsOwnershipRegistry.find(owner => owner.key === "trade.package.lifecycleEnabled")).toMatchObject({
      scope: "package",
      ownerRoute: "trade-tiers-eligibility",
      saveMutation: "adminOperations.updateTradingPackage",
    });
    expect(tradeSettingsOwnershipRegistry.some(owner => owner.key.startsWith("trade.package.") && /popupDelivery|companyRotationEnabled|randomizedTimingEnabled|burstDeliveryEnabled/.test(owner.key))).toBe(false);
  });

  it("uses one audited, versioned global mutation and does not expose legacy per-tier masters", () => {
    expect(routers).toContain("globalTradeControls: adminProcedure.query(() => getTradeGlobalControls())");
    expect(routers).toContain("updateGlobalTradeControl: adminProcedure.input");
    expect(routers).toContain("setTradeGlobalControl(input, ctx.user.id)");
    expect(db).toContain("TradeGlobalControlVersionConflictError");
    expect(db).toContain('action:"trade_global_control_updated"');
    expect(db).toContain("reason:auditReason,reference:`trade-global-controls:${policyVersion}`");
    const packageMutation = routers.slice(routers.indexOf("updatePackagePolicies: adminProcedure.input"), routers.indexOf("createOffer: adminProcedure.input"));
    expect(packageMutation).not.toContain("automaticDelivery: z.boolean().optional()");
    expect(packageMutation).not.toContain("companyRotationEnabled: z.boolean().optional()");
    expect(packageMutation).not.toContain("randomizationEnabled: z.boolean().optional()");
    expect(packageMutation).not.toContain("burstEnabled: z.boolean().optional()");
    expect(packageMutation).not.toContain("requirePreviousSettlement: z.boolean().optional()");
    expect(packageMutation).not.toContain("enabled: z.boolean().optional()");
    expect(packageEditor).toContain("ON — global guard required");
    expect(packageEditor).not.toContain("Enable settlement guard");
    expect(ui).toContain("trpc.adminOperations.globalTradeControls.useQuery");
    expect(ui).toContain("trpc.adminOperations.updateGlobalTradeControl.useMutation");
  });

  it("applies global masters to qualification, future delivery, rotation, timing, burst and settlement runtime paths", () => {
    expect(db).toContain("if(!globalPolicy?.tierPolicyMasterEnabled) return false;");
    expect(db).toContain("if(!globalPolicy.available||!globalPolicy.tierPolicyMasterEnabled) return {claimed:0,completed:0,retrying:0,dead:0,pausedByGlobalPolicy:true};");
    expect(db).toContain("globalPolicy.available&&globalPolicy.tierPolicyMasterEnabled&&globalPolicy.informationalPopupDeliveryEnabled");
    expect(db).toContain("if(!globalPolicy.available||!globalPolicy.tierPolicyMasterEnabled||!globalPolicy.companyRotationEnabled) return null;");
    expect(db).toContain("randomizationEnabled:globalPolicy.randomizedTimingEnabled");
    expect(db).toContain("burstEnabled:globalPolicy.burstDeliveryEnabled");
    expect(db).toContain("const requirePreviousSettlement=!globalControls||globalControls.requirePreviousSettlement||settlementPolicy.blockUntilSettled;");
    expect(db).not.toContain("configured.enabled && configured.automaticDelivery && hasConfiguredTradingOfferPolicy(configured)");
  });

  it("is forward-only, preserves restrictive legacy values, and is registered by both migration paths", () => {
    expect(journal.entries.at(-1).tag).toBe("0100_global_trade_master_controls");
    expect(migrationRunner).toContain('"0100_global_trade_master_controls.sql"');
    expect(installerRunner).toContain('"0100_global_trade_master_controls.sql"');
    expect(migration).toContain("MIN(`enabled`) = 1");
    expect(migration).toContain("MIN(`automaticDelivery`) = 1");
    expect(migration).toContain("MIN(`companyRotationEnabled`) = 1");
    expect(migration).toContain("MIN(`randomizationEnabled`) = 1");
    expect(migration).toContain("MIN(`burstEnabled`) = 1");
    expect(migration).toContain("'requirePreviousSettlement', TRUE");
    expect(migration).toContain("tierPolicyDisabledPackages");
    expect(migration).toContain("trade-global-controls-migration-0100");
    expect(migration).toContain("ON DUPLICATE KEY UPDATE `settingKey`=VALUES(`settingKey`)");
    expect(migration.match(/ON DUPLICATE KEY UPDATE `settingKey`=VALUES\(`settingKey`\);/g)).toHaveLength(2);
    expect(migration).toContain("'trade.globalControls'");
    expect(migration).toContain("'trade.globalControls.migrationDiagnostic'");
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b|\bDROP\s+COLUMN\b|\bALTER\s+TABLE\b/i);
    expect(migration).not.toMatch(/UPDATE\s+`?opportunity_package_policies`?/i);
  });
});
