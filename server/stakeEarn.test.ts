import { describe, expect, it } from "vitest";
import { __testAllocationCommand, __testParseIdempotencyReplay, __testRewardFor, projectStake } from "./stakeEarn";

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
  it("fails closed when a stored replay result is malformed JSON", () => {
    expect(() => __testParseIdempotencyReplay({ command: "stake.cancel", resultJson: "{" }, "stake.cancel"))
      .toThrow("Stored Stake & Earn idempotency result is invalid");
  });

  it("fails closed when a stored replay result has no valid position ID", () => {
    expect(() => __testParseIdempotencyReplay({ command: "stake.allocate", resultJson: JSON.stringify({ status: "ACTIVE" }) }, "stake.allocate"))
      .toThrow("no valid position");
  });

});


describe("Stake & Earn allocation idempotency payload", () => {
  it("uses the same fingerprint for an identical allocation request", () => {
    expect(__testAllocationCommand(3, 25000)).toBe(__testAllocationCommand(3, 25000));
  });

  it("uses a different fingerprint when product or amount changes", () => {
    expect(__testAllocationCommand(3, 25000)).not.toBe(__testAllocationCommand(4, 25000));
    expect(__testAllocationCommand(3, 25000)).not.toBe(__testAllocationCommand(3, 26000));
  });

  it("rejects replay when the same key is bound to a different allocation payload", () => {
    const prior = { command: __testAllocationCommand(3, 25000), resultJson: JSON.stringify({ positionId: 7 }) };
    expect(() => __testParseIdempotencyReplay(prior, __testAllocationCommand(3, 26000))).toThrow("different Stake & Earn operation");
  });
});
