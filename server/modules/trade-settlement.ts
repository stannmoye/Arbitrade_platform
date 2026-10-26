export type TradeSettlementInput = {
  currency: string;
  principalMinor: number;
  rewardMinor: number;
};

/**
 * A trade always settles back into the wallet currency recorded at allocation time.
 * This prevents a later currency-registry or UI selection from redirecting proceeds.
 */
export function calculateTradeSettlement(input: TradeSettlementInput) {
  const currency = input.currency.trim().toUpperCase();
  if (!currency) throw new Error("Trade settlement currency is required");
  if (!Number.isSafeInteger(input.principalMinor) || input.principalMinor < 0) {
    throw new Error("Trade principal must be a non-negative integer in minor units");
  }
  if (!Number.isSafeInteger(input.rewardMinor) || input.rewardMinor < 0) {
    throw new Error("Trade reward must be a non-negative integer in minor units");
  }
  const totalMinor = input.principalMinor + input.rewardMinor;
  if (!Number.isSafeInteger(totalMinor)) {
    throw new RangeError("Trade settlement total exceeds safe integer precision");
  }
  return {
    walletCurrency: currency,
    principalMinor: input.principalMinor,
    rewardMinor: input.rewardMinor,
    totalMinor,
  };
}
