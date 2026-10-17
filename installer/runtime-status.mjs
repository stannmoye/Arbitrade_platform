import { config } from "dotenv";
import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env"), override: false });

const args = new Set(process.argv.slice(2));
const restartVps = args.has("--restart-vps");
const help = args.has("--help") || args.has("-h");
const unknown = [...args].filter((arg) => !["--restart-vps", "--help", "-h"].includes(arg));

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}
function pass(message) {
  console.log(`[PASS] ${message}`);
}
function info(message) {
  console.log(`[INFO] ${message}`);
}
function commandExists(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8", shell: false, timeout: 3000 });
  return !result.error;
}
async function healthCheck(url, timeoutMs = 2500) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
    const body = await response.json().catch(() => null);
    return { ok: response.ok && body?.status === "ok", status: response.status, bodyStatus: body?.status };
  } catch (error) {
    return { ok: false, error: error?.cause?.code || error?.name || "request failed" };
  }
}
async function waitForLocalHealth(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let last = { ok: false, error: "not checked" };
  while (Date.now() < deadline) {
    last = await healthCheck(url, 2000);
    if (last.ok) return last;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
  }
  return last;
}

if (unknown.length) {
  console.error(`Unknown option(s): ${unknown.join(", ")}`);
  console.error("Usage: node installer/runtime-status.mjs [--restart-vps]");
  process.exit(2);
}
if (help) {
  console.log("Usage: node installer/runtime-status.mjs [--restart-vps]");
  console.log("Checks the production build, configured port, local health endpoint, and VPS systemd service.");
  console.log("--restart-vps restarts arbitrade.service via systemctl (Linux VPS only; run with appropriate privileges).");
  process.exit(0);
}

let packageJson;
try {
  packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
} catch {
  fail("Cannot read package.json from the repository root.");
}
const startCommand = String(packageJson?.scripts?.start || "");
if (startCommand.includes("NODE_ENV=production") && startCommand.includes("node dist/index.js")) {
  pass("Production start script is configured.");
} else {
  fail("package.json start script should run NODE_ENV=production node dist/index.js.");
}

try {
  await access(resolve(root, "dist/index.js"));
  pass("Production build dist/index.js exists.");
} catch {
  fail("dist/index.js is missing. Run pnpm build before starting the application.");
}

const rawPort = process.env.PORT || "3000";
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  fail("PORT must be a valid TCP port from 1 to 65535.");
  process.exit(1);
}
const localHealthUrl = `http://127.0.0.1:${port}/api/health`;
info(`Checking local health endpoint: ${localHealthUrl}`);

if (restartVps) {
  if (process.platform !== "linux" || !commandExists("systemctl")) {
    fail("--restart-vps is supported only on a Linux VPS with systemctl. On cPanel, restart from Setup Node.js App.");
    process.exit(1);
  }
  if (process.getuid && process.getuid() !== 0) {
    fail("Restart requires service-management privileges. Run: sudo node installer/runtime-status.mjs --restart-vps");
    process.exit(1);
  }
  const active = spawnSync("systemctl", ["is-active", "--quiet", "arbitrade.service"], {
    encoding: "utf8",
    shell: false,
    timeout: 5000,
  });
  if (active.status !== 0) {
    fail("arbitrade.service is not currently active. Inspect it with: sudo systemctl status arbitrade.service --no-pager");
    info("This command does not create or repair a missing systemd service.");
    process.exit(1);
  }
  const restarted = spawnSync("systemctl", ["restart", "arbitrade.service"], {
    encoding: "utf8",
    shell: false,
    timeout: 15000,
  });
  if (restarted.error || restarted.status !== 0) {
    fail("systemctl could not restart arbitrade.service. Inspect: sudo journalctl -u arbitrade.service -n 100 --no-pager");
    process.exit(1);
  }
  pass("Requested systemd restart for arbitrade.service.");
}

const localHealth = await (restartVps ? waitForLocalHealth(localHealthUrl) : healthCheck(localHealthUrl, 4000));
if (localHealth.ok) {
  pass("Local /api/health returned status=ok.");
} else {
  fail(`Local health endpoint did not return status=ok (${localHealth.error || `HTTP ${localHealth.status}; status=${localHealth.bodyStatus || "unknown"}`}).`);
  info("Check the configured PORT, startup file dist/index.js, environment variables, and application logs.");
  if (process.platform === "linux" && commandExists("systemctl")) {
    info("VPS logs: sudo journalctl -u arbitrade.service -n 100 --no-pager");
    info("VPS status: sudo systemctl status arbitrade.service --no-pager");
  } else {
    info("cPanel: open Setup Node.js App, confirm Node.js 20+, application root and startup file dist/index.js, then click Restart.");
  }
  process.exitCode = 1;
}

if (!restartVps && process.platform === "linux" && commandExists("systemctl")) {
  const status = spawnSync("systemctl", ["is-active", "arbitrade.service"], {
    encoding: "utf8",
    shell: false,
    timeout: 5000,
  });
  info(`VPS systemd service state: ${status.stdout?.trim() || "not available"}.`);
}
if (!restartVps) {
  info("To restart on a configured VPS: sudo node installer/runtime-status.mjs --restart-vps");
  info("On cPanel, use Setup Node.js App → Restart; this script cannot control the cPanel process manager.");
}
