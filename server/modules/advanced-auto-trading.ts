import { randomInt as nodeRandomInt } from "node:crypto";

export type SchedulingPeriod = "rolling_24h" | "calendar_day";
export type PackageAutomationPolicy = {
  packageName: string;
  automaticDelivery: boolean;
  dailyPopupTarget: number;
  schedulingPeriod: SchedulingPeriod;
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
  randomizationEnabled: boolean;
  completionDisplaySeconds: number;
  postCompletionIntervalSeconds: number;
  maxPendingDeliveries: number;
  maxDeliveryAttempts: number;
  automaticTradingEnabled: boolean;
  maxTradeAttemptsPerDay: number;
  tradeRetryDelaySeconds: number;
  maxSuccessfulTradesPerDay: number;
  maxConcurrentActiveTrades: number;
  requirePreviousSettlement: boolean;
  minSettlementDelaySeconds: number;
  maxSettlementDelaySeconds: number;
  minimumRewardBps: number;
  maxDailyRewardMinor: number;
  maxRewardPerTradeMinor: number;
  closePolicy: "after_completion" | "after_final_display";
};

export function validatePackageAutomationPolicy(policy: PackageAutomationPolicy) {
  const errors: string[] = [];
  const bounded = [
    ["daily popup target", policy.dailyPopupTarget, 0, 10000],
    ["minimum interval", policy.minIntervalSeconds, 0, 604800],
    ["maximum interval", policy.maxIntervalSeconds, 0, 604800],
    ["completion display duration", policy.completionDisplaySeconds, 1, 3600],
    ["post-completion interval", policy.postCompletionIntervalSeconds, 0, 604800],
    ["maximum pending deliveries", policy.maxPendingDeliveries, 0, 1000],
    ["maximum delivery attempts", policy.maxDeliveryAttempts, 1, 20],
    ["maximum trade attempts", policy.maxTradeAttemptsPerDay, 0, 10000],
    ["trade retry delay", policy.tradeRetryDelaySeconds, 5, 3600],
    ["maximum successful trades", policy.maxSuccessfulTradesPerDay, 0, 10000],
    ["maximum concurrent trades", policy.maxConcurrentActiveTrades, 1, 1000],
    ["minimum reward rate", policy.minimumRewardBps, 0, 10000],
    ["daily reward cap", policy.maxDailyRewardMinor, 0, 2147483647],
    ["maximum reward per trade", policy.maxRewardPerTradeMinor, 0, 2147483647],
    ["minimum settlement delay", policy.minSettlementDelaySeconds, 900, 604800],
    ["maximum settlement delay", policy.maxSettlementDelaySeconds, 900, 604800],
  ] as const;
  for (const [label, value, min, max] of bounded) {
    if (!Number.isSafeInteger(value) || value < min || value > max) errors.push(`${label} must be an integer between ${min} and ${max}`);
  }
  if (!policy.packageName.trim()) errors.push("package name is required");
  if (policy.schedulingPeriod !== "rolling_24h" && policy.schedulingPeriod !== "calendar_day") errors.push("scheduling period is invalid");
  if (policy.closePolicy !== "after_completion" && policy.closePolicy !== "after_final_display") errors.push("close policy is invalid");
  if (policy.minSettlementDelaySeconds > policy.maxSettlementDelaySeconds) errors.push("minimum settlement delay cannot exceed maximum settlement delay");
  if (policy.minIntervalSeconds > policy.maxIntervalSeconds) errors.push("minimum interval cannot exceed maximum interval");
  if (policy.maxTradeAttemptsPerDay > 0 && policy.maxSuccessfulTradesPerDay > policy.maxTradeAttemptsPerDay) errors.push("successful trades cannot exceed trade attempts");
  if (policy.dailyPopupTarget > 0 && policy.maxPendingDeliveries === 0) errors.push("daily popup target requires at least one pending delivery slot");
  if (policy.maxRewardPerTradeMinor > 0 && policy.maxDailyRewardMinor > 0 && policy.maxRewardPerTradeMinor > policy.maxDailyRewardMinor) errors.push("maximum reward per trade cannot exceed daily reward cap");
  if (policy.closePolicy === "after_final_display" && policy.completionDisplaySeconds < 1) errors.push("final-display close policy requires a positive completion duration");
  if (errors.length) throw new Error(`Invalid package automation policy for ${policy.packageName}: ${errors.join("; ")}`);
  return policy;
}

export function getWindowKey(now: Date, period: SchedulingPeriod) {
  if (period === "rolling_24h") return `rolling:${now.toISOString().slice(0, 13)}`;
  return `day:${now.toISOString().slice(0, 10)}`;
}

/**
 * Chooses the next server-owned schedule instant. Node's crypto.randomInt uses
 * unbiased bounded sampling (unlike taking random bytes modulo the interval).
 * The optional sampler keeps boundary behavior deterministic in unit tests.
 */
export function chooseNextEligibleAt(
  now: Date,
  minIntervalSeconds: number,
  maxIntervalSeconds: number,
  randomize: boolean,
  randomIntFn: (minimum: number, maximumExclusive: number) => number = nodeRandomInt,
) {
  if (!Number.isFinite(now.getTime()) ||
      !Number.isSafeInteger(minIntervalSeconds) ||
      !Number.isSafeInteger(maxIntervalSeconds) ||
      minIntervalSeconds < 0 ||
      maxIntervalSeconds < minIntervalSeconds ||
      maxIntervalSeconds >= 2 ** 48) {
    throw new Error("Invalid scheduling interval range");
  }
  const offset = randomize && maxIntervalSeconds > minIntervalSeconds
    ? randomIntFn(minIntervalSeconds, maxIntervalSeconds + 1)
    : minIntervalSeconds;
  if (!Number.isSafeInteger(offset) || offset < minIntervalSeconds || offset > maxIntervalSeconds) {
    throw new Error("Scheduling random source returned an out-of-range interval");
  }
  const next = new Date(now.getTime() + offset * 1000);
  if (!Number.isFinite(next.getTime())) throw new Error("Scheduled timestamp is outside the supported date range");
  return next;
}

function assertRewardAmount(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

export function remainingRewardAllowance(cap: number, credited: number, reserved: number) {
  assertRewardAmount(cap, "Reward cap");
  assertRewardAmount(credited, "Credited rewards");
  assertRewardAmount(reserved, "Reserved rewards");
  // Avoid intermediate floating-point overflow when summing large safe integers.
  const remaining = BigInt(cap) - BigInt(credited) - BigInt(reserved);
  return remaining > 0n ? Number(remaining) : 0;
}

export function canReserveReward(cap: number, credited: number, reserved: number, requested: number) {
  assertRewardAmount(requested, "Requested reward");
  return remainingRewardAllowance(cap, credited, reserved) >= requested;
}
