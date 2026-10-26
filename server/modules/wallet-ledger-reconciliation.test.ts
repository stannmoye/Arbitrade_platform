import { describe, expect, it } from "vitest";
import {
  buildExpectedSettlementPostings,
  buildSettlementLedgerCandidateReferences,
  inspectSettlementLedgerPostings,
  inspectWalletLedgerSnapshot,
  type SettlementLedgerSnapshot,
} from "./wallet-ledger-reconciliation";

function recordedTrade(overrides: Partial<SettlementLedgerSnapshot> = {}): SettlementLedgerSnapshot {
  return {
    tradeId: 42,
    userId: 7,
    currency: "USD",
    principalMinor: 100000,
    status: "settled",
    settlementStatus: "completed",
    settlementOutcome: "profit",
    settlementReference: "SETTLEMENT-42",
    realizedGrossProfitMinor: 20000,
    platformFeeMinor: 3000,
    netProfitMinor: 17000,
    rewardCreditedMinor: 17000,
    platformFeeRateBps: 1500,
    platformFeeRoundingMode: "half_up",
    feePolicyVersion: 1,
    ...overrides,
  };
}

describe("wallet versus signed-ledger reconciliation", () => {
  it("compares available balance to ledger net, not available plus locked funds", () => {
    const result = inspectWalletLedgerSnapshot({
      userId: 7, currency: "USD", walletCount: 1,
      availableMinor: 90000, lockedMinor: 10000,
      ledgerEntryCount: 2, ledgerNetMinor: 90000,
      activeTradeCount: 1, knownActiveTradePrincipalMinor: 10000,
      pendingPayoutCount: 0, pendingPayoutMinor: 0,
    });
    expect(result.availableLedgerDeltaMinor).toBe(0);
    expect(result.issues).toEqual([]);
  });

  it("keeps an available-balance delta inconclusive without opening-balance evidence", () => {
    const result = inspectWalletLedgerSnapshot({
      userId: 7, currency: "USD", walletCount: 1,
      availableMinor: 1200, lockedMinor: 0,
      ledgerEntryCount: 4, ledgerNetMinor: 1000,
      activeTradeCount: 0, knownActiveTradePrincipalMinor: 0,
      pendingPayoutCount: 0, pendingPayoutMinor: 0,
    });
    expect(result.availableLedgerDeltaMinor).toBe(200);
    expect(result.issues).toEqual([expect.objectContaining({
      code: "wallet_available_differs_from_signed_ledger_net", confidence: "inconclusive",
    })]);
  });

  it("does not treat a non-zero historical wallet without entries as a proven mismatch", () => {
    const result = inspectWalletLedgerSnapshot({
      userId: 7, currency: "USD", walletCount: 1,
      availableMinor: 8000, lockedMinor: 0,
      ledgerEntryCount: 0, ledgerNetMinor: 0,
      activeTradeCount: 0, knownActiveTradePrincipalMinor: 0,
      pendingPayoutCount: 0, pendingPayoutMinor: 0,
    });
    expect(result.issues[0]).toMatchObject({
      code: "wallet_balance_without_ledger_history", confidence: "inconclusive",
    });
  });

  it("confirms duplicate wallets, missing wallets with activity, and known obligations exceeding locked funds", () => {
    const duplicate = inspectWalletLedgerSnapshot({
      userId: 7, currency: "USD", walletCount: 2,
      availableMinor: 10, lockedMinor: 10,
      ledgerEntryCount: 1, ledgerNetMinor: 20,
      activeTradeCount: 1, knownActiveTradePrincipalMinor: 15,
      pendingPayoutCount: 1, pendingPayoutMinor: 10,
    });
    expect(duplicate.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "duplicate_wallet_rows", confidence: "confirmed" }),
      expect.objectContaining({ code: "known_obligations_exceed_locked_balance", confidence: "confirmed" }),
    ]));
    const missing = inspectWalletLedgerSnapshot({
      userId: 8, currency: "EUR", walletCount: 0,
      availableMinor: 0, lockedMinor: 0,
      ledgerEntryCount: 1, ledgerNetMinor: 30,
      activeTradeCount: 0, knownActiveTradePrincipalMinor: 0,
      pendingPayoutCount: 0, pendingPayoutMinor: 0,
    });
    expect(missing.issues).toContainEqual(expect.objectContaining({
      code: "wallet_missing_for_recorded_activity", confidence: "confirmed",
    }));
  });

  it("treats unknown excess locked funds as inconclusive", () => {
    const result = inspectWalletLedgerSnapshot({
      userId: 7, currency: "USD", walletCount: 1,
      availableMinor: 100, lockedMinor: 90,
      ledgerEntryCount: 1, ledgerNetMinor: 100,
      activeTradeCount: 1, knownActiveTradePrincipalMinor: 50,
      pendingPayoutCount: 0, pendingPayoutMinor: 0,
    });
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "locked_balance_exceeds_known_reservations", confidence: "inconclusive",
    }));
  });

  it("refuses conclusions when aggregates exceed safe integer precision", () => {
    const result = inspectWalletLedgerSnapshot({
      userId: 7, currency: "USD", walletCount: 1,
      availableMinor: Number.MAX_SAFE_INTEGER + 1, lockedMinor: 0,
      ledgerEntryCount: 1, ledgerNetMinor: 0,
      activeTradeCount: 0, knownActiveTradePrincipalMinor: 0,
      pendingPayoutCount: 0, pendingPayoutMinor: 0,
    });
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "aggregate_outside_safe_integer_precision", confidence: "inconclusive",
    }));
    expect(result.availableMinor).toBeNull();
  });
});

