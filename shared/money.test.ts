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
  it("converts USD minor units with decimal-safe half-up rounding", async () => {
    const { nativeMinorToUsdMinorExact } = await import("./money");
    expect(nativeMinorToUsdMinorExact(10000, 2, "0.5")).toBe(5000);
    expect(nativeMinorToUsdMinorExact(1, 2, "0.5")).toBe(1); // USD 0.005 rounds half-up to one cent.
    expect(nativeMinorToUsdMinorExact(1, 2, "0.49")).toBe(0);
    expect(nativeMinorToUsdMinorExact(100000000, 8, "65000")).toBe(6500000);
    expect(nativeMinorToUsdMinorExact(12345, 2, "1.2345")).toBe(15240);
  });

  it("rejects invalid FX rates, invalid scales, and unsafe amounts", async () => {
    const { nativeMinorToUsdMinorExact } = await import("./money");
    expect(() => nativeMinorToUsdMinorExact(100, 2, "0")).toThrow("finite and positive");
    expect(() => nativeMinorToUsdMinorExact(100, 2, "NaN")).toThrow("finite and positive");
    expect(() => nativeMinorToUsdMinorExact(100, 31, "1")).toThrow("precision scale");
    expect(() => nativeMinorToUsdMinorExact(Number.MAX_SAFE_INTEGER, 0, "1000000000000")).toThrow("safe integer range");
  });

});
