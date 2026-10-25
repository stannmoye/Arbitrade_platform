import { spawnSync } from "node:child_process";
import { lstat, readFile, unlink, writeFile } from "node:fs/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { ensureSessionSecret } from "./session-secret.mjs";
import { classifyMainMigrationPreflight, loadExpectedMainMigrationHistory, validateMainMigrationHistory } from "./main-migration-preflight.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fresh = process.argv.includes("--fresh-install");
const existing = process.argv.includes("--existing-database");
const mode = fresh === existing ? null : fresh ? "fresh" : "existing";
const bootstrapPath = resolve(root, ".installer-bootstrap.json");
const lockPath = resolve(root, "installer/.installed");
const progressPath = resolve(root, "installer/.install-in-progress.json");
function loadPrivateEnv(path) {
  let contents;
  try {
    contents = readFileSync(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return;
    fail("Cannot read the private .env file. Complete the protected browser wizard and verify file permissions.");
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) continue;
    let value = match[2];
    if (value.startsWith('"')) {
      try { value = JSON.parse(value); } catch { fail("The private .env file contains an invalid quoted value. Reopen the wizard or repair the file securely."); }
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    process.env[match[1]] = value;
  }
}
loadPrivateEnv(resolve(root, ".env"));

function fail(message, code = 1) {
  console.error("[installer] ERROR: " + message);
  process.exit(code);
}

async function stateMarkerExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    fail("Cannot safely inspect installer state markers. Check filesystem permissions and directory structure before retrying.");
  }
}

function recordCommandFailure(command, detail) {
  try {
    // Persist only non-secret diagnostic metadata; never save command arguments or environment values.
    const failed = {
      ...progress,
      status: "failed",
      failedAt: new Date().toISOString(),
      failure: { command, detail: String(detail).slice(0, 240) },
    };
    writeFileSync(progressPath, JSON.stringify(failed, null, 2) + "\n", { mode: 0o600 });
  } catch {
    // Preserve the original error if the private progress marker cannot be updated.
  }
}

