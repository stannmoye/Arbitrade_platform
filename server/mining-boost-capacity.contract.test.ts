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
  it("allows configured boost cycles even when a package has zero extra TH/s", () => {
    expect(statusStart).toBeGreaterThanOrEqual(0);
    expect(statusEnd).toBeGreaterThan(statusStart);
    expect(status).toContain("A package can intentionally provide a CKI reward boost without extra");
    expect(status).toContain(
      'const ready = config.boostsEnabled && accountStatus === "active" && Boolean(eligiblePackage) && !active && !coolingDown',
    );
    expect(status).not.toContain("boostCapacityConfigured");
    expect(activation).not.toContain("Boost hash-power capacity is not configured for this package");
  });

  it("shows the reward rate and actual extra hash-power amount as separate facts", () => {
    expect(uiSource).toContain("<b>MINING REWARD BOOST</b>");
    expect(uiSource).toContain(
      "+{fmt(boost?.boostRewardCkiPerDay, 6)} CKI / 24h while active · +{fmt(boost?.bonusThsAvailable, 3)} TH/s extra power",
    );
    expect(uiSource).toContain('aria-label="Mining reward boost engine"');
    expect(uiSource).toContain('aria-label="Activate Mining Reward Boost"');
    expect(uiSource).toContain('disabled={boostMutation.isPending || !boost?.ready}');
  });
});
