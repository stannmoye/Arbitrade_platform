import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const databaseSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../drizzle/0080_qualifying_admin_deposit_attribution.sql", import.meta.url), "utf8");
const policyMigrationSource = readFileSync(new URL("../drizzle/0081_trading_tier_policy_alignment.sql", import.meta.url), "utf8");
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

  it("requires explicit debit classification and validates qualifying-deposit reversal references", () => {
    expect(routerSource).toContain('debitClassification: z.enum(["ordinary_debit","qualifying_deposit_reversal"]).optional()');
    expect(routerSource).toContain('input.reversalLedgerId');
    expect(databaseSource).toContain('eq(balanceLedger.entryType,"admin_manual_deposit_credit")');
    expect(databaseSource).toContain("qualifyingDepositReversalOfId");
    expect(customerAppSource).toContain("Original qualifying deposit ledger ID");
    expect(customerAppSource).toContain('debitClassification:mode==="debit"?debitClassification||undefined:undefined');
  });

  it("qualifies tiers only from classified administrator manual customer credits", () => {
    expect(databaseSource).toContain('const entryType=qualifyingDepositReversalOfId!==null?"admin_manual_deposit_reversal":qualifyingDepositUsdMinor!==null?"admin_manual_deposit_credit":');
    expect(databaseSource).toContain('eq(balanceLedger.entryType,"admin_manual_deposit_credit")');
    expect(databaseSource).toContain("if(qualifyingTotal<threshold) continue;");
    expect(databaseSource).toContain("const belowSnapshotThreshold=activeRows.filter");
    expect(databaseSource).toContain('action:"trading_tier_auto_qualified"');
    expect(databaseSource).not.toContain("export async function activateCustomerTradingPackage");
    expect(databaseSource).not.toContain("export async function listCustomerTradingPackages");
  });

  it("fails closed for stale or manually entered non-stablecoin qualifying-credit rates", () => {
    expect(databaseSource).toContain('provider.toLowerCase().includes("manual")||!rateAt||Date.now()-rateAt.getTime()>5*60*1000');
    expect(databaseSource).toContain("A current non-manual currency-to-USD rate is required");
    expect(databaseSource).toContain("qualifyingDepositUsdMinor!==null?Math.abs(qualifyingDepositUsdMinor)/100");
  });

  it("requires a fresh recorded official FX snapshot for EUR and GBP qualifying credits", () => {
    expect(databaseSource).toContain('currencyCode==="EUR"||currencyCode==="GBP"');
    expect(databaseSource).toContain('eq(fxRateSnapshots.provider,"frankfurter-ecb")');
    expect(databaseSource).toContain("Date.now()-sourceObservedAt.getTime()>4*24*60*60*1000");
    expect(databaseSource).toContain("rate=1/Number(liveSnapshot.rate)");
  });

  it("fails closed when BTC or ETH qualifying-credit rates are stale or manual", () => {
    expect(databaseSource).toContain('currencyCode==="BTC"||currencyCode==="ETH"');
    expect(databaseSource).toContain("Date.now()-snapshotObservedAt.getTime()>5*60*1000");
    expect(databaseSource).toContain("current verified BTC/ETH-to-USD rate is required");
    expect(databaseSource).toContain("eq(fxRateSnapshots.provider,\"coingecko\")");
    expect(databaseSource).toContain("const sourceObservedAt=liveSnapshot?.sourceDate?new Date(liveSnapshot.sourceDate):null");
    expect(databaseSource).toContain("Date.now()-sourceObservedAt.getTime()>5*60*1000");
  });

  it("exposes only a read-only eligibility summary to customers", () => {
    expect(routerSource).toContain("tradingEligibility: protectedProcedure.query");
    expect(routerSource).not.toContain("activateTradingPackage:");
    expect(routerSource).not.toContain("tradingPackages: protectedProcedure.query");
    expect(databaseSource).toContain("export async function getCustomerTradingEligibility");
    expect(customerAppSource).not.toContain("CustomerTradingPackages");
    expect(customerAppSource).toContain("CustomerTradingEligibility");
    expect(eligibilityComponent).toContain("trpc.customer.tradingEligibility.useQuery");
    expect(eligibilityComponent).toContain("qualifying manual administrator wallet credits");
    expect(customerAppSource).toContain("The threshold is an eligibility rule, not a fee or an automatic trade amount.");
    expect(eligibilityComponent).not.toContain("Activate free package");
    expect(eligibilityComponent).not.toContain("packageId");
  });

  it("retires legacy customer-activated entitlements without deleting historical rows", () => {
    expect(migrationSource).toContain("SET `status` = 'expired'");
    expect(migrationSource).toContain("activationKey` NOT LIKE 'auto-tier:%'");
    expect(migrationSource).toContain("Preserve the historical rows for audit");
  });

  it("keeps allocation and due-trade processing in the scheduled worker", () => {
    expect(databaseSource).toContain("workerCycle?:boolean");
    expect(databaseSource).toContain("if(options.workerCycle===true) await markDueTradesAwaitingConfirmation(userId)");
    expect(databaseSource).toContain("options.workerCycle===true ? await autoTradeOpenOpportunities");
    expect(databaseSource).toContain("listCustomerOpportunities(customer.id,{workerCycle:true,consumeDelivery:false})");
    const start = routerSource.indexOf("opportunities: protectedProcedure.query(");
    const end = routerSource.indexOf("\n    trades: protectedProcedure.query", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(routerSource.slice(start, end)).not.toContain("workerCycle:true");
  });

  it("preserves assigned tier threshold and quota snapshots for existing entitlements", () => {
    expect(databaseSource).toContain("const assignedThreshold=Number(snapshot.minimumQualifyingBalanceUsdMinor??threshold)");
    expect(databaseSource).toContain("termsSnapshotJson:customerPackageSubscriptions.termsSnapshotJson");
    expect(databaseSource).toContain("const quota=Number(snapshot.opportunitiesPerDay??row.dailyQuota)");
    expect(databaseSource).toContain("below the threshold recorded in this entitlement's terms snapshot");
  });

  it("reconciles tier assignments from the worker and strips tier metadata from customer responses", () => {
    expect(databaseSource).toContain("export async function ensureAutomaticTradingTierEntitlements");
    expect(databaseSource).toContain("await ensureAutomaticTradingTierEntitlements(customer.id)");
    expect(databaseSource).toContain('.filter(subscription=>String(subscription.activationKey||"").startsWith("auto-tier:"))');
    expect(routerSource).toContain("delivery:safeObject(result.delivery)");
    expect(routerSource).toContain("delete safe.packageSubscriptionId");
  });

  it("keeps opportunity generation and customer responses read-only", () => {
    expect(databaseSource).toContain("if(options.workerCycle===true&&!formulaCooling&&remainingQuota>0)");
    expect(databaseSource).toContain("if(options.workerCycle===true) await markDueTradesAwaitingConfirmation(userId)");
    expect(databaseSource).toContain("options.workerCycle===true ? await autoTradeOpenOpportunities");
    expect(routerSource).toContain("delete safe.termsSnapshotJson");
    expect(routerSource).toContain("delete safe.packageMinimumTradeMinor");
  });

  it("uses published opportunity values instead of hash-derived trade estimates", () => {
    const start = databaseSource.indexOf("function calculateTradeTerms(");
    const end = databaseSource.indexOf("\nfunction packageUsdUnitsToNativeMinor", start);
    const terms = databaseSource.slice(start, end);
    expect(terms).toContain("Number(offer.minimumMinor)");
    expect(terms).toContain("Number(offer.expectedRewardBps)");
    expect(terms).not.toContain("createHash");
    expect(terms).not.toContain("sessionEntropy");
  });

  it("snapshots tier limits and applies them to each entitlement", () => {
    expect(databaseSource).toContain("maxPopupsPerDay:Number(tier.maxPopupsPerDay||0)");
    expect(databaseSource).toContain("maxActiveInvestments:Number(tier.maxActiveInvestments||0)");
    expect(databaseSource).toContain("snapshot.maxPopupsPerDay??subscription.packageMaxPopupsPerDay");
    expect(databaseSource).toContain("activeTermsSnapshot.maxActiveInvestments??activePackageSubscription.maxActiveInvestments");
  });

  it("uses the tier popup cap when the admin policy has no explicit cap", () => {
    expect(databaseSource).toContain("const policyCap=configuredCap>0?configuredCap:quotaFor(subscription)");
    expect(databaseSource).toContain("tierCap>0?Math.min(policyCap,tierCap):policyCap");
  });

  it("enforces the tier popup cap in the runtime delivery allowance", () => {
    expect(databaseSource).toContain("packageMaxPopupsPerDay:packages.maxPopupsPerDay");
    expect(databaseSource).toContain("Math.min(policyCap,tierCap)");
  });

  it("keeps opportunity-policy rows aligned with every administrator-managed tier", () => {
    expect(schemaSource).toContain('packageName: varchar("packageName", { length: 80 }).notNull().unique()');
    expect(policyMigrationSource).toContain("MODIFY COLUMN `packageName` varchar(80) NOT NULL");
    expect(policyMigrationSource).toContain("INSERT INTO `opportunity_package_policies` (`packageName`)");
    expect(databaseSource).toContain("const tiers=await db.select({name:packages.name}).from(packages)");
    expect(databaseSource).toContain("values({packageName:tier.name})");
    expect(databaseSource).toContain("values({packageName:name,updatedBy:createdBy})");
    expect(databaseSource).toContain("packageName:nextName,updatedBy,policyVersion:nextPolicyVersion");
    expect(databaseSource).toContain("const matchingRows=rows.filter(row=>tierNames.has(row.packageName))");
    expect(databaseSource).toContain("if(missing.length) throw new Error(\"Trading tier opportunity policy is missing for: \"+missing.join(", \"));");
  });

  it("creates tiers through the authorized audited admin route", () => {
    expect(routerSource).toContain("createTradingPackage: adminProcedure.input");
    expect(routerSource).toContain("createAdminTradingPackage(ctx.user.id");
    expect(databaseSource).toContain('action:"trading_package_created"');
    expect(customerAppSource).toContain("New administrator-managed tier");
    expect(customerAppSource).toContain('trpc.adminOperations.createTradingPackage.useMutation');
    expect(customerAppSource).toContain('maxActiveInvestments:0,startsAt:"",expiresAt:"",enabled:false}');
    expect(customerAppSource).toContain("New tiers start disabled.");
  });

  it("persists administrator-controlled effective dates and tier caps", () => {
    expect(databaseSource).toContain("maxPopupsPerDay:input.maxPopupsPerDay");
    expect(databaseSource).toContain("maxActiveInvestments:input.maxActiveInvestments");
    expect(databaseSource).toContain("startsAt:input.startsAt");
    expect(databaseSource).toContain("expiresAt:input.expiresAt");
    expect(routerSource).toContain("startsAt: z.string().datetime().nullable()");
    expect(routerSource).toContain("maxActiveInvestments: z.number().int().min(0).max(10000)");
    expect(customerAppSource).toContain("Tier starts at (your local time; blank = immediately)");
    expect(customerAppSource).toContain("Maximum active investments (0 = no tier-specific cap)");
  });

  it("documents the owner-approved automatic-deposit policy", () => {
    expect(specification).toContain("Customers never browse, select, subscribe to, purchase, or activate a package.");
    expect(specification).toContain("Profits, trading rewards, returned principal, bonuses, swaps, transfers");
    expect(specification).toContain("The customer portal may show only the resulting eligibility status and total daily opportunity allowance.");
  });
});
