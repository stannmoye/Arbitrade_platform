import assert from "node:assert/strict";
import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { adjustCustomerBalance, claimAutoTradeCycleCustomers, getDb, runTradingTierQualificationWorkerCycle } from "../server/db";
import { requeueDeadQualificationJob } from "../server/_core/workerHealth";
import {
  appSettings,
  balanceLedger,
  customerBalances,
  currencyRegistry,
  customerPackageSubscriptions,
  packages,
  tradingTierQualificationJobs,
  fxRateSnapshots,
  users,
  v5AuditEvents,
} from "../drizzle/schema";

const db = await getDb();
if (!db) throw new Error("Worker integration requires DATABASE_URL to point to the disposable migrated database.");

const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
const userOpenId = "tier-worker-test-" + token;
const invalidUserOpenId = "tier-worker-invalid-test-" + token;
const creditPathUserOpenId = "tier-credit-path-test-" + token;
const adminOpenId = "tier-credit-path-admin-" + token;
const testCurrencyCode = ("T" + token.slice(0, 6)).toUpperCase();
const packageNames = ["100", "300", "500"].map((threshold) => "WorkerTest-" + token + "-" + threshold);
let userId;
let invalidUserId;
let creditPathUserId;
let adminId;
let testCurrencyId;
let tierIds = [];
const createdLedgerIds = [];
const createdJobIds = [];
let testPassed = false;

