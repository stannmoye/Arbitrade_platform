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

  it("fails closed on negative or unsafe collector counts", () => {
    for (const context of [
      { ...healthyContext, reservationCount: -1 },
      { ...healthyContext, walletMatchCount: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      const result = applyRecoveryContextSafety(plan(), context);
      expect(result.classification).toBe("MANUAL_FINANCIAL_REVIEW");
      expect(result.plannedMutations).toEqual([]);
      expect(result.reasons.join(" ")).toContain("invalid wallet/reservation counts");
    }
  });

  it("escalates incomplete or internally inconsistent scan coverage", () => {
    const incomplete = applyRecoveryContextSafety(plan(), {
      ...healthyContext,
      scanCoverage: {
        requestedLimit: 100,
        selectedTradeCount: 100,
        totalTradeCount: 181,
        complete: false,
      },
    });
    expect(incomplete.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(incomplete.reasons.join(" ")).toContain("collected 100 of 181 trades");
    expect(incomplete.plannedMutations).toEqual([]);

    const inconsistent = applyRecoveryContextSafety(plan(), {
      ...healthyContext,
      scanCoverage: {
        requestedLimit: 100,
        selectedTradeCount: 50,
        totalTradeCount: 40,
        complete: true,
      },
    });
    expect(inconsistent.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(inconsistent.reasons.join(" ")).toContain("coverage metadata is invalid");
  });

  it("escalates missing wallet snapshots and reservation currency mismatches", () => {
    const result = applyRecoveryContextSafety(plan(), {
      ...healthyContext,
      currency: "USD",
      wallet: null,
      reservation: [{
        id: 9,
        status: "credited",
        reservedMinor: 500,
        currency: "EUR",
      }],
      rewardReservationStatus: "credited",
    });
    expect(result.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(result.reasons.join(" ")).toContain("did not provide its balance snapshot");
    expect(result.reasons.join(" ")).toContain("Reservation currency does not match");
    expect(result.plannedMutations).toEqual([]);
  });

  it("requires reservation rows when collector reservation metadata is supplied", () => {
    const result = applyRecoveryContextSafety(plan(), {
      ...healthyContext,
      rewardReservationStatus: null,
    });
    expect(result.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(result.reasons.join(" ")).toContain("without the reservation row snapshot");
    expect(result.plannedMutations).toEqual([]);
  });

  it("checks wallet user and reservation trade identity", () => {
    const result = applyRecoveryContextSafety(plan(), {
      ...healthyContext,
      tradeId: 42,
      userId: 7,
      currency: "USD",
      walletMatchCount: 1,
      wallet: { id: 8, userId: 9, currency: "USD", availableMinor: 1000, lockedMinor: 0, promotionalMinor: 0, earnedMinor: 0 },
      reservationCount: 1,
      rewardReservationStatus: "credited",
      reservation: [{ id: 10, tradeId: 99, status: "credited", reservedMinor: 500, currency: "USD" }],
    });
    expect(result.classification).toBe("MANUAL_FINANCIAL_REVIEW");
    expect(result.reasons.join(" ")).toContain("Wallet snapshot user does not match");
    expect(result.reasons.join(" ")).toContain("reservation trade identity does not match");
    expect(result.plannedMutations).toEqual([]);
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
