import { config } from "dotenv";
import mysql from "mysql2/promise";
import nodemailer from "nodemailer";
import { access, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env"), override: false });
const results = [];
const report = (name, ok, detail) => {
  results.push({ name, status: ok ? "PASS" : "FAIL", detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}: ${detail}`);
};
const warn = (name, detail) => {
  results.push({ name, status: "WARN", detail });
  console.log(`[WARN] ${name}: ${detail}`);
};

report(
  "Node.js runtime",
  Number(process.versions.node.split(".")[0]) >= 20,
  Number(process.versions.node.split(".")[0]) >= 20
    ? `Node.js ${process.versions.node} meets the minimum version 20.`
    : `Node.js ${process.versions.node} is too old; use Node.js 20 or newer.`,
);

let packageJson = null;
try {
  packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
} catch {
  // The package check below will report missing or unreadable metadata.
}
const packageFiles = await Promise.all(
  ["package.json", "pnpm-lock.yaml"].map(async (file) => {
    try {
      await access(resolve(root, file));
      return true;
    } catch {
      return false;
    }
  }),
);
report(
  "Application package",
  packageFiles.every(Boolean),
  packageFiles.every(Boolean)
    ? "package.json and pnpm-lock.yaml are present."
    : "package.json or pnpm-lock.yaml is missing from the application root.",
);

const startCommand = String(packageJson?.scripts?.start || "");
report(
  "Production startup command",
  startCommand.includes("NODE_ENV=production") && startCommand.includes("node dist/index.js"),
  startCommand
    ? startCommand.includes("NODE_ENV=production") && startCommand.includes("node dist/index.js")
      ? "package.json start script launches dist/index.js in production mode."
      : "The start script does not match the expected production entry point (NODE_ENV=production node dist/index.js)."
    : "package.json has no start script.",
);

const pnpmResult = spawnSync("pnpm", ["--version"], {
  cwd: root,
  encoding: "utf8",
  shell: false,
});
const pnpmVersion =
  !pnpmResult.error && pnpmResult.status === 0 ? pnpmResult.stdout.trim() : "";
report(
  "pnpm package manager",
  /^10\.18\./.test(pnpmVersion),
  pnpmVersion
    ? /^10\.18\./.test(pnpmVersion)
      ? `pnpm ${pnpmVersion} is compatible with this repository.`
      : `pnpm ${pnpmVersion} detected; this repository requires pnpm 10.18.x.`
    : "pnpm is not available in this process PATH. Use the configured Node.js app environment and enable pnpm 10.18.x.",
);

const url = process.env.DATABASE_URL;
if (!url) {
  report("Database configuration", false, "DATABASE_URL is not set. Load the private production .env first.");
} else {
  let db;
  try {
    const parsed = new URL(url);
    if (!["mysql:", "mariadb:"].includes(parsed.protocol)) throw new Error("DATABASE_URL must use mysql:// or mariadb://.");
    if (parsed.protocol === "mariadb:") parsed.protocol = "mysql:";
    parsed.searchParams.set("timezone", "Z");
    db = await mysql.createConnection(parsed.toString());
    const [tables] = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE()");
    const names = new Set(tables.map((row) => String(row.TABLE_NAME ?? row.table_name)));
    report("Database connection", true, `Connected; ${names.size} table(s) found.`);
    for (const required of ["users", "app_settings", "mining_packages"]) {
      report("Required table: " + required, names.has(required), names.has(required) ? "Table exists." : "Expected table is missing; review migrations.");
    }
    if (names.has("users")) {
      const [admins] = await db.query("SELECT COUNT(*) AS count FROM users WHERE role='admin'");
      report("Administrator", Number(admins[0].count) > 0, `${Number(admins[0].count)} administrator account(s) found.`);
    }
    report("Database schema", names.size > 0, names.size ? "Database is not empty." : "Database contains no tables.");

    if (names.has("__drizzle_migrations")) {
      const [migrations] = await db.query("SELECT COUNT(*) AS count FROM __drizzle_migrations");
      report("Drizzle migration tracking", Number(migrations[0].count) > 0, `${Number(migrations[0].count)} migration record(s) found.`);
    } else {
      report("Drizzle migration tracking", false, "The __drizzle_migrations table is missing; run the documented migration workflow.");
    }
    if (names.has("mining_schema_migrations")) {
      const [markers] = await db.query("SELECT COUNT(*) AS count FROM mining_schema_migrations");
      report("Mining migration tracking", Number(markers[0].count) > 0, `${Number(markers[0].count)} mining migration marker(s) found.`);
    } else {
      report("Mining migration tracking", false, "The mining_schema_migrations table is missing; review the mining migration workflow.");
    }
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

try {
  await access(resolve(root, ".configured"));
  report("Configuration lock", true, ".configured exists.");
} catch {
  report("Configuration lock", false, ".configured is missing.");
}
try {
  await access(resolve(root, "installer/.installed"));
  report("Installation lock", true, "installer/.installed exists.");
} catch {
  report("Installation lock", false, "installer/.installed is missing; the install script may not have completed.");
}
try {
  await access(resolve(root, ".installer-bootstrap.json"));
  report("Bootstrap cleanup", false, "A one-time bootstrap file remains. Restrict access and remove it after confirming installation.");
} catch {
  report("Bootstrap cleanup", true, "No one-time administrator bootstrap file remains.");
}
try {
  const progressPath = resolve(root, "installer/.install-in-progress.json");
  const progress = JSON.parse(await readFile(progressPath, "utf8"));
  report(
    "Interrupted installation",
    false,
    `An incomplete installation marker remains (stage: ${String(progress.stage || "unknown")}, started: ${String(progress.startedAt || "unknown")}). Review private logs, backup/migration state, and recover deliberately before removing the marker.`,
  );
} catch (error) {
  if (error?.code === "ENOENT") {
    report("Interrupted installation", true, "No incomplete installation marker remains.");
  } else {
    report("Interrupted installation", false, "The installation progress marker exists but could not be read as valid JSON. Restrict access and inspect it before recovery.");
  }
}

try {
  const envInfo = await stat(resolve(root, ".env"));
  report("Environment file permissions", (envInfo.mode & 0o077) === 0, (envInfo.mode & 0o077) === 0 ? ".env is not group/world accessible." : ".env permissions are too broad; run chmod 600 .env.");
} catch {
  report("Environment file permissions", false, ".env is missing or unreadable.");
}

const appUrl = process.env.PUBLIC_APP_URL;
let parsedAppUrl = null;
if (!appUrl) {
  report("Public application URL", false, "PUBLIC_APP_URL is not configured.");
  report("Application health", false, "Cannot check health without PUBLIC_APP_URL.");
} else {
  try {
    parsedAppUrl = new URL(appUrl);
    const valid = ["https:", "http:"].includes(parsedAppUrl.protocol) && Boolean(parsedAppUrl.hostname);
    const secure = parsedAppUrl.protocol === "https:";
    report(
      "Public application URL",
      valid && secure,
      !valid
        ? "PUBLIC_APP_URL must be a valid absolute HTTP(S) URL."
        : secure
          ? "PUBLIC_APP_URL is a valid HTTPS URL."
          : "PUBLIC_APP_URL uses HTTP. Production deployments should use HTTPS.",
    );
  } catch {
    report("Public application URL", false, "PUBLIC_APP_URL is not a valid absolute URL.");
  }
  try {
    if (!parsedAppUrl || !["https:", "http:"].includes(parsedAppUrl.protocol)) throw new Error("PUBLIC_APP_URL is not a valid HTTP(S) URL.");
    const healthUrl = new URL("/api/health", parsedAppUrl);
    const startedAt = Date.now();
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(8000), redirect: "error" });
    const elapsedMs = Date.now() - startedAt;
    const body = await response.json().catch(() => null);
    const ok = response.ok && body?.status === "ok";
    report(
      "Application health",
      ok,
      ok
        ? `GET /api/health returned status=ok in ${elapsedMs} ms.`
        : `Health endpoint returned HTTP ${response.status} in ${elapsedMs} ms; inspect application logs and startup configuration.`,
    );
  } catch (error) {
    report("Application health", false, error?.message || "Health endpoint could not be reached. Start/restart the application and rerun.");
  }
}

if (process.env.MAIL_PROVIDER === "smtp") {
  const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM_EMAIL"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    report("SMTP configuration", false, "Missing: " + missing.join(", "));
  } else {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    try {
      await transporter.verify();
      report("SMTP connection/authentication", true, "SMTP transport verified. Run pnpm installer:test-smtp --to=you@example.com to send a test message.");
    } catch (error) {
      report("SMTP connection/authentication", false, "SMTP verification failed (" + String(error?.code || "unknown") + "). Check host, port, TLS, credentials, and outbound SMTP restrictions.");
    } finally {
      transporter.close();
    }
  }
} else {
  warn("SMTP", "Email delivery is disabled. Configure SMTP if the application needs outbound email.");
}

warn("Cron jobs", "Cannot inspect cPanel/VPS scheduler entries without an authorized hosting API. Verify required authenticated jobs manually using docs/deployment-v5.md.");
warn("OAuth", "Google/Microsoft credentials and provider-side callback registrations require a sign-in test; review the configured redirect URLs.");

const failed = results.filter((item) => item.status === "FAIL");
const warnings = results.filter((item) => item.status === "WARN");
const passed = results.length - failed.length - warnings.length;
const readiness = failed.length ? "NOT READY" : warnings.length ? "READY WITH WARNINGS" : "READY";
console.log(`\nInstaller verification: ${passed} passed, ${failed.length} failed, ${warnings.length} manual checks/warnings.`);
console.log(`Deployment readiness: ${readiness}`);
if (failed.length) process.exitCode = 1;
