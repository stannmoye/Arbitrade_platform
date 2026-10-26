import { createHash } from "node:crypto";
import { calculateRealizedProfitSettlement, type FeeRoundingMode } from "./realized-profit-accounting";

export type ReconciliationConfidence = "confirmed" | "inconclusive";
export type ReconciliationIssue = {
  code: string;
  confidence: ReconciliationConfidence;
  explanation: string;
};

function safeInteger(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (typeof value === "bigint") {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) return null;
    return Number(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    try {
      const parsed = BigInt(value.trim());
      if (parsed > BigInt(Number.MAX_SAFE_INTEGER) || parsed < BigInt(Number.MIN_SAFE_INTEGER)) return null;
      return Number(parsed);
    } catch {
      return null;
    }
  }
  return null;
}

export type WalletLedgerSnapshot = {
  userId: number;
  currency: string;
  walletCount: unknown;
  availableMinor: unknown;
  lockedMinor: unknown;
  ledgerEntryCount: unknown;
  ledgerNetMinor: unknown;
  activeTradeCount: unknown;
  knownActiveTradePrincipalMinor: unknown;
  pendingPayoutCount: unknown;
  pendingPayoutMinor: unknown;
};

export type WalletLedgerAuditRow = {
  userId: number;
  currency: string;
  walletCount: number | null;
  availableMinor: number | null;
  lockedMinor: number | null;
  ledgerEntryCount: number | null;
  ledgerNetMinor: number | null;
  availableLedgerDeltaMinor: number | null;
  activeTradeCount: number | null;
  knownActiveTradePrincipalMinor: number | null;
  pendingPayoutCount: number | null;
  pendingPayoutMinor: number | null;
  issues: ReconciliationIssue[];
};

export function inspectWalletLedgerSnapshot(input: WalletLedgerSnapshot): WalletLedgerAuditRow {
  const walletCount = safeInteger(input.walletCount);
  const availableMinor = safeInteger(input.availableMinor);
  const lockedMinor = safeInteger(input.lockedMinor);
  const ledgerEntryCount = safeInteger(input.ledgerEntryCount);
  const ledgerNetMinor = safeInteger(input.ledgerNetMinor);
  const activeTradeCount = safeInteger(input.activeTradeCount);
  const knownActiveTradePrincipalMinor = safeInteger(input.knownActiveTradePrincipalMinor);
  const pendingPayoutCount = safeInteger(input.pendingPayoutCount);
  const pendingPayoutMinor = safeInteger(input.pendingPayoutMinor);
  const requiredValues = [
    walletCount, availableMinor, lockedMinor, ledgerEntryCount, ledgerNetMinor,
    activeTradeCount, knownActiveTradePrincipalMinor, pendingPayoutCount, pendingPayoutMinor,
  ];
  const issues: ReconciliationIssue[] = [];
  const add = (code: string, confidence: ReconciliationConfidence, explanation: string) => {
    issues.push({ code, confidence, explanation });
  };

  if (requiredValues.some((value) => value === null)) {
    add(
      "aggregate_outside_safe_integer_precision",
      "inconclusive",
      "At least one database aggregate cannot be represented exactly as a JavaScript safe integer; do not compare or repair these amounts automatically."
    );
  } else {
    if (walletCount === 0 && (ledgerEntryCount! > 0 || activeTradeCount! > 0 || pendingPayoutCount! > 0)) {
      add(
        "wallet_missing_for_recorded_activity",
        "confirmed",
        "Ledger activity or a known open trade/payout exists for this account and currency, but no wallet row exists."
      );
    }
    if (walletCount! > 1) {
      add(
        "duplicate_wallet_rows",
        "confirmed",
        "More than one wallet row exists for the same customer and currency. Aggregated amounts are shown for investigation; no row is selected as authoritative."
      );
    }
    if (walletCount! > 0 && ledgerEntryCount === 0 && availableMinor !== 0) {
      add(
        "wallet_balance_without_ledger_history",
        "inconclusive",
        "The available balance is non-zero but no ledger entries were found. Historical opening balances or missing legacy entries are not available to prove the cause."
      );
    } else if (walletCount! > 0 && ledgerEntryCount! > 0 && availableMinor !== ledgerNetMinor) {
      add(
        "wallet_available_differs_from_signed_ledger_net",
        "inconclusive",
        "The current available balance differs from the signed ledger-entry sum. Without an authoritative opening-balance snapshot, this delta is an investigation lead rather than a proven accounting loss or gain."
      );
    }
    const knownLockedObligations = knownActiveTradePrincipalMinor! + pendingPayoutMinor!;
    if (!Number.isSafeInteger(knownLockedObligations)) {
      add(
        "known_locked_obligations_outside_safe_integer_precision",
        "inconclusive",
        "The sum of known open-trade principal and pending payout reservations exceeds safe integer precision."
      );
    } else if (lockedMinor! < knownLockedObligations) {
      add(
        "known_obligations_exceed_locked_balance",
        "confirmed",
        "Known open-trade principal plus pending payout amounts exceed the recorded locked wallet balance."
      );
    } else if (lockedMinor! > knownLockedObligations) {
      add(
        "locked_balance_exceeds_known_reservations",
        "inconclusive",
        "The locked balance exceeds currently identifiable open-trade and pending-payout obligations. Legacy, other, or missing reservation records may explain the difference."
      );
    }
  }

  const availableLedgerDeltaMinor =
    availableMinor !== null && ledgerNetMinor !== null && Number.isSafeInteger(availableMinor - ledgerNetMinor)
      ? availableMinor - ledgerNetMinor
      : null;
  return {
    userId: input.userId,
    currency: input.currency,
    walletCount,
    availableMinor,
    lockedMinor,
    ledgerEntryCount,
    ledgerNetMinor,
    availableLedgerDeltaMinor,
    activeTradeCount,
    knownActiveTradePrincipalMinor,
    pendingPayoutCount,
    pendingPayoutMinor,
    issues,
  };
}

