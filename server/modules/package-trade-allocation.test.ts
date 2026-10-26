import { describe, expect, it } from "vitest";
import { assertTradeAmountWithinBounds, chooseSecureTradeAmount } from "./package-trade-allocation";

describe("package trade amount allocation", () => {
  it("always returns a whole-unit amount inside package and balance bounds", () => {
    const amount = chooseSecureTradeAmount({
      minimumTradeMinor: 200_000,
      maximumTradeMinor: 700_000,
      offerMinimumMinor: 250_000,
      availableMinor: 500_000,
      randomIntFn: (min, maxExclusive) => maxExclusive - 1,
    });
    expect(amount).toBe(500_000);
  });

  it("returns null when the package minimum cannot be funded", () => {
    expect(chooseSecureTradeAmount({ minimumTradeMinor: 200_000, maximumTradeMinor: 700_000, offerMinimumMinor: 1, availableMinor: 199_999 })).toBeNull();
  });

  it("fails closed when an injected random source returns invalid amounts", () => {
    const request = { minimumTradeMinor: 10, maximumTradeMinor: 20, offerMinimumMinor: 10 };
    for (const invalid of [NaN, 10.5, 9, 21, Number.MAX_SAFE_INTEGER]) {
      expect(() => chooseSecureTradeAmount({
        ...request,
        randomIntFn: () => invalid,
      })).toThrow(/random source returned an out-of-range amount/);
    }
  });

  it("rejects ranges that the secure random sampler cannot represent safely", () => {
    expect(() => chooseSecureTradeAmount({
      minimumTradeMinor: 1,
      maximumTradeMinor: 2 ** 48 + 1,
      offerMinimumMinor: 1,
      randomIntFn: (min) => min,
    })).toThrow(/range exceeds secure random sampler limits/);
    expect(() => chooseSecureTradeAmount({
      minimumTradeMinor: 1,
      maximumTradeMinor: Number.MAX_SAFE_INTEGER,
      offerMinimumMinor: 1,
      randomIntFn: (min) => min,
    })).toThrow(/range exceeds secure random sampler limits/);
  });

  it("rejects manual amounts outside the package range", () => {
    expect(() => assertTradeAmountWithinBounds(700_001, { minimumTradeMinor: 200_000, maximumTradeMinor: 700_000 }, 1)).toThrow("cannot exceed");
    expect(() => assertTradeAmountWithinBounds(199_999, { minimumTradeMinor: 200_000, maximumTradeMinor: 700_000 }, 1)).toThrow("at least");
    expect(() => assertTradeAmountWithinBounds(500_000, { minimumTradeMinor: 200_000, maximumTradeMinor: 700_000 }, 1)).not.toThrow();
  });
});
