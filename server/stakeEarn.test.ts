import { describe, expect, it } from "vitest";
import { __testParseIdempotencyReplay, __testRewardFor, projectStake } from "./stakeEarn";

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


describe("Stake & Earn idempotency replay guards", () => {
  const prior = { command: "stake.cancel", resultJson: JSON.stringify({ positionId: 12, status: "CANCELLED" }) };

  it("rejects a key reused across different operations", () => {
    expect(() => __testParseIdempotencyReplay(prior, "stake.allocate")).toThrow("different Stake & Earn operation");
  });

  it("rejects a cancellation replay for a different position", () => {
    expect(() => __testParseIdempotencyReplay(prior, "stake.cancel", 13)).toThrow("different stake position");
  });

  it("returns the stored result for a matching operation and position", () => {
    expect(__testParseIdempotencyReplay(prior, "stake.cancel", 12)).toEqual({ positionId: 12, status: "CANCELLED" });
  });
});
