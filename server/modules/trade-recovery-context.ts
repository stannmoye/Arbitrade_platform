import type { TradeRecoveryPlan } from "./trade-recovery-planner";

export type TradeRecoveryCollectorContext = {
  walletMatchCount: number;
  reservationCount: number;
  identityMismatchedLedgerRows: unknown[];
  currency?: string;
  rewardReservationStatus?: string | null;
  reservation?: Array<{
    id: number;
    status: string;
    reservedMinor: number;
    currency: string;
  }>;
  wallet?: {
    id: number;
    availableMinor: number;
    lockedMinor: number;
    promotionalMinor: number;
    earnedMinor: number;
  } | null;
  scanCoverage?: {
    requestedLimit: number;
    selectedTradeCount: number;
    totalTradeCount: number;
    complete: boolean;
  };
};

export function applyRecoveryContextSafety(
  plan: TradeRecoveryPlan,
  context: TradeRecoveryCollectorContext,
): TradeRecoveryPlan {
  const reasons: string[] = [];
  if (
    !Number.isSafeInteger(context.walletMatchCount) ||
    context.walletMatchCount < 0 ||
    !Number.isSafeInteger(context.reservationCount) ||
    context.reservationCount < 0 ||
    !Array.isArray(context.identityMismatchedLedgerRows)
  ) {
    reasons.push("Collector context contains invalid wallet/reservation counts or malformed ledger identity evidence.");
  }
  if (context.walletMatchCount !== 1) {
    reasons.push("Expected exactly one wallet row for the trade user and currency; inspect wallet identity and schema evidence.");
  }
  if (context.reservationCount > 1) {
    reasons.push("Duplicate reward reservation rows exist for this trade.");
  }
  if (context.identityMismatchedLedgerRows.length > 0) {
    reasons.push("Ledger rows share a settlement reference but do not match the trade user and currency.");
  }
  if (context.wallet !== undefined) {
    if (context.walletMatchCount === 1 && context.wallet === null) {
      reasons.push("Collector reports one wallet match but did not provide its balance snapshot.");
    } else if (context.wallet !== null) {
      const walletValues = [
        context.wallet.id,
        context.wallet.availableMinor,
        context.wallet.lockedMinor,
        context.wallet.promotionalMinor,
        context.wallet.earnedMinor,
      ];
      if (walletValues.some((value) => !Number.isSafeInteger(value) || value < 0) ||
          context.wallet.id < 1) {
        reasons.push("Wallet snapshot contains negative or unsafe identifier/balance values.");
      }
    }
  }
  if (context.reservation !== undefined) {
    if (!Array.isArray(context.reservation) || context.reservation.length !== context.reservationCount) {
      reasons.push("Reservation rows do not match the collector's reservation count.");
    } else if (context.reservation.length === 1) {
      const reservation = context.reservation[0];
      if (!Number.isSafeInteger(reservation.id) || reservation.id < 1 ||
          !Number.isSafeInteger(reservation.reservedMinor) || reservation.reservedMinor < 0 ||
          typeof reservation.status !== "string" || !reservation.status ||
          typeof reservation.currency !== "string" || !reservation.currency) {
        reasons.push("Reward reservation snapshot contains invalid identity, amount, status, or currency.");
      }
      if (context.currency !== undefined && reservation.currency !== context.currency) {
        reasons.push("Reward reservation currency does not match the trade currency.");
      }
      if (context.rewardReservationStatus !== undefined &&
          reservation.status !== context.rewardReservationStatus) {
        reasons.push("Reward reservation status does not match the classifier evidence.");
      }
    }
  }
  if (context.scanCoverage !== undefined) {
    const coverage = context.scanCoverage;
    if (
      !Number.isSafeInteger(coverage.requestedLimit) || coverage.requestedLimit < 1 ||
      !Number.isSafeInteger(coverage.selectedTradeCount) || coverage.selectedTradeCount < 0 ||
      !Number.isSafeInteger(coverage.totalTradeCount) || coverage.totalTradeCount < 0 ||
      typeof coverage.complete !== "boolean" ||
      coverage.selectedTradeCount > coverage.totalTradeCount ||
      coverage.selectedTradeCount > coverage.requestedLimit ||
      coverage.complete !== (coverage.selectedTradeCount === coverage.totalTradeCount)
    ) {
      reasons.push("Collector scan coverage metadata is invalid or internally inconsistent.");
    } else if (!coverage.complete) {
      reasons.push(
        `Recovery evidence is incomplete: collected ${coverage.selectedTradeCount} of ${coverage.totalTradeCount} trades (limit ${coverage.requestedLimit}); do not treat this sample as a complete integrity scan.`,
      );
    }
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
