import "dotenv/config";
import mysql from "mysql2/promise";
import { access, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const results = [];
const report = (name, ok, detail) => {
  results.push({ name, status: ok ? "PASS" : "FAIL", detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}: ${detail}`);
};

const url = process.env.DATABASE_URL;
if (!url) {
  report("Database configuration", false, "DATABASE_URL is not set. Load the private production .env first.");
} else {
  let db;
  try {
    const parsed = new URL(url);
    if (!["mysql:", "mariadb:"].includes(parsed.protocol)) throw new Error("DATABASE_URL must use mysql:// or mariadb://.");
    parsed.searchParams.set("timezone", "Z");
    db = await mysql.createConnection(parsed.toString());
    const [tables] = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE()");
    const names = new Set(tables.map((row) => String(row.TABLE_NAME ?? row.table_name)));
    report("Database connection", true, `Connected; ${names.size} table(s) found.`);
    report("Users table", names.has("users"), names.has("users") ? "users table exists." : "Expected users table is missing.");
    if (names.has("users")) {
      const [admins] = await db.query("SELECT COUNT(*) AS count FROM users WHERE role='admin'");
      report("Administrator", Number(admins[0].count) > 0, `${Number(admins[0].count)} administrator account(s) found.`);
    }
    report("Database schema", names.size > 0, names.size ? "Database is not empty." : "Database contains no tables.");
  } catch (error) {
    report("Database connection", false, error?.code || error?.message || "Connection failed.");
  } finally {
    if (db) await db.end();
  }
}

try {
  const build = resolve(root, "dist/index.js");
  await access(build);
  const info = await stat(build);
  report("Production build", info.isFile() && info.size > 0, info.isFile() ? `dist/index.js exists (${info.size} bytes).` : "Build artifact is not a regular file.");
} catch {
  report("Production build", false, "dist/index.js is missing; run pnpm build.");
}

const appUrl = process.env.PUBLIC_APP_URL;
if (!appUrl) {
  report("Application health", false, "PUBLIC_APP_URL is not configured.");
} else {
  try {
    const healthUrl = new URL("/api/health", appUrl);
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(8000), redirect: "error" });
    const body = await response.json().catch(() => null);
    const ok = response.ok && body?.status === "ok";
    report("Application health", ok, ok ? "GET /api/health returned status=ok." : `Health endpoint returned HTTP ${response.status}; inspect the cPanel/VPS application logs.`);
  } catch (error) {
    report("Application health", false, error?.message || "Health endpoint could not be reached. Start/restart the application and rerun.");
  }
}

const failed = results.filter((item) => item.status === "FAIL");
console.log(`\nInstaller verification: ${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
