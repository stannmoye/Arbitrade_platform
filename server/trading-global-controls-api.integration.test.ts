import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { and, eq, inArray } from "drizzle-orm";
import { appSettings, users, v5AuditEvents } from "../drizzle/schema";
import { appRouter } from "./routers";
import { closeDbPool, getDb } from "./db";

const enabled = process.env.RUN_TRADE_GLOBAL_CONTROLS_DB_INTEGRATION === "1";
const rawDatabaseUrl = process.env.DATABASE_URL ?? "";
const triggerName = "test_trade_global_controls_reject_audit_insert";
const readBackTriggerName = "test_trade_global_controls_mutate_readback";

function parseDisposableLoopbackDatabaseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL must identify the loopback disposable integration database; its value is not displayed.");
  }
  if (url.protocol === "mariadb:") url.protocol = "mysql:";
  if (url.protocol !== "mysql:") throw new Error("DATABASE_URL must use mysql:// or mariadb://.");
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!/(?:test|testing|integration|disposable)/i.test(databaseName)) {
    throw new Error("Refusing global-control API integration against a database not identified as disposable.");
  }
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname)) {
    throw new Error("Refusing global-control API integration against a non-loopback database host.");
  }
  return url;
}

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type PolicyStatus = Awaited<ReturnType<typeof import("./db").getTradeGlobalControls>>;

let database: Database | null = null;
let maintenanceConnection: mysql.Connection | null = null;
let originalPolicyRow: { settingValue: string; updatedBy: number | null; updatedAt: Date } | null = null;
let adminId: number | null = null;
let customerId: number | null = null;
let adminCaller: ReturnType<typeof appRouter.createCaller> | null = null;
let customerCaller: ReturnType<typeof appRouter.createCaller> | null = null;

async function freshPolicy(): Promise<PolicyStatus> {
  if (!adminCaller) throw new Error("Global-control API fixtures are not ready.");
  return adminCaller.adminOperations.globalTradeControls();
}

async function auditRowsFor(actorId: number) {
  if (!database) throw new Error("Global-control API database fixture is not ready.");
  return database.select().from(v5AuditEvents).where(and(
    eq(v5AuditEvents.actorUserId, actorId),
    eq(v5AuditEvents.action, "trade_global_control_updated"),
    eq(v5AuditEvents.entityType, "trade_global_control_policy"),
  ));
}

