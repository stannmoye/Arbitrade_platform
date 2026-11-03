import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "drizzle/0099_trade_global_settings_canonical.sql"), "utf8");
const schema = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");

describe("canonical global Trade Settings migration", () => {
  it("is additive and does not rewrite or remove legacy package policy data", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `trade_global_settings`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `trade_global_settings_migration_conflicts`");
    expect(migration).not.toMatch(/^\s*(UPDATE|DELETE|DROP)\s+/m);
    expect(schema).toContain("export const tradeGlobalSettings = mysqlTable");
    expect(schema).toContain("export const tradeGlobalSettingsMigrationConflicts = mysqlTable");
  });

  it("backfills each global gate with strictest-safety precedence and preserves conflicts", () => {
    expect(migration).toContain("COALESCE(MIN(`enabled`), 0)");
    expect(migration).toContain("COALESCE(MIN(`automaticDelivery`), 0)");
    expect(migration).toContain("COALESCE(MIN(`companyRotationEnabled`), 0)");
    expect(migration).toContain("COALESCE(MIN(`randomizationEnabled`), 0)");
    expect(migration).toContain("COALESCE(MIN(`burstEnabled`), 0)");
    expect(migration).toContain("`automaticTradingEnabled`\n)\nSELECT");
    expect(migration).toContain("ON DUPLICATE KEY UPDATE `id` = `id`");
    expect(migration).toContain("INSERT IGNORE INTO `trade_global_settings_migration_conflicts`");
    expect(migration).toContain("'precedence', 'strictest-safety'");
  });
});
