import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wrapper = resolve(root, "installer/install.sh");

function runWrapper(args) {
  const result = spawnSync("bash", [wrapper, ...args], {
    cwd: root,
    env: { ...process.env },
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

function expectRejected(args, expectedMessage) {
  const result = runWrapper(args);
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(expectedMessage);
  // Argument validation must happen before prerequisites, private configuration,
  // database access, or migration commands are considered.
  expect(result.output).not.toContain("Database connection successful");
  expect(result.output).not.toContain("Delegating to the canonical staged installer");
}

describe("automatic installer wrapper integration", () => {
  it("documents both supported installation modes", () => {
    const result = runWrapper(["--help"]);
    expect(result.status).toBe(0);
    expect(result.output).toContain("--fresh-install");
    expect(result.output).toContain("--existing-database --confirm-existing-migrations");
  });

  it("rejects a missing installation mode before checking server prerequisites", () => {
    expectRejected([], "An install mode is required.");
  });

  it("rejects conflicting installation modes before checking server prerequisites", () => {
    expectRejected(["--fresh-install", "--existing-database"], "Choose exactly one install mode.");
  });

  it("rejects unsupported command-line options", () => {
    expectRejected(["--not-a-real-option"], "Unknown option: --not-a-real-option");
  });

  it("requires explicit confirmation for existing-database migrations", () => {
    expectRejected(["--existing-database"], "Existing-database mode requires --confirm-existing-migrations.");
  });

  it("rejects existing-database confirmation in fresh mode", () => {
    expectRejected(
      ["--fresh-install", "--confirm-existing-migrations"],
      "--confirm-existing-migrations is only valid with --existing-database.",
    );
  });
});
