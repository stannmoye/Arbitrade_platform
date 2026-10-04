import { describe, expect, it } from "vitest";
import { assertExecutionAllowed, assertIdempotencyKey, calculateVerifiedSettlement, reportingWindowUtc, validateLedgerCorrection } from "./v5-workflows";
import { fixed } from "./v5-rules";

describe("V5 workflow safety boundaries", () => {
  it("blocks live execution without a named, verifiable mechanism", () => {
    expect(() => assertExecutionAllowed("LIVE")).toThrow("Live execution is blocked");
    expect(() => assertExecutionAllowed("PRACTICE")).not.toThrow();
    expect(() => assertExecutionAllowed("LIVE", { provider: "broker", executionReference: "exec-1", resultRetrieval: "settlement-api" })).not.toThrow();
  });

  it("requires verified result data before calculating settlement", () => {
    expect(() => calculateVerifiedSettlement({ principal: fixed("100", "USD"), verifiedGrossProfit: "10", verifiedFees: "2", resultReference: "" })).toThrow("verified settlement");
    const result = calculateVerifiedSettlement({ principal: fixed("100", "USD"), verifiedGrossProfit: "10", verifiedFees: "2", resultReference: "provider-result-1" });
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
