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

  it("checks legacy reward ledger count and amount against the credited reward", () => {
    const mismatch = classifyTradeRecoveryEvidence(settledEvidence({
      rewardCreditedMinor: 500,
      rewardLedgerCount: 1,
      rewardLedgerAmountMinor: 499,
    }));
    expect(mismatch.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(mismatch.reasons.join(" ")).toContain("Legacy reward ledger amount does not match");

    const zeroRewardWithPhantomAmount = classifyTradeRecoveryEvidence(settledEvidence({
      rewardCreditedMinor: 0,
      rewardLedgerCount: 0,
      rewardLedgerAmountMinor: 1,
      rewardReservationStatus: "released",
    }));
    expect(zeroRewardWithPhantomAmount.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(zeroRewardWithPhantomAmount.reasons.join(" ")).toContain("must be absent");
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

  it("does not interpret legacy migration defaults as a recorded zero-profit result", () => {
    const result = classifyTradeRecoveryEvidence(settledEvidence({
      settlementOutcome: "legacy_unrecorded",
      realizedGrossProfitMinor: 0,
      platformFeeMinor: 0,
      netProfitMinor: 0,
      grossProfitLedgerCount: 0,
      grossProfitLedgerAmountMinor: null,
      platformFeeLedgerCount: 0,
      platformFeeLedgerAmountMinor: null,
      realizedLossLedgerCount: 0,
      realizedLossLedgerAmountMinor: null,
      rewardCreditedMinor: 0,
      rewardReservationStatus: "released",
    }));
    expect(result.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(result.reasons.join(" ")).toContain("migration-default zero values are not proof");
    expect(result.automatedMutationAllowed).toBe(false);
  });

  it("escalates negative or unsafe optional settlement evidence", () => {
    const negativeFeeCount = classifyTradeRecoveryEvidence(settledEvidence({
      grossProfitLedgerCount: 1,
      grossProfitLedgerAmountMinor: 2000,
      realizedGrossProfitMinor: 2000,
      platformFeeMinor: 300,
      netProfitMinor: 1700,
      platformFeeLedgerCount: -1,
      platformFeeLedgerAmountMinor: null,
      realizedLossLedgerCount: 0,
      realizedLossLedgerAmountMinor: null,
    }));
    expect(negativeFeeCount.classification).toBe("MANUAL_FINANCIAL_REVIEW");

    const unsafeFee = classifyTradeRecoveryEvidence(settledEvidence({
      grossProfitLedgerCount: 1,
      grossProfitLedgerAmountMinor: 2000,
      realizedGrossProfitMinor: 2000,
      platformFeeMinor: Number.MAX_SAFE_INTEGER + 1,
      netProfitMinor: 1700,
      platformFeeLedgerCount: 1,
      platformFeeLedgerAmountMinor: -300,
      realizedLossLedgerCount: 0,
      realizedLossLedgerAmountMinor: null,
    }));
    expect(unsafeFee.classification).toBe("MANUAL_FINANCIAL_REVIEW");
  });

  it("accepts a consistent realized loss without a platform fee", () => {
    const result = classifyTradeRecoveryEvidence(settledEvidence({
      rewardCreditedMinor: 0,
      grossProfitLedgerCount: 0,
      grossProfitLedgerAmountMinor: null,
      realizedGrossProfitMinor: -500,
      platformFeeMinor: 0,
      netProfitMinor: -500,
      platformFeeLedgerCount: 0,
      platformFeeLedgerAmountMinor: null,
      realizedLossLedgerCount: 1,
      realizedLossLedgerAmountMinor: -500,
      settlementOutcome: "loss",
      rewardReservationStatus: "released",
    }));
    expect(result.classification).toBe("NO_ACTION");
  });

  it("escalates inconsistent net-profit arithmetic and fees on non-profit outcomes", () => {
    const incorrectNet = classifyTradeRecoveryEvidence(settledEvidence({
      grossProfitLedgerCount: 1,
      grossProfitLedgerAmountMinor: 2000,
      realizedGrossProfitMinor: 2000,
      platformFeeMinor: 300,
      netProfitMinor: 1800,
      platformFeeLedgerCount: 1,
      platformFeeLedgerAmountMinor: -300,
      realizedLossLedgerCount: 0,
      realizedLossLedgerAmountMinor: null,
    }));
    expect(incorrectNet.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(incorrectNet.reasons.join(" ")).toContain("net profit does not equal");

    const feeOnLoss = classifyTradeRecoveryEvidence(settledEvidence({
      rewardCreditedMinor: 0,
      grossProfitLedgerCount: 0,
      grossProfitLedgerAmountMinor: null,
      realizedGrossProfitMinor: -500,
      platformFeeMinor: 50,
      netProfitMinor: -550,
      platformFeeLedgerCount: 1,
      platformFeeLedgerAmountMinor: -50,
      realizedLossLedgerCount: 1,
      realizedLossLedgerAmountMinor: -500,
      settlementOutcome: "loss",
    }));
    expect(feeOnLoss.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(feeOnLoss.reasons.join(" ")).toContain("must not incur");
  });

  it("rejects a gross-profit amount when no gross-profit ledger entry exists", () => {
    const result = classifyTradeRecoveryEvidence(settledEvidence({
      rewardCreditedMinor: 0,
      grossProfitLedgerCount: 0,
      grossProfitLedgerAmountMinor: 1,
      realizedGrossProfitMinor: 0,
      platformFeeMinor: 0,
      netProfitMinor: 0,
      platformFeeLedgerCount: 0,
      platformFeeLedgerAmountMinor: null,
      realizedLossLedgerCount: 0,
      realizedLossLedgerAmountMinor: null,
      settlementOutcome: "zero_profit",
      rewardReservationStatus: "released",
    }));
    expect(result.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(result.reasons.join(" ")).toContain("must be absent when no gross-profit entry exists");
  });

  it("checks the stored fee rate and rounding policy against the recorded fee", () => {
    const valid = classifyTradeRecoveryEvidence(settledEvidence({
      rewardCreditedMinor: 1700,
      grossProfitLedgerCount: 1,
      grossProfitLedgerAmountMinor: 2000,
      realizedGrossProfitMinor: 2000,
      platformFeeMinor: 300,
      netProfitMinor: 1700,
      platformFeeLedgerCount: 1,
      platformFeeLedgerAmountMinor: -300,
      realizedLossLedgerCount: 0,
      realizedLossLedgerAmountMinor: null,
      feePolicyVersion: 1,
      platformFeeRateBps: 1500,
      platformFeeRoundingMode: "half_up",
    }));
    expect(valid.classification).toBe("NO_ACTION");

    const mismatch = classifyTradeRecoveryEvidence(settledEvidence({
      rewardCreditedMinor: 1700,
      grossProfitLedgerCount: 1,
      grossProfitLedgerAmountMinor: 2000,
      realizedGrossProfitMinor: 2000,
      platformFeeMinor: 250,
      netProfitMinor: 1750,
      platformFeeLedgerCount: 1,
      platformFeeLedgerAmountMinor: -250,
      realizedLossLedgerCount: 0,
      realizedLossLedgerAmountMinor: null,
      feePolicyVersion: 1,
      platformFeeRateBps: 1500,
      platformFeeRoundingMode: "half_up",
    }));
    expect(mismatch.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(mismatch.reasons.join(" ")).toContain("does not match the stored fee rate");
  });

  it("escalates settlement outcomes that disagree with the recorded realized result", () => {
    const result = classifyTradeRecoveryEvidence(settledEvidence({
      grossProfitLedgerCount: 1,
      grossProfitLedgerAmountMinor: 2000,
      realizedGrossProfitMinor: 2000,
      platformFeeMinor: 300,
      netProfitMinor: 1700,
      platformFeeLedgerCount: 1,
      platformFeeLedgerAmountMinor: -300,
      realizedLossLedgerCount: 0,
      realizedLossLedgerAmountMinor: null,
      settlementOutcome: "loss",
    }));
    expect(result.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(result.reasons.join(" ")).toContain("does not agree");
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
  
  it("compares collector gross-profit and fee postings separately from net credited reward", () => {
    const result = classifyTradeRecoveryEvidence(settledEvidence({
      rewardCreditedMinor: 1700,
      rewardLedgerCount: 1,
      rewardLedgerAmountMinor: 2000,
      realizedGrossProfitMinor: 2000,
      platformFeeMinor: 300,
      netProfitMinor: 1700,
      grossProfitLedgerCount: 1,
      grossProfitLedgerAmountMinor: 2000,
      platformFeeLedgerCount: 1,
      platformFeeLedgerAmountMinor: -300,
      realizedLossLedgerCount: 0,
      realizedLossLedgerAmountMinor: null,
    }));
    expect(result.classification).toBe("NO_ACTION");
  });

  it("escalates a fee posting that has the wrong sign or amount", () => {
    const result = classifyTradeRecoveryEvidence(settledEvidence({
      rewardCreditedMinor: 1700,
      rewardLedgerCount: 1,
      rewardLedgerAmountMinor: 2000,
      realizedGrossProfitMinor: 2000,
      platformFeeMinor: 300,
      netProfitMinor: 1700,
      grossProfitLedgerCount: 1,
      grossProfitLedgerAmountMinor: 2000,
      platformFeeLedgerCount: 1,
      platformFeeLedgerAmountMinor: 300,
      realizedLossLedgerCount: 0,
      realizedLossLedgerAmountMinor: null,
    }));
    expect(result.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(result.reasons.join(" ")).toContain("negative recorded fee");
  });

});
