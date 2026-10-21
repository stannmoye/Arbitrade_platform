import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("administrator wallet adjustment concurrency contract", () => {
  it("locks the customer row before reading or creating a currency balance", () => {
    const start = db.indexOf("export async function adjustCustomerBalance");
    const end = db.indexOf("\nexport async function listOpenOffers", start);
    const implementation = db.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).toContain('.limit(1).for("update"))[0]');
    expect(implementation).toContain('from(customerBalances).where(and(eq(customerBalances.userId,input.userId),eq(customerBalances.currency,currency.code))).limit(1).for("update"))[0]');
    expect(implementation).toContain("await db.transaction(async tx=>");
    expect(implementation).toContain("await tx.insert(balanceLedger).values");
  });

  it("keeps balance mutation and its ledger record in the same transaction", () => {
    const start = db.indexOf("export async function adjustCustomerBalance");
    const end = db.indexOf("\nexport async function listOpenOffers", start);
    const implementation = db.slice(start, end);
    expect(implementation.indexOf("await tx.update(customerBalances)")).toBeGreaterThan(-1);
    expect(implementation.indexOf("await tx.insert(balanceLedger)")).toBeGreaterThan(implementation.indexOf("await tx.update(customerBalances)"));
  });
});