try {
  // Isolated database: turn off migration-seeded tiers so the expected cumulative
  // allowance comes only from the three tiers created by this test.
  await db.update(packages).set({ enabled: false });
  const userInsert = await db.insert(users).values({
    openId: userOpenId,
    name: "Qualification Worker Integration",
    email: userOpenId + "@example.invalid",
    role: "user",
    packageName: "Starter",
  });
  userId = Number(userInsert[0].insertId);

  const invalidUserInsert = await db.insert(users).values({
    openId: invalidUserOpenId,
    name: "Qualification Worker Retry Integration",
    email: invalidUserOpenId + "@example.invalid",
    role: "user",
    packageName: "Starter",
  });
  invalidUserId = Number(invalidUserInsert[0].insertId);

  const creditPathUserInsert = await db.insert(users).values({
    openId: creditPathUserOpenId,
    name: "Admin Credit Path Integration",
    email: creditPathUserOpenId + "@example.invalid",
    role: "user",
    packageName: "Starter",
  });
  creditPathUserId = Number(creditPathUserInsert[0].insertId);
  const adminInsert = await db.insert(users).values({
    openId: adminOpenId,
    name: "Admin Credit Path Integration Operator",
    email: adminOpenId + "@example.invalid",
    role: "admin",
    packageName: "Starter",
  });
  adminId = Number(adminInsert[0].insertId);

  const tierTerms = [
    { name: packageNames[0], minimumQualifyingBalanceUsdMinor: 10000, opportunitiesPerDay: 6 },
    { name: packageNames[1], minimumQualifyingBalanceUsdMinor: 30000, opportunitiesPerDay: 4 },
    { name: packageNames[2], minimumQualifyingBalanceUsdMinor: 50000, opportunitiesPerDay: 3 },
  ];
  for (const terms of tierTerms) {
    const inserted = await db.insert(packages).values({
      ...terms,
      durationMonths: 1,
      termsVersion: 1,
      enabled: true,
      maxPopupsPerDay: terms.opportunitiesPerDay,
      maxActiveInvestments: 0,
    });
    tierIds.push(Number(inserted[0].insertId));
  }

  // Exercise the actual admin wallet-credit service, not synthetic ledger rows.
  // USD uses the product-defined 1:1 rate and needs no external API dependency.
  const qualifyingCreditOne = await adjustCustomerBalance(adminId, {
    userId: creditPathUserId,
    currency: "USD",
    amountMinor: 20000,
    mode: "credit",
    creditClassification: "qualifying_deposit",
    reason: "integration test qualifying admin wallet credit",
  });
  assert.equal(qualifyingCreditOne.entryType, "admin_manual_deposit_credit");
  assert.equal(qualifyingCreditOne.qualifyingDepositUsdMinor, 20000);
  const nonQualifyingCredit = await adjustCustomerBalance(adminId, {
    userId: creditPathUserId,
    currency: "USD",
    amountMinor: 50000,
    mode: "credit",
    creditClassification: "non_qualifying_credit",
    reason: "integration test non-qualifying admin credit",
  });
  assert.equal(nonQualifyingCredit.entryType, "admin_credit");
  assert.equal(nonQualifyingCredit.qualifyingDepositUsdMinor, null);

  // Stub only the external HTTP boundary to prove the real credit path stores
  // a fresh API-derived non-USD conversion rather than the editable registry rate.
  const currencyInsert = await db.insert(currencyRegistry).values({
    code: testCurrencyCode,
    name: "Integration Test Currency",
    symbol: "T",
    scale: 2,
    assetType: "fiat",
    usdRate: "99",
    rateProvider: "manual",
    enabled: true,
  });
  testCurrencyId = Number(currencyInsert[0].insertId);
  const fxSourceDate = new Date().toISOString().slice(0, 10);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.startsWith("https://api.frankfurter.dev/v2/rates?base=USD&quotes=")) {
      throw new Error("Unexpected external request in FX integration test: " + url);
    }
    return new Response(JSON.stringify([{
      base: "USD",
      quote: testCurrencyCode,
      rate: 2,
      date: fxSourceDate,
    }]), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  let nonUsdQualifyingCredit;
  try {
    nonUsdQualifyingCredit = await adjustCustomerBalance(adminId, {
      userId: creditPathUserId,
      currency: testCurrencyCode,
      amountMinor: 10000,
      mode: "credit",
      creditClassification: "qualifying_deposit",
      reason: "integration test non-USD qualifying admin wallet credit",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(nonUsdQualifyingCredit.entryType, "admin_manual_deposit_credit");
  assert.equal(nonUsdQualifyingCredit.qualifyingDepositUsdMinor, 5000,
    "100 units at 0.5 USD per unit must be recorded as USD 50.00, not the manual registry rate.");
  assert.equal(nonUsdQualifyingCredit.qualifyingDepositRateProvider, "frankfurter-ecb");
  assert.equal(nonUsdQualifyingCredit.rateUsd, 0.5);
  const fxEvidence = await db.select().from(fxRateSnapshots)
    .where(eq(fxRateSnapshots.baseAsset, testCurrencyCode));
  assert.equal(fxEvidence.length, 1, "The credit-time API rate must also be persisted in the FX snapshot store.");
  assert.equal(fxEvidence[0].rate, "0.5");
  const fxRaw = JSON.parse(String(fxEvidence[0].rawJson));
  assert.equal(fxRaw.provider, "frankfurter-ecb");
  assert.equal(fxRaw.sourceDate, fxSourceDate, "The raw snapshot must preserve the fiat provider source date.");
  assert.ok(String(fxRaw.fetchedAt).includes("T"), "The raw snapshot must preserve the full API fetch timestamp.");

  const qualifyingReversal = await adjustCustomerBalance(adminId, {
    userId: creditPathUserId,
    currency: "USD",
    amountMinor: 5000,
    mode: "debit",
    debitClassification: "qualifying_deposit_reversal",
    reversalLedgerId: qualifyingCreditOne.ledgerId,
    reason: "integration test partial qualifying deposit reversal",
  });
  assert.equal(qualifyingReversal.entryType, "admin_manual_deposit_reversal");
  assert.equal(qualifyingReversal.qualifyingDepositUsdMinor, -5000);
  assert.equal(qualifyingReversal.qualifyingDepositReversalOfId, qualifyingCreditOne.ledgerId);

  await assert.rejects(
    adjustCustomerBalance(adminId, {
      userId: creditPathUserId,
      currency: "USD",
      amountMinor: 16000,
      mode: "debit",
      debitClassification: "qualifying_deposit_reversal",
      reversalLedgerId: qualifyingCreditOne.ledgerId,
      reason: "integration test over-reversal must be rejected",
    }),
    /reversal exceeds/i,
  );

  const creditPathLedger = await db.select().from(balanceLedger)
    .where(eq(balanceLedger.userId, creditPathUserId));
  assert.equal(creditPathLedger.length, 4);
  assert.equal(creditPathLedger.filter((row) => row.entryType === "admin_manual_deposit_credit").length, 2);
  assert.equal(creditPathLedger.filter((row) => row.entryType === "admin_credit").length, 1);
  assert.equal(creditPathLedger.filter((row) => row.entryType === "admin_manual_deposit_reversal").length, 1);
  const creditPathJobs = await db.select().from(tradingTierQualificationJobs)
    .where(eq(tradingTierQualificationJobs.userId, creditPathUserId));
  assert.equal(creditPathJobs.length, 3, "Only qualifying credits and valid reversals may enqueue qualification jobs.");
  assert.ok(creditPathJobs.some((row) => Number(row.sourceLedgerId) === qualifyingCreditOne.ledgerId));
  assert.ok(creditPathJobs.some((row) => Number(row.sourceLedgerId) === nonUsdQualifyingCredit.ledgerId));
  assert.ok(creditPathJobs.some((row) => Number(row.sourceLedgerId) === qualifyingReversal.ledgerId));
  assert.equal(creditPathJobs.every((row) => row.status === "pending"), true);
  await db.update(tradingTierQualificationJobs).set({
    availableAt: new Date(Date.now() - 10_000),
  }).where(eq(tradingTierQualificationJobs.userId, creditPathUserId));
  await runTradingTierQualificationWorkerCycle({ batchSize: 20 });
  const processedCreditPathJobs = await db.select().from(tradingTierQualificationJobs)
    .where(eq(tradingTierQualificationJobs.userId, creditPathUserId));
  assert.ok(processedCreditPathJobs.every((row) => row.status === "completed"));
  const creditPathSubscriptions = await db.select().from(customerPackageSubscriptions)
    .where(eq(customerPackageSubscriptions.userId, creditPathUserId));
  assert.ok(creditPathSubscriptions.some((row) => row.status === "active" && Number(row.packageId) === tierIds[0]));
  assert.ok(!creditPathSubscriptions.some((row) => row.status === "active" && Number(row.packageId) === tierIds[1]),
    "The non-qualifying USD 500 credit must not contribute to tier thresholds.");

  // Insert two qualifying ledger entries and their queue jobs atomically, as the
  // production credit path does. Their cumulative value is USD 300.00.
  await db.transaction(async (tx) => {
    for (const amount of [20000, 10000]) {
      const ledger = await tx.insert(balanceLedger).values({
        userId,
        currency: "USD",
        amountMinor: amount,
        qualifyingDepositUsdMinor: amount,
        qualifyingDepositRate: "1",
        qualifyingDepositRateProvider: "USD_FIXED_1_TO_1",
        qualifyingDepositRateAt: new Date(),
        entryType: "admin_manual_deposit_credit",
        reference: "worker-integration:" + token + ":" + amount,
        withdrawable: false,
      });
      const ledgerId = Number(ledger[0].insertId);
      createdLedgerIds.push(ledgerId);
      const job = await tx.insert(tradingTierQualificationJobs).values({
        userId,
        sourceLedgerId: ledgerId,
        status: "pending",
        attempts: 0,
        availableAt: new Date(Date.now() - 10_000),
      });
      createdJobIds.push(Number(job[0].insertId));
    }
  });

  // Multiple worker instances must not double-assign tiers for the same user.
  const initialCycles = await Promise.all([
    runTradingTierQualificationWorkerCycle({ batchSize: 20 }),
    runTradingTierQualificationWorkerCycle({ batchSize: 20 }),
  ]);
  let subscriptions = await db.select().from(customerPackageSubscriptions)
    .where(eq(customerPackageSubscriptions.userId, userId));
  let active = subscriptions.filter((row) => row.status === "active");
  if (active.length !== 2) {
    const queueRows = await db.select().from(tradingTierQualificationJobs).where(inArray(tradingTierQualificationJobs.id, createdJobIds));
    const creditRows = await db.select({ entryType: balanceLedger.entryType, amount: balanceLedger.qualifyingDepositUsdMinor }).from(balanceLedger).where(eq(balanceLedger.userId, userId));
    console.error("Worker integration diagnostics:", JSON.stringify({
      cycles: initialCycles,
      jobs: queueRows.map((row) => ({ id: row.id, status: row.status, attempts: row.attempts, lastError: row.lastError })),
      credits: creditRows,
      tierIds,
      subscriptions,
    }));
  }
  assert.equal(active.length, 2, "USD 300 must assign the USD 100 and USD 300 tiers exactly once.");
  assert.ok(active.every((row) => tierIds.slice(0, 2).includes(Number(row.packageId))));
  const activeQuota = active.reduce((sum, row) => {
    const terms = JSON.parse(String(row.termsSnapshotJson || "{}"));
    return sum + Number(terms.opportunitiesPerDay || 0);
  }, 0);
  assert.equal(activeQuota, 10, "Active qualifying tier quotas must accumulate to 6 + 4 = 10 per day.");
  assert.ok(!active.some((row) => Number(row.packageId) === tierIds[2]), "The USD 500 tier must remain unassigned.");

  // Normalize fixture start times into the past because MySQL TIMESTAMP columns
  // use second precision; the worker must not see a freshly inserted entitlement
  // as not-yet-started due only to fractional-second rounding.
  await db.update(customerPackageSubscriptions).set({
    startsAt: new Date(Date.now() - 60_000),
  }).where(and(
    inArray(customerPackageSubscriptions.userId, [userId, creditPathUserId]),
    eq(customerPackageSubscriptions.status, "active"),
  ));

  // Exercise the actual scheduler SQL against the migrated disposable MySQL
  // schema without executing trades or touching wallet balances.
  const firstOpportunityBatch = await claimAutoTradeCycleCustomers({ batchSize: 1 });
  const secondOpportunityBatch = await claimAutoTradeCycleCustomers({ batchSize: 1 });
  const endOfPassBatch = await claimAutoTradeCycleCustomers({ batchSize: 1 });
  const wrappedOpportunityBatch = await claimAutoTradeCycleCustomers({ batchSize: 1 });
  assert.equal(firstOpportunityBatch.customers.length, 1);
  assert.equal(secondOpportunityBatch.customers.length, 1);
  assert.equal(endOfPassBatch.customers.length, 0, "The end-of-pass tick must not immediately re-claim the first page.");
  assert.equal(wrappedOpportunityBatch.customers.length, 1);
  const scheduledUserIds = [
    Number(firstOpportunityBatch.customers[0].id),
    Number(secondOpportunityBatch.customers[0].id),
  ];
  assert.notEqual(scheduledUserIds[0], scheduledUserIds[1], "The locked cursor must advance to a different eligible customer.");
  assert.deepEqual(new Set(scheduledUserIds), new Set([userId, creditPathUserId]));
  assert.equal(Number(wrappedOpportunityBatch.customers[0].id), scheduledUserIds[0],
    "The next tick after cursor reset must restart at the first eligible customer.");

  const jobRows = await db.select().from(tradingTierQualificationJobs)
    .where(inArray(tradingTierQualificationJobs.id, createdJobIds));
  assert.ok(jobRows.length === 2 && jobRows.every((row) => row.status === "completed"));

  // A stale processing lease must be recovered by the real worker and completed.
  await db.transaction(async (tx) => {
    const ledger = await tx.insert(balanceLedger).values({
      userId,
      currency: "USD",
      amountMinor: 1000,
      qualifyingDepositUsdMinor: 1000,
      qualifyingDepositRate: "1",
      qualifyingDepositRateProvider: "USD_FIXED_1_TO_1",
      qualifyingDepositRateAt: new Date(),
      entryType: "admin_manual_deposit_credit",
      reference: "worker-integration:" + token + ":stale-lease",
      withdrawable: false,
    });
    const ledgerId = Number(ledger[0].insertId);
    createdLedgerIds.push(ledgerId);
    const job = await tx.insert(tradingTierQualificationJobs).values({
      userId,
      sourceLedgerId: ledgerId,
      status: "processing",
      attempts: 1,
      availableAt: new Date(Date.now() - 6 * 60_000),
      lockedAt: new Date(Date.now() - 6 * 60_000),
    });
    createdJobIds.push(Number(job[0].insertId));
  });
  await runTradingTierQualificationWorkerCycle({ batchSize: 20 });
  const staleJobId = createdJobIds[2];
  const staleJobRows = await db.select().from(tradingTierQualificationJobs)
    .where(eq(tradingTierQualificationJobs.id, staleJobId));
  assert.equal(staleJobRows[0]?.status, "completed", "The real worker must recover an expired lease.");

  // Force an invalid cumulative total to verify actual worker retry and dead-letter
  // transitions without affecting the primary user's eligibility.
  await db.transaction(async (tx) => {
    const ledger = await tx.insert(balanceLedger).values({
      userId: invalidUserId,
      currency: "USD",
      amountMinor: 1,
      qualifyingDepositUsdMinor: 9007199254740992,
      qualifyingDepositRate: "1",
      qualifyingDepositRateProvider: "USD_FIXED_1_TO_1",
      qualifyingDepositRateAt: new Date(),
      entryType: "admin_manual_deposit_credit",
      reference: "worker-integration:" + token + ":invalid-total",
      withdrawable: false,
    });
    const ledgerId = Number(ledger[0].insertId);
    createdLedgerIds.push(ledgerId);
    const job = await tx.insert(tradingTierQualificationJobs).values({
      userId: invalidUserId,
      sourceLedgerId: ledgerId,
      status: "pending",
      attempts: 0,
      availableAt: new Date(Date.now() - 10_000),
    });
    createdJobIds.push(Number(job[0].insertId));
  });
  const invalidJobId = createdJobIds[3];
  await runTradingTierQualificationWorkerCycle({ batchSize: 20 });
  let invalidRows = await db.select().from(tradingTierQualificationJobs)
    .where(eq(tradingTierQualificationJobs.id, invalidJobId));
  assert.equal(invalidRows[0]?.status, "pending", "A transient worker failure must be retried.");
  assert.equal(Number(invalidRows[0]?.attempts), 1);

  await db.update(tradingTierQualificationJobs).set({
    attempts: 7,
    availableAt: new Date(Date.now() - 1000),
    status: "pending",
    lockedAt: null,
  }).where(eq(tradingTierQualificationJobs.id, invalidJobId));
  await runTradingTierQualificationWorkerCycle({ batchSize: 20 });
  invalidRows = await db.select().from(tradingTierQualificationJobs)
    .where(eq(tradingTierQualificationJobs.id, invalidJobId));
  assert.equal(invalidRows[0]?.status, "dead", "The eighth failed attempt must be dead-lettered.");
  assert.equal(Number(invalidRows[0]?.attempts), 8);

  // Exercise the guarded operator retry against a valid dead-lettered ledger job.
  // This job previously completed; making it dead in the disposable fixture simulates a
  // terminal failure after a server restart. Reprocessing must remain idempotent.
  const retryCandidateJobId = createdJobIds[0];
  await db.update(tradingTierQualificationJobs).set({
    status: "dead",
    attempts: 8,
    lockedAt: null,
    lastError: "simulated terminal worker failure",
  }).where(eq(tradingTierQualificationJobs.id, retryCandidateJobId));
  const retryCandidateRows = await db.select().from(tradingTierQualificationJobs)
    .where(eq(tradingTierQualificationJobs.id, retryCandidateJobId));
  assert.equal(retryCandidateRows[0]?.status, "dead");

  // The invalid USD-minor attribution job must remain dead even after an admin asks
  // for a retry; authorization does not bypass source-ledger validation.
  await assert.rejects(
    requeueDeadQualificationJob({ jobId: invalidJobId, adminId, reason: "Reject invalid attribution" }),
    /attribution/i,
  );
  const requeued = await requeueDeadQualificationJob({
    jobId: retryCandidateJobId,
    adminId,
    reason: "Integration test verified recovery",
  });
  assert.equal(requeued.success, true);
  assert.equal(requeued.status, "pending");
  assert.equal(requeued.jobId, retryCandidateJobId);
  const queuedAgainRows = await db.select().from(tradingTierQualificationJobs)
    .where(eq(tradingTierQualificationJobs.id, retryCandidateJobId));
  assert.equal(queuedAgainRows[0]?.status, "pending");
  assert.equal(Number(queuedAgainRows[0]?.attempts), 0);
  assert.equal(queuedAgainRows[0]?.lockedAt, null);

  const recoveryAudit = await db.select().from(v5AuditEvents).where(and(
    eq(v5AuditEvents.actorUserId, adminId),
    eq(v5AuditEvents.action, "trading_tier_qualification_job.requeued"),
    eq(v5AuditEvents.entityId, String(retryCandidateJobId)),
  ));
  assert.equal(recoveryAudit.length, 1, "A job requeue must be audited in the same transaction.");
  const recoveryMetadata = JSON.parse(String(recoveryAudit[0].metadataJson));
  assert.equal(recoveryMetadata.previousAttempts, 8);
  assert.equal(recoveryMetadata.sourceLedgerId, Number(queuedAgainRows[0]?.sourceLedgerId));

  // The production requeue timestamp is intentionally current-time. Normalize it
  // into the past in this disposable test so MySQL second-precision comparisons
  // cannot make the immediate test cycle miss a newly requeued job.
  await db.update(tradingTierQualificationJobs).set({
    availableAt: new Date(Date.now() - 10_000),
  }).where(eq(tradingTierQualificationJobs.id, retryCandidateJobId));

  await runTradingTierQualificationWorkerCycle({ batchSize: 20 });
  const processedAgainRows = await db.select().from(tradingTierQualificationJobs)
    .where(eq(tradingTierQualificationJobs.id, retryCandidateJobId));
  assert.equal(processedAgainRows[0]?.status, "completed", "A verified requeue must return to the normal worker.");
  const retryActiveSubscriptions = await db.select().from(customerPackageSubscriptions)
    .where(eq(customerPackageSubscriptions.userId, userId));
  assert.equal(retryActiveSubscriptions.filter((row) => row.status === "active").length, 2,
    "Retrying a previously completed qualifying event must not duplicate tier entitlements.");

  // An audited qualifying-deposit reversal drops the cumulative total to USD 210,
  // expiring the USD 300 tier while retaining the USD 100 tier.
  await db.transaction(async (tx) => {
    const ledger = await tx.insert(balanceLedger).values({
      userId,
      currency: "USD",
      amountMinor: -10000,
      qualifyingDepositUsdMinor: -10000,
      qualifyingDepositRate: "1",
      qualifyingDepositRateProvider: "USD_FIXED_1_TO_1",
      qualifyingDepositRateAt: new Date(),
      qualifyingDepositReversalOfId: createdLedgerIds[0],
      entryType: "admin_manual_deposit_reversal",
      reference: "worker-integration:" + token + ":reversal",
      withdrawable: false,
    });
    const ledgerId = Number(ledger[0].insertId);
    createdLedgerIds.push(ledgerId);
    const job = await tx.insert(tradingTierQualificationJobs).values({
      userId,
      sourceLedgerId: ledgerId,
      status: "pending",
      attempts: 0,
      availableAt: new Date(Date.now() - 10_000),
    });
    createdJobIds.push(Number(job[0].insertId));
  });
  await runTradingTierQualificationWorkerCycle({ batchSize: 20 });
  subscriptions = await db.select().from(customerPackageSubscriptions)
    .where(eq(customerPackageSubscriptions.userId, userId));
  active = subscriptions.filter((row) => row.status === "active");
  const expired = subscriptions.filter((row) => row.status === "expired");
  assert.equal(active.length, 1, "After reversal, only the USD 100 tier should remain active.");
  assert.equal(Number(active[0].packageId), tierIds[0]);
  assert.ok(expired.some((row) => Number(row.packageId) === tierIds[1]), "The USD 300 tier should be revoked below its threshold.");
  const remainingQuota = active.reduce((sum, row) => {
    const terms = JSON.parse(String(row.termsSnapshotJson || "{}"));
    return sum + Number(terms.opportunitiesPerDay || 0);
  }, 0);
  assert.equal(remainingQuota, 6);

  const allJobs = await db.select().from(tradingTierQualificationJobs)
    .where(inArray(tradingTierQualificationJobs.id, createdJobIds));
  assert.ok(allJobs.some((row) => row.status === "dead"));
  assert.ok(allJobs.filter((row) => row.userId === userId).every((row) => ["completed", "dead"].includes(row.status)));

  testPassed = true;
  console.log("Trading qualification worker integration passed: concurrent tier assignment, bounded scheduler cursor rotation, cumulative quotas, audited safe retry, invalid-source retry rejection, reversal revocation, stale-lease recovery, automatic retries, and dead-letter persistence.");
} finally {
  // Keep the disposable database clean even if an assertion fails.
  await db.delete(appSettings).where(eq(appSettings.settingKey, "trade.autoTradeCycle.lastUserId")).catch(() => {});
  if (userId) {
    await db.delete(tradingTierQualificationJobs).where(eq(tradingTierQualificationJobs.userId, userId)).catch(() => {});
    await db.delete(balanceLedger).where(eq(balanceLedger.userId, userId)).catch(() => {});
    await db.delete(customerPackageSubscriptions).where(eq(customerPackageSubscriptions.userId, userId)).catch(() => {});
    await db.delete(users).where(eq(users.id, userId)).catch(() => {});
  }
  if (invalidUserId) {
    await db.delete(tradingTierQualificationJobs).where(eq(tradingTierQualificationJobs.userId, invalidUserId)).catch(() => {});
    await db.delete(balanceLedger).where(eq(balanceLedger.userId, invalidUserId)).catch(() => {});
    await db.delete(users).where(eq(users.id, invalidUserId)).catch(() => {});
  }
  if (creditPathUserId) {
    await db.delete(tradingTierQualificationJobs).where(eq(tradingTierQualificationJobs.userId, creditPathUserId)).catch(() => {});
    await db.delete(balanceLedger).where(eq(balanceLedger.userId, creditPathUserId)).catch(() => {});
    await db.delete(customerBalances).where(eq(customerBalances.userId, creditPathUserId)).catch(() => {});
    await db.delete(customerPackageSubscriptions).where(eq(customerPackageSubscriptions.userId, creditPathUserId)).catch(() => {});
    await db.delete(users).where(eq(users.id, creditPathUserId)).catch(() => {});
  }
  if (testCurrencyId) {
    await db.delete(fxRateSnapshots).where(eq(fxRateSnapshots.baseAsset, testCurrencyCode)).catch(() => {});
    await db.delete(currencyRegistry).where(eq(currencyRegistry.id, testCurrencyId)).catch(() => {});
  }
  if (adminId) {
    await db.delete(v5AuditEvents).where(eq(v5AuditEvents.actorUserId, adminId)).catch(() => {});
    await db.delete(users).where(eq(users.id, adminId)).catch(() => {});
  }
  if (tierIds.length) {
    await db.delete(packages).where(inArray(packages.id, tierIds)).catch(() => {});
  }
  if (testPassed) process.exit(0);
}
