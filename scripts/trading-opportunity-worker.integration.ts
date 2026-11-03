import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { and, eq } from "drizzle-orm";
import {
  claimOpportunityExecutionAttempt,
  closeDbPool,
  createTrade,
  getDb,
  recordOpportunityExecutionFailure,
  listCustomerOpportunities,
} from "../server/db";
import { MAX_TRANSIENT_ATTEMPTS_PER_OPPORTUNITY } from "../server/modules/trade-execution-retry";
import {
  balanceLedger,
  currencyRegistry,
  customerBalances,
  opportunityPopupEvents,
  opportunityOffers,
  packages,
  customerPackageSubscriptions,
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
const secondaryPackageName = packageName + "Plus";
let userId;
let eventId;
let offerId;
let secondOfferId;
let secondEventId;
let thirdOfferId;
let thirdEventId;
let packageId;
let subscriptionId;
let currencyInserted = false;
let offerInserted = false;
let secondOfferInserted = false;
let packageInserted = false;
let secondaryPolicyInserted = false;

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
    minimumTradeUnits: 250,
    maximumTradeUnits: 250,
    maxTradeAttemptsPerDay: 4,
    requirePreviousSettlement: false,
    maxConcurrentActiveTrades: 5,
    enabled: true,
    automaticDelivery: true,
    automaticTradingEnabled: true,
    minimumPayoutRateBps: 400,
    maximumPayoutRateBps: 400,
    minimumTradeDurationSeconds: 3600,
    maximumTradeDurationSeconds: 3600,
  });
  // A second tier policy with the same configured limit lets this fixture prove
  // that the customer's attempt count is aggregated across package opportunities.
  await db.insert(opportunityPackagePolicies).values({
    packageName: secondaryPackageName,
    maxTradeAttemptsPerDay: 4,
    requirePreviousSettlement: false,
  });
  secondaryPolicyInserted = true;
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
    packageName,
    symbol: "TEST",
    currency,
    minimumMinor: 25000,
    expectedRewardBps: 400,
    configuredProfitRateBps: 400,
    configuredDurationSeconds: 3600,
    balanceAvailableMinor: 100000,
    balanceStatus: "sufficient",
    eventStatus: "DELIVERED",
    deliveryStatus: "delivered",
    executionStatus: "READY",
    executionAttemptCount: 0,
  });
  eventId = Number(eventInsert[0].insertId);

  await db.update(opportunityPackagePolicies).set({ maxVisibleOffers: 1, dailyPopupTarget: 1 })
    .where(eq(opportunityPackagePolicies.packageName, packageName));
  const quotaSnapshot = await listCustomerOpportunities(userId);
  assert.equal(quotaSnapshot.delivery.maxPopupsPerDay, 1, "The tier entitlement remains the daily delivery cap.");
  assert.equal(quotaSnapshot.delivery.maxVisibleOffers, 1, "The policy sets a separate simultaneous visible-offer cap.");
  assert.equal(quotaSnapshot.delivery.activeVisibleCount, 1, "The existing delivered popup occupies one visible slot.");
  assert.equal(quotaSnapshot.delivery.remainingDailyQuota, 1, "A visible-offer cap does not consume the remaining daily entitlement.");
  assert.equal(quotaSnapshot.delivery.remainingVisibleSlots, 0, "No further popup can appear while the visible slot is occupied.");
  assert.equal(quotaSnapshot.delivery.remainingQuota, 0, "Delivery stops when simultaneous visible capacity is exhausted.");

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
    packageName: secondaryPackageName,
    symbol: "TEST2",
    currency,
    minimumMinor: 25000,
    expectedRewardBps: 400,
    configuredProfitRateBps: 400,
    configuredDurationSeconds: 3600,
    balanceAvailableMinor: 100000,
    balanceStatus: "sufficient",
    eventStatus: "DELIVERED",
    deliveryStatus: "delivered",
    executionStatus: "READY",
    executionAttemptCount: 0,
  });
  secondEventId = Number(secondEventInsert[0].insertId);

  const thirdOfferInsert = await db.insert(opportunityOffers).values({
    symbol: "TEST3",
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
  thirdOfferId = Number(thirdOfferInsert[0].insertId);
  const thirdEventInsert = await db.insert(opportunityPopupEvents).values({
    eventKey: eventKey + "-third",
    userId,
    offerId: thirdOfferId,
    quotaDay: new Date().toISOString().slice(0, 10),
    packageName,
    symbol: "TEST3",
    currency,
    minimumMinor: 25000,
    expectedRewardBps: 400,
    configuredProfitRateBps: 400,
    configuredDurationSeconds: 3600,
    balanceAvailableMinor: 100000,
    balanceStatus: "sufficient",
    eventStatus: "DELIVERED",
    deliveryStatus: "delivered",
    executionStatus: "READY",
    executionAttemptCount: 0,
  });
  thirdEventId = Number(thirdEventInsert[0].insertId);

  const offer = { deliveryEventId: eventId, offerId, tradeRetryDelaySeconds: 30 };
  const secondOffer = { deliveryEventId: secondEventId, offerId: secondOfferId, tradeRetryDelaySeconds: 30 };
  const thirdOffer = { deliveryEventId: thirdEventId, offerId: thirdOfferId, tradeRetryDelaySeconds: 30 };
  const competingClaims = await Promise.all([
    claimOpportunityExecutionAttempt(userId, offer),
    claimOpportunityExecutionAttempt(userId, offer),
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
  const recoveredClaim = await claimOpportunityExecutionAttempt(userId, offer);
  assert.equal(recoveredClaim.claimed, true, "A restarted worker must reclaim a lease abandoned by a crashed process.");
  assert.ok(recoveredClaim.executionLeaseToken);
  assert.notEqual(recoveredClaim.executionLeaseToken, firstClaim.executionLeaseToken,
    "A reclaimed lease must receive a new fencing token.");
  assert.notEqual(recoveredClaim.executionLeaseToken, crashedWorkerToken,
    "Recovery after a process crash must fence the token owned by the terminated process.");

  const hardDisabledFailure = /Automatic trade allocation is hard-disabled/i;
  const ledgerBeforeStaleCall = await db.select({
    id: balanceLedger.id,
    currency: balanceLedger.currency,
    amountMinor: balanceLedger.amountMinor,
  })
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
    hardDisabledFailure,
    "A stale worker must be fenced before it can mutate financial state.",
  );
  await assert.rejects(
    createTrade(userId, {
      offerId,
      amountMinor: 25000,
      deliveryEventId: eventId,
      executionLeaseToken: crashedWorkerToken,
    }),
    hardDisabledFailure,
    "A worker token left behind by a killed process must be fenced after recovery.",
  );
  assert.deepEqual(
    await db.select({
      id: balanceLedger.id,
      currency: balanceLedger.currency,
      amountMinor: balanceLedger.amountMinor,
    }).from(balanceLedger).where(eq(balanceLedger.userId, userId)),
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

  const todayUtc = new Date().toISOString().slice(0, 10);
  const yesterdayUtc = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const secondClaim = await claimOpportunityExecutionAttempt(userId, secondOffer);
  assert.equal(secondClaim.claimed, true, "An opportunity under a second tier policy is still charged to the same customer-wide daily budget.");
  assert.ok(secondClaim.executionLeaseToken);
  // The unattempted third event has no lifetime attempts, so an older retry-day
  // marker can be used to prove daily-cap deferral does not rewrite that marker.
  await db.update(opportunityPopupEvents).set({ executionRetryDay: yesterdayUtc })
    .where(eq(opportunityPopupEvents.id, thirdEventId));
  const dailyLimitClaim = await claimOpportunityExecutionAttempt(userId, thirdOffer);
  assert.equal(dailyLimitClaim.claimed, false, "A fifth attempt across a distinct opportunity must be blocked by the four-attempt customer daily cap.");
  if (!dailyLimitClaim.claimed) {
    assert.equal(dailyLimitClaim.reason, "daily-attempt-limit");
    assert.equal((dailyLimitClaim as any).usedAttempts, 4);
    assert.equal((dailyLimitClaim as any).dailyAttemptLimit, 4);
  }
  const [deferredState] = await db.select({
    executionRetryDay: opportunityPopupEvents.executionRetryDay,
  }).from(opportunityPopupEvents).where(eq(opportunityPopupEvents.id, thirdEventId)).limit(1);
  assert.equal(String(deferredState.executionRetryDay), yesterdayUtc,
    "Daily-cap deferral must not overwrite the independent technical retry-window marker.");

  // UTC rollover resets only the daily counter; lifetime technical retries
  // and the retry-window marker remain independent.
  await db.update(opportunityPackagePolicies).set({ maxTradeAttemptsPerDay: 0 })
    .where(eq(opportunityPackagePolicies.packageName, packageName));
  await db.update(opportunityPopupEvents).set({
    executionStatus: "RETRYING", executionAttemptCount: 7, executionRetryDay: todayUtc,
    executionRetryAfter: new Date(Date.now() - 1000), executionDailyAttemptCount: 6,
    executionDailyAttemptDay: yesterdayUtc,
  }).where(eq(opportunityPopupEvents.id, thirdEventId));
  const rolloverClaim = await claimOpportunityExecutionAttempt(userId, thirdOffer);
  assert.equal(rolloverClaim.claimed, true, "The same-day retry window remains claimable after daily-counter rollover.");
  const [rolloverState] = await db.select({
    executionAttemptCount: opportunityPopupEvents.executionAttemptCount,
    executionDailyAttemptCount: opportunityPopupEvents.executionDailyAttemptCount,
    executionDailyAttemptDay: opportunityPopupEvents.executionDailyAttemptDay,
    executionRetryDay: opportunityPopupEvents.executionRetryDay,
  }).from(opportunityPopupEvents).where(eq(opportunityPopupEvents.id, thirdEventId)).limit(1);
  assert.equal(Number(rolloverState.executionAttemptCount), 8, "Lifetime retry count remains cumulative.");
  assert.equal(Number(rolloverState.executionDailyAttemptCount), 1, "Prior-day attempts are not charged to today's budget.");
  assert.equal(String(rolloverState.executionDailyAttemptDay), todayUtc);
  assert.equal(String(rolloverState.executionRetryDay), todayUtc, "The retry-window marker remains intact.");
  assert.equal(rolloverClaim.transientAttemptNumber, 1,
    "The per-opportunity transient retry counter resets independently from the lifetime diagnostic counter.");

  // Automatic financial execution is a production hard boundary. Every
  // createTrade attempt must reject before it can allocate, replay, or mutate
  // any financial row, even when its lease and quota checks have passed.
  const tradeRowsBeforeAllocation = await db.select({ id: tradePositions.id })
    .from(tradePositions).where(eq(tradePositions.userId, userId));
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
  assert.equal(allocationResults.length, 4, "The hard-disabled boundary must cover every automatic allocation attempt.");
  assert.ok(allocationResults.every((result) => result.status === "rejected"),
    "Every automatic allocation attempt must reject while financial execution is hard-disabled.");
  assert.ok(allocationResults.every((result) => result.status === "rejected" && hardDisabledFailure.test(String(result.reason?.message || result.reason))),
    "Automatic allocation attempts must reject with the hard-disabled error, not a downstream validation or quota error.");
  assert.deepEqual(
    await db.select({ id: balanceLedger.id, amountMinor: balanceLedger.amountMinor })
      .from(balanceLedger).where(eq(balanceLedger.userId, userId)),
    ledgerBeforeAllocation,
    "Hard-disabled automatic allocation must not create ledger postings.",
  );
  assert.deepEqual(
    await db.select({
      id: customerBalances.id,
      availableMinor: customerBalances.availableMinor,
      lockedMinor: customerBalances.lockedMinor,
      earnedMinor: customerBalances.earnedMinor,
    }).from(customerBalances).where(eq(customerBalances.userId, userId)),
    balancesBeforeAllocation,
    "Hard-disabled automatic allocation must not mutate wallet balances.",
  );
  assert.deepEqual(
    await db.select({ id: tradePositions.id }).from(tradePositions).where(eq(tradePositions.userId, userId)),
    tradeRowsBeforeAllocation,
    "Hard-disabled automatic allocation must not create trade rows.",
  );

  // The selected tier's previous-settlement switch applies across every tier
  // belonging to the customer. A confirmed trade is not complete until credit.
  await db.update(packages).set({ opportunitiesPerDay: 5 })
    .where(eq(packages.id, packageId));
  await db.update(customerPackageSubscriptions).set({
    termsSnapshotJson: JSON.stringify({ opportunitiesPerDay: 5, maxActiveInvestments: 5 }),
  }).where(eq(customerPackageSubscriptions.id, subscriptionId));
  await db.update(opportunityPackagePolicies).set({
    requirePreviousSettlement: true,
    maxConcurrentActiveTrades: 5,
    maxTradeAttemptsPerDay: 0,
  }).where(eq(opportunityPackagePolicies.packageName, packageName));

  await assert.rejects(
    createTrade(userId, {
      offerId: thirdOfferId,
      amountMinor: 25000,
      deliveryEventId: thirdEventId,
      executionLeaseToken: rolloverClaim.executionLeaseToken,
      packageSubscriptionId: subscriptionId,
      packageId,
    }),
    hardDisabledFailure,
    "The hard-disabled boundary must reject automatic allocation before settlement-gate or financial execution logic.",
  );
  await recordOpportunityExecutionFailure(userId, thirdEventId, {
    status: "RETRYING",
    retryAt: new Date(Date.now() + 30_000),
    errorCode: "PREVIOUS_SETTLEMENT_PENDING",
    attemptNumber: rolloverClaim.attemptNumber,
    releaseAttempt: true,
    executionLeaseToken: rolloverClaim.executionLeaseToken,
  });
  const deferredEvent = (await db.select({
    executionStatus: opportunityPopupEvents.executionStatus,
    executionAttemptCount: opportunityPopupEvents.executionAttemptCount,
    executionDailyAttemptCount: opportunityPopupEvents.executionDailyAttemptCount,
    eventStatus: opportunityPopupEvents.eventStatus,
  }).from(opportunityPopupEvents).where(eq(opportunityPopupEvents.id, thirdEventId)).limit(1))[0];
  assert.equal(deferredEvent?.executionStatus, "RETRYING", "A previous-settlement gate must defer, not permanently fail, the opportunity.");
  assert.equal(Number(deferredEvent?.executionAttemptCount), 7, "Deferral must release the per-opportunity technical attempt.");
  assert.equal(Number(deferredEvent?.executionDailyAttemptCount), 0, "Deferral must release the customer-wide daily attempt budget.");
  assert.equal(deferredEvent?.eventStatus, "DELIVERED", "A temporarily blocked opportunity must remain eligible for a later retry.");
  assert.equal(
    (await db.select({ id: tradePositions.id }).from(tradePositions).where(eq(tradePositions.userId, userId))).length,
    0,
    "Hard-disabled automatic execution must not create a trade row.",
  );
  assert.deepEqual(
    await db.select({ id: balanceLedger.id, amountMinor: balanceLedger.amountMinor }).from(balanceLedger).where(eq(balanceLedger.userId, userId)),
    ledgerBeforeAllocation,
    "Hard-disabled automatic execution must not create ledger entries.",
  );
  assert.deepEqual(
    await db.select({
      id: customerBalances.id,
      availableMinor: customerBalances.availableMinor,
      lockedMinor: customerBalances.lockedMinor,
      earnedMinor: customerBalances.earnedMinor,
    }).from(customerBalances).where(eq(customerBalances.userId, userId)),
    balancesBeforeAllocation,
    "Hard-disabled automatic execution must not move or reserve wallet funds.",
  );

  // Repeated worker crashes must still exhaust the per-opportunity retry
  // ceiling, even when no caught error reaches decideTradeExecutionRetry.
  await db.update(opportunityPopupEvents).set({
    executionStatus: "RUNNING",
    executionAttemptCount: 12,
    executionRetryDay: todayUtc,
    executionRetryAfter: new Date(Date.now() - 1000),
    executionDailyAttemptCount: MAX_TRANSIENT_ATTEMPTS_PER_OPPORTUNITY,
    executionDailyAttemptDay: todayUtc,
  }).where(eq(opportunityPopupEvents.id, thirdEventId));
  const exhaustedCrashClaim = await claimOpportunityExecutionAttempt(userId, thirdOffer);
  assert.equal(exhaustedCrashClaim.claimed, false,
    "A crashed opportunity must not be reclaimed after its per-opportunity transient ceiling.");
  assert.equal(exhaustedCrashClaim.reason, "attempts-exhausted");
  const [exhaustedEvent] = await db.select({
    executionStatus: opportunityPopupEvents.executionStatus,
    executionAttemptCount: opportunityPopupEvents.executionAttemptCount,
    executionDailyAttemptCount: opportunityPopupEvents.executionDailyAttemptCount,
  }).from(opportunityPopupEvents).where(eq(opportunityPopupEvents.id, thirdEventId)).limit(1);
  assert.equal(exhaustedEvent.executionStatus, "FAILED");
  assert.equal(Number(exhaustedEvent.executionAttemptCount), 12,
    "The lifetime diagnostic count must not be rewritten when the retry ceiling is reached.");
  assert.equal(Number(exhaustedEvent.executionDailyAttemptCount), MAX_TRANSIENT_ATTEMPTS_PER_OPPORTUNITY,
    "The exhausted per-opportunity attempt count must remain auditable.");

  console.log(JSON.stringify({
    ok: true,
    concurrentClaims: 2,
    winningClaims: competingClaims.filter((claim) => claim.claimed).length,
    leaseRecovered: recoveredClaim.claimed,
    crashedWorkerKilled: crashedWorkerExitResult.signal === "SIGKILL",
    crashedWorkerTokenFenced: true,
    staleWorkerFenced: true,
    automaticAllocationAttempts: allocationResults.length,
    automaticAllocationRejectedHardDisabled: allocationResults.every((result) => result.status === "rejected" && hardDisabledFailure.test(String(result.reason?.message || result.reason))),
    automaticTradeRows: (await db.select({ id: tradePositions.id }).from(tradePositions).where(eq(tradePositions.userId, userId))).length,
    ledgerAndWalletUnchangedOnHardDisable: true,
    dailyAttemptBudgetReleased: true,
  }));
} finally {
  try {
    if (eventId !== undefined) {
      await db.delete(opportunityPopupEvents).where(eq(opportunityPopupEvents.id, eventId));
    }
    if (secondEventId !== undefined) {
      await db.delete(opportunityPopupEvents).where(eq(opportunityPopupEvents.id, secondEventId));
    }
    if (thirdEventId !== undefined) {
      await db.delete(opportunityPopupEvents).where(eq(opportunityPopupEvents.id, thirdEventId));
    }
    if (userId !== undefined) {
      await db.delete(balanceLedger).where(eq(balanceLedger.userId, userId));
      await db.delete(customerBalances).where(eq(customerBalances.userId, userId));
      if (subscriptionId !== undefined) await db.delete(customerPackageSubscriptions).where(eq(customerPackageSubscriptions.id, subscriptionId));
      await db.delete(users).where(eq(users.id, userId));
    }
    await db.delete(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName, packageName));
    if (secondaryPolicyInserted) await db.delete(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName, secondaryPackageName));
    if (packageInserted && packageId !== undefined) await db.delete(packages).where(eq(packages.id, packageId));
    if (offerInserted && offerId !== undefined) await db.delete(opportunityOffers).where(eq(opportunityOffers.id, offerId));
    if (secondOfferInserted && secondOfferId !== undefined) await db.delete(opportunityOffers).where(eq(opportunityOffers.id, secondOfferId));
    if (thirdOfferId !== undefined) await db.delete(opportunityOffers).where(eq(opportunityOffers.id, thirdOfferId));
    if (currencyInserted) {
      await db.delete(currencyRegistry).where(eq(currencyRegistry.code, currency));
    }
  } finally {
    await closeDbPool();
  }
}
