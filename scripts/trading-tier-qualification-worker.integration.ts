import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb, runTradingTierQualificationWorkerCycle } from "../server/db";
import {
  balanceLedger,
  customerPackageSubscriptions,
  packages,
  tradingTierQualificationJobs,
  users,
} from "../drizzle/schema";

const db = await getDb();
if (!db) throw new Error("Worker integration requires DATABASE_URL to point to the disposable migrated database.");

const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
const userOpenId = "tier-worker-test-" + token;
const invalidUserOpenId = "tier-worker-invalid-test-" + token;
const packageNames = ["100", "300", "500"].map((threshold) => "WorkerTest-" + token + "-" + threshold);
let userId;
let invalidUserId;
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
        availableAt: new Date(),
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
      availableAt: new Date(),
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
      availableAt: new Date(),
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
  console.log("Trading qualification worker integration passed: concurrent real-worker tier assignment, cumulative quotas, reversal revocation, stale-lease recovery, bounded retries, and dead-letter persistence.");
} finally {
  // Keep the disposable database clean even if an assertion fails.
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
  if (tierIds.length) {
    await db.delete(packages).where(inArray(packages.id, tierIds)).catch(() => {});
  }
  if (testPassed) process.exit(0);
}
