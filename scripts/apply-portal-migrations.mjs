import { createHash } from "node:crypto";
import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyPortalMigrationRecord } from "./portal-migration-tracker.mjs";
import { executeCompatibleMigrationSql } from "./mysql-compatible-migration-sql.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Load the private application environment before running portal migrations.");
}

const migrationFiles = [
  "0033_kyc_v2.sql",
  "0034_email_notifications.sql",
  "0035_default_portal_accounts.sql",
  "0036_crypto_mining_portal.sql",
  "0037_coinki_token_configuration.sql",
  "0038_mining_admin_package_grants.sql",
  "0043_wallet_minor_units_bigint.sql",
  "0051_advanced_auto_trading.sql",
  "0052_delivery_diagnostics.sql",
  "0053_manual_settlement_lifecycle.sql",
  "0054_notification_event_idempotency.sql",
];
// These tables are also created by the main Drizzle migration chain before this
// portal-specific runner starts. Their presence alone therefore cannot prove that
// portal migrations were partially applied without a tracker.
const targetTables = [
  "kyc_settings", "kyc_profiles", "password_reset_tokens", "admin_email_messages",
  "mining_economics_versions", "mining_packages", "mining_customer_packages",
];
const baselineReviewed = process.argv.includes("--baseline-reviewed");
let url;
try {
  url = new URL(databaseUrl);
} catch {
  console.error("DATABASE_URL is malformed. Check private configuration; its value is not displayed.");
  process.exit(1);
}
if (!["mysql:", "mariadb:"].includes(url.protocol) || !url.pathname.replace(/^\/+/, "")) {
  console.error("DATABASE_URL must identify a MySQL/MariaDB database. No portal migrations were run.");
  process.exit(1);
}
if (url.protocol === "mariadb:") url.protocol = "mysql:";
url.searchParams.set("multipleStatements", "true");
url.searchParams.set("timezone", "Z");
let databaseName;
let databaseUser;
let databasePassword;
try {
  databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  databaseUser = decodeURIComponent(url.username);
  databasePassword = decodeURIComponent(url.password);
} catch {
  console.error("DATABASE_URL contains malformed database-name or credential encoding. The configured value is not displayed.");
  process.exit(1);
}
let connection;
try {
  connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: databaseUser,
    password: databasePassword,
    database: databaseName,
    ssl: url.searchParams.get("ssl") === "true" ? {} : undefined,
    // Portal migration files contain multiple trusted SQL statements; set the mysql2 option explicitly.
    multipleStatements: true,
    connectTimeout: 10000,
  });
} catch (error) {
  const errorCode = String(error?.code || "UNAVAILABLE").replace(/[^A-Z0-9_]/gi, "").slice(0, 40);
  console.error(`Could not connect to the configured portal database (code: ${errorCode || "UNAVAILABLE"}). Check private connection settings; credentials are not displayed.`);
  process.exit(1);
}

async function tableExists(tableName) {
  const [rows] = await connection.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1",
    [tableName],
  );
  return rows.length > 0;
}

async function getMigrationSql(filename) {
  return readFile(resolve(root, "drizzle", filename), "utf8");
}

function checksum(content) {
  return createHash("sha256").update(content).digest("hex");
}

