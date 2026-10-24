import { config } from "dotenv";
import mysql from "mysql2/promise";
import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifySchemaAudit } from "./portal-schema-audit-utils.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env"), override: false });
const rawDatabaseUrl = process.env.DATABASE_URL;
if (!rawDatabaseUrl) {
  console.error("Portal schema audit requires DATABASE_URL in the private .env file.");
  process.exit(2);
}

const migrations = [
  { file: "0033_kyc_v2.sql",
    tables: ["kyc_settings","kyc_profiles","kyc_levels","kyc_stages","kyc_stage_requirements","kyc_stage_dependencies","kyc_stage_states","kyc_verification_sessions","kyc_attempts","kyc_email_verifications","kyc_phone_verifications","kyc_address_verifications","kyc_documents","kyc_document_extractions","kyc_consistency_results","kyc_liveness_checks","kyc_face_verifications","kyc_risk_scores","kyc_risk_rules","kyc_manual_reviews","kyc_admin_overrides","kyc_consents","kyc_screening_results","kyc_provider_configs","kyc_provider_attempts","kyc_rejection_reasons","kyc_retention_policies","kyc_audit_logs"],
    columns: [["kyc_profiles","userId","int"],["kyc_profiles","overallStatus","varchar"],["kyc_profiles","currentLevel","varchar"],["kyc_stage_requirements","transactionLimitMinor","int"],["kyc_attempts","idempotencyKey","varchar"],["kyc_audit_logs","recordHash","varchar"]],
    data: [{ table:"kyc_settings", column:"settingKey", value:"kyc_v2_enabled", label:"KYC v2 seed setting" }] },
  { file: "0034_email_notifications.sql",
    tables: ["password_reset_tokens","admin_email_messages"],
    columns: [["password_reset_tokens","tokenHash","varchar"],["password_reset_tokens","expiresAt","timestamp"],["admin_email_messages","htmlBody","mediumtext"],["admin_email_messages","status","enum"]],
    data: [{table:"app_settings",column:"settingKey",value:"email.smtp",label:"SMTP settings seed"},{table:"app_settings",column:"settingKey",value:"email.dailyCloseHourUtc",label:"Daily close hour seed"},{table:"app_settings",column:"settingKey",value:"email.dailyCloseMinuteUtc",label:"Daily close minute seed"}] },
  { file: "0035_default_portal_accounts.sql", tables: ["app_settings"],
    data: [{table:"app_settings",column:"settingKey",value:"opportunity.deskLabel",label:"Portal desk-label setting"}] },
  { file: "0036_crypto_mining_portal.sql",
    tables: ["mining_economics_versions","mining_packages","mining_package_versions","mining_customer_packages","mining_checkpoints","mining_ledger_transactions","mining_reward_events","mining_boost_activations","mining_conversion_preferences","mining_conversion_preference_versions","mining_conversion_jobs","mining_quote_snapshots","mining_adjustment_requests","mining_wallet_baselines"],
    columns: [["mining_economics_versions","tokenUnitsPerUsd","decimal"],["mining_economics_versions","effectiveAt","datetime"],["mining_packages","currentVersionId","int"],["mining_package_versions","priceAmount","decimal"],["mining_customer_packages","idempotencyKey","varchar"],["mining_ledger_transactions","idempotencyKey","varchar"],["mining_reward_events","tokenAmount","decimal"],["mining_conversion_jobs","status","enum"]],
    data: [{table:"mining_economics_versions",column:"version",value:"1",label:"Initial mining economics version"}] },
  { file: "0037_coinki_token_configuration.sql", tables: ["mining_schema_migrations"],
    columns: [["mining_economics_versions","tokenName","varchar"],["mining_economics_versions","tokenSymbol","varchar"]],
    data: [{table:"mining_schema_migrations",column:"migrationKey",value:"0037_coinki_token_configuration",label:"CoinKi migration marker"}] },
  { file: "0038_mining_admin_package_grants.sql", tables: ["mining_customer_packages"],
    columns: [["mining_customer_packages","ledgerTransactionId","int"],["mining_customer_packages","acquisitionType","enum"]],
    nullable: [["mining_customer_packages","ledgerTransactionId","YES"]] },
  { file: "0043_wallet_minor_units_bigint.sql",
    tables: ["customer_balances","balance_ledger","customer_controls","customer_opportunity_rules","kyc_stage_requirements","missed_opportunities","opportunity_offers","opportunity_popup_events","stake_events","stake_positions","stake_products","stake_rewards","stake_transactions","trade_positions","transaction_console_events"],
    columns: [["customer_balances","availableMinor","bigint"],["customer_balances","lockedMinor","bigint"],["customer_balances","promotionalMinor","bigint"],["customer_balances","earnedMinor","bigint"],["balance_ledger","amountMinor","bigint"],["customer_opportunity_rules","maxDailyAllocationMinor","bigint"],["kyc_stage_requirements","transactionLimitMinor","bigint"],["missed_opportunities","amountMinor","bigint"],["missed_opportunities","potentialRewardMinor","bigint"],["opportunity_offers","minimumMinor","bigint"],["opportunity_popup_events","minimumMinor","bigint"],["opportunity_popup_events","balanceAvailableMinor","bigint"],["stake_events","amountMinor","bigint"],["stake_positions","principalMinor","bigint"],["stake_positions","rewardMinor","bigint"],["stake_products","minMinor","bigint"],["stake_products","maxMinor","bigint"],["stake_rewards","amountMinor","bigint"],["stake_transactions","amountMinor","bigint"],["trade_positions","principalMinor","bigint"],["trade_positions","expectedRewardMinor","bigint"],["transaction_console_events","amountMinor","bigint"]] },
  { file: "0051_advanced_auto_trading.sql", tables: ["trade_reward_reservations","opportunity_schedule_decisions"],
    columns: [["opportunity_package_policies","automaticDelivery","tinyint"],["opportunity_package_policies","maxDailyRewardMinor","bigint"],["trade_positions","settlementStatus","varchar"],["trade_positions","rewardReservedMinor","bigint"],["trade_positions","transactionReference","varchar"],["trade_reward_reservations","tradeId","int"],["opportunity_schedule_decisions","nextEligibleAt","timestamp"]],
    data: [{table:"app_settings",column:"settingKey",value:"advancedAutoTrading.migration",label:"Advanced auto-trading migration setting"}] },
  { file: "0052_delivery_diagnostics.sql", tables: [],
    columns: [["opportunity_popup_events","deliveryStatus","enum"],["opportunity_popup_events","deliveryAttemptCount","int"],["opportunity_popup_events","receivedAt","timestamp"],["opportunity_popup_events","renderedAt","timestamp"],["opportunity_popup_events","tradeId","int"],["opportunity_delivery_events","status","enum"],["opportunity_delivery_events","attemptCount","int"],["opportunity_delivery_events","lastErrorCode","varchar"],["opportunity_delivery_events","expiresAt","timestamp"]] },
  { file: "0053_manual_settlement_lifecycle.sql",
    tables: ["trade_positions","trade_lifecycle_events"],
    columns: [["trade_positions","settlementReference","varchar"],["trade_positions","settlementConfirmedAt","timestamp"],["trade_positions","settlementConfirmedBy","int"],["trade_positions","settlementNotes","varchar"],["trade_lifecycle_events","id","int"],["trade_lifecycle_events","tradeId","int"],["trade_lifecycle_events","userId","int"],["trade_lifecycle_events","eventType","varchar"],["trade_lifecycle_events","stage","varchar"],["trade_lifecycle_events","payloadJson","text"]],
    data: [{table:"app_settings",column:"settingKey",value:"advancedAutoTrading.settlementMode",label:"Manual settlement mode setting"}] },
  { file: "0065_remove_obsolete_auto_trade_limits.sql", tables: ["customer_controls"],
    absentColumns: [["customer_controls","autoTradeAmountMinor"],["customer_controls","autoTradeDailyLimit"]] },
  { file: "0066_remove_unused_customer_daily_trade_limit.sql", tables: ["customer_controls"],
    absentColumns: [["customer_controls","dailyTradeLimitMinor"]] },
  { file: "0067_trade_settlement_reference_claims.sql", tables: ["trade_settlement_reference_claims"],
    columns: [["trade_settlement_reference_claims","settlementReference","varchar"],["trade_settlement_reference_claims","tradeId","int"],["trade_settlement_reference_claims","createdAt","timestamp"]] },
  { file: "0068_trade_realized_profit_accounting.sql", tables: ["trade_positions"],
    columns: [["trade_positions","realizedGrossProfitMinor","bigint"],["trade_positions","platformFeeMinor","bigint"],["trade_positions","netProfitMinor","bigint"],["trade_positions","feePolicyVersion","int"],["trade_positions","platformFeeRateBps","int"],["trade_positions","platformFeeRoundingMode","varchar"],["trade_positions","settlementOutcome","varchar"]] },
];

