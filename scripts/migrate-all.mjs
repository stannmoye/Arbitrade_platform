import "dotenv/config";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const confirmFlags = ["--confirm-host-migration", "--confirm-production"];

// One canonical, ordered migration path for VPS, Docker, sandbox and cPanel hosts.
// The main Drizzle journal intentionally coexists with the portal and mining
// migration ledgers; finishing only the main ledger is not a complete install.
const steps = [
  ["main Drizzle migrations", ["scripts/guarded-main-migrate.mjs"]],
  ["portal migrations", ["scripts/apply-portal-migrations.mjs"]],
  ["mining schema and catalog migrations", ["scripts/apply-mining-migrations.mjs", ...confirmFlags]],
  ["initial mining reward-rate metadata", ["scripts/apply-mining-initial-reward-rates.mjs", ...confirmFlags]],
  ["mining schema repair", ["scripts/ensure-mining-current-schema.mjs"]],
  ["worker runtime schema repair", ["scripts/ensure-worker-runtime-schema.mjs"]],
  ["required application/worker table verification", ["scripts/verify-worker-schema.mjs"]],
];

for (const [label, args] of steps) {
  console.log(`[migrate-all] Stage: ${label}`);
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    console.error(`[migrate-all] ${label} could not be started: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[migrate-all] STOPPED at: ${label} (exit status ${result.status ?? "unknown"}).`);
    console.error("[migrate-all] The server must not start with a partially migrated schema.");
    process.exit(result.status ?? 1);
  }
}

console.log("[migrate-all] PASS: every migration chain and worker-table verification completed.");
