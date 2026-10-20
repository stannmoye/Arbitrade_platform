import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("financial notification delivery observability", () => {
  it("reports failed allocation, settlement, and trade-allocation notices after commit", () => {
    expect(source).toContain('Automatic allocation notices failed after ledger commit.');
    expect(source).toContain('Automatic settlement notices failed after ledger commit.');
    expect(source).toContain('Trade allocation notices failed after ledger commit.');
    expect(source).toContain('allocationNoticeResults.some(outcome=>outcome.status==="rejected")');
    expect(source).toContain('settlementNoticeResults.some(outcome=>outcome.status==="rejected")');
  });
});
