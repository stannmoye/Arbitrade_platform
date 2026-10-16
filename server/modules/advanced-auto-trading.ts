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
  rewardLimitCurrency?: string;
  dailyRewardWindow?: SchedulingPeriod;
  maxSettlementAttempts?: number;
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
  if (policy.dailyPopupTarget > 0 && policy.minIntervalSeconds === 0) errors.push("minimum interval must be positive when a daily popup target is configured");
  if (policy.minSettlementDelaySeconds < 0 || policy.maxSettlementDelaySeconds < policy.minSettlementDelaySeconds) errors.push("settlement delay range is invalid");
  if (!Number.isInteger(policy.minSettlementDelaySeconds) || !Number.isInteger(policy.maxSettlementDelaySeconds)) errors.push("settlement delays must be whole seconds");
  if (policy.maxTradeAttemptsPerDay > 0 && policy.maxSuccessfulTradesPerDay > policy.maxTradeAttemptsPerDay) errors.push("successful trades cannot exceed trade attempts");
  if (policy.dailyPopupTarget > 0 && policy.maxPendingDeliveries === 0) errors.push("daily popup target requires at least one pending delivery slot");
  if (policy.dailyPopupTarget > 0 && policy.maxPendingDeliveries > policy.dailyPopupTarget) errors.push("pending delivery limit cannot exceed the daily popup target");
  if (policy.maxDeliveryAttempts < 1) errors.push("maximum delivery attempts must be at least one");
  if (policy.maxRewardPerTradeMinor > 0 && policy.maxDailyRewardMinor > 0 && policy.maxRewardPerTradeMinor > policy.maxDailyRewardMinor) errors.push("maximum reward per trade cannot exceed daily reward cap");
  if (policy.minimumRewardBps > 10_000) errors.push("minimum reward rate cannot exceed 10000 basis points");
  if (policy.maxSettlementAttempts !== undefined && (!Number.isInteger(policy.maxSettlementAttempts) || policy.maxSettlementAttempts < 1)) errors.push("maximum settlement attempts must be at least one");
  if (policy.rewardLimitCurrency !== undefined && !/^[A-Z0-9]{2,12}$/.test(policy.rewardLimitCurrency)) errors.push("reward-limit currency must be a supported currency code");
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

/** Select a bounded randomized delay while accounting for the remaining target and window. */
export function chooseTargetAwareNextEligibleAt(
  now: Date,
  windowStart: Date,
  windowEnd: Date,
  actualCount: number,
  targetCount: number,
  minIntervalSeconds: number,
  maxIntervalSeconds: number,
  randomize = true,
  randomBytes: (size: number) => Uint8Array = cryptoRandomBytes,
) {
  if (windowEnd <= now || targetCount <= actualCount) return null;
  if (windowEnd <= windowStart || actualCount < 0 || targetCount < 0 || minIntervalSeconds < 0 || maxIntervalSeconds < minIntervalSeconds) {
    throw new Error("Invalid target-aware scheduling inputs");
  }
  const outstanding = targetCount - actualCount;
  const secondsRemaining = Math.floor((windowEnd.getTime() - now.getTime()) / 1000);
  const latestUsefulDelay = Math.floor(secondsRemaining / outstanding);
  const upper = Math.min(maxIntervalSeconds, latestUsefulDelay);
  if (upper < minIntervalSeconds) return null;
  const bytes = randomize ? randomBytes(4) : new Uint8Array([0, 0, 0, 0]);
  const randomUnit = randomize ? bytes.reduce((sum, byte, index) => sum + byte * 256 ** index, 0) / 0x1_0000_0000 : 0.5;
  const averageDelay = secondsRemaining / outstanding;
  const low = Math.max(minIntervalSeconds, Math.floor(Math.min(averageDelay, upper) * 0.65));
  const high = Math.max(low, upper);
  const delay = low + Math.floor(randomUnit * (high - low + 1));
  return new Date(now.getTime() + delay * 1000);
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

/** Convert wallet minor units using configured USD-reference rates; rounds upward for cap safety. */
export function convertMinorUnits(amountMinor: number, sourceScale: number, sourceUsdRate: string | number, targetScale: number, targetUsdRate: string | number, rounding: "up" | "down" = "up") {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !Number.isInteger(sourceScale) || !Number.isInteger(targetScale) || sourceScale < 0 || targetScale < 0 || sourceScale > 18 || targetScale > 18) throw new Error("Invalid currency amount or precision");
  const parseRate=(raw:string|number)=>{
    const value=String(raw);
    if(!/^\d+(?:\.\d+)?$/.test(value))throw new Error("Invalid configured currency rate");
    const [whole,fraction=""] = value.split(".");
    return [BigInt(whole+fraction),10n**BigInt(fraction.length)] as const;
  };
  const [sourceNumerator,sourceDenominator]=parseRate(sourceUsdRate);
  const [targetNumerator,targetDenominator]=parseRate(targetUsdRate);
  if(sourceNumerator<=0n||targetNumerator<=0n)throw new Error("Configured currency rates must be positive");
  const numerator=BigInt(amountMinor)*sourceNumerator*10n**BigInt(targetScale)*targetDenominator;
  const denominator=10n**BigInt(sourceScale)*sourceDenominator*targetNumerator;
  const result=rounding==="up"?(numerator+denominator-1n)/denominator:numerator/denominator;
  if(result>BigInt(Number.MAX_SAFE_INTEGER))throw new Error("Converted wallet amount exceeds safe integer precision");
  return Number(result);
}
