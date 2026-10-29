import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../drizzle/0078_trading_customer_package_subscription_repair.sql", import.meta.url), "utf8");
const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
const migrationRunner = readFileSync(new URL("./guarded-main-migrate.mjs", import.meta.url), "utf8");

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
    expect(entry.idx).toBe(entries.length - 9);
    expect(entries.at(-3).tag).toBe("0083_trading_opportunity_worker_indexes");
    expect(entries.at(-2).tag).toBe("0084_worker_health_registry");
    expect(entries.at(-1).tag).toBe("0085_trade_settlement_schema_reconciliation");
    expect(entry.when).toBeGreaterThan(entries.slice(0, entry.idx).reduce((latest, item) => Math.max(latest, item.when), 0));
  });

  it("repairs live schema drift even when migration history says the files were already applied", () => {
    expect(migrationRunner).toContain("async function reconcileTradingPackageSchema(");
    expect(migrationRunner).toContain("information_schema.columns");
    expect(migrationRunner).toContain("0077_trading_package_catalogue_schema_repair.sql");
    expect(migrationRunner).toContain("0078_trading_customer_package_subscription_repair.sql");
    expect(migrationRunner).toContain("Trading package schema verification failed after additive repair");
    expect(migrationRunner).toContain('currentMigration = "trading-package-schema-drift-reconciliation"');
  });
});
