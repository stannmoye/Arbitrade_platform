import assert from "node:assert/strict";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  adjustCustomerBalance,
  closeDbPool,
  getDb,
} from "../server/db";
import {
  adminWalletAdjustmentIdempotency,
  balanceLedger,
  currencyRegistry,
  customerBalances,
  customerNotifications,
  tradingTierQualificationJobs,
  users,
  v5AuditEvents,
} from "../drizzle/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL must target the disposable wallet-adjustment integration database.");
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ""));
if (!/(?:test|testing|integration|disposable)/i.test(databaseName)) {
  throw new Error(`Refusing to run wallet-adjustment integration against non-disposable database '${databaseName}'.`);
}

const db = await getDb();
if (!db) throw new Error("Wallet-adjustment integration requires the migrated disposable database.");
const database = db;
const pool = (db as any).$client;
const token = crypto.randomUUID().replace(/-/g, "");
const key = (name: string) => `wallet-idem:${token}:${name}`;
const openId = (name: string) => `wallet-idem-${token}-${name}`;
const testCurrencyCode = `Q${token.slice(0, 5).toUpperCase()}`;
const triggerName = `wallet_idem_rollback_${token}`;
const createdUserIds: number[] = [];
const createdFxReferences: string[] = [];
let adminId = 0;
let customerId = 0;
let otherCustomerId = 0;
let rollbackCustomerId = 0;
let fxCustomerId = 0;
let testCurrencyCreated = false;
let triggerCreated = false;

async function createUser(role: "admin" | "user", label: string): Promise<number> {
  const name = openId(label);
  const inserted = await database.insert(users).values({
    openId: name,
    name: `Wallet idempotency ${label}`,
    email: `${name}@example.invalid`,
    role,
    packageName: "Starter",
  });
  const id = Number(inserted[0].insertId);
  createdUserIds.push(id);
  return id;
}

async function rowsForUser(userId: number, entryType?: string) {
  return database.select().from(balanceLedger).where(entryType
    ? and(eq(balanceLedger.userId, userId), eq(balanceLedger.entryType, entryType))
    : eq(balanceLedger.userId, userId));
}

function withoutReplayFlag(value: any) {
  const { idempotentReplay: _idempotentReplay, ...response } = value;
  return response;
}