describe.skipIf(!enabled)("global Trade controls API against a disposable database", () => {
  beforeAll(async () => {
    const url = parseDisposableLoopbackDatabaseUrl(rawDatabaseUrl);
    database = await getDb();
    if (!database) throw new Error("Database is not available for the global-control API integration.");
    maintenanceConnection = await mysql.createConnection({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
      timezone: "Z",
    });

    const [policyRows] = await database.select().from(appSettings).where(eq(appSettings.settingKey, "trade.globalControls")).limit(1);
    if (!policyRows) throw new Error("Migration 0100 must be applied to the disposable database before this integration test.");
    originalPolicyRow = {
      settingValue: policyRows.settingValue,
      updatedBy: policyRows.updatedBy,
      updatedAt: policyRows.updatedAt,
    };

    const unique = `trade-global-controls:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const [adminInsert] = await database.insert(users).values({
      openId: unique + ":admin",
      email: unique.replaceAll(":", "-") + "-admin@example.test",
      name: "Disposable global-controls administrator",
      loginMethod: "integration",
      role: "admin",
    });
    adminId = Number(adminInsert.insertId);
    const [customerInsert] = await database.insert(users).values({
      openId: unique + ":customer",
      email: unique.replaceAll(":", "-") + "-customer@example.test",
      name: "Disposable global-controls customer",
      loginMethod: "integration",
      role: "user",
    });
    customerId = Number(customerInsert.insertId);

    adminCaller = appRouter.createCaller({ user: { id: adminId, role: "admin" } } as never);
    customerCaller = appRouter.createCaller({ user: { id: customerId, role: "user" } } as never);
  });

  afterAll(async () => {
    if (maintenanceConnection) {
      try {
        await maintenanceConnection.query(`DROP TRIGGER IF EXISTS \`${triggerName}\``);
        await maintenanceConnection.query(`DROP TRIGGER IF EXISTS \`${readBackTriggerName}\``);
      } catch {
        // Preserve the original test failure; cleanup below still closes the connection.
      }
    }
    if (database) {
      if (originalPolicyRow) {
        await database.update(appSettings).set(originalPolicyRow).where(eq(appSettings.settingKey, "trade.globalControls"));
      }
      const fixtureIds = [adminId, customerId].filter((id): id is number => id !== null);
      if (fixtureIds.length) {
        await database.delete(v5AuditEvents).where(inArray(v5AuditEvents.actorUserId, fixtureIds));
        await database.delete(users).where(inArray(users.id, fixtureIds));
      }
    }
    if (maintenanceConnection) {
      await maintenanceConnection.end();
      maintenanceConnection = null;
    }
    await closeDbPool();
  });

  it("allows administrators to read while customers cannot query or mutate", async () => {
    if (!adminCaller || !customerCaller) throw new Error("Global-control callers are not ready.");
    const before = await adminCaller.adminOperations.globalTradeControls();
    expect(before.available).toBe(true);

    await expect(customerCaller.adminOperations.globalTradeControls()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(customerCaller.adminOperations.updateGlobalTradeControl({
      key: "burstDeliveryEnabled",
      enabled: !before.burstDeliveryEnabled,
      reason: "Customer must not edit global Trade policy",
      expectedPolicyVersion: before.policyVersion,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await freshPolicy()).toEqual(before);
    expect(await auditRowsFor(adminId!)).toHaveLength(0);
  });

  it("commits a versioned policy update and its actor/reason/old-new audit atomically", async () => {
    if (!adminCaller || adminId === null) throw new Error("Global-control administrator fixture is not ready.");
    const before = await freshPolicy();
    const desired = !before.burstDeliveryEnabled;
    const reason = "Disposable integration verifies audited global control save";
    const saved = await adminCaller.adminOperations.updateGlobalTradeControl({
      key: "burstDeliveryEnabled",
      enabled: desired,
      reason,
      expectedPolicyVersion: before.policyVersion,
    });

    expect(saved).toMatchObject({
      available: true,
      burstDeliveryEnabled: desired,
      policyVersion: before.policyVersion + 1,
      updatedBy: adminId,
    });
    expect(await freshPolicy()).toMatchObject({ burstDeliveryEnabled: desired, policyVersion: before.policyVersion + 1 });

    const rows = await auditRowsFor(adminId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: adminId,
      action: "trade_global_control_updated",
      entityType: "trade_global_control_policy",
      entityId: String(before.policyVersion + 1),
      reason,
      reference: `trade-global-controls:${before.policyVersion + 1}`,
    });
    expect(JSON.parse(String(rows[0].metadataJson))).toMatchObject({
      changedKey: "burstDeliveryEnabled",
      old: { burstDeliveryEnabled: before.burstDeliveryEnabled, policyVersion: before.policyVersion },
      new: { burstDeliveryEnabled: desired, policyVersion: before.policyVersion + 1, updatedBy: adminId },
    });
  });

  it("rejects a stale policy version without changing settings or adding an audit event", async () => {
    if (!adminCaller || adminId === null) throw new Error("Global-control administrator fixture is not ready.");
    const before = await freshPolicy();
    const attemptsBefore = await auditRowsFor(adminId);

    await expect(adminCaller.adminOperations.updateGlobalTradeControl({
      key: "burstDeliveryEnabled",
      enabled: !before.burstDeliveryEnabled,
      reason: "Stale version must not mutate policy",
      expectedPolicyVersion: before.policyVersion - 1,
    })).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await freshPolicy()).toEqual(before);
    expect(await auditRowsFor(adminId)).toHaveLength(attemptsBefore.length);
  });

  it("rolls back the policy update if its audit insert fails", async () => {
    if (!adminCaller || adminId === null || !maintenanceConnection) throw new Error("Global-control rollback fixture is not ready.");
    const before = await freshPolicy();
    const auditCountBefore = (await auditRowsFor(adminId)).length;
    await maintenanceConnection.query(`DROP TRIGGER IF EXISTS \`${triggerName}\``);
    await maintenanceConnection.query(
      `CREATE TRIGGER \`${triggerName}\` BEFORE INSERT ON \`v5_audit_events\` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced disposable audit failure'`,
    );

    try {
      await expect(adminCaller.adminOperations.updateGlobalTradeControl({
        key: "randomizedTimingEnabled",
        enabled: !before.randomizedTimingEnabled,
        reason: "Force transaction rollback on audit insert failure",
        expectedPolicyVersion: before.policyVersion,
      })).rejects.toBeDefined();
    } finally {
      await maintenanceConnection.query(`DROP TRIGGER IF EXISTS \`${triggerName}\``);
    }

    expect(await freshPolicy()).toEqual(before);
    expect(await auditRowsFor(adminId)).toHaveLength(auditCountBefore);
  });

  it("reports a read-back mismatch and recovers from the freshly observed policy version", async () => {
    if (!adminCaller || adminId === null || !maintenanceConnection) throw new Error("Global-control read-back fixture is not ready.");
    const before = await freshPolicy();
    const desired = !before.burstDeliveryEnabled;
    const auditsBefore = await auditRowsFor(adminId);
    await maintenanceConnection.query(`DROP TRIGGER IF EXISTS \`${readBackTriggerName}\``);
    await maintenanceConnection.query(
      `CREATE TRIGGER \`${readBackTriggerName}\` BEFORE UPDATE ON \`app_settings\` FOR EACH ROW BEGIN IF NEW.settingKey = 'trade.globalControls' THEN SET NEW.settingValue = IF(JSON_UNQUOTE(JSON_EXTRACT(NEW.settingValue, '$.burstDeliveryEnabled')) = 'true', REPLACE(NEW.settingValue, '"burstDeliveryEnabled":true', '"burstDeliveryEnabled":false'), REPLACE(NEW.settingValue, '"burstDeliveryEnabled":false', '"burstDeliveryEnabled":true')); END IF; END`,
    );

    try {
      await expect(adminCaller.adminOperations.updateGlobalTradeControl({
        key: "burstDeliveryEnabled",
        enabled: desired,
        reason: "Force fresh read-back mismatch in disposable fixture",
        expectedPolicyVersion: before.policyVersion,
      })).rejects.toThrow("Global Trade control save committed, but a fresh database read did not confirm every value and the new policy version");
    } finally {
      await maintenanceConnection.query(`DROP TRIGGER IF EXISTS \`${readBackTriggerName}\``);
    }

    const observedAfterMismatch = await freshPolicy();
    expect(observedAfterMismatch).toMatchObject({
      available: true,
      burstDeliveryEnabled: before.burstDeliveryEnabled,
      policyVersion: before.policyVersion + 1,
      updatedBy: adminId,
    });
    const auditsAfterMismatch = await auditRowsFor(adminId);
    expect(auditsAfterMismatch).toHaveLength(auditsBefore.length + 1);
    expect(auditsAfterMismatch.some(row => row.entityId === String(before.policyVersion + 1))).toBe(true);

    const recovered = await adminCaller.adminOperations.updateGlobalTradeControl({
      key: "burstDeliveryEnabled",
      enabled: desired,
      reason: "Recover global control after refreshing saved policy version",
      expectedPolicyVersion: observedAfterMismatch.policyVersion,
    });
    expect(recovered).toMatchObject({
      available: true,
      burstDeliveryEnabled: desired,
      policyVersion: before.policyVersion + 2,
      updatedBy: adminId,
    });
    expect(await freshPolicy()).toMatchObject({ burstDeliveryEnabled: desired, policyVersion: before.policyVersion + 2 });
    expect(await auditRowsFor(adminId)).toHaveLength(auditsBefore.length + 2);
  });
});
