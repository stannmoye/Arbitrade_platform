import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../drizzle/0069_trading_package_activation.sql", import.meta.url), "utf8");
const insert = migration.match(/INSERT INTO `packages` (`name`,`minimumQualifyingBalanceUsdMinor`,`durationMonths`,`opportunitiesPerDay`,`termsVersion`,`enabled`)\s*VALUES([\s\S]*?)ON DUPLICATE KEY UPDATE/i)?.[1] ?? "";
const seededPackages = [...insert.matchAll(/\('([^']+)',(\d+),(\d+),(\d+),1,1\)/g)].map((match) => ({
  name: match[1],
  minimumUsdMinor: Number(match[2]),
  durationMonths: Number(match[3]),
  opportunitiesPerDay: Number(match[4]),
}));

const expectedPackages = [
  ["Aureate Capital", 10000, 1, 6],
  ["Sterling Reserve", 25000, 2, 8],
  ["Sovereign Crest", 50000, 3, 10],
  ["Meridian Equity", 100000, 3, 12],
  ["Crownstone Capital", 200000, 6, 14],
  ["Imperial Ledger", 350000, 6, 16],
  ["Pinnacle Treasury", 500000, 6, 18],
  ["Obsidian Reserve", 750000, 9, 20],
  ["Sovereign Meridian", 1000000, 9, 22],
  ["Regalia Capital", 1500000, 12, 24],
  ["Apex Treasury", 2000000, 12, 25],
  ["Monarch Equity", 3000000, 12, 26],
  ["Grand Meridian", 5000000, 18, 27],
  ["Crown Imperial Reserve", 7500000, 18, 28],
  ["Sovereign Apex", 10000000, 24, 29],
  ["Paramount Capital Reserve", 15000000, 24, 30],
] as const;

describe("canonical 16-package trading catalogue", () => {
  it("seeds every approved package with the specified threshold, calendar duration and daily quota", () => {
    expect(seededPackages).toEqual(expectedPackages.map(([name, minimumUsdMinor, durationMonths, opportunitiesPerDay]) => ({
      name, minimumUsdMinor, durationMonths, opportunitiesPerDay,
    })));
  });

  it("stores qualifying thresholds in USD minor units and does not treat them as package charges", () => {
    expect(seededPackages).toHaveLength(16);
    expect(seededPackages[0].minimumUsdMinor).toBe(10000);
    expect(seededPackages[15].minimumUsdMinor).toBe(15000000);
    expect(seededPackages.every((pkg) => pkg.minimumUsdMinor > 0 && pkg.durationMonths > 0 && pkg.opportunitiesPerDay > 0)).toBe(true);
  });

  it("keeps stable package names and prevents legacy generic tiers remaining enabled", () => {
    for (const [name] of expectedPackages) expect(migration).toContain("'" + name + "'");
    expect(migration).toContain("UPDATE `packages` SET `enabled`=0 WHERE `name` IN ('Starter','Growth','Pro','Institutional')");
  });

  it("preserves the six-hour activation cooldown default and repeat-purchase controls", () => {
    expect(migration).toContain("('trading.packagePurchase.cooldownSeconds','21600')");
    expect(migration).toContain("('trading.packagePurchase.repeatAllowed','false')");
    expect(migration).toContain("('trading.packagePurchase.repeatRestriction','active_only')");
  });
});