const url = new URL(rawDatabaseUrl);
if (!["mysql:", "mariadb:"].includes(url.protocol) || !url.pathname.replace(/^\/+/, "")) {
  console.error("DATABASE_URL must identify a MySQL/MariaDB database. No database changes were made.");
  process.exit(2);
}
if (url.protocol === "mariadb:") url.protocol = "mysql:";
url.searchParams.set("timezone", "Z");
const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port || 3306),
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  database: databaseName, ssl: url.searchParams.get("ssl") === "true" ? {} : undefined,
  connectTimeout: 10000, multipleStatements: false,
});

const tableSet = new Set();
const columns = new Map();
async function loadSchemaSnapshot() {
  const [tableRows] = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()");
  for (const row of tableRows) tableSet.add(String(row.table_name));
  const [columnRows] = await db.query("SELECT table_name, column_name, data_type, column_type, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE()");
  for (const row of columnRows) columns.set(String(row.table_name) + "." + String(row.column_name), {
    type: String(row.data_type).toLowerCase(), columnType: String(row.column_type).toLowerCase(), nullable: String(row.is_nullable),
  });
}
function checkTable(name) {
  const ok = tableSet.has(name);
  return { label: "table " + name, ok, detail: ok ? "present" : "missing" };
}
function checkColumn(table, column, expectedType) {
  const found = columns.get(table + "." + column);
  const ok = Boolean(found && found.type === expectedType.toLowerCase());
  return { label: table + "." + column + " type " + expectedType, ok,
    detail: !found ? "missing" : ok ? "matches" : "found type " + found.type + " (" + found.columnType + ")" };
}
function checkNullable(table, column, expectedNullable) {
  const found = columns.get(table + "." + column);
  return { label: table + "." + column + " nullable=" + expectedNullable,
    ok: Boolean(found && found.nullable === expectedNullable), detail: !found ? "missing" : "nullable=" + found.nullable };
}
function checkColumnAbsent(table, column) {
  const found = columns.get(table + "." + column);
  return { label: table + "." + column + " absent", ok: !found,
    detail: found ? "still present (" + found.type + ")" : "absent as expected" };
}
async function checkSeed({ table, column, value, label }) {
  if (!tableSet.has(table)) return { label, ok: false, detail: "table missing" };
  if (!/^[A-Za-z0-9_]+$/.test(table) || !/^[A-Za-z0-9_]+$/.test(column)) return { label, ok: false, detail: "invalid audit identifier" };
  const [rows] = await db.execute("SELECT 1 AS found FROM " + table + " WHERE " + column + " = ? LIMIT 1", [value]);
  return { label, ok: rows.length > 0, detail: rows.length > 0 ? "recorded" : "not found" };
}

