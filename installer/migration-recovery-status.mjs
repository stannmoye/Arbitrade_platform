import { config } from "dotenv";
import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyMigrationTracker } from "./migration-recovery-utils.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env"), override: false });
const rawDatabaseUrl = process.env.DATABASE_URL;
if (!rawDatabaseUrl) {
  console.error("Migration recovery diagnostics require DATABASE_URL in the private .env file.");
  process.exit(2);
}

const journalPath = resolve(root, "drizzle/meta/_journal.json");
let journal;
try {
  journal = JSON.parse(await readFile(journalPath, "utf8"));
} catch {
  console.error("Cannot read drizzle/meta/_journal.json. No database changes were made.");
  process.exit(2);
}
if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
  console.error("The Drizzle migration journal is invalid or empty. No database changes were made.");
  process.exit(2);
}

let url;
try {
  url = new URL(rawDatabaseUrl);
} catch {
  console.error("DATABASE_URL is malformed. Check the private configuration; the value is not displayed.");
  process.exit(2);
}
if (![ "mysql:", "mariadb:" ].includes(url.protocol) || !url.pathname.replace(/^\\/+/, "")) {
  console.error("DATABASE_URL must identify a MySQL/MariaDB database. No database changes were made.");
  process.exit(2);
}
if (url.protocol === "mariadb:") url.protocol = "mysql:";
url.searchParams.set("timezone", "Z");
const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
if (!databaseName) {
  console.error("DATABASE_URL must include a database name. No database changes were made.");
  process.exit(2);
}
let db;
try {
  db = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: databaseName,
    ssl: url.searchParams.get("ssl") === "true" ? {} : undefined,
    connectTimeout: 10000,
  });
} catch (error) {
  console.error("Could not connect to the configured database. Check private connection settings and database availability; credentials are not displayed.");
  console.error("Database error code: " + String(error?.code || "unavailable").replace(/[^A-Z0-9_]/gi, "").slice(0, 40));
  process.exit(2);
}

const miningMarkers = [
  "0039_mining_database_driven_packages",
  "0040_mining_package_daily_rewards",
  "0041_mining_purchase_claims_and_boost_cooldown",
  "0043_mining_engine_activity",
  "0044_mining_initial_cki_package_rewards",
  "0045_mining_reward_calculation_methods",
];

async function tableExists(tableName) {
  const [rows] = await db.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1",
    [tableName],
  );
  return rows.length > 0;
}

console.log("Arbitrade migration recovery diagnostics (READ ONLY)");
console.log("No migrations are executed, no markers are cleared, and no schema/data is modified.");
console.log("Treat any incomplete/unknown result as a stop signal; take a restorable backup before recovery.\n");

try {
  const [drizzleExists, miningExists, portalSignals] = await Promise.all([
    tableExists("__drizzle_migrations"),
    tableExists("mining_schema_migrations"),
    Promise.all(["kyc_profiles", "email_notification_settings", "opportunity_popup_events", "opportunity_delivery_events"].map(tableExists)),
  ]);

  let drizzleCount = 0;
  if (drizzleExists) {
    const [rows] = await db.query("SELECT COUNT(*) AS count FROM __drizzle_migrations");
    drizzleCount = Number(rows[0]?.count ?? 0);
  }
  const drizzleStatus = classifyMigrationTracker({
    trackerExists: drizzleExists,
    appliedCount: drizzleCount,
    expectedCount: journal.entries.length,
  });
  console.log("MAIN DRIZZLE MIGRATIONS");
  console.log("Expected journal entries in this checkout: " + journal.entries.length);
  console.log("Recorded tracker entries: " + (drizzleExists ? drizzleCount : "tracker missing"));
  console.log("Evidence status: " + drizzleStatus.status);
  console.log(drizzleStatus.explanation);

  console.log("\nPORTAL SQL MIGRATIONS");
  console.log("Per-file tracker: not implemented by the current portal migration runner.");
  console.log("Read-only schema signals:");
  ["kyc_profiles", "email_notification_settings", "opportunity_popup_events", "opportunity_delivery_events"].forEach((name, index) => {
    console.log("- " + name + ": " + (portalSignals[index] ? "present" : "missing"));
  });
  console.log("Evidence status: cannot_verify_per_migration");
  console.log("These signals are not proof that every portal migration completed; inspect each SQL migration and schema before retrying.");

  console.log("\nMINING SQL MIGRATIONS");
  if (!miningExists) {
    console.log("Tracker table: missing");
    console.log("Evidence status: cannot_verify");
  } else {
    const placeholders = miningMarkers.map(() => "?").join(",");
    const [rows] = await db.query(
      "SELECT migrationKey FROM mining_schema_migrations WHERE migrationKey IN (" + placeholders + ")",
      miningMarkers,
    );
    const applied = new Set(rows.map((row) => String(row.migrationKey)));
    for (const key of miningMarkers) console.log("- " + key + ": " + (applied.has(key) ? "recorded" : "not recorded"));
    const recordedCount = miningMarkers.filter((key) => applied.has(key)).length;
    if (recordedCount === 0) {
      console.log("Evidence status: not_started_or_untracked");
    } else if (recordedCount === miningMarkers.length) {
      console.log("Evidence status: selected_markers_complete_schema_unverified");
    } else {
      console.log("Evidence status: incomplete_or_partial");
    }
    console.log("Only selected marker keys are checked; this is not a full mining-schema validation.");
  }

  console.log("\nSAFE NEXT STEP");
  console.log("Do not rerun a migration solely because a tracker entry is missing. MySQL DDL may have committed partially before a failure.");
  console.log("Capture this report, inspect the private installer output and migration SQL, compare actual columns/indexes/data, and confirm a restorable backup.");
} catch (error) {
  console.error("\nCould not complete the read-only diagnostic. No migration was run.");
  console.error("Database error code: " + String(error?.code || "unavailable").replace(/[^A-Z0-9_]/gi, "").slice(0, 40));
  process.exitCode = 1;
} finally {
  await db.end();
}
