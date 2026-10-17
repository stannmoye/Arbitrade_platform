export type TradeRecoveryEvidence = {
  tradeStatus: "pending" | "confirmed" | "settled" | "cancelled" | string;
  settlementStatus: string;
  principalMinor: number;
  rewardCreditedMinor: number;
  settlementReference: string | null;
  principalLedgerCount: number;
  principalLedgerAmountMinor: number | null;
  rewardLedgerCount: number;
  rewardLedgerAmountMinor: number | null;
  rewardReservationStatus: "reserved" | "credited" | "released" | string | null;
  lifecycleEventCount: number;
  walletUpdatedAtPresent: boolean;
};

export type TradeRecoveryClassification = {
  classification: "NO_ACTION" | "STATUS_REVIEW_ONLY" | "MANUAL_FINANCIAL_REVIEW";
  automatedMutationAllowed: false;
  reasons: string[];
};

/**
 * Classify interrupted trade evidence without performing recovery.
 *
 * This intentionally never authorizes balance, ledger, trade, or reservation writes.
 * Any ambiguity around money movement is escalated for manual reconciliation.
 */
export function classifyTradeRecoveryEvidence(
  evidence: TradeRecoveryEvidence,
): TradeRecoveryClassification {
  const reasons: string[] = [];
  const result = (
    classification: TradeRecoveryClassification["classification"],
    reasonList: string[],
  ): TradeRecoveryClassification => ({
    classification,
    automatedMutationAllowed: false,
    reasons: reasonList,
  });

  const amounts = [
    evidence.principalMinor,
    evidence.rewardCreditedMinor,
    evidence.principalLedgerCount,
    evidence.rewardLedgerCount,
    evidence.lifecycleEventCount,
  ];
  if (
    amounts.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    (evidence.principalLedgerAmountMinor !== null &&
      (!Number.isSafeInteger(evidence.principalLedgerAmountMinor) ||
        evidence.principalLedgerAmountMinor < 0)) ||
    (evidence.rewardLedgerAmountMinor !== null &&
      (!Number.isSafeInteger(evidence.rewardLedgerAmountMinor) ||
        evidence.rewardLedgerAmountMinor < 0))
  ) {
    return result("MANUAL_FINANCIAL_REVIEW", [
      "Evidence contains invalid or unsafe integer values.",
    ]);
  }

  if (evidence.principalLedgerCount > 1 || evidence.rewardLedgerCount > 1) {
    return result("MANUAL_FINANCIAL_REVIEW", [
      "Duplicate ledger entries exist for a settlement component.",
    ]);
  }

  const hasAnySettlementLedger =
    evidence.principalLedgerCount > 0 || evidence.rewardLedgerCount > 0;
  if (evidence.tradeStatus !== "settled") {
    if (
      hasAnySettlementLedger ||
      evidence.rewardReservationStatus === "credited" ||
      evidence.settlementStatus === "completed"
    ) {
      return result("MANUAL_FINANCIAL_REVIEW", [
        "Financial settlement evidence exists while the trade is not marked settled.",
        "Do not replay credits or release principal until wallet and ledger balances are reconciled.",
      ]);
    }

    if (evidence.lifecycleEventCount === 0) {
      return result("STATUS_REVIEW_ONLY", [
        "Trade has no lifecycle event evidence.",
        "No settlement ledger movement is visible in the supplied evidence; verify the complete ledger before any action.",
      ]);
    }
    return result("NO_ACTION", [
      "Trade is not settled and no conflicting settlement evidence was supplied.",
    ]);
  }

  if (evidence.settlementStatus !== "completed") {
    reasons.push("Trade status is settled but settlementStatus is not completed.");
  }
  if (!evidence.settlementReference?.trim()) {
    reasons.push("Settled trade has no settlement reference.");
  }
  if (evidence.principalLedgerCount !== 1) {
    reasons.push("Settled trade must have exactly one matching principal-release ledger entry.");
  } else if (evidence.principalLedgerAmountMinor !== evidence.principalMinor) {
    reasons.push("Principal-release ledger amount does not match the trade principal.");
  }

  if (evidence.rewardCreditedMinor > 0) {
    if (evidence.rewardLedgerCount !== 1) {
      reasons.push("Credited reward requires exactly one matching reward ledger entry.");
    } else if (evidence.rewardLedgerAmountMinor !== evidence.rewardCreditedMinor) {
      reasons.push("Reward ledger amount does not match the recorded credited reward.");
    }
    if (evidence.rewardReservationStatus === "reserved") {
      reasons.push("Reward reservation remains reserved after settlement.");
    }
  } else if (evidence.rewardLedgerCount !== 0) {
    reasons.push("Reward ledger entry exists although the trade records no credited reward.");
  }

  if (evidence.rewardReservationStatus === "reserved") {
    reasons.push("Reward reservation is still reserved for a settled trade.");
  }
  if (reasons.length > 0) {
    return result("MANUAL_FINANCIAL_REVIEW", reasons);
  }

  if (evidence.lifecycleEventCount === 0) {
    reasons.push("Trade has no lifecycle event evidence.");
  }
  if (!evidence.walletUpdatedAtPresent) {
    reasons.push("Trade is missing walletUpdatedAt evidence.");
  }
  if (reasons.length > 0) {
    return result("STATUS_REVIEW_ONLY", reasons);
  }

  return result("NO_ACTION", [
    "Supplied settlement, principal ledger, reward ledger, and reservation evidence is internally consistent.",
  ]);
}
