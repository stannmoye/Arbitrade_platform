import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const databaseSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const qualificationWorkerStart = databaseSource.indexOf("export async function runTradingTierQualificationWorkerCycle(");
const qualificationWorkerEnd = databaseSource.indexOf("\nexport async function getCustomerTradingEligibility(", qualificationWorkerStart);
const qualificationWorkerSource = databaseSource.slice(qualificationWorkerStart, qualificationWorkerEnd);
const marketProvidersSource = readFileSync(new URL("./marketProviders.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../drizzle/0080_qualifying_admin_deposit_attribution.sql", import.meta.url), "utf8");
const policyMigrationSource = readFileSync(new URL("../drizzle/0081_trading_tier_policy_alignment.sql", import.meta.url), "utf8");
const customerAppSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const eligibilityComponent = readFileSync(new URL("../client/src/components/CustomerTradingEligibility.tsx", import.meta.url), "utf8");
const eligibilityStyles = readFileSync(new URL("../client/src/components/CustomerTradingEligibility.css", import.meta.url), "utf8");
const specification = readFileSync(new URL("../docs/TRADING_SYSTEM_SPECIFICATION.md", import.meta.url), "utf8");
const serverEntrypointSource = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const qualificationQueueMigrationSource = readFileSync(new URL("../drizzle/0082_trading_tier_qualification_jobs.sql", import.meta.url), "utf8");

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

  it("qualifies tiers only from the admin portal Credit Customer flow", () => {
    expect(routerSource).toContain("adjustCustomerBalance: adminProcedure.input");
    expect(routerSource).toContain('creditClassification: z.enum(["qualifying_deposit","non_qualifying_credit"]).optional()');
    expect(databaseSource).toContain('if(input.mode==="credit"&&input.creditClassification==="qualifying_deposit"&&user.role==="user")');
    expect(databaseSource).toContain('qualifyingDepositUsdMinor!==null?"admin_manual_deposit_credit":');
    expect(databaseSource).not.toContain('entryType:"deposit"');
    expect(databaseSource).toContain('const entryType=qualifyingDepositReversalOfId!==null?"admin_manual_deposit_reversal":qualifyingDepositUsdMinor!==null?"admin_manual_deposit_credit":');
    expect(databaseSource).toContain('eq(balanceLedger.entryType,"admin_manual_deposit_credit")');
    expect(databaseSource).toContain("if(qualifyingTotal<threshold) continue;");
    expect(databaseSource).toContain("const belowSnapshotThreshold=activeRows.filter");
    expect(databaseSource).toContain('action:"trading_tier_auto_qualified"');
    expect(databaseSource).not.toContain("export async function activateCustomerTradingPackage");
    expect(databaseSource).not.toContain("export async function listCustomerTradingPackages");
  });

  it("keeps signup credits outside Trading tier qualification", () => {
    expect(databaseSource).toContain('entryType: "signup_credit"');
    expect(databaseSource).toContain('eq(balanceLedger.entryType, "signup_credit")');
    expect(databaseSource).toContain('inArray(balanceLedger.entryType,["admin_manual_deposit_credit","admin_manual_deposit_reversal"])');
    expect(specification).toContain("The sole qualifying source is a positive credit that an authorized administrator manually submits for a customer through the admin portal");
    expect(specification).toContain("signup credits");
  });

  it("uses a live API rate for every non-USD qualifying wallet credit and never falls back to the manual registry rate", () => {
    expect(databaseSource).toContain("fetchCurrencyUsdRate");
    expect(databaseSource).toContain("creditTimeRate=await fetchCurrencyUsdRate");
    expect(databaseSource).toContain("A fresh API conversion rate for this exact wallet configuration is required");
    expect(databaseSource).not.toContain('let rate=Number(currency.usdRate)');
    expect(databaseSource).toContain("rate:String(creditTimeRate.rate)");
    expect(databaseSource).toContain("fetchedAt:creditTimeRate.fetchedAt.toISOString()");
    expect(databaseSource).toContain("qualifyingDepositUsdMinor!==null?Math.abs(qualifyingDepositUsdMinor)/100");
  });

  it("supports fiat wallet codes through current FX APIs and fails closed for stale or unsupported rates", () => {
    expect(marketProvidersSource).toContain("export async function fetchCurrencyUsdRate");
    expect(marketProvidersSource).toContain("api.frankfurter.dev/v2/rates?base=USD&quotes=");
    expect(marketProvidersSource).toContain('provider: "frankfurter-ecb"');
    expect(marketProvidersSource).toContain("4 * 24 * 60 * 60 * 1000");
    expect(marketProvidersSource).toContain("No fresh supported fiat-to-USD API rate is available");
    expect(marketProvidersSource).toContain("open.er-api.com/v6/latest/USD");
    expect(marketProvidersSource).toContain('provider: "open-er-api"');
  });

  it("supports registered crypto/token wallets through a timestamp-validated CoinGecko API rate", () => {
    expect(marketProvidersSource).toContain("api.coingecko.com/api/v3/simple/price?ids=");
    expect(marketProvidersSource).toContain("include_last_updated_at=true");
    expect(marketProvidersSource).toContain("A current CoinGecko USD rate");
    expect(marketProvidersSource).toContain("5 * 60 * 1000");
    expect(databaseSource).toContain('if(qualifyingDepositUsdMinor!==null&&creditTimeRate)');
  });

  it("shows assigned Trading tiers and cumulative qualifying USD on the admin customer view without changing transfers", () => {
    expect(databaseSource).toContain("qualifyingDepositUsd:qualifyingUsdMinor/100");
    expect(databaseSource).toContain('inArray(balanceLedger.entryType,["admin_manual_deposit_credit","admin_manual_deposit_reversal"])');
    expect(customerAppSource).toContain("Qualifying USD:");
    expect(customerAppSource).toContain("c.package");
    expect(customerAppSource).toContain("Normal transfers are unaffected.");
    expect(specification).toContain("ordinary wallet transfers between customers or between wallets");
  });

  it("exposes only a read-only eligibility summary to customers", () => {
    expect(routerSource).toContain("tradingEligibility: protectedProcedure.query");
    expect(routerSource).not.toContain("activateTradingPackage:");
    expect(routerSource).not.toContain("tradingPackages: protectedProcedure.query");
    expect(databaseSource).toContain("export async function getCustomerTradingEligibility");
    expect(customerAppSource).not.toContain("CustomerTradingPackages");
    expect(customerAppSource).toContain("CustomerTradingEligibility");
    expect(eligibilityComponent).toContain("trpc.customer.tradingEligibility.useQuery");
    expect(eligibilityComponent).toContain('"PACKAGE ACTIVE"');
    expect(eligibilityComponent).toContain('"NO PACKAGE ASSIGNED"');
    expect(eligibilityComponent).toContain('"RETRY NEEDED"');
    expect(eligibilityComponent).toContain("No Package Assigned");
    expect(eligibilityComponent).toContain("Additional qualifying amount needed");
    expect(eligibilityComponent).toContain("currentPackage.name");
    expect(eligibilityComponent).toContain("Milestone Package");
    expect(eligibilityComponent).toContain("Next Milestone Package");
    expect(eligibilityComponent).toContain("nextPackage.name");
    expect(eligibilityComponent).toContain("Qualifying admin wallet credits are valued in USD at the rate recorded when credited.");
    expect(eligibilityComponent).toContain("trading-threshold-unit");
    expect(eligibilityComponent).toContain('style: "currency"');
    expect(eligibilityComponent).toContain('currency: "USD"');
    expect(eligibilityComponent).not.toContain("₦");
    expect(eligibilityComponent).not.toContain("Activate free package");
    expect(eligibilityComponent).not.toContain("packageId");
    expect(eligibilityStyles).toContain("@media (max-width: 560px)");
    expect(eligibilityStyles).toContain("prefers-reduced-motion: reduce");
    expect(eligibilityStyles).toContain("@keyframes trading-card-glint");
    expect(eligibilityStyles).toContain("@keyframes trading-progress-shimmer");
    expect(eligibilityStyles).toContain(".trading-status-label");
    expect(eligibilityStyles).toContain("var(--arb-color-surface-raised)");
    expect(specification).toContain("the single next enabled tier");
    expect(specification).toContain("must never expose the full administrator-managed tier catalogue");
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
    expect(databaseSource).toContain("const quota=Number(snapshotFor(row).opportunitiesPerDay??row.dailyQuota)");
    expect(databaseSource).toContain("below the threshold recorded in this entitlement's terms snapshot");
  });

  it("reconciles tier assignments from the worker and strips tier metadata from customer responses", () => {
    expect(databaseSource).toContain("export async function ensureAutomaticTradingTierEntitlements");
    expect(qualificationWorkerStart).toBeGreaterThanOrEqual(0);
    expect(qualificationWorkerEnd).toBeGreaterThan(qualificationWorkerStart);
    expect(qualificationWorkerSource).toContain("await ensureAutomaticTradingTierEntitlements(Number(job.userId))");
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
    expect(databaseSource).toContain('if(missing.length) throw new Error("Trading tier opportunity policy is missing for: "+missing.join(", "));');
  });

  it("creates tiers through the authorized audited admin route", () => {
    expect(routerSource).toContain("createTradingPackage: adminProcedure.input");
    expect(routerSource).toContain("packageName: z.string().trim().min(1).max(80)");
    expect(routerSource).toContain(" })).min(1).max(1000) })).mutation(({ ctx, input }) => updateOpportunityPackagePolicies");
    expect(databaseSource).toContain("Opportunity policy references an unknown Trading tier");
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

  it("atomically queues each qualifying administrator credit or reversal for server-side tier reconciliation", () => {
    expect(schemaSource).toContain('export const tradingTierQualificationJobs = mysqlTable("trading_tier_qualification_jobs"');
    expect(schemaSource).toContain('sourceLedgerId: int("sourceLedgerId").notNull()');
    expect(schemaSource).toContain('sourceLedgerUnique: uniqueIndex("trading_tier_qualification_jobs_source_ledger_uq")');
    expect(qualificationQueueMigrationSource).toContain("UNIQUE KEY `trading_tier_qualification_jobs_source_ledger_uq` (`sourceLedgerId`)");
    expect(qualificationQueueMigrationSource).toContain("INSERT IGNORE INTO `trading_tier_qualification_jobs`");
    expect(qualificationQueueMigrationSource).toContain("SELECT `userId`, `id`, 'pending', CURRENT_TIMESTAMP");
    expect(qualificationQueueMigrationSource).toContain("AND `qualifyingDepositUsdMinor` IS NOT NULL");
    expect(databaseSource).toContain("await tx.insert(tradingTierQualificationJobs).values");
    expect(databaseSource).toContain("sourceLedgerId:ledgerId,status:\"pending\"");
    expect(databaseSource).toContain("Atomic outbox: the ledger entry and its tier-qualification job commit together.");
  });

  it("runs an indexed, bounded, retryable qualification queue worker independently of customer sessions", () => {
    expect(databaseSource).toContain("export async function runTradingTierQualificationWorkerCycle");
    expect(databaseSource).toContain(".limit(batchSize).for(\"update\")");
    expect(databaseSource).toContain("staleLeaseBefore");
    expect(databaseSource).toContain("const now=new Date(Math.floor(Date.now()/1000)*1000)");
    expect(databaseSource).toContain("lockedAt:now");
    expect(databaseSource).toContain('eq(tradingTierQualificationJobs.lockedAt,job.lockedAt)');
    expect(databaseSource).toContain("status:exhausted?\"dead\":\"pending\"");
    expect(databaseSource).toContain("await ensureAutomaticTradingTierEntitlements(Number(job.userId))");
    expect(serverEntrypointSource).toContain("runTradingTierQualificationWorkerCycle({batchSize:20})");
    expect(serverEntrypointSource).toContain("},5_000)");
    expect(serverEntrypointSource).toContain("tradingTierQualificationTimer.unref()");
  });

  it("keeps qualification jobs durable and observable without scanning all customers on idle worker cycles", () => {
    expect(schemaSource).toContain('statusAvailableIdx: index("trading_tier_qualification_jobs_status_available_idx")');
    expect(qualificationQueueMigrationSource).toContain("KEY `trading_tier_qualification_jobs_status_available_idx` (`status`, `availableAt`, `id`)");
    expect(databaseSource).toContain("return {claimed:jobs.length,completed,retrying,dead}");
    expect(databaseSource).toContain('console.error("[TradingTierWorker] qualification job failed"');
    expect(specification).toContain("Idle cycles perform an indexed queue lookup only");
  });

  it("documents the owner-approved automatic-deposit policy", () => {
    expect(specification).toContain("Customers never browse, select, subscribe to, purchase, or activate a package.");
    expect(specification).toContain("profits, trading rewards, returned principal, bonuses, swaps, transfers, conversions");
    expect(specification).toContain("The customer portal must never expose the full administrator-managed tier catalogue");
    expect(specification).toContain("the single next enabled tier");
  });
});
