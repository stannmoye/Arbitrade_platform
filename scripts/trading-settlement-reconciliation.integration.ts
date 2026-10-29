import assert from "node:assert/strict";
import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, reconcileAllDueTradesAwaitingConfirmation } from "../server/db";
import { balanceLedger, customerBalances, tradeLifecycleEvents, tradePositions, users } from "../drizzle/schema";

const db = await getDb();
if (!db) throw new Error("Settlement reconciliation integration requires DATABASE_URL to point to a disposable migrated database.");

const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
const openId = "settlement-reconcile-" + token;
let userId: number | undefined;
const tradeIds: number[] = [];

async function insertTrade(input: {
  settlesAt: Date;
  creditAt?: Date | null;
  status?: "pending" | "confirmed" | "settled" | "cancelled";
  settlementStatus?: string;
  lifecycleStage?: string;
}) {
  assert.ok(userId, "Test user must exist before creating trades");
  const inserted = await db.insert(tradePositions).values({
    userId,
    offerId: 1,
    currency: "USD",
    principalMinor: 25000,
    expectedRewardMinor: 1000,
    settlesAt: input.settlesAt,
    creditAt: input.creditAt ?? null,
    status: input.status ?? "confirmed",
    settlementStatus: input.settlementStatus ?? "pending",
    lifecycleStage: input.lifecycleStage ?? "Trade Allocated",
  });
  const id = Number(inserted[0].insertId);
  tradeIds.push(id);
  return id;
}

try {
  const userInsert = await db.insert(users).values({
    openId,
    name: "Settlement Reconciliation Integration",
    email: openId + "@example.invalid",
    role: "user",
    packageName: "Starter",
  });
  userId = Number(userInsert[0].insertId);

  const now = Date.now();
  const overdueBySchedule = await insertTrade({ settlesAt: new Date(now - 60_000) });
  // creditAt is the authoritative scheduled credit/settlement time when present,
  // even if the original settlesAt is later.
  const overdueByCreditAt = await insertTrade({
    settlesAt: new Date(now + 3_600_000),
    creditAt: new Date(now - 30_000),
  });
  const futureTrade = await insertTrade({ settlesAt: new Date(now + 3_600_000) });
  const alreadyWaiting = await insertTrade({
    settlesAt: new Date(now - 60_000),
    lifecycleStage: "Awaiting Settlement Confirmation",
  });
  const alreadySettled = await insertTrade({
    settlesAt: new Date(now - 120_000),
    status: "settled",
    settlementStatus: "completed",
    lifecycleStage: "Settled",
  });

  const ledgerBefore = await db.select({ id: balanceLedger.id }).from(balanceLedger).where(eq(balanceLedger.userId, userId));
  const walletBefore = await db.select({
    id: customerBalances.id,
    availableMinor: customerBalances.availableMinor,
    lockedMinor: customerBalances.lockedMinor,
    earnedMinor: customerBalances.earnedMinor,
  }).from(customerBalances).where(eq(customerBalances.userId, userId));

  // Competing cycles model overlapping worker attempts / multiple app instances.
  const [cycleA, cycleB] = await Promise.all([
    reconcileAllDueTradesAwaitingConfirmation(),
    reconcileAllDueTradesAwaitingConfirmation(),
  ]);
  assert.equal(cycleA.marked + cycleB.marked, 2, "Each eligible overdue trade must transition exactly once across concurrent cycles.");

  const rows = await db.select().from(tradePositions).where(inArray(tradePositions.id, tradeIds));
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const id of [overdueBySchedule, overdueByCreditAt]) {
    const trade = byId.get(id);
    assert.ok(trade);
    assert.equal(trade.status, "confirmed", "Elapsed time must not settle a trade.");
    assert.equal(trade.settlementStatus, "pending", "Elapsed time must not complete settlement.");
    assert.equal(trade.lifecycleStage, "Awaiting Settlement Confirmation");
    assert.equal(Number(trade.rewardCreditedMinor), 0, "No reward may be credited by reconciliation.");
    assert.equal(Number(trade.realizedGrossProfitMinor), 0, "No realized result may be invented by reconciliation.");
  }
  assert.equal(byId.get(futureTrade)?.lifecycleStage, "Trade Allocated", "Future trades must remain unchanged.");
  assert.equal(byId.get(futureTrade)?.settlementStatus, "pending");
  assert.equal(byId.get(alreadyWaiting)?.lifecycleStage, "Awaiting Settlement Confirmation");
  assert.equal(byId.get(alreadySettled)?.status, "settled", "Terminal trades must not be reopened.");

  const dueEvents = await db.select().from(tradeLifecycleEvents)
    .where(and(inArray(tradeLifecycleEvents.tradeId, [overdueBySchedule, overdueByCreditAt]), eq(tradeLifecycleEvents.eventType, "settlement_due_waiting_for_confirmation")));
  assert.equal(dueEvents.length, 2, "One and only one due event must be recorded per transitioned trade.");

  const ledgerAfter = await db.select({ id: balanceLedger.id }).from(balanceLedger).where(eq(balanceLedger.userId, userId));
  const walletAfter = await db.select({
    id: customerBalances.id,
    availableMinor: customerBalances.availableMinor,
    lockedMinor: customerBalances.lockedMinor,
    earnedMinor: customerBalances.earnedMinor,
  }).from(customerBalances).where(eq(customerBalances.userId, userId));
  assert.deepEqual(ledgerAfter, ledgerBefore, "Reconciliation must not write customer ledger entries.");
  assert.deepEqual(walletAfter, walletBefore, "Reconciliation must not mutate customer wallet balances.");

  console.log(JSON.stringify({
    ok: true,
    database: process.env.DATABASE_URL?.replace(/:\/\/[^@]+@/, "://[redacted]@").replace(/\/[^/?]+(?:\?.*)?$/, "/[database]"),
    concurrentCycles: 2,
    overdueTradesTransitioned: cycleA.marked + cycleB.marked,
    lifecycleEvents: dueEvents.length,
    futureTradeUnchanged: true,
    terminalTradeUnchanged: true,
    walletAndLedgerUnchanged: true,
  }));
} finally {
  if (tradeIds.length) {
    await db.delete(tradeLifecycleEvents).where(inArray(tradeLifecycleEvents.tradeId, tradeIds));
    await db.delete(tradePositions).where(inArray(tradePositions.id, tradeIds));
  }
  if (userId !== undefined) {
    await db.delete(balanceLedger).where(eq(balanceLedger.userId, userId));
    await db.delete(customerBalances).where(eq(customerBalances.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
}
