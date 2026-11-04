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
  opportunityDeliveryIdempotency,
  opportunityGenerationAssignments,
  opportunityOffers,
  opportunityPackagePolicies,
  opportunityPopupEvents,
  packages,
  tradePositions,
  balanceLedger,
  users,
} from "../drizzle/schema";
import { parseTradeGlobalControlPolicy, TRADE_GLOBAL_CONTROL_SETTINGS_KEY, type TradeGlobalControlPolicy } from "../server/trading-global-policy";
import { ensurePopupDeliveries, updatePopupDeliveryStatus } from "../server/opportunityLifecycle";

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
const currency = "USD";
const packageName = `Popup QA ${token}`;
const now = new Date();
const quotaDay = now.toISOString().slice(0, 10);
let userId: number | undefined;
let packageId: number | undefined;
let subscriptionId: number | undefined;
let offerId: number | undefined;
let blockedOfferId: number | undefined;
let capacityOfferId: number | undefined;
const catalogueStateKey = "trade.companyCatalogue.adminState";
let originalCompanyCatalogueStateRow: { settingValue: string; updatedBy: number | null; updatedAt: Date } | null = null;
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

async function restoreOriginalCompanyCatalogueState() {
  if (originalCompanyCatalogueStateRow) {
    await db.update(appSettings).set(originalCompanyCatalogueStateRow)
      .where(eq(appSettings.settingKey, catalogueStateKey));
  } else {
    await db.delete(appSettings).where(eq(appSettings.settingKey, catalogueStateKey));
  }
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
    companyRotationEnabled: true,
    randomizedTimingEnabled: true,
    burstDeliveryEnabled: true,
    policyVersion: parsedGlobalPolicy.policyVersion + 1,
    updatedBy: null,
    updatedAt: new Date().toISOString(),
  };
  await persistGlobalPolicy(currentTestGlobalPolicy);

  const [catalogueStateRow] = await db.select({
    settingValue: appSettings.settingValue,
    updatedBy: appSettings.updatedBy,
    updatedAt: appSettings.updatedAt,
  }).from(appSettings).where(eq(appSettings.settingKey, catalogueStateKey)).limit(1);
  originalCompanyCatalogueStateRow = catalogueStateRow ?? null;
  const testCatalogueState = JSON.stringify({
    verifiedIds: ["logo-brand-0001"],
    archivedIds: [],
    disabledIds: [],
  });
  await db.insert(appSettings).values({
    settingKey: catalogueStateKey,
    settingValue: testCatalogueState,
    updatedBy: null,
  }).onDuplicateKeyUpdate({
    set: { settingValue: testCatalogueState, updatedBy: null, updatedAt: new Date() },
  });

  const [userResult] = await db.insert(users).values({
    openId: `popup-delivery-${token}`,
    name: "Popup Delivery Integration Customer",
    email: userEmail,
    role: "user",
    packageName,
  });
  userId = Number(userResult.insertId);

  const usdCurrency = await db.select({
    code: currencyRegistry.code,
    enabled: currencyRegistry.enabled,
  }).from(currencyRegistry).where(eq(currencyRegistry.code, currency)).limit(1);
  assert.equal(usdCurrency[0]?.enabled, true,
    "The existing USD registry entry must be available for catalogue-native generation.");

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
    companyRotationEnabled: false,
    maxPopupsPerDay: 10,
    maxVisibleOffers: 5,
    minimumTradeUnits: 100,
    maximumTradeUnits: 1000,
    burstEnabled: false,
    maxBurstSize: 3,
    enabled: false,
    automaticDelivery: false,
    // Deliberately simulate a stale/unsafe legacy value after migration; the worker hard gate must still prevent execution.
    automaticTradingEnabled: true,
    dailyPopupTarget: 0,
    schedulingPeriod: "rolling_24h",
    minIntervalSeconds: 45,
    maxIntervalSeconds: 90,
    randomizationEnabled: false,
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
    automaticGenerationEnabled: true,
    generationBatchId: `popup-delivery-${token}`,
  });
  const legacyPolicyMirrors = (await db.select({
    enabled: opportunityPackagePolicies.enabled,
    automaticDelivery: opportunityPackagePolicies.automaticDelivery,
    companyRotationEnabled: opportunityPackagePolicies.companyRotationEnabled,
    burstEnabled: opportunityPackagePolicies.burstEnabled,
    randomizationEnabled: opportunityPackagePolicies.randomizationEnabled,
  }).from(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName, packageName)))[0];
  assert.deepEqual(legacyPolicyMirrors, {
    enabled: false,
    automaticDelivery: false,
    companyRotationEnabled: false,
    burstEnabled: false,
    randomizationEnabled: false,
  }, "Legacy package-level switches are OFF; global informational controls must own delivery and rotation.");

  const generatedOfferId = Number(firstCycle.generatedOpportunityId);
  assert.ok(Number.isSafeInteger(generatedOfferId) && generatedOfferId > 0,
    "The worker must generate an opportunity directly from the approved brand catalogue without a template.");
  offerId = generatedOfferId;

  const generationDiagnostics = {
    delivery: firstCycle.delivery,
    offers: firstCycle.offers,
    persistedOffer: await db.select().from(opportunityOffers).where(eq(opportunityOffers.id, generatedOfferId)),
    persistedAssignment: await db.select().from(opportunityGenerationAssignments).where(eq(opportunityGenerationAssignments.offerId, generatedOfferId)),
    persistedPopup: await db.select().from(opportunityPopupEvents).where(eq(opportunityPopupEvents.offerId, generatedOfferId)),
  };
  console.log("CATALOGUE_GENERATION_DIAGNOSTICS " + JSON.stringify(generationDiagnostics));
  assert.equal(firstCycle.delivery.enabled, true,
    "An active eligible tier with a valid enabled delivery policy must expose delivery as enabled.");
  assert.equal(firstCycle.offers.length, 1,
    "The worker cycle must create one customer popup from the catalogue-native generated opportunity.");
  assert.equal(firstCycle.offers[0]?.offerId, offerId);
  assert.equal(firstCycle.offers[0]?.popupEligible, true);
  assert.equal(firstCycle.offers[0]?.companyDisplayName?.length > 0, true,
    "The generated opportunity must carry the existing catalogue company name.");
  const generatedAssignments = await db.select().from(opportunityGenerationAssignments)
    .where(eq(opportunityGenerationAssignments.offerId, offerId));
  assert.equal(generatedAssignments.length, 1,
    "A catalogue-native opportunity must persist one customer/package assignment.");
  assert.equal(generatedAssignments[0]?.templateId, null,
    "No manually authored opportunity template is required.");
  assert.equal(generatedAssignments[0]?.templateVersion, null);
  assert.equal(generatedAssignments[0]?.companyReferenceId, "logo-brand-0001");
  const generatedSnapshot = JSON.parse(String(generatedAssignments[0]?.packageSnapshotJson || "{}"));
  assert.ok(Number(generatedSnapshot.configuredProfitRateBps) >= 200 && Number(generatedSnapshot.configuredProfitRateBps) <= 300,
    "The configured return must stay inside this customer's package-specific minimum/maximum.");
  assert.ok(Number(generatedSnapshot.configuredDurationSeconds) >= 300 && Number(generatedSnapshot.configuredDurationSeconds) <= 600,
    "The generated duration must stay inside this customer's package-specific range.");
  assert.equal(generatedSnapshot.symbol, "BRAND",
    "Brand-only companies must not be represented as real ticker symbols.");
  assert.equal(generatedSnapshot.companyRotationEnabled, true,
    "The global company-rotation master must apply even while the legacy per-package copy is OFF.");
  assert.equal(firstCycle.autoTrades.length, 0,
    "The global server-side execution lock must prevent trades even if a stale package policy says automaticTradingEnabled=true.");

  const popupRows = await db.select({
    id: opportunityPopupEvents.id,
    eventStatus: opportunityPopupEvents.eventStatus,
    deliveryStatus: opportunityPopupEvents.deliveryStatus,
    packageId: opportunityPopupEvents.packageId,
    offerId: opportunityPopupEvents.offerId,
    companyDisplayName: opportunityPopupEvents.companyDisplayName,
  }).from(opportunityPopupEvents).where(and(
    eq(opportunityPopupEvents.userId, userId),
    eq(opportunityPopupEvents.offerId, offerId),
  ));
  assert.equal(popupRows.length, 1, "The durable popup lifecycle row must be persisted exactly once.");
  assert.equal(Number(popupRows[0]?.packageId), packageId,
    "The immutable package primary key, not its mutable display name, is persisted on the event.");
  const fenceRows = await db.select({ packageId: opportunityDeliveryIdempotency.packageId, popupEventId: opportunityDeliveryIdempotency.popupEventId })
    .from(opportunityDeliveryIdempotency).where(and(
      eq(opportunityDeliveryIdempotency.userId, userId), eq(opportunityDeliveryIdempotency.offerId, offerId),
    ));
  assert.equal(fenceRows.length, 1, "The durable user-offer idempotency fence must exist exactly once.");
  assert.equal(Number(fenceRows[0]?.packageId), packageId);
  assert.equal(Number(fenceRows[0]?.popupEventId), Number(popupRows[0]?.id));
  assert.equal(popupRows[0]?.eventStatus, "DELIVERED");
  assert.equal(typeof popupRows[0]?.companyDisplayName, "string");
  assert.ok(String(popupRows[0]?.companyDisplayName || "").length > 0,
    "The persisted customer popup must include the selected catalogue company name.");
  assert.equal(popupRows[0]?.deliveryStatus, "queued",
    "Worker admission queues the durable informational delivery; the customer poll owns the dispatch claim.");
  assert.equal(Number((await db.select({ deliveryAttemptCount: opportunityPopupEvents.deliveryAttemptCount }).from(opportunityPopupEvents).where(eq(opportunityPopupEvents.id, popupRows[0]!.id)))[0]?.deliveryAttemptCount), 0,
    "Queue admission is not an actual dispatch attempt.");

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
  assert.equal(deliveryRows[0]?.status, "pending");

  // The first popup is still queued, so a second admission at a package
  // pending limit of one must be rejected with a durable diagnostic result.
  capacityOfferId = 2_000_000_000 + Number.parseInt(token.slice(0, 5), 16) % 100_000_000;
  await db.insert(opportunityGenerationAssignments).values({
    generationKey: `capacity-skip:${token}`,
    batchId: `capacity-skip-${token}`,
    userId,
    offerId: capacityOfferId,
    templateId: null,
    templateVersion: null,
    packageId,
    packageSubscriptionId: subscriptionId,
    packageName,
    packagePolicyVersion: 1,
    companyReferenceId: "logo-brand-0001",
    configuredProfitRateBps: 250,
    configuredDurationSeconds: 600,
    packageSnapshotJson: JSON.stringify(generatedSnapshot),
    status: "generated",
    failureReason: null,
    generatedAt: new Date(),
    assignedAt: null,
    deliveredAt: null,
    expiresAt: new Date(Date.now() + 60 * 60_000),
  });
  const capacitySkip = await ensurePopupDeliveries([{
    userId,
    offerId: capacityOfferId,
    quotaDay,
    packageId,
    packageName,
    maxPendingDeliveries: 1,
    symbol: "CAPACITY",
    currency,
    minimumMinor: 10_000,
    expectedRewardBps: 250,
    configuredProfitRateBps: 250,
    configuredDurationSeconds: 600,
    configuredPopupDisplaySeconds: 120,
    packagePolicyVersionSnapshot: 1,
    policyVersion: 1,
    durationSeconds: 600,
    badgeLabel: null,
    packageBadgeLabel: null,
    badgeStyle: "neutral",
    companyRotationEnabled: false,
    companyRotationCountryNames: "",
    companyRotationRepeatPolicy: "avoid_until_exhausted",
    balanceAvailableMinor: 100_000,
    balanceStatus: "sufficient",
  }]);
  const capacitySkipKey = `${userId}:${capacityOfferId}`;
  assert.equal(capacitySkip.has(capacitySkipKey), false,
    "Pending capacity must not create a second popup.");
  assert.deepEqual(capacitySkip.skipped, [{ key: capacitySkipKey, reason: "PENDING_DELIVERY_LIMIT" }],
    "Pending-capacity rejection must carry a structured reason.");
  const capacityAssignment = await db.select({ failureReason: opportunityGenerationAssignments.failureReason })
    .from(opportunityGenerationAssignments).where(eq(opportunityGenerationAssignments.offerId, capacityOfferId));
  assert.equal(capacityAssignment[0]?.failureReason, "DELIVERY_SKIPPED:PENDING_DELIVERY_LIMIT",
    "The generated assignment must retain the pending-capacity skip reason for operator diagnostics.");

  const customerRead = await listCustomerOpportunities(userId);
  assert.equal(customerRead.delivery.enabled, true);
  assert.equal(customerRead.offers.length, 1,
    "The normal customer read path must return the worker-created popup.");
  assert.equal(customerRead.offers[0]?.offerId, offerId);
  assert.equal(customerRead.offers[0]?.popupEligible, true);
  assert.equal(customerRead.offers[0]?.deliveryStatus, "in_progress");
  assert.equal(customerRead.offers[0]?.deliveryAttemptCount, 1,
    "The first actual customer dispatch claim is attempt one.");
  assert.ok(customerRead.offers[0]?.deliveryLeaseToken,
    "A customer poll receives the dispatch fencing token used for acknowledgements.");

  const activeLeaseToken = customerRead.offers[0]?.deliveryLeaseToken;
  assert.ok(activeLeaseToken, "The claimed delivery must retain a fencing token until acknowledgement.");
  await updatePopupDeliveryStatus(userId, Number(popupRows[0]?.id), "rendered", undefined, activeLeaseToken);
  const acknowledged = await db.select({ deliveryStatus: opportunityPopupEvents.deliveryStatus, eventStatus: opportunityPopupEvents.eventStatus })
    .from(opportunityPopupEvents).where(eq(opportunityPopupEvents.id, Number(popupRows[0]?.id)));
  assert.equal(acknowledged[0]?.deliveryStatus, "rendered");
  assert.equal(acknowledged[0]?.eventStatus, "DELIVERED",
    "A rendered acknowledgement must not determine offer/trade result state.");
  await updatePopupDeliveryStatus(userId, Number(popupRows[0]?.id), "failed", "STALE_ACK", "stale-lease-token");
  assert.equal((await db.select({ deliveryStatus: opportunityPopupEvents.deliveryStatus }).from(opportunityPopupEvents)
    .where(eq(opportunityPopupEvents.id, Number(popupRows[0]?.id))))[0]?.deliveryStatus, "rendered",
    "A stale acknowledgement must not overwrite current informational delivery state.");
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
    assignedUserId: userId,
    assignedPackageId: packageId,
    assignedPackageSubscriptionId: subscriptionId,
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
      await restoreOriginalCompanyCatalogueState();
    } finally {
      try {
        for (const fixtureOfferId of [offerId, blockedOfferId, capacityOfferId]) {
          if (userId !== undefined && fixtureOfferId !== undefined) {
            await db.delete(opportunityGenerationAssignments).where(eq(opportunityGenerationAssignments.offerId, fixtureOfferId));
            await db.delete(opportunityDeliveryIdempotency).where(and(
              eq(opportunityDeliveryIdempotency.userId, userId),
              eq(opportunityDeliveryIdempotency.offerId, fixtureOfferId),
            ));
            await db.delete(opportunityPopupEvents).where(and(
              eq(opportunityPopupEvents.userId, userId),
              eq(opportunityPopupEvents.offerId, fixtureOfferId),
            ));
            await db.delete(opportunityDeliveryEvents).where(and(
              eq(opportunityDeliveryEvents.userId, userId),
              eq(opportunityDeliveryEvents.offerId, fixtureOfferId),
            ));
          }
          if (fixtureOfferId !== undefined) {
            await db.delete(opportunityOffers).where(eq(opportunityOffers.id, fixtureOfferId));
          }
        }
        if (userId !== undefined) {
          await db.delete(appSettings).where(eq(appSettings.settingKey, `trading.opportunityGenerator.${userId}`));
          if (packageId !== undefined) {
            await db.delete(appSettings).where(eq(appSettings.settingKey, `trading.companyRotation.${userId}.${packageId}`));
          }
          await db.delete(customerPackageSubscriptions).where(eq(customerPackageSubscriptions.userId, userId));
          await db.delete(customerBalances).where(eq(customerBalances.userId, userId));
          await db.delete(users).where(eq(users.id, userId));
        }
        await db.delete(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName, packageName));
        if (packageId !== undefined) {
          await db.delete(packages).where(eq(packages.id, packageId));
        }
      } finally {
        await closeDbPool();
      }
    }
  }
}
