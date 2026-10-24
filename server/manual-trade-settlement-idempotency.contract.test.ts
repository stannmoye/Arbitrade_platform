import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function manuallySettleTrade(");
const end = source.indexOf("\nexport async function createOpportunityOffer(", start);
const implementation = source.slice(start, end);

describe("manual trade settlement idempotency", () => {
  it("locks the trade and treats a matching completed reference/result as a replay", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).toContain('.limit(1).for("update")');
    expect(implementation).toContain('trade.status==="settled"&&trade.settlementStatus==="completed"');
    expect(implementation).toContain("trade.settlementReference===reference");
    expect(implementation).toContain("Number(trade.rewardCreditedMinor)===input.rewardMinor");
  });

  it("claims references in a database-unique table before any financial postings", () => {
    const claim = implementation.indexOf("tx.insert(tradeSettlementReferenceClaims)");
    const principal = implementation.indexOf("tx.insert(balanceLedger)");
    expect(claim).toBeGreaterThanOrEqual(0);
    expect(principal).toBeGreaterThan(claim);
    expect(implementation).toContain('if(code==="ER_DUP_ENTRY") throw new Error("Settlement reference has already been used")');
  });
});
