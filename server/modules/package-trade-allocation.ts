import { randomInt } from "node:crypto";

export type TradeAmountBounds = {
  minimumTradeMinor: number;
  maximumTradeMinor: number;
};

export type TradeAmountRequest = TradeAmountBounds & {
  offerMinimumMinor: number;
  availableMinor?: number;
  randomIntFn?: (minimum: number, maximumExclusive: number) => number;
};

/**
 * Selects a whole-minor-unit amount with a CSPRNG. The browser never supplies
 * the automatic amount, and the result is always inside the effective bounds.
 */
export function chooseSecureTradeAmount(input: TradeAmountRequest): number | null {
  const minimum = Math.max(1, Math.ceil(input.minimumTradeMinor), Math.ceil(input.offerMinimumMinor));
  const configuredMaximum = Math.floor(input.maximumTradeMinor);
  const availableMaximum = input.availableMinor === undefined ? configuredMaximum : Math.floor(input.availableMinor);
  const maximum = Math.min(configuredMaximum, availableMaximum);
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum > maximum) return null;
  // crypto.randomInt requires a safe exclusive upper bound and a range below 2^48.
  // Fail closed rather than silently biasing or overflowing an unsupported range.
  if (maximum >= Number.MAX_SAFE_INTEGER || maximum - minimum >= 2 ** 48) {
    throw new RangeError("Trade amount range exceeds secure random sampler limits");
  }
  const randomIntFn = input.randomIntFn ?? ((min, maxExclusive) => randomInt(min, maxExclusive));
  // crypto.randomInt avoids Math.random and modulo bias; validate injected samplers too.
  const amount = randomIntFn(minimum, maximum + 1);
  if (!Number.isSafeInteger(amount) || amount < minimum || amount > maximum) {
    throw new RangeError("Trade amount random source returned an out-of-range amount");
  }
  return amount;
}

export function assertTradeAmountWithinBounds(amountMinor: number, bounds: TradeAmountBounds, offerMinimumMinor = 1): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < Math.max(1, bounds.minimumTradeMinor, offerMinimumMinor)) {
    throw new Error(`Trade amount must be at least ${Math.max(1, bounds.minimumTradeMinor, offerMinimumMinor)} minor units for this package`);
  }
  if (amountMinor > bounds.maximumTradeMinor) {
    throw new Error(`Trade amount cannot exceed ${bounds.maximumTradeMinor} minor units for this package`);
  }
}
