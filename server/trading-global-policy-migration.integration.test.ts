import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { executeCompatibleMigrationSql } from "../scripts/mysql-compatible-migration-sql.mjs";

type SqlConnection = Awaited<ReturnType<typeof mysql.createConnection>>;

const rawTestDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";
const enabled = rawTestDatabaseUrl.length > 0;
let connection: SqlConnection | null = null;
let migrationSql = "";

function validateDisposableLoopbackUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid URL for a disposable local database; its value is not displayed.");
  }
  if (url.protocol === "mariadb:") url.protocol = "mysql:";
  if (url.protocol !== "mysql:") throw new Error("TEST_DATABASE_URL must use mysql:// or mariadb://.");
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!/(?:test|testing|integration|disposable)/i.test(databaseName)) {
    throw new Error("Refusing global-controls migration integration test: database name must identify a disposable test/integration database.");
  }
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname)) {
    throw new Error("Refusing global-controls migration integration test against a non-loopback database host.");
  }
  return url;
}

const legacyRow = (packageName: string, overrides: Partial<{
  enabled: number;
  automaticDelivery: number;
  companyRotationEnabled: number;
  randomizationEnabled: number;
  burstEnabled: number;
  requirePreviousSettlement: number;
}> = {}) => ({
  packageName,
  enabled: 1,
  automaticDelivery: 1,
  companyRotationEnabled: 1,
  randomizationEnabled: 1,
  burstEnabled: 1,
  requirePreviousSettlement: 1,
  ...overrides,
});

