// Runtime schema inventory shared by installer and deployment verification.
// Every table declared by the Drizzle model is required, even when its current row
// count is zero. Mining uses a few additional tables through parameterized SQL.
export const RAW_WORKER_TABLES = [
  "__drizzle_migrations",
  "main_migration_run_guard",
  "portal_schema_migrations",
  "mining_schema_migrations",
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
