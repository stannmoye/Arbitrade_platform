import { createHash } from "node:crypto";
import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { executeCompatibleMigrationSql } from "./mysql-compatible-migration-sql.mjs";
import { classifyMainMigrationPreflight, loadExpectedMainMigrationHistory, validateMainMigrationHistory } from "../installer/main-migration-preflight.mjs";
import { assertWorkerSchemaContracts } from "./worker-schema-contracts.mjs";
import { inspectMainMigrationSchema } from "./main-migration-schema-diagnostic.mjs";

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
  const sslParam = url.searchParams.get("ssl");
  let ssl;
  if (sslParam) {
    try {
      const parsed = JSON.parse(sslParam);
      ssl = parsed === true ? {} : parsed && typeof parsed === "object" ? parsed : undefined;
    } catch {
      ssl = undefined;
    }
  }
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\/+/, "")),
    ssl,
    connectTimeout: 10000,
    multipleStatements: true,
  };
}


async function reconcileTradingPackageSchema(connection, root) {
  const readColumns = async () => {
    const [rows] = await connection.query(
      "SELECT table_name AS tableName, column_name AS columnName FROM information_schema.columns " +
      "WHERE table_schema=DATABASE() AND table_name IN (?, ?)",
      ["packages", "customer_package_subscriptions"],
    );
    const result = new Map();
    for (const row of rows) {
      const table = String(row.tableName ?? row.TABLE_NAME ?? "");
      const column = String(row.columnName ?? row.COLUMN_NAME ?? "");
      if (!result.has(table)) result.set(table, new Set());
      result.get(table).add(column);
    }
    return result;
  };

  let columns = await readColumns();
  if (!columns.has("packages")) {
    throw new Error("Trading package schema verification failed: the packages table is missing; automatic repair cannot safely reconstruct package terms.");
  }

  const packageColumns = [
    "id", "name", "minimumQualifyingBalanceUsdMinor", "durationMonths",
    "opportunitiesPerDay", "termsVersion", "startsAt", "expiresAt",
    "maxPopupsPerDay", "maxActiveInvestments", "enabled", "createdAt",
  ];
  const packageRepairableColumns = [
    "startsAt", "expiresAt", "maxPopupsPerDay", "maxActiveInvestments", "enabled", "createdAt",
  ];
  const missingPackageColumns = packageColumns.filter(column => !columns.get("packages").has(column));
  if (missingPackageColumns.some(column => packageRepairableColumns.includes(column))) {
    const migrationPath = resolve(root, "drizzle", "0077_trading_package_catalogue_schema_repair.sql");
    const sql = await readFile(migrationPath, "utf8");
    await executeCompatibleMigrationSql(connection, sql);
    console.log("[main-migrate] Reconciled Trading package catalogue schema drift using the idempotent 0077 repair.");
    columns = await readColumns();
  }

  const subscriptionColumns = [
    "id", "userId", "packageId", "startsAt", "expiresAt", "status",
    "activationKey", "termsSnapshotJson", "qualifyingBalanceUsdMinor",
    "packageTermsVersion", "activatedAt", "createdAt",
  ];
  const subscriptionRepairableColumns = subscriptionColumns.filter(column => column !== "id");
  const presentSubscriptionColumns = columns.get("customer_package_subscriptions") ?? new Set();
  const missingSubscriptionColumns = subscriptionColumns.filter(column => !presentSubscriptionColumns.has(column));
  if (missingSubscriptionColumns.length) {
    if (missingSubscriptionColumns.some(column => subscriptionRepairableColumns.includes(column)) ||
        !columns.has("customer_package_subscriptions")) {
      const migrationPath = resolve(root, "drizzle", "0078_trading_customer_package_subscription_repair.sql");
      const sql = await readFile(migrationPath, "utf8");
      await executeCompatibleMigrationSql(connection, sql);
      console.log("[main-migrate] Reconciled Trading customer subscription schema drift using the idempotent 0078 repair.");
      columns = await readColumns();
    }
  }

  const finalPackages = columns.get("packages") ?? new Set();
  const finalSubscriptions = columns.get("customer_package_subscriptions") ?? new Set();
  const remainingPackageColumns = packageColumns.filter(column => !finalPackages.has(column));
  const remainingSubscriptionColumns = subscriptionColumns.filter(column => !finalSubscriptions.has(column));
  if (remainingPackageColumns.length || remainingSubscriptionColumns.length) {
    const details = [
      remainingPackageColumns.length ? "packages missing columns: " + remainingPackageColumns.join(", ") : "",
      remainingSubscriptionColumns.length ? "customer_package_subscriptions missing columns: " + remainingSubscriptionColumns.join(", ") : "",
    ].filter(Boolean).join("; ");
    throw new Error("Trading package schema verification failed after additive repair: " + details);
  }
  return { checkedTables: 2 };
}


