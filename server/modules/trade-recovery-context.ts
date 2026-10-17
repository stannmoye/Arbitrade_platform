import type { TradeRecoveryPlan } from "./trade-recovery-planner";

export type TradeRecoveryCollectorContext = {
  walletMatchCount: number;
  reservationCount: number;
  identityMismatchedLedgerRows: unknown[];
};

export function applyRecoveryContextSafety(
  plan: TradeRecoveryPlan,
  context: TradeRecoveryCollectorContext,
): TradeRecoveryPlan {
  const reasons: string[] = [];
  if (context.walletMatchCount !== 1) {
    reasons.push("Expected exactly one wallet row for the trade user and currency; inspect wallet identity and schema evidence.");
  }
  if (context.reservationCount > 1) {
    reasons.push("Duplicate reward reservation rows exist for this trade.");
  }
  if (context.identityMismatchedLedgerRows.length > 0) {
    reasons.push("Ledger rows share a settlement reference but do not match the trade user and currency.");
  }
  if (reasons.length === 0) return plan;

  return {
    ...plan,
    classification: "MANUAL_FINANCIAL_REVIEW",
    nextStep: "STOP_AND_RECONCILE_WALLET_AND_LEDGER",
    reasons: [...plan.reasons, ...reasons],
    automatedMutationAllowed: false,
    plannedMutations: [],
    requiresHumanReview: true,
  };
}
