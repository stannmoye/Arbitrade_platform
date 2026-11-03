import { describe, expect, it } from "vitest";
import { assertPackageTermsPayload, hasGlobalTradePolicyField } from "./trade-settings-scope";

describe("Trade Settings mutation scope", () => {
  it("accepts package terms without global delivery gates", () => {
    expect(assertPackageTermsPayload({
      name: "Starter",
      minimumQualifyingBalanceUsdMinor: 10000,
      durationMonths: 1,
      opportunitiesPerDay: 6,
    })).toBe(true);
    expect(hasGlobalTradePolicyField({ name: "Starter" })).toBe(false);
  });

  it("rejects global delivery gates in package-term payloads", () => {
    for (const field of ["enabled", "automaticDelivery"]) {
      expect(() => assertPackageTermsPayload({ name: "Starter", [field]: true })).toThrow(
        `Global Trade Setting '${field}' belongs to Package Configuration`,
      );
      expect(hasGlobalTradePolicyField({ [field]: false })).toBe(true);
    }
  });
});