async function reconcileTradingPackagePolicySchema(connection, root) {
  const requiredColumns = [
    "automaticDelivery", "dailyPopupTarget", "schedulingPeriod", "minIntervalSeconds",
    "maxIntervalSeconds", "randomizationEnabled", "popupDisplayTargetSeconds",
    "completionDisplaySeconds", "postCompletionIntervalSeconds", "maxPendingDeliveries",
    "deliveryRetryPolicy", "maxDeliveryAttempts", "expiryHandling", "duplicatePrevention",
    "audioEnabled", "audioSound", "automaticTradingEnabled", "maxTradeAttemptsPerDay",
    "maxSuccessfulTradesPerDay", "maxConcurrentActiveTrades", "requirePreviousSettlement",
    "minSettlementDelaySeconds", "maxSettlementDelaySeconds", "minimumRewardBps",
    "allowedOpportunityTypes", "maxDailyRewardMinor", "rewardLimitCurrency",
    "dailyRewardWindow", "maxRewardPerTradeMinor", "unsettledRewardPolicy",
    "capReachedPolicy", "settlementConfirmationState", "settlementRetryPolicy",
    "maxSettlementAttempts", "closePolicy", "policyVersion",
  ];
  const [columnRows] = await connection.query(
    "SELECT column_name AS columnName FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name IN (" +
      requiredColumns.map(() => "?").join(",") + ")",
    ["opportunity_package_policies", ...requiredColumns],
  );
  const [tableRows] = await connection.query(
    "SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (?, ?)",
    ["trade_reward_reservations", "opportunity_schedule_decisions"],
  );
  const existingColumns = new Set(columnRows.map((row) => String(row.columnName)));
  const existingTables = new Set(tableRows.map((row) => String(row.tableName)));
  if (requiredColumns.every((column) => existingColumns.has(column)) &&
      existingTables.has("trade_reward_reservations") &&
      existingTables.has("opportunity_schedule_decisions")) return { repaired: false };

  const migrationPath = resolve(root, "drizzle", "0087_trading_package_policy_schema_reconciliation.sql");
  const sql = await readFile(migrationPath, "utf8");
  await executeCompatibleMigrationSql(connection, sql);
  const [verifiedRows] = await connection.query(
    "SELECT column_name AS columnName FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name IN (" +
      requiredColumns.map(() => "?").join(",") + ")",
    ["opportunity_package_policies", ...requiredColumns],
  );
  const [verifiedTablesRows] = await connection.query(
    "SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (?, ?)",
    ["trade_reward_reservations", "opportunity_schedule_decisions"],
  );
  const verifiedColumns = new Set(verifiedRows.map((row) => String(row.columnName)));
  const verifiedTables = new Set(verifiedTablesRows.map((row) => String(row.tableName)));
  const missingColumns = requiredColumns.filter((column) => !verifiedColumns.has(column));
  const missingTables = ["trade_reward_reservations", "opportunity_schedule_decisions"].filter((table) => !verifiedTables.has(table));
  if (missingColumns.length || missingTables.length) {
    throw new Error("Trading package policy schema verification failed after additive repair: " +
      [...missingColumns.map((column) => "opportunity_package_policies." + column), ...missingTables].join(", "));
  }
  console.log("[main-migrate] Reconciled Trading package policy schema using the idempotent 0087 repair.");
  return { repaired: true };
}


