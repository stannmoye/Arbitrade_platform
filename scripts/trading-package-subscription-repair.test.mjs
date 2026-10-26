import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../drizzle/0078_trading_customer_package_subscription_repair.sql", import.meta.url), "utf8");
const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));

describe("Trading customer package subscription schema repair", () => {
  it("repairs every subscription field read by the customer package catalogue", () => {
    for (const column of [
      "userId",
      "packageId",
      "startsAt",
      "expiresAt",
      "status",
      "activationKey",
      "termsSnapshotJson",
      "qualifyingBalanceUsdMinor",
      "packageTermsVersion",
      "activatedAt",
      "createdAt",
    ]) {
      expect(migration).toContain("`" + column + "`");
    }
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `customer_package_subscriptions`");
    expect(migration).toContain("ALTER TABLE `customer_package_subscriptions`");
  });

  it("does not silently turn unverified legacy rows into active subscriptions", () => {
    expect(migration).toContain("DEFAULT 'expired'");
    expect(migration).not.toContain("UPDATE `customer_package_subscriptions` SET `status`='active'");
  });

  it("registers the repair as a forward-only migration after the current journal", () => {
    const entries = journal.entries;
    const entry = entries.find((item) => item.tag === "0078_trading_customer_package_subscription_repair");
    expect(entry).toBeDefined();
    expect(entry.idx).toBe(entries.length - 1);
    expect(entry.when).toBeGreaterThan(entries.slice(0, -1).reduce((latest, item) => Math.max(latest, item.when), 0));
  });
});
