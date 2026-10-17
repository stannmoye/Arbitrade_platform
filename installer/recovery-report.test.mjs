import { afterEach, describe, expect, it } from "vitest";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const temporaryRoots = [];

async function createFixture({ marker, lock = false, bootstrap = false, env = false } = {}) {
  const root = await mkdtemp(resolve(tmpdir(), "arbitrade-recovery-test-"));
  temporaryRoots.push(root);
  const installerDir = resolve(root, "installer");
  await mkdir(installerDir, { recursive: true });
  await cp(resolve(sourceDir, "recovery-report.mjs"), resolve(installerDir, "recovery-report.mjs"));
  await cp(resolve(sourceDir, "recovery-utils.mjs"), resolve(installerDir, "recovery-utils.mjs"));
  if (marker !== undefined) {
    await writeFile(resolve(installerDir, ".install-in-progress.json"), typeof marker === "string" ? marker : JSON.stringify(marker));
  }
  if (lock) await writeFile(resolve(installerDir, ".installed"), "installed\n");
  if (bootstrap) await writeFile(resolve(root, ".installer-bootstrap.json"), "{}");
  if (env) await writeFile(resolve(root, ".env"), "SHOULD_NOT_BE_READ=fixture-secret\n");
  return { root, reportPath: resolve(installerDir, "recovery-report.mjs") };
}

function runReport(reportPath) {
  return spawnSync(process.execPath, [reportPath], {
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  });
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("interrupted-install recovery scenarios", () => {
  it("reports an interrupted dependency-install stage without changing the marker", async () => {
    const marker = {
      mode: "fresh",
      status: "running",
      stage: "preparing-dependencies",
      startedAt: "2026-10-17T10:00:00.000Z",
    };
    const { reportPath, root } = await createFixture({ marker });
    const markerPath = resolve(root, "installer/.install-in-progress.json");
    const before = await readFile(markerPath, "utf8");
    const result = runReport(reportPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Interrupted-install marker present: yes");
    expect(result.stdout).toContain("Dependency installation may have failed or been interrupted");
    expect(await readFile(markerPath, "utf8")).toBe(before);
  });

  it("reports database migration failures and warns against assuming rollback", async () => {
    const { reportPath } = await createFixture({
      marker: { mode: "existing", status: "failed", stage: "main-database-migrations", failedAt: "2026-10-17T10:02:00.000Z" },
    });
    const result = runReport(reportPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Status: failed");
    expect(result.stdout).toContain("Drizzle migration tracker");
    expect(result.stdout).toContain("a failed command does not guarantee rollback");
  });

  it("reports administrator-creation recovery without suggesting duplicate account creation", async () => {
    const { reportPath } = await createFixture({
      marker: { mode: "fresh", status: "failed", stage: "administrator-creation" },
    });
    const result = runReport(reportPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Check whether the administrator account already exists");
    expect(result.stdout).toContain("Do not create a duplicate account");
  });

  it("fails safely on invalid JSON and preserves the marker", async () => {
    const { reportPath, root } = await createFixture({ marker: "{not-json" });
    const markerPath = resolve(root, "installer/.install-in-progress.json");
    const before = await readFile(markerPath, "utf8");
    const result = runReport(reportPath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("progress marker is unreadable or invalid JSON");
    expect(await readFile(markerPath, "utf8")).toBe(before);
  });

  it("fails safely on a JSON value with an invalid marker structure", async () => {
    const { reportPath } = await createFixture({ marker: [] });
    const result = runReport(reportPath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("progress marker is unreadable or invalid JSON");
  });

  it("does not echo failure details that contain credentials", async () => {
    const { reportPath } = await createFixture({
      marker: {
        mode: "existing",
        status: "failed",
        stage: "portal-database-migrations",
        failure: { command: "pnpm", detail: "DATABASE_URL=mysql://user:ultra-secret@db.example/test" },
      },
      env: true,
    });
    const result = runReport(reportPath);
    const output = result.stdout + result.stderr;

    expect(result.status).toBe(0);
    expect(output).toContain("See private terminal output.");
    expect(output).not.toContain("ultra-secret");
    expect(output).not.toContain("SHOULD_NOT_BE_READ");
    expect(output).not.toContain("fixture-secret");
  });

  it("handles a missing marker without creating one or changing the install lock", async () => {
    const { reportPath, root } = await createFixture({ lock: true });
    const result = runReport(reportPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Interrupted-install marker present: no");
    expect(result.stdout).toContain("installer lock exists");
    expect(await readFile(resolve(root, "installer/.installed"), "utf8")).toBe("installed\n");
  });

  it("uses conservative guidance for an unknown stage", async () => {
    const { reportPath } = await createFixture({
      marker: { mode: "fresh", status: "running", stage: "unexpected-stage" },
    });
    const result = runReport(reportPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Inspect private terminal output, database migration tracking");
  });
});
