import { describe, expect, it, vi } from "vitest";
import { assertMiningQuoteIdempotencyReplay } from "./mining";

function fakeConnection(persistedQuoteId?: number) {
  const rows = persistedQuoteId === undefined ? [] : [{ quoteId: persistedQuoteId }];
  const query = vi.fn(async (_sql: string, _values?: unknown[]) => [rows, []] as any);
  return { query } as any;
}

describe("Mining quote idempotency replay guard", () => {
  it("uses the saved quote ID directly without another database lookup", async () => {
    const conn = fakeConnection();
    await expect(assertMiningQuoteIdempotencyReplay(conn, 1900000123, { quoteId: "42" }, 42, "purchase"))
      .resolves.toBeUndefined();
    expect(conn.query).not.toHaveBeenCalled();
  });

  it("rejects a reused purchase key when the requested quote differs", async () => {
    const conn = fakeConnection();
    await expect(assertMiningQuoteIdempotencyReplay(conn, 1900000123, { quoteId: 43, purchaseId: 300 }, 42, "purchase"))
      .rejects.toThrow(/different quote/);
    expect(conn.query).not.toHaveBeenCalled();
  });

  it("resolves legacy purchase results from the committed entitlement row", async () => {
    const conn = fakeConnection(42);
    await expect(assertMiningQuoteIdempotencyReplay(conn, 1900000123, { purchaseId: 300 }, 42, "purchase"))
      .resolves.toBeUndefined();
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM mining_customer_packages"),
      [300, 1900000123],
    );
  });

  it("resolves legacy swap results from the conversion row and rejects a different quote", async () => {
    const conn = fakeConnection(43);
    await expect(assertMiningQuoteIdempotencyReplay(conn, 1900000123, { conversionId: 500 }, 42, "swap"))
      .rejects.toThrow(/different quote/);
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM v5_conversions"),
      [500, 1900000123],
    );
  });

  it("fails clearly when a legacy result cannot be tied to a persisted quote", async () => {
    const conn = fakeConnection();
    await expect(assertMiningQuoteIdempotencyReplay(conn, 1900000123, { purchaseId: 300 }, 42, "purchase"))
      .rejects.toThrow(/Unable to verify the original quote/);
    await expect(assertMiningQuoteIdempotencyReplay(conn, 1900000123, {}, 42, "swap"))
      .rejects.toThrow(/Unable to verify the original quote/);
  });
});
