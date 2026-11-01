import assert from "node:assert/strict";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { closeDbPool, getDb, listCustomerOpportunities } from "../server/db";
import {
  customerBalances,
  customerPackageSubscriptions,
  currencyRegistry,
  opportunityDeliveryEvents,
  opportunityOffers,
  opportunityPackagePolicies,
  opportunityPopupEvents,
  packages,
  tradePositions,
  balanceLedger,
  users,
} from "../drizzle/schema";

const db = await getDb();
if (!db) {
  throw new Error("Trading popup delivery integration requires DATABASE_URL to point to a disposable migrated database.");
}

const token = crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
const userEmail = `popup-delivery-${token.toLowerCase()}@example.invalid`;
const currency = `P${token.slice(0, 7)}`;
const packageName = `Popup QA ${token}`;
const now = new Date();
const quotaDay = now.toISOString().slice(0, 10);
let userId: number | undefined;
let packageId: number | undefined;
let subscriptionId: number | undefined;
let offerId: number | undefined;
let currencyInserted = false;

try {
  const [userResult] = await db.insert(users).values({
    openId: `popup-delivery-${token}`,
    name: "Popup Delivery Integration Customer",
    email: userEmail,
    role: "user",
    packageName,
  });
  userId = Number(userResult.insertId);

  await db.insert(currencyRegistry).values({
    code: currency,
    name: "Popup Delivery Integration Currency",
    symbol: currency,
    scale: 2,
    assetType: "fiat",
    usdRate: "1",
    rateProvider: "integration-test",
    enabled: true,
  });
  currencyInserted = true;

  const [packageResult] = await db.insert(packages).values({
    name: packageName,
    minimumQualifyingBalanceUsdMinor: 10000,
    durationMonths: 1,
    opportunitiesPerDay: 6,
    termsVersion: 1,
    maxPopupsPerDay: 0,
    maxActiveInvestments: 0,
    enabled: true,
  });
  packageId = Number(packageResult.insertId);

  await db.insert(opportunityPackagePolicies).values({
    packageName,
    minimumPayoutRateBps: 200,
    maximumPayoutRateBps: 300,
    minimumTradeDurationSeconds: 300,
    maximumTradeDurationSeconds: 600,
    companyRotationEnabled: true,
    maxPopupsPerDay: 10,
    maxVisibleOffers: 5,
    minimumTradeUnits: 100,
    maximumTradeUnits: 1000,
    burstEnabled: true,
    maxBurstSize: 3,
    enabled: true,
    automaticDelivery: true,
    automaticTradingEnabled: false,
    dailyPopupTarget: 0,
    schedulingPeriod: "rolling_24h",
    minIntervalSeconds: 45,
    maxIntervalSeconds: 90,
    randomizationEnabled: true,
    popupDisplayTargetSeconds: 120,
    completionDisplaySeconds: 8,
    postCompletionIntervalSeconds: 30,
    maxPendingDeliveries: 3,
    maxDeliveryAttempts: 3,
    requirePreviousSettlement: true,
    minSettlementDelaySeconds: 900,
    maxSettlementDelaySeconds: 900,
  });

  const [subscriptionResult] = await db.insert(customerPackageSubscriptions).values({
    userId,
    packageId,
    startsAt: new Date(Date.now() - 60_000),
    expiresAt: new Date(Date.now() + 86_400_000),
    status: "active",
    activationKey: `auto-tier:popup-delivery-${token}`,
    termsSnapshotJson: JSON.stringify({ opportunitiesPerDay: 6, maxPopupsPerDay: 0 }),
    qualifyingBalanceUsdMinor: 10000,
    packageTermsVersion: 1,
  });
  subscriptionId = Number(subscriptionResult.insertId);

  await db.insert(customerBalances).values({
    userId,
    currency,
    availableMinor: 100_000,
    lockedMinor: 0,
    promotionalMinor: 0,
    earnedMinor: 0,
  });

  const [offerResult] = await db.insert(opportunityOffers).values({
    symbol: `POPUP-${token.slice(0, 5)}`,
    venueFrom: "reviewed-integration-source",
    venueTo: "reviewed-integration-destination",
    currency,
    minimumMinor: 10_000,
    expectedRewardBps: 250,
    durationSeconds: 600,
    opensAt: new Date(Date.now() - 1_000),
    closesAt: new Date(Date.now() + 10 * 60_000),
    rewardAt: new Date(Date.now() + 10 * 60_000),
    status: "open",
  });
  offerId = Number(offerResult.insertId);

  const balanceBefore = await db.select({
    availableMinor: customerBalances.availableMinor,
    lockedMinor: customerBalances.lockedMinor,
  }).from(customerBalances).where(eq(customerBalances.userId, userId));
  const ledgerBefore = await db.select({ id: balanceLedger.id })
    .from(balanceLedger).where(eq(balanceLedger.userId, userId));

  // This invokes the actual customer-delivery creation path, but explicitly
  // prevents the optional financial-execution pass from running.
  const firstCycle = await listCustomerOpportunities(userId, {
    workerCycle: true,
    consumeDelivery: false,
    allowAutomaticExecution: false,
  });

  assert.equal(firstCycle.delivery.enabled, true,
    "An active eligible tier with a valid enabled delivery policy must expose delivery as enabled.");
  assert.equal(firstCycle.offers.length, 1,
    "The worker cycle must create one customer popup from the one open reviewed opportunity.");
  assert.equal(firstCycle.offers[0]?.offerId, offerId);
  assert.equal(firstCycle.offers[0]?.popupEligible, true);
  assert.equal(firstCycle.autoTrades.length, 0,
    "Popup delivery must not execute or allocate a financial trade.");

  const popupRows = await db.select({
    id: opportunityPopupEvents.id,
    eventStatus: opportunityPopupEvents.eventStatus,
    deliveryStatus: opportunityPopupEvents.deliveryStatus,
    offerId: opportunityPopupEvents.offerId,
  }).from(opportunityPopupEvents).where(and(
    eq(opportunityPopupEvents.userId, userId),
    eq(opportunityPopupEvents.offerId, offerId),
  ));
  assert.equal(popupRows.length, 1, "The durable popup lifecycle row must be persisted exactly once.");
  assert.equal(popupRows[0]?.eventStatus, "DELIVERED");
  assert.equal(popupRows[0]?.deliveryStatus, "delivered");

  const deliveryRows = await db.select({
    offerId: opportunityDeliveryEvents.offerId,
    quotaDay: opportunityDeliveryEvents.quotaDay,
    status: opportunityDeliveryEvents.status,
  }).from(opportunityDeliveryEvents).where(and(
    eq(opportunityDeliveryEvents.userId, userId),
    eq(opportunityDeliveryEvents.offerId, offerId),
  ));
  assert.equal(deliveryRows.length, 1, "The delivery quota ledger must be persisted exactly once.");
  assert.equal(deliveryRows[0]?.quotaDay, quotaDay);
  assert.equal(deliveryRows[0]?.status, "delivered");

  const customerRead = await listCustomerOpportunities(userId);
  assert.equal(customerRead.delivery.enabled, true);
  assert.equal(customerRead.offers.length, 1,
    "The normal customer read path must return the worker-created popup.");
  assert.equal(customerRead.offers[0]?.offerId, offerId);
  assert.equal(customerRead.offers[0]?.popupEligible, true);

  const secondCycle = await listCustomerOpportunities(userId, {
    workerCycle: true,
    consumeDelivery: false,
    allowAutomaticExecution: false,
  });
  assert.equal(secondCycle.offers.length, 1,
    "A repeated worker cycle must retain, not duplicate, the already delivered popup.");
  assert.equal((await db.select({ id: opportunityPopupEvents.id })
    .from(opportunityPopupEvents).where(and(
      eq(opportunityPopupEvents.userId, userId),
      eq(opportunityPopupEvents.offerId, offerId),
    ))).length, 1);
  assert.equal((await db.select({ id: opportunityDeliveryEvents.id })
    .from(opportunityDeliveryEvents).where(and(
      eq(opportunityDeliveryEvents.userId, userId),
      eq(opportunityDeliveryEvents.offerId, offerId),
    ))).length, 1);

  assert.deepEqual(
    await db.select({
      availableMinor: customerBalances.availableMinor,
      lockedMinor: customerBalances.lockedMinor,
    }).from(customerBalances).where(eq(customerBalances.userId, userId)),
    balanceBefore,
    "Informational popup delivery must not change or reserve wallet balances.",
  );
  assert.deepEqual(
    await db.select({ id: balanceLedger.id }).from(balanceLedger).where(eq(balanceLedger.userId, userId)),
    ledgerBefore,
    "Informational popup delivery must not create wallet ledger entries.",
  );
  assert.equal((await db.select({ id: tradePositions.id }).from(tradePositions)
    .where(eq(tradePositions.userId, userId))).length, 0,
    "Informational popup delivery must not create financial trade records.");

  console.log(JSON.stringify({
    ok: true,
    journey: "qualified customer popup delivery",
    persistedPopupEvents: popupRows.length,
    persistedQuotaEvents: deliveryRows.length,
    customerReadReturnsPopup: true,
    repeatedWorkerCycleIsIdempotent: true,
    automaticFinancialExecution: "disabled",
    walletAndLedgerMutations: 0,
    tradeRowsCreated: 0,
  }));
} finally {
  try {
    if (userId !== undefined && offerId !== undefined) {
      await db.delete(opportunityPopupEvents).where(and(
        eq(opportunityPopupEvents.userId, userId),
        eq(opportunityPopupEvents.offerId, offerId),
      ));
      await db.delete(opportunityDeliveryEvents).where(and(
        eq(opportunityDeliveryEvents.userId, userId),
        eq(opportunityDeliveryEvents.offerId, offerId),
      ));
    }
    if (offerId !== undefined) await db.delete(opportunityOffers).where(eq(opportunityOffers.id, offerId));
    if (userId !== undefined) {
      await db.delete(customerPackageSubscriptions).where(eq(customerPackageSubscriptions.userId, userId));
      await db.delete(customerBalances).where(eq(customerBalances.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
    await db.delete(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName, packageName));
    if (packageId !== undefined) await db.delete(packages).where(eq(packages.id, packageId));
    if (currencyInserted) await db.delete(currencyRegistry).where(eq(currencyRegistry.code, currency));
  } finally {
    await closeDbPool();
  }
}