try {
  const usd = (await db.select().from(currencyRegistry).where(eq(currencyRegistry.code, "USD")).limit(1))[0];
  assert.ok(usd && usd.enabled && Number(usd.scale) === 2, "Disposable schema must have enabled USD at scale 2.");
  adminId = await createUser("admin", "admin");
  customerId = await createUser("user", "customer");
  otherCustomerId = await createUser("user", "other-customer");
  rollbackCustomerId = await createUser("user", "rollback-customer");
  fxCustomerId = await createUser("user", "fx-customer");

  // Same-key concurrent qualifying credits must serialize at the database's
  // unique key and return one committed response to both callers.
  const creditRequest = {
    userId: customerId,
    currency: "USD",
    amountMinor: 2375,
    mode: "credit" as const,
    creditClassification: "qualifying_deposit" as const,
    reason: "Concurrent wallet idempotency integration credit",
    idempotencyKey: key("concurrent-credit"),
  };
  const [first, concurrentReplay] = await Promise.all([
    adjustCustomerBalance(adminId, creditRequest),
    adjustCustomerBalance(adminId, creditRequest),
  ]);
  assert.equal(first.ledgerId, concurrentReplay.ledgerId);
  assert.equal(first.ledgerReference, concurrentReplay.ledgerReference);
  createdFxReferences.push(first.ledgerReference);
  assert.equal(first.newAvailableMinor, creditRequest.amountMinor);
  assert.equal(concurrentReplay.newAvailableMinor, first.newAvailableMinor);
  assert.ok(first.idempotentReplay !== concurrentReplay.idempotentReplay, "Exactly one concurrent caller should perform the original mutation.");
  assert.deepEqual(withoutReplayFlag(first), withoutReplayFlag(concurrentReplay));
  assert.ok(concurrentReplay.rateUpdatedAt instanceof Date, "An accepted replay must restore the committed FX timestamp as a Date.");

  const acceptedReplay = await adjustCustomerBalance(adminId, creditRequest);
  assert.equal(acceptedReplay.idempotentReplay, true);
  assert.deepEqual(withoutReplayFlag(acceptedReplay), withoutReplayFlag(first));
  for (const changed of [
    { ...creditRequest, amountMinor: creditRequest.amountMinor + 1 },
    { ...creditRequest, userId: otherCustomerId },
    { ...creditRequest, currency: "EUR" },
    { ...creditRequest, reason: "A different administrator operation" },
    { ...creditRequest, mode: "debit" as const, creditClassification: undefined, debitClassification: "ordinary_debit" as const },
  ]) {
    await assert.rejects(adjustCustomerBalance(adminId, changed), /already used for a different request/i);
  }

  const qualifyingLedger = await rowsForUser(customerId, "admin_manual_deposit_credit");
  assert.equal(qualifyingLedger.length, 1, "Concurrent and ambiguous-response retries must produce exactly one qualifying ledger row.");
  assert.equal(Number(qualifyingLedger[0].qualifyingDepositUsdMinor), creditRequest.amountMinor,
    "USD qualifying credits use exact 1:1 USD-minor attribution.");
  const qualificationJobs = await db.select().from(tradingTierQualificationJobs)
    .where(eq(tradingTierQualificationJobs.sourceLedgerId, first.ledgerId));
  assert.equal(qualificationJobs.length, 1, "The committed qualifying ledger entry must enqueue exactly one qualification job.");
  const wallet = (await db.select().from(customerBalances).where(and(
    eq(customerBalances.userId, customerId), eq(customerBalances.currency, "USD"),
  )).limit(1))[0];
  assert.equal(Number(wallet?.availableMinor), creditRequest.amountMinor);
  assert.equal(Number(wallet?.promotionalMinor), creditRequest.amountMinor);

  // Provider errors and stale API observations must not fall back to the
  // manually editable currency-registry rate or partially credit the wallet.
  await db.insert(currencyRegistry).values({
    code: testCurrencyCode,
    name: "Wallet Idempotency Integration Currency",
    symbol: "Q",
    scale: 2,
    assetType: "fiat",
    usdRate: "99",
    rateProvider: "manual",
    enabled: true,
  });
  testCurrencyCreated = true;
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response("provider unavailable", { status: 503 })) as typeof fetch;
    await assert.rejects(adjustCustomerBalance(adminId, {
      userId: fxCustomerId, currency: testCurrencyCode, amountMinor: 1000, mode: "credit",
      creditClassification: "qualifying_deposit", reason: "FX provider failure integration check", idempotencyKey: key("fx-provider-failure"),
    }), /No fresh supported fiat-to-USD API rate/i);

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://api.frankfurter.dev/")) {
        return new Response(JSON.stringify([{ base: "USD", quote: testCurrencyCode, rate: 2, date: "2020-01-01" }]),
          { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === "https://open.er-api.com/v6/latest/USD") {
        return new Response(JSON.stringify({ rates: { [testCurrencyCode]: 2 }, time_last_update_unix: 1577836800 }),
          { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected provider request ${url}`);
    }) as typeof fetch;
    await assert.rejects(adjustCustomerBalance(adminId, {
      userId: fxCustomerId, currency: testCurrencyCode, amountMinor: 1000, mode: "credit",
      creditClassification: "qualifying_deposit", reason: "Stale FX rate integration check", idempotencyKey: key("fx-stale-rate"),
    }), /No fresh supported fiat-to-USD API rate/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal((await rowsForUser(fxCustomerId)).length, 0, "Failed or stale provider rates must not create wallet ledger entries.");
  assert.equal((await db.select().from(customerBalances).where(eq(customerBalances.userId, fxCustomerId))).length, 0);
  assert.equal((await db.select().from(tradingTierQualificationJobs).where(eq(tradingTierQualificationJobs.userId, fxCustomerId))).length, 0);

  // Fail after wallet, ledger and qualification-job writes have begun. The audit
  // trigger forces an error at the end of the transaction; all financial rows
  // and the idempotency reservation must roll back together.
  await pool.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON v5_audit_events FOR EACH ROW
    BEGIN
      IF NEW.action='trading_qualifying_deposit_credited' AND NEW.reason='${key("force-rollback")}' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='forced wallet idempotency rollback';
      END IF;
    END`);
  triggerCreated = true;
  const rollbackRequest = {
    userId: rollbackCustomerId, currency: "USD", amountMinor: 4400, mode: "credit" as const,
    creditClassification: "qualifying_deposit" as const, reason: key("force-rollback"), idempotencyKey: key("transaction-rollback"),
  };
  await assert.rejects(adjustCustomerBalance(adminId, rollbackRequest), /forced wallet idempotency rollback/i);
  await pool.query(`DROP TRIGGER ${triggerName}`);
  triggerCreated = false;
  assert.equal((await rowsForUser(rollbackCustomerId)).length, 0, "Rollback must remove the ledger row.");
  assert.equal((await db.select().from(customerBalances).where(eq(customerBalances.userId, rollbackCustomerId))).length, 0,
    "Rollback must remove a wallet row created inside the transaction.");
  assert.equal((await db.select().from(tradingTierQualificationJobs).where(eq(tradingTierQualificationJobs.userId, rollbackCustomerId))).length, 0,
    "Rollback must remove the qualification outbox job.");
  assert.equal((await db.select().from(adminWalletAdjustmentIdempotency)
    .where(eq(adminWalletAdjustmentIdempotency.idempotencyKey, rollbackRequest.idempotencyKey))).length, 0,
    "Rollback must remove the key reservation and committed-response record.");

  const afterRollbackRetry = await adjustCustomerBalance(adminId, rollbackRequest);
  createdFxReferences.push(afterRollbackRetry.ledgerReference);
  assert.equal(afterRollbackRetry.idempotentReplay, false, "After rollback, the exact request key must be available for a successful retry.");
  assert.equal((await rowsForUser(rollbackCustomerId, "admin_manual_deposit_credit")).length, 1);
  assert.equal((await db.select().from(tradingTierQualificationJobs)
    .where(eq(tradingTierQualificationJobs.sourceLedgerId, afterRollbackRetry.ledgerId))).length, 1);

  console.log("Wallet adjustment integration passed: concurrent duplicate credits, ambiguous-response replay, key/payload mismatch, exact USD attribution, one qualification job, failed/stale FX rejection and transaction rollback.");
} finally {
  if (triggerCreated) await pool.query(`DROP TRIGGER IF EXISTS ${triggerName}`).catch(() => {});
  if (createdUserIds.length) {
    await db.delete(customerNotifications).where(eq(customerNotifications.userId, createdUserIds[0])).catch(() => {});
    for (const userId of createdUserIds) {
      await db.delete(tradingTierQualificationJobs).where(eq(tradingTierQualificationJobs.userId, userId)).catch(() => {});
      await db.delete(balanceLedger).where(eq(balanceLedger.userId, userId)).catch(() => {});
      await db.delete(customerBalances).where(eq(customerBalances.userId, userId)).catch(() => {});
      await db.delete(customerNotifications).where(eq(customerNotifications.userId, userId)).catch(() => {});
    }
    if (adminId) {
      await db.delete(adminWalletAdjustmentIdempotency).where(eq(adminWalletAdjustmentIdempotency.adminId, adminId)).catch(() => {});
      await db.delete(v5AuditEvents).where(eq(v5AuditEvents.actorUserId, adminId)).catch(() => {});
    }
    for (const userId of createdUserIds) await db.delete(users).where(eq(users.id, userId)).catch(() => {});
  }
  for (const reference of createdFxReferences) {
    await pool.query("DELETE FROM fx_rate_snapshots WHERE rawJson LIKE ?", [`%${reference}%`]).catch(() => {});
  }
  if (testCurrencyCreated) {
    await pool.query("DELETE FROM fx_rate_snapshots WHERE baseAsset=?", [testCurrencyCode]).catch(() => {});
    await db.delete(currencyRegistry).where(eq(currencyRegistry.code, testCurrencyCode)).catch(() => {});
  }
  await closeDbPool();
}
