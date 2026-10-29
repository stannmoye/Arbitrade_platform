import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0086_trading_popup_policy_ranges.sql", import.meta.url), "utf8");
const snapshotMigration = readFileSync(new URL("../drizzle/0088_trading_popup_trade_snapshots.sql", import.meta.url), "utf8");
const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const lifecycle = readFileSync(new URL("./opportunityLifecycle.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const policyEditor = readFileSync(new URL("../client/src/components/TradingDeliveryPolicyEditor.tsx", import.meta.url), "utf8");
const workerSchema = readFileSync(new URL("../scripts/worker-schema-contracts.mjs", import.meta.url), "utf8");

describe("administrator-managed Trading popup policy bounds and snapshots", () => {
  it("uses nullable paired policy bounds, approved badge styles and durable event snapshot columns", () => {
    for (const field of ["badgeLabel", "badgeStyle", "minimumPayoutRateBps", "maximumPayoutRateBps", "minimumTradeDurationSeconds", "maximumTradeDurationSeconds"]) {
      expect(schema).toContain(field);
      expect(migration).toContain(field);
      expect(router).toContain(field);
    }
    for (const field of ["policyVersion", "durationSeconds", "badgeLabel", "badgeStyle"]) {
      expect(migration).toContain(field);
      expect(lifecycle).toContain(field);
      expect(workerSchema).toContain(field);
    }
    for (const field of ["configuredProfitRateBps", "configuredDurationSeconds", "configuredPopupDisplaySeconds", "packagePolicyVersionSnapshot", "packageBadgeLabel", "companyReferenceId", "companyDisplayName", "companyLogoUrl", "companyReferenceOnly"]) {
      expect(schema).toContain(field);
      expect(snapshotMigration).toContain(field);
      expect(workerSchema).toContain(field);
    }
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS");
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("selects and snapshots configured popup ranges before trade allocation", () => {
    expect(database).toContain("chooseInclusiveInteger(Number(configured.minimumPayoutRateBps),Number(configured.maximumPayoutRateBps))");
    expect(database).toContain("chooseInclusiveInteger(Number(configured.minimumTradeDurationSeconds),Number(configured.maximumTradeDurationSeconds))");
    expect(database).toContain("configuredProfitRateBps,configuredDurationSeconds,configuredPopupDisplaySeconds");
    expect(database).toContain("calculateConfiguredProfitMinor(input.amountMinor,effectiveRateBps)");
    expect(database).toContain("Saved pop-up duration is outside the tier");
    expect(database).toContain("packagePolicyVersionSnapshot:snapshotVersion");
    expect(lifecycle).toContain("SELECT settingValue FROM app_settings WHERE settingKey=? FOR UPDATE");
    expect(lifecycle).toContain("companyReferenceId,companyDisplayName,companyLogoUrl,companyReferenceOnly");
    expect(policyEditor).toContain("Each newly delivered pop-up selects one rate and one duration inside the saved tier ranges.");
    expect(policyEditor).toContain("existing pop-ups keep their original snapshots.");
  });

  it("limits badge styles to the allowlist and validates paired bounds in the service", () => {
    expect(database).toContain('["neutral","blue","purple","gold","green"].includes(badgeStyle)');
    expect(database).toContain("Set both published reward-rate bounds or leave both blank");
    expect(database).toContain("Set both published duration bounds or leave both blank");
    expect(policyEditor).toContain('value="purple"');
    expect(app).toContain("policyRowValid");
  });
});
