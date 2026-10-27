export type FeeRoundingMode = "half_up" | "down" | "up" | "half_even";

export type RealizedProfitSettlement = {
  principalMinor: number;
  grossProfitMinor: number;
  platformFeeMinor: number;
  netProfitMinor: number;
  totalReturnedMinor: number;
  rewardCreditedMinor: number;
  outcome: "profit" | "zero_profit" | "loss";
};

function roundFee(numerator: bigint, denominator: bigint, mode: FeeRoundingMode): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n || mode === "down") return quotient;
  if (mode === "up") return quotient + 1n;
  const doubled = remainder * 2n;
  if (doubled > denominator) return quotient + 1n;
  if (doubled < denominator) return quotient;
  if (mode === "half_up") return quotient + 1n;
  return quotient % 2n === 1n ? quotient + 1n : quotient;
}

/**
 * Calculates the customer ledger effect from an actual recorded settlement.
 * An expected/reserved reward is not an input and cannot become a realized result.
 */
export function calculateRealizedProfitSettlement(input: {
  principalMinor: number;
  grossProfitMinor: number;
  feeRateBps: number;
  roundingMode: FeeRoundingMode;
}): RealizedProfitSettlement {
  if (!Number.isSafeInteger(input.principalMinor) || input.principalMinor <= 0) {
    throw new RangeError("Trade principal must be a positive safe integer");
  }
  if (!Number.isSafeInteger(input.grossProfitMinor)) {
    throw new RangeError("Actual gross profit or loss must be a safe integer");
  }
  if (!Number.isInteger(input.feeRateBps) || input.feeRateBps < 0 || input.feeRateBps > 10000) {
    throw new RangeError("Platform fee rate must be between 0 and 10000 basis points");
  }
  if (!["half_up", "down", "up", "half_even"].includes(input.roundingMode)) {
    throw new RangeError("Unsupported platform fee rounding mode");
  }
  if (input.grossProfitMinor < -input.principalMinor) {
    throw new RangeError("Realized loss exceeds the committed principal; this trade has no approved leveraged-loss policy");
  }

  const gross = BigInt(input.grossProfitMinor);
  const positiveGross = gross > 0n ? gross : 0n;
  const fee = roundFee(positiveGross * BigInt(input.feeRateBps), 10000n, input.roundingMode);
  const net = gross - fee;
  const total = BigInt(input.principalMinor) + net;
  const values = [fee, net, total];
  if (values.some(value => value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))) {
    throw new RangeError("Settlement value exceeds safe ledger integer precision");
  }
  if (total < 0n) throw new RangeError("Settlement would create a negative wallet balance");

  const netProfitMinor = Number(net);
  return {
    principalMinor: input.principalMinor,
    grossProfitMinor: input.grossProfitMinor,
    platformFeeMinor: Number(fee),
    netProfitMinor,
    totalReturnedMinor: Number(total),
    rewardCreditedMinor: Math.max(0, netProfitMinor),
    outcome: input.grossProfitMinor > 0 ? "profit" : input.grossProfitMinor < 0 ? "loss" : "zero_profit",
  };
}

/**
 * Validate and calculate the locked-wallet update before settlement postings.
 * BigInt keeps the additions exact; returned values are safe to persist through
 * Drizzle's number-mode BIGINT columns and the application's minor-unit APIs.
 */
export function calculateSettlementWalletBalanceUpdate(
  current: { availableMinor: number; lockedMinor: number; earnedMinor: number },
  settlement: Pick<RealizedProfitSettlement, "principalMinor" | "totalReturnedMinor" | "netProfitMinor">,
) {
  if (!Number.isSafeInteger(current.availableMinor) || current.availableMinor < 0) {
    throw new RangeError("Settlement wallet available balance is invalid or outside safe integer precision");
  }
  if (!Number.isSafeInteger(current.lockedMinor) || current.lockedMinor < settlement.principalMinor) {
    throw new Error("Settlement wallet locked balance is inconsistent with the trade principal");
  }
  if (!Number.isSafeInteger(current.earnedMinor)) {
    throw new RangeError("Settlement wallet earned balance is outside safe integer precision");
  }
  if (
    !Number.isSafeInteger(settlement.principalMinor) || settlement.principalMinor <= 0 ||
    !Number.isSafeInteger(settlement.totalReturnedMinor) || settlement.totalReturnedMinor < 0 ||
    !Number.isSafeInteger(settlement.netProfitMinor)
  ) {
    throw new RangeError("Settlement wallet update contains invalid minor-unit values");
  }

  const nextAvailableMinor = BigInt(current.availableMinor) + BigInt(settlement.totalReturnedMinor);
  const nextLockedMinor = BigInt(current.lockedMinor) - BigInt(settlement.principalMinor);
  const nextEarnedMinor = BigInt(current.earnedMinor) + BigInt(settlement.netProfitMinor);
  const safeMin = BigInt(Number.MIN_SAFE_INTEGER);
  const safeMax = BigInt(Number.MAX_SAFE_INTEGER);
  if (
    nextAvailableMinor < 0n || nextLockedMinor < 0n ||
    [nextAvailableMinor, nextLockedMinor, nextEarnedMinor].some(value => value < safeMin || value > safeMax)
  ) {
    throw new RangeError("Settlement wallet balance update exceeds safe integer precision");
  }

  return {
    availableMinor: Number(nextAvailableMinor),
    lockedMinor: Number(nextLockedMinor),
    earnedMinor: Number(nextEarnedMinor),
  };
}
