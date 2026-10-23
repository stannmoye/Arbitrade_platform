import { describe, expect, it } from "vitest";
import { findMissingWorkerTables, getRequiredWorkerTables } from "./worker-schema-inventory.mjs";

describe("installer worker schema inventory", () => {
  it("covers every model table plus raw-SQL worker tables", () => {
    const required = getRequiredWorkerTables(`
      import { mysqlTable } from "drizzle-orm/mysql-core";
      export const users = mysqlTable("users", {});
      export const notifications = mysqlTable("customer_notifications", {});
    `);
    expect(required).toContain("users");
    expect(required).toContain("customer_notifications");
    for (const table of [
      "kyc_settings",
      "kyc_levels",
      "kyc_stages",
      "kyc_stage_requirements",
      "kyc_stage_dependencies",
      "kyc_verification_sessions",
      "kyc_attempts",
      "kyc_documents",
      "kyc_liveness_checks",
      "kyc_provider_configs",
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
      "__drizzle_migrations",
      "main_migration_run_guard",
      "portal_schema_migrations",
      "mining_schema_migrations",
    ]) expect(required).toContain(table);
  });

  it("reports missing tables deterministically and accepts empty-but-present tables", () => {
    expect(findMissingWorkerTables(
      ["users", "notification_campaigns", "mining_pending_boost_rewards"],
      new Set(["users", "notification_campaigns"]),
    )).toEqual(["mining_pending_boost_rewards"]);

    // This check compares table existence only; row counts do not affect status.
    expect(findMissingWorkerTables(
      ["users", "notification_campaigns"],
      new Set(["users", "notification_campaigns"]),
    )).toEqual([]);
  });

  it("fails closed if the Drizzle schema cannot be parsed", () => {
    expect(() => getRequiredWorkerTables("export const value = 1;"))
      .toThrow("No MySQL table declarations");
  });
});
