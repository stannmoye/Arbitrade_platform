import { describe, expect, it } from "vitest";
import { calculateTradeSettlement } from "./trade-settlement";

describe("trade settlement wallet routing", () => {
  it("returns principal plus earnings to the originating wallet currency", () => {
    expect(calculateTradeSettlement({ currency: "usd", principalMinor: 50000, rewardMinor: 5000 })).toEqual({
      walletCurrency: "USD",
      principalMinor: 50000,
      rewardMinor: 5000,
      totalMinor: 55000,
    });
  });

  it("does not redirect proceeds when the customer has other wallets", () => {
    const settlement = calculateTradeSettlement({ currency: "ETH", principalMinor: 125000000, rewardMinor: 2500000 });
    expect(settlement.walletCurrency).toBe("ETH");
    expect(settlement.totalMinor).toBe(127500000);
  });

  it("rejects invalid minor-unit amounts", () => {
    expect(() => calculateTradeSettlement({ currency: "USD", principalMinor: -1, rewardMinor: 1 })).toThrow();
    expect(() => calculateTradeSettlement({ currency: "USD", principalMinor: 1, rewardMinor: 1.5 })).toThrow();
  });
});
