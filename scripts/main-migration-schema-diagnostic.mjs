const EXPECTED_COLUMNS = Object.freeze([
  // Legacy main-journal migrations with non-idempotent column renames.
  { migration: "0019_daily_opportunity_quotas.sql", table: "opportunity_package_policies", column: "maxPopupsPerDay" },
  { migration: "0032_package_trade_dollar_units.sql", table: "opportunity_package_policies", column: "minimumTradeUnits" },
  { migration: "0032_package_trade_dollar_units.sql", table: "opportunity_package_policies", column: "maximumTradeUnits" },

  // Recent main-journal migrations and their base-table prerequisites.
  { migration: "0068_trade_realized_profit_accounting.sql", table: "trade_positions", column: "realizedGrossProfitMinor" },
  { migration: "0068_trade_realized_profit_accounting.sql", table: "trade_positions", column: "platformFeeMinor" },
  { migration: "0068_trade_realized_profit_accounting.sql", table: "trade_positions", column: "netProfitMinor" },
  { migration: "0068_trade_realized_profit_accounting.sql", table: "trade_positions", column: "feePolicyVersion" },
  { migration: "0068_trade_realized_profit_accounting.sql", table: "trade_positions", column: "platformFeeRateBps" },
  { migration: "0068_trade_realized_profit_accounting.sql", table: "trade_positions", column: "platformFeeRoundingMode" },
  { migration: "0068_trade_realized_profit_accounting.sql", table: "trade_positions", column: "settlementOutcome" },
  { migration: "0068_trade_realized_profit_accounting.sql", table: "app_settings", column: "settingKey" },
  { migration: "0068_trade_realized_profit_accounting.sql", table: "app_settings", column: "settingValue" },

  { migration: "0069_trading_package_activation.sql", table: "packages", column: "name" },
  { migration: "0069_trading_package_activation.sql", table: "packages", column: "enabled" },
  { migration: "0069_trading_package_activation.sql", table: "packages", column: "minimumQualifyingBalanceUsdMinor" },
  { migration: "0069_trading_package_activation.sql", table: "packages", column: "durationMonths" },
  { migration: "0069_trading_package_activation.sql", table: "packages", column: "opportunitiesPerDay" },
  { migration: "0069_trading_package_activation.sql", table: "packages", column: "termsVersion" },
  { migration: "0069_trading_package_activation.sql", table: "customer_package_subscriptions", column: "userId" },
  { migration: "0069_trading_package_activation.sql", table: "customer_package_subscriptions", column: "packageId" },
  { migration: "0069_trading_package_activation.sql", table: "customer_package_subscriptions", column: "startsAt" },
  { migration: "0069_trading_package_activation.sql", table: "customer_package_subscriptions", column: "status" },
  { migration: "0069_trading_package_activation.sql", table: "customer_package_subscriptions", column: "activationKey" },
  { migration: "0069_trading_package_activation.sql", table: "customer_package_subscriptions", column: "termsSnapshotJson" },
  { migration: "0069_trading_package_activation.sql", table: "customer_package_subscriptions", column: "qualifyingBalanceUsdMinor" },
  { migration: "0069_trading_package_activation.sql", table: "customer_package_subscriptions", column: "packageTermsVersion" },
  { migration: "0069_trading_package_activation.sql", table: "customer_package_subscriptions", column: "activatedAt" },
  { migration: "0069_trading_package_activation.sql", table: "opportunity_package_policies", column: "packageName" },
  { migration: "0069_trading_package_activation.sql", table: "opportunity_package_policies", column: "enabled" },
  { migration: "0069_trading_package_activation.sql", table: "opportunity_package_policies", column: "automaticTradingEnabled" },
  { migration: "0069_trading_package_activation.sql", table: "trade_positions", column: "status" },
  { migration: "0069_trading_package_activation.sql", table: "trade_positions", column: "packageSubscriptionId" },
  { migration: "0069_trading_package_activation.sql", table: "missed_opportunities", column: "potentialRewardMinor" },
  { migration: "0069_trading_package_activation.sql", table: "missed_opportunities", column: "availableMinorAtOpportunity" },
  { migration: "0069_trading_package_activation.sql", table: "missed_opportunities", column: "shortfallMinor" },

  { migration: "0070_local_scheduled_jobs.sql", table: "local_scheduled_jobs", column: "taskUid" },
  { migration: "0070_local_scheduled_jobs.sql", table: "local_scheduled_jobs", column: "ownerUserId" },
  { migration: "0070_local_scheduled_jobs.sql", table: "local_scheduled_jobs", column: "name" },
  { migration: "0070_local_scheduled_jobs.sql", table: "local_scheduled_jobs", column: "cronExpression" },
  { migration: "0070_local_scheduled_jobs.sql", table: "local_scheduled_jobs", column: "callbackPath" },
  { migration: "0070_local_scheduled_jobs.sql", table: "local_scheduled_jobs", column: "nextExecutionAt" },
  { migration: "0070_local_scheduled_jobs.sql", table: "local_scheduled_jobs", column: "lockedUntil" },
]);

const LEGACY_RENAMES = Object.freeze([
  { migration: "0019_daily_opportunity_quotas.sql", table: "opportunity_package_policies", oldColumn: "maxPopupsPerMinute", newColumn: "maxPopupsPerDay" },
  { migration: "0032_package_trade_dollar_units.sql", table: "opportunity_package_policies", oldColumn: "minimumTradeMinor", newColumn: "minimumTradeUnits" },
  { migration: "0032_package_trade_dollar_units.sql", table: "opportunity_package_policies", oldColumn: "maximumTradeMinor", newColumn: "maximumTradeUnits" },
]);

/**
 * Read-only diagnostics for the fields used by migration statements that are
 * prone to schema drift. This never executes a migration or changes markers.
 */
export async function inspectMainMigrationSchema(connection) {
  const [rows] = await connection.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema=DATABASE()",
  );
  const present = new Set(rows.map((row) => String(row.table_name) + "." + String(row.column_name)));
  const discrepancies = [];

  for (const item of EXPECTED_COLUMNS) {
    if (!present.has(item.table + "." + item.column)) {
      discrepancies.push(
        item.migration + ": missing " + item.table + "." + item.column +
        " (required by this migration or its base-table prerequisites)",
      );
    }
  }

  for (const item of LEGACY_RENAMES) {
    const hasOld = present.has(item.table + "." + item.oldColumn);
    const hasNew = present.has(item.table + "." + item.newColumn);
    if (hasOld && !hasNew) {
      discrepancies.push(
        item.migration + ": legacy column " + item.table + "." + item.oldColumn +
        " exists but expected renamed column " + item.table + "." + item.newColumn + " is missing",
      );
    } else if (!hasOld && !hasNew) {
      discrepancies.push(
        item.migration + ": neither " + item.table + "." + item.oldColumn +
        " nor " + item.table + "." + item.newColumn + " exists",
      );
    }
  }

  return discrepancies;
}
