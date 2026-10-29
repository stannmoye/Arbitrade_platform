import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0087_trading_policy_fail_closed.sql", import.meta.url), "utf8");
const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const lifecycle = readFileSync(new URL("./opportunityLifecycle.ts", import.meta.url), "utf8");
const adminNavigation = readFileSync(new URL("../client/src/admin-navigation.ts", import.meta.url), "utf8");
const adminApp = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const workerPreflight = readFileSync(new URL("../scripts/ensure-worker-runtime-schema.mjs", import.meta.url), "utf8");

describe("Trading policy reconciliation migration", () => {
  it("pauses existing tiers until an administrator reviews and saves their policy", () => {
    expect(migration).toContain("UPDATE `packages` SET `enabled`=0");
    expect(migration).toContain("SET `enabled`=0,`automaticDelivery`=0,`automaticTradingEnabled`=0,`policyVersion`=0");
    expect(migration).toContain("WHERE opp.`id` IS NULL");
    expect(migration).not.toContain("DELETE FROM `balance_ledger`");
    expect(migration).not.toContain("DELETE FROM `trade_positions`");
    expect(migration).not.toContain("DELETE FROM `customer_package_subscriptions`");
  });

  it("defaults newly created tiers and policies to inactive", () => {
    const packagesStart = schema.indexOf('export const packages = mysqlTable("packages"');
    const policyStart = schema.indexOf('export const opportunityPackagePolicies = mysqlTable("opportunity_package_policies"');
    const popupStart = schema.indexOf('export const opportunityPopupEvents = mysqlTable("opportunity_popup_events"');
    expect(schema.slice(packagesStart, schema.indexOf("\n});", packagesStart))).toContain('enabled: boolean("enabled").default(false).notNull()');
    const policy = schema.slice(policyStart, schema.indexOf("\n});", policyStart));
    expect(policy).toContain('enabled: boolean("enabled").default(false).notNull()');
    expect(policy).toContain('automaticDelivery: boolean("automaticDelivery").default(false).notNull()');
    expect(policy).toContain('automaticTradingEnabled: boolean("automaticTradingEnabled").default(false).notNull()');
    expect(policy).toContain('policyVersion: int("policyVersion").default(0).notNull()');
    const popup = schema.slice(popupStart, schema.indexOf("\n});", popupStart));
    expect(popup).toContain('tradeDurationSeconds: int("tradeDurationSeconds").notNull()');
    expect(popup).toContain('policyVersion: int("policyVersion").notNull()');
    expect(popup).not.toContain('tradeDurationSeconds: int("tradeDurationSeconds").default(600)');
    expect(popup).not.toContain('policyVersion: int("policyVersion").default(1)');
  });

  it("persists an explicit policy version on popup and delivery records", () => {
    expect(lifecycle).toContain("tradeDurationSeconds,policyVersion,companyLogoId");
    expect(lifecycle).toContain("item.tradeDurationSeconds, item.policyVersion, companyLogoId");
    expect(database).toContain("policyVersion:Number(policyByName.get(offer.packageName)?.policyVersion)");
    expect(database).not.toContain("policyVersion:Number(policyByName.get(offer.packageName)?.policyVersion||1)");
  });

  it("keeps carry-forward unavailable and removes hardcoded package-creation values", () => {
    expect(adminNavigation).toContain("Retry Policy (Carry-Forward Unavailable)");
    expect(adminApp).toContain("Carry-forward is unavailable: missed opportunities do not roll over and no carry-forward setting is active.");
    expect(adminApp).not.toContain('minimumQualifyingBalanceUsdMinor:10000,durationMonths:1,opportunitiesPerDay:6');
    expect(database).toContain("New Trading tiers must be created disabled.");
  });
});

describe("Trading migration replay safety", () => {
  it("does not replay one-time package-policy backfills during every server startup", () => {
    expect(workerPreflight).toContain("Do not replay migration 0086 from runtime preflight");
    expect(workerPreflight).not.toContain("executeCompatibleMigrationSql(db, tradingPopupPolicyMigration)");
    expect(workerPreflight).not.toContain('readFile(resolve(root, "drizzle/0086_trading_popup_policy_ranges.sql")');
  });
});
