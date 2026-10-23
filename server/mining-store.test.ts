import { describe, expect, it, vi } from "vitest";
import { parseMainWalletMinor } from "./mining";
import {
  addUtcMonths,
  amountString,
  assertMiningAsset,
  beginMiningIdempotency,
  finishMiningIdempotency,
  decimal,
  inMiningTransaction,
  postMiningLedgerEntries,
  requestKey,
  requireActiveMiningAccount,
  type Db,
} from "./mining-store";


describe("Main-wallet minor-unit precision", () => {
  it("accepts exact non-negative values within JavaScript's safe-integer range", () => {
    expect(parseMainWalletMinor(0)).toBe(0);
    expect(parseMainWalletMinor("12345")).toBe(12345);
    expect(parseMainWalletMinor(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("fails closed when a database BIGINT cannot be represented exactly", () => {
    expect(() => parseMainWalletMinor("9007199254740992")).toThrow(/stored main-wallet balance/i);
    expect(() => parseMainWalletMinor(9007199254740992)).toThrow(/stored main-wallet balance/i);
  });

  it("rejects negative and malformed stored balances", () => {
    expect(() => parseMainWalletMinor("-1")).toThrow(/stored main-wallet balance/i);
    expect(() => parseMainWalletMinor("1.5")).toThrow(/stored main-wallet balance/i);
    expect(() => parseMainWalletMinor("")).toThrow(/stored main-wallet balance/i);
    expect(() => parseMainWalletMinor(Number.NaN)).toThrow(/stored main-wallet balance/i);
  });
});

describe("Mining amount and asset normalization", () => {
  it("rounds display/storage amounts down to the denomination precision", () => {
    expect(amountString("12.349", "USD")).toBe("12.34");
    expect(amountString("0.123456789", "BTC")).toBe("0.12345678");
    expect(amountString("-1.239", "USD")).toBe("-1.23");
  });

  it("rejects unsupported denominations instead of silently choosing a scale", () => {
    expect(() => amountString("1", "DOGE")).toThrow(/not supported/i);
    expect(() => assertMiningAsset("DOGE")).toThrow(/supported Mining denomination/i);
  });

  it("normalizes the legacy TOKEN alias to CKI", () => {
    expect(assertMiningAsset("TOKEN")).toBe("CKI");
    expect(assertMiningAsset(" token ")).toBe("CKI");
    expect(assertMiningAsset("USD")).toBe("USD");
  });

  it("rejects non-finite decimal input", () => {
    expect(() => decimal("NaN")).toThrow(/invalid decimal/i);
    expect(() => decimal("Infinity")).toThrow(/invalid decimal/i);
  });
});

describe("Mining account lifecycle locking", () => {
  it("locks the customer row before checking Mining restrictions", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([[{ id: 42, loginMethod: "email" }], []])
      .mockResolvedValueOnce([[{ accountStatus: "active" }], []]);
    const conn = { query } as unknown as Db;

    await expect(requireActiveMiningAccount(conn, 42)).resolves.toBe("active");
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toMatch(/FROM users WHERE id=\? LIMIT 1 FOR UPDATE/i);
    expect(query.mock.calls[0]?.[1]).toEqual([42]);
    expect(query.mock.calls[1]?.[0]).toContain("FROM customer_controls");
  });

  it("rejects closed accounts before reading customer controls", async () => {
    const query = vi.fn().mockResolvedValueOnce([[{ id: 42, loginMethod: "closed" }], []]);
    const conn = { query } as unknown as Db;

    await expect(requireActiveMiningAccount(conn, 42)).rejects.toThrow(/closed or missing account/i);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects missing account records", async () => {
    const query = vi.fn().mockResolvedValueOnce([[], []]);
    const conn = { query } as unknown as Db;

    await expect(requireActiveMiningAccount(conn, 42)).rejects.toThrow(/closed or missing account/i);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("Mining contract month arithmetic", () => {
  it("clamps month-end dates to the last valid day of the target month", () => {
    expect(addUtcMonths(new Date("2024-01-31T12:30:00.000Z"), 1).toISOString())
      .toBe("2024-02-29T12:30:00.000Z");
    expect(addUtcMonths(new Date("2023-01-31T12:30:00.000Z"), 1).toISOString())
      .toBe("2023-02-28T12:30:00.000Z");
  });

  it("preserves the day when valid and rejects unsupported contract durations", () => {
    expect(addUtcMonths(new Date("2024-03-15T09:00:00.000Z"), 2).toISOString())
      .toBe("2024-05-15T09:00:00.000Z");
    expect(() => addUtcMonths(new Date("2024-01-01T00:00:00.000Z"), 0))
      .toThrow(/between one and 120 months/i);
    expect(() => addUtcMonths(new Date("2024-01-01T00:00:00.000Z"), 121))
      .toThrow(/between one and 120 months/i);
  });
});

describe("Mining idempotency request keys", () => {
  it("produces a stable opaque digest for the same operation and customer", () => {
    const first = requestKey("mining-swap", 42, "swap-request-0001");
    const retry = requestKey("mining-swap", 42, "swap-request-0001");

    expect(first).toBe(retry);
    expect(first).toMatch(/^mining-swap:42:[a-f0-9]{64}$/);
    expect(first).not.toContain("swap-request-0001");
  });

  it("isolates the same client key across customers and operation namespaces", () => {
    const customerA = requestKey("mining-swap", 42, "swap-request-0001");
    const customerB = requestKey("mining-swap", 43, "swap-request-0001");
    const purchase = requestKey("mining-purchase", 42, "swap-request-0001");

    expect(customerA).not.toBe(customerB);
    expect(customerA).not.toBe(purchase);
  });

  it("normalizes surrounding whitespace before hashing", () => {
    expect(requestKey("mining-swap", 42, "  swap-request-0001  "))
      .toBe(requestKey("mining-swap", 42, "swap-request-0001"));
  });

  it.each([
    "",
    "short",
    "spaces are not allowed",
    "contains/slash",
    "contains?query",
    "x".repeat(161),
  ])("rejects malformed idempotency keys: %j", (key) => {
    expect(() => requestKey("mining-swap", 42, key)).toThrow(/valid idempotency key/i);
  });
});


describe("Mining idempotency result persistence", () => {
  it("stores a result only while the reservation result is still empty", async () => {
    let captured: { sql: string; values: unknown[] } | undefined;
    const conn = {
      execute: async (sql: string, values: unknown[] = []) => {
        captured = { sql, values };
        return [{ affectedRows: 1 }, []];
      },
    } as unknown as Db;

    await expect(finishMiningIdempotency(conn, "mining-swap:42:digest", { conversionId: 123 }))
      .resolves.toBeUndefined();
    expect(captured?.sql).toContain("resultJson IS NULL");
    expect(captured?.values).toEqual(['{"conversionId":123}', "mining-swap:42:digest"]);
  });

  it("fails if the idempotency result could not be persisted", async () => {
    const conn = {
      execute: async () => [{ affectedRows: 0 }, []],
    } as unknown as Db;

    await expect(finishMiningIdempotency(conn, "mining-swap:42:missing", { conversionId: 123 }))
      .rejects.toThrow(/unable to persist the Mining idempotency result/i);
  });

  it("rolls back the transaction when idempotency result persistence fails", async () => {
    const calls: string[] = [];
    const conn = {
      beginTransaction: async () => { calls.push("begin"); },
      execute: async () => [{ affectedRows: 0 }, []],
      commit: async () => { calls.push("commit"); },
      rollback: async () => { calls.push("rollback"); },
    } as unknown as Db;

    await expect(inMiningTransaction(conn, async () => {
      calls.push("work");
      await finishMiningIdempotency(conn, "mining-swap:42:missing", { conversionId: 123 });
    })).rejects.toThrow(/unable to persist the Mining idempotency result/i);

    expect(calls).toEqual(["begin", "work", "rollback"]);
  });
});

describe("Mining ledger entry safeguards", () => {
  const transaction = { id: 7, referenceCode: "MIN-TEST" };

  it("rejects an unbalanced asset journal before touching the database", async () => {
    const conn = {} as Db;

    await expect(postMiningLedgerEntries(conn, transaction, [
      { userId: 42, asset: "USD", amount: "-10.00", entryType: "customer_debit" },
      { userId: 0, asset: "USD", amount: "9.99", entryType: "platform_credit" },
    ])).rejects.toThrow(/USD journal entries do not balance/i);
  });

  it("balances each asset independently instead of netting unlike denominations", async () => {
    const conn = {} as Db;

    await expect(postMiningLedgerEntries(conn, transaction, [
      { userId: 42, asset: "USD", amount: "1.00", entryType: "usd_debit" },
      { userId: 42, asset: "EUR", amount: "-1.00", entryType: "eur_credit" },
    ])).rejects.toThrow(/USD journal entries do not balance/i);
  });

  it("rejects ledger amounts that exceed the asset's supported precision", async () => {
    const conn = {} as Db;

    await expect(postMiningLedgerEntries(conn, transaction, [
      { userId: 42, asset: "CKI", amount: "-0.000000001", entryType: "customer_debit" },
      { userId: 0, asset: "CKI", amount: "0.000000001", entryType: "platform_credit" },
    ])).rejects.toThrow(/exceeds its supported precision/i);
  });
});

describe("Mining transaction wrapper", () => {
  it("commits and returns the callback result on success", async () => {
    const calls: string[] = [];
    const conn = {
      beginTransaction: async () => { calls.push("begin"); },
      commit: async () => { calls.push("commit"); },
      rollback: async () => { calls.push("rollback"); },
    } as unknown as Db;

    await expect(inMiningTransaction(conn, async () => {
      calls.push("work");
      return { conversionId: 123 };
    })).resolves.toEqual({ conversionId: 123 });

    expect(calls).toEqual(["begin", "work", "commit"]);
  });

  it("rolls back and rethrows the original error when work fails", async () => {
    const calls: string[] = [];
    const conn = {
      beginTransaction: async () => { calls.push("begin"); },
      commit: async () => { calls.push("commit"); },
      rollback: async () => { calls.push("rollback"); },
    } as unknown as Db;
    const failure = new Error("simulated conversion failure");

    await expect(inMiningTransaction(conn, async () => {
      calls.push("work");
      throw failure;
    })).rejects.toBe(failure);

    expect(calls).toEqual(["begin", "work", "rollback"]);
  });

  it("attempts rollback and preserves the commit error when commit fails", async () => {
    const calls: string[] = [];
    const commitFailure = new Error("simulated commit failure");
    const conn = {
      beginTransaction: async () => { calls.push("begin"); },
      commit: async () => { calls.push("commit"); throw commitFailure; },
      rollback: async () => { calls.push("rollback"); },
    } as unknown as Db;

    await expect(inMiningTransaction(conn, async () => {
      calls.push("work");
      return "result";
    })).rejects.toBe(commitFailure);

    expect(calls).toEqual(["begin", "work", "commit", "rollback"]);
  });

  it("preserves the original failure and attaches rollback failure diagnostics", async () => {
    const calls: string[] = [];
    const operationFailure = new Error("simulated conversion failure");
    const rollbackFailure = new Error("simulated rollback failure");
    const conn = {
      beginTransaction: async () => { calls.push("begin"); },
      commit: async () => { calls.push("commit"); },
      rollback: async () => { calls.push("rollback"); throw rollbackFailure; },
    } as unknown as Db;

    await expect(inMiningTransaction(conn, async () => {
      calls.push("work");
      throw operationFailure;
    })).rejects.toBe(operationFailure);

    expect(calls).toEqual(["begin", "work", "rollback"]);
    expect((operationFailure as Error & { rollbackError?: unknown }).rollbackError)
      .toBe(rollbackFailure);
  });

  it("does not execute transaction work when beginTransaction fails", async () => {
    const calls: string[] = [];
    const beginFailure = new Error("simulated begin failure");
    const conn = {
      beginTransaction: async () => { calls.push("begin"); throw beginFailure; },
      commit: async () => { calls.push("commit"); },
      rollback: async () => { calls.push("rollback"); },
    } as unknown as Db;

    await expect(inMiningTransaction(conn, async () => {
      calls.push("work");
      return "result";
    })).rejects.toBe(beginFailure);

    expect(calls).toEqual(["begin"]);
  });
});


describe("Mining idempotency reservation", () => {
  function mockConnection(row: { command: string; resultJson: string | null } | undefined, insertAffectedRows = 1) {
    const calls: Array<{ kind: string; sql: string; values: unknown[] }> = [];
    const conn = {
      execute: async (sql: string, values: unknown[] = []) => {
        calls.push({ kind: "execute", sql, values });
        return [{ affectedRows: insertAffectedRows }, []];
      },
      query: async (sql: string, values: unknown[] = []) => {
        calls.push({ kind: "query", sql, values });
        return [[...(row ? [row] : [])], []];
      },
    } as unknown as Db;
    return { conn, calls };
  }

  it("returns the stored result for a completed retry using the same key", async () => {
    const stored = { conversionId: 123, status: "EXECUTED" };
    const { conn, calls } = mockConnection({
      command: "mining.swap.confirm",
      resultJson: JSON.stringify(stored),
    }, 0);

    await expect(beginMiningIdempotency(conn, 42, "mining-swap:42:digest", "mining.swap.confirm"))
      .resolves.toEqual(stored);
    expect(calls).toHaveLength(2);
    expect(calls[0].kind).toBe("execute");
    expect(calls[0].sql).toContain("INSERT IGNORE INTO v5_idempotency_keys");
    expect(calls[1].kind).toBe("query");
    expect(calls[1].sql).toContain("FOR UPDATE");
  });

  it("rejects reusing an idempotency key for a different command", async () => {
    const { conn } = mockConnection({
      command: "mining.purchase.confirm",
      resultJson: JSON.stringify({ purchaseId: 77 }),
    }, 0);

    await expect(beginMiningIdempotency(conn, 42, "mining-swap:42:digest", "mining.swap.confirm"))
      .rejects.toThrow(/different Mining action/i);
  });

  it("rejects when the reservation cannot be found after insert-or-reuse", async () => {
    const { conn } = mockConnection(undefined);

    await expect(beginMiningIdempotency(conn, 42, "mining-swap:42:digest", "mining.swap.confirm"))
      .rejects.toThrow(/unable to reserve this operation/i);
  });

  it("returns null for a newly inserted reservation before the command runs", async () => {
    const { conn } = mockConnection({
      command: "mining.swap.confirm",
      resultJson: null,
    }, 1);

    await expect(beginMiningIdempotency(conn, 42, "mining-swap:42:digest", "mining.swap.confirm"))
      .resolves.toBeNull();
  });

  it("rejects a duplicate reservation that has no stored result instead of rerunning it", async () => {
    const { conn } = mockConnection({
      command: "mining.swap.confirm",
      resultJson: null,
    }, 0);

    await expect(beginMiningIdempotency(conn, 42, "mining-swap:42:digest", "mining.swap.confirm"))
      .rejects.toThrow(/already in progress/i);
  });
});
