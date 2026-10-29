import { describe, expect, it } from "vitest";
import {
  calculateConfiguredProfitMinor,
  chooseInclusiveInteger,
  createTradingPopupSnapshot,
  validateTradingPopupPolicy,
  type TradingPopupPackagePolicy,
} from "./trading-popup-policy";

const policy: TradingPopupPackagePolicy = {
  packageId: 7,
  packageVersion: 3,
  packageName: "Aureate Capital",
  badgeLabel: "PREMIUM",
  minimumCapitalMinor: 10_000,
  maximumCapitalMinor: 100_000,
  minimumProfitBps: 200,
  maximumProfitBps: 500,
  minimumDurationSeconds: 60,
  maximumDurationSeconds: 300,
  popupDisplaySeconds: 12,
  opportunitiesPerDay: 6,
  enabled: true,
};

describe("Trading pop-up policy", () => {
  it("accepts decimal percentage ranges represented exactly in basis points", () => {
    expect(validateTradingPopupPolicy({ ...policy, minimumProfitBps: 270, maximumProfitBps: 490 })).toEqual({
      ...policy, minimumProfitBps: 270, maximumProfitBps: 490,
    });
  });

  it("rejects inverted ranges, unsafe durations, and invalid capital bounds", () => {
    expect(() => validateTradingPopupPolicy({ ...policy, minimumProfitBps: 501 })).toThrow(/percentage/);
    expect(() => validateTradingPopupPolicy({ ...policy, minimumDurationSeconds: 301 })).toThrow(/duration/);
    expect(() => validateTradingPopupPolicy({ ...policy, minimumCapitalMinor: 100_001 })).toThrow(/Capital/);
    expect(() => validateTradingPopupPolicy({ ...policy, popupDisplaySeconds: 0 })).toThrow(/popupDisplaySeconds/);
  });

  it("chooses inclusively and rejects a sampler that violates the configured bounds", () => {
    expect(chooseInclusiveInteger(200, 500, (minimum, maximumExclusive) => {
      expect(minimum).toBe(200);
      expect(maximumExclusive).toBe(501);
      return 270;
    })).toBe(270);
    expect(() => chooseInclusiveInteger(200, 500, () => 501)).toThrow(/outside/);
  });

  it("calculates profit using integer minor units and half-up rounding", () => {
    expect(calculateConfiguredProfitMinor(10_000, 270)).toBe(270);
    expect(calculateConfiguredProfitMinor(10_001, 250)).toBe(250);
    expect(calculateConfiguredProfitMinor(1, 5_000)).toBe(1);
    expect(() => calculateConfiguredProfitMinor(Number.MAX_SAFE_INTEGER, 100_000)).toThrow(/safe integer/);
  });

  it("snapshots customer, package version, catalogue company, selected rate, and due time once", () => {
    const values = [270, 123];
    const snapshot = createTradingPopupSnapshot({
      customerId: 101,
      customerPackageId: 202,
      companyId: "catalogue-company-991",
      capitalMinor: 10_000,
      policy: { ...policy, minimumProfitBps: 200, maximumProfitBps: 500, minimumDurationSeconds: 60, maximumDurationSeconds: 300 },
      now: new Date("2026-10-29T10:00:00.000Z"),
      sampler: () => values.shift() ?? 200,
    });

    expect(snapshot).toMatchObject({
      customerId: 101,
      customerPackageId: 202,
      packageId: 7,
      packageVersion: 3,
      companyId: "catalogue-company-991",
      capitalMinor: 10_000,
      profitRateBps: 270,
      configuredGrossProfitMinor: 270,
      durationSeconds: 123,
      startedAt: "2026-10-29T10:00:00.000Z",
      dueAt: "2026-10-29T10:02:03.000Z",
    });
  });

  it("fails closed when the package is disabled, company ID is missing, or capital is out of range", () => {
    expect(() => createTradingPopupSnapshot({
      customerId: 101, customerPackageId: 202, companyId: "company", capitalMinor: 10_000,
      policy: { ...policy, enabled: false },
    })).toThrow(/disabled/);
    expect(() => createTradingPopupSnapshot({
      customerId: 101, customerPackageId: 202, companyId: " ", capitalMinor: 10_000, policy,
    })).toThrow(/company ID/);
    expect(() => createTradingPopupSnapshot({
      customerId: 101, customerPackageId: 202, companyId: "company", capitalMinor: 9_999, policy,
    })).toThrow(/capital/);
  });
});
