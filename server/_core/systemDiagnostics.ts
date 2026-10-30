import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { getWorkerHealthSummary, sanitizeWorkerErrorMessage, type WorkerHealthSummary } from "./workerHealth";

type CheckStatus = "pass" | "warning" | "fail" | "not_run";
type DiagnosticCheck = { id: string; area: string; status: CheckStatus; title: string; detail: string; recommendation: string | null };

export function summarizeDiagnosticChecks(checks: DiagnosticCheck[]) {
  return checks.reduce((summary, check) => {
    summary[check.status] += 1;
    return summary;
  }, { pass: 0, warning: 0, fail: 0, not_run: 0 });
}

function check(id: string, area: string, status: CheckStatus, title: string, detail: string, recommendation: string | null = null): DiagnosticCheck {
  return { id, area, status, title, detail, recommendation };
}

async function readSourceFile(path: string): Promise<string | null> {
  try {
    return await readFile(resolve(process.cwd(), path), "utf8");
  } catch {
    return null;
  }
}

export type CodeReviewMarker = { path: string; line: number; marker: string };

export function findCodeReviewMarkers(path: string, source: string): CodeReviewMarker[] {
  const markers: CodeReviewMarker[] = [];
  const pattern = /\b(TODO|FIXME|XXX|HACK)\b|NotImplementedError|not implemented/gi;
  source.split(/\r?\n/).forEach((line, index) => {
    for (const match of line.matchAll(pattern)) {
      markers.push({ path, line: index + 1, marker: String(match[0]).toUpperCase().replace(/\s+/g, "_") });
    }
  });
  return markers;
}

const SOURCE_SCAN_ROOTS = ["client/src", "server", "shared", "drizzle", "scripts", "installer"] as const;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql"]);
const SOURCE_SCAN_MAX_FILES = 6_000;
const SOURCE_SCAN_MAX_BYTES = 50 * 1024 * 1024;
const SOURCE_REVIEW_MAX_BYTES = 20 * 1024 * 1024;
const SOURCE_REVIEW_MAX_FILE_BYTES = 512 * 1024;
const SOURCE_REVIEW_MAX_MARKERS = 250;

async function collectSourceInventory() {
  const files: Array<{ path: string; area: string; bytes: number; testFile: boolean }> = [];
  const reviewMarkers: CodeReviewMarker[] = [];
  const scanIssues: string[] = [];
  const areaCounts: Record<string, { files: number; tests: number; bytes: number }> = {};
  let totalBytes = 0;
  let reviewBytes = 0;
  let reviewScanComplete = true;
  let truncated = false;

  async function walk(directory: string, area: string, depth: number): Promise<void> {
    if (depth > 10 || truncated) return;
    let entries;
    try {
      entries = await readdir(resolve(process.cwd(), directory), { withFileTypes: true });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "READ_FAILED";
      scanIssues.push(`${directory}: ${code}`);
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (["node_modules", ".git", "dist", "coverage", ".cache", "build", "vendor"].includes(entry.name)) continue;
        await walk(`${directory}/${entry.name}`, area, depth + 1);
        if (truncated) return;
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = entry.name.includes(".") ? entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase() : "";
      if (!SOURCE_EXTENSIONS.has(extension)) continue;
      const relativePath = `${directory}/${entry.name}`;
      let bytes = 0;
      try {
        bytes = (await stat(resolve(process.cwd(), relativePath))).size;
      } catch {
        scanIssues.push(`${relativePath}: STAT_FAILED`);
        continue;
      }
      if (files.length >= SOURCE_SCAN_MAX_FILES || totalBytes + bytes > SOURCE_SCAN_MAX_BYTES) {
        truncated = true;
        return;
      }
      const testFile = /(^|\.)(test|spec)\./i.test(entry.name) || relativePath.includes("/__tests__/");
      files.push({ path: relativePath, area, bytes, testFile });
      totalBytes += bytes;
      const counts = areaCounts[area] ?? (areaCounts[area] = { files: 0, tests: 0, bytes: 0 });
      counts.files += 1;
      if (testFile) counts.tests += 1;
      counts.bytes += bytes;

      if (bytes > SOURCE_REVIEW_MAX_FILE_BYTES || reviewBytes + bytes > SOURCE_REVIEW_MAX_BYTES) {
        reviewScanComplete = false;
        continue;
      }
      try {
        const source = await readFile(resolve(process.cwd(), relativePath), "utf8");
        reviewBytes += bytes;
        if (reviewMarkers.length < SOURCE_REVIEW_MAX_MARKERS) {
          reviewMarkers.push(...findCodeReviewMarkers(relativePath, source).slice(0, SOURCE_REVIEW_MAX_MARKERS - reviewMarkers.length));
        }
      } catch {
        reviewScanComplete = false;
      }
    }
  }

  for (const area of SOURCE_SCAN_ROOTS) await walk(area, area, 0);
  return {
    complete: !truncated && scanIssues.length === 0 && reviewScanComplete,
    truncated,
    filesScanned: files.length,
    testFiles: files.filter((file) => file.testFile).length,
    totalBytes,
    areas: areaCounts,
    files,
    reviewMarkers,
    reviewScanComplete,
    scanIssues: scanIssues.slice(0, 50),
    limits: { maxFiles: SOURCE_SCAN_MAX_FILES, maxSourceBytes: SOURCE_SCAN_MAX_BYTES, maxReviewBytes: SOURCE_REVIEW_MAX_BYTES, maxReviewFileBytes: SOURCE_REVIEW_MAX_FILE_BYTES, maxReviewMarkers: SOURCE_REVIEW_MAX_MARKERS },
  };
}

