import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import crypto from "node:crypto";
import { appRouter } from "./routers";
import { closeDbPool, getDb, resetTradeOpportunityUsage } from "./db";

type SqlConnection = Awaited<ReturnType<typeof mysql.createConnection>>;
const rawDatabaseUrl = process.env.DATABASE_URL ?? "";
const enabled = rawDatabaseUrl.length > 0 && process.env.RUN_OPPORTUNITY_USAGE_RESET_DB_INTEGRATION === "1";
const token = `reset-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
let connection: SqlConnection | null = null;
let adminId = 0;
let customerCaller: ReturnType<typeof appRouter.createCaller>;
let adminCaller: ReturnType<typeof appRouter.createCaller>;
const userIds: number[] = [];
const packageIds: number[] = [];
const offerIds: number[] = [];
const subscriptionIds: number[] = [];
const policyNames: string[] = [];
const triggerName = `reset_fail_${token.replace(/[^a-zA-Z0-9]/g, "")}`;

function disposableUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol === "mariadb:") url.protocol = "mysql:";
  if (url.protocol !== "mysql:" || !new Set(["127.0.0.1", "localhost", "::1"]).has(url.hostname)) throw new Error("Reset integration requires a loopback MySQL/MariaDB URL.");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!/(test|testing|integration|disposable)/i.test(database)) throw new Error("Reset integration requires a disposable database name.");
  return { host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database };
}

async function query<T = any>(sql: string, values: any[] = []) {
  if (!connection) throw new Error("Reset integration database is not ready.");
  // Use the text protocol so DDL (notably CREATE/DROP TRIGGER) is supported by MySQL 8.4 and MariaDB 11.4.
  const [rows] = await connection.query<T[]>(sql, values);
  return rows;
}

async function insertUser(role: "admin" | "user" = "user") {
  const key = `${token}-${role}-${userIds.length}`;
  const result: any = await query("INSERT INTO users (openId,name,email,loginMethod,role) VALUES (?,?,?,?,?)", [key, `Reset ${role}`, `${key}@example.invalid`, "integration", role]);
  const id = Number(result.insertId);
  if (role === "user") userIds.push(id); else adminId = id;
  return id;
}

async function insertPackage(label: string) {
  const name = `${token}-${label}`;
  const result: any = await query("INSERT INTO packages (name,minimumQualifyingBalanceUsdMinor,durationMonths,opportunitiesPerDay,termsVersion,maxActiveInvestments,enabled) VALUES (?,?,?,?,?,?,?)", [name, 10000, 3, 7, 4, 3, 1]);
  const id = Number(result.insertId);
  packageIds.push(id);
  policyNames.push(name);
  await query("INSERT INTO opportunity_package_policies (packageName,minimumTradeUnits,maximumTradeUnits,minimumTradeDurationSeconds,maximumTradeDurationSeconds,minimumPayoutRateBps,maximumPayoutRateBps,companyRotationEnabled,enabled,automaticDelivery,maxPopupsPerDay,maxVisibleOffers) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [name, 100, 900, 120, 7200, 250, 850, 1, 1, 1, 9, 4]);
  return { id, name };
}

async function insertSubscription(userId: number, packageId: number, packageName: string) {
  const result: any = await query("INSERT INTO customer_package_subscriptions (userId,packageId,startsAt,expiresAt,status,activationKey,termsSnapshotJson,qualifyingBalanceUsdMinor,packageTermsVersion) VALUES (?,?,UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 DAY),'active',?,?,?,?)", [userId, packageId, `${token}-sub-${subscriptionIds.length}`, JSON.stringify({ opportunitiesPerDay: 7, maxActiveInvestments: 3, packageName }), 50000, 4]);
  const id = Number(result.insertId);
  subscriptionIds.push(id);
  return id;
}

async function insertOffer(userId: number, packageId: number, subscriptionId: number, status: "open" | "closed" = "open", suffix = "offer") {
  const now = new Date();
  const close = new Date(now.getTime() + 86_400_000);
  const generationKey = `${token}-${userId}-${suffix}-${offerIds.length}`;
  const result: any = await query("INSERT INTO opportunity_offers (assignedUserId,assignedPackageId,assignedPackageSubscriptionId,generationKey,companyReferenceId,companyDisplayName,configuredProfitRateBps,configuredDurationSeconds,packagePolicyVersionSnapshot,symbol,venueFrom,venueTo,currency,minimumMinor,expectedRewardBps,durationSeconds,opensAt,closesAt,rewardAt,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [userId, packageId, subscriptionId, generationKey, "RESET-CO", "Reset Fixture Company", 500, 3600, 4, "RESET", "fixture-a", "fixture-b", "USD", 1000, 500, 3600, now, close, close, status]);
  const id = Number(result.insertId);
  offerIds.push(id);
  await query("INSERT INTO opportunity_generation_assignments (generationKey,batchId,userId,offerId,packageId,packageSubscriptionId,packageName,packagePolicyVersion,companyReferenceId,configuredProfitRateBps,configuredDurationSeconds,packageSnapshotJson,status,expiresAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [generationKey, `${token}-batch`, userId, id, packageId, subscriptionId, policyNames[packageIds.indexOf(packageId)], 4, "RESET-CO", 500, 3600, JSON.stringify({ packageId, packageName: policyNames[packageIds.indexOf(packageId)], opportunitiesPerDay: 7 }), status === "open" ? "delivered" : "expired", status === "open" ? close : new Date(now.getTime() - 60_000)]);
  return id;
}

async function insertPopupAndDelivery(userId: number, offerId: number, packageId: number, deliveryStatus: "queued" | "rendered" = "queued", eventStatus = "DELIVERED") {
  const key = `${token}-popup-${offerId}`;
  await query("INSERT INTO opportunity_popup_events (eventKey,userId,offerId,quotaDay,packageId,packageName,symbol,currency,minimumMinor,expectedRewardBps,configuredProfitRateBps,configuredDurationSeconds,eventStatus,deliveryStatus,deliveryAttemptCount,executionStatus) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [key, userId, offerId, new Date().toISOString().slice(0, 10), packageId, policyNames[packageIds.indexOf(packageId)], "RESET", "USD", 1000, 500, 500, 3600, eventStatus, deliveryStatus, 1, "READY"]);
  const dispatchStatus = deliveryStatus === "rendered" ? "delivered" : "pending";
  await query("INSERT INTO opportunity_delivery_events (userId,offerId,quotaDay,status,attemptCount,policyVersion) VALUES (?,?,?, ?,1,4)", [userId, offerId, new Date().toISOString().slice(0, 10), dispatchStatus]);
}

async function snapshotProtectedData(userId: number) {
  return {
    balance: await query("SELECT currency,availableMinor,lockedMinor,promotionalMinor,earnedMinor FROM customer_balances WHERE userId=? ORDER BY id", [userId]),
    ledger: await query("SELECT currency,amountMinor,entryType,reference,withdrawable FROM balance_ledger WHERE userId=? ORDER BY id", [userId]),
    packages: await query("SELECT p.id,p.name,p.minimumQualifyingBalanceUsdMinor,p.durationMonths,p.opportunitiesPerDay,p.termsVersion,p.maxActiveInvestments,p.enabled,pol.packageName,pol.minimumTradeUnits,pol.maximumTradeUnits,pol.minimumTradeDurationSeconds,pol.maximumTradeDurationSeconds,pol.minimumPayoutRateBps,pol.maximumPayoutRateBps,pol.companyRotationEnabled,pol.enabled AS policyEnabled FROM packages p INNER JOIN opportunity_package_policies pol ON pol.packageName=p.name WHERE p.id IN (SELECT packageId FROM customer_package_subscriptions WHERE userId=?) ORDER BY p.id", [userId]),
    subscriptions: await query("SELECT packageId,status,termsSnapshotJson,qualifyingBalanceUsdMinor,packageTermsVersion FROM customer_package_subscriptions WHERE userId=? ORDER BY id", [userId]),
  };
}

describe.skipIf(!enabled)("Opportunity Usage Reset against disposable MySQL/MariaDB", () => {
  beforeAll(async () => {
    connection = await mysql.createConnection({ ...disposableUrl(rawDatabaseUrl), timezone: "Z" });
    const db = await getDb();
    if (!db) throw new Error("Database pool could not be opened.");
    adminId = await insertUser("admin");
    const customer = await insertUser();
    const secondCustomer = await insertUser();
    const packageOne = await insertPackage("One");
    const packageTwo = await insertPackage("Two");
    const subOne = await insertSubscription(customer, packageOne.id, packageOne.name);
    const subTwo = await insertSubscription(customer, packageTwo.id, packageTwo.name);
    await query("INSERT INTO customer_balances (userId,currency,availableMinor,lockedMinor,promotionalMinor,earnedMinor) VALUES (?,?,?,?,?,?)", [customer, "USD", 99999, 12, 3, 4]);
    await query("INSERT INTO balance_ledger (userId,currency,amountMinor,entryType,reference,withdrawable) VALUES (?,?,?,?,?,?)", [customer, "USD", 99999, "integration_fixture", `${token}-ledger`, 1]);
    const eligible = await insertOffer(customer, packageOne.id, subOne, "open", "eligible");
    await insertPopupAndDelivery(customer, eligible, packageOne.id, "queued");
    const protectedOffer = await insertOffer(customer, packageTwo.id, subTwo, "open", "protected");
    await insertPopupAndDelivery(customer, protectedOffer, packageTwo.id, "rendered", "TRADED");
    await query("INSERT INTO trade_positions (userId,offerId,packageSubscriptionId,currency,principalMinor,expectedRewardMinor,configuredProfitRateBps,configuredDurationSeconds,packagePolicyVersionSnapshot,status,confirmedAt,settlesAt,settlementStatus,packageIdSnapshot) VALUES (?,?,?,?,?,?,?,?,?,'confirmed',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY),'pending',?)", [customer, protectedOffer, subTwo, "USD", 1000, 50, 500, 3600, 4, packageTwo.id]);
    const expired = await insertOffer(customer, packageOne.id, subOne, "closed", "expired");
    await query("UPDATE opportunity_generation_assignments SET status='expired' WHERE offerId=?", [expired]);
    await insertPopupAndDelivery(customer, expired, packageOne.id, "queued");
    await query("INSERT INTO customer_balances (userId,currency,availableMinor,lockedMinor,promotionalMinor,earnedMinor) VALUES (?,?,?,?,?,?)", [secondCustomer, "USD", 1000, 0, 0, 0]);
    const secondSub = await insertSubscription(secondCustomer, packageOne.id, packageOne.name);
    const secondOffer = await insertOffer(secondCustomer, packageOne.id, secondSub, "open", "all-scope");
    await insertPopupAndDelivery(secondCustomer, secondOffer, packageOne.id, "queued");
    const admin = { id: adminId, role: "admin" } as any;
    const customerContext = { id: customer, role: "user" } as any;
    adminCaller = appRouter.createCaller({ user: admin } as never);
    customerCaller = appRouter.createCaller({ user: customerContext } as never);
  });

  afterAll(async () => {
    if (connection) {
      try { await query(`DROP TRIGGER IF EXISTS \`${triggerName}\``); } catch { /* preserve test failure */ }
      const placeholders = userIds.map(() => "?").join(",") || "NULL";
      await query(`DELETE FROM opportunity_delivery_events WHERE userId IN (${placeholders})`, userIds);
      await query(`DELETE FROM opportunity_delivery_idempotency WHERE userId IN (${placeholders})`, userIds);
      await query(`DELETE FROM opportunity_popup_events WHERE userId IN (${placeholders})`, userIds);
      await query(`DELETE FROM opportunity_generation_assignments WHERE userId IN (${placeholders})`, userIds);
      await query(`DELETE FROM trade_positions WHERE userId IN (${placeholders})`, userIds);
      await query(`DELETE FROM balance_ledger WHERE userId IN (${placeholders})`, userIds);
      await query(`DELETE FROM customer_balances WHERE userId IN (${placeholders})`, userIds);
      await query(`DELETE FROM customer_package_subscriptions WHERE userId IN (${placeholders})`, userIds);
      await query(`DELETE FROM v5_audit_events WHERE actorUserId=? OR entityType='opportunity_usage_reset'`, [adminId]);
      if (packageIds.length) await query(`DELETE FROM opportunity_package_policies WHERE packageName IN (${policyNames.map(() => "?").join(",")})`, policyNames);
      await query(`DELETE FROM packages WHERE id IN (${packageIds.map(() => "?").join(",") || "NULL"})`, packageIds);
      await query(`DELETE FROM users WHERE id IN (${[...userIds, adminId].map(() => "?").join(",") || "NULL"})`, [...userIds, adminId]);
      await connection.end();
      connection = null;
    }
    await closeDbPool();
  });

  it("enforces administrator authorization and validates the reset API", async () => {
    await expect(customerCaller.adminOperations.resetOpportunityUsage({ scope: "customer", customerId: userIds[0], reason: "Customer must not reset usage", operationId: crypto.randomUUID() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(adminCaller.adminOperations.resetOpportunityUsage({ scope: "customer", customerId: 999_999_999, reason: "Unknown customer should be rejected", operationId: crypto.randomUUID() })).rejects.toThrow("not a customer account");
  });

  it("resets an individual customer while preserving package, subscription, wallet, ledger, and active trade state", async () => {
    const customer = userIds[0];
    const before = await snapshotProtectedData(customer);
    const operationId = crypto.randomUUID();
    const summary = await adminCaller.adminOperations.resetOpportunityUsage({ scope: "customer", customerId: customer, reason: "Reset disposable customer usage", operationId });
    expect(summary).toMatchObject({ scope: "customer", customerCount: 1, withdrawnOpportunities: 2, clearedPendingDeliveries: 2, closedOffers: 1, cancelledAssignments: 1, preservedTradePositions: 1, protectedOpportunities: 1 });
    const after = await snapshotProtectedData(customer);
    expect(after).toEqual(before);
    expect((await query("SELECT status FROM opportunity_offers WHERE id=?", [offerIds[0]]) as any[])[0].status).toBe("closed");
    expect((await query("SELECT status,lastErrorCode FROM opportunity_delivery_events WHERE offerId=?", [offerIds[0]]) as any[])[0]).toMatchObject({ status: "expired", lastErrorCode: "ADMIN_OPPORTUNITY_USAGE_RESET" });
    expect((await query("SELECT status,lastErrorCode FROM opportunity_delivery_events WHERE offerId=?", [offerIds[2]]) as any[])[0]).toMatchObject({ status: "expired", lastErrorCode: "ADMIN_OPPORTUNITY_USAGE_RESET" });
    expect((await query("SELECT status FROM opportunity_offers WHERE id=?", [offerIds[1]]) as any[])[0].status).toBe("open");
    expect((await query("SELECT COUNT(*) AS count FROM v5_audit_events WHERE reference=?", [`trade-opportunity-usage-reset:${operationId}`]) as any[])[0].count).toBe(1);
    const replay = await adminCaller.adminOperations.resetOpportunityUsage({ scope: "customer", customerId: customer, reason: "Reset disposable customer usage", operationId });
    expect(replay.idempotentReplay).toBe(true);
  });

  it("resets all customers without skipping pending rows and remains idempotent under concurrent replay", async () => {
    const operationId = crypto.randomUUID();
    const [first, second] = await Promise.all([
      resetTradeOpportunityUsage({ scope: "all", reason: "Reset all disposable customer usage", operationId }, adminId),
      resetTradeOpportunityUsage({ scope: "all", reason: "Reset all disposable customer usage", operationId }, adminId),
    ]);
    expect([first.idempotentReplay, second.idempotentReplay].filter(Boolean)).toHaveLength(1);
    expect(first.customerCount).toBe(userIds.length);
    expect((await query("SELECT COUNT(*) AS count FROM opportunity_delivery_events WHERE userId IN (?,?) AND status='pending'", [userIds[0], userIds[1]]) as any[])[0].count).toBe(0);
    expect((await query("SELECT status FROM opportunity_offers WHERE id=?", [offerIds[3]]) as any[])[0].status).toBe("closed");
  });

  it("rolls back every change when a database failure occurs inside the transaction", async () => {
    const customer = userIds[1];
    const packageOne = packageIds[0];
    const sub = subscriptionIds[2];
    const offer = await insertOffer(customer, packageOne, sub, "open", "rollback");
    await insertPopupAndDelivery(customer, offer, packageOne, "queued");
    await query(`CREATE TRIGGER \`${triggerName}\` BEFORE UPDATE ON opportunity_offers FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='intentional reset rollback failure'`);
    await expect(resetTradeOpportunityUsage({ scope: "customer", customerId: customer, reason: "Verify atomic rollback behavior", operationId: crypto.randomUUID() }, adminId)).rejects.toThrow();
    await query(`DROP TRIGGER \`${triggerName}\``);
    expect((await query("SELECT status FROM opportunity_offers WHERE id=?", [offer]) as any[])[0].status).toBe("open");
    expect((await query("SELECT status FROM opportunity_delivery_events WHERE offerId=?", [offer]) as any[])[0].status).toBe("pending");
  });
});
