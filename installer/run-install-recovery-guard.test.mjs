import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const installerSource = join(repositoryRoot, "installer", "run-install.mjs");
const fixtures = new Set();

async function makeFixture(marker) {
  const root = await mkdtemp(join(tmpdir(), "arbitrade-installer-guard-"));
  fixtures.add(root);
  await mkdir(join(root, "installer"), { recursive: true });
  await symlink(join(repositoryRoot, "node_modules"), join(root, "node_modules"), "dir");
  await writeFile(join(root, "installer", "run-install.mjs"), await readFile(installerSource));
  await writeFile(join(root, "installer", "main-migration-preflight.mjs"), await readFile(join(repositoryRoot, "installer", "main-migration-preflight.mjs")));
  await writeFile(join(root, ".installer-bootstrap.json"), JSON.stringify({
    mode: "fresh",
    databaseTableNames: [],
    databaseTableCount: 0,
    adminEmail: "admin@example.test",
    adminPassword: "fixture-only-password-123",
  }));
  if (marker === "installed") {
    await writeFile(join(root, "installer", ".installed"), "fixture lock\n");
  } else if (marker === "in-progress") {
    await writeFile(join(root, "installer", ".install-in-progress.json"), JSON.stringify({
      mode: "fresh",
      status: "failed",
      stage: "main-database-migrations",
    }));
  } else if (marker === "dangling-lock") {
    await symlink(join(root, "missing-lock-target"), join(root, "installer", ".installed"), "file");
  } else if (marker === "dangling-progress") {
    await symlink(join(root, "missing-progress-target"), join(root, "installer", ".install-in-progress.json"), "file");
  }
  return root;
}

function runInstaller(root) {
  return spawnSync(process.execPath, [join(root, "installer", "run-install.mjs"), "--fresh-install"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: "mysql://fixture:fixture@127.0.0.1:1/arbitrade_test",
      SESSION_SECRET: "fixture-session-secret-long-enough-000000",
      PASSWORD_PEPPER: "fixture-password-pepper-long-enough-000000",
      PUBLIC_APP_URL: "https://example.test",
    },
    encoding: "utf8",
    timeout: 10_000,
  });
}

afterEach(async () => {
  await Promise.all([...fixtures].map((root) => rm(root, { recursive: true, force: true })));
  fixtures.clear();
});

describe("canonical installer recovery guards", () => {
  it("validates PUBLIC_APP_URL and rejects embedded credentials before connecting to the database", async () => {
    const source = await readFile(installerSource, "utf8");
    expect(source).toContain("publicAppUrl = new URL(process.env.PUBLIC_APP_URL);");
    expect(source).toContain('["http:", "https:"].includes(publicAppUrl.protocol)');
    expect(source).toContain("publicAppUrl.username || publicAppUrl.password");
    expect(source).toContain("PUBLIC_APP_URL must use HTTP(S) and must not contain a username or password.");
    expect(source.indexOf("publicAppUrl = new URL(process.env.PUBLIC_APP_URL);")).toBeLessThan(source.indexOf("mysql.createConnection"));
  });

  it("refuses to rerun when an installation lock exists, before database access", async () => {
    const root = await makeFixture("installed");
    const result = runInstaller(root);
    const output = String(result.stdout || "") + String(result.stderr || "");

    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).not.toBe(0);
    expect(output).toContain("An installation lock already exists. Refusing to rerun the installer.");
    expect(output).not.toContain("Database connection successful");
    expect(output).not.toContain("pnpm install");
  });

  it("refuses blind retry after an interrupted install, before database access", async () => {
    const root = await makeFixture("in-progress");
    const result = runInstaller(root);
    const output = String(result.stdout || "") + String(result.stderr || "");

    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).not.toBe(0);
    expect(output).toContain("A previous installation attempt left installer/.install-in-progress.json.");
    expect(output).not.toContain("Database connection successful");
    expect(output).not.toContain("pnpm install");
  });

  it.each([
    ["dangling-lock", "An installation lock already exists."],
    ["dangling-progress", "A previous installation attempt left installer/.install-in-progress.json."],
  ])("fails closed for a dangling %s marker", async (marker, message) => {
    const root = await makeFixture(marker);
    const result = runInstaller(root);
    const output = String(result.stdout || "") + String(result.stderr || "");

    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).not.toBe(0);
    expect(output).toContain(message);
    expect(output).not.toContain("Database connection successful");
    expect(output).not.toContain("pnpm install");
  });
});