async function reconcileOpportunityExecutionLeaseSchema(connection, root) {
  const requiredColumns = ["deliveryStatus", "deliveryAttemptCount", "lastErrorCode", "receivedAt", "renderedAt", "expiredAt", "tradeId", "policyVersion", "executionLeaseToken"];
  const [rows] = await connection.query(
    "SELECT column_name AS columnName FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name IN (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ["opportunity_popup_events", ...requiredColumns],
  );
  const existingColumns = new Set(rows.map((row) => String(row.columnName)));
  if (requiredColumns.every((column) => existingColumns.has(column))) return { repaired: false };
  const migrationPath = resolve(root, "drizzle", "0086_trading_opportunity_execution_leases.sql");
  const sql = await readFile(migrationPath, "utf8");
  await executeCompatibleMigrationSql(connection, sql);
  const [verified] = await connection.query(
    "SELECT column_name AS columnName FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name IN (?, ?, ?, ?, ?, ?, ?)",
    ["opportunity_popup_events", ...requiredColumns],
  );
  const verifiedColumns = new Set(verified.map((row) => String(row.columnName)));
  const missingColumns = requiredColumns.filter((column) => !verifiedColumns.has(column));
  if (missingColumns.length) throw new Error("Trading opportunity execution lease schema verification failed after additive repair: " + missingColumns.join(", "));
  console.log("[main-migrate] Reconciled Trading opportunity execution lease schema using the idempotent 0086 repair.");
  return { repaired: true };
}


