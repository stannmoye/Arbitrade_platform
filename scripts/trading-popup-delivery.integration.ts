import assert from "node:assert/strict";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { closeDbPool, ensureAutomaticTradingTierEntitlements, getDb, getTradeGlobalControls, listCustomerOpportunities, runTradingTierQualificationWorkerCycle } from "../server/db";
import {
  appSettings,
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
import { parseTradeGlobalControlPolicy, TRADE_GLOBAL_CONTROL_SETTINGS_KEY, type TradeGlobalControlPolicy } from "../server/trading-global-policy";

const db = await getDb();
if (!db) {
  throw new Error("Trading popup delivery integration requires DATABASE_URL to point to a disposable migrated database.");
}

const migratedExecutionPolicies = await db.select({
  packageName: opportunityPackagePolicies.packageName,
  automaticTradingEnabled: opportunityPackagePolicies.automaticTradingEnabled,
}).from(opportunityPackagePolicies);
assert.ok(migratedExecutionPolicies.length > 0,
  "The guarded migration chain must create the baseline package-policy rows.");
assert.ok(migratedExecutionPolicies.every(row => row.automaticTradingEnabled === false),
  "Migration 0098 must explicitly disable automatic financial execution on every existing package policy.");

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
let blockedOfferId: number | undefined;
let currencyInserted = false;
let originalGlobalControlRow: { settingValue: string; updatedBy: number | null; updatedAt: Date } | null = null;
let currentTestGlobalPolicy: TradeGlobalControlPolicy | null = null;

async function persistGlobalPolicy(policy: TradeGlobalControlPolicy) {
  const settingValue = JSON.stringify(policy);
  await db.insert(appSettings).values({
    settingKey: TRADE_GLOBAL_CONTROL_SETTINGS_KEY,
    settingValue,
    updatedBy: policy.updatedBy,
  }).onDuplicateKeyUpdate({
    set: { settingValue, updatedBy: policy.updatedBy, updatedAt: new Date() },
  });
}

async function setGlobalPolicy(overrides: Partial<TradeGlobalControlPolicy>) {
  if (!currentTestGlobalPolicy) throw new Error("Global-control integration fixture is not initialized.");
  currentTestGlobalPolicy = {
    ...currentTestGlobalPolicy,
    ...overrides,
    policyVersion: currentTestGlobalPolicy.policyVersion + 1,
    updatedBy: null,
    updatedAt: new Date().toISOString(),
  };
  await persistGlobalPolicy(currentTestGlobalPolicy);
}

async function restoreOriginalGlobalPolicy() {
  if (!originalGlobalControlRow) return;
  const existing = await db.select({ id: appSettings.id }).from(appSettings)
    .where(eq(appSettings.settingKey, TRADE_GLOBAL_CONTROL_SETTINGS_KEY)).limit(1);
  if (existing.length) {
    await db.update(appSettings).set(originalGlobalControlRow)
      .where(eq(appSettings.settingKey, TRADE_GLOBAL_CONTROL_SETTINGS_KEY));
  } else {
    await db.insert(appSettings).values({
      settingKey: TRADE_GLOBAL_CONTROL_SETTINGS_KEY,
      ...originalGlobalControlRow,
    });
  }
}

try {
  const [globalControlRow] = await db.select({
    settingValue: appSettings.settingValue,
    updatedBy: appSettings.updatedBy,
    updatedAt: appSettings.updatedAt,
  }).from(appSettings).where(eq(appSettings.settingKey, TRADE_GLOBAL_CONTROL_SETTINGS_KEY)).limit(1);
  if (!globalControlRow) throw new Error("Migration 0100 must install canonical global Trade controls before the popup integration.");
  originalGlobalControlRow = globalControlRow;
  const parsedGlobalPolicy = parseTradeGlobalControlPolicy(globalControlRow.settingValue);
  if (!parsedGlobalPolicy) throw new Error("The disposable database must begin with a valid global Trade policy.");
  currentTestGlobalPolicy = {
    ...parsedGlobalPolicy,
    tierPolicyMasterEnabled: true,
    informationalPopupDeliveryEnabled: true,
    policyVersion: parsedGlobalPolicy.policyVersion + 1,
    updatedBy: null,
    updatedAt: new Date().toISOString(),
  };
  await persistGlobalPolicy(currentTestGlobalPolicy);

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
    // Deliberately simulate a stale/unsafe legacy value after migration; the worker hard gate must still prevent execution.
    automaticTradingEnabled: true,
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
  });

  assert.equal(firstCycle.delivery.enabled, true,
    "An active eligible tier with a valid enabled delivery policy must expose delivery as enabled.");
  assert.equal(firstCycle.offers.length, 1,
    "The worker cycle must create one customer popup from the one open reviewed opportunity.");
  assert.equal(firstCycle.offers[0]?.offerId, offerId);
  assert.equal(firstCycle.offers[0]?.popupEligible, true);
  assert.equal(firstCycle.autoTrades.length, 0,
    "The global server-side execution lock must prevent trades even if a stale package policy says automaticTradingEnabled=true.");

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

  // Remove unrelated delivery cooldown as a competing gate so the next open
  // opportunity is eligible unless the global policy under test blocks it.
  await db.update(opportunityPackagePolicies).set({
    minIntervalSeconds: 0,
    maxIntervalSeconds: 0,
    postCompletionIntervalSeconds: 0,
  }).where(eq(opportunityPackagePolicies.packageName, packageName));
  const [blockedOfferResult] = await db.insert(opportunityOffers).values({
    symbol: `BLOCKED-${token.slice(0, 5)}`,
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
  blockedOfferId = Number(blockedOfferResult.insertId);

  const assertNoNewPopup = async (state: string) => {
    const cycle = await listCustomerOpportunities(userId!, { workerCycle: true, consumeDelivery: false, allowAutomaticExecution: false });
    assert.equal(cycle.delivery.enabled, false, `${state} must disable new customer popup delivery.`);
    assert.equal(cycle.delivery.globalPolicyPaused, true, `${state} must report the global gate as paused.`);
    assert.equal(cycle.offers.some(offer => Number(offer.offerId) === blockedOfferId), false,
      `${state} must not expose the newly published opportunity as a customer popup.`);
    assert.equal((await db.select({ id: opportunityPopupEvents.id }).from(opportunityPopupEvents).where(and(
      eq(opportunityPopupEvents.userId, userId!),
      eq(opportunityPopupEvents.offerId, blockedOfferId!),
    ))).length, 0, `${state} must not persist a popup lifecycle event.`);
    assert.equal((await db.select({ id: opportunityDeliveryEvents.id }).from(opportunityDeliveryEvents).where(and(
      eq(opportunityDeliveryEvents.userId, userId!),
      eq(opportunityDeliveryEvents.offerId, blockedOfferId!),
    ))).length, 0, `${state} must not consume delivery quota.`);
  };
  const assertQualificationPaused = async (state: string) => {
    const worker = await runTradingTierQualificationWorkerCycle();
    assert.equal(worker.pausedByGlobalPolicy, true, `${state} must pause the qualification worker.`);
    assert.equal(worker.claimed, 0, `${state} must not claim qualification jobs.`);
    assert.equal(await ensureAutomaticTradingTierEntitlements(userId!), false,
      `${state} must not create or reconcile an entitlement.`);
  };

  await setGlobalPolicy({ informationalPopupDeliveryEnabled: false, tierPolicyMasterEnabled: true });
  const deliveryOffPolicy = await getTradeGlobalControls();
  assert.equal(deliveryOffPolicy.available, true);
  assert.equal(deliveryOffPolicy.tierPolicyMasterEnabled, true);
  assert.equal(deliveryOffPolicy.informationalPopupDeliveryEnabled, false);
  await assertNoNewPopup("global pop-up delivery OFF");

  await setGlobalPolicy({ informationalPopupDeliveryEnabled: true, tierPolicyMasterEnabled: false });
  const tierOffPolicy = await getTradeGlobalControls();
  assert.equal(tierOffPolicy.available, true);
  assert.equal(tierOffPolicy.tierPolicyMasterEnabled, false);
  await assertQualificationPaused("global tier policy OFF");
  await assertNoNewPopup("global tier policy OFF");

  await db.update(appSettings).set({ settingValue: "not-json", updatedAt: new Date() })
    .where(eq(appSettings.settingKey, TRADE_GLOBAL_CONTROL_SETTINGS_KEY));
  const malformedPolicy = await getTradeGlobalControls();
  assert.equal(malformedPolicy.available, false);
  assert.equal(malformedPolicy.tierPolicyMasterEnabled, false);
  assert.equal(malformedPolicy.informationalPopupDeliveryEnabled, false);
  await assertQualificationPaused("malformed global policy");
  await assertNoNewPopup("malformed global policy");

  await db.delete(appSettings).where(eq(appSettings.settingKey, TRADE_GLOBAL_CONTROL_SETTINGS_KEY));
  const missingPolicy = await getTradeGlobalControls();
  assert.equal(missingPolicy.available, false);
  assert.equal(missingPolicy.tierPolicyMasterEnabled, false);
  assert.equal(missingPolicy.informationalPopupDeliveryEnabled, false);
  await assertQualificationPaused("missing global policy");
  await assertNoNewPopup("missing global policy");

  console.log(JSON.stringify({
    ok: true,
    journey: "qualified customer popup delivery",
    persistedPopupEvents: popupRows.length,
    persistedQuotaEvents: deliveryRows.length,
    customerReadReturnsPopup: true,
    repeatedWorkerCycleIsIdempotent: true,
    globalOffAndFailClosedStates: ["popup-delivery-off", "tier-policy-off", "malformed-policy", "missing-policy"],
    automaticFinancialExecution: "disabled",
    walletAndLedgerMutations: 0,
    tradeRowsCreated: 0,
  }));
} finally {
  try {
    await restoreOriginalGlobalPolicy();
  } finally {
    try {
      for (const fixtureOfferId of [offerId, blockedOfferId]) {
        if (userId !== undefined && fixtureOfferId !== undefined) {
          await db.delete(opportunityPopupEvents).where(and(
            eq(opportunityPopupEvents.userId, userId),
            eq(opportunityPopupEvents.offerId, fixtureOfferId),
          ));
          await db.delete(opportunityDeliveryEvents).where(and(
            eq(opportunityDeliveryEvents.userId, userId),
            eq(opportunityDeliveryEvents.offerId, fixtureOfferId),
          ));
        }
        if (fixtureOfferId !== undefined) await db.delete(opportunityOffers).where(eq(opportunityOffers.id, fixtureOfferId));
      }
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
}
