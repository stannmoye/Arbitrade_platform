import assert from "node:assert/strict";
import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { closeDbPool, createTrade, getDb, manuallySettleTrade, processConfirmedTradeCredits, reconcileAllDueTradesAwaitingConfirmation } from "../server/db";
import {
  balanceLedger, currencyRegistry, customerBalances, customerNotifications, customerPackageSubscriptions, emailOutbox,
  fxRateSnapshots, opportunityOffers, opportunityPackagePolicies, packages, tradeLifecycleEvents, tradePositions, tradeRewardReservations, tradeSettlementReferenceClaims, users,
} from "../drizzle/schema";

const db = await getDb();
if (!db) throw new Error("Settlement reconciliation integration requires DATABASE_URL to point to a disposable migrated database.");
const database = db;

const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
const openId = "settlement-reconcile-" + token;
let userId: number | undefined;
let adminId: number | undefined;
let settlementOfferId: number | undefined;
let settlementImmediateOfferId: number | undefined;
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
  settlementReviewAt?: Date | null;
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
    settlementReviewAt: input.settlementReviewAt ?? null,
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
  const adminOpenId = "settlement-admin-" + token;
  const adminInsert = await db.insert(users).values({
    openId: adminOpenId,
    name: "Settlement Admin Integration",
    email: adminOpenId + "@example.invalid",
    role: "admin",
    packageName: "Admin",
  });
  adminId = Number(adminInsert[0].insertId);

  const now = Date.now();
  const overdueBySchedule = await insertTrade({ settlesAt: new Date(now - 60_000) });
  // Administrator review becomes available at trade completion even when
  // the separately saved wallet-credit time is still in the future.
  const reviewDueBeforeCreditAt = await insertTrade({
    settlesAt: new Date(now - 60_000),
    settlementReviewAt: new Date(now - 30_000),
    creditAt: new Date(now + 3_600_000),
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
  for (const id of [overdueBySchedule, reviewDueBeforeCreditAt]) {
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
    .where(and(inArray(tradeLifecycleEvents.tradeId, [overdueBySchedule, reviewDueBeforeCreditAt]), eq(tradeLifecycleEvents.eventType, "settlement_due_waiting_for_confirmation")));
  assert.equal(dueEvents.length, 2, "One and only one due event must be recorded per transitioned trade.");
  const reconciliationLedgerAfter = await db.select({ id: balanceLedger.id }).from(balanceLedger).where(eq(balanceLedger.userId, userId));
  const reconciliationWalletAfter = await db.select({
    id: customerBalances.id,
    availableMinor: customerBalances.availableMinor,
    lockedMinor: customerBalances.lockedMinor,
    earnedMinor: customerBalances.earnedMinor,
  }).from(customerBalances).where(eq(customerBalances.userId, userId));
  assert.deepEqual(reconciliationLedgerAfter, ledgerBefore, "Due-time reconciliation must not write customer ledger entries.");
  assert.deepEqual(reconciliationWalletAfter, walletBefore, "Due-time reconciliation must not mutate customer wallet balances.");
  const unconfirmedCreditCycle = await processConfirmedTradeCredits();
  assert.equal(unconfirmedCreditCycle.credited, 0, "Elapsed time and review readiness must not post an unconfirmed trade.");

  // Exercise the two-phase result-confirmation and delayed-credit lifecycle on
  // a disposable account. The review time is past, but wallet credit is future.
  const settlementOffer = await db.insert(opportunityOffers).values({
    symbol: "SETTLEMENT-" + token,
    venueFrom: "integration-source",
    venueTo: "integration-target",
    currency: "USD",
    minimumMinor: 10000,
    expectedRewardBps: 100,
    durationSeconds: 60,
    opensAt: new Date(now - 120_000),
    closesAt: new Date(now + 3_600_000),
    rewardAt: new Date(now + 3_600_000),
    status: "open",
  });
  settlementOfferId = Number(settlementOffer[0].insertId);
  await db.insert(customerBalances).values({
    userId,
    currency: "USD",
    availableMinor: 1000,
    lockedMinor: 25000,
    promotionalMinor: 0,
    earnedMinor: 0,
  });
  const settlementTradeInsert = await db.insert(tradePositions).values({
    userId,
    offerId: settlementOfferId,
    currency: "USD",
    principalMinor: 25000,
    expectedRewardMinor: 1000,
    rewardReservedMinor: 1000,
    settlesAt: new Date(now - 60_000),
    settlementReviewAt: new Date(now - 30_000),
    creditAt: new Date(now + 3_600_000),
    status: "confirmed",
    settlementStatus: "pending",
    lifecycleStage: "Awaiting Settlement Confirmation",
  });
  const settlementTradeId = Number(settlementTradeInsert[0].insertId);
  tradeIds.push(settlementTradeId);
  await db.insert(tradeRewardReservations).values({
    userId,
    tradeId: settlementTradeId,
    packageName: "SettlementIntegration",
    windowKey: new Date(now).toISOString().slice(0, 10),
    currency: "USD",
    reservedMinor: 1000,
    status: "reserved",
  });
  const settlementReference = "integration-settlement-" + token;
  const settlementLedgerBefore = await db.select({ id: balanceLedger.id })
    .from(balanceLedger).where(eq(balanceLedger.userId, userId));
  const confirmation = await manuallySettleTrade(settlementTradeId, adminId!, {
    grossProfitMinor: 1000,
    settlementReference,
    notes: "Disposable database integration evidence",
  });
  assert.equal(confirmation.walletCreditPending, true, "Admin confirmation must not imply that the wallet has been credited.");
  const afterConfirmationTrade = (await db.select().from(tradePositions).where(eq(tradePositions.id, settlementTradeId)).limit(1))[0];
  assert.equal(afterConfirmationTrade?.status, "confirmed");
  assert.equal(afterConfirmationTrade?.settlementStatus, "confirmed_awaiting_credit");
  assert.ok(afterConfirmationTrade?.settlementConfirmedAt);
  assert.equal(afterConfirmationTrade?.walletUpdatedAt, null);
  assert.equal(afterConfirmationTrade?.settlementReference, settlementReference);
  const afterConfirmationWallet = (await db.select().from(customerBalances).where(eq(customerBalances.userId, userId)).limit(1))[0];
  assert.equal(Number(afterConfirmationWallet?.availableMinor), 1000, "Confirmation must not credit the available wallet balance.");
  assert.equal(Number(afterConfirmationWallet?.lockedMinor), 25000, "Confirmation must keep principal locked.");
  const settlementLedgerAfterConfirmation = await db.select({ id: balanceLedger.id })
    .from(balanceLedger).where(eq(balanceLedger.userId, userId));
  assert.deepEqual(settlementLedgerAfterConfirmation, settlementLedgerBefore, "Confirmation must not post ledger entries.");
  const earlyCreditCycle = await processConfirmedTradeCredits();
  assert.equal(earlyCreditCycle.credited, 0, "The credit worker must wait until creditAt even after administrator confirmation.");
  const replayConfirmation = await manuallySettleTrade(settlementTradeId, adminId!, {
    grossProfitMinor: 1000,
    settlementReference,
    notes: "Idempotent confirmation replay",
  });
  assert.equal(replayConfirmation.walletCreditPending, true, "A matching confirmation replay must not post money.");
  await db.update(tradePositions).set({ creditAt: new Date(Date.now() - 1000) })
    .where(eq(tradePositions.id, settlementTradeId));
  const [creditCycleA, creditCycleB] = await Promise.all([
    processConfirmedTradeCredits(),
    processConfirmedTradeCredits(),
  ]);
  assert.equal(creditCycleA.credited + creditCycleB.credited, 1, "Concurrent credit workers must post the confirmed trade exactly once.");
  const completedTrade = (await db.select().from(tradePositions).where(eq(tradePositions.id, settlementTradeId)).limit(1))[0];
  assert.equal(completedTrade?.status, "settled");
  assert.equal(completedTrade?.settlementStatus, "completed");
  assert.ok(completedTrade?.walletUpdatedAt);
  assert.ok(completedTrade?.completionAt);
  const completedWallet = (await db.select().from(customerBalances).where(eq(customerBalances.userId, userId)).limit(1))[0];
  assert.equal(Number(completedWallet?.availableMinor), 1000 + confirmation.totalMinor);
  assert.equal(Number(completedWallet?.lockedMinor), 0);
  assert.equal(Number(completedWallet?.earnedMinor), confirmation.netProfitMinor);
  const completedReservation = (await db.select().from(tradeRewardReservations).where(eq(tradeRewardReservations.tradeId, settlementTradeId)).limit(1))[0];
  assert.equal(completedReservation?.status, "credited");
  const settlementLedgerAfterCredit = await db.select({ entryType: balanceLedger.entryType, amountMinor: balanceLedger.amountMinor })
    .from(balanceLedger).where(eq(balanceLedger.userId, userId));
  assert.equal(settlementLedgerAfterCredit.length - settlementLedgerBefore.length, 3, "Principal, gross profit and fee postings must commit once for this positive-profit fixture.");
  const replayCreditCycle = await processConfirmedTradeCredits();
  assert.equal(replayCreditCycle.credited, 0, "A repeated worker cycle must not credit an already completed trade.");
  const settlementLedgerAfterReplay = await db.select({ id: balanceLedger.id })
    .from(balanceLedger).where(eq(balanceLedger.userId, userId));
  assert.equal(settlementLedgerAfterReplay.length, settlementLedgerAfterCredit.length, "Worker replay must not duplicate ledger rows.");

  // A result confirmed after its scheduled credit time is still credited only
  // by the worker, and only after the evidence-backed confirmation commits.
  const immediateOffer = await db.insert(opportunityOffers).values({
    symbol: "SETTLEMENT-IMMEDIATE-" + token,
    venueFrom: "integration-source",
    venueTo: "integration-target",
    currency: "USD",
    minimumMinor: 10000,
    expectedRewardBps: 100,
    durationSeconds: 60,
    opensAt: new Date(now - 120_000),
    closesAt: new Date(now + 3_600_000),
    rewardAt: new Date(now - 30_000),
    status: "open",
  });
  settlementImmediateOfferId = Number(immediateOffer[0].insertId);
  await db.update(customerBalances).set({
    lockedMinor: sql`${customerBalances.lockedMinor}+25000`,
  }).where(eq(customerBalances.userId, userId));
  const immediateTradeInsert = await db.insert(tradePositions).values({
    userId,
    offerId: settlementImmediateOfferId,
    currency: "USD",
    principalMinor: 25000,
    expectedRewardMinor: 1000,
    rewardReservedMinor: 1000,
    settlesAt: new Date(now - 60_000),
    settlementReviewAt: new Date(now - 30_000),
    creditAt: new Date(now - 10_000),
    status: "confirmed",
    settlementStatus: "pending",
    lifecycleStage: "Awaiting Settlement Confirmation",
  });
  const immediateTradeId = Number(immediateTradeInsert[0].insertId);
  tradeIds.push(immediateTradeId);
  await db.insert(tradeRewardReservations).values({
    userId,
    tradeId: immediateTradeId,
    packageName: "SettlementIntegration",
    windowKey: new Date(now).toISOString().slice(0, 10),
    currency: "USD",
    reservedMinor: 1000,
    status: "reserved",
  });
  const immediateReference = "integration-immediate-settlement-" + token;
  const immediateLedgerBefore = await db.select({ id: balanceLedger.id })
    .from(balanceLedger).where(eq(balanceLedger.userId, userId));
  const immediateWalletBefore = (await db.select().from(customerBalances)
    .where(eq(customerBalances.userId, userId)).limit(1))[0];
  const immediateConfirmation = await manuallySettleTrade(immediateTradeId, adminId!, {
    grossProfitMinor: 1000,
    settlementReference: immediateReference,
    notes: "Disposable overdue-credit integration evidence",
  });
  assert.equal(immediateConfirmation.walletCreditPending, true, "Confirmation after creditAt must still wait for the posting worker.");
  const immediateWalletAfterConfirmation = (await db.select().from(customerBalances)
    .where(eq(customerBalances.userId, userId)).limit(1))[0];
  assert.equal(Number(immediateWalletAfterConfirmation?.availableMinor), Number(immediateWalletBefore?.availableMinor));
  assert.equal(Number(immediateWalletAfterConfirmation?.lockedMinor), Number(immediateWalletBefore?.lockedMinor));
  const immediateLedgerAfterConfirmation = await db.select({ id: balanceLedger.id })
    .from(balanceLedger).where(eq(balanceLedger.userId, userId));
  assert.deepEqual(immediateLedgerAfterConfirmation, immediateLedgerBefore, "An overdue credit timestamp must not bypass administrator confirmation or post in the confirmation transaction.");
  const immediateCreditCycle = await processConfirmedTradeCredits();
  assert.equal(immediateCreditCycle.credited, 1, "The next worker cycle must post an already-due, newly confirmed trade.");
  const immediateCompletedTrade = (await db.select().from(tradePositions)
    .where(eq(tradePositions.id, immediateTradeId)).limit(1))[0];
  assert.equal(immediateCompletedTrade?.status, "settled");
  assert.equal(immediateCompletedTrade?.settlementStatus, "completed");
  assert.ok(immediateCompletedTrade?.walletUpdatedAt);
  const immediateLedgerAfterCredit = await db.select({ id: balanceLedger.id })
    .from(balanceLedger).where(eq(balanceLedger.userId, userId));
  assert.equal(immediateLedgerAfterCredit.length - immediateLedgerBefore.length, 3, "The overdue confirmed trade must post its principal, gross profit and fee once.");

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

  console.log(JSON.stringify({
    ok: true,
    database: process.env.DATABASE_URL?.replace(/:\/\/[^@]+@/, "://[redacted]@").replace(/\/[^/?]+(?:\?.*)?$/, "/[database]"),
    concurrentCycles: 2,
    overdueTradesTransitioned: cycleA.marked + cycleB.marked,
    lifecycleEvents: dueEvents.length,
    adminConfirmationDoesNotPost: true,
    futureCreditTimeRespected: true,
    concurrentWalletCreditExactlyOnce: true,
    settlementWorkerReplayIdempotent: true,
    futureTradeUnchanged: true,
    terminalTradeUnchanged: true,
    reconciliationDidNotMutateWalletOrLedger: true,
    crossWalletFundingRollbackVerified: true,
  }));
} finally {
  try {
    if (tradeIds.length) {
      await db.delete(tradeLifecycleEvents).where(inArray(tradeLifecycleEvents.tradeId, tradeIds));
      await db.delete(tradeRewardReservations).where(inArray(tradeRewardReservations.tradeId, tradeIds)).catch(() => {});
      await db.delete(tradeSettlementReferenceClaims).where(inArray(tradeSettlementReferenceClaims.tradeId, tradeIds)).catch(() => {});
      await db.delete(tradePositions).where(inArray(tradePositions.id, tradeIds));
    }
    if (settlementOfferId) await db.delete(opportunityOffers).where(eq(opportunityOffers.id, settlementOfferId)).catch(() => {});
    if (settlementImmediateOfferId) await db.delete(opportunityOffers).where(eq(opportunityOffers.id, settlementImmediateOfferId)).catch(() => {});
    if (userId !== undefined) await db.delete(customerBalances).where(eq(customerBalances.userId, userId)).catch(() => {});
    if (adminId !== undefined) await db.delete(users).where(eq(users.id, adminId)).catch(() => {});
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
      await db.delete(customerNotifications).where(eq(customerNotifications.userId, userId)).catch(() => {});
      const testEmail = openId + "@example.invalid";
      await db.delete(emailOutbox).where(eq(emailOutbox.recipient, testEmail)).catch(() => {});
      await db.delete(balanceLedger).where(eq(balanceLedger.userId, userId));
      await db.delete(customerBalances).where(eq(customerBalances.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  } finally {
    await closeDbPool();
  }
}
