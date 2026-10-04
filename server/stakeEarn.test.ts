import { describe, expect, it } from "vitest";
import { __testRewardFor, projectStake } from "./stakeEarn";

describe("Stake & Earn accounting helpers", () => {
  it("calculates configured simple rewards without random results", () => {
    expect(__testRewardFor(100000, 620, 30)).toBe(509);
  });

  it("returns projection-only values and never touches a wallet", () => {
    expect(projectStake({ amountMinor: 100000, annualRateBps: 620, durationDays: 30 })).toEqual({
      projectedRewardMinor: 509,
      projectedEndingMinor: 100509,
      estimatedFeesMinor: 0,
      isProjection: true,
    });
  });

  it("rejects non-positive projection amounts", () => {
    expect(() => projectStake({ amountMinor: 0, annualRateBps: 620, durationDays: 30 })).toThrow("Amount must be positive");
  });
});