async function reconcileTradeSettlementTimingSchema(connection, root) {
  const readSchema = async () => {
    const [rows] = await connection.query(
      "SELECT table_name AS tableName, column_name AS columnName FROM information_schema.columns " +
      "WHERE table_schema=DATABASE() AND table_name IN (?, ?, ?)",
      ["trade_positions", "trade_lifecycle_events", "trade_reward_reservations"],
    );
    const tables = new Map();
    for (const row of rows) {
      const table = String(row.tableName ?? row.TABLE_NAME ?? "");
      const column = String(row.columnName ?? row.COLUMN_NAME ?? "");
      if (!tables.has(table)) tables.set(table, new Set());
      tables.get(table).add(column);
    }
    return tables;
  };

  const requiredTradeColumns = [
    "id", "userId", "offerId", "packageSubscriptionId", "currency", "principalMinor",
    "expectedRewardMinor", "status", "confirmedAt", "settlesAt", "creditAt", "settledAt",
    "lifecycleStage", "settlementStatus", "rewardReservedMinor", "rewardCreditedMinor",
    "realizedGrossProfitMinor", "platformFeeMinor", "netProfitMinor", "feePolicyVersion",
    "platformFeeRateBps", "platformFeeRoundingMode", "settlementOutcome", "walletUpdatedAt",
    "completionAt", "transactionReference", "settlementReference", "settlementConfirmedAt",
    "settlementConfirmedBy", "settlementNotes", "policyVersion",
  ];
  const requiredLifecycleColumns = ["id", "tradeId", "userId", "eventType", "stage", "payloadJson", "createdAt"];
  const requiredReservationColumns = ["id", "userId", "tradeId", "packageName", "windowKey", "currency", "reservedMinor", "status", "createdAt", "updatedAt"];
  let schema = await readSchema();
  if (!schema.has("trade_positions")) {
    throw new Error("Trading settlement schema verification failed: trade_positions table is missing.");
  }

  const missing = [
    ...requiredTradeColumns.filter(column => !schema.get("trade_positions").has(column)).map(column => "trade_positions." + column),
    ...requiredLifecycleColumns.filter(column => !schema.get("trade_lifecycle_events")?.has(column)).map(column => "trade_lifecycle_events." + column),
    ...requiredReservationColumns.filter(column => !schema.get("trade_reward_reservations")?.has(column)).map(column => "trade_reward_reservations." + column),
  ];
  if (missing.length) {
    const migrationPath = resolve(root, "drizzle", "0085_trade_settlement_schema_reconciliation.sql");
    const sql = await readFile(migrationPath, "utf8");
    await executeCompatibleMigrationSql(connection, sql);
    console.log("[main-migrate] Reconciled Trading settlement schema drift using the idempotent 0085 repair.");
    schema = await readSchema();
  }

  const remaining = [
    ...requiredTradeColumns.filter(column => !schema.get("trade_positions")?.has(column)).map(column => "trade_positions." + column),
    ...requiredLifecycleColumns.filter(column => !schema.get("trade_lifecycle_events")?.has(column)).map(column => "trade_lifecycle_events." + column),
    ...requiredReservationColumns.filter(column => !schema.get("trade_reward_reservations")?.has(column)).map(column => "trade_reward_reservations." + column),
  ];
  if (remaining.length) {
    throw new Error("Trading settlement schema verification failed after additive repair: missing " + remaining.join(", "));
  }
  return { checkedColumns: requiredTradeColumns.length + requiredLifecycleColumns.length + requiredReservationColumns.length, checkedTables: 3 };
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
  let currentMigration = null;
  let currentStatement = null;
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
        failureMigration VARCHAR(160) NULL,
        failureStatementIndex INT NULL,
        failureStatementLabel VARCHAR(180) NULL,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);
    // Existing installations may have the original guard-table shape. Add only
    // diagnostic columns; this does not clear a failure or modify business data.
    await executeCompatibleMigrationSql(connection, `
      ALTER TABLE \`${guardTable}\`
        ADD COLUMN IF NOT EXISTS failureMigration VARCHAR(160) NULL,
        ADD COLUMN IF NOT EXISTS failureStatementIndex INT NULL,
        ADD COLUMN IF NOT EXISTS failureStatementLabel VARCHAR(180) NULL
    `);

    const [lockRows] = await connection.execute("SELECT GET_LOCK(?, 0) AS acquired", [lockName]);
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) {
      console.error("[main-migrate] ERROR: Another main migration run is already active. No migration SQL was executed.");
      process.exitCode = 1;
      return;
    }

    const [guardRows] = await connection.execute(
      `SELECT status, failureCode, failureMigration, failureStatementIndex, failureStatementLabel FROM \`${guardTable}\` WHERE id=1 FOR UPDATE`,
    );
    const previousStatus = guardRows[0]?.status;
    const previousFailureCode = String(guardRows[0]?.failureCode || "").replace(/[^A-Z0-9_]/gi, "").slice(0, 80);
    const previousMigration = String(guardRows[0]?.failureMigration || "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 160);
    const previousStatementLabel = String(guardRows[0]?.failureStatementLabel || "").replace(/[^A-Za-z0-9 _.-]/g, "").slice(0, 180);
    const previousStatementIndex = Number(guardRows[0]?.failureStatementIndex || 0);
    if (previousStatus === "failed" || previousStatus === "running") {
      const appliedHashesBeforeRetry = new Set(trackerRows.map(row => String(row.hash)));
      const firstUnrecordedMigration = expectedHistory.migrations.find(migration => !appliedHashesBeforeRetry.has(migration.hash));
      const diagnosticMigration = firstUnrecordedMigration?.tag || "post-migration-schema-verification";
      try {
        const diagnostics = await inspectMainMigrationSchema(connection, diagnosticMigration);
        console.error("[main-migrate] Read-only schema check for " + diagnosticMigration + ".sql (no schema or data changes made):");
        if (!diagnostics.length) {
          console.error("[main-migrate] No missing pre-existing columns were detected for this migration's focused checks.");
        } else {
          for (const diagnostic of diagnostics.slice(0, 20)) {
            console.error("[main-migrate] SCHEMA CHECK: " + diagnostic.replace(/[^A-Za-z0-9 _.,;:()'.-]/g, "").slice(0, 240));
          }
          if (diagnostics.length > 20) console.error("[main-migrate] Additional schema discrepancies omitted: " + (diagnostics.length - 20));
        }
      } catch {
        console.error("[main-migrate] Read-only schema check could not complete. The existing failure remains blocked for manual review.");
      }
      const location = previousMigration
        ? " Last recorded failure location: " + previousMigration + ".sql" +
          (previousStatementIndex > 0 ? " statement " + previousStatementIndex : "") +
          (previousStatementLabel ? " (" + previousStatementLabel + ")" : "") + "."
        : " This failure predates migration-location diagnostics; run the read-only schema audit before approving recovery.";
      console.error(
        "[main-migrate] ERROR: Automatic retry is blocked because the previous main migration run is " +
        previousStatus +
        (previousStatus === "failed" && previousFailureCode ? " (recorded failure code: " + previousFailureCode + ")" : "") +
        "." + location + " A recorded failure code does not prove schema integrity. Inspect the migration state and approve a recovery plan before retrying.",
      );
      process.exitCode = 1;
      return;
    }

    if (guardRows.length) {
      await connection.execute(
        `UPDATE \`${guardTable}\` SET status='running',startedAt=CURRENT_TIMESTAMP,finishedAt=NULL,failureCode=NULL,failureMigration=NULL,failureStatementIndex=NULL,failureStatementLabel=NULL WHERE id=1`,
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

      currentMigration = entry.tag;
      currentStatement = null;
      await executeCompatibleMigrationSql(connection, sql, {
        onStatement: (statement) => { currentStatement = statement; },
      });
      currentStatement = { index: null, label: "record migration history" };
      await connection.execute(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
        [hash, migrationTimestamp],
      );
      appliedHashes.add(hash);
      appliedCount++;
      console.log("[main-migrate] Applied " + entry.tag + ".sql");
      currentMigration = null;
      currentStatement = null;
    }

    currentMigration = "trading-package-schema-drift-reconciliation";
    currentStatement = { index: null, label: "Trading package schema verification and additive repair" };
    const tradingPackageSchema = await reconcileTradingPackageSchema(connection, root);
    console.log("[main-migrate] Verified " + tradingPackageSchema.checkedTables + " Trading package schema contracts.");
    const tradeSettlementSchema = await reconcileTradeSettlementTimingSchema(connection, root);
    console.log("[main-migrate] Verified " + tradeSettlementSchema.checkedColumns + " Trading settlement timing columns.");
    currentMigration = "trading-opportunity-execution-lease-schema-reconciliation";
    currentStatement = { index: null, label: "Trading opportunity execution lease schema verification and additive repair" };
    await reconcileOpportunityExecutionLeaseSchema(connection, root);
    currentMigration = "trading-package-policy-schema-reconciliation";
    currentStatement = { index: null, label: "Trading package policy and reservation schema verification and additive repair" };
    await reconcileTradingPackagePolicySchema(connection, root);
    currentMigration = null;
    currentStatement = null;

    currentMigration = "post-migration-schema-verification";
    currentStatement = { index: null, label: "worker schema contract verification" };
    const verified = await assertWorkerSchemaContracts(connection);
    await connection.execute(
      `UPDATE \`${guardTable}\` SET status='completed',finishedAt=CURRENT_TIMESTAMP,failureCode=NULL,failureMigration=NULL,failureStatementIndex=NULL,failureStatementLabel=NULL WHERE id=1`,
    );
    runStarted = false;
    currentMigration = null;
    currentStatement = null;
    console.log("[main-migrate] Main migrations completed; " + appliedCount + " migration file(s) applied. Verified " + verified.checkedTables + " worker-critical table contracts.");
  } catch (error) {
    const code = safeCode(error);
    if (connection && runStarted) {
      await connection.execute(
        `UPDATE \`${guardTable}\`
          SET status='failed',finishedAt=CURRENT_TIMESTAMP,failureCode=?,
              failureMigration=?,failureStatementIndex=?,failureStatementLabel=?
          WHERE id=1`,
        [
          code,
          currentMigration ? String(currentMigration).slice(0, 160) : null,
          Number.isInteger(currentStatement?.index) ? currentStatement.index : null,
          currentStatement?.label ? String(currentStatement.label).slice(0, 180) : null,
        ],
      ).catch(() => {});
    }
    const location = currentMigration
      ? " Migration: " + String(currentMigration).replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 160) +
        (Number.isInteger(currentStatement?.index) ? ", statement " + currentStatement.index : "") +
        (currentStatement?.label ? " (" + String(currentStatement.label).replace(/[^A-Za-z0-9 _.-]/g, "").slice(0, 180) + ")" : "") + "."
      : "";
    const sqlMessage = String(error?.sqlMessage || "");
    const unknownColumn = sqlMessage.match(/Unknown column ['"\x60]([^'"\x60]+)['"\x60] in ['"\x60]([^'"\x60]+)['"\x60]/i);
    if (!connection && code === "ECONNREFUSED") {
      console.error("[main-migrate] ERROR: Database connection was refused before migration SQL ran (code: ECONNREFUSED). This attempt could not inspect or update the migration guard; any existing guard state remains unchanged. Check database service availability, DATABASE_URL host/port, and network access from the app runtime.");
    } else {
      console.error("[main-migrate] ERROR: Main migration run failed" + location + " (code: " + code + "). Review the migration guard and database state before retrying; do not assume this attempt updated the guard unless the connection and migration run had started.");
    }
    if (code === "MIGRATION_RENAME_COLUMNS_MISSING" || code === "MIGRATION_RENAME_COLUMNS_CONFLICT") {
      const renameDetail = String(error?.message || "").replace(/[^A-Za-z0-9 _.,;:()'.-]/g, "").slice(0, 240);
      if (renameDetail) console.error("[main-migrate] Schema diagnostic: " + renameDetail);
    }
    if (unknownColumn) {
      const column = unknownColumn[1].replace(/[^A-Za-z0-9_.$-]/g, "").slice(0, 120);
      const context = unknownColumn[2].replace(/[^A-Za-z0-9_ .$-]/g, "").slice(0, 120);
      console.error("[main-migrate] Schema diagnostic: unknown column " + column + " in " + context + ".");
    }
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
