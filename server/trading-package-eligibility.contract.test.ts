import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("server-side trading package eligibility", () => {
  it("blocks automatic opportunity delivery without a matching active subscription", () => {
    const start = source.indexOf("export async function listCustomerOpportunities(");
    const end = source.indexOf("export async function runAutoTradeCycle(", start);
    const implementation = source.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).toContain("customerPackageSubscriptions");
    expect(implementation).toContain('eq(customerPackageSubscriptions.status,"active")');
    expect(implementation).toContain(".innerJoin(packages,eq(customerPackageSubscriptions.packageId,packages.id))");
    expect(implementation).toContain("noPackage:true");
    expect(implementation).toContain("eq(packages.enabled,true)");
    expect(implementation).not.toContain("packageDeliveryDisabled:true");
    expect(implementation).toContain("const eligibleSubscriptions=subscriptions;");
    expect(implementation).toContain("const autoTradeCandidates=tradeCandidates.filter((offer:any)=>");
    expect(implementation).toContain("if(offer.popupEligible!==true) return false;");
    expect(implementation).toContain("Boolean(packagePolicy.enabled) && packagePolicy.automaticTradingEnabled!==false");
    expect(implementation).not.toContain("drainMode");
  });

  it("rechecks active package eligibility inside the trade-allocation transaction", () => {
    const start = source.indexOf("export async function createTrade(");
    const end = source.indexOf("\nexport async function ", start + 5);
    const implementation = source.slice(start, end);
    expect(implementation).toContain("db.transaction(async tx=>");
    expect(implementation).toContain("customerPackageSubscriptions");
    expect(implementation).toContain('eq(customerPackageSubscriptions.status,"active")');
    expect(implementation).toContain('.for("update")');
    expect(implementation).toContain("SELECT id,loginMethod FROM users WHERE id=${userId} FOR UPDATE");
    expect(implementation).toContain('if(!activePackageSubscriptions.length) throw new Error("An eligible active trading package subscription is required")');
    expect(implementation).toContain('if(!subscriptionsWithQuota.length) throw new Error("All active package opportunity quotas have been used for today")');
  });
  it("never auto-allocates a pending or retrying popup that was not delivered", () => {
    const start = source.indexOf("async function autoTradeOpenOpportunities(");
    const end = source.indexOf("\nexport async function listCustomerOpportunities(", start);
    const implementation = source.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).toContain("if(offer.popupEligible" + "!==true) continue;");
    expect(implementation).toContain("deliveryEventId:offer.deliveryEventId ? Number(offer.deliveryEventId) : undefined");
  });

});
