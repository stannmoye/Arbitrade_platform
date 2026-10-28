import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decideTradeExecutionRetry } from "./trade-execution-retry";

describe("trade execution retry policy", () => {
  const now = new Date("2026-10-26T12:00:00.000Z");

  it("retries known transient infrastructure errors within the configured attempt cap", () => {
    const decision = decideTradeExecutionRetry({ code: "ER_LOCK_DEADLOCK" }, 1, 5, now);
    expect(decision.kind).toBe("retry");
    if (decision.kind === "retry") {
      expect(decision.retryAt.toISOString()).toBe("2026-10-26T12:00:30.000Z");
      expect(decision.attemptNumber).toBe(1);
    }
  });

  it("honors the admin-configured retry delay", () => {
    const decision = decideTradeExecutionRetry({ code: "ETIMEDOUT" }, 1, 3, now, 120);
    expect(decision.kind).toBe("retry");
    if (decision.kind === "retry") expect(decision.retryAt.toISOString()).toBe("2026-10-26T12:02:00.000Z");
  });

  it("recognizes a known transient code wrapped in an error cause", () => {
    const decision = decideTradeExecutionRetry({ code: "ERR_DATABASE_WRAPPER", cause: { code: "ETIMEDOUT" } }, 1, 3, now);
    expect(decision).toEqual({
      kind: "retry",
      attemptNumber: 1,
      retryAt: new Date("2026-10-26T12:00:30.000Z"),
      errorCode: "ETIMEDOUT",
    });
  });

  it("detects transient cause messages and terminates cyclic cause chains", () => {
    const nestedMessage = decideTradeExecutionRetry({ code: "ERR_DATABASE_WRAPPER", cause: { message: "Service temporarily unavailable" } }, 1, 3, now);
    expect(nestedMessage.kind).toBe("retry");

    const cyclic: { code: string; cause?: unknown } = { code: "ERR_WRAPPER" };
    cyclic.cause = cyclic;
    expect(decideTradeExecutionRetry(cyclic, 1, 3, now)).toEqual({
      kind: "failed",
      attemptNumber: 1,
      errorCode: "ERR_WRAPPER",
    });
  });

  it("fails closed when the configured attempt limit is reached", () => {
    expect(decideTradeExecutionRetry({ code: "ETIMEDOUT" }, 5, 5, now)).toEqual({
      kind: "failed",
      attemptNumber: 5,
      errorCode: "TEMPORARY_EXECUTION_RETRIES_EXHAUSTED",
    });
  });

  it("does not retry business-rule and validation errors", () => {
    expect(decideTradeExecutionRetry(new Error("An eligible active trading package subscription is required"), 1, 5, now)).toEqual({
      kind: "failed",
      attemptNumber: 1,
      errorCode: "TRADE_ALLOCATION_REJECTED",
    });
  });

  it("rejects malformed retry policy values", () => {
    expect(() => decideTradeExecutionRetry({ code: "ETIMEDOUT" }, 0, 5, now)).toThrow("Invalid trade execution retry policy inputs");
    expect(() => decideTradeExecutionRetry({ code: "ETIMEDOUT" }, 1, 0, now)).toThrow("Invalid trade execution retry policy inputs");
  });

  it("persists bounded retry state and never retries a trade after the opportunity is terminal", () => {
    const source = readFileSync(new URL("../db.ts", import.meta.url), "utf8");
    expect(source).toContain("claimOpportunityExecutionAttempt");
    expect(source).toContain("executionStatus:\"RUNNING\"");
    expect(source).toContain('status:"RETRYING"');
    expect(source).toContain("executionStatus:\"FAILED\"");
    expect(source).toContain("executionStatus:\"SUCCEEDED\"");
    expect(source).toContain("TEMPORARY_EXECUTION_RETRY_WINDOW_EXPIRED");
    expect(source).toContain("maxTradeAttemptsPerDay");
    expect(source).toContain("if(/new trading allocations are paused by an administrator/i.test(message))");
  });
});
