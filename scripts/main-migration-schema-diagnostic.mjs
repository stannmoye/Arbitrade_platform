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
  "0086_trading_popup_policy_snapshots": [
    ["opportunity_package_policies", "maximumRewardBps"],
    ["opportunity_popup_events", "configuredProfitRateBps"],
    ["trade_positions", "configuredProfitRateBps"],
    ["trading_company_rotation_state", "userId"],
  ],
  "0087_trading_opportunity_execution_leases": [
    { label: "opportunity popup execution lease token", columns: [["opportunity_popup_events", "executionLeaseToken"]] },
  ],
  "0088_trading_package_policy_schema_reconciliation": [
    ["opportunity_package_policies", "automaticDelivery"],
    ["opportunity_package_policies", "automaticTradingEnabled"],
    ["opportunity_package_policies", "maxDailyRewardMinor"],
    ["trade_positions", "rewardReservedMinor"],
  ],
  "0085_trade_settlement_schema_reconciliation": [
    { label: "trade_positions settlement lifecycle columns", columns: [
      ["trade_positions", "rewardReservedMinor"], ["trade_positions", "rewardCreditedMinor"],
      ["trade_positions", "lifecycleStage"], ["trade_positions", "settlementStatus"],
      ["trade_positions", "settlementReference"], ["trade_positions", "settlementConfirmedAt"],
      ["trade_positions", "settlementConfirmedBy"], ["trade_positions", "settlementNotes"],
    ] },
  ],
  "0089_trading_popup_policy_ranges": [
    ["opportunity_package_policies", "packageName"],
    ["opportunity_popup_events", "eventKey"],
  ],
  "0090_trading_company_spotlight_rotation": [
    ["opportunity_package_policies", "companyRotationEnabled"],
    ["opportunity_package_policies", "companyRotationCountryNames"],
    ["opportunity_package_policies", "companyRotationRepeatPolicy"],
  ],
  "0091_trading_popup_trade_snapshots": [
    ["opportunity_popup_events", "packageName"],
    ["trade_positions", "id"],
  ],
  "0092_trading_trade_wallet_funding_plan_snapshot": [
    ["trade_positions", "walletFundingPlanJson"],
  ],
  "0093_admin_wallet_adjustment_idempotency": [
    ["admin_wallet_adjustment_idempotency", "adminId"],
    ["admin_wallet_adjustment_idempotency", "idempotencyKey"],
    ["admin_wallet_adjustment_idempotency", "requestHash"],
    ["admin_wallet_adjustment_idempotency", "responseJson"],
  ],
  "0094_trading_policy_duration_bounds_nullable": [
    ["opportunity_package_policies", "minimumTradeDurationSeconds"],
    ["opportunity_package_policies", "maximumTradeDurationSeconds"],
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

const MIGRATION_PROGRESS_COLUMNS = Object.freeze({
  "0068_trade_realized_profit_accounting": [
    { label: "trade_positions accounting columns from statement 1", columns: [
      ["trade_positions", "realizedGrossProfitMinor"], ["trade_positions", "platformFeeMinor"],
      ["trade_positions", "netProfitMinor"], ["trade_positions", "feePolicyVersion"],
      ["trade_positions", "platformFeeRateBps"], ["trade_positions", "platformFeeRoundingMode"],
      ["trade_positions", "settlementOutcome"],
    ] },
  ],
  "0069_trading_package_activation": [
    { label: "packages columns from statement 1", columns: [
      ["packages", "minimumQualifyingBalanceUsdMinor"], ["packages", "durationMonths"],
      ["packages", "opportunitiesPerDay"], ["packages", "termsVersion"],
    ] },
    { label: "subscription columns from statement 2", columns: [
      ["customer_package_subscriptions", "activationKey"], ["customer_package_subscriptions", "termsSnapshotJson"],
      ["customer_package_subscriptions", "qualifyingBalanceUsdMinor"], ["customer_package_subscriptions", "packageTermsVersion"],
      ["customer_package_subscriptions", "activatedAt"],
    ] },
    { label: "policy column before policy update", columns: [["opportunity_package_policies", "automaticTradingEnabled"]] },
    { label: "trade package-subscription column from statement 9", columns: [["trade_positions", "packageSubscriptionId"]] },
    { label: "missed-opportunity columns from statement 11", columns: [
      ["missed_opportunities", "availableMinorAtOpportunity"], ["missed_opportunities", "shortfallMinor"],
    ] },
  ],
  "0070_local_scheduled_jobs": [
    { label: "local_scheduled_jobs table columns", columns: [
      ["local_scheduled_jobs", "taskUid"], ["local_scheduled_jobs", "ownerUserId"],
      ["local_scheduled_jobs", "cronExpression"], ["local_scheduled_jobs", "callbackPath"],
      ["local_scheduled_jobs", "nextExecutionAt"], ["local_scheduled_jobs", "lockedUntil"],
    ] },
  ],
  "0086_trading_popup_policy_snapshots": [
    { label: "popup policy and immutable snapshot fields", columns: [
      ["opportunity_package_policies", "maximumRewardBps"], ["opportunity_package_policies", "minimumTradeDurationSeconds"],
      ["opportunity_popup_events", "configuredProfitRateBps"], ["trade_positions", "configuredProfitRateBps"],
    ] },
  ],
  "0087_trading_opportunity_execution_leases": [
    { label: "opportunity execution lease token", columns: [["opportunity_popup_events", "executionLeaseToken"]] },
  ],
  "0088_trading_package_policy_schema_reconciliation": [
    { label: "Trading policy and worker reservation schema", columns: [
      ["opportunity_package_policies", "automaticDelivery"], ["opportunity_package_policies", "automaticTradingEnabled"],
      ["trade_positions", "rewardReservedMinor"], ["trade_reward_reservations", "tradeId"],
    ] },
  ],
  "0089_trading_popup_policy_ranges": [
    { label: "administrator Trading policy range columns", columns: [
      ["opportunity_package_policies", "badgeLabel"], ["opportunity_package_policies", "badgeStyle"],
      ["opportunity_package_policies", "minimumPayoutRateBps"], ["opportunity_package_policies", "maximumPayoutRateBps"],
      ["opportunity_package_policies", "minimumTradeDurationSeconds"], ["opportunity_package_policies", "maximumTradeDurationSeconds"],
    ] },
    { label: "durable popup snapshot columns", columns: [
      ["opportunity_popup_events", "policyVersion"], ["opportunity_popup_events", "durationSeconds"],
      ["opportunity_popup_events", "badgeLabel"], ["opportunity_popup_events", "badgeStyle"],
    ] },
  ],
  "0091_trading_popup_trade_snapshots": [
    { label: "immutable popup snapshot columns", columns: [
      ["opportunity_popup_events", "configuredProfitRateBps"], ["opportunity_popup_events", "configuredDurationSeconds"],
      ["opportunity_popup_events", "configuredPopupDisplaySeconds"], ["opportunity_popup_events", "packagePolicyVersionSnapshot"],
      ["opportunity_popup_events", "packageBadgeLabel"], ["opportunity_popup_events", "companyReferenceId"],
      ["opportunity_popup_events", "companyDisplayName"], ["opportunity_popup_events", "companyLogoUrl"],
      ["opportunity_popup_events", "companyReferenceMetadataJson"], ["opportunity_popup_events", "companyReferenceOnly"],
    ] },
    { label: "immutable trade snapshot columns", columns: [
      ["trade_positions", "configuredProfitRateBps"], ["trade_positions", "configuredDurationSeconds"],
      ["trade_positions", "packagePolicyVersionSnapshot"], ["trade_positions", "companyReferenceId"],
      ["trade_positions", "companyDisplayName"], ["trade_positions", "companyLogoUrl"],
      ["trade_positions", "companyReferenceMetadataJson"], ["trade_positions", "companyReferenceOnly"],
    ] },
  ],
  "0092_trading_trade_wallet_funding_plan_snapshot": [
    { label: "immutable trade wallet funding plan snapshot", columns: [["trade_positions", "walletFundingPlanJson"]] },
  ],
  "0093_admin_wallet_adjustment_idempotency": [
    { label: "administrator wallet-adjustment idempotency response", columns: [
      ["admin_wallet_adjustment_idempotency", "adminId"], ["admin_wallet_adjustment_idempotency", "idempotencyKey"],
      ["admin_wallet_adjustment_idempotency", "requestHash"], ["admin_wallet_adjustment_idempotency", "responseJson"],
    ] },
  ],
  "0094_trading_policy_duration_bounds_nullable": [
    { label: "nullable unconfigured Trading duration bounds", columns: [
      ["opportunity_package_policies", "minimumTradeDurationSeconds"],
      ["opportunity_package_policies", "maximumTradeDurationSeconds"],
    ] },
  ],
});

const REQUIRED_NULLABLE_COLUMNS = Object.freeze({
  "0094_trading_policy_duration_bounds_nullable": [
    ["opportunity_package_policies", "minimumTradeDurationSeconds"],
    ["opportunity_package_policies", "maximumTradeDurationSeconds"],
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
    "SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_schema=DATABASE()",
  );
  const present = new Set(rows.map((row) => String(row.table_name) + "." + String(row.column_name)));
  const nullable = new Set(rows.filter((row) => String(row.is_nullable).toUpperCase() === "YES")
    .map((row) => String(row.table_name) + "." + String(row.column_name)));
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

  for (const group of MIGRATION_PROGRESS_COLUMNS[migrationTag] || []) {
    const missing = group.columns.filter(([table, column]) => !present.has(table + "." + column));
    if (missing.length) {
      diagnostics.push(
        "Progress hint for " + migrationTag + ".sql: " + group.label + " has " +
        (group.columns.length - missing.length) + "/" + group.columns.length +
        " expected columns present; missing " + missing.map(([table, column]) => table + "." + column).join(", ") +
        ". This describes resulting schema only and does not prove which statement failed.",
      );
    } else {
      diagnostics.push(
        "Progress hint for " + migrationTag + ".sql: " + group.label +
        " is fully present in the schema. This describes resulting schema only and does not prove which statement failed.",
      );
    }
  }

  for (const [table, column] of REQUIRED_NULLABLE_COLUMNS[migrationTag] || []) {
    if (!nullable.has(table + "." + column)) {
      diagnostics.push("Column " + table + "." + column + " must be nullable for " + migrationTag + ".sql.");
    }
  }

  return diagnostics;
}
