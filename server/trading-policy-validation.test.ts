import { describe, expect, it } from "vitest";
import { validatePackageAutomationPolicy, type PackageAutomationPolicy } from "./modules/advanced-auto-trading";

const base: PackageAutomationPolicy = {
  packageName: "Starter",
  automaticDelivery: true,
  dailyPopupTarget: 10,
  schedulingPeriod: "rolling_24h",
  minIntervalSeconds: 45,
  maxIntervalSeconds: 3600,
  randomizationEnabled: true,
  completionDisplaySeconds: 8,
  postCompletionIntervalSeconds: 30,
  maxPendingDeliveries: 3,
  maxDeliveryAttempts: 3,
  automaticTradingEnabled: false,
  maxTradeAttemptsPerDay: 5,
  tradeRetryDelaySeconds: 30,
  maxSuccessfulTradesPerDay: 5,
  maxConcurrentActiveTrades: 1,
  requirePreviousSettlement: true,
  minSettlementDelaySeconds: 900,
  maxSettlementDelaySeconds: 900,
  minimumRewardBps: 0,
  maxDailyRewardMinor: 10000,
  maxRewardPerTradeMinor: 3000,
  closePolicy: "after_final_display",
};

describe("Trading tier timing and runtime bounds", () => {
  it("accepts the documented inclusive boundaries", () => {
    expect(validatePackageAutomationPolicy({
      ...base,
      dailyPopupTarget: 10000,
      minIntervalSeconds: 0,
      maxIntervalSeconds: 604800,
      completionDisplaySeconds: 3600,
      maxPendingDeliveries: 1000,
      maxDeliveryAttempts: 20,
      maxConcurrentActiveTrades: 1000,
      minSettlementDelaySeconds: 900,
      maxSettlementDelaySeconds: 604800,
    })).toMatchObject({ dailyPopupTarget: 10000, maxIntervalSeconds: 604800, completionDisplaySeconds: 3600 });
  });

  it.each([
    ["max interval", { maxIntervalSeconds: 604801 }],
    ["delivery attempts", { maxDeliveryAttempts: 0 }],
    ["retry delay", { tradeRetryDelaySeconds: 4 }],
    ["settlement delay", { minSettlementDelaySeconds: 899 }],
    ["concurrency", { maxConcurrentActiveTrades: 0 }],
  ])("rejects an unsafe %s bound", (_label, change) => {
    expect(() => validatePackageAutomationPolicy({ ...base, ...change })).toThrow(/Invalid package automation policy/);
  });

  it("requires every ordered range to be non-inverted", () => {
    expect(() => validatePackageAutomationPolicy({ ...base, minIntervalSeconds: 3601, maxIntervalSeconds: 3600 }))
      .toThrow(/minimum interval cannot exceed maximum interval/);
    expect(() => validatePackageAutomationPolicy({ ...base, minSettlementDelaySeconds: 1800, maxSettlementDelaySeconds: 900 }))
      .toThrow(/minimum settlement delay cannot exceed maximum settlement delay/);
  });
});
