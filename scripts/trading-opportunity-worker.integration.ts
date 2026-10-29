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
  opportunityOffers,
  opportunityPackagePolicies,
  packages,
  customerPackageSubscriptions,
  tradeLifecycleEvents,
  tradeRewardReservations,
  tradePositions,
  users,
} from "../drizzle/schema";

const db = await getDb();
if (!db) throw new Error("Trading opportunity worker integration requires DATABASE_URL to point to a disposable migrated database.");

const token = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
const openId = "opportunity-worker-" + token;
const eventKey = "worker-event-" + token;
const currency = "T" + token.slice(0, 7).toUpperCase();
let userId;
let eventId;
let offerId;
let packageId;
let subscriptionId;
let tradeId;
let currencyInserted = false;
let offerInserted = false;
let packageInserted = false;
let packagePolicyInserted = false;

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

  const packageName = "Wkr" + token;
  const packageInsert = await db.insert(packages).values({
    name: packageName,
    minimumQualifyingBalanceUsdMinor: 1,
    durationMonths: 1,
    opportunitiesPerDay: 6,
    termsVersion: 1,
    maxActiveInvestments: 5,
    enabled: true,
  });
  packageId = Number(packageInsert[0].insertId);
  packageInserted = true;
  await db.insert(opportunityPackagePolicies).values({
    packageName,
    minimumTradeUnits: 1,
    maximumTradeUnits: 10000,
    maxConcurrentActiveTrades: 1,
    automaticTradingEnabled: true,
  });
  packagePolicyInserted = true;
  const subscriptionInsert = await db.insert(customerPackageSubscriptions).values({
    userId,
    packageId,
    startsAt: new Date(Date.now() - 60000),
    expiresAt: new Date(Date.now() + 86400000),
    status: "active",
    activationKey: "auto-tier:" + token,
    termsSnapshotJson: JSON.stringify({ opportunitiesPerDay: 6, maxActiveInvestments: 5 }),
    qualifyingBalanceUsdMinor: 10000,
    packageTermsVersion: 1,
  });
  subscriptionId = Number(subscriptionInsert[0].insertId);
  await db.insert(customerBalances).values({
    userId,
    currency,
    availableMinor: 100000,
    lockedMinor: 0,
    promotionalMinor: 0,
    earnedMinor: 0,
  });
  const offerInsert = await db.insert(opportunityOffers).values({
    symbol: "TEST",
    venueFrom: "integration-source",
    venueTo: "integration-destination",
    currency,
    minimumMinor: 25000,
    expectedRewardBps: 400,
    durationSeconds: 3600,
    opensAt: new Date(Date.now() - 60000),
    closesAt: new Date(Date.now() + 3600000),
    rewardAt: new Date(Date.now() + 3600000),
    status: "open",
  });
  offerId = Number(offerInsert[0].insertId);
  offerInserted = true;

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

  const ledgerBeforeAllocation = await db.select({ id: balanceLedger.id, amountMinor: balanceLedger.amountMinor })
    .from(balanceLedger).where(eq(balanceLedger.userId, userId));
  const balancesBeforeAllocation = await db.select({
    id: customerBalances.id,
    availableMinor: customerBalances.availableMinor,
    lockedMinor: customerBalances.lockedMinor,
    earnedMinor: customerBalances.earnedMinor,
  }).from(customerBalances).where(eq(customerBalances.userId, userId));

  const allocationResults = await Promise.all([
    createTrade(userId, {
      offerId,
      amountMinor: 25000,
      deliveryEventId: eventId,
      executionLeaseToken: recoveredClaim.executionLeaseToken,
    }),
    createTrade(userId, {
      offerId,
      amountMinor: 25000,
      deliveryEventId: eventId,
      executionLeaseToken: recoveredClaim.executionLeaseToken,
    }),
  ]);
  assert.equal(allocationResults[0].tradeId, allocationResults[1].tradeId,
    "Competing fresh allocations for one event must resolve to one trade ID.");
  tradeId = allocationResults[0].tradeId;
  assert.equal(allocationResults.filter((result) => result.idempotentReplay === true).length, 1,
    "Exactly one concurrent request should take the committed-allocation replay path.");
  const allocatedTrades = await db.select({ id: tradePositions.id, principalMinor: tradePositions.principalMinor })
    .from(tradePositions).where(and(eq(tradePositions.userId, userId), eq(tradePositions.offerId, offerId)));
  assert.equal(allocatedTrades.length, 1, "Concurrent fresh allocation must create exactly one trade.");
  assert.equal(Number(allocatedTrades[0].principalMinor), 25000);
  const ledgerAfterAllocation = await db.select({ id: balanceLedger.id, amountMinor: balanceLedger.amountMinor })
    .from(balanceLedger).where(eq(balanceLedger.userId, userId));
  assert.equal(ledgerAfterAllocation.length, ledgerBeforeAllocation.length + 1,
    "Concurrent fresh allocation must post exactly one wallet reservation ledger entry.");
  assert.equal(Number(ledgerAfterAllocation.at(-1)?.amountMinor), -25000);
  const balancesAfterAllocation = await db.select({
    id: customerBalances.id,
    availableMinor: customerBalances.availableMinor,
    lockedMinor: customerBalances.lockedMinor,
    earnedMinor: customerBalances.earnedMinor,
  }).from(customerBalances).where(eq(customerBalances.userId, userId));
  assert.equal(Number(balancesAfterAllocation[0].availableMinor), Number(balancesBeforeAllocation[0].availableMinor) - 25000,
    "Concurrent fresh allocation must debit available balance once.");
  assert.equal(Number(balancesAfterAllocation[0].lockedMinor), Number(balancesBeforeAllocation[0].lockedMinor) + 25000,
    "Concurrent fresh allocation must lock principal once.");

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
    await db.select({ id: balanceLedger.id, amountMinor: balanceLedger.amountMinor }).from(balanceLedger).where(eq(balanceLedger.userId, userId)),
    ledgerAfterAllocation,
    "Idempotent replay must not create additional ledger postings.",
  );
  assert.deepEqual(
    await db.select({
      id: customerBalances.id,
      availableMinor: customerBalances.availableMinor,
      lockedMinor: customerBalances.lockedMinor,
      earnedMinor: customerBalances.earnedMinor,
    }).from(customerBalances).where(eq(customerBalances.userId, userId)),
    balancesAfterAllocation,
    "Idempotent replay must not mutate wallet balances.",
  );

  console.log(JSON.stringify({
    ok: true,
    concurrentClaims: 2,
    winningClaims: competingClaims.filter((claim) => claim.claimed).length,
    leaseRecovered: recoveredClaim.claimed,
    staleWorkerFenced: true,
    concurrentFreshAllocations: allocationResults.length,
    freshAllocationReplayCount: allocationResults.filter((result) => result.idempotentReplay === true).length,
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
      await db.delete(tradeLifecycleEvents).where(eq(tradeLifecycleEvents.tradeId, tradeId));
      await db.delete(tradeRewardReservations).where(eq(tradeRewardReservations.tradeId, tradeId));
      await db.delete(tradePositions).where(eq(tradePositions.id, tradeId));
    }
    if (userId !== undefined) {
      await db.delete(balanceLedger).where(eq(balanceLedger.userId, userId));
      await db.delete(customerBalances).where(eq(customerBalances.userId, userId));
      if (subscriptionId !== undefined) await db.delete(customerPackageSubscriptions).where(eq(customerPackageSubscriptions.id, subscriptionId));
      await db.delete(users).where(eq(users.id, userId));
    }
    if (packagePolicyInserted) await db.delete(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName, "Wkr" + token));
    if (packageInserted && packageId !== undefined) await db.delete(packages).where(eq(packages.id, packageId));
    if (offerInserted && offerId !== undefined) await db.delete(opportunityOffers).where(eq(opportunityOffers.id, offerId));
    if (currencyInserted) {
      await db.delete(currencyRegistry).where(eq(currencyRegistry.code, currency));
    }
  } finally {
    await closeDbPool();
  }
}
