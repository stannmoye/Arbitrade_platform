import { describe, expect, it, vi } from "vitest";
import { assertMiningPackagePurchaseIdempotencyReplay, assertMiningQuoteIdempotencyReplay } from "./mining";

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


function fakePackageConnection(persistedPackageVersionId?: number) {
  const rows = persistedPackageVersionId === undefined ? [] : [{ packageVersionId: persistedPackageVersionId }];
  const query = vi.fn(async (_sql: string, _values?: unknown[]) => [rows, []] as any);
  return { query } as any;
}

describe("Mining convenience purchase idempotency replay guard", () => {
  it("returns the previous result only when the package version matches", async () => {
    const conn = fakePackageConnection();
    await expect(assertMiningPackagePurchaseIdempotencyReplay(conn, 1900000123, { packageVersionId: "52" }, 52))
      .resolves.toBeUndefined();
    expect(conn.query).not.toHaveBeenCalled();
  });

  it("rejects reusing the same idempotency key for a different package", async () => {
    const conn = fakePackageConnection();
    await expect(assertMiningPackagePurchaseIdempotencyReplay(conn, 1900000123, { packageVersionId: 53, purchaseId: 300 }, 52))
      .rejects.toThrow(/different Mining package/);
    expect(conn.query).not.toHaveBeenCalled();
  });

  it("checks the persisted entitlement for legacy responses without a package version", async () => {
    const conn = fakePackageConnection(52);
    await expect(assertMiningPackagePurchaseIdempotencyReplay(conn, 1900000123, { purchaseId: 300 }, 52))
      .resolves.toBeUndefined();
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM mining_customer_packages"),
      [300, 1900000123],
    );
  });


  it("fails clearly when a legacy result has no verifiable package entitlement", async () => {
    const conn = fakePackageConnection();
    await expect(assertMiningPackagePurchaseIdempotencyReplay(conn, 1900000123, { purchaseId: 300 }, 52))
      .rejects.toThrow(/Unable to verify the original Mining package/);
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM mining_customer_packages"),
      [300, 1900000123],
    );
  });

  it("rejects a legacy result when the committed entitlement belongs to another package version", async () => {
    const conn = fakePackageConnection(53);
    await expect(assertMiningPackagePurchaseIdempotencyReplay(conn, 1900000123, { purchaseId: 300 }, 52))
      .rejects.toThrow(/different Mining package/);
  });
});
