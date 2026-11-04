import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./marketSync.ts", import.meta.url), "utf8");
const databaseSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const adminApp = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function ensureMarketDrivenOpportunities");
const implementation = source.slice(start);

describe("trading opportunity economics integrity", () => {
  it("does not synthesize reward, amount, duration, or opportunity seeds from market snapshots", () => {
    expect(source).not.toContain("simulationValue");
    expect(source).not.toContain("simulationSeed");
    expect(source).not.toContain("SIMULATION_SALT");
    expect(source).not.toContain("createHash");
    expect(implementation).not.toContain("db.insert(opportunityOffers)");
    expect(implementation).not.toContain("expectedRewardBps =");
    expect(implementation).not.toContain("minimumMinor =");
    expect(implementation).not.toContain("durationSeconds =");
  });

  it("continues customer popup delivery while the settlement gate blocks automatic execution", () => {
    const start = databaseSource.indexOf("export async function runAutoTradeCycle(");
    const end = databaseSource.indexOf("\nexport async function createTrade(", start);
    const worker = databaseSource.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(worker.indexOf("getTradeSettlementPolicy()")).toBeGreaterThanOrEqual(0);
    expect(worker.indexOf("getTradeSettlementPolicy()")).toBeLessThan(worker.indexOf("claimAutoTradeCycleCustomers(input)"));
    expect(worker).toContain("pausedUntilSettled=outstandingTrades>0");
    expect(worker).toContain("allowAutomaticExecution:!pausedUntilSettled");
    expect(worker).not.toContain("return {customers:0,allocations:0");
  });

  it("pauses delivery for outstanding trades without permanently closing published offers", () => {
    const pauseStart = implementation.indexOf("if (settlementPolicy.blockUntilSettled)");
    const pauseEnd = implementation.indexOf("// Expire offers by their explicit expiry time", pauseStart);
    const pause = implementation.slice(pauseStart, pauseEnd);
    expect(pauseStart).toBeGreaterThanOrEqual(0);
    expect(pauseEnd).toBeGreaterThan(pauseStart);
    expect(pause).toContain("pausedUntilSettled: true");
    expect(pause).toContain("opportunityOffers.status, \"open\"");
    expect(pause).toContain("gt(opportunityOffers.closesAt, now)");
    expect(pause).not.toContain("db.update(opportunityOffers)");
  });

  it("retires manual creation and CSV import in both the admin interface and server API", () => {
    expect(adminApp).toContain("Automated generation only");
    expect(adminApp).toContain("Manual publication and CSV import are disabled");
    expect(adminApp).not.toContain("createOffer");
    expect(adminApp).not.toContain("bulkCreateOffers");
    expect(adminApp).not.toContain("parseOpportunityCsv");
    expect(routerSource).toContain("Manual opportunity publication is retired.");
    expect(routerSource).toContain("Manual opportunity CSV import is retired.");
  });

  it("explains that customer pop-ups are automatically generated from approved templates, not manual publication", () => {
    expect(adminApp).toContain("Customer opportunities are generated automatically from administrator-approved templates");
    expect(adminApp).toContain("Manual publication and CSV import are disabled");
    expect(adminApp).toContain("historical manual records cannot create customer pop-ups");
  });

  it("expires stale offers and reports existing active offers without creating new ones", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(implementation).toContain('return { created: 0, available: availableOffers.length, generationDisabled: true };');
    expect(implementation).toContain('.set({ status: "closed" })');
    expect(implementation).toContain('lte(opportunityOffers.closesAt, now)');
    expect(implementation).not.toContain('lt(opportunityOffers.closesAt, now)');
    expect(implementation).not.toContain('marketObservedAt, refreshedAt');
    expect(implementation).toContain('eq(opportunityOffers.status, "open")');
    expect(implementation).toContain('gt(opportunityOffers.closesAt, now)');
  });
});


describe("Trading opportunity publication guidance", () => {
  it("clearly explains why no customer-specific popup is generated when template/package gates are unmet", () => {
    expect(adminApp).toContain("No generated customer opportunities are currently open.");
    expect(adminApp).toContain("No customer-specific generated opportunity is currently open.");
    expect(adminApp).toContain("Check for an approved verified-company template, the generation switch, an active qualifying package");
    expect(source).toContain("generationDisabled: true");
  });
});


describe("Admin opportunity publisher error handling", () => {
  it("makes retired manual publication routes fail explicitly instead of silently creating offers", () => {
    expect(routerSource).toContain("PRECONDITION_FAILED");
    expect(routerSource).toContain("Customer-specific opportunities are generated automatically from the approved company catalogue");
    expect(routerSource).toContain("saved company templates are optional display-term enrichment");
    expect(routerSource).toContain("saved qualifying-package policy");
    expect(routerSource).toContain("a company template is not required");
  });

  it("keeps the old CSV parser disconnected from the customer opportunity screen", () => {
    expect(adminApp).not.toContain("opportunity-csv");
    expect(adminApp).not.toContain("parseOpportunityCsv");
  });
});
