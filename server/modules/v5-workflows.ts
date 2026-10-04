import Decimal from "decimal.js";
import { FixedMoney, quantize, type PrecisionConfig } from "../../shared/money";

export type ExecutionMode = "PRACTICE" | "SIMULATION" | "RESEARCH" | "LIVE";

/** Live returns are unavailable until an independently verifiable mechanism is configured. */
export function assertExecutionAllowed(mode: ExecutionMode, mechanism?: {
  provider: string;
  executionReference: string;
  resultRetrieval: string;
}) {
  if (mode !== "LIVE") return;
  if (!mechanism?.provider || !mechanism.executionReference || !mechanism.resultRetrieval) {
    throw new Error("Live execution is blocked until a verified execution and settlement mechanism is configured");
  }
}

export type VerifiedSettlementInput = {
  principal: FixedMoney;
  verifiedGrossProfit: string;
  verifiedFees: string;
  resultReference: string;
};

/** Settlement may only be produced from provider-verified results, never opportunity estimates. */
export function calculateVerifiedSettlement(input: VerifiedSettlementInput) {
  if (!input.resultReference.trim()) throw new Error("A verified settlement result reference is required");
  const grossProfit = quantize(input.verifiedGrossProfit, input.principal.config);
  const fees = quantize(input.verifiedFees, input.principal.config);
  const takeHomeProfit = grossProfit.subtract(fees);
  const totalReturned = input.principal.add(takeHomeProfit);
  const status = takeHomeProfit.isNegative() ? "SETTLED_LOSS" : takeHomeProfit.isZero() ? "SETTLED_ZERO" : "SETTLED_PROFIT";
  return { status, principal: input.principal, grossProfit, fees, takeHomeProfit, totalReturned, resultReference: input.resultReference } as const;
}

export type LedgerCorrection = {
  originalEntryId: number;
  amount: string;
  reason: string;
  reference: string;
};

export function validateLedgerCorrection(input: LedgerCorrection, config: PrecisionConfig) {
  if (!Number.isInteger(input.originalEntryId) || input.originalEntryId <= 0) throw new Error("A valid original ledger entry is required");
  if (!input.reason.trim() || !input.reference.trim()) throw new Error("Ledger corrections require a reason and reference");
  const amount = quantize(input.amount, config);
  if (amount.isZero()) throw new Error("A ledger correction cannot be zero");
  return amount;
}

/**
 * Convert a customer-local reporting date into the authoritative UTC half-open interval.
 * Offset is recalculated after the first estimate so DST transitions at midnight are handled.
 */
export function reportingWindowUtc(reportingDate: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportingDate)) throw new Error("Reporting date must be YYYY-MM-DD");
  const [year, month, day] = reportingDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const start = localMidnightUtc(year, month - 1, day, timeZone);
  const end = localMidnightUtc(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(), timeZone);
  if (end <= start) throw new Error("Reporting timezone produced an invalid interval");
  return { start, end };
}

function localMidnightUtc(year: number, monthIndex: number, day: number, timeZone: string) {
  const naive = Date.UTC(year, monthIndex, day);
  let candidate = new Date(naive);
  for (let i = 0; i < 3; i++) {
    const offset = timeZoneOffsetMinutes(candidate, timeZone);
    const adjusted = new Date(naive - offset * 60_000);
    if (adjusted.getTime() === candidate.getTime()) return candidate;
    candidate = adjusted;
  }
  return candidate;
}

function timeZoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(date);
  const value = parts.find(part => part.type === "timeZoneName")?.value ?? "GMT";
  const match = value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return (match[1] === "-" ? -1 : 1) * minutes;
}

export function assertIdempotencyKey(key: string) {
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(key)) throw new Error("Invalid idempotency key");
  return key;
}

export function decimalRatio(numerator: string, denominator: string) {
  const value = new Decimal(denominator);
  if (value.isZero()) throw new Error("Cannot divide by zero");
  return new Decimal(numerator).div(value).toString();
}
