import "dotenv/config";
import mysql from "mysql2/promise";
import { spawnSync } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fresh = process.argv.includes("--fresh-install");
const existing = process.argv.includes("--existing-database");
const mode = fresh === existing ? null : fresh ? "fresh" : "existing";
const bootstrapPath = resolve(root, ".installer-bootstrap.json");
const lockPath = resolve(root, "installer/.installed");

function fail(message, code = 1) {
  console.error("[installer] ERROR: " + message);
  process.exit(code);
}

function run(command, args, extraEnv = {}) {
  console.log("\n[installer] $ " + command + " " + args.join(" "));
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    shell: false,
  });
  if (result.error) fail("Could not start " + command + ": " + result.error.message);
  if (result.status !== 0) fail(command + " exited with status " + String(result.status));
}

function detectPnpm() {
  const direct = spawnSync("pnpm", ["--version"], { cwd: root, encoding: "utf8", shell: false });
  if (!direct.error && direct.status === 0) {
    const version = direct.stdout.trim();
    if (!/^10\.18\./.test(version)) fail("pnpm 10.18.x is required by this repository. Detected " + version + ".");
    return { command: "pnpm", prefix: [] };
  }
  const corepack = spawnSync("corepack", ["pnpm", "--version"], { cwd: root, encoding: "utf8", shell: false });
  if (!corepack.error && corepack.status === 0) {
    const version = corepack.stdout.trim();
    if (!/^10\.18\./.test(version)) fail("pnpm 10.18.x is required by this repository. Detected " + version + ".");
    return { command: "corepack", prefix: ["pnpm"] };
  }
  fail("pnpm 10.18.x is unavailable. Enable Corepack or install pnpm 10.18.x in the private cPanel terminal, then rerun.");
}

if (!mode) fail("Choose exactly one mode: --fresh-install or --existing-database.", 2);
if (process.env.NODE_ENV !== "production") fail("NODE_ENV must be production; load the installer-generated .env first.");
if (Number(process.versions.node.split(".")[0]) < 20) {
  fail("Node.js 20 or newer is required. Detected " + process.versions.node + ".");
}
if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET || !process.env.PASSWORD_PEPPER || !process.env.PUBLIC_APP_URL) {
  fail("DATABASE_URL, SESSION_SECRET, PASSWORD_PEPPER, and PUBLIC_APP_URL must be set in .env.");
}
if (process.env.SESSION_SECRET.length < 32 || process.env.PASSWORD_PEPPER.length < 32) {
  fail("SESSION_SECRET and PASSWORD_PEPPER must each contain at least 32 characters.");
}
if (await (async () => { try { await readFile(lockPath); return true; } catch { return false; } })()) {
  fail("An installation lock already exists. Refusing to rerun the installer.");
}

let bootstrap;
try {
  bootstrap = JSON.parse(await readFile(bootstrapPath, "utf8"));
} catch {
  fail("Missing or unreadable .installer-bootstrap.json. Open the protected installer wizard again or restore the private bootstrap file.");
}
if (bootstrap.mode !== mode) {
  fail("The selected CLI mode does not match the mode saved by the web wizard.");
}
if (mode === "fresh") {
  const email = String(bootstrap.adminEmail || "").trim().toLowerCase();
  const password = String(bootstrap.adminPassword || "");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("A valid administrator email is required for a fresh installation.");
  if (password.length < 12) fail("The administrator password must contain at least 12 characters.");
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
    fail("Fresh-install mode requires an EMPTY database. This database already contains " + tableCount + " tables. No migrations were run.");
  }
  if (mode === "existing" && tableCount === 0) {
    fail("Existing-database mode requires the database to be imported first. The selected database is empty.");
  }
  if (mode === "existing") {
    const [users] = await db.query(
      "SELECT COUNT(*) AS tableCount FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'",
    );
    if (Number(users[0].tableCount) !== 1) {
      fail("The imported database does not contain the expected users table. Check that the correct Arbitrade database was imported.");
    }
  }
  console.log("[installer] Database connection successful; " + tableCount + " table(s) detected.");
} catch (error) {
  if (error && typeof error.message === "string" && error.message.startsWith("[installer]")) throw error;
  fail("Could not connect to the selected database. Check DATABASE_URL and database privileges. " + (error?.code || error?.message || ""));
} finally {
  if (db) await db.end();
}

const pnpm = detectPnpm();
const runPnpm = (args) => run(pnpm.command, [...pnpm.prefix, ...args]);
runPnpm(["install", "--frozen-lockfile"]);

if (mode === "fresh") {
  console.log("\n[installer] Initializing a fresh database. Reward processing remains disabled unless separately enabled by an administrator.");
  runPnpm(["db:migrate"]);
  runPnpm(["db:portal-migrate"]);
  run("node", ["scripts/apply-mining-migrations.mjs", "--confirm-host-migration", "--confirm-production"]);
  run("node", ["scripts/apply-mining-initial-reward-rates.mjs", "--confirm-host-migration", "--confirm-production"]);
  runPnpm(["build"]);
  run("node", ["installer/create-admin.mjs"], {
    ADMIN_EMAIL: String(bootstrap.adminEmail).trim().toLowerCase(),
    ADMIN_PASSWORD: String(bootstrap.adminPassword),
  });
} else {
  console.log("\n[installer] Existing-database mode: applying forward migrations while preserving account credentials and financial records.");
  console.log("[installer] Confirm a current database backup exists before continuing.");
  runPnpm(["db:migrate"]);
  runPnpm(["db:portal-migrate"]);
  run("node", ["scripts/apply-mining-migrations.mjs", "--confirm-host-migration", "--confirm-production"]);
  run("node", ["scripts/apply-mining-initial-reward-rates.mjs", "--confirm-host-migration", "--confirm-production"]);
  runPnpm(["build"]);
}

await writeFile(lockPath, new Date().toISOString() + "\n", { mode: 0o600, flag: "wx" });
try {
  await unlink(bootstrapPath);
} catch (error) {
  fail("Installation lock was created, but the one-time bootstrap could not be removed. Restrict access and delete .installer-bootstrap.json manually: " + (error?.message || "unknown error"));
}
console.log("\n[installer] Installation steps completed.");
console.log("[installer] Start/restart the Node.js application, then run: pnpm installer:verify");
console.log("[installer] If SMTP is configured, test it with: pnpm installer:test-smtp --to=you@example.com");
console.log("[installer] Remove or rename the public installer directory after confirming the application works.");
