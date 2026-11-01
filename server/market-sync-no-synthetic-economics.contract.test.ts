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

  it("pauses the durable worker before claiming customers while settlement is outstanding", () => {
    const start = databaseSource.indexOf("export async function runAutoTradeCycle(");
    const end = databaseSource.indexOf("\nexport async function createTrade(", start);
    const worker = databaseSource.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(worker.indexOf("getTradeSettlementPolicy()")).toBeGreaterThanOrEqual(0);
    expect(worker.indexOf("getTradeSettlementPolicy()")).toBeLessThan(worker.indexOf("claimAutoTradeCycleCustomers(input)"));
    expect(worker).toContain("pausedUntilSettled:true");
    expect(worker).toContain("outstandingTrades>0");
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
    expect(adminApp).toContain("Market-data refresh updates instruments and FX but does not generate opportunity offers; customers can receive pop-ups only for published, open offers.");
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
