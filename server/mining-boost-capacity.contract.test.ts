import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const serviceSource = readFileSync(new URL("./mining.ts", import.meta.url), "utf8");
const uiSource = readFileSync(new URL("../client/src/components/CustomerMining.tsx", import.meta.url), "utf8");
const statusStart = serviceSource.indexOf("export async function getCustomerMiningBoostStatus");
const statusEnd = serviceSource.indexOf("export async function activateCustomerMiningBoost", statusStart);
const activationEnd = serviceSource.indexOf("export async function getCustomerMiningDashboard", statusEnd);
const status = serviceSource.slice(statusStart, statusEnd);
const activation = serviceSource.slice(statusEnd, activationEnd);

describe("Mining boost capacity contract", () => {
  it("does not advertise the boost as ready unless configured hash-power capacity is positive", () => {
    expect(statusStart).toBeGreaterThanOrEqual(0);
    expect(statusEnd).toBeGreaterThan(statusStart);
    expect(status).toContain(
      "const boostCapacityConfigured = Boolean(eligiblePackage) && decimal(eligiblePackage.boostBonusThsSnapshot).gt(0)",
    );
    expect(status).toContain(
      "Boolean(eligiblePackage) && boostCapacityConfigured && !active && !coolingDown",
    );
    expect(status).toContain("Boost hash-power capacity is not configured for this package");
  });

  it("rejects direct activation before creating a boost row when capacity is zero", () => {
    expect(activationEnd).toBeGreaterThan(statusEnd);
    const guardIndex = activation.indexOf("if (!decimal(candidate.boostBonusThsSnapshot).gt(0))");
    const insertIndex = activation.indexOf("INSERT INTO mining_boost_activations");
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(insertIndex).toBeGreaterThan(guardIndex);
    expect(activation).toContain(
      'throw new MiningError("Boost hash-power capacity is not configured for this package")',
    );
  });

  it("disables the customer action and explains why zero-capacity boosts cannot activate", () => {
    expect(uiSource).toContain(
      "const boostCapacityAvailable = Number.isFinite(Number(boost?.bonusThsAvailable)) && Number(boost?.bonusThsAvailable) > 0",
    );
    expect(uiSource).toContain("!boost?.ready || !boostCapacityAvailable");
    expect(uiSource).toContain("Extra hash power is not configured for this package.");
    expect(uiSource).toContain("Capacity Not Configured");
  });
});
