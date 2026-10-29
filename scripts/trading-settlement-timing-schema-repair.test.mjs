import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../drizzle/0079_trade_settlement_timing_schema_repair.sql", import.meta.url), "utf8");
const reconciliationMigration = readFileSync(new URL("../drizzle/0085_trade_settlement_schema_reconciliation.sql", import.meta.url), "utf8");
const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
const migrationRunner = readFileSync(new URL("./guarded-main-migrate.mjs", import.meta.url), "utf8");
const portalRunner = readFileSync(new URL("./apply-portal-migrations.mjs", import.meta.url), "utf8");
const installerStatus = readFileSync(new URL("../installer/migration-recovery-status.mjs", import.meta.url), "utf8");

describe("Trading settlement timing schema drift repair", () => {
  it("only repairs safe timing metadata and does not fabricate settlement timestamps", () => {
    expect(migration).toContain("`creditAt` timestamp NULL");
    expect(migration).toContain("`lifecycleStage` varchar(48) NOT NULL DEFAULT 'Trade Allocated'");
    expect(migration).not.toContain("`settlesAt`");
    expect(migration).not.toContain("UPDATE `trade_positions`");
    expect(migration).not.toContain("settlementStatus");
  });

  it("registers the migration after the current Trading package repairs", () => {
    const entries = journal.entries;
    const entry = entries.find((item) => item.tag === "0079_trade_settlement_timing_schema_repair");
    expect(entry).toBeDefined();
    expect(entry.idx).toBe(entries.indexOf(entry));
    expect(entries[entry.idx - 1].tag).toBe("0078_trading_customer_package_subscription_repair");
    expect(entries[entry.idx + 1].tag).toBe("0080_qualifying_admin_deposit_attribution");
    expect(entries.slice(-9).map((item) => item.tag)).toEqual([
      "0086_trading_popup_policy_snapshots",
      "0087_trading_opportunity_execution_leases",
      "0088_trading_package_policy_schema_reconciliation",
      "0089_trading_popup_policy_ranges",
      "0090_trading_company_spotlight_rotation",
      "0091_trading_popup_trade_snapshots",
      "0092_trading_trade_wallet_funding_plan_snapshot",
      "0093_admin_wallet_adjustment_idempotency",
      "0094_trading_policy_duration_bounds_nullable",
    ]);
    expect(entry.idx).toBeGreaterThan(0);
    expect(entry.when).toBeGreaterThan(entries[entry.idx - 1].when);
  });

  it("reconciles actual settlement timing schema drift even when migration history already records it", () => {
    expect(migrationRunner).toContain("async function reconcileTradeSettlementTimingSchema(");
    expect(migrationRunner).toContain("0085_trade_settlement_schema_reconciliation.sql");
    expect(migrationRunner).toContain("rewardReservedMinor");
    expect(migrationRunner).toContain("trade_reward_reservations");
    expect(portalRunner).toContain('"0079_trade_settlement_timing_schema_repair.sql"');
    expect(installerStatus).toContain('"0079_trade_settlement_timing_schema_repair.sql"');
    expect(portalRunner).toContain('"0085_trade_settlement_schema_reconciliation.sql"');
    expect(installerStatus).toContain('"0085_trade_settlement_schema_reconciliation.sql"');
    expect(portalRunner).toContain('"0092_trading_trade_wallet_funding_plan_snapshot.sql"');
    expect(installerStatus).toContain('"0092_trading_trade_wallet_funding_plan_snapshot.sql"');
    expect(portalRunner).toContain('"0093_admin_wallet_adjustment_idempotency.sql"');
    expect(installerStatus).toContain('"0093_admin_wallet_adjustment_idempotency.sql"');
    expect(portalRunner).toContain('"0094_trading_policy_duration_bounds_nullable.sql"');
    expect(installerStatus).toContain('"0094_trading_policy_duration_bounds_nullable.sql"');
  });

  it("repairs omitted settlement migrations additively without rewriting financial records", () => {
    expect(reconciliationMigration).toContain("ADD COLUMN IF NOT EXISTS `rewardReservedMinor` bigint NOT NULL DEFAULT 0");
    expect(reconciliationMigration).toContain("ADD COLUMN IF NOT EXISTS `settlementConfirmedAt` timestamp NULL");
    expect(reconciliationMigration).toContain("CREATE TABLE IF NOT EXISTS `trade_lifecycle_events`");
    expect(reconciliationMigration).toContain("CREATE TABLE IF NOT EXISTS `trade_reward_reservations`");
    expect(reconciliationMigration).not.toContain("UPDATE `trade_positions`");
  });
});
