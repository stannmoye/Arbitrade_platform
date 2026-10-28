import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../drizzle/0079_trade_settlement_timing_schema_repair.sql", import.meta.url), "utf8");
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
    expect(entry.idx).toBe(entries.length - 4);
    expect(entries.at(-1).tag).toBe("0082_trading_tier_qualification_jobs");
    expect(entry.when).toBeGreaterThan(entries.at(-5).when);
  });

  it("reconciles actual settlement timing schema drift even when migration history already records it", () => {
    expect(migrationRunner).toContain("async function reconcileTradeSettlementTimingSchema(");
    expect(migrationRunner).toContain("0079_trade_settlement_timing_schema_repair.sql");
    expect(migrationRunner).toContain("Trading settlement timing columns.");
    expect(portalRunner).toContain('"0079_trade_settlement_timing_schema_repair.sql"');
    expect(installerStatus).toContain('"0079_trade_settlement_timing_schema_repair.sql"');
  });
});
