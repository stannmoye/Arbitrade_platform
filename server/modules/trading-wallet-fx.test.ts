import { describe, expect, it } from "vitest";
import { planCrossWalletFunding, type FxRateSnapshot } from "./trading-wallet-fx";

const rate = (currency: string, scale: number, rateUsdPerUnit: string): FxRateSnapshot => ({
  currency, scale, rateUsdPerUnit, provider: "test-api", sourceDate: "2026-10-29T10:00:00.000Z",
  fetchedAt: new Date("2026-10-29T10:00:00.000Z"),
});

describe("multi-wallet Trading funding plan", () => {
  it("uses the target wallet first and calculates the exact remaining source debit", () => {
    const result = planCrossWalletFunding({
      requiredTargetMinor: 10_000,
      targetAvailableMinor: 5_000,
      targetRate: rate("USD", 2, "1"),
      sourceWallets: [{ currency: "EUR", scale: 2, availableMinor: 10_000, rate: rate("EUR", 2, "1.1") }],
    });
    expect(result.targetCreditMinor).toBe(5_000);
    expect(result.sourceDebits).toMatchObject([{ currency: "EUR", amountMinor: 4_546, convertedTargetMinor: 5_000 }]);
  });

  it("combines multiple wallets in stable currency order without exceeding their balances", () => {
    const result = planCrossWalletFunding({
      requiredTargetMinor: 10_000,
      targetAvailableMinor: 5_000,
      targetRate: rate("USD", 2, "1"),
      sourceWallets: [
        { currency: "GBP", scale: 2, availableMinor: 2_000, rate: rate("GBP", 2, "1.25") },
        { currency: "EUR", scale: 2, availableMinor: 3_000, rate: rate("EUR", 2, "1.1") },
      ],
    });
    expect(result.targetCreditMinor).toBe(5_000);
    expect(result.sourceDebits.map(x => x.currency)).toEqual(["EUR", "GBP"]);
    expect(result.sourceDebits.reduce((sum, x) => sum + x.convertedTargetMinor, 0)).toBe(5_000);
    expect(result.sourceDebits.every(x => x.amountMinor <= (x.currency === "EUR" ? 3_000 : 2_000))).toBe(true);
  });

  it("fails closed when combined spendable balances cannot cover the target capital", () => {
    expect(() => planCrossWalletFunding({
      requiredTargetMinor: 10_000,
      targetAvailableMinor: 9_000,
      targetRate: rate("USD", 2, "1"),
      sourceWallets: [{ currency: "EUR", scale: 2, availableMinor: 10, rate: rate("EUR", 2, "1.1") }],
    })).toThrow(/Insufficient combined/);
  });

  it("rejects invalid scales and stale/missing source rates rather than guessing", () => {
    expect(() => planCrossWalletFunding({
      requiredTargetMinor: 100, targetAvailableMinor: 0,
      targetRate: rate("USD", 2, "1"),
      sourceWallets: [{ currency: "BTC", scale: 30, availableMinor: 100, rate: rate("BTC", 30, "100000") }],
    })).toThrow(/scale/);
    expect(() => planCrossWalletFunding({
      requiredTargetMinor: 100, targetAvailableMinor: 0,
      targetRate: rate("USD", 2, "1"),
      sourceWallets: [{ currency: "EUR", scale: 2, availableMinor: 100, rate: null }],
    })).toThrow(/Insufficient combined/);
  });

  it("rejects FX snapshots whose currency or scale does not match the wallet", () => {
    expect(() => planCrossWalletFunding({
      requiredTargetMinor: 100, targetAvailableMinor: 0,
      targetRate: rate("USD", 2, "1"),
      sourceWallets: [{ currency: "EUR", scale: 2, availableMinor: 1_000, rate: rate("GBP", 2, "1.25") }],
    })).toThrow(/does not match source wallet currency/);
    expect(() => planCrossWalletFunding({
      requiredTargetMinor: 100, targetAvailableMinor: 0,
      targetRate: rate("USD", 2, "1"),
      sourceWallets: [{ currency: "EUR", scale: 2, availableMinor: 1_000, rate: rate("EUR", 3, "1.1") }],
    })).toThrow(/does not match source wallet scale/);
  });

  it("rejects duplicate source currency wallets rather than planning ambiguous debits", () => {
    expect(() => planCrossWalletFunding({
      requiredTargetMinor: 100, targetAvailableMinor: 0,
      targetRate: rate("USD", 2, "1"),
      sourceWallets: [
        { currency: "EUR", scale: 2, availableMinor: 100, rate: rate("EUR", 2, "1.1") },
        { currency: "eur", scale: 2, availableMinor: 100, rate: rate("EUR", 2, "1.1") },
      ],
    })).toThrow(/Duplicate source wallet currency/);
  });
});
