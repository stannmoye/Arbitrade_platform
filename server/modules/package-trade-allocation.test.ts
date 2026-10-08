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

  it("rejects manual amounts outside the package range", () => {
    expect(() => assertTradeAmountWithinBounds(700_001, { minimumTradeMinor: 200_000, maximumTradeMinor: 700_000 }, 1)).toThrow("cannot exceed");
    expect(() => assertTradeAmountWithinBounds(199_999, { minimumTradeMinor: 200_000, maximumTradeMinor: 700_000 }, 1)).toThrow("at least");
    expect(() => assertTradeAmountWithinBounds(500_000, { minimumTradeMinor: 200_000, maximumTradeMinor: 700_000 }, 1)).not.toThrow();
  });
});
