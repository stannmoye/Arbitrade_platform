import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isTradingTierEnablingTransition } from "./modules/trading-tier-activation";
import { DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY, resolveEffectivePackageOpportunityPolicy } from "./modules/package-opportunity-policy";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const executionOffMigrationSource = readFileSync(new URL("../drizzle/0098_disable_automatic_financial_execution.sql", import.meta.url), "utf8");

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
    expect(implementation).toContain("return Boolean(configured && hasConfiguredTradingOfferPolicy(configured))");
    expect(implementation).not.toContain("return !configured");
    expect(implementation).toContain("globalPolicy.available&&globalPolicy.tierPolicyMasterEnabled&&globalPolicy.informationalPopupDeliveryEnabled");
    expect(source).toContain("function hasConfiguredTradingOfferPolicy(policy:any):boolean");
    expect(source).toContain("minimumPayoutRateBps==null?NaN:Number(policy.minimumPayoutRateBps)");
    expect(implementation).toContain("packagePolicyPaused:true");
    expect(implementation).toContain("const autoTradeCandidates=tradeCandidates.filter((offer:any)=>");
    expect(implementation).toContain("if(offer.executionEligible!==true || allocationControls.allocationsPaused) return false;");
    expect(implementation).toContain("deliveryStatus:opportunityPopupEvents.deliveryStatus");
    expect(implementation).toContain('["queued","in_progress","retry_wait","delivered","received","rendered"].includes(String(row.deliveryStatus))');
    expect(implementation).toContain("Boolean(packagePolicy && packagePolicy.automaticTradingEnabled && hasConfiguredTradingOfferPolicy(packagePolicy))");
    expect(implementation).toContain("if(!subscription) return null;");
    expect(implementation).toContain(".filter((offer) => offer !== null)");
    expect(implementation).not.toContain("drainMode");
  });

  it("allows informational delivery without requiring automatic financial execution", () => {
    const start = source.indexOf("export async function listCustomerOpportunities(");
    const end = source.indexOf("export async function runAutoTradeCycle(", start);
    const implementation = source.slice(start, end);
    expect(implementation).toContain("globalDeliveryEnabled=globalPolicy.available&&globalPolicy.tierPolicyMasterEnabled&&globalPolicy.informationalPopupDeliveryEnabled");
    expect(implementation).not.toContain("configured.automaticTradingEnabled && hasConfiguredTradingOfferPolicy(configured)");
    expect(source).toContain("const AUTOMATIC_FINANCIAL_EXECUTION_ENABLED = false;");
  });

  it("allows tier lifecycle enablement only when valid policy terms exist, independently of global masters", () => {
    const start = source.indexOf("export async function updateAdminTradingPackage(");
    const end = source.indexOf("\nexport async function ", start + 5);
    const implementation = source.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).toContain("Number(activationPolicy.policyVersion)<1");
    expect(implementation).toContain("!Number.isSafeInteger(Number(activationPolicy.minimumPayoutRateBps))");
    expect(implementation).not.toContain("!activationPolicy.automaticTradingEnabled");
    expect(implementation).toContain("if(isTradingTierEnablingTransition(Boolean(current.enabled),input.enabled)&&(");
    expect(implementation).toContain("Automatic financial execution is a separate control");
  });

  it("does not require a valid delivery policy to edit an already-enabled tier", () => {
    expect(isTradingTierEnablingTransition(true, true)).toBe(false);
  });

  it("creates policy rows with valid tier terms but inert legacy master placeholders", () => {
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.minimumPayoutRateBps).toBe(200);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.maximumPayoutRateBps).toBe(300);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.minimumTradeDurationSeconds).toBe(300);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.maximumTradeDurationSeconds).toBe(900);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.enabled).toBe(false);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.automaticDelivery).toBe(false);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.companyRotationEnabled).toBe(false);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.randomizationEnabled).toBe(false);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.burstEnabled).toBe(false);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.maxBurstSize).toBe(3);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.automaticTradingEnabled).toBe(false);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.requirePreviousSettlement).toBe(true);
    expect(DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY.policyVersion).toBe(1);
    expect(router).toContain("globalTradeControls: adminProcedure.query(() => getTradeGlobalControls())");
  });

  it("keeps unattended financial execution disabled while preserving informational delivery", () => {
    expect(source).toContain("const AUTOMATIC_FINANCIAL_EXECUTION_ENABLED = false;");
    expect(source).toContain("AUTOMATIC_FINANCIAL_EXECUTION_ENABLED && options.workerCycle");
    expect(resolveEffectivePackageOpportunityPolicy(
      "Safety test",
      null,
      { packageName: "Safety test", minimumPayoutRateBps: 250 },
      1,
    ).automaticTradingEnabled).toBe(false);
    expect(source).toContain("requested.some(policy=>(policy as Record<string,unknown>).automaticTradingEnabled===true)");
    expect(executionOffMigrationSource).toContain("SET `automaticTradingEnabled` = 0");
    expect(executionOffMigrationSource).toContain("WHERE `automaticTradingEnabled` <> 0");
  });

  it("returns the package's persisted enabled state from package creation", () => {
    const start = source.indexOf("export async function createAdminTradingPackage(");
    const end = source.indexOf("\nexport async function updateAdminTradingPackage(", start);
    const implementation = source.slice(start, end);
    expect(implementation).toContain("enabled:input.enabled,termsVersion:1");
    expect(implementation).not.toContain("enabled:false,termsVersion:1");
  });

  it("keeps pop-up delivery independent while the settlement gate blocks financial execution", () => {
    const start = source.indexOf("export async function runAutoTradeCycle(");
    const end = source.indexOf("\nexport async function createTrade(", start);
    const implementation = source.slice(start, end);
    expect(implementation).toContain("pausedUntilSettled=outstandingTrades>0");
    expect(implementation).not.toContain("return {customers:0,allocations:0");
    expect(implementation).toContain("allowAutomaticExecution:!pausedUntilSettled");
    const deliveryStart = source.indexOf("export async function listCustomerOpportunities(");
    const deliveryEnd = source.indexOf("export async function runAutoTradeCycle(", deliveryStart);
    expect(source.slice(deliveryStart, deliveryEnd)).toContain("options.allowAutomaticExecution!==false");
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
    expect(implementation).toContain("if(offer.executionEligible!==true) continue;");
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