export type SettlementLedgerSnapshot = {
  tradeId: number;
  userId: number;
  currency: string;
  principalMinor: unknown;
  status?: string;
  settlementStatus?: string;
  settlementOutcome: string | null;
  settlementReference: string | null;
  realizedGrossProfitMinor: unknown;
  platformFeeMinor: unknown;
  netProfitMinor: unknown;
  rewardCreditedMinor: unknown;
  platformFeeRateBps: unknown;
  platformFeeRoundingMode: string;
  feePolicyVersion: unknown;
};

export type SettlementLedgerEntry = {
  id: number;
  userId: number;
  currency: string;
  amountMinor: unknown;
  entryType: string;
  reference: string;
};

export type ExpectedSettlementPosting = {
  userId: number;
  currency: string;
  amountMinor: number;
  entryType: string;
  reference: string;
};

const LEDGER_SUFFIXES = [":principal", ":gross-profit", ":platform-fee", ":loss"] as const;

export function settlementLedgerReferenceBase(tradeId: number, settlementReference: string): string {
  if (settlementReference.length <= 60) return settlementReference;
  const digest = createHash("sha256").update(settlementReference).digest("hex").slice(0, 24);
  return "trade-" + tradeId + "-" + digest;
}

export function buildSettlementLedgerCandidateReferences(
  trades: Array<{ tradeId: number; settlementReference: string | null }>
): string[] {
  const references = new Set<string>();
  for (const trade of trades) {
    if (!trade.settlementReference) continue;
    const base = settlementLedgerReferenceBase(trade.tradeId, trade.settlementReference);
    for (const suffix of LEDGER_SUFFIXES) references.add(base + suffix);
  }
  return Array.from(references);
}

