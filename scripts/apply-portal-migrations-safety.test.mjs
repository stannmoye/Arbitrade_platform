import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const runnerPath = new URL("./apply-portal-migrations.mjs", import.meta.url);

describe("portal migration diagnostic privacy", () => {
  it("keeps the manual-settlement migration in the tracked runner and avoids false baseline positives", async () => {
    const source = await readFile(runnerPath, "utf8");
    expect(source).toContain('"0053_manual_settlement_lifecycle.sql"');
    expect(source).toContain('"0056_support_ticket_assignment.sql"');
    expect(source).toContain('"0057_notification_history_pagination.sql"');
    expect(source).toContain('"0058_withdrawable_notification_campaigns.sql"');
    expect(source).not.toContain('"opportunity_popup_events", "opportunity_delivery_events"');
    expect(source).toContain('import { executeCompatibleMigrationSql } from "./mysql-compatible-migration-sql.mjs";');
    expect(source).toContain("multipleStatements: true");
    expect(source).toContain("await executeCompatibleMigrationSql(connection, sql);");
  });

  it("does not re-emit raw database errors after printing a sanitized migration code", async () => {
    const source = await readFile(runnerPath, "utf8");
    expect(source).toContain('console.error(`Migration ${filename} failed (code: ${errorCode || "UNKNOWN"}).`)');
    expect(source).toContain('throw new Error("Portal migration failed; use the sanitized migration code above and complete manual recovery review before retrying.")');
    expect(source).not.toContain("      throw error;\n    }\n  }\n} catch (error) {");
    expect(source).toContain("DATABASE_URL is malformed. Check private configuration; its value is not displayed.");
    expect(source).toContain("DATABASE_URL contains malformed database-name or credential encoding. The configured value is not displayed.");
    expect(source).toContain("databaseUser = decodeURIComponent(url.username);");
    expect(source).toContain("databasePassword = decodeURIComponent(url.password);");
    expect(source).toContain("Could not connect to the configured portal database (code:");
    expect(source).not.toContain("console.error(error.message)");
  });
});
