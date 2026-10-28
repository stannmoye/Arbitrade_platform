import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const marketSource = readFileSync(new URL("./marketSync.ts", import.meta.url), "utf8");

describe("trading economics use recorded or published values only", () => {
  it("uses published offer estimates instead of hash-derived economics", () => {
    const start = dbSource.indexOf("function calculateTradeTerms(");
    const end = dbSource.indexOf("\nfunction packageUsdUnitsToNativeMinor", start);
    const terms = dbSource.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(terms).toContain("Number(offer.minimumMinor)");
    expect(terms).toContain("Number(offer.expectedRewardBps)");
    expect(terms).toContain("Number.isSafeInteger(rewardBps)");
    expect(terms).not.toContain("createHash");
    expect(terms).not.toContain("sessionEntropy");
  });

  it("does not synthesize market offers, reward rates, durations, or seeds", () => {
    expect(marketSource).not.toContain("simulationValue");
    expect(marketSource).not.toContain("simulationSeed:");
    expect(marketSource).toContain("created: 0");
    expect(marketSource).toContain("generationDisabled: true");
  });

  it("keeps allocation pending until a separate settlement records the actual result", () => {
    const allocationStart = dbSource.indexOf("export async function createTrade(");
    const allocationEnd = dbSource.indexOf("\nexport async function ", allocationStart + 5);
    const allocation = dbSource.slice(allocationStart, allocationEnd);
    expect(allocation).toContain('lifecycleStage:"Trade Allocated",settlementStatus:"pending"');
    expect(allocation).toContain("expectedRewardMinor:reward");
    expect(allocation).toContain("rewardReservedMinor:reward");
    expect(allocation).not.toContain('settlementStatus:"completed"');

    const settlementStart = dbSource.indexOf("export async function manuallySettleTrade(");
    const settlementEnd = dbSource.indexOf("\nexport async function ", settlementStart + 5);
    const settlement = dbSource.slice(settlementStart, settlementEnd);
    expect(settlement).toContain("input.grossProfitMinor");
    expect(settlement).toContain("Settlement reference must contain at least 3 characters");
  });
});