export function buildExpectedSettlementPostings(
  trade: SettlementLedgerSnapshot
): { expected: ExpectedSettlementPosting[] | null; issues: ReconciliationIssue[] } {
  const issues: ReconciliationIssue[] = [];
  const add = (code: string, confidence: ReconciliationConfidence, explanation: string) => {
    issues.push({ code, confidence, explanation });
  };
  if (trade.status !== undefined && trade.status !== "settled") {
    add("trade_not_settled", "confirmed", "The trade is not in the settled state.");
    return { expected: null, issues };
  }
  if (trade.settlementStatus !== undefined && trade.settlementStatus !== "completed") {
    add("settlement_transition_incomplete", "confirmed", "Trade status is settled but settlementStatus is not completed.");
  }
  if (trade.settlementOutcome === "legacy_unrecorded" || !trade.settlementOutcome) {
    add(
      "historical_settlement_result_not_recorded",
      "inconclusive",
      "No trusted realized outcome is recorded for this historical settlement. The expected reward is an estimate and cannot be substituted for missing results."
    );
    return { expected: null, issues };
  }
  if (!trade.settlementReference || trade.settlementReference.trim().length === 0) {
    add(
      "settlement_reference_missing",
      "inconclusive",
      "The settlement reference needed to locate the corresponding ledger postings is missing."
    );
    return { expected: null, issues };
  }

  const principalMinor = safeInteger(trade.principalMinor);
  const grossProfitMinor = safeInteger(trade.realizedGrossProfitMinor);
  const storedFeeMinor = safeInteger(trade.platformFeeMinor);
  const storedNetMinor = safeInteger(trade.netProfitMinor);
  const storedRewardMinor = safeInteger(trade.rewardCreditedMinor);
  const feeRateBps = safeInteger(trade.platformFeeRateBps);
  const feePolicyVersion = safeInteger(trade.feePolicyVersion);
  const roundingMode = trade.platformFeeRoundingMode as FeeRoundingMode;
  if (
    principalMinor === null || grossProfitMinor === null || storedFeeMinor === null ||
    storedNetMinor === null || storedRewardMinor === null || feeRateBps === null ||
    feePolicyVersion === null || feePolicyVersion < 1 ||
    !["half_up", "down", "up", "half_even"].includes(roundingMode)
  ) {
    add(
      "settlement_accounting_fields_missing_or_unsafe",
      "inconclusive",
      "The stored settlement result or fee-policy snapshot is incomplete or outside safe integer precision, so expected postings cannot be derived safely."
    );
    return { expected: null, issues };
  }

  let accounting: ReturnType<typeof calculateRealizedProfitSettlement>;
  try {
    accounting = calculateRealizedProfitSettlement({
      principalMinor,
      grossProfitMinor,
      feeRateBps,
      roundingMode,
    });
  } catch {
    add(
      "settlement_snapshot_not_recomputable",
      "inconclusive",
      "The recorded settlement snapshot cannot be recomputed under its own stored fee policy. It requires historical evidence and human review."
    );
    return { expected: null, issues };
  }

  if (
    accounting.platformFeeMinor !== storedFeeMinor ||
    accounting.netProfitMinor !== storedNetMinor ||
    accounting.rewardCreditedMinor !== storedRewardMinor ||
    accounting.outcome !== trade.settlementOutcome
  ) {
    add(
      "recorded_trade_accounting_fields_mismatch",
      "confirmed",
      "The saved fee/net/reward/outcome fields do not reconcile with the realized gross result under the trade’s stored fee policy."
    );
  }

  const base = settlementLedgerReferenceBase(trade.tradeId, trade.settlementReference);
  const expected: ExpectedSettlementPosting[] = [
    {
      userId: trade.userId,
      currency: trade.currency,
      amountMinor: accounting.principalMinor,
      entryType: "trade_principal_release",
      reference: base + ":principal",
    },
  ];
  if (accounting.grossProfitMinor > 0) {
    expected.push({
      userId: trade.userId,
      currency: trade.currency,
      amountMinor: accounting.grossProfitMinor,
      entryType: "trade_reward",
      reference: base + ":gross-profit",
    });
  }
  if (accounting.platformFeeMinor > 0) {
    expected.push({
      userId: trade.userId,
      currency: trade.currency,
      amountMinor: -accounting.platformFeeMinor,
      entryType: "trade_platform_fee",
      reference: base + ":platform-fee",
    });
  }
  if (accounting.grossProfitMinor < 0) {
    expected.push({
      userId: trade.userId,
      currency: trade.currency,
      amountMinor: accounting.grossProfitMinor,
      entryType: "trade_loss",
      reference: base + ":loss",
    });
  }
  return { expected, issues };
}

