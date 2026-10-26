import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function markDueTradesAwaitingConfirmation(");
const end = source.indexOf("\nexport async function ", start + 1);
const implementation = source.slice(start, end);

const globalStart = source.indexOf("export async function reconcileAllDueTradesAwaitingConfirmation(");
const globalEnd = source.indexOf("\nexport async function listPendingSettlements(", globalStart);
const globalImplementation = source.slice(globalStart, globalEnd);

describe("global overdue trade reconciliation", () => {
  it("sweeps all customers' due pending trades without crediting funds", () => {
    expect(globalStart).toBeGreaterThanOrEqual(0);
    expect(globalEnd).toBeGreaterThan(globalStart);
    expect(globalImplementation).not.toContain("eq(tradePositions.userId");
    expect(globalImplementation).toContain('eq(tradePositions.status,"confirmed")');
    expect(globalImplementation).toContain('eq(tradePositions.settlementStatus,"pending")');
    expect(globalImplementation).toContain("limit(1000)");
    expect(globalImplementation).toContain('notInArray(tradePositions.lifecycleStage,["Awaiting Settlement Confirmation"])');
    expect(globalImplementation).toContain("settlement_due_waiting_for_confirmation");
    expect(globalImplementation).not.toContain("balanceLedger");
    expect(globalImplementation).not.toContain("customerBalances");
    expect(globalImplementation).not.toContain('status:"settled"');
    expect(globalImplementation).toContain("Global due-trade awaiting-confirmation transition");
  });

  it("re-locks each trade and skips rows already reconciled or no longer due", () => {
    expect(globalImplementation).toContain('.limit(1).for("update")');
    expect(globalImplementation).toContain('trade.lifecycleStage==="Awaiting Settlement Confirmation"');
    expect(globalImplementation).toContain('new Date(dueAt).getTime()>now.getTime()');
  });
});

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
