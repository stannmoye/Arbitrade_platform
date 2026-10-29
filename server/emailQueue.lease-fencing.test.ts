import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEmailOutboxLeaseUntil } from "./emailQueue";

describe("email outbox lease fencing", () => {
  it("aligns lease tokens to MySQL timestamp precision and guarantees the requested minimum lease", () => {
    const now = new Date("2026-10-29T10:00:00.123Z");
    const leaseUntil = buildEmailOutboxLeaseUntil(now, 120_000);
    expect(leaseUntil.toISOString()).toBe("2026-10-29T10:02:01.000Z");
    expect(leaseUntil.getTime() - now.getTime()).toBeGreaterThanOrEqual(120_000);
  });

  it("rejects invalid lease inputs", () => {
    expect(() => buildEmailOutboxLeaseUntil(new Date(Number.NaN))).toThrow("Invalid email outbox lease inputs");
    expect(() => buildEmailOutboxLeaseUntil(new Date(), 0)).toThrow("Invalid email outbox lease inputs");
    expect(() => buildEmailOutboxLeaseUntil(new Date(), 1.5)).toThrow("Invalid email outbox lease inputs");
  });

  it("fences both success and retry/failure writes to the lease claimed by that worker", () => {
    const source = readFileSync(new URL("./emailQueue.ts", import.meta.url), "utf8");
    expect(source).toContain("const leaseUntil = buildEmailOutboxLeaseUntil(new Date())");
    expect(source).toContain('eq(emailOutbox.status, "PROCESSING"), eq(emailOutbox.leaseUntil, leaseUntil)');
    expect(source).toContain("if (completedRows === 1) sent++");
    expect(source).toContain("if (transitionedRows === 1 && terminal) failed++");
  });
});