export function inspectSettlementLedgerPostings(
  trade: SettlementLedgerSnapshot,
  ledgerEntries: SettlementLedgerEntry[],
  evidenceComplete = true
): { tradeId: number; userId: number; currency: string; settlementReference: string | null; realizedGrossProfitMinor: number | null; platformFeeMinor: number | null; netProfitMinor: number | null; issues: ReconciliationIssue[] } {
  const built = buildExpectedSettlementPostings(trade);
  const issues = [...built.issues];
  const add = (code: string, confidence: ReconciliationConfidence, explanation: string) => {
    issues.push({ code, confidence, explanation });
  };
  if (!trade.settlementReference) {
    return {
      tradeId: trade.tradeId, userId: trade.userId, currency: trade.currency,
      settlementReference: trade.settlementReference,
      realizedGrossProfitMinor: safeInteger(trade.realizedGrossProfitMinor),
      platformFeeMinor: safeInteger(trade.platformFeeMinor),
      netProfitMinor: safeInteger(trade.netProfitMinor), issues,
    };
  }

  const base = settlementLedgerReferenceBase(trade.tradeId, trade.settlementReference);
  const candidateRefs = new Set(LEDGER_SUFFIXES.map((suffix) => base + suffix));
  const candidateEntries = ledgerEntries.filter((entry) => candidateRefs.has(entry.reference));
  if (!evidenceComplete) {
    add(
      "ledger_posting_scan_truncated",
      "inconclusive",
      "The matching-ledger scan reached its safety cap. Missing or duplicate posting conclusions are suppressed until the bounded scan is complete."
    );
  } else if (built.expected) {
    const expectedReferences = new Set(built.expected.map((entry) => entry.reference));
    for (const expected of built.expected) {
      const matches = candidateEntries.filter((entry) => entry.reference === expected.reference);
      if (matches.length === 0) {
        add("settlement_ledger_posting_missing", "confirmed", "Expected ledger posting " + expected.entryType + " is absent.");
        continue;
      }
      if (matches.length > 1) {
        add("settlement_ledger_posting_duplicated", "confirmed", "More than one ledger entry uses the same settlement posting reference.");
        continue;
      }
      const actual = matches[0];
      const amountMinor = safeInteger(actual.amountMinor);
      if (amountMinor === null) {
        add("settlement_ledger_amount_outside_safe_precision", "inconclusive", "A matched ledger amount cannot be compared exactly as a safe integer.");
      } else if (
        actual.userId !== expected.userId ||
        actual.currency !== expected.currency ||
        actual.entryType !== expected.entryType ||
        amountMinor !== expected.amountMinor
      ) {
        add("settlement_ledger_posting_mismatch", "confirmed", "A ledger posting reference exists but its owner, currency, entry type, or signed amount differs from the recorded settlement.");
      }
    }
    for (const actual of candidateEntries) {
      if (!expectedReferences.has(actual.reference)) {
        add("unexpected_settlement_ledger_posting", "confirmed", "An additional settlement-suffix ledger posting exists that is not expected for the recorded profit/loss outcome.");
        break;
      }
    }
  }

  return {
    tradeId: trade.tradeId,
    userId: trade.userId,
    currency: trade.currency,
    settlementReference: trade.settlementReference,
    realizedGrossProfitMinor: safeInteger(trade.realizedGrossProfitMinor),
    platformFeeMinor: safeInteger(trade.platformFeeMinor),
    netProfitMinor: safeInteger(trade.netProfitMinor),
    issues,
  };
}
