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
  realizedGrossProfitMinor?: number;
  platformFeeMinor?: number;
  netProfitMinor?: number;
  grossProfitLedgerCount?: number;
  grossProfitLedgerAmountMinor?: number | null;
  platformFeeLedgerCount?: number;
  platformFeeLedgerAmountMinor?: number | null;
  realizedLossLedgerCount?: number;
  realizedLossLedgerAmountMinor?: number | null;
  settlementOutcome?: string;
  feePolicyVersion?: number;
  platformFeeRateBps?: number;
  platformFeeRoundingMode?: string;
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
    ...(evidence.grossProfitLedgerCount === undefined ? [] : [evidence.grossProfitLedgerCount]),
    ...(evidence.platformFeeLedgerCount === undefined ? [] : [evidence.platformFeeLedgerCount]),
    ...(evidence.realizedLossLedgerCount === undefined ? [] : [evidence.realizedLossLedgerCount]),
    ...(evidence.realizedGrossProfitMinor === undefined ? [] : [evidence.realizedGrossProfitMinor]),
    ...(evidence.platformFeeMinor === undefined ? [] : [evidence.platformFeeMinor]),
    ...(evidence.netProfitMinor === undefined ? [] : [evidence.netProfitMinor]),
    ...(evidence.feePolicyVersion === undefined ? [] : [evidence.feePolicyVersion]),
    ...(evidence.platformFeeRateBps === undefined ? [] : [evidence.platformFeeRateBps]),
  ];
  const optionalLedgerAmounts = [
    evidence.grossProfitLedgerAmountMinor,
    evidence.platformFeeLedgerAmountMinor,
    evidence.realizedLossLedgerAmountMinor,
  ].filter((value): value is number => value !== undefined && value !== null);
  if (
    amounts.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    (evidence.principalLedgerAmountMinor !== null &&
      (!Number.isSafeInteger(evidence.principalLedgerAmountMinor) ||
        evidence.principalLedgerAmountMinor < 0)) ||
    (evidence.rewardLedgerAmountMinor !== null &&
      (!Number.isSafeInteger(evidence.rewardLedgerAmountMinor) ||
        evidence.rewardLedgerAmountMinor < 0)) ||
    optionalLedgerAmounts.some((value) => !Number.isSafeInteger(value)) ||
    (evidence.platformFeeMinor !== undefined && evidence.platformFeeMinor < 0) ||
    (evidence.platformFeeRateBps !== undefined && evidence.platformFeeRateBps < 0) ||
    (evidence.feePolicyVersion !== undefined && evidence.feePolicyVersion < 1) ||
    (evidence.platformFeeRoundingMode !== undefined &&
      !["half_up", "half_even", "floor", "ceil", "trunc"].includes(evidence.platformFeeRoundingMode))
  ) {
    return result("MANUAL_FINANCIAL_REVIEW", [
      "Evidence contains invalid or unsafe integer values.",
    ]);
  }

  if (evidence.principalLedgerCount > 1 || evidence.rewardLedgerCount > 1 ||
      (evidence.grossProfitLedgerCount ?? 0) > 1 ||
      (evidence.platformFeeLedgerCount ?? 0) > 1 ||
      (evidence.realizedLossLedgerCount ?? 0) > 1) {
    return result("MANUAL_FINANCIAL_REVIEW", [
      "Duplicate ledger entries exist for a settlement component.",
    ]);
  }

  const hasGrossProfitEvidence = evidence.grossProfitLedgerCount !== undefined;
  const rewardCount = hasGrossProfitEvidence ? evidence.grossProfitLedgerCount! : evidence.rewardLedgerCount;
  const rewardAmount = hasGrossProfitEvidence ? evidence.grossProfitLedgerAmountMinor ?? null : evidence.rewardLedgerAmountMinor;
  const hasAnySettlementLedger =
    evidence.principalLedgerCount > 0 || rewardCount > 0 ||
    (evidence.platformFeeLedgerCount ?? 0) > 0 || (evidence.realizedLossLedgerCount ?? 0) > 0;
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

  if (hasGrossProfitEvidence) {
    const gross = evidence.realizedGrossProfitMinor;
    const fee = evidence.platformFeeMinor;
    if (evidence.settlementOutcome === "legacy_unrecorded") {
      reasons.push("Historical settlement result is explicitly unrecorded; migration-default zero values are not proof of a zero-profit outcome.");
    } else if (gross === undefined || fee === undefined || evidence.netProfitMinor === undefined ||
        ![gross, fee, evidence.netProfitMinor].every((value) => Number.isSafeInteger(value))) {
      reasons.push("Realized gross profit, fee, or net-profit snapshot is missing or unsafe.");
    } else {
      if (evidence.platformFeeMinor! > gross && gross > 0) {
        reasons.push("Recorded platform fee exceeds positive realized gross profit.");
      }
      if (evidence.netProfitMinor !== gross - evidence.platformFeeMinor!) {
        reasons.push("Recorded net profit does not equal realized gross profit less the recorded fee.");
      }
      if (gross <= 0 && evidence.platformFeeMinor !== 0) {
        reasons.push("Zero-profit and loss outcomes must not incur a positive-profit platform fee.");
      }
      if (evidence.settlementOutcome !== undefined) {
        const expectedOutcome = gross > 0 ? "profit" : gross < 0 ? "loss" : "zero_profit";
        if (evidence.settlementOutcome !== expectedOutcome) {
          reasons.push("Settlement outcome does not agree with the recorded realized gross result.");
        }
      }
      if (evidence.platformFeeRateBps !== undefined && evidence.platformFeeRateBps > 10000) {
        reasons.push("Stored platform fee rate exceeds 100 percent.");
      }
      const expectedGrossCount = gross > 0 ? 1 : 0;
      if (rewardCount !== expectedGrossCount) reasons.push("Gross-profit ledger count does not match the recorded realized outcome.");
      else if (expectedGrossCount === 1 && rewardAmount !== gross) reasons.push("Gross-profit ledger amount does not match realized gross profit.");
      const feeCount = evidence.platformFeeLedgerCount;
      const feeAmount = evidence.platformFeeLedgerAmountMinor;
      if (feeCount === undefined || (feeCount !== (fee > 0 ? 1 : 0))) {
        reasons.push("Platform-fee ledger count does not match the recorded fee.");
      } else if (fee > 0 && feeAmount !== -fee) {
        reasons.push("Platform-fee ledger amount must be the negative recorded fee.");
      }
      const lossCount = evidence.realizedLossLedgerCount;
      const lossAmount = evidence.realizedLossLedgerAmountMinor;
      if (lossCount === undefined || lossCount !== (gross < 0 ? 1 : 0)) {
        reasons.push("Realized-loss ledger count does not match the recorded outcome.");
      } else if (gross < 0 && lossAmount !== gross) {
        reasons.push("Realized-loss ledger amount does not match realized gross loss.");
      }
      if (evidence.rewardCreditedMinor !== Math.max(0, evidence.netProfitMinor)) {
        reasons.push("Recorded credited reward does not match positive net profit after the stored fee.");
      }
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
