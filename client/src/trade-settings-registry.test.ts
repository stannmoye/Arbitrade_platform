import { describe, expect, it } from "vitest";
import { adminNavigationGroups } from "./admin-navigation";
import { assertTradeSettingRegistry, tradeSettingRegistry } from "./trade-settings-registry";

describe("Trade Settings ownership registry", () => {
  it("has unique setting keys and valid persistence metadata", () => {
    expect(assertTradeSettingRegistry()).toBe(true);
    expect(new Set(tradeSettingRegistry.map((setting) => setting.key)).size).toBe(tradeSettingRegistry.length);
    for (const setting of tradeSettingRegistry.filter((entry) => entry.editable)) {
      expect(setting.ownerRoute).toMatch(/^[a-z][a-zA-Z0-9]+$/);
      expect(setting.saveMutation).not.toBe("none");
      expect(setting.readQuery).not.toBe("none");
      expect(setting.explanation.length).toBeGreaterThan(20);
      expect(setting.customerImpact.length).toBeGreaterThan(20);
    }
  });

  it("maps every editable owner route to one Trade Settings destination", () => {
    const tradeSettings = adminNavigationGroups.find((group) => group.id === "trade-settings");
    expect(tradeSettings).toBeDefined();
    const routeTargets = new Set(tradeSettings?.items.map((item) => item.target));
    for (const setting of tradeSettingRegistry.filter((entry) => entry.editable)) {
      expect(routeTargets.has(setting.ownerRoute)).toBe(true);
    }
  });

  it("declares exactly one navigation owner for every registered setting", () => {
    const tradeSettings = adminNavigationGroups.find((group) => group.id === "trade-settings");
    const owners = new Map<string, string[]>();
    for (const item of tradeSettings?.items ?? []) {
      for (const key of item.ownerKeys ?? []) {
        owners.set(key, [...(owners.get(key) ?? []), item.id]);
      }
    }
    for (const setting of tradeSettingRegistry) {
      expect(owners.get(setting.key)).toEqual([expect.any(String)]);
    }
    expect(owners.size).toBe(tradeSettingRegistry.length);
  });

  it("keeps carry-forward explicitly read-only until its state machine exists", () => {
    const carryForward = tradeSettingRegistry.find((setting) => setting.key === "trade.package.carryForward");
    expect(carryForward).toMatchObject({ editable: false, auditPolicy: "read-only", saveMutation: "none" });
  });
});
