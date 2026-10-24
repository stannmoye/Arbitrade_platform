import { describe, expect, it } from "vitest";
import { calculateRealizedProfitSettlement } from "./realized-profit-accounting";

describe("realized trade profit accounting", () => {
  it("charges the canonical 15% fee only on actual positive gross profit", () => {
    expect(calculateRealizedProfitSettlement({
      principalMinor: 100_000,
      grossProfitMinor: 20_000,
      feeRateBps: 1500,
      roundingMode: "half_up",
    })).toEqual({
      principalMinor: 100_000,
      grossProfitMinor: 20_000,
      platformFeeMinor: 3_000,
      netProfitMinor: 17_000,
      totalReturnedMinor: 117_000,
      rewardCreditedMinor: 17_000,
      outcome: "profit",
    });
  });

  it("charges no fee for a zero-profit or loss settlement", () => {
    const zero = calculateRealizedProfitSettlement({
      principalMinor: 1000, grossProfitMinor: 0, feeRateBps: 1500, roundingMode: "half_up",
    });
    const loss = calculateRealizedProfitSettlement({
      principalMinor: 1000, grossProfitMinor: -250, feeRateBps: 1500, roundingMode: "half_up",
    });
    expect(zero).toMatchObject({ platformFeeMinor: 0, netProfitMinor: 0, totalReturnedMinor: 1000, outcome: "zero_profit" });
    expect(loss).toMatchObject({ platformFeeMinor: 0, netProfitMinor: -250, totalReturnedMinor: 750, outcome: "loss" });
  });

  it("uses exact integer rounding for every supported fee rule", () => {
    const calculate = (roundingMode: "half_up" | "down" | "up" | "half_even", grossProfitMinor: number) =>
      calculateRealizedProfitSettlement({ principalMinor: 10_000, grossProfitMinor, feeRateBps: 1500, roundingMode }).platformFeeMinor;
    expect(calculate("half_up", 10)).toBe(2);
    expect(calculate("down", 10)).toBe(1);
    expect(calculate("up", 10)).toBe(2);
    expect(calculate("half_even", 30)).toBe(4);
  });

  it("rejects losses larger than committed principal rather than inventing a margin rule", () => {
    expect(() => calculateRealizedProfitSettlement({
      principalMinor: 1000, grossProfitMinor: -1001, feeRateBps: 1500, roundingMode: "half_up",
    })).toThrow("no approved leveraged-loss policy");
  });

  it("rejects invalid precision and fee policies", () => {
    expect(() => calculateRealizedProfitSettlement({
      principalMinor: 0, grossProfitMinor: 0, feeRateBps: 1500, roundingMode: "half_up",
    })).toThrow(RangeError);
    expect(() => calculateRealizedProfitSettlement({
      principalMinor: 10, grossProfitMinor: 1, feeRateBps: 15001, roundingMode: "half_up",
    })).toThrow(RangeError);
  });
});
