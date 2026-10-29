import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./marketSync.ts", import.meta.url), "utf8");
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

  it("expires stale offers and reports existing active offers without creating new ones", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(implementation).toContain('return { created: 0, available: availableOffers.length, generationDisabled: true };');
    expect(implementation).toContain('.set({ status: "closed" })');
    expect(implementation).toContain('eq(opportunityOffers.status, "open")');
    expect(implementation).toContain('gt(opportunityOffers.closesAt, now)');
  });
});
