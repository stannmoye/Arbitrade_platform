import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const scriptUrl = new URL("./apply-mining-migrations.mjs", import.meta.url);

describe("Mining migration safety boundary", () => {
  it("requires explicit host and production confirmation before opening a database connection", async () => {
    const source = await readFile(scriptUrl, "utf8");
    const hostConfirmation = source.indexOf('if (!process.argv.includes("--confirm-host-migration"))');
    const productionConfirmation = source.indexOf('if (process.env.NODE_ENV === "production" && !process.argv.includes("--confirm-production"))');
    const connection = source.indexOf("await mysql.createConnection");
    expect(hostConfirmation).toBeGreaterThan(-1);
    expect(productionConfirmation).toBeGreaterThan(-1);
    expect(connection).toBeGreaterThan(-1);
    expect(hostConfirmation).toBeLessThan(connection);
    expect(productionConfirmation).toBeLessThan(connection);
  });

  it("routes database-coded failures through sanitized diagnostics and exits unsuccessfully", async () => {
    const source = await readFile(scriptUrl, "utf8");
    expect(source).toContain("main().catch((error) => {");
    expect(source).toContain('String(error.code).replace(/[^A-Z0-9_]/gi, "").slice(0, 40)');
    expect(source).toContain("Raw database diagnostics are suppressed");
    expect(source).toContain("process.exitCode = 1;");
    expect(source).not.toContain("console.error(error.message)");
  });

  it("closes the database connection in the migration finally block", async () => {
    const source = await readFile(scriptUrl, "utf8");
    expect(source).toContain("} finally {\n  await connection.end();\n}");
  });
});
