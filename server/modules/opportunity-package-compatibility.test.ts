import { describe, expect, it } from "vitest";
import { assessOpportunityPackageCompatibility } from "./opportunity-package-compatibility";
const rule = {
  packageId: 7, packageName: "Starter", policyVersion: 4,
  minimumTradeMinor: 10_000, maximumTradeMinor: 100_000,
  minimumPayoutRateBps: 200, maximumPayoutRateBps: 500,
  minimumTradeDurationSeconds: 60, maximumTradeDurationSeconds: 900,
};
describe("administrator-published opportunity/package compatibility", () => {
  it("matches explicit published terms against persisted package bounds without creating terms", () => {
    const offer = { minimumMinor: 50_000, expectedRewardBps: 350, durationSeconds: 300 };
    expect(assessOpportunityPackageCompatibility(offer, [rule])).toEqual({
      checkedPackages: 1,
      compatiblePackages: [{ packageId: 7, packageName: "Starter", policyVersion: 4 }],
      incompatiblePackages: [],
    });
    expect(offer).toEqual({ minimumMinor: 50_000, expectedRewardBps: 350, durationSeconds: 300 });
  });
  it("reports each incompatible bound and preserves package/version identity", () => {
    const result = assessOpportunityPackageCompatibility(
      { minimumMinor: 100_001, expectedRewardBps: 600, durationSeconds: 901 }, [rule],
    );
    expect(result.compatiblePackages).toEqual([]);
    expect(result.incompatiblePackages).toEqual([{
      packageId: 7, packageName: "Starter", policyVersion: 4,
      reasons: [
        "Offer minimum exceeds the package maximum capital.",
        "Published reward rate is outside the package payout-rate bounds.",
        "Published duration is outside the package trade-duration bounds.",
      ],
    }]);
  });
  it("fails compatibility when payout or duration terms are not explicitly configured", () => {
    const result = assessOpportunityPackageCompatibility(
      { minimumMinor: 50_000, expectedRewardBps: 350, durationSeconds: 300 },
      [{ ...rule, minimumPayoutRateBps: null, maximumPayoutRateBps: null, minimumTradeDurationSeconds: null, maximumTradeDurationSeconds: null }],
    );
    expect(result.compatiblePackages).toEqual([]);
    expect(result.incompatiblePackages[0].reasons).toHaveLength(2);
  });
});
