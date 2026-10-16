import { randomBytes as nodeRandomBytes } from "node:crypto";

export type SchedulingPeriod = "rolling_24h" | "calendar_day";
export type PackageAutomationPolicy = {
  packageName: string;
  automaticDelivery: boolean;
  dailyPopupTarget: number;
  schedulingPeriod: SchedulingPeriod;
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
  randomizationEnabled: boolean;
  popupDisplayTargetSeconds: number;
  completionDisplaySeconds: number;
  postCompletionIntervalSeconds: number;
  maxPendingDeliveries: number;
  maxDeliveryAttempts: number;
  automaticTradingEnabled: boolean;
  maxTradeAttemptsPerDay: number;
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
  const nonNegative = [
    ["daily popup target", policy.dailyPopupTarget],
    ["minimum interval", policy.minIntervalSeconds],
    ["maximum interval", policy.maxIntervalSeconds],
    ["popup display target", policy.popupDisplayTargetSeconds],
    ["completion display duration", policy.completionDisplaySeconds],
    ["post-completion interval", policy.postCompletionIntervalSeconds],
    ["maximum pending deliveries", policy.maxPendingDeliveries],
    ["maximum delivery attempts", policy.maxDeliveryAttempts],
    ["maximum trade attempts", policy.maxTradeAttemptsPerDay],
    ["maximum successful trades", policy.maxSuccessfulTradesPerDay],
    ["maximum concurrent trades", policy.maxConcurrentActiveTrades],
    ["minimum reward rate", policy.minimumRewardBps],
    ["daily reward cap", policy.maxDailyRewardMinor],
    ["maximum reward per trade", policy.maxRewardPerTradeMinor],
  ] as const;
  for (const [label, value] of nonNegative) if (!Number.isInteger(value) || value < 0) errors.push(`${label} must be a non-negative integer`);
  if (policy.minIntervalSeconds > policy.maxIntervalSeconds) errors.push("minimum interval cannot exceed maximum interval");
  if (policy.minSettlementDelaySeconds < 0 || policy.maxSettlementDelaySeconds < policy.minSettlementDelaySeconds) errors.push("settlement delay range is invalid");
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

/** Uses bounded cryptographic randomness. The seed is never returned to customers. */
export function chooseNextEligibleAt(now: Date, minIntervalSeconds: number, maxIntervalSeconds: number, randomize: boolean, randomBytes: (size: number) => Uint8Array = cryptoRandomBytes) {
  if (minIntervalSeconds < 0 || maxIntervalSeconds < minIntervalSeconds) throw new Error("Invalid scheduling interval range");
  const span = maxIntervalSeconds - minIntervalSeconds;
  const offset = randomize && span > 0 ? randomBytes(4).reduce((sum, byte, index) => sum + byte * 256 ** index, 0) % (span + 1) : 0;
  return new Date(now.getTime() + (minIntervalSeconds + offset) * 1000);
}

function cryptoRandomBytes(size: number) {
  const values = new Uint8Array(size);
  values.set(nodeRandomBytes(size));
  return values;
}

export function remainingRewardAllowance(cap: number, credited: number, reserved: number) {
  return Math.max(0, cap - credited - reserved);
}

export function canReserveReward(cap: number, credited: number, reserved: number, requested: number) {
  return requested >= 0 && remainingRewardAllowance(cap, credited, reserved) >= requested;
}
