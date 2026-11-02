import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../drizzle/0099_trade_settings_global_registry.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("Trade Settings Checkpoint 2 migration and API contracts", () => {
  it("is forward-only, preserves strict safety defaults, and records conflicts", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS `minimumPlatformFeeBps`");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS `maximumPlatformFeeBps`");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS `platformFeeRateBps`");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS `feePolicyVersion`");
    expect(migration).toContain("trade.settings.global.v1");
    expect(migration).toContain("'requirePreviousSettlement', TRUE");
    expect(migration).toContain("'automaticFinancialExecution', FALSE");
    expect(migration).toContain("'legacySafetyPaused'");
    expect(migration).toContain("trade.settings.global.migrationReport.v1");
    expect(migration).toContain("JSON_ARRAYAGG");
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
    expect(migration).not.toContain("DELETE FROM");
  });

  it("keeps package fee bounds typed and package-scoped", () => {
    expect(schema).toContain('minimumPlatformFeeBps: int("minimumPlatformFeeBps").default(1500).notNull()');
    expect(schema).toContain('maximumPlatformFeeBps: int("maximumPlatformFeeBps").default(1500).notNull()');
    expect(schema).toContain('platformFeeRoundingMode: varchar("platformFeeRoundingMode", { length: 16 }).default("up").notNull()');
    expect(db).toContain("Platform fee bounds must satisfy 0 ≤ minimum ≤ maximum ≤ 10000 bps");
    expect(db).toContain("platformFeeRoundingMode");
    expect(db).toContain("Settlement never re-reads today's fee settings");
    expect(db).toContain("platformFeeRateBps:input.deliveryEventId!==undefined?platformFeeRateBps");
  });

  it("fails closed before migration and audits global partial updates", () => {
    expect(db).toContain('const TRADE_GLOBAL_SETTINGS_KEY = "trade.settings.global.v1"');
    expect(db).toContain('migration is missing or malformed; apply the forward-only migration');
    expect(db).toContain('action: "trade_global_settings_updated"');
    expect(db).toContain('input.requirePreviousSettlement === false');
    expect(router).toContain("tradeGlobalSettings: adminProcedure.query");
    expect(router).toContain("updateTradeGlobalSettings: adminProcedure.input");
    expect(router).toContain("reason: z.string().trim().min(5).max(500)");
  });
});
