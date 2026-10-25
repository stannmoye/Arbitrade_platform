import { config } from "dotenv";
import mysql from "mysql2/promise";
import { access, readFile } from "node:fs/promises";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env"), override: false });
const args = new Set(process.argv.slice(2));
if ([...args].some((arg) => !["--help", "-h"].includes(arg))) {
  console.error("Unknown option. Usage: pnpm installer:diagnose");
  process.exit(2);
}
if (args.has("--help") || args.has("-h")) {
  console.log("Usage: pnpm installer:diagnose");
  console.log("Checks deployment configuration, production build, database connectivity, local port, and health endpoint.");
  console.log("It never prints secret values and does not change application or database state.");
  process.exit(0);
}

const results = [];
function report(name, ok, detail, warning = false) {
  const status = warning ? "WARN" : ok ? "PASS" : "FAIL";
  results.push({ name, ok: ok || warning, warning });
  console.log(`[${status}] ${name}: ${detail}`);
}
function secretPresent(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0;
}
function commandVersion(command, expected, label) {
  const result = spawnSync(command, ["--version"], { cwd: root, encoding: "utf8", shell: false, timeout: 4000 });
  if (result.error || result.status !== 0) {
    report(label, false, `${command} is unavailable in this process PATH.`);
    return "";
  }
  const version = (result.stdout || result.stderr || "").trim().split(/\s+/)[0];
  const ok = expected.test(version);
  report(label, ok, ok ? `${version} detected.` : `${version} detected; expected a compatible version.`);
  return version;
}
async function fileExists(path) {
  try { await access(resolve(root, path)); return true; } catch { return false; }
}
async function tcpCheck(host, port, timeoutMs = 2500) {
  return new Promise((resolveResult) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveResult(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ ok: true }));
    socket.once("timeout", () => finish({ ok: false, code: "TIMEOUT" }));
    socket.once("error", (error) => finish({ ok: false, code: error.code || "CONNECTION_ERROR" }));
  });
}
async function healthCheck(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(3000),
      redirect: "error",
    });
    const body = await response.json().catch(() => null);
    return { ok: response.ok && body?.status === "ok", status: response.status, bodyStatus: body?.status };
  } catch (error) {
    return { ok: false, code: error?.cause?.code || error?.name || "REQUEST_FAILED" };
  }
}

report("Node.js runtime", Number(process.versions.node.split(".")[0]) >= 20,
  Number(process.versions.node.split(".")[0]) >= 20 ? `Node.js ${process.versions.node} detected.` : `Node.js ${process.versions.node}; use Node.js 20 or newer.`);
commandVersion("pnpm", /^10\.18\./, "pnpm version");
const packageExists = await fileExists("package.json");
let packageJson = null;
if (packageExists) {
  try { packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")); } catch { /* reported below */ }
}
report("Application metadata", Boolean(packageJson), packageJson ? "package.json is readable." : "package.json is missing or invalid.");
const start = String(packageJson?.scripts?.start || "");
report("Production startup command", start.includes("NODE_ENV=production") && start.includes("node dist/index.js"),
  start.includes("NODE_ENV=production") && start.includes("node dist/index.js") ? "Expected production entry point is configured." : "Expected start script: NODE_ENV=production node dist/index.js.");
report("Production build", await fileExists("dist/index.js"),
  await fileExists("dist/index.js") ? "dist/index.js exists." : "dist/index.js is missing; run pnpm build.");

for (const name of ["DATABASE_URL", "SESSION_SECRET", "PASSWORD_PEPPER", "PUBLIC_APP_URL"]) {
  report(`Environment: ${name}`, secretPresent(name), secretPresent(name) ? "Configured (value hidden)." : "Missing or empty; configure it in the private .env or host environment.");
}
if (secretPresent("PUBLIC_APP_URL")) {
  try {
    const appUrl = new URL(process.env.PUBLIC_APP_URL);
    const valid = ["https:", "http:"].includes(appUrl.protocol) && Boolean(appUrl.hostname);
    report("Public application URL", valid && appUrl.protocol === "https:",
      !valid ? "PUBLIC_APP_URL must be an absolute HTTP(S) URL." : appUrl.protocol === "https:" ? "Absolute HTTPS URL configured." : "HTTP is configured; use HTTPS for production.", valid && appUrl.protocol !== "https:");
  } catch {
    report("Public application URL", false, "PUBLIC_APP_URL must be an absolute HTTP(S) URL.");
  }
}

const rawPort = process.env.PORT || "3000";
const port = Number(rawPort);
const validPort = Number.isInteger(port) && port >= 1 && port <= 65535;
report("Application port configuration", validPort, validPort ? `PORT ${port} is valid.` : "PORT must be an integer between 1 and 65535.");
if (validPort) {
  const listener = await tcpCheck("127.0.0.1", port);
  report("Local TCP listener", listener.ok,
    listener.ok ? `A process accepts connections on 127.0.0.1:${port}.` : `No TCP listener confirmed on 127.0.0.1:${port} (reason: ${listener.code}). Check PORT and restart the app.`);
  const health = await healthCheck(port);
  report("Application health endpoint", health.ok,
    health.ok ? "GET /api/health returned status=ok." : `Health check failed (${health.code || `HTTP ${health.status}; status=${health.bodyStatus || "unknown"}`}). Check startup logs and environment configuration.`);
}

if (!secretPresent("DATABASE_URL")) {
  report("Database connectivity", false, "Skipped because DATABASE_URL is not configured.");
} else {
  let connection;
  try {
    const dbUrl = new URL(process.env.DATABASE_URL);
    if (!["mysql:", "mariadb:"].includes(dbUrl.protocol) || !dbUrl.hostname || !dbUrl.pathname.slice(1)) {
      throw Object.assign(new Error("Invalid database URL"), { code: "INVALID_DATABASE_URL" });
    }
    if (dbUrl.protocol === "mariadb:") dbUrl.protocol = "mysql:";
    dbUrl.searchParams.set("connectTimeout", "5000");
    connection = await mysql.createConnection(dbUrl.toString());
    await connection.query("SELECT 1");
    report("Database connectivity", true, "Connection and SELECT 1 succeeded. Credentials and host are not displayed.");
  } catch (error) {
    const code = error?.code || error?.cause?.code || "DATABASE_CHECK_FAILED";
    report("Database connectivity", false, `Connection failed (${code}). Verify database name, user grants, host, port, and password in the private environment configuration.`);
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}

report("Email delivery", true, "Optional; configure and test it from the authenticated admin portal after installation.", true);

const failed = results.filter((item) => !item.ok).length;
const warnings = results.filter((item) => item.warning).length;
console.log("\nDeployment diagnostics summary");
console.log(`Checks failed: ${failed}; warnings: ${warnings}.`);
if (failed) {
  console.log("NOT READY: address the failed checks above, then rerun pnpm installer:diagnose.");
  process.exitCode = 1;
} else if (warnings) {
  console.log("READY WITH WARNINGS: review warnings above before production traffic.");
} else {
  console.log("READY: all checks in this diagnostic passed. This is not a full feature or security audit.");
}
