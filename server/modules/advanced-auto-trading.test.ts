import { describe, expect, it } from "vitest";
import { canReserveReward, chooseNextEligibleAt, getWindowKey, remainingRewardAllowance, validatePackageAutomationPolicy, type PackageAutomationPolicy } from "./advanced-auto-trading";

const base: PackageAutomationPolicy = { packageName: "Pro", automaticDelivery: true, dailyPopupTarget: 10, schedulingPeriod: "calendar_day", minIntervalSeconds: 45, maxIntervalSeconds: 3600, randomizationEnabled: true, popupDisplayTargetSeconds: 120, completionDisplaySeconds: 8, postCompletionIntervalSeconds: 30, maxPendingDeliveries: 3, maxDeliveryAttempts: 3, automaticTradingEnabled: true, maxTradeAttemptsPerDay: 5, maxSuccessfulTradesPerDay: 5, maxConcurrentActiveTrades: 1, requirePreviousSettlement: true, minSettlementDelaySeconds: 900, maxSettlementDelaySeconds: 900, minimumRewardBps: 0, maxDailyRewardMinor: 10000, maxRewardPerTradeMinor: 3000, closePolicy: "after_final_display" };

describe("advanced automatic trading policy", () => {
  it("rejects unsafe interval and cap combinations", () => {
    expect(() => validatePackageAutomationPolicy({ ...base, minIntervalSeconds: 500, maxIntervalSeconds: 10 })).toThrow(/interval/);
    expect(() => validatePackageAutomationPolicy({ ...base, maxRewardPerTradeMinor: 10001, maxDailyRewardMinor: 10000 })).toThrow(/per trade/);
  });
  it("keeps a randomized next time inside the administrator range", () => {
    const now = new Date("2026-10-16T10:00:00.000Z");
    const next = chooseNextEligibleAt(now, 45, 60, true, () => new Uint8Array([255, 255, 255, 255]));
    expect(next.getTime()).toBeGreaterThanOrEqual(now.getTime() + 45_000);
    expect(next.getTime()).toBeLessThanOrEqual(now.getTime() + 60_000);
  });
  it("uses explicit window keys and subtracts both credited and reserved rewards", () => {
    const now = new Date("2026-10-16T10:00:00.000Z");
    expect(getWindowKey(now, "calendar_day")).toBe("day:2026-10-16");
    expect(remainingRewardAllowance(10_000, 2_000, 3_000)).toBe(5_000);
    expect(canReserveReward(10_000, 2_000, 3_000, 5_000)).toBe(true);
    expect(canReserveReward(10_000, 2_000, 3_000, 5_001)).toBe(false);
  });
});
