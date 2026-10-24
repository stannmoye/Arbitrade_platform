import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../drizzle/0064_remove_auto_trade_inherit.sql", import.meta.url);
const schemaPath = new URL("../drizzle/schema.ts", import.meta.url);
const dbPath = new URL("../server/db.ts", import.meta.url);
const routerPath = new URL("../server/routers.ts", import.meta.url);
const portalRunnerPath = new URL("./apply-portal-migrations.mjs", import.meta.url);
const recoveryPath = new URL("../installer/migration-recovery-status.mjs", import.meta.url);

describe("explicit auto-trade opt-in migration", () => {
  it("disables inherited records before removing inherit from the database enum", async () => {
    const [migration, schema, db, router] = await Promise.all([
      readFile(migrationPath, "utf8"),
      readFile(schemaPath, "utf8"),
      readFile(dbPath, "utf8"),
      readFile(routerPath, "utf8"),
    ]);

    expect(migration).toContain("SET `autoTradeMode` = 'disabled'");
    expect(migration).toContain("WHERE `autoTradeMode` = 'inherit'");
    expect(migration).toContain("enum('enabled','disabled') NOT NULL DEFAULT 'disabled'");
    expect(migration).not.toMatch(/\\bDROP\\s+TABLE\\b/i);
    expect(migration).not.toMatch(/\\bTRUNCATE\\b/i);
    expect(migration).not.toMatch(/\\bDELETE\\s+FROM\\b/i);
    expect(schema).toContain('autoTradeMode: mysqlEnum("autoTradeMode", ["enabled", "disabled"]).default("disabled").notNull()');
    expect(schema).not.toContain('mysqlEnum("autoTradeMode", ["inherit", "enabled", "disabled"])');
    expect(db).toContain('autoTradeEnabled:false,autoTradeMode:"disabled"');
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
  });
});
