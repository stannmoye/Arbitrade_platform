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
  const randomIntFn = input.randomIntFn ?? ((min, maxExclusive) => randomInt(min, maxExclusive));
  // Rejection sampling via crypto.randomInt avoids Math.random and modulo bias.
  return randomIntFn(minimum, maximum + 1);
}

export function assertTradeAmountWithinBounds(amountMinor: number, bounds: TradeAmountBounds, offerMinimumMinor = 1): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < Math.max(1, bounds.minimumTradeMinor, offerMinimumMinor)) {
    throw new Error(`Trade amount must be at least ${Math.max(1, bounds.minimumTradeMinor, offerMinimumMinor)} minor units for this package`);
  }
  if (amountMinor > bounds.maximumTradeMinor) {
    throw new Error(`Trade amount cannot exceed ${bounds.maximumTradeMinor} minor units for this package`);
  }
}
