import { describe, expect, it } from "vitest";
import { addCalendarMonths, calculateQualifyingBalanceUsdMinor, parsePackageQualificationPolicy } from "./trading-package-activation";

describe("trading package activation policy", () => {
  it("defaults to a single USD wallet, no repeats, and the approved six-hour cooldown", () => {
    expect(parsePackageQualificationPolicy({})).toEqual({
      eligibleCurrencies: ["USD"],
      combineEligibleWallets: false,
      repeatAllowed: false,
      maxCopies: 0,
      repeatRestriction: "active_only",
      cooldownSeconds: 21600,
    });
  });

  it("converts only configured spendable wallet balances to USD minor units", () => {
    const wallets = [
      { currency: "USD", availableMinor: 9999, scale: 2, usdRate: 1 },
      { currency: "EUR", availableMinor: 50000, scale: 2, usdRate: 1.1 },
    ];
    expect(calculateQualifyingBalanceUsdMinor(wallets, {
      eligibleCurrencies: ["USD"], combineEligibleWallets: false,
    })).toBe(9999);
    expect(calculateQualifyingBalanceUsdMinor(wallets, {
      eligibleCurrencies: ["USD", "EUR"], combineEligibleWallets: false,
    })).toBe(55000);
    expect(calculateQualifyingBalanceUsdMinor(wallets, {
      eligibleCurrencies: ["USD", "EUR"], combineEligibleWallets: true,
    })).toBe(64999);
  });

  it("rejects malformed eligibility policies instead of falling back silently", () => {
    expect(() => parsePackageQualificationPolicy({ "trading.packageQualification.eligibleCurrencies": "USD" })).toThrow();
    expect(() => parsePackageQualificationPolicy({ "trading.packagePurchase.repeatAllowed": "yes" })).toThrow();
  });

  it("clamps calendar-month expiry dates rather than rolling into the following month", () => {
    expect(addCalendarMonths(new Date("2026-01-31T12:00:00.000Z"), 1).toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(addCalendarMonths(new Date("2028-01-31T12:00:00.000Z"), 1).toISOString()).toBe("2028-02-29T12:00:00.000Z");
    expect(addCalendarMonths(new Date("2026-10-24T12:00:00.000Z"), 3).toISOString()).toBe("2027-01-24T12:00:00.000Z");
  });

  it("rejects invalid activation dates and unsupported package durations", () => {
    expect(() => addCalendarMonths(new Date(Number.NaN), 1)).toThrow(/valid activation time/);
    expect(() => addCalendarMonths(new Date("2026-10-24T12:00:00.000Z"), 0)).toThrow(/1–1200 calendar months/);
    expect(() => addCalendarMonths(new Date("2026-10-24T12:00:00.000Z"), 1201)).toThrow(/1–1200 calendar months/);
  });

  it("fails closed when combining eligible wallet balances would exceed safe integer precision", () => {
    expect(() => calculateQualifyingBalanceUsdMinor([
      { currency: "USD", availableMinor: 45_035_996_273_704, scale: 0, usdRate: 1 },
      { currency: "EUR", availableMinor: 45_035_996_273_704, scale: 0, usdRate: 1 },
    ], { eligibleCurrencies: ["USD", "EUR"], combineEligibleWallets: true })).toThrow(/safe integer precision/);
  });
});
