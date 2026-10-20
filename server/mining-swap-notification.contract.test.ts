import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../mining.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function confirmCustomerMiningSwap(");
const end = source.indexOf("function normalizeMiningHistoryDetails(", start);
const swap = source.slice(start, end);

describe("mining swap notification transaction boundary", () => {
  it("does not write notification rows inside the financial transaction", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const transactionEnd = swap.indexOf("  // The main-wallet conversion and mining journal have committed");
    expect(transactionEnd).toBeGreaterThan(0);
    expect(swap.slice(0, transactionEnd)).not.toContain("createMiningNotification(");
  });

  it("emits the success notice only in the best-effort post-commit notification batch", () => {
    const transactionEnd = swap.indexOf("  // The main-wallet conversion and mining journal have committed");
    const postCommit = swap.slice(transactionEnd);
    expect(postCommit).toContain('createNotification(userId,"Mining swap completed"');
    expect(postCommit).toContain('eventKey:`mining-swap:${result.receiptReference}`');
    expect(postCommit).toContain('console.error("[Notifications] Mining swap notices failed after commit:"');
  });
});
