import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const env = { ...process.env, NODE_ENV: "production" };

console.log("[startup] Applying main, portal and mining migrations before server workers start.");
const result = spawnSync(
  process.execPath,
  [resolve(root, "scripts/migrate-all.mjs")],
  { cwd: root, env, stdio: "inherit", shell: false },
);

if (result.error) {
  console.error("[startup] Migration workflow could not be started:", result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  console.error("[startup] Database migrations or required-table verification failed; server startup is blocked.");
  process.exit(result.status ?? 1);
}

console.log("[startup] Schema verified. Starting Arbitrade.");
await import(resolve(root, "dist/index.js"));