const FEATURE_SOURCE_REQUIREMENTS = [
  { key: "authentication-and-sessions", label: "Authentication and sessions", files: ["server/_core/localAuth.ts", "server/authSessions.ts"] },
  { key: "customer-and-admin-portals", label: "Customer and administrator portals", files: ["client/src/App.tsx", "server/routers.ts"] },
  { key: "wallets-and-ledger", label: "Wallets and ledger", files: ["server/db.ts", "drizzle/schema.ts"] },
  { key: "trading-and-settlement", label: "Trading and settlement", files: ["server/routers.ts", "server/_core/workerHealth.ts", "server/db.ts"] },
  { key: "notifications-and-email", label: "Notifications and email", files: ["server/email.ts", "server/emailQueue.ts"] },
  { key: "mining", label: "Mining", files: ["server/mining.ts", "server/mining-admin.ts"] },
  { key: "verification-and-kyc", label: "Verification and KYC", files: ["server/kyc.ts", "server/routers.ts"] },
  { key: "privacy", label: "Privacy centre", files: ["server/privacy.ts", "server/routers.ts"] },
  { key: "installer-and-deployment", label: "Installer and deployment", files: ["installer/diagnose-deployment.mjs", "scripts/start-with-diagnostics.mjs"] },
] as const;

function classifyWorkerChecks(workerHealth: WorkerHealthSummary, checks: DiagnosticCheck[]) {
  for (const worker of workerHealth.workers) {
    if (worker.status === "healthy" || worker.status === "running") continue;
    const status: CheckStatus = worker.status === "degraded" ? "fail" : "warning";
    checks.push(check(
      `worker:${worker.workerKey}:${worker.instanceId}`,
      "workers",
      status,
      `${worker.displayName}: ${worker.status.replace("_", " ")}`,
      worker.lastError || (worker.status === "not_started" ? "No heartbeat has been recorded for this server instance." : "The latest worker heartbeat is outside its expected health window."),
      worker.status === "not_started"
        ? "Confirm this worker is registered and enabled in the running server process; inspect startup diagnostics and worker schema preflight."
        : "Inspect the worker error and server logs, then correct the underlying issue before using any recovery action.",
    ));
  }
  if (workerHealth.qualificationQueue === null) {
    checks.push(check("qualification-queue", "queues", "warning", "Trading qualification queue unavailable", "Queue counts could not be read. This is not equivalent to an empty queue.", "Verify migration 0082, database connectivity, and permissions."));
  } else if (workerHealth.qualificationQueue.dead > 0) {
    checks.push(check("qualification-dead-jobs", "queues", "warning", "Dead-lettered qualification jobs exist", `${workerHealth.qualificationQueue.dead} job(s) require review.`, "Review the retained job errors and use only the guarded, audited retry action after fixing the cause."));
  }
}

