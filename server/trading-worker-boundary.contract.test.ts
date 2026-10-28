import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const customerHome = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const packagePanel = readFileSync(new URL("../client/src/components/CustomerTradingPackages.tsx", import.meta.url), "utf8");
const serverCore = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");

function section(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error("Missing source marker: " + startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error("Missing source marker: " + endMarker);
  return source.slice(start, end);
}

describe("trading allocation worker boundary", () => {
  it("keeps free package activation separate from opportunity execution", () => {
    const activation = section(db, "export async function activateCustomerTradingPackage(", "\nexport async function listOpportunityPackagePolicies(");
    expect(activation).not.toContain("listCustomerOpportunities");
    expect(activation).not.toContain("immediateCycle");
    expect(activation).toContain("Free trading package activated after qualifying-wallet-balance validation.");
  });

  it("keeps customer opportunity reads allocation-disabled by default", () => {
    const opportunities = section(db, "export async function listCustomerOpportunities(", "\nexport async function runAutoTradeCycle");
    expect(opportunities).toContain("workerCycle?:boolean");
    expect(opportunities).toMatch(/options\.workerCycle\s*===\s*true\s*\?/);
    const customerRoute = section(router, "opportunities: protectedProcedure.query(", "\n    trades: protectedProcedure.query");
    expect(customerRoute).toContain("listCustomerOpportunities(ctx.user.id)");
    expect(customerRoute).not.toContain("workerCycle:true");
  });

  it("runs allocations only through the existing scheduled server worker", () => {
    const worker = section(db, "export async function runAutoTradeCycle()", "\nexport async function createTrade(");
    expect(worker).toContain("listCustomerOpportunities(customer.id,{workerCycle:true,consumeDelivery:false})");
    expect(serverCore).toContain("const result = await runAutoTradeCycle();");
    expect(serverCore).toContain("const autoTradeTimer = setInterval");
  });

  it("keeps the customer package panel mounted and avoids false trade success", () => {
    expect(customerHome).toContain("<CustomerTradingPackages />");
    expect(packagePanel).not.toContain("automaticTradeCount");
    expect(packagePanel).toContain("Activation does not create a trade or debit your balance");
  });
});
