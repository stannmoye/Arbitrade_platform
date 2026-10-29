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
export function calculateConfiguredProfitMinor(capitalMinor: number, profitRateBps: number) {
  if (!Number.isSafeInteger(capitalMinor) || capitalMinor <= 0) throw new Error("Capital must be a positive safe integer in native minor units.");
  if (!Number.isSafeInteger(profitRateBps) || profitRateBps < 0 || profitRateBps > 10_000) throw new Error("Profit rate must be between 0 and 10000 basis points.");
  const result = (BigInt(capitalMinor) * BigInt(profitRateBps) + 5_000n) / 10_000n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Configured profit exceeds the safe integer range.");
  return Number(result);
}
