import { describe, expect, it } from "vitest";
import {
  calculateConfiguredProfitMinor,
  chooseProfitRateBps,
  chooseTradeDurationSeconds,
  usdMinorToNativeMinor,
  validateTradingPopupRange,
} from "./trading-popup-policy";

describe("admin-configured Trading popup ranges", () => {
  it("accepts an inclusive 2% to 5% range in 0.1% increments", () => {
    expect(validateTradingPopupRange({
      minimumRewardBps: 200,
      maximumRewardBps: 500,
      minimumTradeDurationSeconds: 60,
      maximumTradeDurationSeconds: 900,
    }).maximumRewardBps).toBe(500);
    expect(chooseProfitRateBps(200, 500, (min, max) => { expect([min, max]).toEqual([0, 31]); return 7; })).toBe(270);
    expect(chooseProfitRateBps(200, 500, (_min, max) => max - 1)).toBe(500);
  });

  it("persists a selected duration as a bounded integer", () => {
    expect(chooseTradeDurationSeconds(60, 900, (min, max) => { expect([min, max]).toEqual([60, 901]); return 301; })).toBe(361);
    expect(chooseTradeDurationSeconds(60, 900, (_min, max) => max - 1)).toBe(900);
  });

  it("calculates profit with integer half-up rounding", () => {
    expect(calculateConfiguredProfitMinor(10_000, 270)).toBe(270);
    expect(calculateConfiguredProfitMinor(101, 250)).toBe(3);
    expect(calculateConfiguredProfitMinor(100, 200)).toBe(2);
  });

  it("converts USD minor units to native minor units with explicit ceiling/floor rounding", () => {
    expect(usdMinorToNativeMinor(10_000, 2, "2", "ceil")).toBe(5000);
    expect(usdMinorToNativeMinor(10_001, 2, "2", "ceil")).toBe(5001);
    expect(usdMinorToNativeMinor(10_001, 2, "2", "floor")).toBe(5000);
    expect(usdMinorToNativeMinor(10_000, 8, "50000", "ceil")).toBe(20000);
  });

  it("rejects reversed, out-of-range, or invalid-precision settings", () => {
    expect(() => validateTradingPopupRange({ minimumRewardBps: 500, maximumRewardBps: 200, minimumTradeDurationSeconds: 1, maximumTradeDurationSeconds: 2 })).toThrow(/cannot exceed/);
    expect(() => validateTradingPopupRange({ minimumRewardBps: 201, maximumRewardBps: 500, minimumTradeDurationSeconds: 1, maximumTradeDurationSeconds: 2 })).toThrow(/0.1% increments/);
    expect(() => validateTradingPopupRange({ minimumRewardBps: 0, maximumRewardBps: 500, minimumTradeDurationSeconds: 901, maximumTradeDurationSeconds: 900 })).toThrow(/duration cannot exceed/);
  });
});
