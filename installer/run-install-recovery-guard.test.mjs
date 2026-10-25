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
    customerEmail: "customer@example.test",
    customerPassword: "fixture-only-customer-password-456",
  }));
  if (marker === "installed") {
    await writeFile(join(root, "installer", ".installed"), "fixture lock\n");
  } else if (marker === "in-progress") {
    await writeFile(join(root, "installer", ".install-in-progress.json"), JSON.stringify({
      mode: "fresh",
      status: "failed",
      stage: "main-database-migrations",
    }));
  } else if (marker === "installed-dangling-symlink") {
    await symlink(join(root, "missing-installed-target"), join(root, "installer", ".installed"));
  } else if (marker === "in-progress-dangling-symlink") {
    await symlink(join(root, "missing-progress-target"), join(root, "installer", ".install-in-progress.json"));
  }
  return root;
}

function runInstaller(root, overrides = {}) {
  return spawnSync(process.execPath, [join(root, "installer", "run-install.mjs"), "--fresh-install"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: "mysql://fixture:fixture@127.0.0.1:1/arbitrade_test",
      SESSION_SECRET: "fixture-session-secret-long-enough-000000",
      PASSWORD_PEPPER: "fixture-password-pepper-long-enough-000000",
      PUBLIC_APP_URL: "https://example.test",
      ...overrides,
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

  it.each(["installed-dangling-symlink", "in-progress-dangling-symlink"])(
    "fails closed when the %s state marker is a dangling symlink",
    async (marker) => {
      const root = await makeFixture(marker);
      const result = runInstaller(root);
      const output = String(result.stdout || "") + String(result.stderr || "");

      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.status).not.toBe(0);
      if (marker === "installed-dangling-symlink") {
        expect(output).toContain("An installation lock already exists. Refusing to rerun the installer.");
      } else {
        expect(output).toContain("A previous installation attempt left installer/.install-in-progress.json.");
      }
      expect(output).not.toContain("Database connection successful");
      expect(output).not.toContain("pnpm install");
    },
  );

  it.each([
    "ftp://example.test",
    "https://user:password@example.test",
    "not a URL",
  ])("rejects unsafe PUBLIC_APP_URL before database access (%s)", async (publicAppUrl) => {
    const root = await makeFixture("none");
    const result = runInstaller(root, { PUBLIC_APP_URL: publicAppUrl });
    const output = String(result.stdout || "") + String(result.stderr || "");

    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).not.toBe(0);
    expect(output).toContain("PUBLIC_APP_URL");
    expect(output).not.toContain("Database connection successful");
    expect(output).not.toContain("pnpm install");
  });
});
