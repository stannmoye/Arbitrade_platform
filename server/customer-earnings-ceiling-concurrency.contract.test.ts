import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function createTrade(");
const end = source.indexOf("\nexport async function listTrades(", start);
const implementation = source.slice(start, end);

describe("customer-wide earnings ceiling concurrency guard", () => {
  it("locks the customer row before aggregating cross-currency capacity", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const lock = implementation.indexOf("const ceilingUserLock=");
    const ceiling = implementation.indexOf("const customerEarningsCeiling=await getCustomerEarningsCeilingPolicy();");
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(implementation.slice(lock, ceiling)).toContain('.for("update")');
    expect(lock).toBeLessThan(ceiling);
    expect(implementation).toContain("Serialize this customer's allocation transactions");
  });
});
