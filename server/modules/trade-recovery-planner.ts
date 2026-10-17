import { classifyTradeRecoveryEvidence, type TradeRecoveryEvidence } from "./trade-recovery-classification";

export type TradeRecoveryPlan = {
  tradeId: string | number;
  classification: "NO_ACTION" | "STATUS_REVIEW_ONLY" | "MANUAL_FINANCIAL_REVIEW";
  automatedMutationAllowed: false;
  plannedMutations: [];
  nextStep:
    | "VERIFY_AUDIT_COVERAGE_BEFORE_CLOSING"
    | "REVIEW_NON_FINANCIAL_METADATA_ONLY"
    | "STOP_AND_RECONCILE_WALLET_AND_LEDGER";
  requiresHumanReview: true;
  reasons: string[];
};

/**
 * Build a conservative recovery plan from already-collected evidence.
 * This function does not query a database and never proposes writes.
 */
export function buildTradeRecoveryPlan(input: {
  tradeId: string | number;
  evidence: TradeRecoveryEvidence;
}): TradeRecoveryPlan {
  const classification = classifyTradeRecoveryEvidence(input.evidence);
  const nextStep: TradeRecoveryPlan["nextStep"] =
    classification.classification === "NO_ACTION"
      ? "VERIFY_AUDIT_COVERAGE_BEFORE_CLOSING"
      : classification.classification === "STATUS_REVIEW_ONLY"
        ? "REVIEW_NON_FINANCIAL_METADATA_ONLY"
        : "STOP_AND_RECONCILE_WALLET_AND_LEDGER";

  return {
    tradeId: input.tradeId,
    classification: classification.classification,
    automatedMutationAllowed: false,
    plannedMutations: [],
    nextStep,
    requiresHumanReview: true,
    reasons: [...classification.reasons],
  };
}
