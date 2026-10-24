import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../drizzle/0064_remove_auto_trade_inherit.sql", import.meta.url);
const obsoleteLimitsMigrationPath = new URL("../drizzle/0065_remove_obsolete_auto_trade_limits.sql", import.meta.url);
const unusedDailyLimitMigrationPath = new URL("../drizzle/0066_remove_unused_customer_daily_trade_limit.sql", import.meta.url);
const schemaAuditPath = new URL("./audit-portal-schema.mjs", import.meta.url);
const appPath = new URL("../client/src/App.tsx", import.meta.url);
const schemaPath = new URL("../drizzle/schema.ts", import.meta.url);
const dbPath = new URL("../server/db.ts", import.meta.url);
const routerPath = new URL("../server/routers.ts", import.meta.url);
const portalRunnerPath = new URL("./apply-portal-migrations.mjs", import.meta.url);
const recoveryPath = new URL("../installer/migration-recovery-status.mjs", import.meta.url);

describe("package-driven auto-trade execution", () => {
  it("migrates inherited records safely and keeps runtime execution package-driven", async () => {
    const [migration, schema, db, router] = await Promise.all([
      readFile(migrationPath, "utf8"),
      readFile(schemaPath, "utf8"),
      readFile(dbPath, "utf8"),
      readFile(routerPath, "utf8"),
    ]);

    expect(migration).toContain("SET `autoTradeMode` = 'disabled'");
    expect(migration).toContain("WHERE `autoTradeMode` = 'inherit'");
    expect(migration).toContain("enum('enabled','disabled') NOT NULL DEFAULT 'disabled'");
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(schema).toContain('autoTradeMode: mysqlEnum("autoTradeMode", ["enabled", "disabled"]).default("disabled").notNull()');
    expect(schema).toContain('autoTradeEnabled: boolean("autoTradeEnabled").default(false).notNull()');
    expect(migration).toContain("SET `autoTradeEnabled` = CASE WHEN `autoTradeMode` = 'enabled' THEN 1 ELSE 0 END");
    expect(schema).not.toContain('mysqlEnum("autoTradeMode", ["inherit", "enabled", "disabled"])');
    expect(db).not.toContain("autoTradeEnabled");
    expect(db).not.toContain("autoTradeMode");
    expect(db).not.toContain("autoTradeMinRewardBps");
    expect(db).toContain("const eligibleSubscriptions=subscriptions;");
    expect(db).toContain("const autoTradeCandidates=tradeCandidates;");
    expect(db).not.toContain('autoTradeMode=c?.autoTradeMode||"inherit"');
    expect(router).not.toContain('z.enum(["inherit","enabled","disabled"])');
  });

  it("registers the migration in both execution and recovery manifests", async () => {
    const [portalRunner, recovery] = await Promise.all([
      readFile(portalRunnerPath, "utf8"),
      readFile(recoveryPath, "utf8"),
    ]);
    expect(portalRunner).toContain('"0064_remove_auto_trade_inherit.sql"');
    expect(recovery).toContain('"0064_remove_auto_trade_inherit.sql"');
    expect(portalRunner).toContain('"0065_remove_obsolete_auto_trade_limits.sql"');
    expect(recovery).toContain('"0065_remove_obsolete_auto_trade_limits.sql"');
    expect(portalRunner).toContain('"0066_remove_unused_customer_daily_trade_limit.sql"');
    expect(recovery).toContain('"0066_remove_unused_customer_daily_trade_limit.sql"');
  });
  it("removes retired per-opportunity sizing/count fields while preserving package-bound execution", async () => {
    const [migration, dailyLimitMigration, schema, db, router, audit, app] = await Promise.all([
      readFile(obsoleteLimitsMigrationPath, "utf8"),
      readFile(unusedDailyLimitMigrationPath, "utf8"),
      readFile(schemaPath, "utf8"),
      readFile(dbPath, "utf8"),
      readFile(routerPath, "utf8"),
      readFile(schemaAuditPath, "utf8"),
      readFile(appPath, "utf8"),
    ]);
    expect(migration).toContain("DROP COLUMN `autoTradeAmountMinor`");
    expect(migration).toContain("DROP COLUMN `autoTradeDailyLimit`");
    expect(dailyLimitMigration).toContain("DROP COLUMN `dailyTradeLimitMinor`");
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    for (const source of [schema, db, router]) {
      expect(source).not.toContain("autoTradeAmountMinor");
      expect(source).not.toContain("autoTradeDailyLimit");
      expect(source).not.toContain("dailyTradeLimitMinor");
    }
    expect(app).not.toContain("Daily limit: {c.limit}");
    expect(schema).toContain('autoTradeMinRewardBps: int("autoTradeMinRewardBps").default(0).notNull()');
    expect(db).not.toContain("updateCustomerAutoTradeSettings");
    expect(audit).toContain("function checkColumnAbsent(table, column)");
    expect(audit).toContain('absentColumns: [["customer_controls","autoTradeAmountMinor"],["customer_controls","autoTradeDailyLimit"]]');
    expect(audit).toContain('absentColumns: [["customer_controls","dailyTradeLimitMinor"]]');
    const executionStart = db.indexOf("async function autoTradeOpenOpportunities");
    const executionEnd = db.indexOf("export async function listCustomerOpportunities", executionStart);
    expect(executionStart).toBeGreaterThanOrEqual(0);
    expect(executionEnd).toBeGreaterThan(executionStart);
    const execution = db.slice(executionStart, executionEnd);
    expect(execution).toContain("packageMinimumTradeMinor");
    expect(execution).toContain("packageMaximumTradeMinor");
    expect(execution).toContain("availableMinor");
    expect(execution).not.toContain("autoTradeMinRewardBps");
    expect(execution).not.toContain("autoTradeEnabled");
    expect(execution).not.toContain("autoTradeMode");
    expect(execution).not.toContain("autoTradeAmountMinor");
  });
});
