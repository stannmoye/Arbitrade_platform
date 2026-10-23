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
    expect(required).toContain("mining_pending_boost_rewards");
    expect(required).toContain("notification_campaigns");
    expect(required).toContain("notification_campaign_deliveries");
    expect(required).toContain("__drizzle_migrations");
  });

  it("includes tables created by SQL migrations, including raw-SQL KYC tables", () => {
    const required = getRequiredWorkerTables(
      'export const users = mysqlTable("users", {});',
      [
        "-- CREATE TABLE `comment_only` (id INT);",
        "CREATE TABLE IF NOT EXISTS `kyc_settings` (id INT);",
        "CREATE TABLE `worker_runtime_state` (id INT);",
      ],
    );
    expect(required).toContain("users");
    expect(required).toContain("kyc_settings");
    expect(required).toContain("worker_runtime_state");
    expect(required).not.toContain("comment_only");
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
