import "dotenv/config";
import mysql from "mysql2/promise";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const mode = process.argv.includes("--existing-database")
  ? "existing"
  : process.argv.includes("--fresh-install")
    ? "fresh"
    : null;

function fail(message, code = 1) {
  console.error("[installer] ERROR: " + message);
  process.exit(code);
}

function run(command, args) {
  console.log("\n[installer] $ " + command + " " + args.join(" "));
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) fail("Could not start " + command + ": " + result.error.message);
  if (result.status !== 0) fail(command + " exited with status " + String(result.status));
}

if (!mode) fail("Choose exactly one mode: --fresh-install or --existing-database.", 2);
if (Number(process.versions.node.split(".")[0]) < 20) {
  fail("Node.js 20 or newer is required. Detected " + process.versions.node + ".");
}
if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET || !process.env.PASSWORD_PEPPER || !process.env.PUBLIC_APP_URL) {
  fail("DATABASE_URL, SESSION_SECRET, PASSWORD_PEPPER, and PUBLIC_APP_URL must be set in .env.");
}
if (process.env.SESSION_SECRET.length < 32 || process.env.PASSWORD_PEPPER.length < 32) {
  fail("SESSION_SECRET and PASSWORD_PEPPER must each contain at least 32 characters.");
}
if (mode === "fresh") {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("A valid ADMIN_EMAIL is required for a fresh installation.");
  if (password.length < 12) fail("ADMIN_PASSWORD must contain at least 12 characters for a fresh installation.");
}

let db;
try {
  const url = new URL(process.env.DATABASE_URL);
  if (!["mysql:", "mariadb:"].includes(url.protocol)) fail("DATABASE_URL must use mysql:// or mariadb://.");
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!databaseName) fail("DATABASE_URL must specify a database name.");
  db = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: databaseName,
    ssl: url.searchParams.get("ssl") === "true" ? {} : undefined,
    connectTimeout: 10000,
  });
  const [rows] = await db.query(
    "SELECT COUNT(*) AS tableCount FROM information_schema.tables WHERE table_schema = DATABASE()",
  );
  const tableCount = Number(rows[0].tableCount);
  if (mode === "fresh" && tableCount !== 0) {
    fail("Fresh-install mode requires an EMPTY database. This database already contains " + tableCount + " tables. Choose existing-database mode or create a separate empty database.");
  }
  if (mode === "existing" && tableCount === 0) {
    fail("Existing-database mode requires the database dump to be imported first. The selected database is empty.");
  }
  if (mode === "existing") {
    const [users] = await db.query(
      "SELECT COUNT(*) AS tableCount FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'",
    );
    if (Number(users[0].tableCount) !== 1) {
      fail("The imported database does not contain the expected users table. Check that the correct Arbitrade database was imported.");
    }
  }
  console.log("[installer] Database connection successful; " + tableCount + " existing table(s) detected.");
} catch (error) {
  if (error && typeof error.message === "string" && error.message.startsWith("[installer]")) throw error;
  fail("Could not connect to the selected database. Check DATABASE_URL, database privileges, and host settings. " + (error?.code || error?.message || ""));
} finally {
  if (db) await db.end();
}

run("pnpm", ["install", "--frozen-lockfile"]);

if (mode === "fresh") {
  console.log("\n[installer] Initializing a fresh database. Reward processing will remain disabled by default.");
  run("pnpm", ["db:migrate"]);
  run("pnpm", ["db:portal-migrate"]);
  run("node", ["scripts/apply-mining-migrations.mjs", "--confirm-host-migration", "--confirm-production"]);
  run("node", ["scripts/apply-mining-initial-reward-rates.mjs", "--confirm-host-migration", "--confirm-production"]);
  run("pnpm", ["build"]);
  run("node", ["installer/create-admin.mjs"]);
  console.log("\n[installer] Fresh installation completed. The initial administrator was created.");
} else {
  console.log("\n[installer] Existing-database mode: preserving all existing account credentials and application records.");
  run("pnpm", ["db:migrate"]);
  run("pnpm", ["build"]);
  console.log("\n[installer] Application dependencies/build completed. Existing accounts were not created, reset, or replaced.");
}

console.log("[installer] IMPORTANT: configure/restart the Node.js application in cPanel, verify /api/health, and remove the public installer directory.");
