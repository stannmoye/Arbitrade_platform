import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const databaseSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const journalSource = readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../drizzle/0083_trading_opportunity_worker_indexes.sql", import.meta.url), "utf8");
const portalMigrationSource = readFileSync(new URL("../scripts/apply-portal-migrations.mjs", import.meta.url), "utf8");
const installerRecoverySource = readFileSync(new URL("../installer/migration-recovery-status.mjs", import.meta.url), "utf8");
const runtimeSchemaSource = readFileSync(new URL("../scripts/ensure-worker-runtime-schema.mjs", import.meta.url), "utf8");

const schedulerStart = databaseSource.indexOf("export async function claimAutoTradeCycleCustomers(");
const schedulerEnd = databaseSource.indexOf("\nexport async function runAutoTradeCycle(", schedulerStart);
const schedulerSource = databaseSource.slice(schedulerStart, schedulerEnd);
const cycleStart = serverSource.indexOf("let tradeCycleRunning = false;");
const cycleEnd = serverSource.indexOf("const autoTradeTimer", cycleStart);
const cycleSource = serverSource.slice(cycleStart, cycleEnd);
const reconciliationStart = databaseSource.indexOf("export async function reconcileAllDueTradesAwaitingConfirmation(");
const reconciliationEnd = databaseSource.indexOf("\nexport async function listPendingSettlements(", reconciliationStart);
const reconciliationSource = databaseSource.slice(reconciliationStart, reconciliationEnd);

describe("automatic Trading opportunity scheduler", () => {
  it("selects a bounded batch of active auto-assigned tiers instead of scanning all users", () => {
    expect(schedulerStart).toBeGreaterThanOrEqual(0);
    expect(schedulerEnd).toBeGreaterThan(schedulerStart);
    expect(schedulerSource).toContain("selectDistinct({id:customerPackageSubscriptions.userId})");
    expect(schedulerSource).toContain("LIKE 'auto-tier:%'");
    expect(schedulerSource).toContain('eq(customerPackageSubscriptions.status,"active")');
    expect(schedulerSource).toContain(".limit(batchSize)");
    expect(schedulerSource).not.toContain('.from(users).where(eq(users.role,"user"))');
    expect(schedulerSource).not.toContain("ensureAutomaticTradingTierEntitlements");
    expect(schedulerSource).toContain("Math.min(250,requestedBatchSize)");
  });

  it("locks and advances a durable round-robin cursor without re-claiming the first page in the same tick", () => {
    expect(schedulerSource).toContain('const cursorKey="trade.autoTradeCycle.lastUserId"');
    expect(schedulerSource).toContain('.limit(1).for("update")');
    expect(schedulerSource).toContain("gt(customerPackageSubscriptions.userId,afterUserId)");
    expect(schedulerSource).toContain('if(!batch.length&&cursor>0){');
    expect(schedulerSource).toContain('set({settingValue:"0"})');
    expect(schedulerSource).toContain("return [];");
    expect(schedulerSource).toContain("settingValue:String(nextCursor)");
  });

  it("registers the entitlement lookup index in schema, migration, and journal", () => {
    expect(schemaSource).toContain("customer_package_subscriptions_worker_status_user_idx");
    expect(migrationSource).toContain("CREATE INDEX IF NOT EXISTS `customer_package_subscriptions_worker_status_user_idx`");
    expect(migrationSource).toContain("(`status`, `userId`, `startsAt`)");
    expect(JSON.parse(journalSource).entries.some((entry: { tag: string }) => entry.tag === "0083_trading_opportunity_worker_indexes")).toBe(true);
    expect(portalMigrationSource).toContain('"0083_trading_opportunity_worker_indexes.sql"');
    expect(installerRecoverySource).toContain('"0083_trading_opportunity_worker_indexes.sql"');
    expect(runtimeSchemaSource).toContain('drizzle/0083_trading_opportunity_worker_indexes.sql');
  });

  it("includes legacy due trades whose lifecycle stage is null in global reconciliation", () => {
    expect(reconciliationStart).toBeGreaterThanOrEqual(0);
    expect(reconciliationEnd).toBeGreaterThan(reconciliationStart);
    expect(reconciliationSource).toContain('or(isNull(tradePositions.lifecycleStage),notInArray(tradePositions.lifecycleStage,["Awaiting Settlement Confirmation"]))');
    expect(reconciliationSource).toContain('eq(tradePositions.status,"confirmed")');
    expect(reconciliationSource).toContain('eq(tradePositions.settlementStatus,"pending")');
  });

  it("prevents overlapping Trading cycles within one server process", () => {
    expect(cycleStart).toBeGreaterThanOrEqual(0);
    expect(cycleEnd).toBeGreaterThan(cycleStart);
    expect(cycleSource).toContain("if (tradeCycleRunning) return;");
    expect(cycleSource).toContain("tradeCycleRunning = true;");
    expect(cycleSource).toContain("finally");
    expect(cycleSource).toContain("tradeCycleRunning = false;");
  });
});
