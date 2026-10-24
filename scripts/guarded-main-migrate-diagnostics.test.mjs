import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("guarded main migration failure diagnostics", () => {
  it("stores and reports migration and statement context without enabling automatic retries", async () => {
    const source = await readFile(new URL("./guarded-main-migrate.mjs", import.meta.url), "utf8");

    expect(source).toContain("failureMigration VARCHAR(160) NULL");
    expect(source).toContain("failureStatementIndex INT NULL");
    expect(source).toContain("failureStatementLabel VARCHAR(180) NULL");
    expect(source).toContain("onStatement: (statement) => { currentStatement = statement; }");
    expect(source).toContain("failureMigration=?,failureStatementIndex=?,failureStatementLabel=?");
    expect(source).toContain("Schema diagnostic: unknown column ");
    expect(source).toContain("Automatic retry is blocked");
  });

  it("audits base columns referenced by recent package-activation and accounting migrations", async () => {
    const audit = await readFile(new URL("./audit-portal-schema.mjs", import.meta.url), "utf8");

    for (const column of [
      '["app_settings","settingKey","varchar"]',
      '["app_settings","settingValue","text"]',
      '["packages","name","varchar"]',
      '["packages","enabled","tinyint"]',
      '["opportunity_package_policies","packageName","varchar"]',
      '["opportunity_package_policies","enabled","tinyint"]',
      '["customer_package_subscriptions","userId","int"]',
      '["customer_package_subscriptions","packageId","int"]',
    ]) {
      expect(audit).toContain(column);
    }
  });
});
