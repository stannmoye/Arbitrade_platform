// Runtime schema inventory shared by installer and deployment verification.
// Every table declared by the Drizzle model is required, even when its current row
// count is zero. Mining uses a few additional tables through parameterized SQL.
export const RAW_WORKER_TABLES = [
  "__drizzle_migrations",
  "main_migration_run_guard",
  "portal_schema_migrations",
  "mining_schema_migrations",
  // KYC and admin-email tables are created/queried by raw SQL and are not all
  // represented as Drizzle table declarations. They must still exist when empty.
  "kyc_settings",
  "kyc_levels",
  "kyc_stages",
  "kyc_stage_requirements",
  "kyc_stage_dependencies",
  "kyc_stage_states",
  "kyc_verification_sessions",
  "kyc_attempts",
  "kyc_email_verifications",
  "kyc_phone_verifications",
  "kyc_address_verifications",
  "kyc_documents",
  "kyc_document_extractions",
  "kyc_consistency_results",
  "kyc_liveness_checks",
  "kyc_face_verifications",
  "kyc_risk_scores",
  "kyc_risk_rules",
  "kyc_manual_reviews",
  "kyc_admin_overrides",
  "kyc_consents",
  "kyc_screening_results",
  "kyc_provider_configs",
  "kyc_provider_attempts",
  "kyc_rejection_reasons",
  "kyc_retention_policies",
  "kyc_audit_logs",
  "password_reset_tokens",
  "admin_email_messages",
  "opportunity_schedule_decisions",
  "mining_economics_versions",
  "mining_packages",
  "mining_package_versions",
  "mining_customer_packages",
  "mining_checkpoints",
  "mining_ledger_transactions",
  "mining_reward_events",
  "mining_boost_activations",
  "mining_conversion_preferences",
  "mining_conversion_preference_versions",
  "mining_conversion_jobs",
  "mining_quote_snapshots",
  "mining_adjustment_requests",
  "mining_wallet_baselines",
  "mining_package_purchase_claims",
  "mining_reward_package_allocations",
  "mining_engine_activity",
  "mining_pending_boost_rewards",
  "notification_campaigns",
  "notification_campaign_deliveries",
];

export function getRequiredWorkerTables(schemaSource) {
  if (typeof schemaSource !== "string") {
    throw new TypeError("Drizzle schema source must be a string.");
  }
  const schemaTables = [...schemaSource.matchAll(/mysqlTable\s*\(\s*["'`]([^"'`]+)["'`]/g)]
    .map((match) => match[1]);
  if (schemaTables.length === 0) {
    throw new Error("No MySQL table declarations were found in drizzle/schema.ts.");
  }
  return [...new Set([...schemaTables, ...RAW_WORKER_TABLES])].sort();
}

export function findMissingWorkerTables(requiredTables, existingTables) {
  const existing = existingTables instanceof Set
    ? existingTables
    : new Set(existingTables);
  return [...new Set(requiredTables)].filter((table) => !existing.has(table)).sort();
}