export async function getSystemDiagnosticsReport() {
  const generatedAt = new Date().toISOString();
  const checks: DiagnosticCheck[] = [];
  const requiredEnv = ["DATABASE_URL", "SESSION_SECRET", "PASSWORD_PEPPER", "TOTP_ENCRYPTION_KEY"];
  const missingEnv = requiredEnv.filter((name) => !process.env[name]?.trim());
  checks.push(check(
    "runtime-required-secrets",
    "configuration",
    missingEnv.length ? "fail" : "pass",
    "Required runtime configuration",
    missingEnv.length ? `Missing: ${missingEnv.join(", ")}. Secret values are never included in this report.` : "All required runtime configuration variables are present; values are intentionally redacted.",
    missingEnv.length ? "Set missing values in the host's protected environment/secret manager and restart the service." : null,
  ));

  const memory = process.memoryUsage();
  const heapUseRatio = memory.heapTotal > 0 ? memory.heapUsed / memory.heapTotal : 0;
  checks.push(check(
    "runtime-heap-pressure",
    "server",
    heapUseRatio >= 0.9 ? "warning" : "pass",
    "Node.js heap pressure",
    `Heap used ${Math.round(heapUseRatio * 100)}% of currently allocated heap.`,
    heapUseRatio >= 0.9 ? "Inspect heap growth and application logs; capture a heap profile during a controlled maintenance window if pressure persists." : null,
  ));

  let database: { status: "connected" | "unavailable"; checkedAt: string; error: string | null } = {
    status: "unavailable", checkedAt: new Date().toISOString(), error: null,
  };
  const db = await getDb().catch(() => null);
  if (!db) {
    database.error = "Database client is unavailable. Check DATABASE_URL and startup logs.";
    checks.push(check("database-connectivity", "database", "fail", "Database connection", database.error, "Verify the protected database configuration, network access, database availability, and server logs."));
  } else {
    try {
      await db.execute(sql`SELECT 1 AS connected`);
      database.status = "connected";
      checks.push(check("database-connectivity", "database", "pass", "Database connection", "A live SELECT 1 query completed successfully."));
    } catch (error) {
      database.error = sanitizeWorkerErrorMessage(error);
      checks.push(check("database-connectivity", "database", "fail", "Database connection", database.error, "Check database availability, credentials, network access, and connection limits."));
    }
  }

  const requiredTables = [
    "worker_health_registry",
    "trading_tier_qualification_jobs",
    "trade_positions",
    "balance_ledger",
    "users",
    "v5_audit_events",
  ];
  let schema: { available: string[]; missing: string[]; checked: boolean } = { available: [], missing: requiredTables, checked: false };
  if (db && database.status === "connected") {
    try {
      const result = await db.execute(sql`
        SELECT TABLE_NAME AS tableName
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND TABLE_NAME IN ('worker_health_registry', 'trading_tier_qualification_jobs', 'trade_positions', 'balance_ledger', 'users', 'v5_audit_events')
      `);
      const [rows] = result as unknown as [Array<{ tableName?: string; TABLE_NAME?: string }>, unknown];
      schema.available = rows.map((row) => String(row.tableName ?? row.TABLE_NAME ?? ""));
      schema.missing = requiredTables.filter((name) => !schema.available.includes(name));
      schema.checked = true;
      checks.push(check(
        "database-required-tables",
        "database",
        schema.missing.length ? "fail" : "pass",
        "Required application tables",
        schema.missing.length ? `Missing tables: ${schema.missing.join(", ")}.` : `All ${requiredTables.length} required operational tables are present.`,
        schema.missing.length ? "Take a verified backup, then use the guarded main migration workflow. Do not create tables manually." : null,
      ));
    } catch (error) {
      checks.push(check("database-required-tables", "database", "warning", "Required application tables", sanitizeWorkerErrorMessage(error), "Verify information_schema access and the guarded migration status."));
    }
  } else {
    checks.push(check("database-required-tables", "database", "not_run", "Required application tables", "Not checked because the database connection is unavailable.", "Restore database connectivity, then export a fresh report."));
  }

  const sourcePaths = [
    "package.json",
    "pnpm-lock.yaml",
    "scripts/start-with-diagnostics.mjs",
    "scripts/ensure-worker-runtime-schema.mjs",
    "server/_core/index.ts",
    "server/_core/workerHealth.ts",
    "drizzle/0084_worker_health_registry.sql",
    "installer/verify-worker-runtime.mjs",
    "server/routers.ts",
  ];
  const sourceFiles = await Promise.all(sourcePaths.map(async (path) => ({ path, content: await readSourceFile(path) })));
  const missingFiles = sourceFiles.filter((item) => item.content === null).map((item) => item.path);
  const packageContent = sourceFiles.find((item) => item.path === "package.json")?.content;
  let packageScripts: Record<string, string> = {};
  let packageVersion: string | null = null;
  try {
    const parsed = JSON.parse(packageContent || "{}") as { scripts?: Record<string, string>; version?: string };
    packageScripts = parsed.scripts ?? {};
    packageVersion = parsed.version ?? null;
  } catch {
    missingFiles.push("package.json (invalid JSON)");
  }
  const requiredScripts = ["check", "test", "build", "start", "db:migrate", "db:ensure-worker-schema", "installer:verify-workers"];
  const missingScripts = requiredScripts.filter((name) => !packageScripts[name]);
  const workerSource = sourceFiles.find((item) => item.path === "server/_core/index.ts")?.content ?? "";
  const monitorSource = sourceFiles.find((item) => item.path === "server/_core/workerHealth.ts")?.content ?? "";
  const routerSource = sourceFiles.find((item) => item.path === "server/routers.ts")?.content ?? "";
  const wiringProblems: string[] = [];
  if (!workerSource.includes("runMonitoredWorkerCycle")) wiringProblems.push("server entrypoint does not reference monitored worker cycles");
  if (!monitorSource.includes("worker_health_registry")) wiringProblems.push("worker health registry instrumentation is missing");
  const workerKeys = [...monitorSource.matchAll(/key:\s*"([^"]+)"/g)].map((match) => match[1]);
  const unregisteredWorkers = workerKeys.filter((key) => !workerSource.includes(`"${key}"`));
  if (unregisteredWorkers.length) wiringProblems.push(`worker cycles are not wired in the server entrypoint: ${unregisteredWorkers.join(", ")}`);
  if (!routerSource.includes("systemDiagnostics: adminProcedure.query(() => getSystemDiagnosticsReport())")) wiringProblems.push("admin-only system diagnostics endpoint is missing");
  const startScript = packageScripts.start ?? "";
  if (!startScript.includes("scripts/start-with-diagnostics.mjs")) wiringProblems.push("production start script does not use the supported diagnostics/migration wrapper");
  const sourceProblems = [...missingFiles, ...missingScripts.map((name) => `package script: ${name}`), ...wiringProblems];
  checks.push(check(
    "source-contract-files",
    "code",
    sourceProblems.length ? "fail" : "pass",
    "Application source and diagnostic contracts",
    sourceProblems.length ? sourceProblems.join("; ") : `All ${sourcePaths.length} expected source/contract files are readable and required scripts are declared.`,
    sourceProblems.length ? "Restore missing source files or scripts and repair worker instrumentation before release." : null,
  ));
  checks.push(check(
    "automated-test-suite",
    "code",
    "not_run",
    "Full automated test suite",
    "Tests are not executed by a live admin export request. This report does not claim that pnpm check, pnpm test, or pnpm build passed.",
    "Run pnpm install --frozen-lockfile, pnpm check, pnpm test, and pnpm build in CI against the exact deployed commit.",
  ));

  let workerHealth: WorkerHealthSummary | null = null;
  try {
    workerHealth = await getWorkerHealthSummary();
    classifyWorkerChecks(workerHealth, checks);
    checks.push(check("worker-health-registry", "workers", "pass", "Worker health registry read", `${workerHealth.workers.length} worker records/definitions were returned by the durable monitor.`));
  } catch (error) {
    checks.push(check("worker-health-registry", "workers", "fail", "Worker health registry read", sanitizeWorkerErrorMessage(error), "Verify migration 0084, database connectivity, and worker health persistence logs."));
  }

  const sourceInventory = await collectSourceInventory();
  const knownSourceFiles = new Set(sourceInventory.files.map((file) => file.path));
  const featureCoverage = FEATURE_SOURCE_REQUIREMENTS.map((feature) => {
    const sourceFiles = feature.files.map((path) => ({ path, present: knownSourceFiles.has(path) }));
    const missing = sourceFiles.filter((file) => !file.present).map((file) => file.path);
    return {
      key: feature.key,
      label: feature.label,
      status: missing.length ? "source_incomplete" as const : "source_present_unverified" as const,
      sourceFiles,
      note: missing.length
        ? `Required source files are missing from this runtime package: ${missing.join(", ")}.`
        : "Source files are present. Runtime feature acceptance is not executed by this export.",
    };
  });
  const missingFeatureSources = featureCoverage.filter((feature) => feature.status === "source_incomplete");
  checks.push(check(
    "full-source-inventory",
    "code",
    sourceInventory.complete ? "pass" : "warning",
    "Application source inventory and review-marker scan",
    `${sourceInventory.filesScanned} source files (${sourceInventory.testFiles} test files) inventoried across ${Object.keys(sourceInventory.areas).length} code areas; ${sourceInventory.reviewMarkers.length} potential TODO/FIXME/HACK markers found.`,
    sourceInventory.complete ? null : "Inspect scanIssues and configured limits; run a full repository review and CI outside the live server.",
  ));
  if (sourceInventory.reviewMarkers.length) {
    checks.push(check(
      "source-review-markers",
      "code",
      "warning",
      "Potential source review markers",
      `${sourceInventory.reviewMarkers.length} TODO/FIXME/XXX/HACK or not-implemented marker(s) were found. These are review prompts, not automatically confirmed defects.`,
      "Review the listed file and line references, confirm whether each marker represents unfinished work, and add or update acceptance tests.",
    ));
  }
  checks.push(check(
    "feature-source-coverage",
    "code",
    missingFeatureSources.length ? "warning" : "not_run",
    "Core feature source coverage",
    missingFeatureSources.length
      ? `${missingFeatureSources.length} feature area(s) have missing expected source files.`
      : "Core feature source files are present; feature behaviour has not been exercised by this live diagnostic.",
    missingFeatureSources.length ? "Restore missing source files in the deployed application package." : "Run feature-specific automated and authenticated hosted acceptance tests; source presence alone does not prove functionality.",
  ));

  const summary = summarizeDiagnosticChecks(checks);
  const findings = checks.filter((item) => item.status === "fail" || item.status === "warning");
  return {
    reportType: "arbitrade-server-and-application-diagnostics",
    reportVersion: 1,
    generatedAt,
    scope: {
      description: "Read-only live server, database, worker, queue, configuration and source-contract diagnostics.",
      limitations: [
        "The bounded source inventory scans application source areas and records potential TODO/FIXME/HACK markers; it is not a compiler, full static analyzer, dependency vulnerability scan, or proof that every feature works.",
        "Worker history is bounded by the health monitor's retained 24-hour/500-row query and dead-letter detail limit of 25.",
        "A passing source-contract check is not proof that every application feature works in production.",
        "Run CI against the exact deployed commit and perform feature-specific hosted acceptance for complete application verification.",
      ],
    },
    application: { name: "Arbitrade Platform", version: packageVersion, sourceRevision: process.env.GIT_COMMIT_SHA || process.env.SOURCE_VERSION || null },
    server: {
      generatedAt,
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      uptimeSeconds: Math.floor(process.uptime()),
      pid: process.pid,
      cpuCount: (await import("node:os")).cpus().length,
      memoryBytes: memory,
      heapUsePercent: Math.round(heapUseRatio * 100),
    },
    configuration: { requiredVariables: requiredEnv.map((name) => ({ name, configured: Boolean(process.env[name]?.trim()) })), missing: missingEnv },
    database: { ...database, schema },
    workerHealth,
    sourceInventory,
    featureCoverage,
    checks,
    findings,
    summary,
    overallStatus: summary.fail > 0 ? "action_required" : summary.warning > 0 || summary.not_run > 0 ? "review_required" : "no_detected_issues",
    recommendations: [...new Set(findings.map((item) => item.recommendation).filter((value): value is string => Boolean(value)))],
  };
}
