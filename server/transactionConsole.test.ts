import { describe, expect, it, vi } from "vitest";
import type { PoolConnection } from "mysql2/promise";
import {
  presentSimulatedActivity,
  transactionConsoleEventLockName,
  withTransactionConsoleEventLock,
} from "./transactionConsole";

describe("transaction-console simulated activity labeling", () => {
  it.each(["COMPLETED", "FAILED", "STALLED", "PROCESSING", "DELAYED"] as const)(
    "never presents generated %s telemetry as a real transaction", (outcome) => {
      const presentation = presentSimulatedActivity(outcome, "Example activity phrase");

      expect(presentation.status).toBe("SIMULATED");
      expect(presentation.title).toMatch(/simulated/i);
      expect(presentation.message).toMatch(/^SIMULATION ONLY — no wallet movement was performed\./);
      expect(presentation.message).toContain("Example activity phrase");
      expect(presentation.simulatedOutcome).toBe(outcome);
    },
  );
});


describe("transaction-console event deduplication locks", () => {
  it("creates stable opaque lock names scoped to customer, session, and transaction", () => {
    const lockName = transactionConsoleEventLockName(42, "session-secret", "TX-123");

    expect(lockName).toHaveLength(64);
    expect(lockName).toMatch(/^arb_evt:[a-f0-9]{56}$/);
    expect(lockName).not.toContain("session-secret");
    expect(lockName).not.toContain("TX-123");
    expect(transactionConsoleEventLockName(42, "session-secret", "TX-123")).toBe(lockName);
    expect(transactionConsoleEventLockName(43, "session-secret", "TX-123")).not.toBe(lockName);
    expect(transactionConsoleEventLockName(42, "other-session", "TX-123")).not.toBe(lockName);
    expect(transactionConsoleEventLockName(42, "session-secret", "TX-456")).not.toBe(lockName);
  });

  it("acquires before running the callback and releases after it", async () => {
    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql.includes("GET_LOCK") ? "acquire" : "release");
      return sql.includes("GET_LOCK") ? [[{ acquired: 1 }], []] : [[{ released: 1 }], []];
    });
    const connection = { query } as unknown as PoolConnection;

    await expect(withTransactionConsoleEventLock(connection, "arb_evt:test", async () => {
      calls.push("work");
      return "inserted";
    })).resolves.toBe("inserted");

    expect(calls).toEqual(["acquire", "work", "release"]);
  });

  it("fails closed and does not run the callback when the lock times out", async () => {
    const query = vi.fn(async () => [[{ acquired: 0 }], []]);
    const connection = { query } as unknown as PoolConnection;
    const work = vi.fn(async () => "must not run");

    await expect(withTransactionConsoleEventLock(connection, "arb_evt:test", work))
      .rejects.toThrow(/unable to acquire transaction-console event deduplication lock/i);
    expect(work).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("releases the lock when the callback fails and preserves the original error", async () => {
    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql.includes("GET_LOCK") ? "acquire" : "release");
      return sql.includes("GET_LOCK") ? [[{ acquired: 1 }], []] : [[{ released: 1 }], []];
    });
    const connection = { query } as unknown as PoolConnection;
    const failure = new Error("simulated insert failure");

    await expect(withTransactionConsoleEventLock(connection, "arb_evt:test", async () => {
      calls.push("work");
      throw failure;
    })).rejects.toBe(failure);
    expect(calls).toEqual(["acquire", "work", "release"]);
  });
});
