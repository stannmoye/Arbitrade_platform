import { describe, expect, it } from "vitest";
import { classifyTradeRecoveryEvidence, type TradeRecoveryEvidence } from "./trade-recovery-classification";

const settledEvidence = (overrides: Partial<TradeRecoveryEvidence> = {}): TradeRecoveryEvidence => ({
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

describe("trade recovery evidence classification (read-only)", () => {
  it("does not recommend action when all supplied evidence agrees", () => {
    const result = classifyTradeRecoveryEvidence(settledEvidence());
    expect(result.classification).toBe("NO_ACTION");
    expect(result.automatedMutationAllowed).toBe(false);
  });

  it("escalates a settled trade with missing principal release evidence", () => {
    const result = classifyTradeRecoveryEvidence(settledEvidence({
      principalLedgerCount: 0,
      principalLedgerAmountMinor: null,
    }));
    expect(result.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(result.reasons.join(" ")).toContain("principal-release ledger entry");
  });

  it("escalates amount mismatches rather than creating another ledger entry", () => {
    const result = classifyTradeRecoveryEvidence(settledEvidence({ principalLedgerAmountMinor: 9999 }));
    expect(result.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(result.automatedMutationAllowed).toBe(false);
  });

  it("escalates duplicate principal or reward ledger entries", () => {
    expect(classifyTradeRecoveryEvidence(settledEvidence({ principalLedgerCount: 2 })).classification)
      .toBe("MANUAL_FINANCIAL_REVIEW");
    expect(classifyTradeRecoveryEvidence(settledEvidence({ rewardLedgerCount: 2 })).classification)
      .toBe("MANUAL_FINANCIAL_REVIEW");
  });

  it("escalates ledger movement on an unsettled trade to prevent duplicate recovery", () => {
    const result = classifyTradeRecoveryEvidence(settledEvidence({
      tradeStatus: "confirmed",
      settlementStatus: "pending",
    }));
    expect(result.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(result.reasons.join(" ")).toContain("not marked settled");
  });

  it("treats missing lifecycle or wallet timestamp as status review only when ledger evidence is complete", () => {
    const result = classifyTradeRecoveryEvidence(settledEvidence({
      lifecycleEventCount: 0,
      walletUpdatedAtPresent: false,
    }));
    expect(result.classification).toBe("STATUS_REVIEW_ONLY");
    expect(result.automatedMutationAllowed).toBe(false);
  });

  it("does not require a reward ledger entry when credited reward is zero", () => {
    const result = classifyTradeRecoveryEvidence(settledEvidence({
      rewardCreditedMinor: 0,
      rewardLedgerCount: 0,
      rewardLedgerAmountMinor: null,
      rewardReservationStatus: "released",
    }));
    expect(result.classification).toBe("NO_ACTION");
  });

  it("escalates a settled trade with a still-reserved reward", () => {
    expect(classifyTradeRecoveryEvidence(settledEvidence({ rewardReservationStatus: "reserved" })).classification)
      .toBe("MANUAL_FINANCIAL_REVIEW");
  });

  it("escalates malformed or unsafe evidence instead of trusting it", () => {
    expect(classifyTradeRecoveryEvidence(settledEvidence({ principalMinor: Number.MAX_SAFE_INTEGER + 1 })).classification)
      .toBe("MANUAL_FINANCIAL_REVIEW");
    expect(classifyTradeRecoveryEvidence(settledEvidence({ rewardLedgerAmountMinor: -1 })).classification)
      .toBe("MANUAL_FINANCIAL_REVIEW");
  });

  it("never authorizes automated writes for any classification", () => {
    const examples = [
      settledEvidence(),
      settledEvidence({ principalLedgerCount: 0, principalLedgerAmountMinor: null }),
      settledEvidence({ lifecycleEventCount: 0 }),
      settledEvidence({ tradeStatus: "confirmed", settlementStatus: "pending" }),
    ];
    for (const evidence of examples) {
      expect(classifyTradeRecoveryEvidence(evidence).automatedMutationAllowed).toBe(false);
    }
  });
});
