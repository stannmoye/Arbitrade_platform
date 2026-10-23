import mysql from "mysql2/promise";
import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { executeCompatibleMigrationSql } from "./mysql-compatible-migration-sql.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env"), override: false });

async function hasColumn(db, table, column) {
  const [rows] = await db.execute(
    "SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1",
    [table, column],
  );
  return rows.length > 0;
}

async function ensureColumn(db, table, column, definition) {
  if (await hasColumn(db, table, column)) return false;
  // Identifiers/definitions are constants owned by this file, never user input.
  try {
    await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  } catch (error) {
    // Concurrent app instances can race during first boot. Treat the losing
    // instance as successful only if the column now exists.
    if (await hasColumn(db, table, column)) return false;
    throw error;
  }
  console.log(`[worker-schema] added ${table}.${column}`);
  return true;
}

async function hasIndex(db, table, index) {
  const [rows] = await db.execute(
    "SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=? LIMIT 1",
    [table, index],
  );
  return rows.length > 0;
}

async function ensureIndex(db, table, index, createSql) {
  if (await hasIndex(db, table, index)) return false;
  if (index === "customer_notifications_event_key_uq") {
    const [duplicates] = await db.query(
      "SELECT eventKey FROM customer_notifications WHERE eventKey IS NOT NULL GROUP BY eventKey HAVING COUNT(*) > 1 LIMIT 1",
    );
    if (duplicates.length) {
      throw new Error("customer_notifications has duplicate eventKey values; review those rows before enabling notification idempotency.");
    }
  }
  try {
    await db.query(createSql);
  } catch (error) {
    // Ignore a concurrent create only when the requested index is now present.
    if (await hasIndex(db, table, index)) return false;
    throw error;
  }
  console.log(`[worker-schema] added index ${table}.${index}`);
  return true;
}

async function ensureWithdrawnStatus(db, table, column, values) {
  const [rows] = await db.execute(
    "SELECT column_type AS columnType FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1",
    [table, column],
  );
  if (!rows.length) throw new Error(`Required column ${table}.${column} is missing.`);
  const columnType = String(rows[0].columnType || "").toLowerCase();
  if (columnType.includes("'withdrawn'")) return false;
  try {
    await db.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${values}`);
  } catch (error) {
    const [refreshed] = await db.execute(
      "SELECT column_type AS columnType FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1",
      [table, column],
    );
    if (String(refreshed[0]?.columnType || "").toLowerCase().includes("'withdrawn'")) return false;
    throw error;
  }
  console.log(`[worker-schema] enabled withdrawn status in ${table}.${column}`);
  return true;
}

async function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required; load the private application environment first.");
  const url = new URL(raw);
  if (!["mysql:", "mariadb:"].includes(url.protocol)) throw new Error("DATABASE_URL must use mysql:// or mariadb://.");
  if (url.protocol === "mariadb:") url.protocol = "mysql:";
  url.searchParams.set("timezone", "Z");
  const db = await mysql.createConnection(url.toString());
  let repairs = 0;
  try {
    // Idempotent CREATE TABLE IF NOT EXISTS statements are also in the main
    // journal. This startup guard covers hosts that invoke a different migration
    // entry point and ensures workers never query these tables before they exist.
    const workerMigration = await readFile(resolve(root, "drizzle/0062_worker_runtime_tables.sql"), "utf8");
    await executeCompatibleMigrationSql(db, workerMigration);

    const columns = [
      ["eventKey", "VARCHAR(180) NULL"],
      ["category", "VARCHAR(40) NOT NULL DEFAULT 'account'"],
      ["priority", "VARCHAR(20) NOT NULL DEFAULT 'normal'"],
      ["href", "VARCHAR(512) NULL"],
    ];
    for (const [column, definition] of columns) {
      if (await ensureColumn(db, "customer_notifications", column, definition)) repairs++;
    }

    const indexes = [
      ["customer_notifications_event_key_uq", "CREATE UNIQUE INDEX `customer_notifications_event_key_uq` ON `customer_notifications` (`eventKey`)"],
      ["customer_notifications_user_read_created_idx", "CREATE INDEX `customer_notifications_user_read_created_idx` ON `customer_notifications` (`userId`, `readAt`, `createdAt`)"],
      ["customer_notifications_user_created_id_idx", "CREATE INDEX `customer_notifications_user_created_id_idx` ON `customer_notifications` (`userId`, `createdAt`, `id`)"],
    ];
    for (const [name, createSql] of indexes) {
      if (await ensureIndex(db, "customer_notifications", name, createSql)) repairs++;
    }

    if (await ensureWithdrawnStatus(
      db,
      "notification_campaigns",
      "status",
      "ENUM('draft','scheduled','published','expired','failed','withdrawn') NOT NULL DEFAULT 'draft'",
    )) repairs++;
    if (await ensureWithdrawnStatus(
      db,
      "notification_campaign_deliveries",
      "status",
      "ENUM('pending','delivered','read','failed','expired','withdrawn') NOT NULL DEFAULT 'pending'",
    )) repairs++;

    console.log(repairs
      ? `[worker-schema] PASS: applied ${repairs} additive, non-destructive runtime schema repair(s).`
      : "[worker-schema] PASS: runtime worker tables and notification columns are present.");
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  const code = String(error?.code || "UNKNOWN").replace(/[^A-Z0-9_]/gi, "").slice(0, 40);
  const message = error instanceof Error
    ? error.message.replace(/\b(?:mysql|mariadb):\/\/[^\s"'<>]+/gi, "[database-url-redacted]").slice(0, 400)
    : "Unknown error";
  console.error("[worker-schema] FAIL: runtime schema preflight did not complete", { code: code || "UNKNOWN", message });
  process.exitCode = 1;
});
