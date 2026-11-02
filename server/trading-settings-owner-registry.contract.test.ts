import { describe, expect, it } from "vitest";
import { tradeSettingsByKey, tradeSettingsRegistry } from "../client/src/trade-settings-registry";

describe("Trade Settings single-owner registry", () => {
  it("assigns every registered setting exactly one stable key and owner route", () => {
    const keys = tradeSettingsRegistry.map((definition) => definition.key);
    const owners = tradeSettingsRegistry.map((definition) => definition.ownerRoute);

    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(owners).size).toBeGreaterThan(1);
    expect(Object.keys(tradeSettingsByKey).sort()).toEqual([...keys].sort());
    for (const definition of tradeSettingsRegistry) {
      expect(definition.key).toMatch(/^trade\.(global|package|record)\.[a-zA-Z0-9.]+$/);
      expect(definition.ownerRoute).toMatch(/^trade-settings-[a-z0-9-]+$/);
      expect(definition.ownerSection.length).toBeGreaterThan(0);
      expect(definition.saveMutation.length).toBeGreaterThan(0);
      expect(definition.readQuery.length).toBeGreaterThan(0);
      expect(definition.runtimeConsumer.length).toBeGreaterThan(0);
      expect(definition.customerEffect.length).toBeGreaterThan(0);
    }
  });

  it("keeps global controls out of package scope and package terms out of global scope", () => {
    const globalKeys = tradeSettingsRegistry.filter((definition) => definition.scope === "global");
    const packageKeys = tradeSettingsRegistry.filter((definition) => definition.scope === "package");

    expect(globalKeys.every((definition) => definition.ownerRoute === "trade-settings-package-configuration" || definition.ownerRoute === "trade-settings-retry-carry-forward")).toBe(true);
    expect(packageKeys.every((definition) => definition.ownerRoute === "trade-settings-package-settings" || definition.ownerRoute === "trade-settings-daily-delivery-caps")).toBe(true);
    expect(tradeSettingsRegistry.find((definition) => definition.key === "trade.package.feePolicy")?.risk).toBe("financial");
    expect(tradeSettingsRegistry.find((definition) => definition.key === "trade.global.requirePreviousSettlement")?.risk).toBe("safety");
  });

  it("documents the approved fee snapshot and fail-closed migration effects", () => {
    const fee = tradeSettingsRegistry.find((definition) => definition.key === "trade.package.feePolicy");
    const settlement = tradeSettingsRegistry.find((definition) => definition.key === "trade.global.requirePreviousSettlement");

    expect(fee?.validation).toContain("minor-unit ceiling");
    expect(fee?.effectiveTime).toContain("existing opportunities keep their fee snapshot");
    expect(settlement?.validation).toContain("ON by default");
    expect(settlement?.effectiveTime).toContain("future allocations only");
  });
});
