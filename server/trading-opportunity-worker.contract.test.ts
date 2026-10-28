import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const databaseSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const journalSource = readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../drizzle/0083_trading_opportunity_worker_indexes.sql", import.meta.url), "utf8");

const workerStart = databaseSource.indexOf("export async function runAutoTradeCycle(");
const workerEnd = databaseSource.indexOf("\nexport async function createTrade(", workerStart);
const workerSource = databaseSource.slice(workerStart, workerEnd);
const cycleStart = serverSource.indexOf("let tradeCycleRunning = false;");
const cycleEnd = serverSource.indexOf("const autoTradeTimer", cycleStart);
const cycleSource = serverSource.slice(cycleStart, cycleEnd);
const reconciliationStart = databaseSource.indexOf("export async function reconcileAllDueTradesAwaitingConfirmation(");
const reconciliationEnd = databaseSource.indexOf("\\nexport async function listPendingSettlements(", reconciliationStart);
const reconciliationSource = databaseSource.slice(reconciliationStart, reconciliationEnd);

describe("automatic Trading opportunity scheduler", () => {
  it("selects a bounded batch of active auto-assigned tiers instead of scanning all users", () => {
    expect(workerStart).toBeGreaterThanOrEqual(0);
    expect(workerEnd).toBeGreaterThan(workerStart);
    expect(workerSource).toContain("selectDistinct({id:customerPackageSubscriptions.userId})");
    expect(workerSource).toContain("LIKE 'auto-tier:%'");
    expect(workerSource).toContain('eq(customerPackageSubscriptions.status,"active")');
    expect(workerSource).toContain(".limit(batchSize)");
    expect(workerSource).not.toContain('.from(users).where(eq(users.role,"user"))');
    expect(workerSource).not.toContain("ensureAutomaticTradingTierEntitlements");
    expect(workerSource).toContain("Math.min(250,requestedBatchSize)");
  });

  it("locks and advances a durable round-robin cursor, wrapping when the end is reached", () => {
    expect(workerSource).toContain('const cursorKey="trade.autoTradeCycle.lastUserId"');
    expect(workerSource).toContain('.limit(1).for("update")');
    expect(workerSource).toContain("gt(customerPackageSubscriptions.userId,afterUserId)");
    expect(workerSource).toContain("if(!batch.length&&cursor>0) batch=await selectAfter(0)");
    expect(workerSource).toContain("settingValue:String(nextCursor)");
  });

  it("registers the entitlement lookup index in schema, migration, and journal", () => {
    expect(schemaSource).toContain("customer_package_subscriptions_worker_status_user_idx");
    expect(migrationSource).toContain("CREATE INDEX IF NOT EXISTS `customer_package_subscriptions_worker_status_user_idx`");
    expect(migrationSource).toContain("(`status`, `userId`, `startsAt`)");
    expect(JSON.parse(journalSource).entries.some((entry: { tag: string }) => entry.tag === "0083_trading_opportunity_worker_indexes")).toBe(true);
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
