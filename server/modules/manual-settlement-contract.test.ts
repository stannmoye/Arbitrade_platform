import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dbSource = readFileSync(new URL("../db.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("../routers.ts", import.meta.url), "utf8");
const start = dbSource.indexOf("export async function manuallySettleTrade");
const end = dbSource.indexOf("export async function createOpportunityOffer", start);
const settlementSource = dbSource.slice(start, end);

describe("manual trade settlement transaction contract", () => {
  it("locks the trade and wallet rows before posting financial entries", () => {
    expect(settlementSource).toContain(
      'from(tradePositions).where(eq(tradePositions.id,tradeId)).limit(1).for("update")',
    );
    expect(settlementSource).toContain(
      'from(customerBalances).where(and(eq(customerBalances.userId,trade.userId),eq(customerBalances.currency,trade.currency))).limit(1).for("update")',
    );
    expect(settlementSource.indexOf('.from(tradePositions)')).toBeLessThan(
      settlementSource.indexOf('entryType:"trade_principal_release"'),
    );
    expect(settlementSource.indexOf('.from(customerBalances)')).toBeLessThan(
      settlementSource.indexOf('entryType:"trade_principal_release"'),
    );
  });

  it("rejects inconsistent locked funds and unsafe settlement totals", () => {
    expect(settlementSource).toContain(
      'Number(wallet.lockedMinor)<principal) throw new Error("Customer locked balance is insufficient for trade settlement")',
    );
    expect(settlementSource).toContain("if(!Number.isSafeInteger(principal)||principal<=0)");
    expect(settlementSource).toContain("if(!Number.isSafeInteger(total))");
    expect(settlementSource).not.toContain("GREATEST(${customerBalances.lockedMinor}");
  });

  it("keeps settlement references within the ledger column's supported length", () => {
    expect(settlementSource).toContain("if(reference.length>70)");
    const route = routerSource.slice(routerSource.indexOf("confirmManualSettlement"));
    expect(route.slice(0, 500)).toContain("settlementReference: z.string().trim().min(3).max(70)");
  });
});
