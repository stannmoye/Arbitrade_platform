import { describe, expect, it } from "vitest";
import { assertEligibleForPurchase, assertFxQuoteSafe, buildFundingPlan, calculateSettlement, fixed } from "./v5-rules";

describe("V5 server financial rules", () => {
  const base = { status: "ACTIVE" as const, currentPurchases: 0, userAlreadySucceeded: false, activePackage: true, activeInvestments: 0, maxActiveInvestments: 2 };

  it("rejects paused, expired, duplicate and package-ineligible purchases", () => {
    expect(() => assertEligibleForPurchase({ ...base, status: "PAUSED" })).toThrow("not active");
    expect(() => assertEligibleForPurchase({ ...base, expiresAt: new Date(Date.now() - 1) })).toThrow("expired");
    expect(() => assertEligibleForPurchase({ ...base, userAlreadySucceeded: true })).toThrow("already");
    expect(() => assertEligibleForPurchase({ ...base, activePackage: false })).toThrow("active package");
  });

  it("allows multiple customers up to a cap but rejects the final slot", () => {
    expect(() => assertEligibleForPurchase({ ...base, currentPurchases: 2, maxPurchases: 3 })).not.toThrow();
    expect(() => assertEligibleForPurchase({ ...base, currentPurchases: 3, maxPurchases: 3 })).toThrow("purchase limit");
  });

  it("builds a priority-ordered multi-wallet plan without partial success", () => {
    const usd = fixed("20", "USD");
    const plan = buildFundingPlan(fixed("30", "USD"), [
      { walletId: 1, assetCode: "USD", available: usd, priority: 1, eligible: true },
      { walletId: 2, assetCode: "USD", available: fixed("15", "USD"), priority: 2, eligible: true },
    ], (amount) => amount);
    expect(plan).toEqual([{ walletId: 1, assetCode: "USD", amount: "20.00" }, { walletId: 2, assetCode: "USD", amount: "10.00" }]);
    expect(() => buildFundingPlan(fixed("40", "USD"), [{ walletId: 1, assetCode: "USD", available: usd, priority: 1, eligible: true }], amount => amount)).toThrow("Insufficient");
  });

  it("fails closed for expired, invalid, or out-of-tolerance FX", () => {
    const now = new Date();
    expect(() => assertFxQuoteSafe({ quotedAt: now, validUntil: new Date(now.getTime() - 1), rate: "1", tolerance: "0.02", now })).toThrow("expired");
    expect(() => assertFxQuoteSafe({ quotedAt: now, validUntil: new Date(now.getTime() + 60_000), rate: "1", tolerance: "0.02", observedRate: "1.03", now })).toThrow("tolerance");
    expect(() => assertFxQuoteSafe({ quotedAt: now, validUntil: new Date(now.getTime() + 60_000), rate: "0", tolerance: "0.02", now })).toThrow("invalid");
  });

  it("uses explicit profit terminology and settlement states", () => {
    const result = calculateSettlement({ principal: fixed("100", "USD"), grossProfit: fixed("10", "USD"), fees: fixed("2", "USD") });
    expect(result.status).toBe("SETTLED_PROFIT");
    expect(result.takeHomeProfit.toString()).toBe("8.00");
    expect(result.totalReturned.toString()).toBe("108.00");
  });
});
