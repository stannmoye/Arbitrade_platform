import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./mining-admin.ts", import.meta.url), "utf8");

describe("mining-admin notification idempotency", () => {
  it("uses a stable business event key for every administrative notification path", () => {
    const expectedCalls = [
      ["Sandbox Mining package granted", "mining-admin-grant:${entitlementId}"],
      ["Mining balance adjustment posted", "mining-adjustment-posted:${requestId}"],
      ["Mining adjustment not approved", "mining-adjustment-rejected:${input.requestId}"],
      ["Mining adjustment approved", "mining-adjustment-approved:${input.requestId}"],
      ["Mining transaction reversed", "mining-reversal:${input.transactionId}"],
    ] as const;

    for (const [title, eventKey] of expectedCalls) {
      const titleIndex = source.indexOf(title);
      const occurrence = source.lastIndexOf("createMiningNotification", titleIndex);
      expect(occurrence, `${title} notification call is present`).toBeGreaterThan(-1);
      const callEnd = source.indexOf(");", occurrence);
      expect(callEnd, `${title} notification call is syntactically terminated`).toBeGreaterThan(occurrence);
      expect(source.slice(occurrence, callEnd)).toContain(eventKey);
    }
  });

  it("does not retain a bare createMiningNotification call in mining-admin.ts", () => {
    const calls = source.match(/createMiningNotification\([^;]+\);/gs) ?? [];
    expect(calls.length).toBe(5);
    for (const call of calls) expect(call).toContain("`mining-");
  });
});
