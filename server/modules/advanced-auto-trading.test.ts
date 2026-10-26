import { describe, expect, it } from "vitest";
import { canReserveReward, chooseNextEligibleAt, getWindowKey, remainingRewardAllowance, validatePackageAutomationPolicy, type PackageAutomationPolicy } from "./advanced-auto-trading";

const base: PackageAutomationPolicy = { packageName: "Pro", automaticDelivery: true, dailyPopupTarget: 10, schedulingPeriod: "calendar_day", minIntervalSeconds: 45, maxIntervalSeconds: 3600, randomizationEnabled: true, popupDisplayTargetSeconds: 120, completionDisplaySeconds: 8, postCompletionIntervalSeconds: 30, maxPendingDeliveries: 3, maxDeliveryAttempts: 3, automaticTradingEnabled: true, maxTradeAttemptsPerDay: 5, maxSuccessfulTradesPerDay: 5, maxConcurrentActiveTrades: 1, requirePreviousSettlement: true, minSettlementDelaySeconds: 900, maxSettlementDelaySeconds: 900, minimumRewardBps: 0, maxDailyRewardMinor: 10000, maxRewardPerTradeMinor: 3000, closePolicy: "after_final_display" };

describe("advanced automatic trading policy", () => {
  it("rejects unsafe interval and cap combinations", () => {
    expect(() => validatePackageAutomationPolicy({ ...base, minIntervalSeconds: 500, maxIntervalSeconds: 10 })).toThrow(/interval/);
    expect(() => validatePackageAutomationPolicy({ ...base, maxRewardPerTradeMinor: 10001, maxDailyRewardMinor: 10000 })).toThrow(/per trade/);
  });
  it("rejects fractional, unsafe, and unordered settlement delays", () => {
    expect(() => validatePackageAutomationPolicy({ ...base, minSettlementDelaySeconds: 1.5, maxSettlementDelaySeconds: 10 })).toThrow(/settlement delay/);
    expect(() => validatePackageAutomationPolicy({ ...base, minSettlementDelaySeconds: Number.MAX_SAFE_INTEGER + 1, maxSettlementDelaySeconds: Number.MAX_SAFE_INTEGER + 1 })).toThrow(/settlement delay/);
    expect(() => validatePackageAutomationPolicy({ ...base, minSettlementDelaySeconds: 11, maxSettlementDelaySeconds: 10 })).toThrow(/settlement delay/);
    expect(() => validatePackageAutomationPolicy({ ...base, minSettlementDelaySeconds: Number.NaN, maxSettlementDelaySeconds: 10 })).toThrow(/settlement delay/);
  });
  it("rejects invalid policy enum values and empty package names at runtime", () => {
    expect(() => validatePackageAutomationPolicy({ ...base, packageName: "  " })).toThrow(/package name/);
    expect(() => validatePackageAutomationPolicy({ ...base, schedulingPeriod: "unknown" as any })).toThrow(/scheduling period/);
    expect(() => validatePackageAutomationPolicy({ ...base, closePolicy: "unknown" as any })).toThrow(/close policy/);
  });
  it("uses the secure bounded sampler and accepts both configured interval endpoints", () => {
    const now = new Date("2026-10-16T10:00:00.000Z");
    const calls: number[][] = [];
    const low = chooseNextEligibleAt(now, 45, 60, true, (min, maxExclusive) => {
      calls.push([min, maxExclusive]);
      return min;
    });
    const high = chooseNextEligibleAt(now, 45, 60, true, (_min, maxExclusive) => maxExclusive - 1);
    expect(calls).toEqual([[45, 61]]);
    expect(low.toISOString()).toBe("2026-10-16T10:00:45.000Z");
    expect(high.toISOString()).toBe("2026-10-16T10:01:00.000Z");
  });

  it("rejects invalid dates, unsafe intervals and a broken random sampler", () => {
    const now = new Date("2026-10-16T10:00:00.000Z");
    expect(() => chooseNextEligibleAt(now, -1, 60, true)).toThrow(/interval range/);
    expect(() => chooseNextEligibleAt(now, 61, 60, true)).toThrow(/interval range/);
    expect(() => chooseNextEligibleAt(now, 0, 2 ** 48, true)).toThrow(/interval range/);
    expect(() => chooseNextEligibleAt(now, 45, 60, true, () => 61)).toThrow(/out-of-range/);
    expect(() => chooseNextEligibleAt(new Date(Number.NaN), 45, 60, true)).toThrow(/interval range/);
  });
  it("uses explicit window keys and subtracts both credited and reserved rewards", () => {
    const now = new Date("2026-10-16T10:00:00.000Z");
    expect(getWindowKey(now, "calendar_day")).toBe("day:2026-10-16");
    expect(remainingRewardAllowance(10_000, 2_000, 3_000)).toBe(5_000);
    expect(canReserveReward(10_000, 2_000, 3_000, 5_000)).toBe(true);
    expect(canReserveReward(10_000, 2_000, 3_000, 5_001)).toBe(false);
    expect(remainingRewardAllowance(10_000, 12_000, 0)).toBe(0);
    expect(remainingRewardAllowance(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1, 1)).toBe(0);
  });

  it("fails closed for invalid reward-cap amounts instead of propagating NaN or fractions", () => {
    expect(() => remainingRewardAllowance(Number.NaN, 0, 0)).toThrow(/Reward cap/);
    expect(() => remainingRewardAllowance(100, -1, 0)).toThrow(/Credited rewards/);
    expect(() => remainingRewardAllowance(100, 0, 1.5)).toThrow(/Reserved rewards/);
    expect(() => canReserveReward(100, 0, 0, -1)).toThrow(/Requested reward/);
    expect(() => canReserveReward(100, 0, 0, Number.MAX_SAFE_INTEGER + 1)).toThrow(/Requested reward/);
  });
});
