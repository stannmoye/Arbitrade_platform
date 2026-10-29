import { config } from "dotenv";
import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env"), override: false });

const checks = [];
function report(name, ok, detail) {
  checks.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}: ${detail}`);
}

export function inspectWorkerStartupContract(packageJson, wrapperSource, serverSource) {
  const failures = [];
  const start = String(packageJson?.scripts?.start || "");
  if (!start.includes("scripts/start-with-diagnostics.mjs")) {
    failures.push("package.json start must use scripts/start-with-diagnostics.mjs");
  }
  for (const [label, pattern] of [
    ["guarded main migrations", /runPhase\("main-database-migrations",\s*\["scripts\/guarded-main-migrate\.mjs"\]\)/],
    ["worker schema preflight", /runPhase\("worker-runtime-schema-preflight",\s*\["scripts\/ensure-worker-runtime-schema\.mjs"\]\)/],
    ["persistent application process", /runPhase\("application-server",\s*\["--trace-uncaught",\s*"--unhandled-rejections=strict",\s*"dist\/index\.js"\],\s*\{\},\s*true\)/],
  ]) {
    if (!pattern.test(wrapperSource)) failures.push(`startup wrapper is missing ${label}`);
  }
  for (const [label, pattern] of [
    ["five-second tier qualification poll", /setInterval\(\s*\(\)\s*=>\s*\{\s*void runTradingTierQualificationCycle\(\);\s*\},\s*5_000\s*\)/],
    ["bounded recurring Trading lifecycle cycle", /setInterval\(\s*\(\)\s*=>\s*\{\s*void runTradeCycle\(\)/],
    ["worker health instrumentation", /runMonitoredWorkerCycle\("trading-tier-qualification"/],
  ]) {
    if (!pattern.test(serverSource)) failures.push(`server entrypoint is missing ${label}`);
  }
  return failures;
}

export function inspectWorkerHealthSchema(columns, indexes) {
  const failures = [];
  const requiredColumns = [
    "id", "workerKey", "instanceId", "displayName", "status", "startedAt",
    "heartbeatAt", "lastSuccessAt", "lastFailureAt", "lastDurationMs",
    "consecutiveFailures", "lastError", "createdAt", "updatedAt",
  ];
  const columnNames = new Set(columns.map((row) => String(row.COLUMN_NAME ?? row.columnName)));
  for (const name of requiredColumns) {
    if (!columnNames.has(name)) failures.push(`worker_health_registry.${name}: required column is missing`);
  }
  const expectedIndexes = {
    worker_health_worker_instance_uq: { unique: true, columns: ["workerKey", "instanceId"] },
    worker_health_heartbeat_idx: { unique: false, columns: ["heartbeatAt"] },
    worker_health_status_heartbeat_idx: { unique: false, columns: ["status", "heartbeatAt"] },
  };
  for (const [name, expected] of Object.entries(expectedIndexes)) {
    const rows = indexes.filter((row) => String(row.INDEX_NAME ?? row.indexName) === name)
      .sort((a, b) => Number(a.SEQ_IN_INDEX ?? a.sequenceInIndex) - Number(b.SEQ_IN_INDEX ?? b.sequenceInIndex));
    const actualColumns = rows.map((row) => String(row.COLUMN_NAME ?? row.columnName));
    if (actualColumns.join(",") !== expected.columns.join(",")) {
      failures.push(`worker_health_registry.${name}: expected columns (${expected.columns.join(",")}), found (${actualColumns.join(",") || "missing"})`);
      continue;
    }
    const nonUniqueValues = rows.map((row) => Number(row.NON_UNIQUE ?? row.nonUnique));
    if (nonUniqueValues.some((value) => value !== (expected.unique ? 0 : 1))) {
      failures.push(`worker_health_registry.${name}: expected ${expected.unique ? "unique" : "non-unique"} index`);
    }
  }
  return failures;
}

async function main() {
  let packageJson;
  let wrapperSource;
  let serverSource;
  try {
    [packageJson, wrapperSource, serverSource] = await Promise.all([
      readFile(resolve(root, "package.json"), "utf8").then(JSON.parse),
      readFile(resolve(root, "scripts/start-with-diagnostics.mjs"), "utf8"),
      readFile(resolve(root, "server/_core/index.ts"), "utf8"),
    ]);
    const failures = inspectWorkerStartupContract(packageJson, wrapperSource, serverSource);
    report("Server-managed worker startup", failures.length === 0,
      failures.length ? failures.join("; ") : "Production start wrapper runs guarded migrations, worker schema preflight, and the persistent application process; Trading workers are registered in the server entrypoint.");
  } catch {
    report("Server-managed worker startup", false, "Could not read startup contract files. Verify the installed application package.");
  }

  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    report("Worker database schema", false, "DATABASE_URL is not configured in the private environment.");
  } else {
    let db;
    try {
      const url = new URL(rawUrl);
      if (!["mysql:", "mariadb:"].includes(url.protocol)) throw new Error("unsupported database protocol");
      if (url.protocol === "mariadb:") url.protocol = "mysql:";
      url.searchParams.set("timezone", "Z");
      db = await mysql.createConnection({ uri: url.toString(), connectTimeout: 8000 });
      const [tableRows] = await db.query(
        "SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (?, ?)",
        ["trading_tier_qualification_jobs", "worker_health_registry"],
      );
      const tables = new Set(tableRows.map((row) => String(row.tableName ?? row.TABLE_NAME)));
      report("Trading qualification queue table", tables.has("trading_tier_qualification_jobs"),
        tables.has("trading_tier_qualification_jobs") ? "Durable qualification queue exists." : "Missing trading_tier_qualification_jobs; run the guarded migration workflow after taking a backup.");
      report("Worker health registry table", tables.has("worker_health_registry"),
        tables.has("worker_health_registry") ? "Worker health registry exists." : "Missing worker_health_registry; run the guarded migration workflow after taking a backup.");
      if (tables.has("worker_health_registry")) {
        const [columns] = await db.query(
          "SELECT column_name AS columnName FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?",
          ["worker_health_registry"],
        );
        const [indexes] = await db.query(
          "SELECT index_name AS indexName, non_unique AS nonUnique, seq_in_index AS sequenceInIndex, column_name AS columnName FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=?",
          ["worker_health_registry"],
        );
        const failures = inspectWorkerHealthSchema(columns, indexes);
        report("Worker health registry schema", failures.length === 0,
          failures.length ? failures.join("; ") : "Required heartbeat, status, failure and index contracts are present.");
      }
    } catch (error) {
      const code = String(error?.code || "unavailable").replace(/[^A-Z0-9_]/gi, "").slice(0, 40);
      report("Worker database schema", false, `Read-only schema inspection failed (code: ${code || "unavailable"}). Check private DATABASE_URL and database availability; credentials are not displayed.`);
    } finally {
      if (db) await db.end().catch(() => {});
    }
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(`\nWorker runtime verification: ${checks.length - failed.length} passed, ${failed.length} failed.`);
  console.log(`Worker readiness: ${failed.length ? "NOT READY" : "READY"}`);
  if (failed.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
