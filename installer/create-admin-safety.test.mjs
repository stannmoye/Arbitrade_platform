import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const adminPath = new URL("./create-admin.mjs", import.meta.url);
const smtpPath = new URL("./test-smtp.mjs", import.meta.url);

describe("installer credential and diagnostic privacy", () => {
  it("validates and decodes the database URL without echoing configured values", async () => {
    const source = await readFile(adminPath, "utf8");
    expect(source).toContain("parsed = new URL(databaseUrl);");
    expect(source).toContain("databaseName = decodeURIComponent(parsed.pathname.replace(/^\\/+/, \"\"));");
    expect(source).toContain("DATABASE_URL is malformed or contains invalid encoding. The configured value is not displayed.");
    expect(source).not.toContain("console.error(databaseUrl)");
  });

  it("does not print raw database connection or administrator creation errors", async () => {
    const source = await readFile(adminPath, "utf8");
    expect(source).toContain('String(error?.code || "unavailable").replace(/[^A-Z0-9_]/gi, "").slice(0, 40)');
    expect(source).toContain("Database details are not displayed.");
    expect(source).not.toContain('console.error("Administrator creation failed: " + (error?.message');
  });

  it("preserves the expected scrypt hash format", async () => {
    const source = await readFile(adminPath, "utf8");
    expect(source).toContain('const passwordHash = "scrypt$" + salt + "$" + digest;');
  });

  it("handles database connection cleanup failures without exposing raw errors", async () => {
    const adminSource = await readFile(adminPath, "utf8");
    const verifierSource = await readFile(new URL("./verify-install.mjs", import.meta.url), "utf8");
    const runnerSource = await readFile(new URL("./run-install.mjs", import.meta.url), "utf8");
    expect(adminSource).toContain("Database connection cleanup failed (code: ");
    expect(adminSource).toContain("await connection.end();");
    expect(verifierSource).toContain('"Database connection cleanup"');
    expect(verifierSource).toContain("Could not close the database connection cleanly (code: ");
    expect(verifierSource).not.toContain("console.error(error)");
    expect(runnerSource).toContain("Could not close the selected database connection safely. Database error code: ");
    expect(runnerSource).toContain("await db.end();");
  });

  it("sanitizes SMTP test provider error codes", async () => {
    const source = await readFile(smtpPath, "utf8");
    expect(source).toContain('String(error?.code || "unknown").replace(/[^A-Z0-9_]/gi, "").slice(0, 40)');
    expect(source).not.toContain('console.error("Provider error code: " + String(error?.code || "unknown"))');
  });
});
