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
    expect(source).toContain('"0062_privacy_center.sql"');
    expect(source).toContain('"0063_privacy_notice_html.sql"');
    expect(source).toContain('"0064_remove_auto_trade_inherit.sql"');
    expect(source).toContain('"0065_remove_obsolete_auto_trade_limits.sql"');
    expect(source).toContain('"0066_remove_unused_customer_daily_trade_limit.sql"');
    expect(source).toContain('"privacy_policy_versions", "privacy_requests", "privacy_request_events", "privacy_audit_events"');
    expect(source).not.toContain('"opportunity_popup_events", "opportunity_delivery_events"');
    expect(source).toContain('import { executeCompatibleMigrationSql } from "./mysql-compatible-migration-sql.mjs";');
    expect(source).toContain("multipleStatements: true");
    expect(source).toContain("await executeCompatibleMigrationSql(connection, sql);");
    expect(source).toContain('"0099_trading_global_timing_policy_version.sql"');
    expect(source).toContain('"0100_global_trade_master_controls.sql"');
    const trackedPortalFiles = source.match(/const migrationFiles = \[([\s\S]*?)\];/)?.[1] ?? "";
    expect(trackedPortalFiles).not.toContain('0101_package_fee_policy_versions.sql');
    expect(trackedPortalFiles).not.toContain('0102_opportunity_delivery_retry_lifecycle.sql');
    expect(source).toContain("canonical Drizzle-journal migrations");
    const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
    const masterIndex = journal.entries.findIndex(entry => entry.tag === "0100_global_trade_master_controls");
    expect(journal.entries[masterIndex + 1]?.tag).toBe("0101_package_fee_policy_versions");
    expect(journal.entries.at(-1).tag).toBe("0111_automatic_market_result_settlement");
    expect(journal.entries.at(-2).tag).toBe("0110_opportunity_delivery_diagnostic_history");
    expect(journal.entries.at(-3).tag).toBe("0109_customer_company_country_restrictions");
    expect(journal.entries.at(-4).tag).toBe("0107_accurate_opportunity_delivery_monitoring");
    expect(journal.entries.at(-5).tag).toBe("0106_package_popup_defaults");
    expect(journal.entries.at(-6).tag).toBe("0105_default_on_global_information_delivery");
    expect(journal.entries.at(-7).tag).toBe("0104_catalogue_native_opportunity_generation");
    expect(journal.entries.at(-8).tag).toBe("0103_automatic_opportunity_generation_templates");
    expect(journal.entries.at(-9).tag).toBe("0102_opportunity_delivery_retry_lifecycle");
    expect(await readFile(new URL("../drizzle/0099_trading_global_timing_policy_version.sql", import.meta.url), "utf8")).toContain("trade.timingPolicyVersion");
    expect(await readFile(new URL("../drizzle/0100_global_trade_master_controls.sql", import.meta.url), "utf8")).toContain("trade.globalControls");
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
