import { describe, expect, it } from "vitest";
import { buildChangedPolicyPatches } from "./trading-policy-patches";

type Policy = {
  packageName: string;
  maxPopupsPerDay: number;
  maxVisibleOffers: number;
  enabled: boolean;
  badgeLabel: string | null;
  minimumRewardBps: number;
};

describe("field-scoped Trading policy patches", () => {
  const baseline: Policy[] = [
    { packageName: "Starter", maxPopupsPerDay: 10, maxVisibleOffers: 2, enabled: true, badgeLabel: null, minimumRewardBps: 100 },
    { packageName: "Pro", maxPopupsPerDay: 50, maxVisibleOffers: 5, enabled: false, badgeLabel: "Pro", minimumRewardBps: 200 },
  ];

  it("sends only the field changed on the selected tier", () => {
    const current = baseline.map((row) => ({ ...row }));
    current[0].maxPopupsPerDay = 12;
    expect(buildChangedPolicyPatches(baseline, current)).toEqual([
      { packageName: "Starter", maxPopupsPerDay: 12 },
    ]);
  });

  it("preserves explicit false, zero and null changes", () => {
    const current = baseline.map((row) => ({ ...row }));
    current[0].enabled = false;
    current[0].minimumRewardBps = 0;
    current[0].badgeLabel = null;
    current[1].badgeLabel = null;
    expect(buildChangedPolicyPatches(baseline, current)).toEqual([
      { packageName: "Starter", enabled: false, minimumRewardBps: 0 },
      { packageName: "Pro", badgeLabel: null },
    ]);
  });

  it("omits unchanged tiers and returns an empty list for no changes", () => {
    expect(buildChangedPolicyPatches(baseline, baseline.map((row) => ({ ...row })))).toEqual([]);
  });

  it("fails closed when a policy row has no loaded baseline", () => {
    expect(() => buildChangedPolicyPatches(baseline, [
      ...baseline,
      { packageName: "Unknown", maxPopupsPerDay: 1, maxVisibleOffers: 1, enabled: false, badgeLabel: null, minimumRewardBps: 0 },
    ])).toThrow(/without a loaded baseline/);
  });
});
