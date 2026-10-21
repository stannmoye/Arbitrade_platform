import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import { executeCompatibleMigrationSql } from "./mysql-compatible-migration-sql.mjs";

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) throw new Error("DATABASE_URL is required for the disposable notification migration check.");

const url = new URL(rawUrl);
if (!["mysql:", "mariadb:"].includes(url.protocol)) {
  throw new Error("DATABASE_URL must use MySQL or MariaDB.");
}

const connection = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.replace(/^\/+/, "")),
  multipleStatements: true,
  connectTimeout: 10000,
});

const migrationPath = new URL("../drizzle/0054_notification_event_idempotency.sql", import.meta.url);
const migrationSql = await readFile(migrationPath, "utf8");
const migrationChecksum = createHash("sha256").update(migrationSql).digest("hex");
const migrationName = "0054_notification_event_idempotency.sql";
const paginationMigrationPath = new URL("../drizzle/0057_notification_history_pagination.sql", import.meta.url);
const paginationMigrationSql = await readFile(paginationMigrationPath, "utf8");
const paginationMigrationChecksum = createHash("sha256").update(paginationMigrationSql).digest("hex");
const paginationMigrationName = "0057_notification_history_pagination.sql";
const eventKey = "ci-migration-0054-" + randomUUID();
let insertedId;

try {
  const [tableRows] = await connection.execute(
    "SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='customer_notifications' LIMIT 1",
  );
  if (!tableRows.length) throw new Error("customer_notifications is missing after the fresh install.");

  const [trackerRows] = await connection.execute(
    "SELECT checksum,status FROM portal_schema_migrations WHERE migrationName=?",
    [migrationName],
  );
  if (trackerRows.length !== 1 || trackerRows[0].status !== "applied" || trackerRows[0].checksum !== migrationChecksum) {
    throw new Error("Migration 0054 is not recorded as applied with the current migration checksum.");
  }
  const [paginationTrackerRows] = await connection.execute(
    "SELECT checksum,status FROM portal_schema_migrations WHERE migrationName=?",
    [paginationMigrationName],
  );
  if (paginationTrackerRows.length !== 1 || paginationTrackerRows[0].status !== "applied" || paginationTrackerRows[0].checksum !== paginationMigrationChecksum) {
    throw new Error("Migration 0057 is not recorded as applied with the current migration checksum.");
  }

  const [columns] = await connection.execute(
    "SELECT column_name AS columnName FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='customer_notifications'",
  );
  const columnNames = new Set(columns.map(row => String(row.columnName)));
  for (const column of ["eventKey", "category", "priority", "href", "userId", "readAt", "createdAt"]) {
    if (!columnNames.has(column)) throw new Error("Migration 0054 column is missing: " + column);
  }

  const [indexes] = await connection.execute(
    "SELECT index_name AS indexName, non_unique AS nonUnique, seq_in_index AS sequenceInIndex, column_name AS columnName FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='customer_notifications'",
  );
  const eventKeyIndex = indexes.filter(row => row.indexName === "customer_notifications_event_key_uq");
  if (!eventKeyIndex.length || eventKeyIndex.some(row => Number(row.nonUnique) !== 0)) {
    throw new Error("Migration 0054's event-key index is missing or not unique.");
  }
  const userReadIndex = new Set(indexes.filter(row => row.indexName === "customer_notifications_user_read_created_idx").map(row => Number(row.nonUnique)));
  if (!userReadIndex.has(1)) throw new Error("Migration 0054's customer/read/time lookup index is missing.");
  const paginationIndex = indexes.filter(row => row.indexName === "customer_notifications_user_created_id_idx")
    .sort((a, b) => Number(a.sequenceInIndex) - Number(b.sequenceInIndex));
  if (paginationIndex.length !== 3 ||
      paginationIndex.map(row => row.columnName).join(",") !== "userId,createdAt,id" ||
      paginationIndex.some(row => Number(row.nonUnique) !== 1)) {
    throw new Error("Migration 0057's non-unique user/createdAt/id pagination index is missing or incorrectly ordered.");
  }

  const [beforeRows] = await connection.execute("SELECT COUNT(*) AS count FROM customer_notifications");
  const beforeCount = Number(beforeRows[0].count);

  // Insert a disposable sentinel to prove existing notification data survives a
  // migration rerun, and to exercise the unique event-key constraint against DB.
  await connection.execute(
    "INSERT INTO customer_notifications (userId,title,body,eventKey,category,priority,href) VALUES (?,?,?,?,?,?,?)",
    [2147483000, "Migration verification sentinel", "Disposable CI-only row", eventKey, "account", "normal", null],
  );
  const [sentinelRows] = await connection.execute(
    "SELECT id,title,body,eventKey,category,priority FROM customer_notifications WHERE eventKey=?",
    [eventKey],
  );
  if (sentinelRows.length !== 1) throw new Error("Could not read back the migration verification sentinel.");
  insertedId = Number(sentinelRows[0].id);

  let duplicateRejected = false;
  try {
    await connection.execute(
      "INSERT INTO customer_notifications (userId,title,body,eventKey,category,priority) VALUES (?,?,?,?,?,?)",
      [2147483000, "Duplicate sentinel", "Must be rejected", eventKey, "account", "normal"],
    );
  } catch (error) {
    if (error?.code !== "ER_DUP_ENTRY") throw error;
    duplicateRejected = true;
  }
  if (!duplicateRejected) throw new Error("Database accepted a duplicate notification event key.");

  await executeCompatibleMigrationSql(connection, migrationSql);
  await executeCompatibleMigrationSql(connection, paginationMigrationSql);

  const [afterRows] = await connection.execute("SELECT COUNT(*) AS count FROM customer_notifications");
  if (Number(afterRows[0].count) !== beforeCount + 1) {
    throw new Error("Migration rerun changed notification row count unexpectedly.");
  }
  const [preservedRows] = await connection.execute(
    "SELECT id,title,body,eventKey,category,priority FROM customer_notifications WHERE id=? AND eventKey=?",
    [insertedId, eventKey],
  );
  if (preservedRows.length !== 1 || preservedRows[0].title !== "Migration verification sentinel" ||
      preservedRows[0].body !== "Disposable CI-only row" || preservedRows[0].category !== "account") {
    throw new Error("Migration rerun failed to preserve the sentinel notification data.");
  }

  console.log(JSON.stringify({
    status: "PASS",
    migration: migrationName,
    paginationMigration: paginationMigrationName,
    trackerChecksumVerified: true,
    paginationMigrationChecksumVerified: true,
    requiredColumnsVerified: 7,
    uniqueEventKeyConstraintVerified: true,
    notificationHistoryPaginationIndexVerified: true,
    duplicateEventKeyRejected: true,
    migrationRerunSucceeded: true,
    notificationRowsPreserved: true,
    database: url.protocol === "mariadb:" ? "MariaDB" : "MySQL",
  }, null, 2));
} finally {
  if (insertedId !== undefined) {
    await connection.execute("DELETE FROM customer_notifications WHERE id=? AND eventKey=?", [insertedId, eventKey]).catch(() => {});
  }
  await connection.end();
}
