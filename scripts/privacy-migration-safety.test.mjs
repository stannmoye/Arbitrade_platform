import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../drizzle/0062_privacy_center.sql", import.meta.url);
const htmlMigrationPath = new URL("../drizzle/0063_privacy_notice_html.sql", import.meta.url);
const schemaPath = new URL("../drizzle/schema.ts", import.meta.url);
const portalRunnerPath = new URL("./apply-portal-migrations.mjs", import.meta.url);
const recoveryPath = new URL("../installer/migration-recovery-status.mjs", import.meta.url);
const privacyServicePath = new URL("../server/privacy.ts", import.meta.url);
const privacyRouterPath = new URL("../server/routers.ts", import.meta.url);
const installPath = new URL("../installer/run-install.mjs", import.meta.url);

describe("Privacy Centre migration and installation contract", () => {
  it("creates dedicated versioning, request, request-event and audit tables without destructive SQL", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const htmlSql = await readFile(htmlMigrationPath, "utf8");
    expect(htmlSql).toContain("ADD COLUMN `htmlContent` LONGTEXT NULL");
    expect(htmlSql).not.toMatch(/\\bDROP\\s+TABLE\\b/i);
    for (const table of ["privacy_policy_versions", "privacy_requests", "privacy_request_events", "privacy_audit_events"]) {
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS `" + table + "`");
    }
    expect(sql).toContain("WHERE NOT EXISTS");
    expect(sql).toContain("'published'");
    expect(sql).toContain("'1.0'");
    for (const column of ["controllerName", "controllerAddress", "privacyContact", "applicableJurisdiction"]) expect(sql).toContain("`" + column + "`");
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("keeps table declarations, migration registration, recovery reporting and installer flow aligned", async () => {
    const [schema, portalRunner, recovery, installer, privacyService, privacyRouter] = await Promise.all([
      readFile(schemaPath, "utf8"),
      readFile(portalRunnerPath, "utf8"),
      readFile(recoveryPath, "utf8"),
      readFile(installPath, "utf8"),
      readFile(privacyServicePath, "utf8"),
      readFile(privacyRouterPath, "utf8"),
    ]);
    for (const table of ["privacyPolicyVersions", "privacyRequests", "privacyRequestEvents", "privacyAuditEvents"]) {
      expect(schema).toContain("export const " + table + " = mysqlTable(");
    }
    expect(portalRunner).toContain('"0062_privacy_center.sql"');
    expect(portalRunner).toContain('"0063_privacy_notice_html.sql"');
    expect(portalRunner).toContain('"privacy_policy_versions", "privacy_requests", "privacy_request_events", "privacy_audit_events"');
    expect(recovery).toContain('"0062_privacy_center.sql"');
    expect(recovery).toContain('"0063_privacy_notice_html.sql"');
    for (const table of ["privacy_policy_versions", "privacy_requests", "privacy_request_events", "privacy_audit_events"]) {
      expect(portalRunner).toContain('"' + table + '"');
    }
    expect((installer.match(/db:portal-migrate/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(privacyService).toContain("controllerName");
    expect(privacyService).toContain("controllerAddress");
    expect(privacyService).toContain("privacyContact");
    expect(privacyService).toContain("applicableJurisdiction");
    expect(privacyService).toContain("htmlContent");
    expect(privacyRouter).toContain("htmlContent: z.string()");
    expect(privacyRouter).not.toContain("body: z.string().min(40).max(8000)");
    expect(privacyService).toContain("if (!reviewAcknowledged)");
    expect(privacyRouter).toContain("reviewAcknowledged: z.literal(true)");
  });
});
