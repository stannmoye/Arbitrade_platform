import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { Server as HttpServer } from "node:http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { eq } from "drizzle-orm";
import { COOKIE_NAME } from "../shared/const";
import {
  adminWalletAdjustmentIdempotency,
  balanceLedger,
  currencyRegistry,
  customerBalances,
  customerNotifications,
  customerPackageSubscriptions,
  fxRateSnapshots,
  tradingTierQualificationJobs,
  users,
  v5AuditEvents,
} from "../drizzle/schema";
import { createContext } from "../server/_core/context";
import { createLocalSession } from "../server/_core/localAuth";
import { appRouter } from "../server/routers";
import { closeDbPool, getDb } from "../server/db";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Authenticated wallet API integration requires DATABASE_URL to target a disposable database.");
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\/+/,""));
if (!/(?:test|testing|integration|disposable)/i.test(databaseName)) {
  throw new Error("Refusing to run authenticated wallet API integration against non-disposable database '" + databaseName + "'.");
}

// The same signed, database-backed session helper and tRPC context are used by
// the production application. Only the external FX provider boundary is stubbed.
process.env.SESSION_SECRET = crypto.randomBytes(32).toString("hex");
if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run the authenticated wallet API integration in production mode.");
}

const db = await getDb();
if (!db) throw new Error("Authenticated wallet API integration requires the migrated disposable database.");
const token = crypto.randomUUID().replace(/-/g, "");
const key = (label: string) => "wallet-api:" + token + ":" + label;
const openId = (label: string) => "wallet-api-" + token + "-" + label;
const testCurrencyCode = ("Q" + token.slice(0, 5)).toUpperCase();
const createdUserIds: number[] = [];
let adminId = 0;
let customerId = 0;
let otherCustomerId = 0;
let testCurrencyCreated = false;
let apiServer: HttpServer | undefined;

async function createUser(role: "admin" | "user", label: string): Promise<number> {
  const identity = openId(label);
  const inserted = await db.insert(users).values({
    openId: identity,
    name: "Authenticated wallet API " + label,
    email: identity + "@example.invalid",
    role,
    packageName: "Starter",
  });
  const id = Number(inserted[0].insertId);
  createdUserIds.push(id);
  return id;
}

function sessionCookie(userId: number, authVersion: number): string {
  return COOKIE_NAME + "=" + createLocalSession(userId, authVersion);
}

type ProcedureResponse = {
  status: number;
  body: any;
  data?: any;
};

async function callMutation(path: string, input: unknown, cookie?: string): Promise<ProcedureResponse> {
  assert.ok(apiServer, "The authenticated API test server must be listening.");
  const address = apiServer.address();
  assert.ok(address && typeof address === "object", "The test API server must expose an ephemeral TCP port.");
  const response = await fetch("http://127.0.0.1:" + address.port + "/api/trpc/" + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ json: input }),
  });
  const body = await response.json();
  return { status: response.status, body, data: body?.result?.data?.json ?? body?.result?.data };
}

async function callQuery(path: string, input?: unknown, cookie?: string): Promise<ProcedureResponse> {
  assert.ok(apiServer, "The authenticated API test server must be listening.");
  const address = apiServer.address();
  assert.ok(address && typeof address === "object", "The test API server must expose an ephemeral TCP port.");
  const url = new URL("http://127.0.0.1:" + address.port + "/api/trpc/" + path);
  if (input !== undefined) url.searchParams.set("input", JSON.stringify({ json: input }));
  const response = await fetch(url, { headers: cookie ? { cookie } : {} });
  const body = await response.json();
  return { status: response.status, body, data: body?.result?.data?.json ?? body?.result?.data };
}

function trpcErrorCode(response: ProcedureResponse): string | undefined {
  return response.body?.error?.json?.data?.code
    ?? response.body?.error?.data?.code
    ?? response.body?.error?.code;
}

function trpcErrorMessage(response: ProcedureResponse): string {
  return String(response.body?.error?.json?.message ?? response.body?.error?.message ?? "");
}

