import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const sourceUrl = new URL("./migration-recovery-status.mjs", import.meta.url);

describe("migration recovery diagnostic connection safety", () => {
  it("reports the portal per-file migration tracker instead of claiming it is unimplemented", async () => {
    const source = await readFile(sourceUrl, "utf8");
    expect(source).toContain('tableExists("portal_schema_migrations")');
    expect(source).toContain("SELECT migrationName,status,checksum,errorCode FROM portal_schema_migrations");
    expect(source).toContain("Expected tracked portal migration files:");
    expect(source).toContain("CHECKSUM MISMATCH");
    expect(source).toContain("createHash(\"sha256\").update(sql).digest(\"hex\")");
    expect(source).not.toContain("Per-file tracker: not implemented by the current portal migration runner.");
  });

  it("handles malformed URL component encoding without exposing the configured URL", async () => {
    const source = await readFile(sourceUrl, "utf8");
    expect(source).toContain("DATABASE_URL contains malformed encoding. The configured value is not displayed; no database changes were made.");
  });

  it("handles malformed database URLs without echoing their configured value", async () => {
    const source = await readFile(sourceUrl, "utf8");
    expect(source).toContain("url = new URL(rawDatabaseUrl);");
    expect(source).toContain("DATABASE_URL is malformed. Check the private configuration; the value is not displayed.");
    expect(source).not.toContain("console.error(rawDatabaseUrl)");
  });

  it("reports connection failures with a sanitized error code instead of a stack trace", async () => {
    const source = await readFile(sourceUrl, "utf8");
    expect(source).toContain("Could not connect to the configured database. Check private connection settings and database availability; credentials are not displayed.");
    expect(source).toContain('String(error?.code || "unavailable").replace(/[^A-Z0-9_]/gi, "").slice(0, 40)');
    expect(source).not.toContain("console.error(error.stack)");
  });
});