function run(command, args, extraEnv = {}) {
  console.log("\n[installer] $ " + command + " " + args.join(" "));
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    recordCommandFailure(command, result.error.code || "spawn failed");
    fail("Could not start " + command + ": " + result.error.message);
  }
  if (result.status !== 0) {
    recordCommandFailure(command, "exit status " + String(result.status));
    fail(command + " exited with status " + String(result.status));
  }
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
if (mode === "existing" && !process.argv.includes("--confirm-existing-migrations")) {
  fail("Existing-database mode applies forward database migrations. Verify a current restorable backup exists, inspect DATABASE_URL, then rerun with --existing-database --confirm-existing-migrations.");
}
if (process.env.NODE_ENV !== "production") fail("NODE_ENV must be production; load the installer-generated .env first.");
if (Number(process.versions.node.split(".")[0]) < 20) {
  fail("Node.js 20 or newer is required. Detected " + process.versions.node + ".");
}
if (!process.env.DATABASE_URL || !process.env.PASSWORD_PEPPER || !process.env.PUBLIC_APP_URL) {
  fail("DATABASE_URL, PASSWORD_PEPPER, and PUBLIC_APP_URL must be configured by the installer or private host environment.");
}
let publicAppUrl;
try {
  publicAppUrl = new URL(process.env.PUBLIC_APP_URL);
} catch {
  fail("PUBLIC_APP_URL must be a valid public HTTP(S) URL; the configured value is not displayed.");
}
if (!["http:", "https:"].includes(publicAppUrl.protocol) || publicAppUrl.username || publicAppUrl.password) {
  fail("PUBLIC_APP_URL must use HTTP(S) and must not contain a username or password.");
}
if (process.env.PASSWORD_PEPPER.length < 32) {
  fail("PASSWORD_PEPPER must contain at least 32 characters.");
}
if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
  fail("SESSION_SECRET must contain at least 32 characters.");
}
if (await stateMarkerExists(lockPath)) {
  fail("An installation lock already exists. Refusing to rerun the installer.");
}
if (await stateMarkerExists(progressPath)) {
  fail("A previous installation attempt left installer/.install-in-progress.json. Do not rerun migrations blindly. Inspect the saved stage and private logs, verify the database backup and migration state, then remove this marker only after an administrator has approved recovery.");
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
if (!Array.isArray(bootstrap.databaseTableNames) || !Number.isInteger(bootstrap.databaseTableCount)) {
  fail("The wizard did not save a database inventory. Re-open the browser wizard and verify the database again before running migrations.");
}
if (bootstrap.databaseTableCount !== bootstrap.databaseTableNames.length) {
  fail("The saved database inventory is inconsistent. Do not continue; rerun the wizard's database verification.");
}
if (mode === "existing" && bootstrap.backupConfirmed !== true) {
  fail("Existing-database migration requires backup confirmation in the browser wizard. Verify a current restorable backup and rerun the wizard.");
}
if (mode === "fresh" && bootstrap.databaseTableCount !== 0) {
  fail("The browser wizard did not verify an empty database for fresh installation. No migrations were run.");
}
if (mode === "fresh") {
  const email = String(bootstrap.adminEmail || "").trim().toLowerCase();
  const customerEmail = String(bootstrap.customerEmail || "").trim().toLowerCase();
  const password = String(bootstrap.adminPassword || "");
  const customerPassword = String(bootstrap.customerPassword || "");
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("A valid administrator email of at most 320 characters is required for a fresh installation.");
  if (password.length < 12 || password.length > 200) fail("The administrator password must be between 12 and 200 characters.");
  if (!customerEmail || customerEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) fail("A valid customer email of at most 320 characters is required for a fresh installation.");
  if (customerPassword.length < 12 || customerPassword.length > 200) fail("The customer password must be between 12 and 200 characters.");
  if (email === customerEmail) fail("Administrator and customer accounts must use different email addresses.");
  if (password === customerPassword) fail("Administrator and customer passwords must be different.");
}

try {
  const sessionSecret = await ensureSessionSecret({ root, env: process.env });
  if (sessionSecret.generated) {
    console.log("[installer] Generated and securely persisted the missing session secret.");
  }
} catch {
  fail("SESSION_SECRET was missing and could not be generated and persisted securely. Check private application-root permissions.");
}
if (process.env.SESSION_SECRET.length < 32) {
  fail("SESSION_SECRET must contain at least 32 characters.");
}

const pnpm = detectPnpm();
const installResult = spawnSync(pnpm.command, [...pnpm.prefix, "install", "--frozen-lockfile"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: false,
});
if (installResult.error) {
  fail("Could not start the locked dependency installation. Verify pnpm 10.18.x and hosting permissions, then retry.");
}
if (installResult.status !== 0) {
  fail("The locked dependency installation failed. No database migrations were run; resolve the package/lockfile error and retry.");
}
let mysql;
try {
  mysql = (await import("mysql2/promise")).default;
} catch {
  fail("Required MySQL driver is still unavailable after the locked dependency installation. Check the pnpm output and package lockfile.");
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
  const [tableRows] = await db.query(
    "SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name",
  );
  const currentTableNames = tableRows.map((row) => String(row.tableName)).sort();
  const tableCount = currentTableNames.length;
  const savedTableNames = [...bootstrap.databaseTableNames].map(String).sort();
  if (tableCount !== bootstrap.databaseTableCount || JSON.stringify(currentTableNames) !== JSON.stringify(savedTableNames)) {
    fail("The target database table inventory changed after the browser wizard verified it. Stop and review the selected DATABASE_URL; rerun the wizard's database check before any migration.");
  }
  if (mode === "fresh" && tableCount !== 0) {
    fail("Fresh-install mode requires an EMPTY database. This database already contains " + tableCount + " tables. No migrations were run.");
  }
  if (mode === "existing" && tableCount === 0) {
    fail("Existing-database mode requires the database to be imported first. The selected database is empty.");
  }
  if (mode === "existing") {
    const [trackerTables] = await db.query(
      "SELECT COUNT(*) AS tableCount FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '__drizzle_migrations'",
    );
    const trackerExists = Number(trackerTables[0].tableCount) === 1;
    let trackerRows = [];
    let trackerHistoryValid = false;
    if (trackerExists) {
      try {
        const [rows] = await db.query("SELECT hash, created_at FROM __drizzle_migrations");
        trackerRows = rows;
        const { migrations } = await loadExpectedMainMigrationHistory(root);
        trackerHistoryValid = validateMainMigrationHistory(trackerRows, migrations).allowed;
      } catch {
        fail("Could not verify the imported database migration history against the repository journal. No migrations were run; have an administrator review the schema and migration baseline.");
      }
    }
    const trackerCount = trackerRows.length;
    const migrationPreflight = classifyMainMigrationPreflight({ mode, tableCount, trackerExists, trackerCount, trackerHistoryValid });
    if (!migrationPreflight.allowed) {
      fail(migrationPreflight.reason + " No migrations were run. Take a restorable backup and have an administrator review the schema and establish a verified migration baseline before retrying.");
    }

    const [users] = await db.query(
      "SELECT COUNT(*) AS tableCount FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'",
    );
    if (Number(users[0].tableCount) !== 1) {
      fail("The imported database does not contain the expected users table. Check that the correct Arbitrade database was imported.");
    }
  }

  console.log("[installer] Database connection successful; " + tableCount + " table(s) detected. Inventory matches the browser wizard.");
} catch (error) {
  if (error && typeof error.message === "string" && error.message.startsWith("[installer]")) throw error;
  const errorCode = String(error?.code || "unavailable").replace(/[^A-Z0-9_]/gi, "").slice(0, 40);
  fail("Could not connect to the selected database. Check DATABASE_URL and database privileges. Database error code: " + (errorCode || "unavailable"));
} finally {
  if (db) {
    try {
      await db.end();
    } catch (error) {
      const errorCode = String(error?.code || "unknown").replace(/[^A-Z0-9_]/gi, "").slice(0, 40);
      fail("Could not close the selected database connection safely. Database error code: " + (errorCode || "unknown"));
    }
  }
}

const runPnpm = (args) => run(pnpm.command, [...pnpm.prefix, ...args]);
const progress = { mode, status: "running", startedAt: new Date().toISOString(), stage: "preparing-dependencies" };
async function setStage(stage) {
  progress.status = "running";
  delete progress.failure;
  delete progress.failedAt;
  progress.stage = stage;
  progress.stageStartedAt = new Date().toISOString();
  progress.updatedAt = progress.stageStartedAt;
  await writeFile(progressPath, JSON.stringify(progress, null, 2) + "\n", { mode: 0o600 });
  console.log("\n[installer] Stage: " + stage);
}
await writeFile(progressPath, JSON.stringify(progress, null, 2) + "\n", { mode: 0o600, flag: "wx" });
if (mode === "fresh") {
  console.log("\n[installer] Initializing a fresh database. Reward processing remains disabled unless separately enabled by an administrator.");
  await setStage("main-database-migrations");
  run("node", ["scripts/guarded-main-migrate.mjs"]);
  await setStage("portal-database-migrations");
  runPnpm(["db:portal-migrate"]);
  await setStage("mining-database-migrations");
  run("node", ["scripts/apply-mining-migrations.mjs", "--confirm-host-migration", "--confirm-production"]);
  await setStage("initial-reward-rate-migration");
  run("node", ["scripts/apply-mining-initial-reward-rates.mjs", "--confirm-host-migration", "--confirm-production"]);
  await setStage("worker-runtime-schema");
  run("node", ["scripts/ensure-worker-runtime-schema.mjs"]);
  await setStage("worker-schema-verification");
  run("node", ["scripts/verify-worker-schema.mjs"]);
  await setStage("production-build");
  runPnpm(["build"]);
  await setStage("initial-account-creation");
  run("node", ["installer/create-initial-accounts.mjs"], {
    ADMIN_EMAIL: String(bootstrap.adminEmail).trim().toLowerCase(),
    ADMIN_PASSWORD: String(bootstrap.adminPassword),
    CUSTOMER_EMAIL: String(bootstrap.customerEmail).trim().toLowerCase(),
    CUSTOMER_PASSWORD: String(bootstrap.customerPassword),
  });
} else {
  console.log("\n[installer] Existing-database mode: applying forward migrations while preserving account credentials and financial records.");
  console.log("[installer] Confirm a current database backup exists before continuing.");
  await setStage("main-database-migrations");
  run("node", ["scripts/guarded-main-migrate.mjs"]);
  await setStage("portal-database-migrations");
  runPnpm(["db:portal-migrate"]);
  await setStage("mining-database-migrations");
  run("node", ["scripts/apply-mining-migrations.mjs", "--confirm-host-migration", "--confirm-production"]);
  await setStage("initial-reward-rate-migration");
  run("node", ["scripts/apply-mining-initial-reward-rates.mjs", "--confirm-host-migration", "--confirm-production"]);
  await setStage("worker-runtime-schema");
  run("node", ["scripts/ensure-worker-runtime-schema.mjs"]);
  await setStage("worker-schema-verification");
  run("node", ["scripts/verify-worker-schema.mjs"]);
  await setStage("production-build");
  runPnpm(["build"]);
}

await setStage("finalizing-installation");
await writeFile(lockPath, new Date().toISOString() + "\n", { mode: 0o600, flag: "wx" });
try {
  await unlink(bootstrapPath);
} catch (error) {
  const errorCode = String(error?.code || "unknown").replace(/[^A-Z0-9_]/gi, "").slice(0, 40);
  fail("Installation lock was created, but the one-time bootstrap could not be removed. Restrict access and delete .installer-bootstrap.json manually. Error code: " + (errorCode || "unknown"));
}
await unlink(progressPath);
console.log("\n[installer] Installation steps completed.");
console.log("[installer] Start/restart the Node.js application, then run: pnpm installer:verify");
console.log("[installer] Configure and test email after admin sign-in: Communications → Email & SMTP Settings.");
console.log("[installer] Remove or rename the public installer directory after confirming the application works.");
