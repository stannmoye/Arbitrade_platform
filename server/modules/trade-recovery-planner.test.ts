import { describe, expect, it } from "vitest";
import { buildTradeRecoveryPlan } from "./trade-recovery-planner";
import type { TradeRecoveryEvidence } from "./trade-recovery-classification";

const consistentEvidence = (overrides: Partial<TradeRecoveryEvidence> = {}): TradeRecoveryEvidence => ({
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
  ...overrides,
});

describe("read-only trade recovery planner", () => {
  it("creates a no-write plan when supplied evidence is consistent", () => {
    const plan = buildTradeRecoveryPlan({ tradeId: 42, evidence: consistentEvidence() });
    expect(plan).toMatchObject({
      tradeId: 42,
      classification: "NO_ACTION",
      automatedMutationAllowed: false,
      plannedMutations: [],
      nextStep: "VERIFY_AUDIT_COVERAGE_BEFORE_CLOSING",
      requiresHumanReview: true,
    });
  });

  it("limits missing lifecycle metadata to a non-financial review", () => {
    const plan = buildTradeRecoveryPlan({
      tradeId: "trade-7",
      evidence: consistentEvidence({ lifecycleEventCount: 0, walletUpdatedAtPresent: false }),
    });
    expect(plan.classification).toBe("STATUS_REVIEW_ONLY");
    expect(plan.nextStep).toBe("REVIEW_NON_FINANCIAL_METADATA_ONLY");
    expect(plan.plannedMutations).toEqual([]);
  });

  it("stops for missing principal ledger evidence rather than suggesting a credit", () => {
    const plan = buildTradeRecoveryPlan({
      tradeId: 8,
      evidence: consistentEvidence({ principalLedgerCount: 0, principalLedgerAmountMinor: null }),
    });
    expect(plan.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(plan.nextStep).toBe("STOP_AND_RECONCILE_WALLET_AND_LEDGER");
    expect(plan.plannedMutations).toEqual([]);
  });

  it("stops when an unsettled trade has settlement ledger evidence", () => {
    const plan = buildTradeRecoveryPlan({
      tradeId: 9,
      evidence: consistentEvidence({ tradeStatus: "confirmed", settlementStatus: "pending" }),
    });
    expect(plan.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(plan.automatedMutationAllowed).toBe(false);
  });

  it("stops when duplicate ledger evidence is present", () => {
    const plan = buildTradeRecoveryPlan({
      tradeId: 10,
      evidence: consistentEvidence({ rewardLedgerCount: 2 }),
    });
    expect(plan.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(plan.plannedMutations).toEqual([]);
  });

  it("never proposes any mutation for any classification", () => {
    const samples = [
      consistentEvidence(),
      consistentEvidence({ lifecycleEventCount: 0 }),
      consistentEvidence({ principalLedgerCount: 0, principalLedgerAmountMinor: null }),
    ];
    for (const evidence of samples) {
      const plan = buildTradeRecoveryPlan({ tradeId: 1, evidence });
      expect(plan.automatedMutationAllowed).toBe(false);
      expect(plan.plannedMutations).toEqual([]);
      expect(plan.requiresHumanReview).toBe(true);
    }
  });
});
