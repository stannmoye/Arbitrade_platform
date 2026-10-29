import assert from "node:assert/strict";
import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { closeDbPool, createTrade, getDb, reconcileAllDueTradesAwaitingConfirmation } from "../server/db";
import {
  balanceLedger, currencyRegistry, customerBalances, customerPackageSubscriptions,
  fxRateSnapshots, opportunityOffers, opportunityPackagePolicies, packages, tradeLifecycleEvents, tradePositions, users,
} from "../drizzle/schema";

const db = await getDb();
if (!db) throw new Error("Settlement reconciliation integration requires DATABASE_URL to point to a disposable migrated database.");
const database = db;

const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
const openId = "settlement-reconcile-" + token;
let userId: number | undefined;
let fundingUserId: number | undefined;
let fundingPackageId: number | undefined;
let fundingPackageName: string | undefined;
let fundingOfferId: number | undefined;
let fundingCurrencyCode: string | undefined;
let fundingCurrencyId: number | undefined;
let failureTriggerName: string | undefined;
const tradeIds: number[] = [];

function matchesInjectedSqlSignal(error: unknown, expectedMessage: string): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const value = current as { cause?: unknown; message?: unknown; sqlMessage?: unknown; sqlState?: unknown };
    const message = `${String(value.sqlMessage ?? "")} ${String(value.message ?? "")}`;
    if (value.sqlState === "45000" && message.includes(expectedMessage)) return true;
    current = value.cause;
  }
  return false;
}

