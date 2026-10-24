import { describe, expect, it } from "vitest";
import { inspectMainMigrationSchema } from "./main-migration-schema-diagnostic.mjs";

function fakeConnection(columns) {
  return {
    async query(sql) {
      expect(sql).toContain("information_schema.columns");
      expect(sql).toContain("table_schema=DATABASE()");
      return [columns.map(([table_name, column_name]) => ({ table_name, column_name })), []];
    },
  };
}

describe("read-only main migration schema diagnostics", () => {
  it("identifies a missing legacy rename source and its existing destination", async () => {
    const result = await inspectMainMigrationSchema(fakeConnection([
      ["opportunity_package_policies", "maxPopupsPerDay"],
      ["app_settings", "settingKey"],
      ["app_settings", "settingValue"],
    ]), "0019_daily_opportunity_quotas");

    expect(result).toEqual([
      "0019_daily_opportunity_quotas.sql may already be reflected in the schema: source opportunity_package_policies.maxPopupsPerMinute is absent while destination opportunity_package_policies.maxPopupsPerDay exists, but tracker history did not record the migration.",
    ]);
  });

  it("reports missing pre-existing fields without suggesting a migration retry", async () => {
    const result = await inspectMainMigrationSchema(fakeConnection([
      ["packages", "name"],
      ["packages", "enabled"],
      ["customer_package_subscriptions", "userId"],
      ["customer_package_subscriptions", "packageId"],
      ["customer_package_subscriptions", "startsAt"],
      ["customer_package_subscriptions", "status"],
      ["opportunity_package_policies", "packageName"],
      ["opportunity_package_policies", "enabled"],
      ["app_settings", "settingKey"],
      ["app_settings", "settingValue"],
      ["trade_positions", "status"],
    ]), "0069_trading_package_activation");

    expect(result).toContain("Missing required pre-existing column missed_opportunities.potentialRewardMinor for 0069_trading_package_activation.sql.");
    expect(result.every(message => /Missing required|exists but expected|Both source/.test(message))).toBe(true);
  });
});
