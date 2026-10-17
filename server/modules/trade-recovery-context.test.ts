import { describe, expect, it } from "vitest";
import { applyRecoveryContextSafety } from "./trade-recovery-context";
import { buildTradeRecoveryPlan } from "./trade-recovery-planner";
import type { TradeRecoveryEvidence } from "./trade-recovery-classification";

const evidence: TradeRecoveryEvidence = {
  tradeStatus: "settled",
  settlementStatus: "completed",
  principalMinor: 10000,
  rewardCreditedMinor: 500,
  settlementReference: "settlement-123",
  principalLedgerCount: 1,
  principalLedgerAmountMinor: 10000,
  rewardLedgerCount: 1,
  rewardLedgerAmountMinor: 500,
  rewardReservationStatus: "credited",
  lifecycleEventCount: 2,
  walletUpdatedAtPresent: true,
};
const plan = () => buildTradeRecoveryPlan({ tradeId: 42, evidence });
const healthyContext = { walletMatchCount: 1, reservationCount: 1, identityMismatchedLedgerRows: [] };

describe("trade recovery collector context safety", () => {
  it("preserves the plan when collector identity counts are unambiguous", () => {
    expect(applyRecoveryContextSafety(plan(), healthyContext).classification).toBe("NO_ACTION");
  });

  it("escalates when the wallet row is missing or duplicated", () => {
    for (const walletMatchCount of [0, 2]) {
      const result = applyRecoveryContextSafety(plan(), { ...healthyContext, walletMatchCount });
      expect(result.classification).toBe("MANUAL_FINANCIAL_REVIEW");
      expect(result.nextStep).toBe("STOP_AND_RECONCILE_WALLET_AND_LEDGER");
      expect(result.plannedMutations).toEqual([]);
    }
  });

  it("escalates duplicate reservations", () => {
    const result = applyRecoveryContextSafety(plan(), { ...healthyContext, reservationCount: 2 });
    expect(result.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(result.reasons.join(" ")).toContain("Duplicate reward reservation");
  });

  it("escalates ledger rows whose user or currency does not match", () => {
    const result = applyRecoveryContextSafety(plan(), {
      ...healthyContext,
      identityMismatchedLedgerRows: [{ id: 7 }],
    });
    expect(result.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(result.automatedMutationAllowed).toBe(false);
  });
});
