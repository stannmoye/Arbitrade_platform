import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const sourceUrl = new URL("./migration-recovery-status.mjs", import.meta.url);

describe("migration recovery diagnostic connection safety", () => {
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