describe("historical-safe settlement ledger reconciliation", () => {
  it("expects only principal, realized positive gross profit, and the stored-policy fee", () => {
    const built = buildExpectedSettlementPostings(recordedTrade());
    expect(built.issues).toEqual([]);
    expect(built.expected).toEqual([
      { userId: 7, currency: "USD", amountMinor: 100000, entryType: "trade_principal_release", reference: "SETTLEMENT-42:principal" },
      { userId: 7, currency: "USD", amountMinor: 20000, entryType: "trade_reward", reference: "SETTLEMENT-42:gross-profit" },
      { userId: 7, currency: "USD", amountMinor: -3000, entryType: "trade_platform_fee", reference: "SETTLEMENT-42:platform-fee" },
    ]);
  });

  it("does not charge a profit fee on zero-profit or loss outcomes", () => {
    const zero = buildExpectedSettlementPostings(recordedTrade({
      settlementOutcome: "zero_profit", realizedGrossProfitMinor: 0,
      platformFeeMinor: 0, netProfitMinor: 0, rewardCreditedMinor: 0,
    }));
    expect(zero.expected?.map((entry) => entry.entryType)).toEqual(["trade_principal_release"]);
    const loss = buildExpectedSettlementPostings(recordedTrade({
      settlementOutcome: "loss", realizedGrossProfitMinor: -1000,
      platformFeeMinor: 0, netProfitMinor: -1000, rewardCreditedMinor: 0,
    }));
    expect(loss.expected?.map((entry) => entry.entryType)).toEqual(["trade_principal_release", "trade_loss"]);
  });

  it("never infers a missing legacy result or missing reference", () => {
    const legacy = buildExpectedSettlementPostings(recordedTrade({
      settlementOutcome: "legacy_unrecorded", settlementReference: null,
      realizedGrossProfitMinor: 0, platformFeeMinor: 0, netProfitMinor: 0, rewardCreditedMinor: 0,
    }));
    expect(legacy.expected).toBeNull();
    expect(legacy.issues).toContainEqual(expect.objectContaining({
      code: "historical_settlement_result_not_recorded", confidence: "inconclusive",
    }));
    const missingReference = buildExpectedSettlementPostings(recordedTrade({ settlementReference: null }));
    expect(missingReference.expected).toBeNull();
    expect(missingReference.issues[0].confidence).toBe("inconclusive");
  });

  it("detects missing and mismatched ledger postings", () => {
    const trade = recordedTrade();
    const missing = inspectSettlementLedgerPostings(trade, []);
    expect(missing.issues.filter((issue) => issue.code === "settlement_ledger_posting_missing")).toHaveLength(3);
    const mismatched = inspectSettlementLedgerPostings(trade, [
      { id: 1, userId: 7, currency: "USD", amountMinor: 100000, entryType: "trade_principal_release", reference: "SETTLEMENT-42:principal" },
      { id: 2, userId: 7, currency: "USD", amountMinor: 19999, entryType: "trade_reward", reference: "SETTLEMENT-42:gross-profit" },
      { id: 3, userId: 7, currency: "USD", amountMinor: -3000, entryType: "trade_platform_fee", reference: "SETTLEMENT-42:platform-fee" },
    ]);
    expect(mismatched.issues).toContainEqual(expect.objectContaining({
      code: "settlement_ledger_posting_mismatch", confidence: "confirmed",
    }));
  });

  it("detects duplicate and unexpected settlement postings", () => {
    const duplicate = inspectSettlementLedgerPostings(recordedTrade(), [
      { id: 1, userId: 7, currency: "USD", amountMinor: 100000, entryType: "trade_principal_release", reference: "SETTLEMENT-42:principal" },
      { id: 2, userId: 7, currency: "USD", amountMinor: 100000, entryType: "trade_principal_release", reference: "SETTLEMENT-42:principal" },
      { id: 3, userId: 7, currency: "USD", amountMinor: 20000, entryType: "trade_reward", reference: "SETTLEMENT-42:gross-profit" },
      { id: 4, userId: 7, currency: "USD", amountMinor: -3000, entryType: "trade_platform_fee", reference: "SETTLEMENT-42:platform-fee" },
    ]);
    expect(duplicate.issues).toContainEqual(expect.objectContaining({
      code: "settlement_ledger_posting_duplicated", confidence: "confirmed",
    }));
    const zero = recordedTrade({
      settlementOutcome: "zero_profit", realizedGrossProfitMinor: 0,
      platformFeeMinor: 0, netProfitMinor: 0, rewardCreditedMinor: 0,
    });
    const unexpected = inspectSettlementLedgerPostings(zero, [
      { id: 1, userId: 7, currency: "USD", amountMinor: 100000, entryType: "trade_principal_release", reference: "SETTLEMENT-42:principal" },
      { id: 2, userId: 7, currency: "USD", amountMinor: 100, entryType: "trade_platform_fee", reference: "SETTLEMENT-42:platform-fee" },
    ]);
    expect(unexpected.issues).toContainEqual(expect.objectContaining({
      code: "unexpected_settlement_ledger_posting", confidence: "confirmed",
    }));
  });

  it("uses the deterministic short hash for long settlement references", () => {
    const reference = "E".repeat(90);
    const refs = buildSettlementLedgerCandidateReferences([{ tradeId: 42, settlementReference: reference }]);
    expect(refs).toHaveLength(4);
    expect(refs.every((entry) => entry.length <= 80)).toBe(true);
    expect(refs).toContain(buildExpectedSettlementPostings(recordedTrade({ settlementReference: reference })).expected?.[0].reference);
  });

  it("suppresses missing-posting conclusions when matching evidence is truncated", () => {
    const report = inspectSettlementLedgerPostings(recordedTrade(), [], false);
    expect(report.issues).not.toContainEqual(expect.objectContaining({ code: "settlement_ledger_posting_missing" }));
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "ledger_posting_scan_truncated", confidence: "inconclusive",
    }));
  });
  
  it("fails closed when a reconciliation count or known obligation is negative", () => {
    const result = inspectWalletLedgerSnapshot({
      userId: 7, currency: "USD", walletCount: 1,
      availableMinor: 1000, lockedMinor: 0,
      ledgerEntryCount: 2, ledgerNetMinor: 1000,
      activeTradeCount: 1, knownActiveTradePrincipalMinor: -500,
      pendingPayoutCount: 0, pendingPayoutMinor: 0,
    });
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "invalid_negative_reconciliation_input",
        confidence: "inconclusive",
      }),
    ]);
    expect(result.availableLedgerDeltaMinor).toBe(0);
  });

});
