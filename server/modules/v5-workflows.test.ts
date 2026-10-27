import { describe, expect, it } from "vitest";
import { assertExecutionAllowed, assertIdempotencyKey, calculateRecordedSettlement, reportingWindowUtc, validateLedgerCorrection } from "./v5-workflows";
import { fixed } from "./v5-rules";

describe("V5 workflow safety boundaries", () => {
  it("does not require an external provider for the internal-ledger model", () => {
    expect(() => assertExecutionAllowed("INTERNAL_LEDGER")).not.toThrow();
    expect(() => assertExecutionAllowed("LIVE")).not.toThrow();
  });

  it("requires a persisted internal result reference before calculating settlement", () => {
    expect(() => calculateRecordedSettlement({ principal: fixed("100", "USD"), recordedGrossProfit: "10", recordedFees: "2", internalSettlementReference: "" })).toThrow("internal settlement reference");
    const result = calculateRecordedSettlement({ principal: fixed("100", "USD"), recordedGrossProfit: "10", recordedFees: "2", internalSettlementReference: "settlement-record-1" });
    expect(result.status).toBe("SETTLED_PROFIT");
    expect(result.totalReturned.toString()).toBe("108.00");
  });

  it("requires auditable metadata for compensating ledger entries", () => {
    expect(() => validateLedgerCorrection({ originalEntryId: 3, amount: "0", reason: "fix", reference: "case-1" }, fixed("1", "USD").config)).toThrow("cannot be zero");
    expect(() => validateLedgerCorrection({ originalEntryId: 3, amount: "2", reason: "", reference: "case-1" }, fixed("1", "USD").config)).toThrow("reason and reference");
    expect(validateLedgerCorrection({ originalEntryId: 3, amount: "2.50", reason: "reversal", reference: "case-1" }, fixed("1", "USD").config).toString()).toBe("2.50");
  });

  it("uses half-open customer-local reporting windows across DST", () => {
    const spring = reportingWindowUtc("2026-03-08", "America/New_York");
    const fall = reportingWindowUtc("2026-11-01", "America/New_York");
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(23);
    expect((fall.end.getTime() - fall.start.getTime()) / 3_600_000).toBe(25);
  });

  it("accepts only bounded idempotency keys", () => {
    expect(assertIdempotencyKey("invest:user:123456")).toBe("invest:user:123456");
    expect(() => assertIdempotencyKey("short")).toThrow("idempotency");
  });
});