async function insertTrade(input: {
  settlesAt: Date;
  creditAt?: Date | null;
  status?: "pending" | "confirmed" | "settled" | "cancelled";
  settlementStatus?: string;
  lifecycleStage?: string;
}) {
  assert.ok(userId, "Test user must exist before creating trades");
  const inserted = await database.insert(tradePositions).values({
    userId,
    offerId: 100000 + tradeIds.length,
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

  // Inject a database error after cross-wallet source debits, conversion ledger
  // postings and FX snapshots have been written inside createTrade's transaction.
  // Every wallet/ledger/snapshot mutation must roll back together.
  const fundingOpenId = "funding-rollback-" + token;
  const fundingUserInsert = await db.insert(users).values({
    openId: fundingOpenId,
    name: "Cross Wallet Rollback Integration",
    email: fundingOpenId + "@example.invalid",
    role: "user",
    packageName: "Rollback",
  });
  fundingUserId = Number(fundingUserInsert[0].insertId);
  fundingCurrencyCode = ("F" + token.slice(0, 6)).toUpperCase();
  const currencyInsert = await db.insert(currencyRegistry).values({
    code: fundingCurrencyCode,
    name: "Rollback Test Currency",
    symbol: "F",
    scale: 2,
    assetType: "fiat",
    usdRate: "0.25",
    rateProvider: "manual",
    enabled: true,
  });
  fundingCurrencyId = Number(currencyInsert[0].insertId);
  const packageName = "RollbackTest-" + token;
  fundingPackageName = packageName;
  const packageInsert = await db.insert(packages).values({
    name: packageName,
    minimumQualifyingBalanceUsdMinor: 1,
    durationMonths: 1,
    opportunitiesPerDay: 6,
    termsVersion: 1,
    enabled: true,
    maxPopupsPerDay: 6,
    maxActiveInvestments: 1,
  });
  fundingPackageId = Number(packageInsert[0].insertId);
  await db.insert(opportunityPackagePolicies).values({
    packageName,
    minimumTradeUnits: 100,
    maximumTradeUnits: 100,
    enabled: true,
    automaticDelivery: true,
    automaticTradingEnabled: true,
    minimumPayoutRateBps: 100,
    maximumPayoutRateBps: 100,
    minimumTradeDurationSeconds: 60,
    maximumTradeDurationSeconds: 60,
  });
  await db.insert(customerPackageSubscriptions).values({
    userId: fundingUserId,
    packageId: fundingPackageId,
    startsAt: new Date(now - 60_000),
    expiresAt: new Date(now + 86_400_000),
    status: "active",
    activationKey: "auto-tier:rollback:" + token,
    termsSnapshotJson: JSON.stringify({ opportunitiesPerDay: 6 }),
    qualifyingBalanceUsdMinor: 10000,
    packageTermsVersion: 1,
  });
  const offerInsert = await db.insert(opportunityOffers).values({
    symbol: "ROLLBACK-" + token,
    venueFrom: "test-source",
    venueTo: "test-target",
    currency: "USD",
    minimumMinor: 10000,
    expectedRewardBps: 100,
    durationSeconds: 60,
    opensAt: new Date(now - 60_000),
    closesAt: new Date(now + 3_600_000),
    rewardAt: new Date(now + 3_600_000),
    status: "open",
  });
  fundingOfferId = Number(offerInsert[0].insertId);
  await db.insert(customerBalances).values([
    { userId: fundingUserId, currency: "USD", availableMinor: 1000, lockedMinor: 0, promotionalMinor: 0, earnedMinor: 0 },
    { userId: fundingUserId, currency: fundingCurrencyCode, availableMinor: 20000, lockedMinor: 0, promotionalMinor: 0, earnedMinor: 0 },
  ]);
  const beforeFundingWallets = await db.select({
    currency: customerBalances.currency,
    availableMinor: customerBalances.availableMinor,
    lockedMinor: customerBalances.lockedMinor,
  }).from(customerBalances).where(eq(customerBalances.userId, fundingUserId)).orderBy(customerBalances.currency);
  const beforeFundingLedger = await db.select({ id: balanceLedger.id }).from(balanceLedger).where(eq(balanceLedger.userId, fundingUserId));
  const beforeFundingFx = await db.select({ id: fxRateSnapshots.id }).from(fxRateSnapshots);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://api.frankfurter.dev/v2/rates?base=USD&quotes=")) {
      return new Response(JSON.stringify([{
        base: "USD",
        quote: fundingCurrencyCode,
        rate: 2,
        date: new Date().toISOString().slice(0, 10),
      }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("Unexpected FX provider request during rollback test: " + url);
  }) as typeof fetch;
  failureTriggerName = "inject_funding_rollback_" + token;
  try {
    await db.execute(sql.raw(`CREATE TRIGGER \`${failureTriggerName}\` BEFORE INSERT ON balance_ledger FOR EACH ROW BEGIN IF NEW.userId = ${fundingUserId} AND NEW.entryType = 'trade_reservation' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected cross-wallet rollback failure'; END IF; END`));
    await assert.rejects(
      createTrade(fundingUserId, { offerId: fundingOfferId, amountMinor: 10000, packageId: fundingPackageId }),
      (error) => matchesInjectedSqlSignal(error, "injected cross-wallet rollback failure"),
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (failureTriggerName) await db.execute(sql.raw(`DROP TRIGGER IF EXISTS \`${failureTriggerName}\``)).catch(() => {});
    failureTriggerName = undefined;
  }
  const afterFundingWallets = await db.select({
    currency: customerBalances.currency,
    availableMinor: customerBalances.availableMinor,
    lockedMinor: customerBalances.lockedMinor,
  }).from(customerBalances).where(eq(customerBalances.userId, fundingUserId)).orderBy(customerBalances.currency);
  const afterFundingLedger = await db.select({ id: balanceLedger.id }).from(balanceLedger).where(eq(balanceLedger.userId, fundingUserId));
  const afterFundingFx = await db.select({ id: fxRateSnapshots.id }).from(fxRateSnapshots);
  assert.deepEqual(afterFundingWallets, beforeFundingWallets, "A mid-transaction failure must restore every source and target wallet balance.");
  assert.deepEqual(afterFundingLedger, beforeFundingLedger, "A mid-transaction failure must remove all partial conversion/reservation ledger postings.");
  assert.deepEqual(afterFundingFx, beforeFundingFx, "A mid-transaction failure must roll back all FX snapshots written for the failed funding operation.");

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
    crossWalletFundingRollbackVerified: true,
  }));
} finally {
  try {
    if (tradeIds.length) {
      await db.delete(tradeLifecycleEvents).where(inArray(tradeLifecycleEvents.tradeId, tradeIds));
      await db.delete(tradePositions).where(inArray(tradePositions.id, tradeIds));
    }
    if (fundingUserId !== undefined) {
      if (failureTriggerName) await db.execute(sql.raw(`DROP TRIGGER IF EXISTS \`${failureTriggerName}\``)).catch(() => {});
      await db.delete(tradePositions).where(eq(tradePositions.userId, fundingUserId)).catch(() => {});
      await db.delete(balanceLedger).where(eq(balanceLedger.userId, fundingUserId)).catch(() => {});
      await db.delete(customerBalances).where(eq(customerBalances.userId, fundingUserId)).catch(() => {});
      await db.delete(customerPackageSubscriptions).where(eq(customerPackageSubscriptions.userId, fundingUserId)).catch(() => {});
      if (fundingOfferId) await db.delete(opportunityOffers).where(eq(opportunityOffers.id, fundingOfferId)).catch(() => {});
      if (fundingPackageName) await db.delete(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName, fundingPackageName)).catch(() => {});
      if (fundingPackageId) await db.delete(packages).where(eq(packages.id, fundingPackageId)).catch(() => {});
      if (fundingCurrencyId) {
        await db.delete(fxRateSnapshots).where(eq(fxRateSnapshots.baseAsset, fundingCurrencyCode!)).catch(() => {});
        await db.delete(currencyRegistry).where(eq(currencyRegistry.id, fundingCurrencyId)).catch(() => {});
      }
      await db.delete(users).where(eq(users.id, fundingUserId)).catch(() => {});
    }
    if (userId !== undefined) {
      await db.delete(balanceLedger).where(eq(balanceLedger.userId, userId));
      await db.delete(customerBalances).where(eq(customerBalances.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  } finally {
    await closeDbPool();
  }
}
