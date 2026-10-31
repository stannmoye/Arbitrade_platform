import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  findWorkerSchemaContractFailures,
  WORKER_SCHEMA_CONTRACTS,
} from "./worker-schema-contracts.mjs";

function validMetadata() {
  const columns = [];
  const indexes = [];
  for (const [table, contract] of Object.entries(WORKER_SCHEMA_CONTRACTS)) {
    for (const column of contract.columns) {
      const dataType = contract.dataTypes?.[column] ?? (contract.exactColumnTypes?.[column] ? "enum" : "int");
      columns.push({
        tableName: table,
        columnName: column,
        dataType,
        columnType: contract.exactColumnTypes?.[column] ?? dataType,
        isNullable: contract.nullable?.[column] ? "YES" : "NO",
      });
    }
    for (const [indexName, index] of Object.entries(contract.indexes)) {
      index.columns.forEach((columnName, position) => indexes.push({
        tableName: table,
        indexName,
        columnName,
        nonUnique: index.unique ? 0 : 1,
        sequenceInIndex: position + 1,
      }));
    }
  }
  return { columns, indexes };
}

describe("worker schema contracts", () => {
  it("accepts the exact columns, nullability, campaign states, and ordered indexes required by workers", () => {
    const { columns, indexes } = validMetadata();
    expect(findWorkerSchemaContractFailures(columns, indexes)).toEqual([]);
  });

  it("creates and validates the durable Trading tier queue in the runtime schema bridge", async () => {
    const root = new URL("../", import.meta.url);
    const [runtimeSchema, mainMigrationRunner, migration, opportunityWorkerMigration, healthMigration, deliveryDiagnosticsMigration, mainPopupPolicySnapshotMigration, executionLeaseMigration, packagePolicySchemaMigration, popupRangeMigration, companyRotationMigration, popupTradeSnapshotsMigration, walletFundingPlanMigration, walletAdjustmentIdempotencyMigration, nullablePolicyDurationBoundsMigration, fxSnapshotSourceTimestampMigration, settlementReviewTimestampMigration, dailyAttemptAccountingMigration, portalRunner, installerRecovery] = await Promise.all([
      readFile(new URL("scripts/ensure-worker-runtime-schema.mjs", root), "utf8"),
      readFile(new URL("scripts/guarded-main-migrate.mjs", root), "utf8"),
      readFile(new URL("drizzle/0082_trading_tier_qualification_jobs.sql", root), "utf8"),
      readFile(new URL("drizzle/0083_trading_opportunity_worker_indexes.sql", root), "utf8"),
      readFile(new URL("drizzle/0084_worker_health_registry.sql", root), "utf8"),
      readFile(new URL("drizzle/0052_delivery_diagnostics.sql", root), "utf8"),
      readFile(new URL("drizzle/0086_trading_popup_policy_snapshots.sql", root), "utf8"),
      readFile(new URL("drizzle/0087_trading_opportunity_execution_leases.sql", root), "utf8"),
      readFile(new URL("drizzle/0088_trading_package_policy_schema_reconciliation.sql", root), "utf8"),
      readFile(new URL("drizzle/0089_trading_popup_policy_ranges.sql", root), "utf8"),
      readFile(new URL("drizzle/0090_trading_company_spotlight_rotation.sql", root), "utf8"),
      readFile(new URL("drizzle/0091_trading_popup_trade_snapshots.sql", root), "utf8"),
      readFile(new URL("drizzle/0092_trading_trade_wallet_funding_plan_snapshot.sql", root), "utf8"),
      readFile(new URL("drizzle/0093_admin_wallet_adjustment_idempotency.sql", root), "utf8"),
      readFile(new URL("drizzle/0094_trading_policy_duration_bounds_nullable.sql", root), "utf8"),
      readFile(new URL("drizzle/0095_fx_snapshot_source_timestamp_precision.sql", root), "utf8"),
      readFile(new URL("drizzle/0096_trade_settlement_review_timestamp.sql", root), "utf8"),
      readFile(new URL("drizzle/0097_trading_daily_execution_attempt_accounting.sql", root), "utf8"),
      readFile(new URL("scripts/apply-portal-migrations.mjs", root), "utf8"),
      readFile(new URL("installer/migration-recovery-status.mjs", root), "utf8"),
    ]);
    expect(WORKER_SCHEMA_CONTRACTS.trading_tier_qualification_jobs.indexes)
      .toHaveProperty("trading_tier_qualification_jobs_source_ledger_uq");
    expect(WORKER_SCHEMA_CONTRACTS.trading_tier_qualification_jobs.indexes)
      .toHaveProperty("trading_tier_qualification_jobs_status_available_idx");
    expect(runtimeSchema).toContain('drizzle/0082_trading_tier_qualification_jobs.sql');
    expect(runtimeSchema).toContain("await executeCompatibleMigrationSql(db, tierQualificationMigration)");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `trading_tier_qualification_jobs`");
    expect(runtimeSchema).toContain('drizzle/0083_trading_opportunity_worker_indexes.sql');
    expect(runtimeSchema).toContain("await executeCompatibleMigrationSql(db, tradingOpportunityWorkerMigration)");
    expect(opportunityWorkerMigration).toContain("customer_package_subscriptions_worker_status_user_idx");
    expect(runtimeSchema).toContain('drizzle/0052_delivery_diagnostics.sql');
    expect(mainMigrationRunner).toContain('drizzle", "0052_delivery_diagnostics.sql');
    expect(mainMigrationRunner.indexOf('drizzle", "0052_delivery_diagnostics.sql')).toBeLessThan(mainMigrationRunner.indexOf("await assertWorkerSchemaContracts(connection)"));
    expect(runtimeSchema).toContain("await executeCompatibleMigrationSql(db, deliveryDiagnosticsMigration)");
    expect(deliveryDiagnosticsMigration).toContain("ADD COLUMN IF NOT EXISTS `status` enum");
    expect(WORKER_SCHEMA_CONTRACTS.opportunity_delivery_events.columns).toContain("status");
    expect(WORKER_SCHEMA_CONTRACTS.opportunity_delivery_events.indexes).toHaveProperty("opportunity_delivery_user_offer_day_unique");
    expect(runtimeSchema).toContain('drizzle/0084_worker_health_registry.sql');
    expect(runtimeSchema).toContain("await executeCompatibleMigrationSql(db, workerHealthMigration)");
    expect(runtimeSchema).toContain('drizzle/0085_trade_settlement_schema_reconciliation.sql');
    expect(runtimeSchema).toContain("await executeCompatibleMigrationSql(db, settlementSchemaMigration)");
    expect(runtimeSchema).toContain('drizzle/0086_trading_popup_policy_snapshots.sql');
    expect(runtimeSchema).toContain('drizzle/0087_trading_opportunity_execution_leases.sql');
    expect(runtimeSchema).toContain('drizzle/0088_trading_package_policy_schema_reconciliation.sql');
    expect(packagePolicySchemaMigration).toContain("`automaticDelivery` tinyint(1) NOT NULL DEFAULT 0");
    expect(packagePolicySchemaMigration).toContain("`automaticTradingEnabled` tinyint(1) NOT NULL DEFAULT 0");
    expect(runtimeSchema).toContain('drizzle/0089_trading_popup_policy_ranges.sql');
    expect(runtimeSchema).toContain("await executeCompatibleMigrationSql(db, popupPolicyRangeMigration)");
    expect(runtimeSchema).toContain('drizzle/0090_trading_company_spotlight_rotation.sql');
    expect(runtimeSchema).toContain("await executeCompatibleMigrationSql(db, companySpotlightRotationMigration)");
    expect(runtimeSchema).toContain('drizzle/0091_trading_popup_trade_snapshots.sql');
    expect(runtimeSchema).toContain("await executeCompatibleMigrationSql(db, popupTradeSnapshotsMigration)");
    expect(runtimeSchema).toContain('drizzle/0092_trading_trade_wallet_funding_plan_snapshot.sql');
    expect(runtimeSchema).toContain("await executeCompatibleMigrationSql(db, walletFundingPlanMigration)");
    expect(runtimeSchema).toContain('drizzle/0093_admin_wallet_adjustment_idempotency.sql');
    expect(runtimeSchema).toContain("await executeCompatibleMigrationSql(db, walletAdjustmentIdempotencyMigration)");
    expect(runtimeSchema).toContain('drizzle/0094_trading_policy_duration_bounds_nullable.sql');
    expect(runtimeSchema).toContain("await executeCompatibleMigrationSql(db, nullablePolicyDurationBoundsMigration)");
    expect(nullablePolicyDurationBoundsMigration).toContain("MODIFY COLUMN `minimumTradeDurationSeconds` int NULL DEFAULT NULL");
    expect(nullablePolicyDurationBoundsMigration).toContain("MODIFY COLUMN `maximumTradeDurationSeconds` int NULL DEFAULT NULL");
    expect(runtimeSchema).toContain('drizzle/0095_fx_snapshot_source_timestamp_precision.sql');
    expect(runtimeSchema).toContain("await executeCompatibleMigrationSql(db, fxSnapshotSourceTimestampMigration)");
    expect(fxSnapshotSourceTimestampMigration).toContain("MODIFY COLUMN `sourceDate` varchar(64) NULL");
    expect(runtimeSchema).toContain('drizzle/0096_trade_settlement_review_timestamp.sql');
    expect(runtimeSchema).toContain("await executeCompatibleMigrationSql(db, settlementReviewTimestampMigration)");
    expect(settlementReviewTimestampMigration).toContain("ADD COLUMN IF NOT EXISTS `settlementReviewAt` timestamp NULL");
    expect(runtimeSchema).toContain('drizzle/0097_trading_daily_execution_attempt_accounting.sql');
    expect(runtimeSchema).toContain("await executeCompatibleMigrationSql(db, dailyExecutionAttemptAccountingMigration)");
    expect(dailyAttemptAccountingMigration).toContain("`executionDailyAttemptCount` int NOT NULL DEFAULT 0");
    expect(dailyAttemptAccountingMigration).toContain("`executionDailyAttemptDay` varchar(10) NULL");
    expect(portalRunner).toContain('"0097_trading_daily_execution_attempt_accounting.sql"');
    expect(installerRecovery).toContain('"0097_trading_daily_execution_attempt_accounting.sql"');
    expect(WORKER_SCHEMA_CONTRACTS.opportunity_popup_events.columns).toContain("executionDailyAttemptCount");
    expect(WORKER_SCHEMA_CONTRACTS.opportunity_popup_events.columns).toContain("executionDailyAttemptDay");
    expect(walletAdjustmentIdempotencyMigration).toContain("CREATE TABLE IF NOT EXISTS `admin_wallet_adjustment_idempotency`");
    expect(WORKER_SCHEMA_CONTRACTS.admin_wallet_adjustment_idempotency.indexes).toHaveProperty("admin_wallet_adjustment_key_uq");
    expect(portalRunner).toContain('"0093_admin_wallet_adjustment_idempotency.sql"');
    expect(installerRecovery).toContain('"0093_admin_wallet_adjustment_idempotency.sql"');
    expect(portalRunner).toContain('"0094_trading_policy_duration_bounds_nullable.sql"');
    expect(installerRecovery).toContain('"0094_trading_policy_duration_bounds_nullable.sql"');
    expect(portalRunner).toContain('"0095_fx_snapshot_source_timestamp_precision.sql"');
    expect(installerRecovery).toContain('"0095_fx_snapshot_source_timestamp_precision.sql"');
    expect(portalRunner).toContain('"0096_trade_settlement_review_timestamp.sql"');
    expect(installerRecovery).toContain('"0096_trade_settlement_review_timestamp.sql"');
    expect(WORKER_SCHEMA_CONTRACTS.trade_positions.columns).toContain("settlementReviewAt");
    expect(WORKER_SCHEMA_CONTRACTS.trade_positions.nullable?.settlementReviewAt).toBe(true);
    expect(walletFundingPlanMigration).toContain("ALTER TABLE `trade_positions`");
    expect(walletFundingPlanMigration).toContain("ADD COLUMN IF NOT EXISTS `walletFundingPlanJson` TEXT NULL");
    expect(portalRunner).toContain('"0092_trading_trade_wallet_funding_plan_snapshot.sql"');
    expect(installerRecovery).toContain('"0092_trading_trade_wallet_funding_plan_snapshot.sql"');
    expect(WORKER_SCHEMA_CONTRACTS.trade_positions.columns).toContain("walletFundingPlanJson");
    for (const column of ["configuredProfitRateBps", "configuredDurationSeconds", "configuredPopupDisplaySeconds", "packagePolicyVersionSnapshot", "companyReferenceId", "companyDisplayName", "companyLogoUrl", "companyReferenceMetadataJson", "companyReferenceOnly"]) expect(popupTradeSnapshotsMigration).toContain(column);
    for (const column of ["companyRotationEnabled", "companyRotationCountryNames", "companyRotationRepeatPolicy"]) expect(companyRotationMigration).toContain(column);
    for (const column of ["badgeLabel", "badgeStyle", "minimumPayoutRateBps", "maximumPayoutRateBps", "minimumTradeDurationSeconds", "maximumTradeDurationSeconds", "durationSeconds"]) expect(popupRangeMigration).toContain(column);
    expect(healthMigration).toContain("CREATE TABLE IF NOT EXISTS `worker_health_registry`");
    expect(healthMigration).toContain("worker_health_worker_instance_uq");
    expect(healthMigration).toContain("worker_health_heartbeat_idx");
  });

  it("rejects present tables whose shape would still break worker SQL", () => {
    const { columns, indexes } = validMetadata();
    const brokenColumns = columns
      .filter((row) => !(row.tableName === "mining_pending_boost_rewards" && row.columnName === "amountCki"))
      .map((row) => row.tableName === "notification_campaigns" && row.columnName === "status"
        ? { ...row, columnType: "enum('draft','scheduled','published')" }
        : row);
    const brokenIndexes = indexes.map((row) =>
      row.tableName === "notification_campaign_deliveries" && row.indexName === "notification_campaign_delivery_status_idx"
        ? { ...row, columnName: row.sequenceInIndex === 1 ? "status" : row.sequenceInIndex === 2 ? "campaignId" : row.columnName }
        : row,
    );

    const failures = findWorkerSchemaContractFailures(brokenColumns, brokenIndexes);
    expect(failures).toContain("mining_pending_boost_rewards.amountCki: required column is missing");
    expect(failures.some((failure) => failure.includes("notification_campaigns.status: expected enum("))).toBe(true);
    expect(failures.some((failure) => failure.includes("notification_campaign_delivery_status_idx: expected index column order"))).toBe(true);
  });

  it("rejects a reward amount column with the wrong decimal precision", () => {
    const { columns, indexes } = validMetadata();
    const malformed = columns.map((row) =>
      row.tableName === "mining_pending_boost_rewards" && row.columnName === "amountCki"
        ? { ...row, columnType: "decimal(18,2)" }
        : row,
    );
    expect(findWorkerSchemaContractFailures(malformed, indexes))
      .toContain("mining_pending_boost_rewards.amountCki: expected decimal(36,18), found decimal(18,2)");
  });

  it("rejects an absent worker table instead of trusting migration tracker records", () => {
    const { columns, indexes } = validMetadata();
    expect(findWorkerSchemaContractFailures(
      columns.filter((row) => row.tableName !== "mining_pending_boost_rewards"),
      indexes.filter((row) => row.tableName !== "mining_pending_boost_rewards"),
    )).toContain("mining_pending_boost_rewards: table is missing or has no visible columns");
  });

  it("creates settlement index prerequisites before indexing them in the main migration path", async () => {
    const sql = await readFile(new URL("../drizzle/0072_wallet_ledger_reconciliation_indexes.sql", import.meta.url), "utf8");
    const settlementStatusColumn = sql.indexOf("ADD COLUMN IF NOT EXISTS `settlementStatus`");
    const settlementReferenceColumn = sql.indexOf("ADD COLUMN IF NOT EXISTS `settlementReference`");
    const settlementStatusIndex = sql.indexOf("CREATE INDEX IF NOT EXISTS `trade_positions_status_settlement_user_currency_idx`");
    const settlementReferenceIndex = sql.indexOf("CREATE INDEX IF NOT EXISTS `trade_positions_settlement_reference_idx`");
    expect(settlementStatusColumn).toBeGreaterThanOrEqual(0);
    expect(settlementReferenceColumn).toBeGreaterThanOrEqual(0);
    expect(settlementStatusColumn).toBeLessThan(settlementStatusIndex);
    expect(settlementReferenceColumn).toBeLessThan(settlementReferenceIndex);
  });

  it("keeps the standalone mining and portal campaign migrations covered by the standard journal bridge", async () => {
    const root = new URL("../", import.meta.url);
    const [journalText, mainSql, miningSql, portalSql, portalRunner, popupLifecycleSql, deliveryDiagnosticsSql, popupRangeMigration, companyRotationMigration, popupTradeSnapshotsMigration] = await Promise.all([
      readFile(new URL("drizzle/meta/_journal.json", root), "utf8"),
      readFile(new URL("drizzle/0062_worker_runtime_tables.sql", root), "utf8"),
      readFile(new URL("drizzle/0048_pending_boost_rewards.sql", root), "utf8"),
      readFile(new URL("drizzle/0055_notification_campaign_delivery_tracking.sql", root), "utf8"),
      readFile(new URL("scripts/apply-portal-migrations.mjs", root), "utf8"),
      readFile(new URL("drizzle/0022_popup_lifecycle_reporting.sql", root), "utf8"),
      readFile(new URL("drizzle/0052_delivery_diagnostics.sql", root), "utf8"),
      readFile(new URL("drizzle/0089_trading_popup_policy_ranges.sql", root), "utf8"),
      readFile(new URL("drizzle/0090_trading_company_spotlight_rotation.sql", root), "utf8"),
      readFile(new URL("drizzle/0091_trading_popup_trade_snapshots.sql", root), "utf8"),
    ]);
    const journal = JSON.parse(journalText);
    expect(journal.entries.some((entry) => entry.tag === "0062_worker_runtime_tables")).toBe(true);
    // The standalone 0048 SQL remains an explicit forward-only journal entry after
    // the worker bridge. The static catalogue requires no database migration.
    const workerBridgeIndex = journal.entries.findIndex((entry) => entry.tag === "0062_worker_runtime_tables");
    const boostRewardsIndex = journal.entries.findIndex((entry) => entry.tag === "0048_pending_boost_rewards");
    const boostRewards = journal.entries.find((entry) => entry.tag === "0048_pending_boost_rewards");
    const last = journal.entries.at(-1);
    expect(workerBridgeIndex).toBeGreaterThanOrEqual(0);
    expect(boostRewardsIndex).toBeGreaterThan(workerBridgeIndex);
    expect(boostRewards.when).toBeGreaterThan(journal.entries[workerBridgeIndex].when);
    expect(last.tag).toBe("0096_trade_settlement_review_timestamp");
    expect(journal.entries.slice(-25).map((entry) => entry.tag)).toEqual([
      "0072_wallet_ledger_reconciliation_indexes",
      "0073_trade_settlement_recovery_cases",
      "0074_trade_execution_retries",
      "0075_trade_retry_delay_policy",
      "0076_trading_admin_policy_read_repair",
      "0077_trading_package_catalogue_schema_repair",
      "0078_trading_customer_package_subscription_repair",
      "0079_trade_settlement_timing_schema_repair",
      "0080_qualifying_admin_deposit_attribution",
      "0081_trading_tier_policy_alignment",
      "0082_trading_tier_qualification_jobs",
      "0083_trading_opportunity_worker_indexes",
      "0084_worker_health_registry",
      "0085_trade_settlement_schema_reconciliation",
      "0086_trading_popup_policy_snapshots",
      "0087_trading_opportunity_execution_leases",
      "0088_trading_package_policy_schema_reconciliation",
      "0089_trading_popup_policy_ranges",
      "0090_trading_company_spotlight_rotation",
      "0091_trading_popup_trade_snapshots",
      "0092_trading_trade_wallet_funding_plan_snapshot",
      "0093_admin_wallet_adjustment_idempotency",
      "0094_trading_policy_duration_bounds_nullable",
      "0095_fx_snapshot_source_timestamp_precision",
      "0096_trade_settlement_review_timestamp",
    ]);
    expect(portalRunner).toContain('"0076_trading_admin_policy_read_repair.sql"');
    expect(portalRunner).toContain('"0077_trading_package_catalogue_schema_repair.sql"');
    expect(portalRunner).toContain('"0078_trading_customer_package_subscription_repair.sql"');
    expect(portalRunner).toContain('"0079_trade_settlement_timing_schema_repair.sql"');
    expect(portalRunner).toContain('"0080_qualifying_admin_deposit_attribution.sql"');
    expect(portalRunner).toContain('"0081_trading_tier_policy_alignment.sql"');
    expect(portalRunner).toContain('"0082_trading_tier_qualification_jobs.sql"');
    expect(portalRunner).toContain('"0083_trading_opportunity_worker_indexes.sql"');
    expect(portalRunner).toContain('"0085_trade_settlement_schema_reconciliation.sql"');
    expect(portalRunner).toContain('"0086_trading_popup_policy_snapshots.sql"');
    expect(portalRunner).toContain('"0087_trading_opportunity_execution_leases.sql"');
    expect(portalRunner).toContain('"0088_trading_package_policy_schema_reconciliation.sql"');
    expect(portalRunner).toContain('"0089_trading_popup_policy_ranges.sql"');
    expect(portalRunner).toContain('"0090_trading_company_spotlight_rotation.sql"');
    expect(portalRunner).toContain('"0091_trading_popup_trade_snapshots.sql"');
    expect(popupTradeSnapshotsMigration).toContain("ADD COLUMN IF NOT EXISTS `configuredProfitRateBps`");
    expect(companyRotationMigration).toContain("ADD COLUMN IF NOT EXISTS `companyRotationEnabled`");
    expect(popupLifecycleSql).toContain("opportunity_popup_events");
    expect(popupRangeMigration).toContain("ADD COLUMN IF NOT EXISTS `durationSeconds`");
    expect(last.idx).toBe(journal.entries.at(-2).idx + 1);
    expect(last.when).toBeGreaterThan(journal.entries.at(-2).when);
    expect(portalRunner).toContain('"0055_notification_campaign_delivery_tracking.sql"');
    expect(portalRunner).toContain('"0058_withdrawable_notification_campaigns.sql"');

    // 0048 and 0055 remain authoritative standalone/portal-chain sources.
    // The journaled 0062 bridge intentionally provides their worker tables to
    // deployments that run only Drizzle's standard migration path.
    for (const table of Object.keys(WORKER_SCHEMA_CONTRACTS).filter((name) => !["trading_tier_qualification_jobs", "opportunity_popup_events", "opportunity_delivery_events", "trade_positions", "admin_wallet_adjustment_idempotency"].includes(name))) {
      expect(mainSql).toContain(table);
    }
    for (const column of WORKER_SCHEMA_CONTRACTS.mining_pending_boost_rewards.columns) {
      expect(miningSql).toContain(column);
      expect(mainSql).toContain(column);
    }
    expect(deliveryDiagnosticsSql).toContain("ALTER TABLE `opportunity_delivery_events`");
    expect(deliveryDiagnosticsSql).toContain("ADD COLUMN IF NOT EXISTS `status`");
    for (const table of ["notification_campaigns", "notification_campaign_deliveries"]) {
      expect(portalSql).toContain(table);
      expect(mainSql).toContain(table);
    }
    for (const column of WORKER_SCHEMA_CONTRACTS.notification_campaigns.columns) {
      expect(portalSql).toContain(column);
      expect(mainSql).toContain(column);
    }
    for (const column of WORKER_SCHEMA_CONTRACTS.notification_campaign_deliveries.columns) {
      expect(portalSql).toContain(column);
      expect(mainSql).toContain(column);
    }
  });

  it("gates migration success on actual worker-table schema contracts", async () => {
    const root = new URL("../", import.meta.url);
    const [mainRunner, portalRunner, miningRunner, miningRepair, runtimeRepair, verifier, installerVerifier] = await Promise.all([
      readFile(new URL("scripts/guarded-main-migrate.mjs", root), "utf8"),
      readFile(new URL("scripts/apply-portal-migrations.mjs", root), "utf8"),
      readFile(new URL("scripts/apply-mining-migrations.mjs", root), "utf8"),
      readFile(new URL("scripts/ensure-mining-current-schema.mjs", root), "utf8"),
      readFile(new URL("scripts/ensure-worker-runtime-schema.mjs", root), "utf8"),
      readFile(new URL("scripts/verify-worker-schema.mjs", root), "utf8"),
      readFile(new URL("installer/verify-install.mjs", root), "utf8"),
    ]);

    const mainVerification = mainRunner.indexOf("const verified = await assertWorkerSchemaContracts(connection);");
    const mainSuccess = mainRunner.indexOf("SET status='completed'");
    expect(mainVerification).toBeGreaterThan(-1);
    expect(mainVerification).toBeLessThan(mainSuccess);

    const portalVerification = portalRunner.indexOf("const verified = await assertWorkerSchemaContracts(connection);");
    expect(portalVerification).toBeGreaterThan(portalRunner.indexOf("Applied and recorded ${filename}"));
    expect(portalRunner).toContain("[portal-migrate] PASS: verified");

    const miningVerification = miningRunner.indexOf("const verified = await assertWorkerSchemaContracts(connection);");
    expect(miningVerification).toBeGreaterThan(miningRunner.indexOf("const rewardMethodsMigrationKey"));
    expect(miningVerification).toBeLessThan(miningRunner.indexOf("} finally {\n  await connection.end();"));
    expect(miningRunner).toContain("[mining-migrate] PASS: verified");

    const miningRepairVerification = miningRepair.indexOf('const verified = await assertWorkerSchemaContracts(db, ["mining_pending_boost_rewards"]);');
    expect(miningRepairVerification).toBeGreaterThan(-1);
    expect(miningRepairVerification).toBeLessThan(miningRepair.indexOf('message: "Current mining schema is ready"'));
    expect(runtimeRepair).toContain("const verified = await assertWorkerSchemaContracts(db);");
    expect(verifier).toContain("const verified = await assertWorkerSchemaContracts(db);");
    expect(installerVerifier).toContain("const verified = await assertWorkerSchemaContracts(db);");
    expect(installerVerifier).toContain('report("Worker schema contracts", false, detail)');
  });
});