async function resetFixtures(rows: ReturnType<typeof legacyRow>[], canonicalValue?: string) {
  if (!connection) throw new Error("Migration test database connection is not ready.");
  await connection.query("TRUNCATE TABLE opportunity_package_policies");
  await connection.query("TRUNCATE TABLE app_settings");
  await connection.query("TRUNCATE TABLE v5_audit_events");
  for (const row of rows) {
    await connection.execute(
      `INSERT INTO opportunity_package_policies
        (packageName, enabled, automaticDelivery, companyRotationEnabled, randomizationEnabled, burstEnabled, requirePreviousSettlement)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [row.packageName, row.enabled, row.automaticDelivery, row.companyRotationEnabled, row.randomizationEnabled, row.burstEnabled, row.requirePreviousSettlement],
    );
  }
  if (canonicalValue !== undefined) {
    await connection.execute(
      "INSERT INTO app_settings (settingKey, settingValue, updatedBy) VALUES (?, ?, NULL)",
      ["trade.globalControls", canonicalValue],
    );
  }
}

async function applyGlobalControlsMigration() {
  if (!connection) throw new Error("Migration test database connection is not ready.");
  await executeCompatibleMigrationSql(connection, migrationSql);
}

async function readSetting(key: string): Promise<string | null> {
  if (!connection) throw new Error("Migration test database connection is not ready.");
  const [rows] = await connection.execute<mysql.RowDataPacket[]>(
    "SELECT settingValue FROM app_settings WHERE settingKey = ?",
    [key],
  );
  return rows[0]?.settingValue == null ? null : String(rows[0].settingValue);
}

async function readAuditCount(): Promise<number> {
  if (!connection) throw new Error("Migration test database connection is not ready.");
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM v5_audit_events WHERE reference = 'trade-global-controls-migration-0100'",
  );
  return Number(rows[0]?.count ?? 0);
}

const parseJson = (raw: string | null) => raw === null ? null : JSON.parse(raw) as Record<string, unknown>;

describe.skipIf(!enabled)("global Trade controls migration against disposable MySQL/MariaDB fixtures", () => {
  beforeAll(async () => {
    const url = validateDisposableLoopbackUrl(rawTestDatabaseUrl);
    connection = await mysql.createConnection({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
      timezone: "Z",
    });
    migrationSql = await readFile(new URL("../drizzle/0100_global_trade_master_controls.sql", import.meta.url), "utf8");

    // Temporary tables shadow any same-named database tables on this connection.
    // The integration fixture therefore cannot alter persistent application rows.
    await connection.query(`CREATE TEMPORARY TABLE app_settings (
      settingKey VARCHAR(191) NOT NULL PRIMARY KEY,
      settingValue LONGTEXT NOT NULL,
      updatedBy INT NULL
    )`);
    await connection.query(`CREATE TEMPORARY TABLE opportunity_package_policies (
      packageName VARCHAR(191) NOT NULL PRIMARY KEY,
      enabled TINYINT NOT NULL,
      automaticDelivery TINYINT NOT NULL,
      companyRotationEnabled TINYINT NOT NULL,
      randomizationEnabled TINYINT NOT NULL,
      burstEnabled TINYINT NOT NULL,
      requirePreviousSettlement TINYINT NOT NULL
    )`);
    await connection.query(`CREATE TEMPORARY TABLE v5_audit_events (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      actorUserId INT NULL,
      action VARCHAR(128) NOT NULL,
      entityType VARCHAR(128) NOT NULL,
      entityId VARCHAR(128) NOT NULL,
      reason VARCHAR(500) NOT NULL,
      reference VARCHAR(191) NOT NULL,
      metadataJson LONGTEXT NOT NULL,
      UNIQUE KEY uq_migration_reference (reference)
    )`);
  });

  afterAll(async () => {
    if (connection) {
      await connection.end();
      connection = null;
    }
  });

  it("keeps each migrated master OFF if any legacy package copy was OFF and records affected package names", async () => {
    await resetFixtures([
      legacyRow("Enabled Tier"),
      legacyRow("Paused Tier", { enabled: 0, automaticDelivery: 0, companyRotationEnabled: 0 }),
      legacyRow("Limited Tier", { randomizationEnabled: 0, burstEnabled: 0 }),
    ]);

    await applyGlobalControlsMigration();

    expect(parseJson(await readSetting("trade.globalControls"))).toEqual({
      tierPolicyMasterEnabled: false,
      informationalPopupDeliveryEnabled: false,
      companyRotationEnabled: false,
      randomizedTimingEnabled: false,
      burstDeliveryEnabled: false,
      requirePreviousSettlement: true,
      policyVersion: 1,
      updatedBy: null,
      updatedAt: null,
    });
    expect(parseJson(await readSetting("trade.globalControls.migrationDiagnostic"))).toMatchObject({
      migration: "0100_global_trade_master_controls",
      sourcePolicyCount: 3,
      tierPolicyDisabledPackages: ["Paused Tier"],
      deliveryDisabledPackages: ["Paused Tier"],
      companyRotationDisabledPackages: ["Paused Tier"],
      randomizationDisabledPackages: ["Limited Tier"],
      burstDisabledPackages: ["Limited Tier"],
      settlementGuardDisabledPackages: [],
      conflicts: {
        tierPolicyMasterEnabled: true,
        informationalPopupDeliveryEnabled: true,
        companyRotationEnabled: true,
        randomizedTimingEnabled: true,
        burstDeliveryEnabled: true,
        requirePreviousSettlement: false,
      },
    });
    const [sourceRows] = await connection!.query<mysql.RowDataPacket[]>("SELECT packageName, enabled, automaticDelivery, companyRotationEnabled, randomizationEnabled, burstEnabled, requirePreviousSettlement FROM opportunity_package_policies ORDER BY packageName");
    expect(sourceRows).toHaveLength(3);
    expect(sourceRows.find(row => row.packageName === "Paused Tier")).toMatchObject({ enabled: 0, automaticDelivery: 0, companyRotationEnabled: 0 });
    expect(await readAuditCount()).toBe(1);
  });

  it("fails closed when no legacy package rows exist", async () => {
    await resetFixtures([]);
    await applyGlobalControlsMigration();

    expect(parseJson(await readSetting("trade.globalControls"))).toMatchObject({
      tierPolicyMasterEnabled: false,
      informationalPopupDeliveryEnabled: false,
      companyRotationEnabled: false,
      randomizedTimingEnabled: false,
      burstDeliveryEnabled: false,
      requirePreviousSettlement: true,
      policyVersion: 1,
    });
    expect(parseJson(await readSetting("trade.globalControls.migrationDiagnostic"))).toMatchObject({
      sourcePolicyCount: 0,
      tierPolicyDisabledPackages: [],
      deliveryDisabledPackages: [],
      companyRotationDisabledPackages: [],
      randomizationDisabledPackages: [],
      burstDisabledPackages: [],
      settlementGuardDisabledPackages: [],
    });
  });

  it("keeps global masters ON when every legacy package copy is ON", async () => {
    await resetFixtures([legacyRow("Tier One"), legacyRow("Tier Two")]);
    await applyGlobalControlsMigration();

    expect(parseJson(await readSetting("trade.globalControls"))).toMatchObject({
      tierPolicyMasterEnabled: true,
      informationalPopupDeliveryEnabled: true,
      companyRotationEnabled: true,
      randomizedTimingEnabled: true,
      burstDeliveryEnabled: true,
      requirePreviousSettlement: true,
      policyVersion: 1,
    });
    expect(parseJson(await readSetting("trade.globalControls.migrationDiagnostic"))).toMatchObject({
      conflicts: {
        tierPolicyMasterEnabled: false,
        informationalPopupDeliveryEnabled: false,
        companyRotationEnabled: false,
        randomizedTimingEnabled: false,
        burstDeliveryEnabled: false,
        requirePreviousSettlement: false,
      },
    });
  });

  it("preserves an existing canonical setting row byte-for-byte, including malformed data", async () => {
    const validExistingValue = JSON.stringify({
      tierPolicyMasterEnabled: true,
      informationalPopupDeliveryEnabled: false,
      companyRotationEnabled: true,
      randomizedTimingEnabled: false,
      burstDeliveryEnabled: true,
      requirePreviousSettlement: true,
      policyVersion: 42,
      updatedBy: 7,
      updatedAt: "2026-11-03T00:00:00.000Z",
    });
    await resetFixtures([legacyRow("Legacy OFF", { automaticDelivery: 0 })], validExistingValue);
    await applyGlobalControlsMigration();

    expect(await readSetting("trade.globalControls")).toBe(validExistingValue);
    expect(parseJson(await readSetting("trade.globalControls.migrationDiagnostic"))).toMatchObject({
      sourcePolicyCount: 1,
      deliveryDisabledPackages: ["Legacy OFF"],
    });
    expect(await readAuditCount()).toBe(1);

    const invalidExistingValue = "{broken-existing-admin-policy";
    await resetFixtures([legacyRow("Legacy OFF", { automaticDelivery: 0 })], invalidExistingValue);

    await applyGlobalControlsMigration();

    expect(await readSetting("trade.globalControls")).toBe(invalidExistingValue);
    expect(parseJson(await readSetting("trade.globalControls.migrationDiagnostic"))).toMatchObject({
      sourcePolicyCount: 1,
      deliveryDisabledPackages: ["Legacy OFF"],
      conflicts: {
        tierPolicyMasterEnabled: false,
        informationalPopupDeliveryEnabled: false,
        companyRotationEnabled: false,
        randomizedTimingEnabled: false,
        burstDeliveryEnabled: false,
        requirePreviousSettlement: false,
      },
    });
    expect(await readAuditCount()).toBe(1);
  });

  it("is idempotent when replayed: values and migration audit reference are not duplicated", async () => {
    await resetFixtures([legacyRow("Paused", { enabled: 0, requirePreviousSettlement: 0 })]);

    await applyGlobalControlsMigration();
    const initialPolicy = await readSetting("trade.globalControls");
    const initialDiagnostic = await readSetting("trade.globalControls.migrationDiagnostic");
    await applyGlobalControlsMigration();

    expect(await readSetting("trade.globalControls")).toBe(initialPolicy);
    expect(await readSetting("trade.globalControls.migrationDiagnostic")).toBe(initialDiagnostic);
    expect(await readAuditCount()).toBe(1);
    expect(parseJson(initialDiagnostic)).toMatchObject({ settlementGuardDisabledPackages: ["Paused"] });
  });
});