try {
  const trackerExisted = await tableExists("portal_schema_migrations");
  if (!trackerExisted) {
    const [targetRows] = await connection.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (" +
        targetTables.map(() => "?").join(",") + ")",
      targetTables,
    );
    if (baselineReviewed && targetRows.length === 0) {
      throw new Error("--baseline-reviewed requires existing portal schema objects. For a fresh schema, omit this flag and let the tracked runner apply migrations.");
    }
    if (targetRows.length > 0 && !baselineReviewed) {
      throw new Error(
        "Existing portal schema objects were found but no per-file tracker exists. No migration SQL was run and no tracker table was created. " +
        "Review each migration against the actual schema and data, take a restorable backup, then rerun with " +
        "--baseline-reviewed only after confirming that every listed migration is already represented in this database. " +
        "Detected: " + targetRows.map((row) => row.table_name).join(", "),
      );
    }
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS portal_schema_migrations (
      migrationName VARCHAR(160) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL,
      startedAt TIMESTAMP NULL,
      appliedAt TIMESTAMP NULL,
      errorCode VARCHAR(80) NULL,
      detailsJson JSON NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX portal_schema_migrations_status_idx (status, updatedAt)
    ) ENGINE=InnoDB
  `);

  if (!trackerExisted) {
    if (baselineReviewed) {
      for (const filename of migrationFiles) {
        const sql = await getMigrationSql(filename);
        await connection.execute(
          "INSERT INTO portal_schema_migrations (migrationName,checksum,status,detailsJson) VALUES (?,?,?,?)",
          [filename, checksum(sql), "baseline_confirmed", JSON.stringify({ method: "operator-confirmed baseline", note: "The tool does not independently prove historical application." })],
        );
      }
      console.log("Recorded an operator-confirmed baseline for the listed portal migrations. No migration SQL was executed.");
      console.log("This is an administrative assertion, not automatic schema verification.");
      process.exitCode = 0;
      // Keep the connection cleanup in the finally block.
      throw Object.assign(new Error("BASELINE_RECORDED"), { baselineRecorded: true });
    }
  } else if (baselineReviewed) {
    throw new Error("--baseline-reviewed is only valid when portal_schema_migrations does not already exist. No changes to migration records were made.");
  }

  for (const filename of migrationFiles) {
    const sql = await getMigrationSql(filename);
    const fileChecksum = checksum(sql);
    const [rows] = await connection.execute(
      "SELECT checksum,status FROM portal_schema_migrations WHERE migrationName=?",
      [filename],
    );
    const record = rows[0];
    const classification = classifyPortalMigrationRecord(record, fileChecksum);
    if (classification.action === "skip") {
      console.log(`Skipping ${filename}: ${classification.reason}`);
      continue;
    }
    if (classification.action !== "run") {
      throw new Error(`${filename}: ${classification.reason} No SQL was executed for this migration. Inspect the database and migration file manually before recovery.`);
    }

    await connection.execute(
      "INSERT INTO portal_schema_migrations (migrationName,checksum,status,startedAt,detailsJson) VALUES (?,?,?,?,?)",
      [filename, fileChecksum, "started", new Date(), JSON.stringify({ runner: "scripts/apply-portal-migrations.mjs" })],
    );

    try {
      await executeCompatibleMigrationSql(connection, sql);
      if (filename === "0037_coinki_token_configuration.sql") {
        const { migrateMiningTokenToCki } = await import("./migrate-mining-token-to-cki.mjs");
        await migrateMiningTokenToCki(connection);
      }
      await connection.execute(
        "UPDATE portal_schema_migrations SET status='applied',appliedAt=?,errorCode=NULL WHERE migrationName=?",
        [new Date(), filename],
      );
      console.log(`Applied and recorded ${filename}`);
    } catch (error) {
      const errorCode = String(error?.code || "UNKNOWN").replace(/[^A-Z0-9_]/gi, "").slice(0, 80);
      await connection.execute(
        "UPDATE portal_schema_migrations SET status='failed',errorCode=? WHERE migrationName=?",
        [errorCode || "UNKNOWN", filename],
      ).catch(() => {});
      console.error(`Migration ${filename} failed (code: ${errorCode || "UNKNOWN"}).`);
      console.error("MySQL may have committed some DDL before the failure. This migration is marked failed and will not be automatically rerun.");
      throw new Error("Portal migration failed; use the sanitized migration code above and complete manual recovery review before retrying.");
    }
  }
} catch (error) {
  if (error?.baselineRecorded) {
    // Expected control flow after writing the explicit baseline.
  } else {
    const safeMessage = error && typeof error.message === "string" && !error.code
      ? error.message
      : "Portal migration runner stopped after an unexpected database or file error. Review the sanitized diagnostics above and complete manual recovery before retrying.";
    console.error(safeMessage);
    process.exitCode = 1;
  }
} finally {
  await connection.end();
}
