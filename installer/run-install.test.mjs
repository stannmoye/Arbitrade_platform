import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const installer = resolve(root, "installer", "run-install.mjs");

function runInstaller(args, overrides = {}) {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: "",
    SESSION_SECRET: "",
    PASSWORD_PEPPER: "",
    PUBLIC_APP_URL: "",
    ...overrides,
  };
  const result = spawnSync(process.execPath, [installer, ...args], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 10_000,
  });

  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return {
    status: result.status,
    output: String(result.stdout || "") + String(result.stderr || ""),
  };
}

describe("canonical installer preflight acceptance", () => {
  it("rejects a missing installation mode before touching the database", () => {
    const result = runInstaller([]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Choose exactly one mode");
    expect(result.output).not.toContain("Database connection successful");
  });

  it("rejects conflicting installation modes before touching the database", () => {
    const result = runInstaller(["--fresh-install", "--existing-database"]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Choose exactly one mode");
    expect(result.output).not.toContain("Database connection successful");
  });

  it("requires explicit confirmation for existing-database migrations", () => {
    const result = runInstaller(["--existing-database"]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Verify a current restorable backup exists");
    expect(result.output).not.toContain("Database connection successful");
  });

  it("requires production mode", () => {
    const result = runInstaller(["--fresh-install"], {
      NODE_ENV: "development",
    });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("NODE_ENV must be production");
    expect(result.output).not.toContain("Database connection successful");
  });

  it("requires all private production configuration before connecting", () => {
    const result = runInstaller(["--fresh-install"], {
      NODE_ENV: "production",
      DATABASE_URL: "",
      SESSION_SECRET: "",
      PASSWORD_PEPPER: "",
      PUBLIC_APP_URL: "",
    });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("DATABASE_URL, PASSWORD_PEPPER, and PUBLIC_APP_URL must be configured");
    expect(result.output).not.toContain("Database connection successful");
  });

  it("rejects weak session secrets before connecting", () => {
    const result = runInstaller(["--fresh-install"], {
      NODE_ENV: "production",
      DATABASE_URL: "mysql://user:password@127.0.0.1:3306/arbitrade_test",
      SESSION_SECRET: "too-short",
      PASSWORD_PEPPER: "also-too-short",
      PUBLIC_APP_URL: "https://example.test",
    });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("SESSION_SECRET must contain at least 32 characters");
    expect(result.output).not.toContain("Database connection successful");
  });
});


describe("canonical installer diagnostic privacy", () => {
  it("does not print raw database error messages that may include connection identifiers", async () => {
    const source = await readFile(installer, "utf8");
    expect(source).toContain('String(error?.code || "unavailable").replace(/[^A-Z0-9_]/gi, "").slice(0, 40)');
    expect(source).toContain("Database error code:");
    expect(source).not.toContain('(error?.code || error?.message || "")');
  });

  it("routes main migrations through the persistent guard", async () => {
    const source = await readFile(installer, "utf8");
    expect(source).toContain('run("node", ["scripts/guarded-main-migrate.mjs"]);');
    expect(source).not.toContain('runPnpm(["db:migrate"]);');
  });
});


describe("fresh-install initial account provisioning", () => {
  it("collects both account credential sets in the browser wizard", async () => {
    const wizard = await readFile(resolve(root, "installer", "index.php"), "utf8");
    expect(wizard).toContain("postval('admin_email')");
    expect(wizard).toContain("postval('customer_email')");
    expect(wizard).toContain("'customerEmail' => $customerEmail");
    expect(wizard).toContain("'customerPassword' => $customerPassword");
    expect(wizard).toContain("accountSection.querySelectorAll('input').forEach(input=>input.required=fresh)");
  });

  it("creates both initial accounts transactionally and hands off both credentials", async () => {
    const source = await readFile(installer, "utf8");
    expect(source).toContain('run("node", ["installer/create-initial-accounts.mjs"]');
    expect(source).toContain('CUSTOMER_EMAIL: String(bootstrap.customerEmail).trim().toLowerCase()');
    expect(source).toContain('CUSTOMER_PASSWORD: String(bootstrap.customerPassword)');
    expect(source).not.toContain('run("node", ["installer/create-admin.mjs"]');
    const accountScript = await readFile(resolve(root, "installer", "create-initial-accounts.mjs"), "utf8");
    expect(accountScript).toContain("await connection.beginTransaction()");
    expect(accountScript).toContain("await connection.commit()");
    expect(accountScript).toContain("await connection.rollback()");
    expect(accountScript).toContain('role: "user"');
    expect(accountScript).toContain('role: "admin"');
  });

  it("initializes missing production session secrets before the server accepts requests", async () => {
    const source = await readFile(resolve(root, "server/_core/index.ts"), "utf8");
    expect(source).toContain('import { ensureSessionSecret } from "../../installer/session-secret.mjs";');
    expect(source).toContain('await ensureSessionSecret({ root: process.cwd(), env: process.env })');
    expect(source).toContain("Refusing to start.");
  });

  it("leaves SMTP disabled and optional during installation", async () => {
    const wizard = await readFile(resolve(root, "installer", "index.php"), "utf8");
    expect(wizard).toContain("MAIL_PROVIDER");
    expect(wizard).toContain("disabled");
    expect(wizard).not.toContain("SMTP_HOST");
    expect(wizard).not.toContain("SMTP_PASSWORD");
  });
});


describe("main migration preflight integration", () => {
  it("checks existing-schema history before creating the persistent migration guard", async () => {
    const source = await readFile(new URL("../scripts/guarded-main-migrate.mjs", import.meta.url), "utf8");
    expect(source).toContain('import { classifyMainMigrationPreflight, loadExpectedMainMigrationHistory, validateMainMigrationHistory } from "../installer/main-migration-preflight.mjs";');
    expect(source).toContain("FROM information_schema.tables WHERE table_schema=DATABASE()");
    expect(source).toContain("FROM __drizzle_migrations");
    expect(source).toContain("if (!preflight.allowed)");
    expect(source).toContain("No migrations were run.");
    expect(source.indexOf("if (!preflight.allowed)")).toBeLessThan(source.indexOf("CREATE TABLE IF NOT EXISTS"));
  });

  it("keeps failed or interrupted main migration runs blocked from blind retry", async () => {
    const source = await readFile(new URL("../scripts/guarded-main-migrate.mjs", import.meta.url), "utf8");
    expect(source).toContain('previousStatus === "failed" || previousStatus === "running"');
    expect(source).toContain("automatic retry is blocked");
    expect(source).toContain('SET status=\'failed\'');
  });
});


describe("installer cleanup error privacy", () => {
  it("sanitizes database connection cleanup failures", async () => {
    const source = await readFile(installer, "utf8");
    expect(source).toContain("Could not close the selected database connection safely. Database error code:");
    expect(source).toContain("try {\n      await db.end();\n    } catch (error) {");
    expect(source).toContain('String(error?.code || "unknown").replace(/[^A-Z0-9_]/gi, "").slice(0, 40)');
    expect(source).not.toContain("console.error(error.message)");
  });
});
