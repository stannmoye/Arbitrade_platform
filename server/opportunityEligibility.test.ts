import { describe, expect, it } from "vitest";
import { isCustomerOpportunityAllowed, isWithinQuietHours } from "./opportunityEligibility";

describe("isCustomerOpportunityAllowed", () => {
  const defaults = {
    enabled: true,
    allowedAssets: "USD,EUR,GBP,BTC,ETH",
    currency: "USD",
    symbol: "BTC-USD",
    rewardBps: 75,
    minimumRewardBps: 50,
  };

  it("allows an asset whose currency is on the customer's allowlist and meets reward minimum", () => {
    expect(isCustomerOpportunityAllowed(defaults)).toBe(true);
  });

  it("matches allowed assets case-insensitively and supports symbol allowlisting", () => {
    expect(isCustomerOpportunityAllowed({ ...defaults, currency: "jpy", symbol: "eth", allowedAssets: "ETH" })).toBe(true);
  });

  it("rejects currencies and symbols outside the allowlist", () => {
    expect(isCustomerOpportunityAllowed({ ...defaults, currency: "JPY", symbol: "USD-JPY" })).toBe(false);
  });

  it("rejects rewards below the customer's minimum", () => {
    expect(isCustomerOpportunityAllowed({ ...defaults, rewardBps: 49 })).toBe(false);
  });

  it("fails closed when rules are disabled or the allowlist is empty", () => {
    expect(isCustomerOpportunityAllowed({ ...defaults, enabled: false })).toBe(false);
    expect(isCustomerOpportunityAllowed({ ...defaults, allowedAssets: " , " })).toBe(false);
  });

  it("rejects non-finite reward settings", () => {
    expect(isCustomerOpportunityAllowed({ ...defaults, rewardBps: Number.NaN })).toBe(false);
  });
});

describe("isWithinQuietHours", () => {
  it("recognizes quiet hours that cross midnight", () => {
    expect(isWithinQuietHours(new Date(2026, 0, 1, 23, 30), "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 0, 1, 6, 59), "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 0, 1, 7, 0), "22:00", "07:00")).toBe(false);
  });

  it("recognizes daytime quiet hours and excludes the end time", () => {
    expect(isWithinQuietHours(new Date(2026, 0, 1, 12, 0), "11:00", "13:00")).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 0, 1, 13, 0), "11:00", "13:00")).toBe(false);
  });

  it("treats equal or invalid times as no quiet-hours window", () => {
    const now = new Date(2026, 0, 1, 23, 30);
    expect(isWithinQuietHours(now, "22:00", "22:00")).toBe(false);
    expect(isWithinQuietHours(now, "invalid", "07:00")).toBe(false);
  });
});