try {
  adminId = await createUser("admin", "admin");
  customerId = await createUser("user", "customer");
  otherCustomerId = await createUser("user", "other-customer");

  await db.insert(currencyRegistry).values({
    code: testCurrencyCode,
    name: "Authenticated Wallet API Test Currency",
    symbol: "Q",
    scale: 2,
    assetType: "fiat",
    usdRate: "99",
    rateProvider: "manual",
    enabled: true,
  });
  testCurrencyCreated = true;

  const [adminRow] = await db.select({ authVersion: users.authVersion }).from(users)
    .where(eq(users.id, adminId)).limit(1);
  const [customerRow] = await db.select({ authVersion: users.authVersion }).from(users)
    .where(eq(users.id, customerId)).limit(1);
  const [otherCustomerRow] = await db.select({ authVersion: users.authVersion }).from(users)
    .where(eq(users.id, otherCustomerId)).limit(1);
  assert.ok(adminRow && customerRow && otherCustomerRow, "All integration identities must be persisted before authenticating.");

  const adminCookie = sessionCookie(adminId, Number(adminRow.authVersion));
  const customerCookie = sessionCookie(customerId, Number(customerRow.authVersion));
  const otherCustomerCookie = sessionCookie(otherCustomerId, Number(otherCustomerRow.authVersion));
  const staleCustomerCookie = sessionCookie(customerId, Number(customerRow.authVersion) + 1);

  // Mount the production appRouter and production createContext on the actual
  // Express tRPC HTTP adapter. Requests traverse signed-cookie validation,
  // database user lookup, role middleware, router input validation and DB services.
  const api = express();
  api.use(express.json());
  api.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  apiServer = await new Promise<HttpServer>((resolve, reject) => {
    const server = api.listen(0, "127.0.0.1", () => resolve(server));
    server.once("error", reject);
  });

  const anonymousBalanceRead = await callQuery("customer.balances");
  assert.equal(anonymousBalanceRead.status, 401, "Customer wallet APIs must reject requests without a signed session.");
  assert.equal(trpcErrorCode(anonymousBalanceRead), "UNAUTHORIZED");

  const staleSessionRead = await callQuery("customer.balances", undefined, staleCustomerCookie);
  assert.equal(staleSessionRead.status, 401, "A validly signed session with an obsolete authVersion must be rejected.");

  const deniedCustomerCredit = await callMutation("adminOperations.adjustCustomerBalance", {
    userId: customerId,
    currency: "USD",
    amountMinor: 100,
    mode: "credit",
    creditClassification: "qualifying_deposit",
    reason: "Customer role authorization regression",
    idempotencyKey: key("customer-forbidden"),
  }, customerCookie);
  assert.equal(deniedCustomerCredit.status, 403, "An authenticated customer must not invoke the administrator credit API.");
  assert.equal(trpcErrorCode(deniedCustomerCredit), "FORBIDDEN");

  const deniedCustomerLedgerRead = await callQuery("adminOperations.customerBalances", { userId: customerId }, customerCookie);
  assert.equal(deniedCustomerLedgerRead.status, 403, "A customer must not access the administrator's customer-wallet query.");
  assert.equal(trpcErrorCode(deniedCustomerLedgerRead), "FORBIDDEN");

  // Supply a deterministic fresh provider quote while leaving the database,
  // application router, session middleware and wallet/ledger transactions real.
  const fxSourceDate = new Date().toISOString().slice(0, 10);
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://api.frankfurter.dev/v2/rates?base=USD&quotes=")) {
      providerCalls += 1;
      return new Response(JSON.stringify([{
        base: "USD",
        quote: testCurrencyCode,
        rate: 2,
        date: fxSourceDate,
      }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  let qualifyingCredit: ProcedureResponse;
  let replayedCredit: ProcedureResponse;
  try {
    const creditInput = {
      userId: customerId,
      currency: testCurrencyCode,
      amountMinor: 10000,
      mode: "credit",
      creditClassification: "qualifying_deposit",
      reason: "Authenticated API integration qualifying administrator credit",
      idempotencyKey: key("qualifying-fx-credit"),
    };
    qualifyingCredit = await callMutation("adminOperations.adjustCustomerBalance", creditInput, adminCookie);
    assert.equal(qualifyingCredit.status, 200, "An authenticated administrator must be able to credit a customer through the real API.");
    assert.equal(qualifyingCredit.data?.success, true);
    assert.equal(qualifyingCredit.data?.entryType, "admin_manual_deposit_credit");
    assert.equal(Number(qualifyingCredit.data?.qualifyingDepositUsdMinor), 5000,
      "100 native units at USD 0.50 must produce an exact USD 50.00 qualification attribution.");
    assert.equal(qualifyingCredit.data?.qualifyingDepositRateProvider, "frankfurter-ecb");
    assert.equal(Number(qualifyingCredit.data?.rateUsd), 0.5);

    replayedCredit = await callMutation("adminOperations.adjustCustomerBalance", creditInput, adminCookie);
    assert.equal(replayedCredit.status, 200);
    assert.equal(replayedCredit.data?.idempotentReplay, true);
    assert.equal(replayedCredit.data?.ledgerId, qualifyingCredit.data?.ledgerId,
      "A matching authenticated API retry must return the original committed ledger record.");
    assert.equal(providerCalls, 1, "An idempotent replay must reuse persisted FX evidence without fetching a new quote.");

    const mismatchedReplay = await callMutation("adminOperations.adjustCustomerBalance", {
      ...creditInput,
      amountMinor: creditInput.amountMinor + 1,
    }, adminCookie);
    assert.notEqual(mismatchedReplay.status, 200, "A request key reused with a different payload must be rejected.");
    assert.match(trpcErrorMessage(mismatchedReplay), /already used for a different request/i);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const fxEvidenceRows = await db.select().from(fxRateSnapshots)
    .where(eq(fxRateSnapshots.baseAsset, testCurrencyCode));
  assert.equal(fxEvidenceRows.length, 1, "The API credit must persist one matching FX evidence snapshot.");
  assert.equal(fxEvidenceRows[0].quoteAsset, "USD");
  assert.equal(fxEvidenceRows[0].rate, "0.5");
  assert.equal(fxEvidenceRows[0].provider, "frankfurter-ecb");
  const fxEvidence = JSON.parse(String(fxEvidenceRows[0].rawJson));
  assert.equal(fxEvidence.sourceDate, fxSourceDate);
  assert.equal(fxEvidence.ledgerReference, qualifyingCredit!.data?.ledgerReference);
  assert.ok(String(fxEvidence.fetchedAt).includes("T"));

  const customerBalanceRead = await callQuery("customer.balances", undefined, customerCookie);
  assert.equal(customerBalanceRead.status, 200, "A valid customer session must read its own wallet through the customer API.");
  const customerWalletRows = customerBalanceRead.data?.balances ?? [];
  const nativeWallet = customerWalletRows.find((row: any) => row.currency === testCurrencyCode);
  assert.equal(Number(nativeWallet?.availableMinor), 10000);
  assert.equal(Number(nativeWallet?.promotionalMinor), 10000);

  const otherCustomerBalanceRead = await callQuery("customer.balances", undefined, otherCustomerCookie);
  assert.equal(otherCustomerBalanceRead.status, 200);
  assert.equal(
    (otherCustomerBalanceRead.data?.balances ?? []).some((row: any) => row.currency === testCurrencyCode),
    false,
    "A different authenticated customer must not see another customer's wallet rows.",
  );

  const adminCustomerBalances = await callQuery("adminOperations.customerBalances", { userId: customerId }, adminCookie);
  assert.equal(adminCustomerBalances.status, 200);
  assert.equal((adminCustomerBalances.data ?? []).some((row: any) => row.currency === testCurrencyCode), true,
    "The administrator's customer-wallet endpoint must expose the persisted wallet to the authorized administrator.");

  // An unrelated administrator credit is a real API mutation, but it must not
  // create qualifying USD attribution or enqueue a tier-qualification job.
  const nonQualifyingCredit = await callMutation("adminOperations.adjustCustomerBalance", {
    userId: customerId,
    currency: "USD",
    amountMinor: 2500,
    mode: "credit",
    creditClassification: "non_qualifying_credit",
    reason: "Authenticated API integration non-qualifying administrator credit",
    idempotencyKey: key("non-qualifying-credit"),
  }, adminCookie);
  assert.equal(nonQualifyingCredit.status, 200);
  assert.equal(nonQualifyingCredit.data?.entryType, "admin_credit");
  assert.equal(nonQualifyingCredit.data?.qualifyingDepositUsdMinor, null);

  const customerLedgerRows = await db.select().from(balanceLedger).where(eq(balanceLedger.userId, customerId));
  assert.equal(customerLedgerRows.length, 2, "One qualifying API credit and one unrelated credit must persist exactly two ledger rows.");
  const persistedQualifying = customerLedgerRows.find((row) => row.entryType === "admin_manual_deposit_credit");
  const persistedUnrelated = customerLedgerRows.find((row) => row.entryType === "admin_credit");
  assert.ok(persistedQualifying && persistedUnrelated);
  assert.equal(Number(persistedQualifying.amountMinor), 10000);
  assert.equal(persistedQualifying.currency, testCurrencyCode);
  assert.equal(Number(persistedQualifying.qualifyingDepositUsdMinor), 5000);
  assert.equal(persistedQualifying.qualifyingDepositRate, "0.5");
  assert.equal(persistedQualifying.qualifyingDepositRateProvider, "frankfurter-ecb");
  assert.ok(persistedQualifying.qualifyingDepositRateAt instanceof Date);
  assert.equal(persistedUnrelated.qualifyingDepositUsdMinor, null);
  assert.equal(persistedUnrelated.qualifyingDepositRate, null);
  assert.equal(persistedUnrelated.qualifyingDepositRateProvider, null);

  const idempotencyRows = await db.select().from(adminWalletAdjustmentIdempotency)
    .where(eq(adminWalletAdjustmentIdempotency.adminId, adminId));
  assert.equal(idempotencyRows.length, 2, "The two distinct API requests must retain two request-key records; replay must not add a third.");

  const qualificationJobs = await db.select().from(tradingTierQualificationJobs)
    .where(eq(tradingTierQualificationJobs.userId, customerId));
  assert.equal(qualificationJobs.length, 1, "Only the qualifying API credit may enqueue a tier-qualification job.");
  assert.equal(Number(qualificationJobs[0].sourceLedgerId), Number(persistedQualifying.id));

  console.log("Authenticated wallet API integration passed: signed database-backed sessions, stale-session rejection, customer/admin authorization, real tRPC wallet credit and balance reads, cross-customer isolation, FX attribution and snapshot persistence, request-key replay, mismatch rejection, unrelated-credit exclusion and qualification outbox uniqueness.");
} finally {
  if (apiServer) {
    await new Promise<void>((resolve, reject) => {
      apiServer!.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }).catch(() => {});
  }
  if (createdUserIds.length) {
    for (const userId of createdUserIds) {
      await db.delete(tradingTierQualificationJobs).where(eq(tradingTierQualificationJobs.userId, userId)).catch(() => {});
      await db.delete(customerPackageSubscriptions).where(eq(customerPackageSubscriptions.userId, userId)).catch(() => {});
      await db.delete(balanceLedger).where(eq(balanceLedger.userId, userId)).catch(() => {});
      await db.delete(customerBalances).where(eq(customerBalances.userId, userId)).catch(() => {});
      await db.delete(customerNotifications).where(eq(customerNotifications.userId, userId)).catch(() => {});
    }
    if (adminId) {
      await db.delete(adminWalletAdjustmentIdempotency).where(eq(adminWalletAdjustmentIdempotency.adminId, adminId)).catch(() => {});
      await db.delete(v5AuditEvents).where(eq(v5AuditEvents.actorUserId, adminId)).catch(() => {});
    }
    for (const userId of createdUserIds) {
      await db.delete(users).where(eq(users.id, userId)).catch(() => {});
    }
  }
  if (testCurrencyCreated) {
    await db.delete(fxRateSnapshots).where(eq(fxRateSnapshots.baseAsset, testCurrencyCode)).catch(() => {});
    await db.delete(currencyRegistry).where(eq(currencyRegistry.code, testCurrencyCode)).catch(() => {});
  }
  await closeDbPool();
}
