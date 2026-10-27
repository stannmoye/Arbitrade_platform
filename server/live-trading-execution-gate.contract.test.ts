import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("internal-ledger trading allocation contract", () => {
  const start = source.indexOf("export async function createTrade(");
  const end = source.indexOf("\nexport async function ", start + 5);
  const implementation = source.slice(start, end);

  it("allows eligible internal-ledger allocations without an external execution adapter", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).not.toContain("assertExecutionAllowed");
    expect(source).not.toContain("LIVE_EXECUTION_PROVIDER_UNAVAILABLE");

    const pauseCheck = implementation.indexOf("if(allocationControls.allocationsPaused)");
    const packageCheck = implementation.indexOf("if(!activePackageSubscriptions.length)");
    const fundsCheck = implementation.indexOf("bal.availableMinor<input.amountMinor");
    const reservation = implementation.indexOf('entryType:"trade_reservation"');
    expect(pauseCheck).toBeGreaterThanOrEqual(0);
    expect(packageCheck).toBeGreaterThan(pauseCheck);
    expect(fundsCheck).toBeGreaterThan(packageCheck);
    expect(reservation).toBeGreaterThan(fundsCheck);
  });

  it("keeps allocation pending until the separate result-evidence settlement workflow", () => {
    expect(implementation).toContain('lifecycleStage:"Trade Allocated",settlementStatus:"pending"');
    expect(implementation).toContain("expectedRewardMinor:reward");
    expect(implementation).toContain("rewardReservedMinor:reward");
    expect(implementation).not.toContain('settlementStatus:"completed"');

    const settlementStart = source.indexOf("export async function manuallySettleTrade(");
    const settlementEnd = source.indexOf("\nexport async function ", settlementStart + 5);
    const settlement = source.slice(settlementStart, settlementEnd);
    expect(settlementStart).toBeGreaterThanOrEqual(0);
    expect(settlementEnd).toBeGreaterThan(settlementStart);
    expect(settlement).toContain("Settlement evidence notes must describe the verification source and actual result");
    expect(settlement).toContain("Settlement reference must contain at least 3 characters");
  });
});
