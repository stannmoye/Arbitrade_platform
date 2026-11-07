import assert from "node:assert/strict";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { and, eq, inArray } from "drizzle-orm";
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
  v5AuditEvents,
  users,
} from "../drizzle/schema";
import { parseTradeGlobalControlPolicy, TRADE_GLOBAL_CONTROL_SETTINGS_KEY, type TradeGlobalControlPolicy } from "../server/trading-global-policy";
import { updatePopupDeliveryStatus } from "../server/opportunityLifecycle";
import { passwordHash } from "../server/_core/localAuth";
import { verifyAdminTradeSettingsInBrowser, verifyCustomerPopupInBrowser } from "./trading-local-browser-acceptance";

const databaseUrlRaw = process.env.DATABASE_URL;
if (!databaseUrlRaw) throw new Error("Trading popup delivery integration requires DATABASE_URL for a disposable migrated database.");
const databaseUrl = new URL(databaseUrlRaw);
const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
if (!new Set(["localhost", "127.0.0.1", "::1"]).has(databaseUrl.hostname) ||
    !/(?:test|testing|integration|disposable|ci)/i.test(databaseName)) {
  throw new Error("Refusing company-rotation integration against a non-loopback or non-disposable database.");
}
const db = await getDb();
if (!db) {
  throw new Error("Trading popup delivery integration cannot connect to its disposable migrated database.");
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
const userPassword = `Browser-${token}-customer!`;
const adminEmail = `popup-admin-${token.toLowerCase()}@example.invalid`;
const adminPassword = `Browser-${token}-admin!`;
const browserAcceptanceBaseUrl = process.env.TRADING_BROWSER_ACCEPTANCE_BASE_URL;
const currency = "USD";
const packageName = `Popup QA ${token}`;
const now = new Date();
const quotaDay = now.toISOString().slice(0, 10);
let userId: number | undefined;
let adminId: number | undefined;
let packageId: number | undefined;
let subscriptionId: number | undefined;
let offerId: number | undefined;
let rollbackRetryOfferId: number | undefined;
let concurrentOfferId: number | undefined;
let rawConnection: Awaited<ReturnType<typeof mysql.createConnection>> | undefined;
let rollbackTriggerName: string | undefined;
let blockedOfferId: number | undefined;
let secondPackageId: number | undefined;
let secondSubscriptionId: number | undefined;
let thirdPackageId: number | undefined;
let thirdSubscriptionId: number | undefined;
let quotaSelectionOfferId: number | undefined;
let capacitySelectionOfferId: number | undefined;
let insufficientRetryOfferId: number | undefined;
const packageSelectionOfferIds: number[] = [];
const catalogueStateKey = "trade.companyCatalogue.adminState";
let originalCompanyCatalogueStateRow: { settingValue: string; updatedBy: number | null; updatedAt: Date } | null = null;
let originalGlobalControlRow: { settingValue: string; updatedBy: number | null; updatedAt: Date } | null = null;
let currentTestGlobalPolicy: TradeGlobalControlPolicy | null = null;

function describeErrorChain(error: unknown): string {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const value = current as { message?: unknown; code?: unknown; sqlMessage?: unknown; cause?: unknown; originalError?: unknown };
    for (const part of [value.message, value.code, value.sqlMessage]) {
      if (part != null) messages.push(String(part));
    }
    current = value.cause ?? value.originalError;
  }
  return messages.join(" | ");
}

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
  rawConnection = await mysql.createConnection({
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port || 3306),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: databaseName,
    timezone: "Z",
  });
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
    loginMethod: "integration",
    passwordHash: passwordHash(userPassword),
    packageName,
  });
  userId = Number(userResult.insertId);

  const [adminResult] = await db.insert(users).values({
    openId: `popup-delivery-admin-${token}`,
    name: "Popup Delivery Integration Administrator",
    email: adminEmail,
    role: "admin",
    loginMethod: "integration",
    passwordHash: passwordHash(adminPassword),
  });
  adminId = Number(adminResult.insertId);

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

  let browserAcceptance: { admin?: unknown; customer?: unknown } | null = null;
  if (browserAcceptanceBaseUrl) {
    const browserFailureTriggerName = `fail_browser_admin_save_${token.toLowerCase()}`;
    let policyVersionBeforeBrowserFailure: number | undefined;
    const adminResult = await verifyAdminTradeSettingsInBrowser({
      baseUrl: browserAcceptanceBaseUrl,
      email: adminEmail,
      password: adminPassword,
      beforeDatabaseFailure: async () => {
        policyVersionBeforeBrowserFailure = (await getTradeGlobalControls()).policyVersion;
        await rawConnection!.query(`DROP TRIGGER IF EXISTS \`${browserFailureTriggerName}\``);
        await rawConnection!.query(`CREATE TRIGGER \`${browserFailureTriggerName}\` BEFORE INSERT ON \`v5_audit_events\` FOR EACH ROW BEGIN IF NEW.action='trade_global_control_updated' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='forced disposable browser save failure'; END IF; END`);
      },
      afterDatabaseFailure: async () => {
        await rawConnection!.query(`DROP TRIGGER IF EXISTS \`${browserFailureTriggerName}\``);
      },
    });
    const savedAdminPolicy = await getTradeGlobalControls();
    assert.equal(savedAdminPolicy.available, true, "The authenticated Trade-settings browser Save must leave a readable database policy.");
    for (const key of ["tierPolicyMasterEnabled", "informationalPopupDeliveryEnabled", "companyRotationEnabled", "randomizedTimingEnabled", "burstDeliveryEnabled", "requirePreviousSettlement"] as const) {
      assert.equal(savedAdminPolicy[key], true, `The authenticated browser Save must persist ${key} independently.`);
    }
    assert.equal(savedAdminPolicy.policyVersion, policyVersionBeforeBrowserFailure,
      "A failed browser Save must not commit its settings or policy-version increment.");
    currentTestGlobalPolicy = savedAdminPolicy as TradeGlobalControlPolicy;
    const customerResult = await verifyCustomerPopupInBrowser({
      baseUrl: browserAcceptanceBaseUrl,
      email: userEmail,
      password: userPassword,
      expectedCompanyName: customerRead.offers[0]?.companyDisplayName,
      expectedOpportunityId: Number(customerRead.offers[0]?.offerId),
      waitForRenderedAcknowledgement: async (diagnostics) => {
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
          const rows = await db.select({
            eventStatus: opportunityPopupEvents.eventStatus,
            deliveryStatus: opportunityPopupEvents.deliveryStatus,
          }).from(opportunityPopupEvents).where(eq(opportunityPopupEvents.id, Number(popupRows[0]?.id)));
          if (rows[0]?.deliveryStatus === "rendered") return;
          if (rows[0]?.eventStatus === "DISMISSED") {
            throw new Error("The popup was dismissed before its rendered delivery acknowledgement reached the database.");
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error(`The real customer popup did not persist a rendered delivery acknowledgement within 15 seconds. API acknowledgement traffic: ${diagnostics.join(" | ") || "none observed"}`);
      },
    });
    const afterBrowserDismissal = await db.select({
      eventStatus: opportunityPopupEvents.eventStatus,
      deliveryStatus: opportunityPopupEvents.deliveryStatus,
    }).from(opportunityPopupEvents).where(eq(opportunityPopupEvents.id, Number(popupRows[0]?.id)));
    assert.equal(afterBrowserDismissal[0]?.deliveryStatus, "rendered",
      "The authenticated customer browser must persist a rendered delivery acknowledgement.");
    assert.equal(afterBrowserDismissal[0]?.eventStatus, "DISMISSED",
      "The customer dismissal acknowledgement must persist to the popup lifecycle row.");
    browserAcceptance = { admin: adminResult, customer: customerResult };
  }

  const activeLeaseToken = customerRead.offers[0]?.deliveryLeaseToken;
  assert.ok(activeLeaseToken, "The claimed delivery must retain a fencing token until acknowledgement.");
  await updatePopupDeliveryStatus(userId, Number(popupRows[0]?.id), "rendered", undefined, activeLeaseToken);
  const acknowledged = await db.select({ deliveryStatus: opportunityPopupEvents.deliveryStatus, eventStatus: opportunityPopupEvents.eventStatus })
    .from(opportunityPopupEvents).where(eq(opportunityPopupEvents.id, Number(popupRows[0]?.id)));
  assert.equal(acknowledged[0]?.deliveryStatus, "rendered");
  assert.equal(acknowledged[0]?.eventStatus, browserAcceptance ? "DISMISSED" : "DELIVERED",
    "A rendered acknowledgement or customer dismissal must remain informational and must not determine offer/trade result state.");
  await updatePopupDeliveryStatus(userId, Number(popupRows[0]?.id), "failed", "STALE_ACK", "stale-lease-token");
  assert.equal((await db.select({ deliveryStatus: opportunityPopupEvents.deliveryStatus }).from(opportunityPopupEvents)
    .where(eq(opportunityPopupEvents.id, Number(popupRows[0]?.id))))[0]?.deliveryStatus, "rendered",
    "A stale acknowledgement must not overwrite current informational delivery state.");
  const secondCycle = await listCustomerOpportunities(userId, {
    workerCycle: true,
    consumeDelivery: false,
    automaticGenerationEnabled: true,
    generationBatchId: `popup-delivery-retry-${token}`,
  });
  assert.equal(secondCycle.offers.length, 1,
    "A repeated worker cycle must retain, not duplicate, the already delivered popup.");
  assert.equal(Number(secondCycle.offers[0]?.offerId), offerId,
    "A retry must reuse the same generated opportunity.");
  const firstRetryAssignmentRows = await db.select().from(opportunityGenerationAssignments)
    .where(eq(opportunityGenerationAssignments.offerId, offerId));
  assert.equal(firstRetryAssignmentRows.length, 1,
    "A retry must not create another generation assignment or consume another quota slot.");
  const firstRetryOfferRows = await db.select({
    generationKey: opportunityOffers.generationKey,
    configuredProfitRateBps: opportunityOffers.configuredProfitRateBps,
    configuredDurationSeconds: opportunityOffers.configuredDurationSeconds,
  }).from(opportunityOffers).where(eq(opportunityOffers.id, offerId));
  assert.equal(firstRetryAssignmentRows[0]?.packageSnapshotJson, generatedAssignments[0]?.packageSnapshotJson,
    "A retry must preserve the original immutable package-terms snapshot.");
  assert.equal(firstRetryOfferRows[0]?.generationKey, generationDiagnostics.persistedOffer[0]?.generationKey,
    "A retry must preserve the generated opportunity idempotency key.");
  assert.equal(firstRetryOfferRows[0]?.configuredProfitRateBps, generationDiagnostics.persistedOffer[0]?.configuredProfitRateBps,
    "A retry must not reroll the configured payout rate.");
  assert.equal(firstRetryOfferRows[0]?.configuredDurationSeconds, generationDiagnostics.persistedOffer[0]?.configuredDurationSeconds,
    "A retry must not reroll the configured duration.");
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

  // Inject a database failure after rotation selection but before opportunity
  // persistence. The transaction must leave the durable rotation cursor intact.
  const rotationKey = `trading.companyRotation.${userId}.${packageId}`;
  const rotationBeforeRows = await db.select({ settingValue: appSettings.settingValue })
    .from(appSettings).where(eq(appSettings.settingKey, rotationKey)).limit(1);
  assert.ok(rotationBeforeRows[0], "Successful generation must persist its durable rotation cursor.");
  const rotationBeforeFailure = String(rotationBeforeRows[0].settingValue);
  await db.update(opportunityOffers).set({ status: "closed" }).where(eq(opportunityOffers.id, offerId));
  rollbackTriggerName = `fail_rotation_generation_${token.toLowerCase()}`;
  await rawConnection!.query(`CREATE TRIGGER ${rollbackTriggerName} BEFORE INSERT ON opportunity_offers
    FOR EACH ROW BEGIN
      IF NEW.generationKey LIKE 'auto:%' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced_rotation_generation_failure';
      END IF;
    END`);
  // Remove the fixture's ordinary inter-delivery cooldown so the injected
  // failure is guaranteed to reach the generation INSERT rather than returning
  // early because the next delivery is not due yet.
  await db.update(opportunityPackagePolicies).set({ minIntervalSeconds: 0, maxIntervalSeconds: 0, postCompletionIntervalSeconds: 0 })
    .where(eq(opportunityPackagePolicies.packageName, packageName));
  // The acknowledged first delivery is no longer a scheduling predecessor for
  // this isolated generation-transaction scenario.
  await db.update(opportunityDeliveryEvents).set({
    status: "failed",
    deliveredAt: new Date(Date.now() - 60 * 60 * 1000),
  }).where(and(
    eq(opportunityDeliveryEvents.userId, userId),
    eq(opportunityDeliveryEvents.offerId, offerId),
  ));
  const offersBeforeFailure = await db.select({ id: opportunityOffers.id })
    .from(opportunityOffers).where(eq(opportunityOffers.assignedUserId, userId));
  let injectedRotationFailure: unknown;
  try {
    await listCustomerOpportunities(userId, {
      workerCycle: true,
      consumeDelivery: false,
      automaticGenerationEnabled: true,
      generationBatchId: `rotation-rollback-${token}`,
    });
  } catch (error) {
    injectedRotationFailure = error;
  }
  assert.match(describeErrorChain(injectedRotationFailure), /forced_rotation_generation_failure/,
    "The rollback scenario must reach and surface the deliberately injected opportunity INSERT failure.");
  await rawConnection!.query(`DROP TRIGGER IF EXISTS ${rollbackTriggerName}`);
  rollbackTriggerName = undefined;
  const rotationAfterFailureRows = await db.select({ settingValue: appSettings.settingValue })
    .from(appSettings).where(eq(appSettings.settingKey, rotationKey)).limit(1);
  assert.equal(String(rotationAfterFailureRows[0]?.settingValue), rotationBeforeFailure,
    "A failed offer insert must not consume a company rotation position.");
  assert.equal((await db.select({ id: opportunityOffers.id })
    .from(opportunityOffers).where(eq(opportunityOffers.assignedUserId, userId))).length, offersBeforeFailure.length,
    "A failed generation transaction must not leave a partial opportunity.");

  const retryCycle = await listCustomerOpportunities(userId, {
    workerCycle: true,
    consumeDelivery: false,
    automaticGenerationEnabled: true,
    generationBatchId: `rotation-rollback-retry-${token}`,
  });
  rollbackRetryOfferId = Number(retryCycle.generatedOpportunityId);
  assert.ok(Number.isSafeInteger(rollbackRetryOfferId) && rollbackRetryOfferId > 0,
    "Generation must recover after the injected database failure.");
  const rotationAfterRetryRows = await db.select({ settingValue: appSettings.settingValue })
    .from(appSettings).where(eq(appSettings.settingKey, rotationKey)).limit(1);
  assert.notEqual(String(rotationAfterRetryRows[0]?.settingValue), rotationBeforeFailure,
    "A successful retry must consume exactly one rotation position.");
  const beforeRetryState = JSON.parse(rotationBeforeFailure);
  const afterRetryState = JSON.parse(String(rotationAfterRetryRows[0]?.settingValue));
  assert.equal(Number(afterRetryState.requestCount), Number(beforeRetryState.requestCount) + 1,
    "A successful retry must advance the durable rotation counter exactly once.");

  // Two simultaneous worker cycles for the same customer must serialize on
  // the generation lock, return the same open opportunity, and consume only
  // one additional rotation position.
  await db.update(opportunityOffers).set({ status: "closed" }).where(eq(opportunityOffers.id, rollbackRetryOfferId));
  const assignmentsBeforeConcurrentCycles = await db.select({ id: opportunityGenerationAssignments.id })
    .from(opportunityGenerationAssignments).where(eq(opportunityGenerationAssignments.userId, userId));
  const concurrentStartRows = await db.select({ settingValue: appSettings.settingValue })
    .from(appSettings).where(eq(appSettings.settingKey, rotationKey)).limit(1);
  const concurrentStartState = JSON.parse(String(concurrentStartRows[0]?.settingValue || "{}"));
  const concurrentCycles = await Promise.all([
    listCustomerOpportunities(userId, {
      workerCycle: true, consumeDelivery: false, automaticGenerationEnabled: true,
      generationBatchId: `rotation-concurrent-a-${token}`,
    }),
    listCustomerOpportunities(userId, {
      workerCycle: true, consumeDelivery: false, automaticGenerationEnabled: true,
      generationBatchId: `rotation-concurrent-b-${token}`,
    }),
  ]);
  const concurrentIds = concurrentCycles.map(cycle => Number(cycle.generatedOpportunityId));
  assert.ok(concurrentIds.every(id => Number.isSafeInteger(id) && id > 0),
    "Both concurrent cycles must resolve to a persisted opportunity.");
  assert.equal(concurrentIds[0], concurrentIds[1],
    "Concurrent cycles for one customer must reuse the same generated opportunity.");
  concurrentOfferId = concurrentIds[0];
  const concurrentOfferAssignments = await db.select().from(opportunityGenerationAssignments)
    .where(eq(opportunityGenerationAssignments.offerId, concurrentOfferId));
  assert.equal(concurrentOfferAssignments.length, 1,
    "A concurrent retry must persist exactly one assignment for the shared opportunity.");
  const assignmentsAfterConcurrentCycles = await db.select({ id: opportunityGenerationAssignments.id })
    .from(opportunityGenerationAssignments).where(eq(opportunityGenerationAssignments.userId, userId));
  assert.equal(assignmentsAfterConcurrentCycles.length, assignmentsBeforeConcurrentCycles.length + 1,
    "Two concurrent generation attempts must consume only one quota slot.");
  const concurrentEndRows = await db.select({ settingValue: appSettings.settingValue })
    .from(appSettings).where(eq(appSettings.settingKey, rotationKey)).limit(1);
  const concurrentEndState = JSON.parse(String(concurrentEndRows[0]?.settingValue || "{}"));
  assert.equal(Number(concurrentEndState.requestCount), Number(concurrentStartState.requestCount) + 1,
    "Concurrent retries must consume one rotation position, never two.");

  // The first package has consumed exactly three generation slots (initial
  // generation, rollback retry, and one concurrent generation). A tier edit
  // lowers the live quota below those already-assigned terms; the saved
  // subscription must still be allowed to use all six of its saved slots.
  await db.update(opportunityOffers).set({ status: "closed" }).where(eq(opportunityOffers.id, concurrentOfferId));
  await db.update(packages).set({ opportunitiesPerDay: 2 }).where(eq(packages.id, packageId));
  await db.update(opportunityPackagePolicies).set({ maxPopupsPerDay: 20 })
    .where(eq(opportunityPackagePolicies.packageName, packageName));
  assert.equal(Number((await db.select({ quota: packages.opportunitiesPerDay }).from(packages)
    .where(eq(packages.id, packageId)))[0]?.quota), 2);
  const savedQuotaAfterLowering = JSON.parse(String((await db.select({ termsSnapshotJson: customerPackageSubscriptions.termsSnapshotJson })
    .from(customerPackageSubscriptions).where(eq(customerPackageSubscriptions.id, subscriptionId)))[0]?.termsSnapshotJson || "{}"));
  assert.equal(Number(savedQuotaAfterLowering.opportunitiesPerDay), 6,
    "Lowering the current package quota must not rewrite the existing subscription snapshot.");

  for (let index = 0; index < 3; index += 1) {
    const savedQuotaCycle = await listCustomerOpportunities(userId, {
      workerCycle: true,
      consumeDelivery: false,
      automaticGenerationEnabled: true,
      generationBatchId: `saved-entitlement-lower-current-quota-${index}-${token}`,
    });
    const savedQuotaOfferId = Number(savedQuotaCycle.generatedOpportunityId);
    assert.ok(Number.isSafeInteger(savedQuotaOfferId) && savedQuotaOfferId > 0,
      `Existing saved quota must allow generation ${index + 4} even though the current package quota is 2.`);
    const savedQuotaAssignment = (await db.select().from(opportunityGenerationAssignments)
      .where(eq(opportunityGenerationAssignments.offerId, savedQuotaOfferId)))[0];
    assert.equal(Number(savedQuotaAssignment?.packageId), packageId,
      "Generation below the saved six-opportunity limit must continue using the original package entitlement.");
    if (index === 0) {
      const assignmentSnapshot = JSON.parse(String(savedQuotaAssignment?.packageSnapshotJson || "{}"));
      assert.equal(Number(assignmentSnapshot.customerDailyQuota), 6);
      assert.equal(Number(assignmentSnapshot.packageDailyOpportunityQuota), 6,
        "The generated assignment must record the saved quota, not the lower current package quota.");
    }
    await db.update(opportunityOffers).set({ status: "closed" })
      .where(eq(opportunityOffers.id, savedQuotaOfferId));
  }

  // Raising the current package quota still cannot enlarge the already saved
  // subscription: after its sixth assignment, selection must continue to B.
  await db.update(packages).set({ opportunitiesPerDay: 20 }).where(eq(packages.id, packageId));
  assert.equal(Number((await db.select({ quota: packages.opportunitiesPerDay }).from(packages)
    .where(eq(packages.id, packageId)))[0]?.quota), 20);
  const savedQuotaAfterRaising = JSON.parse(String((await db.select({ termsSnapshotJson: customerPackageSubscriptions.termsSnapshotJson })
    .from(customerPackageSubscriptions).where(eq(customerPackageSubscriptions.id, subscriptionId)))[0]?.termsSnapshotJson || "{}"));
  assert.equal(Number(savedQuotaAfterRaising.opportunitiesPerDay), 6,
    "Raising the current package quota must leave the existing subscription snapshot unchanged.");

  const secondPackageName = packageName + "Plus";
  const [secondPackageResult] = await db.insert(packages).values({
    name: secondPackageName,
    minimumQualifyingBalanceUsdMinor: 10000,
    durationMonths: 1,
    opportunitiesPerDay: 1,
    termsVersion: 1,
    maxPopupsPerDay: 0,
    maxActiveInvestments: 0,
    enabled: true,
  });
  secondPackageId = Number(secondPackageResult.insertId);
  await db.insert(opportunityPackagePolicies).values({
    packageName: secondPackageName,
    minimumPayoutRateBps: 400,
    maximumPayoutRateBps: 500,
    minimumTradeDurationSeconds: 700,
    maximumTradeDurationSeconds: 800,
    companyRotationEnabled: true,
    maxPopupsPerDay: 1,
    maxVisibleOffers: 5,
    minimumTradeUnits: 100,
    maximumTradeUnits: 1000,
    burstEnabled: false,
    maxBurstSize: 1,
    enabled: false,
    automaticDelivery: false,
    automaticTradingEnabled: false,
    dailyPopupTarget: 0,
    schedulingPeriod: "calendar_day",
    minIntervalSeconds: 0,
    maxIntervalSeconds: 0,
    randomizationEnabled: false,
    popupDisplayTargetSeconds: 120,
    completionDisplaySeconds: 8,
    postCompletionIntervalSeconds: 0,
    maxPendingDeliveries: 3,
    maxDeliveryAttempts: 3,
    requirePreviousSettlement: true,
    minSettlementDelaySeconds: 900,
    maxSettlementDelaySeconds: 900,
  });
  const [secondSubscriptionResult] = await db.insert(customerPackageSubscriptions).values({
    userId,
    packageId: secondPackageId,
    startsAt: new Date(now.getTime() - 60_000),
    expiresAt: new Date(now.getTime() + 172_800_000),
    status: "active",
    activationKey: `auto-tier:popup-delivery-secondary-${token}`,
    termsSnapshotJson: JSON.stringify({ opportunitiesPerDay: 1, maxPopupsPerDay: 0 }),
    qualifyingBalanceUsdMinor: 10000,
    packageTermsVersion: 1,
  });
  secondSubscriptionId = Number(secondSubscriptionResult.insertId);

  const firstPackageAssignmentsBeforeSelection = await db.select({
    id: opportunityGenerationAssignments.id,
  }).from(opportunityGenerationAssignments).where(and(
    eq(opportunityGenerationAssignments.userId, userId),
    eq(opportunityGenerationAssignments.packageId, packageId),
  ));
  assert.equal(firstPackageAssignmentsBeforeSelection.length, 6,
    "The first package must be exhausted at its saved quota despite the live package quota being 20.");

  const quotaSelectionCycle = await listCustomerOpportunities(userId, {
    workerCycle: true,
    consumeDelivery: false,
    automaticGenerationEnabled: true,
    generationBatchId: `per-package-quota-selection-${token}`,
  });
  if (!quotaSelectionCycle.generatedOpportunityId) console.error("PER_PACKAGE_QUOTA_SELECTION_DIAGNOSTICS " + JSON.stringify({
    delivery: quotaSelectionCycle.delivery,
    generatedOpportunityId: quotaSelectionCycle.generatedOpportunityId,
    openOffers: await db.select({
      id: opportunityOffers.id,
      packageId: opportunityOffers.assignedPackageId,
      subscriptionId: opportunityOffers.assignedPackageSubscriptionId,
    }).from(opportunityOffers).where(and(
      eq(opportunityOffers.assignedUserId, userId),
      eq(opportunityOffers.status, "open"),
    )),
    firstPackageAssignments: await db.select({
      id: opportunityGenerationAssignments.id,
      generatedAt: opportunityGenerationAssignments.generatedAt,
    }).from(opportunityGenerationAssignments).where(and(
      eq(opportunityGenerationAssignments.userId, userId),
      eq(opportunityGenerationAssignments.packageId, packageId),
    )),
    secondPackageAssignments: await db.select({
      id: opportunityGenerationAssignments.id,
      generatedAt: opportunityGenerationAssignments.generatedAt,
    }).from(opportunityGenerationAssignments).where(and(
      eq(opportunityGenerationAssignments.userId, userId),
      eq(opportunityGenerationAssignments.packageId, secondPackageId),
    )),
  }));
  quotaSelectionOfferId = Number(quotaSelectionCycle.generatedOpportunityId);
  assert.ok(Number.isSafeInteger(quotaSelectionOfferId) && quotaSelectionOfferId > 0,
    "Generation must skip an exhausted package and continue to a package with remaining quota.");
  const quotaSelectionAssignment = (await db.select().from(opportunityGenerationAssignments)
    .where(eq(opportunityGenerationAssignments.offerId, quotaSelectionOfferId)))[0];
  assert.equal(Number(quotaSelectionAssignment?.packageId), secondPackageId,
    "The generator must select the second package because the first package has no remaining daily quota.");
  assert.equal(Number(quotaSelectionAssignment?.packageSubscriptionId), secondSubscriptionId,
    "The selected assignment must belong to the subscription whose package still has capacity.");
  const quotaSelectionSnapshot = JSON.parse(String(quotaSelectionAssignment?.packageSnapshotJson || "{}"));
  assert.equal(Number(quotaSelectionSnapshot.customerDailyQuota), 1,
    "The immutable snapshot must record the selected subscription's entitlement quota.");
  assert.equal(Number(quotaSelectionSnapshot.packageDailyOpportunityQuota), 1,
    "The immutable snapshot must record the selected package's independent daily cap.");
  assert.equal((await db.select({ id: opportunityGenerationAssignments.id })
    .from(opportunityGenerationAssignments).where(and(
      eq(opportunityGenerationAssignments.userId, userId),
      eq(opportunityGenerationAssignments.packageId, packageId),
    ))).length, 6,
    "Skipping the exhausted package must not create an extra assignment against its saved quota.");
  assert.equal((await db.select({ id: opportunityGenerationAssignments.id })
    .from(opportunityGenerationAssignments).where(and(
      eq(opportunityGenerationAssignments.userId, userId),
      eq(opportunityGenerationAssignments.packageId, secondPackageId),
    ))).length, 1,
    "The package with available quota must receive exactly one assignment.");

  // Both subscriptions are now exhausted. Close the generated offer so the
  // retry-reuse fast path cannot mask an incorrect quota decision, then prove
  // no offer or company rotation position is consumed.
  await db.update(opportunityOffers).set({ status: "closed" })
    .where(eq(opportunityOffers.id, quotaSelectionOfferId));
  const exhaustedRotationBefore = await Promise.all([packageId, secondPackageId].map(async id => {
    const key = `trading.companyRotation.${userId}.${id}`;
    const rows = await db.select({ settingValue: appSettings.settingValue })
      .from(appSettings).where(eq(appSettings.settingKey, key)).limit(1);
    return { key, value: rows[0]?.settingValue ?? null };
  }));
  const allExhaustedCycle = await listCustomerOpportunities(userId, {
    workerCycle: true,
    consumeDelivery: false,
    automaticGenerationEnabled: true,
    generationBatchId: `all-packages-exhausted-${token}`,
  });
  assert.equal(allExhaustedCycle.generatedOpportunityId, null,
    "When every eligible subscription is exhausted, the generator must create no opportunity.");
  assert.equal((await db.select({ id: opportunityOffers.id }).from(opportunityOffers).where(and(
    eq(opportunityOffers.assignedUserId, userId), eq(opportunityOffers.status, "open"),
  ))).length, 0,
  "All-exhausted quota handling must leave no open generated opportunity.");
  assert.deepEqual(await Promise.all(exhaustedRotationBefore.map(async ({ key }) => {
    const rows = await db.select({ settingValue: appSettings.settingValue })
      .from(appSettings).where(eq(appSettings.settingKey, key)).limit(1);
    return { key, value: rows[0]?.settingValue ?? null };
  })), exhaustedRotationBefore,
  "When all subscriptions are exhausted, no company rotation position may be consumed.");
  assert.equal((await db.select({ id: opportunityGenerationAssignments.id }).from(opportunityGenerationAssignments)
    .where(eq(opportunityGenerationAssignments.userId, userId))).length, 7,
  "All-exhausted generation must not create another quota assignment.");

  // Restore positive per-subscription and package capacity for both candidates.
  // The first subscription expires earlier, so existing candidate ordering must
  // select it and persist its exact subscription ID in both offer and assignment.
  await db.update(packages).set({ opportunitiesPerDay: 10 }).where(eq(packages.id, packageId));
  await db.update(opportunityPackagePolicies).set({ maxPopupsPerDay: 10 })
    .where(eq(opportunityPackagePolicies.packageName, packageName));
  await db.update(customerPackageSubscriptions).set({
    termsSnapshotJson: JSON.stringify({ opportunitiesPerDay: 10, maxPopupsPerDay: 0 }),
  }).where(eq(customerPackageSubscriptions.id, subscriptionId));
  await db.update(packages).set({ opportunitiesPerDay: 3 }).where(eq(packages.id, secondPackageId));
  await db.update(opportunityPackagePolicies).set({ maxPopupsPerDay: 3 })
    .where(eq(opportunityPackagePolicies.packageName, secondPackageName));
  await db.update(customerPackageSubscriptions).set({
    termsSnapshotJson: JSON.stringify({ opportunitiesPerDay: 3, maxPopupsPerDay: 0 }),
  }).where(eq(customerPackageSubscriptions.id, secondSubscriptionId));
  const bothHaveCapacityCycle = await listCustomerOpportunities(userId, {
    workerCycle: true,
    consumeDelivery: false,
    automaticGenerationEnabled: true,
    generationBatchId: `both-packages-have-capacity-${token}`,
  });
  capacitySelectionOfferId = Number(bothHaveCapacityCycle.generatedOpportunityId);
  assert.ok(Number.isSafeInteger(capacitySelectionOfferId) && capacitySelectionOfferId > 0,
    "When both eligible subscriptions have capacity, the generator must create one opportunity.");
  const capacitySelectionAssignment = (await db.select().from(opportunityGenerationAssignments)
    .where(eq(opportunityGenerationAssignments.offerId, capacitySelectionOfferId)))[0];
  const capacitySelectionOffer = (await db.select({
    packageId: opportunityOffers.assignedPackageId,
    packageSubscriptionId: opportunityOffers.assignedPackageSubscriptionId,
  }).from(opportunityOffers).where(eq(opportunityOffers.id, capacitySelectionOfferId)))[0];
  assert.equal(Number(capacitySelectionAssignment?.packageId), packageId,
    "With both subscriptions available, generation must honor the existing earliest-expiry selection order.");
  assert.equal(Number(capacitySelectionAssignment?.packageSubscriptionId), subscriptionId,
    "The assignment must record the exact first subscription whose quota was checked.");
  assert.equal(Number(capacitySelectionOffer?.packageId), packageId);
  assert.equal(Number(capacitySelectionOffer?.packageSubscriptionId), subscriptionId,
    "The generated offer must identify the same exact subscription as its quota assignment.");
  const capacitySelectionSnapshot = JSON.parse(String(capacitySelectionAssignment?.packageSnapshotJson || "{}"));
  assert.equal(Number(capacitySelectionSnapshot.customerDailyQuota), 10,
    "The both-available assignment snapshot must preserve the selected subscription's saved quota.");
  await db.update(opportunityOffers).set({ status: "closed" })
    .where(eq(opportunityOffers.id, capacitySelectionOfferId));

  // A missed/insufficient popup is terminal for that offer. The next worker
  // cycle must create a different opportunity, not reuse the still-open source.
  await db.update(opportunityPopupEvents).set({ balanceStatus: "insufficient", balanceAvailableMinor: 0 })
    .where(eq(opportunityPopupEvents.id, Number(popupRows[0]?.id)));
  await db.update(opportunityPackagePolicies).set({
    minIntervalSeconds: 0,
    maxIntervalSeconds: 0,
    postCompletionIntervalSeconds: 0,
    maxPendingDeliveries: 1,
  }).where(eq(opportunityPackagePolicies.packageName, packageName));
  const afterInsufficientCycle = await listCustomerOpportunities(userId, {
    workerCycle: true,
    consumeDelivery: false,
    automaticGenerationEnabled: true,
    generationBatchId: `popup-delivery-after-insufficient-${token}`,
  });
  const generatedAfterInsufficientId = Number(afterInsufficientCycle.generatedOpportunityId);
  insufficientRetryOfferId = generatedAfterInsufficientId;
  assert.ok(Number.isSafeInteger(generatedAfterInsufficientId) && generatedAfterInsufficientId > 0,
    "An insufficient-balance popup must not consume pending-delivery capacity or prevent the next worker cycle from generating an opportunity. Diagnostics: "+JSON.stringify(afterInsufficientCycle.generationDiagnostics));
  assert.notEqual(generatedAfterInsufficientId, offerId,
    "The next worker cycle must not return the original insufficient-balance offer.");
  assert.equal((await db.select({ id: opportunityGenerationAssignments.id }).from(opportunityGenerationAssignments)
    .where(eq(opportunityGenerationAssignments.offerId, generatedAfterInsufficientId))).length, 1,
    "The next opportunity must persist its own generation assignment.");
  assert.equal((await db.select({ balanceStatus: opportunityPopupEvents.balanceStatus }).from(opportunityPopupEvents)
    .where(eq(opportunityPopupEvents.id, Number(popupRows[0]?.id))))[0]?.balanceStatus, "insufficient",
    "The original missed popup history must remain intact.");

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

  // Exercise the latest-main generator and delivery selector with three separate
  // package entitlements. A cooling package must not gate a ready package.
  const thirdPackageName = packageName + "SelectC";
  const [thirdPackageResult] = await db.insert(packages).values({
    name: thirdPackageName,
    minimumQualifyingBalanceUsdMinor: 10000,
    durationMonths: 1,
    opportunitiesPerDay: 30,
    termsVersion: 1,
    maxPopupsPerDay: 0,
    maxActiveInvestments: 0,
    enabled: true,
  });
  thirdPackageId = Number(thirdPackageResult.insertId);
  await db.insert(opportunityPackagePolicies).values({
    packageName: thirdPackageName,
    minimumPayoutRateBps: 400,
    maximumPayoutRateBps: 500,
    minimumTradeDurationSeconds: 700,
    maximumTradeDurationSeconds: 800,
    companyRotationEnabled: true,
    maxPopupsPerDay: 30,
    maxVisibleOffers: 5,
    minimumTradeUnits: 100,
    maximumTradeUnits: 1000,
    burstEnabled: false,
    maxBurstSize: 1,
    enabled: false,
    automaticDelivery: false,
    automaticTradingEnabled: false,
    dailyPopupTarget: 0,
    schedulingPeriod: "calendar_day",
    minIntervalSeconds: 0,
    maxIntervalSeconds: 0,
    randomizationEnabled: false,
    popupDisplayTargetSeconds: 120,
    completionDisplaySeconds: 8,
    postCompletionIntervalSeconds: 0,
    maxPendingDeliveries: 3,
    maxDeliveryAttempts: 3,
    requirePreviousSettlement: true,
    minSettlementDelaySeconds: 900,
    maxSettlementDelaySeconds: 900,
  });
  const [thirdSubscriptionResult] = await db.insert(customerPackageSubscriptions).values({
    userId,
    packageId: thirdPackageId,
    startsAt: new Date(now.getTime() - 60_000),
    expiresAt: new Date(now.getTime() + 259_200_000),
    status: "active",
    activationKey: `auto-tier:popup-delivery-tertiary-${token}`,
    termsSnapshotJson: JSON.stringify({ opportunitiesPerDay: 30, maxPopupsPerDay: 0 }),
    qualifyingBalanceUsdMinor: 10000,
    packageTermsVersion: 1,
  });
  thirdSubscriptionId = Number(thirdSubscriptionResult.insertId);
  const selectionPackageNames = { a: packageName, b: packageName + "Plus", c: thirdPackageName };
  const selectionPackages = [
    { packageId: packageId!, subscriptionId: subscriptionId!, packageName: selectionPackageNames.a },
    { packageId: secondPackageId!, subscriptionId: secondSubscriptionId!, packageName: selectionPackageNames.b },
    { packageId: thirdPackageId!, subscriptionId: thirdSubscriptionId!, packageName: selectionPackageNames.c },
  ];
  for (const fixture of selectionPackages) {
    await db.update(packages).set({ opportunitiesPerDay: 30 }).where(eq(packages.id, fixture.packageId));
    await db.update(opportunityPackagePolicies).set({
      maxPopupsPerDay: 30,
      minIntervalSeconds: fixture.packageName === selectionPackageNames.a ? 120 : fixture.packageName === selectionPackageNames.b ? 300 : 480,
      maxIntervalSeconds: fixture.packageName === selectionPackageNames.a ? 240 : fixture.packageName === selectionPackageNames.b ? 420 : 600,
      postCompletionIntervalSeconds: fixture.packageName === selectionPackageNames.a ? 120 : fixture.packageName === selectionPackageNames.b ? 300 : 480,
    }).where(eq(opportunityPackagePolicies.packageName, fixture.packageName));
    await db.update(customerPackageSubscriptions).set({
      termsSnapshotJson: JSON.stringify({ opportunitiesPerDay: 30, maxPopupsPerDay: 0 }),
    }).where(eq(customerPackageSubscriptions.id, fixture.subscriptionId));
  }
  // Retire earlier test offers so the generation retry gate cannot mask which
  // entitlement the independent scheduler selects.
  await db.update(opportunityOffers).set({ status: "closed" }).where(and(
    eq(opportunityOffers.assignedUserId, userId), eq(opportunityOffers.status, "open"),
  ));
  await db.update(opportunityGenerationAssignments).set({ status: "cancelled" })
    .where(eq(opportunityGenerationAssignments.userId, userId));
  // Keep an open, previously generated Package A offer in place. Its own
  // cooldown must not hold the customer-wide generation gate closed.
  await db.update(opportunityOffers).set({ status: "open", closesAt: new Date(Date.now() + 3_600_000) })
    .where(eq(opportunityOffers.id, offerId!));
  await db.update(opportunityGenerationAssignments).set({ status: "delivered" })
    .where(eq(opportunityGenerationAssignments.offerId, offerId!));
  const oldPackageDeliveryAt = new Date(Math.floor((Date.now() - 3_600_000) / 1000) * 1000);
  const recentPackageDeliveryAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  const setPackageDeliveryAt = async (packageNames: string[], deliveredAt: Date) => {
    const popupRowsForPackages = await db.select({ offerId: opportunityPopupEvents.offerId })
      .from(opportunityPopupEvents).where(and(
        eq(opportunityPopupEvents.userId, userId), inArray(opportunityPopupEvents.packageName, packageNames),
      ));
    for (const popup of popupRowsForPackages) {
      await db.update(opportunityDeliveryEvents).set({ status: "delivered", deliveredAt }).where(and(
        eq(opportunityDeliveryEvents.userId, userId), eq(opportunityDeliveryEvents.offerId, Number(popup.offerId)),
      ));
    }
    return popupRowsForPackages.length;
  };
  assert.ok(await setPackageDeliveryAt([selectionPackageNames.a], recentPackageDeliveryAt) > 0,
    "The cooling-package fixture must have real persisted delivery history for Package A.");
  await setPackageDeliveryAt([selectionPackageNames.b], oldPackageDeliveryAt);
  const firstReadyPackageCycle = await listCustomerOpportunities(userId, {
    workerCycle: true,
    consumeDelivery: false,
    automaticGenerationEnabled: true,
    generationBatchId: `package-cooling-a-to-b-${token}`,
  });
  const firstReadyPackageOfferId = Number(firstReadyPackageCycle.generatedOpportunityId);
  packageSelectionOfferIds.push(firstReadyPackageOfferId);
  assert.ok(Number.isSafeInteger(firstReadyPackageOfferId) && firstReadyPackageOfferId > 0,
    "The generator must still create an opportunity while Package A is cooling and Package B is ready.");
  const firstReadyPackageAssignment = (await db.select().from(opportunityGenerationAssignments)
    .where(eq(opportunityGenerationAssignments.offerId, firstReadyPackageOfferId)))[0];
  assert.equal(Number(firstReadyPackageAssignment?.packageId), secondPackageId,
    "When A is cooling, the actual generator and selector must assign the opportunity to ready Package B.");
  assert.equal(Number(firstReadyPackageAssignment?.packageSubscriptionId), secondSubscriptionId);
  const scheduleRow = (cycle: typeof firstReadyPackageCycle, name: string) =>
    (cycle.delivery.packageSchedules as Array<any>).find(row => row.packageName === name);
  assert.equal(scheduleRow(firstReadyPackageCycle, selectionPackageNames.a)?.cooling, true);
  assert.equal(scheduleRow(firstReadyPackageCycle, selectionPackageNames.b)?.cooling, false);
  assert.equal(scheduleRow(firstReadyPackageCycle, selectionPackageNames.c)?.cooling, false);

  // The newly delivered B offer now gives B its own cooldown. With A and B
  // cooling, the generator must skip both and use the ready C entitlement.
  await db.update(opportunityOffers).set({ status: "closed" })
    .where(eq(opportunityOffers.id, firstReadyPackageOfferId));
  await db.update(opportunityGenerationAssignments).set({ status: "cancelled" })
    .where(eq(opportunityGenerationAssignments.offerId, firstReadyPackageOfferId));
  await db.update(opportunityPopupEvents).set({ eventStatus: "WITHDRAWN", deliveryStatus: "dismissed" })
    .where(and(eq(opportunityPopupEvents.userId, userId), eq(opportunityPopupEvents.offerId, firstReadyPackageOfferId)));
  assert.ok(await setPackageDeliveryAt([selectionPackageNames.b], recentPackageDeliveryAt) > 0,
    "The second scenario must have a persisted delivery event for Package B.");
  await setPackageDeliveryAt([selectionPackageNames.a], recentPackageDeliveryAt);
  const secondReadyPackageCycle = await listCustomerOpportunities(userId, {
    workerCycle: true,
    consumeDelivery: false,
    automaticGenerationEnabled: true,
    generationBatchId: `package-cooling-a-b-to-c-${token}`,
  });
  const secondReadyPackageOfferId = Number(secondReadyPackageCycle.generatedOpportunityId);
  packageSelectionOfferIds.push(secondReadyPackageOfferId);
  assert.ok(Number.isSafeInteger(secondReadyPackageOfferId) && secondReadyPackageOfferId > 0,
    "The generator must still create an opportunity while A and B are cooling and C is ready.");
  const secondReadyPackageAssignment = (await db.select().from(opportunityGenerationAssignments)
    .where(eq(opportunityGenerationAssignments.offerId, secondReadyPackageOfferId)))[0];
  assert.equal(Number(secondReadyPackageAssignment?.packageId), thirdPackageId,
    "When A and B are cooling, the actual generator and selector must assign the opportunity to ready Package C.");
  assert.equal(Number(secondReadyPackageAssignment?.packageSubscriptionId), thirdSubscriptionId);
  assert.equal(scheduleRow(secondReadyPackageCycle, selectionPackageNames.a)?.cooling, true);
  assert.equal(scheduleRow(secondReadyPackageCycle, selectionPackageNames.b)?.cooling, true);
  assert.equal(scheduleRow(secondReadyPackageCycle, selectionPackageNames.c)?.cooling, false);

  // Isolate the saved completion deadlines from delivery cooldowns and verify
  // that editing A's policy leaves the B and C schedules unchanged.
  await db.update(opportunityOffers).set({ status: "closed" })
    .where(eq(opportunityOffers.id, secondReadyPackageOfferId));
  await db.update(opportunityGenerationAssignments).set({ status: "cancelled" })
    .where(eq(opportunityGenerationAssignments.offerId, secondReadyPackageOfferId));
  await db.update(opportunityPopupEvents).set({ eventStatus: "WITHDRAWN", deliveryStatus: "dismissed" })
    .where(and(eq(opportunityPopupEvents.userId, userId), eq(opportunityPopupEvents.offerId, secondReadyPackageOfferId)));
  await setPackageDeliveryAt(Object.values(selectionPackageNames), oldPackageDeliveryAt);
  const completionAt = new Date(Math.floor((Date.now() - 90_000) / 1000) * 1000);
  for (const fixture of selectionPackages) {
    const linkedOfferId = fixture.packageName === selectionPackageNames.a ? offerId!
      : fixture.packageName === selectionPackageNames.b ? firstReadyPackageOfferId : secondReadyPackageOfferId;
    await db.insert(tradePositions).values({
      userId,
      offerId: linkedOfferId,
      packageSubscriptionId: fixture.subscriptionId,
      currency,
      principalMinor: 10_000,
      expectedRewardMinor: 250,
      status: "settled",
      confirmedAt: completionAt,
      settlesAt: completionAt,
      settledAt: completionAt,
      completionAt,
    });
  }
  const timingSnapshot = await listCustomerOpportunities(userId, {
    workerCycle: true,
    consumeDelivery: false,
    automaticGenerationEnabled: false,
    allowAutomaticExecution: false,
  });
  const expectedTiming = [
    { packageName: selectionPackageNames.a, min: 120, max: 240, post: 120 },
    { packageName: selectionPackageNames.b, min: 300, max: 420, post: 300 },
    { packageName: selectionPackageNames.c, min: 480, max: 600, post: 480 },
  ];
  assert.equal(timingSnapshot.delivery.packageSchedules.length, 3);
  for (const expected of expectedTiming) {
    const schedule = scheduleRow(timingSnapshot, expected.packageName);
    assert.ok(schedule, `The real delivery path must expose ${expected.packageName}'s schedule.`);
    assert.equal(schedule.minIntervalSeconds, expected.min);
    assert.equal(schedule.maxIntervalSeconds, expected.max);
    assert.equal(schedule.postCompletionIntervalSeconds, expected.post);
    assert.equal(schedule.readyAt?.getTime(), completionAt.getTime() + expected.post * 1000,
      `${expected.packageName} must use its own settled-trade completion interval.`);
    assert.equal(schedule.cooling, true);
  }
  const scheduleFor = (cycle: typeof timingSnapshot, name: string) => {
    const row = scheduleRow(cycle, name);
    return row && { min: row.minIntervalSeconds, max: row.maxIntervalSeconds,
      post: row.postCompletionIntervalSeconds, cooling: row.cooling, readyAt: row.readyAt?.toISOString() ?? null };
  };
  const packageBScheduleBeforeAChange = scheduleFor(timingSnapshot, selectionPackageNames.b);
  const packageCScheduleBeforeAChange = scheduleFor(timingSnapshot, selectionPackageNames.c);
  await db.update(opportunityPackagePolicies).set({
    minIntervalSeconds: 180, maxIntervalSeconds: 360, postCompletionIntervalSeconds: 240,
  }).where(eq(opportunityPackagePolicies.packageName, selectionPackageNames.a));
  const afterPackageAChange = await listCustomerOpportunities(userId, {
    workerCycle: true,
    consumeDelivery: false,
    automaticGenerationEnabled: false,
    allowAutomaticExecution: false,
  });
  assert.deepEqual(scheduleFor(afterPackageAChange, selectionPackageNames.b), packageBScheduleBeforeAChange,
    "Changing Package A's saved timing must not alter Package B's delivery or completion schedule.");
  assert.deepEqual(scheduleFor(afterPackageAChange, selectionPackageNames.c), packageCScheduleBeforeAChange,
    "Changing Package A's saved timing must not alter Package C's delivery or completion schedule.");
  assert.equal(scheduleFor(afterPackageAChange, selectionPackageNames.a)?.readyAt,
    new Date(completionAt.getTime() + 240_000).toISOString(),
    "Package A's own saved post-completion interval must control its revised deadline.");

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
    browserAcceptance,
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
        if (rollbackTriggerName && rawConnection) {
          await rawConnection.query(`DROP TRIGGER IF EXISTS ${rollbackTriggerName}`);
          rollbackTriggerName = undefined;
        }
        for (const fixtureOfferId of [offerId, blockedOfferId, rollbackRetryOfferId, concurrentOfferId, quotaSelectionOfferId, capacitySelectionOfferId, insufficientRetryOfferId, ...packageSelectionOfferIds]) {
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
          if (secondPackageId !== undefined) {
            await db.delete(appSettings).where(eq(appSettings.settingKey, `trading.companyRotation.${userId}.${secondPackageId}`));
          }
          if (thirdPackageId !== undefined) {
            await db.delete(appSettings).where(eq(appSettings.settingKey, `trading.companyRotation.${userId}.${thirdPackageId}`));
          }
          await db.delete(tradePositions).where(eq(tradePositions.userId, userId));
          await db.delete(customerPackageSubscriptions).where(eq(customerPackageSubscriptions.userId, userId));
          await db.delete(customerBalances).where(eq(customerBalances.userId, userId));
          await db.delete(users).where(eq(users.id, userId));
        }
        if (adminId !== undefined) {
          await db.delete(v5AuditEvents).where(eq(v5AuditEvents.actorUserId, adminId));
          await db.delete(users).where(eq(users.id, adminId));
        }
        if (secondPackageId !== undefined) {
          await db.delete(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName, packageName + "Plus"));
          await db.delete(packages).where(eq(packages.id, secondPackageId));
        }
        if (thirdPackageId !== undefined) {
          await db.delete(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName, packageName + "SelectC"));
          await db.delete(packages).where(eq(packages.id, thirdPackageId));
        }
        await db.delete(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName, packageName));
        if (packageId !== undefined) {
          await db.delete(packages).where(eq(packages.id, packageId));
        }
      } finally {
        if (rawConnection) await rawConnection.end();
        await closeDbPool();
      }
    }
  }
}
