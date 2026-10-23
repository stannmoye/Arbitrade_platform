// Runtime schema inventory shared by installer and deployment verification.
// Every table declared by the Drizzle model is required, even when its current row
// count is zero. Mining uses a few additional tables through parameterized SQL.
export const RAW_WORKER_TABLES = [
  "__drizzle_migrations",
  "main_migration_run_guard",
  "portal_schema_migrations",
  "mining_schema_migrations",
  "mining_checkpoints",
  "mining_conversion_jobs",
  "mining_conversion_preference_versions",
  "mining_conversion_preferences",
  "mining_ledger_transactions",
  "mining_quote_snapshots",
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
