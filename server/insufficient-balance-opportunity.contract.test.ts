import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function listCustomerOpportunities(");
const end = source.indexOf("export async function runAutoTradeCycle(", start);
const implementation = source.slice(start, end);
const autoTradeStart = source.indexOf("async function autoTradeOpenOpportunities(");
const autoTradeEnd = source.indexOf("export async function listCustomerOpportunities(", autoTradeStart);
const autoTrade = source.slice(autoTradeStart, autoTradeEnd);
const createTradeStart = source.indexOf("export async function createTrade(");
const createTrade = source.slice(createTradeStart);
const walletFx = readFileSync(new URL("./modules/trading-wallet-fx.ts", import.meta.url), "utf8");

describe("insufficient-balance opportunity handling", () => {
  it("does not suppress eligible opportunities because the target-currency wallet alone is short", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).not.toContain("if(!hasAnyWalletFunds)");
    expect(implementation).not.toContain("noWalletFunds:true");
    expect(implementation).toContain("autoTradeOpenOpportunities(userId,autoTradeCandidates,effectiveControls)");
    expect(implementation).toContain("noPackage:true");
    expect(implementation).toContain("eq(packages.enabled,true)");
    expect(autoTrade).not.toContain("listBalances(userId)");
    expect(autoTrade).not.toContain('find(row=>String(row.currency).toUpperCase()===String(offer.currency).toUpperCase())');
    expect(autoTrade).not.toContain("INSUFFICIENT_AVAILABLE_BALANCE");
  });

  it("delegates the authoritative balance decision to atomic multi-wallet FX funding", () => {
    expect(autoTrade).toContain("const requestedAmount=Math.max(offerMinimum,packageMinimum)");
    expect(autoTrade).toContain("createTrade(userId,{");
    expect(createTrade).toContain("getFreshTradingFxRate(config)");
    expect(createTrade).toContain("planCrossWalletFunding({");
    expect(walletFx).toContain("Insufficient combined spendable wallet balance");
    expect(createTrade).toContain("ORDER BY currency FOR UPDATE");
    expect(createTrade).toContain("trade_fx_conversion_debit");
    expect(createTrade).toContain("trade_fx_conversion_credit");
  });

  it("keeps insufficient combined funds fail-closed without partial wallet movement", () => {
    const funding = readFileSync(new URL("./modules/trading-wallet-fx.ts", import.meta.url), "utf8");
    expect(funding).toContain("if (remainingTargetMinor > 0) throw new Error(\"Insufficient combined spendable wallet balance at current exchange rates\")");
    expect(funding).toContain("return { targetCreditMinor, sourceDebits }");
    expect(createTrade).toContain("await tx.update(customerBalances).set({");
    expect(createTrade).toContain("throw new Error(\"Insufficient available balance after FX conversion\")");
  });
});
