import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
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
  packages,
  customerPackageSubscriptions,
  tradeLifecycleEvents,
  tradeRewardReservations,
  tradePositions,
  opportunityPackagePolicies,
  users,
} from "../drizzle/schema";

const db = await getDb();
if (!db) throw new Error("Trading opportunity worker integration requires DATABASE_URL to point to a disposable migrated database.");

const token = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
const openId = "opportunity-worker-" + token;
const eventKey = "worker-event-" + token;
const currency = "T" + token.slice(0, 7).toUpperCase();
const packageName = "Wkr" + token;
let userId;
let eventId;
let offerId;
let secondOfferId;
let secondEventId;
let packageId;
let subscriptionId;
let tradeId;
let currencyInserted = false;
let offerInserted = false;
let secondOfferInserted = false;
let packageInserted = false;

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

  const packageInsert = await db.insert(packages).values({
    name: packageName,
    minimumQualifyingBalanceUsdMinor: 1,
    durationMonths: 1,
    opportunitiesPerDay: 1,
    termsVersion: 1,
    maxActiveInvestments: 5,
    enabled: true,
  });
  packageId = Number(packageInsert[0].insertId);
  packageInserted = true;
  await db.insert(opportunityPackagePolicies).values({
    packageName,
    enabled: true,
    automaticDelivery: true,
    automaticTradingEnabled: true,
    minimumPayoutRateBps: 400,
    maximumPayoutRateBps: 400,
    minimumTradeDurationSeconds: 3600,
    maximumTradeDurationSeconds: 3600,
  });
  const subscriptionInsert = await db.insert(customerPackageSubscriptions).values({
    userId,
    packageId,
    startsAt: new Date(Date.now() - 60000),
    expiresAt: new Date(Date.now() + 86400000),
    status: "active",
    activationKey: "auto-tier:" + token,
    termsSnapshotJson: JSON.stringify({ opportunitiesPerDay: 1, maxActiveInvestments: 5 }),
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

  const secondOfferInsert = await db.insert(opportunityOffers).values({
    symbol: "TEST2",
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
  secondOfferId = Number(secondOfferInsert[0].insertId);
  secondOfferInserted = true;
  const secondEventInsert = await db.insert(opportunityPopupEvents).values({
    eventKey: eventKey + "-second",
    userId,
    offerId: secondOfferId,
    quotaDay: new Date().toISOString().slice(0, 10),
    packageName: "Integration",
    symbol: "TEST2",
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
  secondEventId = Number(secondEventInsert[0].insertId);

  const offer = { deliveryEventId: eventId, offerId, tradeRetryDelaySeconds: 30 };
  const secondOffer = { deliveryEventId: secondEventId, offerId: secondOfferId, tradeRetryDelaySeconds: 30 };
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

  const crashedWorker = spawn(process.execPath, ["--import", "tsx", "scripts/trading-opportunity-worker-crash-fixture.ts"], {
    env: {
      ...process.env,
      WORKER_TEST_USER_ID: String(userId),
      WORKER_TEST_EVENT_ID: String(eventId),
      WORKER_TEST_OFFER_ID: String(offerId),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let crashedWorkerOutput = "";
  const crashedWorkerExit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    crashedWorker.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const crashedWorkerToken = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      crashedWorker.kill("SIGKILL");
      reject(new Error("Timed out waiting for the child worker to persist its lease."));
    }, 15000);
    crashedWorker.stdout.on("data", (chunk: Buffer) => {
      crashedWorkerOutput += chunk.toString();
      const match = crashedWorkerOutput.match(/CLAIMED:([A-Za-z0-9-]+)/);
      if (match && !settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(match[1]);
      } else if (crashedWorkerOutput.includes("NOT_CLAIMED") && !settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error("The child worker could not claim the expired opportunity lease."));
      }
    });
    crashedWorker.stderr.on("data", (chunk: Buffer) => {
      crashedWorkerOutput += chunk.toString();
    });
    crashedWorker.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    crashedWorker.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error("The child worker exited before publishing its lease (code=" + code + ", signal=" + signal + ")."));
    });
  });
  crashedWorker.kill("SIGKILL");
  const crashedWorkerExitResult = await crashedWorkerExit;
  assert.equal(crashedWorkerExitResult.signal, "SIGKILL",
    "The test must terminate the lease-owning worker process before recovery.");

  await db.update(opportunityPopupEvents)
    .set({ executionRetryAfter: new Date(Date.now() - 1000) })
    .where(and(eq(opportunityPopupEvents.id, eventId), eq(opportunityPopupEvents.userId, userId)));
  const recoveredClaim = await claimOpportunityExecutionAttempt(userId, offer, 5);
  assert.equal(recoveredClaim.claimed, true, "A restarted worker must reclaim a lease abandoned by a crashed process.");
  assert.ok(recoveredClaim.executionLeaseToken);
  assert.notEqual(recoveredClaim.executionLeaseToken, firstClaim.executionLeaseToken,
    "A reclaimed lease must receive a new fencing token.");
  assert.notEqual(recoveredClaim.executionLeaseToken, crashedWorkerToken,
    "Recovery after a process crash must fence the token owned by the terminated process.");

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
  await assert.rejects(
    createTrade(userId, {
      offerId,
      amountMinor: 25000,
      deliveryEventId: eventId,
      executionLeaseToken: crashedWorkerToken,
    }),
    /execution lease was lost/i,
    "A worker token left behind by a killed process must be fenced after recovery.",
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

  const secondClaim = await claimOpportunityExecutionAttempt(userId, secondOffer, 5);
  assert.equal(secondClaim.claimed, true, "The competing opportunity must be independently claimable before quota contention.");
  assert.ok(secondClaim.executionLeaseToken);

  const allocationResults = await Promise.allSettled([
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
    createTrade(userId, {
      offerId: secondOfferId,
      amountMinor: 25000,
      deliveryEventId: secondEventId,
      executionLeaseToken: secondClaim.executionLeaseToken,
    }),
    createTrade(userId, {
      offerId: secondOfferId,
      amountMinor: 25000,
      deliveryEventId: secondEventId,
      executionLeaseToken: secondClaim.executionLeaseToken,
    }),
  ]);
  const fulfilledAllocations = allocationResults.filter((result) => result.status === "fulfilled");
  const rejectedAllocations = allocationResults.filter((result) => result.status === "rejected");
  assert.equal(fulfilledAllocations.length, 2,
    "Exactly one of two competing opportunities should allocate; its duplicate request should replay.");
  assert.equal(rejectedAllocations.length, 2,
    "Both requests for the competing opportunity must be rejected once the one-per-day quota is consumed.");
  const successfulAllocationResults = fulfilledAllocations.map((result) => result.value);
  assert.equal(successfulAllocationResults[0].tradeId, successfulAllocationResults[1].tradeId,
    "The winning event's competing requests must resolve to one trade ID.");
  tradeId = successfulAllocationResults[0].tradeId;
  assert.equal(successfulAllocationResults.filter((result) => result.idempotentReplay === true).length, 1,
    "Exactly one concurrent request should take the committed-allocation replay path.");
  assert.ok(rejectedAllocations.every((result) => /quota.*used|no remaining quota/i.test(String(result.reason?.message || result.reason))),
    "Losing opportunity requests must fail for quota exhaustion, not unrelated validation errors.");
  const allocatedTrades = await db.select({ id: tradePositions.id, offerId: tradePositions.offerId, principalMinor: tradePositions.principalMinor })
    .from(tradePositions).where(eq(tradePositions.userId, userId));
  assert.equal(allocatedTrades.length, 1, "Concurrent cross-event allocation must create exactly one trade for a one-opportunity daily quota.");
  assert.equal(Number(allocatedTrades[0].principalMinor), 25000);
  const winningOfferId = Number(allocatedTrades[0].offerId);
  const winningEventId = winningOfferId === offerId ? eventId : secondEventId;
  const winningLeaseToken = winningOfferId === offerId ? recoveredClaim.executionLeaseToken : secondClaim.executionLeaseToken;
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
    createTrade(userId, { offerId: winningOfferId, amountMinor: 25000, deliveryEventId: winningEventId, executionLeaseToken: winningLeaseToken }),
    createTrade(userId, { offerId: winningOfferId, amountMinor: 25000, deliveryEventId: winningEventId, executionLeaseToken: winningLeaseToken }),
  ]);
  assert.deepEqual(replayResults.map((result) => result.tradeId), [tradeId, tradeId],
    "Concurrent retries after a committed allocation must return the same trade.");
  assert.ok(replayResults.every((result) => result.idempotentReplay === true),
    "A committed delivery event must take the idempotent replay path.");
  const tradeRows = await db.select({ id: tradePositions.id })
    .from(tradePositions).where(eq(tradePositions.userId, userId));
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
    crashedWorkerKilled: crashedWorkerExitResult.signal === "SIGKILL",
    crashedWorkerTokenFenced: true,
    staleWorkerFenced: true,
    concurrentFreshAllocations: allocationResults.length,
    successfulAllocationRequests: fulfilledAllocations.length,
    quotaRejectedAllocationRequests: rejectedAllocations.length,
    freshAllocationReplayCount: successfulAllocationResults.filter((result) => result.idempotentReplay === true).length,
    concurrentIdempotentReplays: replayResults.length,
    uniqueTradeRows: tradeRows.length,
    ledgerAndWalletUnchangedOnStaleAndReplay: true,
  }));
} finally {
  try {
    if (eventId !== undefined) {
      await db.delete(opportunityPopupEvents).where(eq(opportunityPopupEvents.id, eventId));
    }
    if (secondEventId !== undefined) {
      await db.delete(opportunityPopupEvents).where(eq(opportunityPopupEvents.id, secondEventId));
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
    await db.delete(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName, packageName));
    if (packageInserted && packageId !== undefined) await db.delete(packages).where(eq(packages.id, packageId));
    if (offerInserted && offerId !== undefined) await db.delete(opportunityOffers).where(eq(opportunityOffers.id, offerId));
    if (secondOfferInserted && secondOfferId !== undefined) await db.delete(opportunityOffers).where(eq(opportunityOffers.id, secondOfferId));
    if (currencyInserted) {
      await db.delete(currencyRegistry).where(eq(currencyRegistry.code, currency));
    }
  } finally {
    await closeDbPool();
  }
}
