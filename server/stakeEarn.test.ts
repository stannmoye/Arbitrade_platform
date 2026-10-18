import { describe, expect, it } from "vitest";
import { __testRewardFor, projectStake, assertExactlyOneStakeSettlementUpdate, assertNoPriorStakeSettlementLedger } from "./stakeEarn";

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

describe("Stake & Earn settlement invariants", () => {
  it("rejects an existing principal-release ledger for an unsettled position", () => {
    expect(() => assertNoPriorStakeSettlementLedger(1, 41)).toThrow(/invariant violation.*position 41/i);
  });

  it("allows settlement to create its first principal-release ledger entry", () => {
    expect(() => assertNoPriorStakeSettlementLedger(0, 41)).not.toThrow();
  });

  it("requires the customer balance update to affect exactly one row", () => {
    expect(() => assertExactlyOneStakeSettlementUpdate(1, 41, "customer balance")).not.toThrow();
    expect(() => assertExactlyOneStakeSettlementUpdate(0, 41, "customer balance")).toThrow(/expected exactly one customer balance update/);
    expect(() => assertExactlyOneStakeSettlementUpdate(2, 41, "customer balance")).toThrow(/expected exactly one customer balance update/);
  });

  it("requires the position status transition to affect exactly one row", () => {
    expect(() => assertExactlyOneStakeSettlementUpdate(1, 41, "position status")).not.toThrow();
    expect(() => assertExactlyOneStakeSettlementUpdate(0, 41, "position status")).toThrow(/expected exactly one position status update/);
  });
});
