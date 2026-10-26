import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../drizzle/0076_trading_admin_policy_read_repair.sql", import.meta.url), "utf8");
const journal = readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8");
const portalRunner = readFileSync(new URL("../scripts/apply-portal-migrations.mjs", import.meta.url), "utf8");
const recoveryReport = readFileSync(new URL("../installer/migration-recovery-status.mjs", import.meta.url), "utf8");

describe("Trading administration policy schema repair", () => {
  it("restores package columns required by the terms query", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS `minimumQualifyingBalanceUsdMinor`");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS `durationMonths`");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS `opportunitiesPerDay`");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS `termsVersion`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `app_settings`");
    expect(migration.match(/--> statement-breakpoint/g)?.length).toBeGreaterThanOrEqual(6);
    expect(migration).toContain("('Paramount Capital Reserve',15000000,24,30,1,1)");
  });

  it("preserves customized versioned terms when correcting untouched defaults", () => {
    expect(migration).toContain("WHERE p.`termsVersion`=1");
    expect(migration).toContain("AND p.`minimumQualifyingBalanceUsdMinor`=10000");
    expect(migration).toContain("AND p.`durationMonths`=1");
    expect(migration).toContain("AND p.`opportunitiesPerDay`=6");
  });

  it("restores absent activation-policy and allocation-safety defaults without overwriting saved settings", () => {
    expect(migration).toContain("trading.packageQualification.eligibleCurrencies");
    expect(migration).toContain("trading.packagePurchase.repeatAllowed");
    expect(migration).toContain("trading.packagePurchase.cooldownSeconds");
    expect(migration).toContain("trading.allocations.paused");
    expect(migration).toContain('"allocationsPaused":true');
    expect(migration).toContain("administrator review is required before resuming allocations");
    expect(migration.split("ON DUPLICATE KEY UPDATE `settingKey`=VALUES(`settingKey`)").length - 1).toBe(2);
  });

  it("is included in main migrations, portal migration runs, and recovery diagnostics", () => {
    expect(journal).toContain('"tag": "0076_trading_admin_policy_read_repair"');
    expect(portalRunner).toContain('"0076_trading_admin_policy_read_repair.sql"');
    expect(recoveryReport).toContain('"0076_trading_admin_policy_read_repair.sql"');
  });
});
