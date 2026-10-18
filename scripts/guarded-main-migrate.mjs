import mysql from "mysql2/promise";
import { spawnSync } from "node:child_process";
import { classifyMainMigrationPreflight } from "../installer/main-migration-preflight.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[main-migrate] DATABASE_URL is required. No migration was run.");
  process.exit(1);
}

function connectionOptions(value) {
  const url = new URL(value);
  if (!["mysql:", "mariadb:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use mysql:// or mariadb://.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!database) throw new Error("DATABASE_URL must specify a database name.");
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ssl: url.searchParams.get("ssl") === "true" ? {} : undefined,
    connectTimeout: 10000,
  };
}

let db;
try {
  db = await mysql.createConnection(connectionOptions(databaseUrl));
  const [tableRows] = await db.query(
    "SELECT COUNT(*) AS tableCount FROM information_schema.tables WHERE table_schema=DATABASE()",
  );
  const tableCount = Number(tableRows[0].tableCount);
  const [trackerRows] = await db.query(
    "SELECT COUNT(*) AS tableCount FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='__drizzle_migrations'",
  );
  const trackerExists = Number(trackerRows[0].tableCount) === 1;
  let trackerCount = 0;
  if (trackerExists) {
    const [records] = await db.query("SELECT COUNT(*) AS migrationCount FROM __drizzle_migrations");
    trackerCount = Number(records[0].migrationCount);
  }
  const preflight = classifyMainMigrationPreflight({
    mode: tableCount === 0 ? "fresh" : "existing",
    tableCount,
    trackerExists,
    trackerCount,
  });
  if (!preflight.allowed) {
    throw new Error(preflight.reason + " No migrations were run. Back up and review the database, then establish a verified baseline before retrying.");
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS main_migration_run_guard (
      id TINYINT NOT NULL PRIMARY KEY,
      status VARCHAR(16) NOT NULL,
      startedAt TIMESTAMP NULL,
      finishedAt TIMESTAMP NULL,
      failureCode VARCHAR(80) NULL,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  await db.execute(
    "INSERT IGNORE INTO main_migration_run_guard (id,status) VALUES (1,'idle')",
  );
  await db.beginTransaction();
  try {
    const [guardRows] = await db.query(
      "SELECT status FROM main_migration_run_guard WHERE id=1 FOR UPDATE",
    );
    const status = guardRows[0]?.status;
    if (status === "started" || status === "failed") {
      await db.rollback();
      throw new Error(
        "A previous main migration run is marked " + status + ". Automatic retry is blocked because MySQL may have partially committed DDL. Inspect the schema and migration history, take a restorable backup, and approve a documented recovery before resetting the guard.",
      );
    }
    await db.execute(
      "UPDATE main_migration_run_guard SET status='started',startedAt=CURRENT_TIMESTAMP,finishedAt=NULL,failureCode=NULL WHERE id=1",
    );
    await db.commit();
  } catch (error) {
    try { await db.rollback(); } catch {}
    throw error;
  }
} catch (error) {
  console.error("[main-migrate] " + String(error?.message || "Migration preflight failed."));
  if (db) await db.end().catch(() => {});
  process.exit(1);
} finally {
  if (db) {
    await db.end().catch(() => {});
    db = undefined;
  }
}

console.log("[main-migrate] Running Drizzle migrations with the persistent failure guard.");
const child = spawnSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  shell: false,
});
const failureCode = child.error?.code || (child.status === null ? "NO_EXIT_STATUS" : child.status === 0 ? null : "EXIT_" + child.status);
let finalDb;
try {
  finalDb = await mysql.createConnection(connectionOptions(databaseUrl));
  await finalDb.execute(
    "UPDATE main_migration_run_guard SET status=?,finishedAt=CURRENT_TIMESTAMP,failureCode=? WHERE id=1",
    [failureCode ? "failed" : "applied", failureCode],
  );
} catch (error) {
  console.error("[main-migrate] Could not persist final guard status. The database may still show a started run; inspect before retrying.");
  console.error("[main-migrate] " + String(error?.code || "DATABASE_ERROR"));
  process.exitCode = 1;
} finally {
  if (finalDb) await finalDb.end().catch(() => {});
}

if (child.error) {
  console.error("[main-migrate] Could not start pnpm. The guard is marked failed.");
  process.exitCode = 1;
} else if (child.status !== 0) {
  console.error("[main-migrate] Drizzle migration command failed; automatic retries are blocked.");
  process.exitCode = child.status || 1;
}
