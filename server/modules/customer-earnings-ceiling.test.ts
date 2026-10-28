import { describe, expect, it } from "vitest";
import { canReserveCustomerEarnings, convertMinorToReferenceMinor, earningsWindow, validateCustomerEarningsCeilingPolicy } from "./customer-earnings-ceiling";

describe("customer earnings ceiling", () => {
  it("validates an administrator policy without inventing a default amount", () => {
    expect(validateCustomerEarningsCeilingPolicy({ amountMinor: 10000, referenceCurrency: "usd", window: "rolling_24h", timezone: "UTC" }).referenceCurrency).toBe("USD");
    expect(() => validateCustomerEarningsCeilingPolicy({ amountMinor: 0, referenceCurrency: "USD", window: "rolling_24h", timezone: "UTC" })).toThrow(/positive/);
    expect(() => validateCustomerEarningsCeilingPolicy({ amountMinor: 100, referenceCurrency: "USD", window: "calendar_day", timezone: "not-a-zone" })).toThrow(/timezone/);
  });
  it("uses explicit rolling and calendar windows", () => {
    const now = new Date("2026-10-28T12:00:00.000Z");
    expect(earningsWindow(now, "rolling_24h", "UTC").start.toISOString()).toBe("2026-10-27T12:00:00.000Z");
    expect(earningsWindow(now, "calendar_day", "UTC").key).toContain("2026-10-28");
  });
  it("converts native minor units through the current USD reference rate", () => {
    expect(convertMinorToReferenceMinor(10000, 2, 1, 2, 1)).toBe(10000);
    expect(convertMinorToReferenceMinor(10000, 2, 2, 2, 1)).toBe(20000);
  });
  it("counts realized and reserved capacity before a new reservation", () => {
    expect(canReserveCustomerEarnings(10000, 3000, 4000, 3000)).toBe(true);
    expect(canReserveCustomerEarnings(10000, 3000, 4000, 3001)).toBe(false);
  });
});
