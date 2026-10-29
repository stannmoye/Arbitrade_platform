import assert from "node:assert/strict";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  claimOpportunityExecutionAttempt,
  closeDbPool,
  createTrade,
  getDb,
} from "../server/db";
import {
  balanceLedger,
  currencyRegistry,
  customerBalances,
  opportunityPopupEvents,
  tradePositions,
  users,
} from "../drizzle/schema";

const db = await getDb();
if (!db) throw new Error("Trading opportunity worker integration requires DATABASE_URL to point to a disposable migrated database.");

const token = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
const openId = "opportunity-worker-" + token;
const eventKey = "worker-event-" + token;
const currency = "T" + token.slice(0, 7).toUpperCase();
const offerId = 900000 + Math.floor(Math.random() * 90000);
let userId;
let eventId;
let tradeId;
let currencyInserted = false;

try {
  const userInsert = await db.insert(users).values({
    openId,
    name: "Trading Opportunity Worker Integration",
    email: openId + "@example.invalid",
    role: "user",
    packageName: "Starter",
  });
  userId = Number(userInsert[0].insertId);

  await db.insert(currencyRegistry).values({
    code: currency,
    name: "Worker Integration Currency",
    symbol: currency,
    scale: 2,
    assetType: "fiat",
    usdRate: "1",
    rateProvider: "integration-test",
    enabled: true,
  });
  currencyInserted = true;

  const eventInsert = await db.insert(opportunityPopupEvents).values({
    eventKey,
    userId,
    offerId,
    quotaDay: new Date().toISOString().slice(0, 10),
    packageName: "Integration",
    symbol: "TEST",
    currency,
    minimumMinor: 25000,
    expectedRewardBps: 400,
    balanceAvailableMinor: 100000,
    balanceStatus: "sufficient",
    eventStatus: "DELIVERED",
    deliveryStatus: "delivered",
    executionStatus: "READY",
    executionAttemptCount: 0,
  });
  eventId = Number(eventInsert[0].insertId);

  const offer = { deliveryEventId: eventId, offerId, tradeRetryDelaySeconds: 30 };
  const competingClaims = await Promise.all([
    claimOpportunityExecutionAttempt(userId, offer, 5),
    claimOpportunityExecutionAttempt(userId, offer, 5),
  ]);
  assert.equal(competingClaims.filter((claim) => claim.claimed).length, 1,
    "Two concurrent workers must not both claim the same opportunity event.");
  const firstClaim = competingClaims.find((claim) => claim.claimed);
  assert.ok(firstClaim?.executionLeaseToken, "The winning worker must receive a lease token.");

  await db.update(opportunityPopupEvents)
    .set({ executionRetryAfter: new Date(Date.now() - 1000) })
    .where(and(eq(opportunityPopupEvents.id, eventId), eq(opportunityPopupEvents.userId, userId)));
  const recoveredClaim = await claimOpportunityExecutionAttempt(userId, offer, 5);
  assert.equal(recoveredClaim.claimed, true, "An expired lease must be reclaimable after a worker crash.");
  assert.ok(recoveredClaim.executionLeaseToken);
  assert.notEqual(recoveredClaim.executionLeaseToken, firstClaim.executionLeaseToken,
    "A reclaimed lease must receive a new fencing token.");

  const ledgerBeforeStaleCall = await db.select({ id: balanceLedger.id })
    .from(balanceLedger).where(eq(balanceLedger.userId, userId));
  const balancesBeforeStaleCall = await db.select({
    id: customerBalances.id,
    availableMinor: customerBalances.availableMinor,
    lockedMinor: customerBalances.lockedMinor,
    earnedMinor: customerBalances.earnedMinor,
  }).from(customerBalances).where(eq(customerBalances.userId, userId));
  await assert.rejects(
    createTrade(userId, {
      offerId,
      amountMinor: 25000,
      deliveryEventId: eventId,
      executionLeaseToken: firstClaim.executionLeaseToken,
    }),
    /execution lease was lost/i,
    "A stale worker must be fenced before it can mutate financial state.",
  );
  assert.deepEqual(
    await db.select({ id: balanceLedger.id }).from(balanceLedger).where(eq(balanceLedger.userId, userId)),
    ledgerBeforeStaleCall,
    "A stale lease must not create ledger postings.",
  );
  assert.deepEqual(
    await db.select({
      id: customerBalances.id,
      availableMinor: customerBalances.availableMinor,
      lockedMinor: customerBalances.lockedMinor,
      earnedMinor: customerBalances.earnedMinor,
    }).from(customerBalances).where(eq(customerBalances.userId, userId)),
    balancesBeforeStaleCall,
    "A stale lease must not change wallet balances.",
  );

  const tradeInsert = await db.insert(tradePositions).values({
    userId,
    offerId,
    currency,
    principalMinor: 25000,
    expectedRewardMinor: 1000,
    settlesAt: new Date(Date.now() + 3600000),
    status: "confirmed",
    settlementStatus: "pending",
    lifecycleStage: "Trade Allocated",
  });
  tradeId = Number(tradeInsert[0].insertId);
  await db.update(opportunityPopupEvents).set({
    eventStatus: "TRADED",
    tradeId,
    executionStatus: "SUCCEEDED",
    executionLeaseToken: recoveredClaim.executionLeaseToken,
  }).where(eq(opportunityPopupEvents.id, eventId));

  const ledgerBeforeReplay = await db.select({ id: balanceLedger.id })
    .from(balanceLedger).where(eq(balanceLedger.userId, userId));
  const balancesBeforeReplay = await db.select({
    id: customerBalances.id,
    availableMinor: customerBalances.availableMinor,
    lockedMinor: customerBalances.lockedMinor,
    earnedMinor: customerBalances.earnedMinor,
  }).from(customerBalances).where(eq(customerBalances.userId, userId));

  const replayResults = await Promise.all([
    createTrade(userId, { offerId, amountMinor: 25000, deliveryEventId: eventId, executionLeaseToken: recoveredClaim.executionLeaseToken }),
    createTrade(userId, { offerId, amountMinor: 25000, deliveryEventId: eventId, executionLeaseToken: recoveredClaim.executionLeaseToken }),
  ]);
  assert.deepEqual(replayResults.map((result) => result.tradeId), [tradeId, tradeId],
    "Concurrent retries after a committed allocation must return the same trade.");
  assert.ok(replayResults.every((result) => result.idempotentReplay === true),
    "A committed delivery event must take the idempotent replay path.");
  const tradeRows = await db.select({ id: tradePositions.id })
    .from(tradePositions).where(and(eq(tradePositions.userId, userId), eq(tradePositions.offerId, offerId)));
  assert.deepEqual(tradeRows.map((row) => row.id), [tradeId],
    "Concurrent replay must not create another trade position.");
  assert.deepEqual(
    await db.select({ id: balanceLedger.id }).from(balanceLedger).where(eq(balanceLedger.userId, userId)),
    ledgerBeforeReplay,
    "Idempotent replay must not create additional ledger postings.",
  );
  assert.deepEqual(
    await db.select({
      id: customerBalances.id,
      availableMinor: customerBalances.availableMinor,
      lockedMinor: customerBalances.lockedMinor,
      earnedMinor: customerBalances.earnedMinor,
    }).from(customerBalances).where(eq(customerBalances.userId, userId)),
    balancesBeforeReplay,
    "Idempotent replay must not mutate wallet balances.",
  );

  console.log(JSON.stringify({
    ok: true,
    concurrentClaims: 2,
    winningClaims: competingClaims.filter((claim) => claim.claimed).length,
    leaseRecovered: recoveredClaim.claimed,
    staleWorkerFenced: true,
    concurrentIdempotentReplays: replayResults.length,
    uniqueTradeRows: tradeRows.length,
    ledgerAndWalletUnchangedOnStaleAndReplay: true,
  }));
} finally {
  try {
    if (eventId !== undefined) {
      await db.delete(opportunityPopupEvents).where(eq(opportunityPopupEvents.id, eventId));
    }
    if (tradeId !== undefined) {
      await db.delete(tradePositions).where(eq(tradePositions.id, tradeId));
    }
    if (userId !== undefined) {
      await db.delete(balanceLedger).where(eq(balanceLedger.userId, userId));
      await db.delete(customerBalances).where(eq(customerBalances.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
    if (currencyInserted) {
      await db.delete(currencyRegistry).where(eq(currencyRegistry.code, currency));
    }
  } finally {
    await closeDbPool();
  }
}
