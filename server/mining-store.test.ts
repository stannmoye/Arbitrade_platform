import { describe, expect, it } from "vitest";
import { requestKey } from "./mining-store";

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
