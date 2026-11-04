import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY,
  PACKAGE_OPPORTUNITY_POLICY_PATCH_KEYS,
  resolveEffectivePackageOpportunityPolicy,
} from "./modules/package-opportunity-policy";

describe("canonical package opportunity policy contract", () => {
  it("defines safe defaults for a newly created package without enabling financial execution", () => {
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.minimumPayoutRateBps).toBe(200);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.maximumPayoutRateBps).toBe(300);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.minimumTradeDurationSeconds).toBe(300);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.maximumTradeDurationSeconds).toBe(900);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.minIntervalSeconds).toBe(45);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.maxIntervalSeconds).toBe(3600);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.maxPendingDeliveries).toBe(3);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.automaticTradingEnabled).toBe(false);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.enabled).toBe(true);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.automaticDelivery).toBe(true);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.companyRotationEnabled).toBe(true);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.randomizationEnabled).toBe(true);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.burstEnabled).toBe(true);
  });

  it("keeps package edits isolated and preserves every omitted saved value", () => {
    const alpha = resolveEffectivePackageOpportunityPolicy(
      "Alpha",
      { ...DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY, packageName: "Alpha", id: 1, updatedBy: 7, updatedAt: new Date(), dailyPopupTarget: 6, maxPendingDeliveries: 2 },
      { packageName: "Alpha", dailyPopupTarget: 12 },
      9,
    );
    const beta = resolveEffectivePackageOpportunityPolicy(
      "Beta",
      { ...DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY, packageName: "Beta", id: 2, updatedBy: 7, updatedAt: new Date(), dailyPopupTarget: 4, maxPendingDeliveries: 5 },
      { packageName: "Beta", maxPendingDeliveries: 8 },
      9,
    );

    expect(alpha.dailyPopupTarget).toBe(12);
    expect(alpha.maxPendingDeliveries).toBe(2);
    expect(beta.dailyPopupTarget).toBe(4);
    expect(beta.maxPendingDeliveries).toBe(8);
    expect(alpha.packageName).not.toBe(beta.packageName);
    expect(alpha.automaticTradingEnabled).toBe(false);
    expect(beta.automaticTradingEnabled).toBe(false);
  });

  it("rejects a saved or submitted policy belonging to another package", () => {
    expect(() => resolveEffectivePackageOpportunityPolicy(
      "Alpha",
      { ...DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY, packageName: "Beta", id: 2, updatedBy: null, updatedAt: new Date() },
      { packageName: "Alpha" },
      9,
    )).toThrow("Saved opportunity policy belongs to a different package");

    expect(() => resolveEffectivePackageOpportunityPolicy(
      "Alpha",
      null,
      { packageName: "Beta" },
      9,
    )).toThrow("Opportunity policy update targets a different package");
  });

  it("does not expose global masters or persistence metadata as package-editable fields", () => {
    expect(PACKAGE_OPPORTUNITY_POLICY_PATCH_KEYS).toContain("enabled");
    expect(PACKAGE_OPPORTUNITY_POLICY_PATCH_KEYS).toContain("automaticDelivery");
    expect(PACKAGE_OPPORTUNITY_POLICY_PATCH_KEYS).toContain("companyRotationEnabled");
    expect(PACKAGE_OPPORTUNITY_POLICY_PATCH_KEYS).toContain("randomizationEnabled");
    expect(PACKAGE_OPPORTUNITY_POLICY_PATCH_KEYS).toContain("burstEnabled");
    expect(PACKAGE_OPPORTUNITY_POLICY_PATCH_KEYS).not.toContain("automaticTradingEnabled");
    expect(PACKAGE_OPPORTUNITY_POLICY_PATCH_KEYS).not.toContain("policyVersion");
    expect(PACKAGE_OPPORTUNITY_POLICY_PATCH_KEYS).not.toContain("updatedBy");
    expect(new Set(PACKAGE_OPPORTUNITY_POLICY_PATCH_KEYS).size).toBe(PACKAGE_OPPORTUNITY_POLICY_PATCH_KEYS.length);
  });
});
