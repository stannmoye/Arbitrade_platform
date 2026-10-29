import { randomInt as secureRandomInt } from "node:crypto";

export const PROFIT_RATE_STEP_BPS = 10; // 0.1 percentage-point increments.

export type TradingPopupRange = {
  minimumRewardBps: number;
  maximumRewardBps: number;
  minimumTradeDurationSeconds: number;
  maximumTradeDurationSeconds: number;
};

export function validateTradingPopupRange(range: TradingPopupRange) {
  const errors: string[] = [];
  const { minimumRewardBps, maximumRewardBps, minimumTradeDurationSeconds, maximumTradeDurationSeconds } = range;
  if (!Number.isSafeInteger(minimumRewardBps) || minimumRewardBps < 0 || minimumRewardBps > 10_000 || minimumRewardBps % PROFIT_RATE_STEP_BPS !== 0) {
    errors.push("Minimum profit rate must be a basis-point integer in 0.1% increments from 0% to 100%.");
  }
  if (!Number.isSafeInteger(maximumRewardBps) || maximumRewardBps < 0 || maximumRewardBps > 10_000 || maximumRewardBps % PROFIT_RATE_STEP_BPS !== 0) {
    errors.push("Maximum profit rate must be a basis-point integer in 0.1% increments from 0% to 100%.");
  }
  if (Number.isSafeInteger(minimumRewardBps) && Number.isSafeInteger(maximumRewardBps) && minimumRewardBps > maximumRewardBps) {
    errors.push("Minimum profit rate cannot exceed maximum profit rate.");
  }
  if (!Number.isSafeInteger(minimumTradeDurationSeconds) || minimumTradeDurationSeconds < 1 || minimumTradeDurationSeconds > 2_592_000) {
    errors.push("Minimum trade duration must be 1 second to 30 days.");
  }
  if (!Number.isSafeInteger(maximumTradeDurationSeconds) || maximumTradeDurationSeconds < 1 || maximumTradeDurationSeconds > 2_592_000) {
    errors.push("Maximum trade duration must be 1 second to 30 days.");
  }
  if (Number.isSafeInteger(minimumTradeDurationSeconds) && Number.isSafeInteger(maximumTradeDurationSeconds) && minimumTradeDurationSeconds > maximumTradeDurationSeconds) {
    errors.push("Minimum trade duration cannot exceed maximum trade duration.");
  }
  if (errors.length) throw new Error(errors.join(" "));
  return range;
}

export function chooseProfitRateBps(
  minimumRewardBps: number,
  maximumRewardBps: number,
  randomInt: (minimum: number, maximumExclusive: number) => number = secureRandomInt,
) {
  validateTradingPopupRange({
    minimumRewardBps,
    maximumRewardBps,
    minimumTradeDurationSeconds: 1,
    maximumTradeDurationSeconds: 1,
  });
  const steps = Math.floor((maximumRewardBps - minimumRewardBps) / PROFIT_RATE_STEP_BPS);
  const selected = randomInt(0, steps + 1);
  if (!Number.isSafeInteger(selected) || selected < 0 || selected > steps) {
    throw new Error("Profit-rate random source returned an out-of-range value.");
  }
  return minimumRewardBps + selected * PROFIT_RATE_STEP_BPS;
}

export function chooseTradeDurationSeconds(
  minimumSeconds: number,
  maximumSeconds: number,
  randomInt: (minimum: number, maximumExclusive: number) => number = secureRandomInt,
) {
  validateTradingPopupRange({
    minimumRewardBps: 0,
    maximumRewardBps: 0,
    minimumTradeDurationSeconds: minimumSeconds,
    maximumTradeDurationSeconds: maximumSeconds,
  });
  const selected = randomInt(minimumSeconds, maximumSeconds + 1);
  if (!Number.isSafeInteger(selected) || selected < minimumSeconds || selected > maximumSeconds) {
    throw new Error("Trade-duration random source returned an out-of-range value.");
  }
  return selected;
}

/** Round half-up using integer arithmetic; no floating-point money multiplication. */
export function usdMinorToNativeMinor(usdMinor: number, nativeScale: number, usdRate: string | number, rounding: "ceil" | "floor") {
  if (!Number.isSafeInteger(usdMinor) || usdMinor <= 0) throw new Error("USD capital must be a positive safe integer in cents.");
  if (!Number.isSafeInteger(nativeScale) || nativeScale < 0 || nativeScale > 18) throw new Error("Currency precision is invalid.");
  const rateText = String(usdRate).trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(rateText);
  if (!match) throw new Error("Exchange rate must be a positive decimal without exponent notation.");
  const fractional = match[2] ?? "";
  const denominator = 10n ** BigInt(fractional.length);
  const numerator = BigInt(match[1] + fractional);
  if (numerator <= 0n) throw new Error("Exchange rate must be positive.");
  const top = BigInt(usdMinor) * (10n ** BigInt(nativeScale)) * denominator;
  const bottom = 100n * numerator;
  const quotient = top / bottom;
  const remainder = top % bottom;
  const result = rounding === "ceil" && remainder > 0n ? quotient + 1n : quotient;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Converted capital exceeds the safe integer range.");
  return Number(result);
}
export function calculateConfiguredProfitMinor(capitalMinor: number, profitRateBps: number) {
  if (!Number.isSafeInteger(capitalMinor) || capitalMinor <= 0) throw new Error("Capital must be a positive safe integer in native minor units.");
  if (!Number.isSafeInteger(profitRateBps) || profitRateBps < 0 || profitRateBps > 10_000) throw new Error("Profit rate must be between 0 and 10000 basis points.");
  const result = (BigInt(capitalMinor) * BigInt(profitRateBps) + 5_000n) / 10_000n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Configured profit exceeds the safe integer range.");
  return Number(result);
}
