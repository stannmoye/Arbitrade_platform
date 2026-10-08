import { describe, expect, it } from "vitest";
import { FixedMoney, quantize, type PrecisionConfig } from "./money";

const USD: PrecisionConfig = { code: "USD", scale: 2, minimumUnit: "0.01", roundingMode: "half_up" };
const BTC: PrecisionConfig = { code: "BTC", scale: 8, minimumUnit: "0.00000001", roundingMode: "down" };

describe("fixed precision money", () => {
  it("quantizes at the configured ledger boundary", () => {
    expect(quantize("1.005", USD).toString()).toBe("1.01");
    expect(quantize("0.123456789", BTC).toString()).toBe("0.12345678");
  });

  it("does not permit arithmetic across different precision configurations", () => {
    expect(() => new FixedMoney("1", USD).add(new FixedMoney("1", BTC))).toThrow("precision configuration mismatch");
  });

  it("keeps fee and principal calculations explicit", () => {
    const principal = quantize("100.00", USD);
    const fee = principal.multiply("0.0125");
    expect(fee.toString()).toBe("1.25");
    expect(principal.subtract(fee).toString()).toBe("98.75");
  });
});

describe("live currency conversion helpers", () => {
  it("converts native minor units to USD using the current registry rate", async () => {
    const { nativeMinorToUsd } = await import("./money");
    expect(nativeMinorToUsd(12500, 2, 1.1)).toBeCloseTo(137.5, 8);
  });
  it("converts whole USD units to native minor units", async () => {
    const { usdUnitsToNativeMinor } = await import("./money");
    expect(usdUnitsToNativeMinor(100, 2, 1.25)).toBe(8000);
    expect(usdUnitsToNativeMinor(100, 8, 50000)).toBe(200000);
  });
});
