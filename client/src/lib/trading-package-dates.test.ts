import { describe, expect, it } from "vitest";
import {
  CUSTOMER_PACKAGE_ACTIVATION_DATE_UNAVAILABLE,
  formatCustomerTradingPackageActivationDate,
} from "./trading-package-dates";

describe("customer Trading package activation dates", () => {
  it("shows a clear fallback when the stored activation date is missing", () => {
    expect(formatCustomerTradingPackageActivationDate(null)).toBe(CUSTOMER_PACKAGE_ACTIVATION_DATE_UNAVAILABLE);
    expect(formatCustomerTradingPackageActivationDate(undefined)).toBe(CUSTOMER_PACKAGE_ACTIVATION_DATE_UNAVAILABLE);
  });

  it("does not show Invalid Date for malformed timestamps", () => {
    expect(formatCustomerTradingPackageActivationDate("not-a-date")).toBe(CUSTOMER_PACKAGE_ACTIVATION_DATE_UNAVAILABLE);
    expect(formatCustomerTradingPackageActivationDate(new Date(Number.NaN))).toBe(CUSTOMER_PACKAGE_ACTIVATION_DATE_UNAVAILABLE);
  });

  it("formats valid timestamps using the current locale", () => {
    const date = new Date("2026-10-27T12:00:00.000Z");
    expect(formatCustomerTradingPackageActivationDate(date)).toBe(date.toLocaleDateString());
    expect(formatCustomerTradingPackageActivationDate(date.toISOString())).toBe(date.toLocaleDateString());
  });
});
