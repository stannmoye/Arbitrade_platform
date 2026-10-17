import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const runnerPath = new URL("./apply-portal-migrations.mjs", import.meta.url);

describe("portal migration diagnostic privacy", () => {
  it("does not re-emit raw database errors after printing a sanitized migration code", async () => {
    const source = await readFile(runnerPath, "utf8");
    expect(source).toContain('console.error(`Migration ${filename} failed (code: ${errorCode || "UNKNOWN"}).`)');
    expect(source).toContain('throw new Error("Portal migration failed; use the sanitized migration code above and complete manual recovery review before retrying.")');
    expect(source).not.toContain("      throw error;\n    }\n  }\n} catch (error) {");
    expect(source).toContain("DATABASE_URL is malformed. Check private configuration; its value is not displayed.");
    expect(source).toContain("Could not connect to the configured portal database (code:");
    expect(source).not.toContain("console.error(error.message)");
  });
});
