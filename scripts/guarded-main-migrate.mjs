import { createHash } from "node:crypto";
import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { executeCompatibleMigrationSql } from "./mysql-compatible-migration-sql.mjs";
import { classifyMainMigrationPreflight, loadExpectedMainMigrationHistory, validateMainMigrationHistory } from "../installer/main-migration-preflight.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.DATABASE_URL;
const lockName = "arbitrade-main-migrations";
const guardTable = "main_migration_run_guard";

function safeCode(error, fallback = "UNKNOWN") {
  return String(error?.code || fallback).replace(/[^A-Z0-9_]/gi, "").slice(0, 80) || fallback;
}

function parseDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL is malformed; its value is not displayed.");
  }
  if (!["mysql:", "mariadb:"].includes(url.protocol) || !url.pathname.replace(/^\/+/, "")) {
    throw new Error("DATABASE_URL must identify a MySQL/MariaDB database.");
  }
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\/+/, "")),
    ssl: url.searchParams.get("ssl") === "true" ? {} : undefined,
    connectTimeout: 10000,
    multipleStatements: true,
  };
}

async function main() {
  if (!databaseUrl) {
    console.error("[main-migrate] ERROR: DATABASE_URL is required.");
    process.exitCode = 1;
    return;
  }

  let connection;
  let lockAcquired = false;
  let runStarted = false;
  try {
    connection = await mysql.createConnection(parseDatabaseUrl(databaseUrl));

    // Verify repository journal and imported tracker before creating guard tables or running DDL.
    const expectedHistory = await loadExpectedMainMigrationHistory(root);
    const [tableRows] = await connection.query(
      "SELECT COUNT(*) AS tableCount FROM information_schema.tables WHERE table_schema=DATABASE()",
    );
    const tableCount = Number(tableRows[0]?.tableCount);
    const [trackerTableRows] = await connection.query(
      "SELECT COUNT(*) AS tableCount FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='__drizzle_migrations'",
    );
    const trackerExists = Number(trackerTableRows[0]?.tableCount) === 1;
    let trackerRows = [];
    let trackerHistoryValid = false;
    if (trackerExists) {
      const [rows] = await connection.query("SELECT hash, created_at FROM __drizzle_migrations");
      trackerRows = rows;
      trackerHistoryValid = validateMainMigrationHistory(trackerRows, expectedHistory.migrations).allowed;
    }
    const trackerCount = trackerRows.length;
    const preflight = classifyMainMigrationPreflight({
      mode: tableCount === 0 ? "fresh" : "existing",
      tableCount,
      trackerExists,
      trackerCount,
      trackerHistoryValid,
    });
    if (!preflight.allowed) {
      console.error("[main-migrate] ERROR: " + preflight.reason + " No migrations were run. Back up and review the database, then establish a verified baseline before retrying.");
      process.exitCode = 1;
      return;
    }
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`${guardTable}\` (
        id TINYINT NOT NULL PRIMARY KEY,
        status VARCHAR(16) NOT NULL,
        startedAt TIMESTAMP NULL,
        finishedAt TIMESTAMP NULL,
        failureCode VARCHAR(80) NULL,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    const [lockRows] = await connection.execute("SELECT GET_LOCK(?, 0) AS acquired", [lockName]);
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) {
      console.error("[main-migrate] ERROR: Another main migration run is already active. No migration SQL was executed.");
      process.exitCode = 1;
      return;
    }

    const [guardRows] = await connection.execute(
      `SELECT status FROM \`${guardTable}\` WHERE id=1 FOR UPDATE`,
    );
    const previousStatus = guardRows[0]?.status;
    if (previousStatus === "failed" || previousStatus === "running") {
      console.error("[main-migrate] ERROR: Automatic retry is blocked because the previous main migration run is " + previousStatus + ". Inspect migration state and approve a recovery plan before retrying.");
      process.exitCode = 1;
      return;
    }

    if (guardRows.length) {
      await connection.execute(
        `UPDATE \`${guardTable}\` SET status='running',startedAt=CURRENT_TIMESTAMP,finishedAt=NULL,failureCode=NULL WHERE id=1`,
      );
    } else {
      await connection.execute(
        `INSERT INTO \`${guardTable}\` (id,status,startedAt) VALUES (1,'running',CURRENT_TIMESTAMP)`,
      );
    }
    runStarted = true;

    const journal = expectedHistory.journal;
    if (!Array.isArray(journal.entries)) throw new Error("Drizzle migration journal has no entries array.");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT
      )
    `);
    const [appliedRows] = await connection.query("SELECT hash, created_at FROM __drizzle_migrations");
    if (tableCount > 0 && !validateMainMigrationHistory(appliedRows, expectedHistory.migrations).allowed) {
      throw new Error("The imported Drizzle migration history changed or became invalid while acquiring the migration lock.");
    }
    const appliedHashes = new Set(appliedRows.map(row => String(row.hash)));
    const hasExistingHistory = appliedRows.length > 0;
    const latestRecordedTimestamp = hasExistingHistory
      ? Math.max(...appliedRows.map(row => Number(row.created_at) || 0))
      : -1;
    let appliedCount = 0;

    // The journal contains historical timestamps that are not strictly increasing.
    // On a fresh database, apply every journal entry in file order. For a database
    // with existing history, refuse to backfill an older missing migration after a
    // newer one has been recorded; that recovery requires an explicit schema review.
    for (const entry of journal.entries) {
      const migrationTimestamp = Number(entry.when);
      if (!Number.isFinite(migrationTimestamp) || !entry.tag) {
        throw new Error("Drizzle migration journal contains an invalid entry.");
      }

      const migrationPath = resolve(root, "drizzle", entry.tag + ".sql");
      const sql = await readFile(migrationPath, "utf8");
      const hash = createHash("sha256").update(sql).digest("hex");
      if (appliedHashes.has(hash)) continue;
      if (hasExistingHistory && migrationTimestamp <= latestRecordedTimestamp) {
        throw new Error("An unrecorded migration predates the latest recorded Drizzle history; automatic out-of-order recovery is blocked.");
      }

      await executeCompatibleMigrationSql(connection, sql);
      await connection.execute(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
        [hash, migrationTimestamp],
      );
      appliedHashes.add(hash);
      appliedCount++;
      console.log("[main-migrate] Applied " + entry.tag + ".sql");
    }

    await connection.execute(
      `UPDATE \`${guardTable}\` SET status='completed',finishedAt=CURRENT_TIMESTAMP,failureCode=NULL WHERE id=1`,
    );
    runStarted = false;
    console.log("[main-migrate] Main migrations completed; " + appliedCount + " migration file(s) applied.");
  } catch (error) {
    const code = safeCode(error);
    if (connection && runStarted) {
      await connection.execute(
        `UPDATE \`${guardTable}\` SET status='failed',finishedAt=CURRENT_TIMESTAMP,failureCode=? WHERE id=1`,
        [code],
      ).catch(() => {});
    }
    console.error("[main-migrate] ERROR: Main migration run failed (code: " + code + "). The run is marked failed and automatic retry is blocked pending review.");
    process.exitCode = 1;
  } finally {
    if (connection) {
      if (lockAcquired) {
        await connection.execute("SELECT RELEASE_LOCK(?)", [lockName]).catch(() => {});
      }
      await connection.end().catch(() => {});
    }
  }
}

await main();
