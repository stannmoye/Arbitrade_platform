import { describe, expect, it } from "vitest";
import { inMiningTransaction, requestKey, type Db } from "./mining-store";

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
