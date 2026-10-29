import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("server-side automatic Trading tier eligibility", () => {
  it("blocks automatic opportunity delivery without a matching active auto-assigned tier", () => {
    const start = source.indexOf("export async function listCustomerOpportunities(");
    const end = source.indexOf("export async function runAutoTradeCycle(", start);
    const implementation = source.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).toContain("customerPackageSubscriptions");
    expect(implementation).toContain('.filter(subscription=>String(subscription.activationKey||"").startsWith("auto-tier:"))');
    expect(implementation).toContain('eq(customerPackageSubscriptions.status,"active")');
    expect(implementation).toContain(".innerJoin(packages,eq(customerPackageSubscriptions.packageId,packages.id))");
    expect(implementation).toContain("noPackage:true");
    expect(implementation).toContain("eq(packages.enabled,true)");
    expect(implementation).not.toContain("packageDeliveryDisabled:true");
    expect(implementation).toContain("const eligibleSubscriptions=subscriptions.filter(subscription=>");
    expect(implementation).toContain("return Boolean(configured && configured.enabled && configured.automaticDelivery)");
    expect(implementation).not.toContain("return !configured");
    expect(implementation).toContain("packagePolicyPaused:true");
    expect(implementation).toContain("const autoTradeCandidates=tradeCandidates.filter((offer:any)=>");
    expect(implementation).toContain("if(offer.popupEligible!==true || allocationControls.allocationsPaused) return false;");
    expect(implementation).toContain("deliveryStatus:opportunityPopupEvents.deliveryStatus");
    expect(implementation).toContain('["delivered","received","rendered"].includes(String(row.deliveryStatus))');
    expect(implementation).toContain("Boolean(packagePolicy && packagePolicy.enabled && packagePolicy.automaticDelivery && packagePolicy.automaticTradingEnabled)");
    expect(implementation).toContain("if(!subscription) return null;");
    expect(implementation).toContain(".filter((offer) => offer !== null)");
    expect(implementation).not.toContain("drainMode");
  });

  it("rechecks auto-assigned tier eligibility inside the trade-allocation transaction", () => {
    const start = source.indexOf("export async function createTrade(");
    const end = source.indexOf("\nexport async function ", start + 5);
    const implementation = source.slice(start, end);
    expect(implementation).toContain("db.transaction(async tx=>");
    expect(implementation).toContain("customerPackageSubscriptions");
    expect(implementation).toContain('eq(customerPackageSubscriptions.status,"active")');
    expect(implementation).toContain('.for("update")');
    expect(implementation).toContain("SELECT id,loginMethod FROM users WHERE id=${userId} FOR UPDATE");
    expect(implementation).toContain('if(!activePackageSubscriptions.length) throw new Error("An automatically assigned eligible Trading tier is required")');
    expect(implementation).toContain('if(!subscriptionsWithQuota.length) throw new Error("All eligible Trading tier opportunity quotas have been used for today")');
    expect(implementation).toContain("samePackageSubscription");
    expect(implementation).toContain("No eligible package subscription remains for this allocation");
    expect(implementation).toContain("Number(subscription.packageId)===input.packageId");
    expect(implementation).toContain('eq(appSettings.settingKey,"trading.allocations.paused")');
    expect(implementation).toContain("if(allocationControls.allocationsPaused)");
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

  it("does not permanently mark a delivered opportunity missed when an admin pauses allocations", () => {
    const start = source.indexOf("async function autoTradeOpenOpportunities(");
    const end = source.indexOf("\nexport async function listCustomerOpportunities(", start);
    const implementation = source.slice(start, end);
    expect(implementation).toContain("if(/new trading allocations are paused by an administrator/i.test(message))");
    expect(implementation).toContain('status:"RETRYING"');
    expect(implementation).toContain("releaseAttempt:true");
  });

});