try {
  console.log("ARBITRADE PORTAL SCHEMA AUDIT — READ ONLY");
  console.log("Database: " + databaseName);
  console.log("This audit uses SELECT queries against information_schema and selected setting/marker tables only.");
  console.log("It does not apply SQL, alter schema/data, write migration markers, or print credentials.\n");
  await loadSchemaSnapshot();
  const reports = [];
  for (const migration of migrations) {
    const checks = [];
    for (const table of migration.tables) checks.push(checkTable(table));
    for (const [table, column, type] of migration.columns || []) checks.push(checkColumn(table, column, type));
    for (const [table, column, nullable] of migration.nullable || []) checks.push(checkNullable(table, column, nullable));
    for (const [table, column] of migration.absentColumns || []) checks.push(checkColumnAbsent(table, column));
    for (const seed of migration.data || []) checks.push(await checkSeed(seed));
    const result = classifySchemaAudit(checks);
    reports.push({ file: migration.file, ...result, checks });
    console.log(migration.file + " — " + result.status + " (" + result.passed + "/" + (result.passed + result.failed) + " signals match)");
    for (const check of checks.filter((item) => !item.ok)) console.log("  MISMATCH: " + check.label + " — " + check.detail);
  }
  console.log("\nSUMMARY");
  for (const status of ["schema_signals_match","mixed_or_incomplete","expected_signals_missing","cannot_assess"]) {
    console.log("- " + status + ": " + reports.filter((report) => report.status === status).length);
  }
  console.log("\nIMPORTANT INTERPRETATION");
  console.log("- Matching schema signals are not proof that a particular migration ran; later migrations may create overlapping objects.");
  console.log("- Missing/mismatched signals do not prove a migration never ran. MySQL DDL may partially commit.");
  console.log("- Do not automatically rerun any migration from this report. Compare full SQL with the database, inspect data effects, and confirm a restorable backup first.");
  console.log("\nMachine-readable summary:");
  console.log(JSON.stringify(reports.map(({file,status,passed,failed}) => ({file,status,passed,failed})), null, 2));
} catch (error) {
  console.error("\nAudit could not be completed. No migration was executed.");
  console.error("Database error code: " + String(error?.code || "unavailable").replace(/[^A-Z0-9_]/gi, "").slice(0, 40));
  process.exitCode = 1;
} finally {
  await db.end();
}
