import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const databaseSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../drizzle/0080_qualifying_admin_deposit_attribution.sql", import.meta.url), "utf8");
const customerAppSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const eligibilityComponent = readFileSync(new URL("../client/src/components/CustomerTradingEligibility.tsx", import.meta.url), "utf8");
const specification = readFileSync(new URL("../docs/TRADING_SYSTEM_SPECIFICATION.md", import.meta.url), "utf8");

describe("Automatic Trading tier qualification", () => {
  it("records qualifying-deposit attribution and conversion evidence on ledger entries", () => {
    expect(schemaSource).toContain('qualifyingDepositUsdMinor: bigint("qualifyingDepositUsdMinor"');
    expect(schemaSource).toContain('qualifyingDepositRateProvider: varchar("qualifyingDepositRateProvider"');
    expect(schemaSource).toContain('qualifyingDepositRateAt: timestamp("qualifyingDepositRateAt")');
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS `qualifyingDepositUsdMinor`");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS `qualifyingDepositRateProvider`");
  });

  it("qualifies tiers only from classified administrator manual customer credits", () => {
    expect(databaseSource).toContain('entryType:qualifyingDepositUsdMinor!==null?"admin_manual_deposit_credit":');
    expect(databaseSource).toContain('eq(balanceLedger.entryType,"admin_manual_deposit_credit")');
    expect(databaseSource).toContain("qualifyingTotal<Number(tier.minimumQualifyingBalanceUsdMinor)");
    expect(databaseSource).toContain('action:"trading_tier_auto_qualified"');
    expect(databaseSource).not.toContain("export async function activateCustomerTradingPackage");
    expect(databaseSource).not.toContain("export async function listCustomerTradingPackages");
  });

  it("fails closed when BTC or ETH qualifying-credit rates are stale or manual", () => {
    expect(databaseSource).toContain('currencyCode==="BTC"||currencyCode==="ETH"');
    expect(databaseSource).toContain("Date.now()-rateAt.getTime()>5*60*1000");
    expect(databaseSource).toContain("current verified BTC/ETH-to-USD rate is required");
  });

  it("exposes only a read-only eligibility summary to customers", () => {
    expect(routerSource).toContain("tradingEligibility: protectedProcedure.query");
    expect(routerSource).not.toContain("activateTradingPackage:");
    expect(routerSource).not.toContain("tradingPackages: protectedProcedure.query");
    expect(databaseSource).toContain("export async function getCustomerTradingEligibility");
    expect(customerAppSource).not.toContain("CustomerTradingPackages");
    expect(customerAppSource).toContain("CustomerTradingEligibility");
    expect(eligibilityComponent).toContain("trpc.customer.tradingEligibility.useQuery");
    expect(eligibilityComponent).not.toContain("Activate free package");
    expect(eligibilityComponent).not.toContain("packageId");
  });

  it("retires legacy customer-activated entitlements without deleting historical rows", () => {
    expect(migrationSource).toContain("SET `status` = 'expired'");
    expect(migrationSource).toContain("activationKey` NOT LIKE 'auto-tier:%'");
    expect(migrationSource).toContain("Preserve the historical rows for audit");
  });

  it("documents the owner-approved automatic-deposit policy", () => {
    expect(specification).toContain("Customers never browse, select, subscribe to, purchase, or activate a package.");
    expect(specification).toContain("Profits, trading rewards, returned principal, bonuses, swaps, transfers");
    expect(specification).toContain("The customer portal may show only the resulting eligibility status and total daily opportunity allowance.");
  });
});
