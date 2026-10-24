import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function markDueTradesAwaitingConfirmation(");
const end = source.indexOf("\nexport async function ", start + 1);
const implementation = source.slice(start, end);

describe("automatic trade settlement safety", () => {
  it("never posts wallet or ledger money merely because the scheduled time elapsed", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).toContain("Awaiting Settlement Confirmation");
    expect(implementation).toContain("settlement_due_waiting_for_confirmation");
    expect(implementation).not.toContain("balanceLedger");
    expect(implementation).not.toContain("customerBalances");
    expect(implementation).not.toContain('status:"settled"');
    expect(implementation).not.toContain('settlementStatus:"completed"');
  });

  it("locks and rechecks due trades before writing one lifecycle event", () => {
    expect(implementation).toContain('.limit(1).for("update")');
    expect(implementation).toContain('eq(tradePositions.status,"confirmed")');
    expect(implementation).toContain('eq(tradePositions.settlementStatus,"pending")');
    expect(implementation).toContain('assertExactlyOneAffectedRow(stateUpdate,"Due trade awaiting-confirmation transition")');
  });
});
