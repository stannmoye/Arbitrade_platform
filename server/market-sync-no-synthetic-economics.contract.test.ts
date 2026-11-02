import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./marketSync.ts", import.meta.url), "utf8");
const databaseSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const adminApp = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
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
    expect(pause).not.toContain("db.update(opportunityOffers)");
  });

  it("does not prefill opportunity publishing with placeholder symbols, venues or payout terms", () => {
    expect(adminApp).not.toContain('useState("NVDA")');
    expect(adminApp).not.toContain('useState("Market venue A")');
    expect(adminApp).not.toContain('useState("Market venue B")');
    expect(adminApp).toContain("Enter reviewed, source-backed offer terms.");
    expect(adminApp).toContain("!symbol.trim()");
    expect(adminApp).toContain("reward<1||reward>5000");
    expect(adminApp).toContain("duration<10||duration>86400");
  });

  it("explains that pop-ups require an administrator-published open opportunity", () => {
    expect(adminApp).toContain("Publish reviewed opportunities, import validated CSV records and inspect the open opportunity feed.");
    expect(adminApp).toContain("Customer pop-ups require a published, open offer plus an eligible tier and enabled delivery policy.");
  });

  it("expires stale offers and reports existing active offers without creating new ones", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(implementation).toContain('return { created: 0, available: availableOffers.length, generationDisabled: true };');
    expect(implementation).toContain('.set({ status: "closed" })');
    expect(implementation).toContain('lt(opportunityOffers.closesAt, now)');
    expect(implementation).not.toContain('marketObservedAt, refreshedAt');
    expect(implementation).toContain('eq(opportunityOffers.status, "open")');
    expect(implementation).toContain('gt(opportunityOffers.closesAt, now)');
  });
});


describe("Trading opportunity publication guidance", () => {
  it("clearly explains why customers see no popups when the published offer registry is empty", () => {
    expect(adminApp).toContain("No published opportunities are currently open.");
    expect(adminApp).toContain("Eligible customers cannot receive a pop-up until an administrator publishes a reviewed, source-backed opportunity");
    expect(adminApp).toContain("Market-data refresh does not create offers.");
    expect(source).toContain("generationDisabled: true");
  });
});


describe("Admin opportunity publisher error handling", () => {
  it("reports successful and failed manual publications through the admin UI", () => {
    expect(adminApp).toContain("Opportunity published to the database.");
    expect(adminApp).toContain("onError:error=>setPublishMessage(error.message)");
    expect(adminApp).toContain('role={create.isError?"alert":"status"}');
    expect(adminApp).toContain('create.isPending?"Publishing…":"Publish to database"');
  });

  it("does not announce CSV success before the server confirms the import", () => {
    expect(adminApp).toContain("Publishing ");
    expect(adminApp).toContain("validated opportunities published successfully.");
    expect(adminApp).toContain("onError:error=>{setImportError(true);setImportStatus(error.message)}");
    expect(adminApp).toContain("reader.onerror=");
    expect(adminApp).toContain("rows.length>5000");
  });
});
