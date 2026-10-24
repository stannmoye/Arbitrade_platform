import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function listCustomerOpportunities(");
const end = source.indexOf("export async function runAutoTradeCycle(", start);
const implementation = source.slice(start, end);

describe("insufficient-balance opportunity handling", () => {
  it("does not suppress eligible opportunities just because no wallet has available funds", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).not.toContain("if(!hasAnyWalletFunds)");
    expect(implementation).not.toContain("noWalletFunds:true");
    expect(implementation).toContain("autoTradeOpenOpportunities(userId,autoTradeCandidates,effectiveControls)");
    expect(implementation).toContain("noPackage:true");
    expect(implementation).toContain("eq(packages.enabled,true)");
  });

  it("records an insufficient-balance miss without allocating or debiting funds", () => {
    const mark = source.slice(source.indexOf("async function markMissedOpportunity("), source.indexOf("async function markOpportunityExecuted("));
    const autoTrade = source.slice(source.indexOf("async function autoTradeOpenOpportunities("), source.indexOf("export async function listCustomerOpportunities("));
    expect(mark).toContain('status:"MISSED"');
    expect(autoTrade).toContain("INSUFFICIENT_AVAILABLE_BALANCE");
    expect(autoTrade).toContain("const requestedAmount=Math.max(offerMinimum,packageMinimum)");
    expect(autoTrade).toContain("if(!balance||Number(balance.availableMinor)<requestedAmount)");
    expect(autoTrade.indexOf("if(!balance||Number(balance.availableMinor)<requestedAmount)")).toBeLessThan(autoTrade.indexOf("createTrade(userId,{"));
    expect(autoTrade).toContain("INSUFFICIENT_AVAILABLE_BALANCE");
    expect(autoTrade).toContain("await markMissedOpportunity");
    expect(autoTrade).not.toContain("balanceLedger");
  });
});
