import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function listCustomerOpportunities(");
const end = source.indexOf("export async function runAutoTradeCycle(", start);
const implementation = source.slice(start, end);
const generatorStart = source.indexOf("async function generateAutomaticCustomerOpportunity(");
const generatorEnd = source.indexOf("const OPPORTUNITY_GENERATION_CONTROL_KEY", generatorStart);
const generator = source.slice(generatorStart, generatorEnd);
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
    expect(implementation).toContain("calculateCombinedAvailableTargetMinor");
    expect(implementation).toContain("getFreshTradingFxRate");
    expect(implementation).toContain("balanceStatus:balance.balanceStatus");
    expect(source).toContain("function projectPopupBalance(");
    expect(implementation).toContain("shortfallMinor:Math.max(0,Number(offer.minimumMinor)-availableMinor)");
    expect(implementation).toContain("const popupBalance=currentBalanceSnapshots[index]||projectPopupBalance(row.popupMinimumMinor,row.balanceAvailableMinor,row.balanceStatus)");
    expect(implementation).toContain("shortfallMinor:popupBalance.shortfallMinor");
    expect(walletFx).toContain("calculateCombinedAvailableTargetMinor");
    expect(autoTrade).not.toContain("listBalances(userId)");
    expect(autoTrade).not.toContain('find(row=>String(row.currency).toUpperCase()===String(offer.currency).toUpperCase())');
    expect(autoTrade).not.toContain("INSUFFICIENT_AVAILABLE_BALANCE");
  });

  it("does not let an insufficient-balance popup block the next generated opportunity", () => {
    expect(implementation).toContain("const insufficientBalanceOfferIds=new Set<number>()");
    expect(implementation).toContain('eq(opportunityPopupEvents.balanceStatus,"insufficient")');
    expect(implementation).toContain("if(insufficientBalanceOfferIds.has(offerId)) return false");
    expect(implementation).toContain('["generated","delivered"].includes(assignmentStatus)');
  });

  it("does not reuse an open generated offer after its popup is classified as insufficient balance", () => {
    expect(generator).toContain("NOT EXISTS");
    expect(generator).toContain("opportunityPopupEvents.offerId");
    expect(generator).toContain("opportunityPopupEvents.balanceStatus");
    expect(generator).toContain("= 'insufficient'");
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

  it("refreshes visible opportunity balances server-side and renders only the authoritative result", () => {
    const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    const start = app.indexOf("function CustomerOpportunities(");
    const end = app.indexOf("\nfunction CompanyReferenceLogo(", start);
    const component = app.slice(start, end);
    expect(implementation).toContain("calculateCombinedBalanceSnapshot({");
    expect(implementation).toContain("const currentBalanceSnapshots=await Promise.all(popupRows.map");
    expect(implementation).toContain("balanceValuationCurrency:currentBalanceSnapshots[index]?.valuationCurrency");
    expect(component).toContain("offer.balanceAvailableMinor");
    expect(component).toContain("offer.balanceStatus");
    expect(component).toContain("offer.shortfallMinor");
    expect(component).toContain("offer.balanceValuationCurrency");
    expect(component).toContain("utils.customer.opportunities.invalidate()");
    expect(component).not.toContain("availableFor=(currency");
    expect(component).not.toContain("balances.data?.balances?.find((item:any)=>String(item.currency||\"\").toUpperCase()===code)");
  });

  it("keeps insufficient combined funds fail-closed without partial wallet movement", () => {
    const funding = readFileSync(new URL("./modules/trading-wallet-fx.ts", import.meta.url), "utf8");
    expect(funding).toContain("if (remainingTargetMinor > 0) throw new Error(\"Insufficient combined spendable wallet balance at current exchange rates\")");
    expect(funding).toContain("return { targetCreditMinor, sourceDebits }");
    expect(createTrade).toContain("await tx.update(customerBalances).set({");
    expect(createTrade).toContain("throw new Error(\"Insufficient available balance after FX conversion\")");
  });
});
