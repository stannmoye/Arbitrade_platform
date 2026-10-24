const MIGRATION_PREREQUISITES = Object.freeze({
  "0019_daily_opportunity_quotas": [
    ["opportunity_package_policies", "maxPopupsPerMinute"],
    ["app_settings", "settingKey"],
    ["app_settings", "settingValue"],
  ],
  "0032_package_trade_dollar_units": [
    ["opportunity_package_policies", "minimumTradeMinor"],
    ["opportunity_package_policies", "maximumTradeMinor"],
  ],
  "0068_trade_realized_profit_accounting": [
    ["trade_positions", "id"],
    ["trade_positions", "status"],
    ["app_settings", "settingKey"],
    ["app_settings", "settingValue"],
  ],
  "0069_trading_package_activation": [
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
    ["missed_opportunities", "potentialRewardMinor"],
  ],
});

const RENAMED_COLUMNS = Object.freeze([
  { migration: "0019_daily_opportunity_quotas", table: "opportunity_package_policies", from: "maxPopupsPerMinute", to: "maxPopupsPerDay" },
  { migration: "0032_package_trade_dollar_units", table: "opportunity_package_policies", from: "minimumTradeMinor", to: "minimumTradeUnits" },
  { migration: "0032_package_trade_dollar_units", table: "opportunity_package_policies", from: "maximumTradeMinor", to: "maximumTradeUnits" },
]);

/**
 * Read-only checks for required pre-existing columns used by the likely failed
 * migration. Does not execute or retry SQL, alter schema, or clear any guards.
 */
export async function inspectMainMigrationSchema(connection, migrationTag) {
  const [rows] = await connection.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema=DATABASE()",
  );
  const present = new Set(rows.map((row) => String(row.table_name) + "." + String(row.column_name)));
  const diagnostics = [];
  const base = MIGRATION_PREREQUISITES[migrationTag] || [];

  if (!MIGRATION_PREREQUISITES[migrationTag]) {
    diagnostics.push("No focused prerequisite list exists for migration " + String(migrationTag || "unknown") + ".");
  }

  for (const [table, column] of base) {
    if (!present.has(table + "." + column)) {
      diagnostics.push("Missing required pre-existing column " + table + "." + column + " for " + migrationTag + ".sql.");
    }
  }

  for (const item of RENAMED_COLUMNS.filter((entry) => entry.migration === migrationTag)) {
    const hasFrom = present.has(item.table + "." + item.from);
    const hasTo = present.has(item.table + "." + item.to);
    if (!hasFrom && hasTo) {
      diagnostics.push(
        item.migration + ".sql may already be reflected in the schema: source " + item.table + "." + item.from +
        " is absent while destination " + item.table + "." + item.to + " exists, but tracker history did not record the migration.",
      );
    } else if (!hasFrom && !hasTo) {
      diagnostics.push(
        "Both source " + item.table + "." + item.from + " and destination " + item.table + "." + item.to +
        " are missing for " + item.migration + ".sql.",
      );
    }
  }

  return diagnostics;
}
