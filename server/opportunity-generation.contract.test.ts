import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const lifecycle = readFileSync(new URL("./opportunityLifecycle.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0103_automatic_opportunity_generation_templates.sql", import.meta.url), "utf8");
const migration104 = readFileSync(new URL("../drizzle/0104_catalogue_native_opportunity_generation.sql", import.meta.url), "utf8");
const migration106 = readFileSync(new URL("../drizzle/0106_company_neutral_opportunity_assignments.sql", import.meta.url), "utf8");
const packageCatalogueMigration = readFileSync(new URL("../drizzle/0069_trading_package_activation.sql", import.meta.url), "utf8");
const packagePolicyAlignmentMigration = readFileSync(new URL("../drizzle/0081_trading_tier_policy_alignment.sql", import.meta.url), "utf8");
const explicitTermsMigration = readFileSync(new URL("../drizzle/0089_trading_popup_policy_ranges.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const journal = readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8");
const admin = readFileSync(new URL("../client/src/components/AdminOpportunityTemplates.tsx", import.meta.url), "utf8");
const customerPortal = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const customerQueryStart = db.indexOf("export async function listCustomerOpportunities(");
const customerQueryEnd = db.indexOf("export async function claimAutoTradeCycleCustomers(", customerQueryStart);
const customerQuery = db.slice(customerQueryStart, customerQueryEnd);
const generatorStart = db.indexOf("async function generateAutomaticCustomerOpportunity(");
const generatorEnd = db.indexOf("const OPPORTUNITY_GENERATION_CONTROL_KEY", generatorStart);
const generator = db.slice(generatorStart, generatorEnd);

describe("automatic opportunity generation and package-aware customer delivery", () => {
  it("loads only offers assigned to the requesting customer; legacy manual/global offers are not popup inputs", () => {
    expect(customerQueryStart).toBeGreaterThanOrEqual(0);
    expect(customerQueryEnd).toBeGreaterThan(customerQueryStart);
    expect(customerQuery).toContain("eq(opportunityOffers.assignedUserId,userId)");
    expect(customerQuery).toContain("generateAutomaticCustomerOpportunity");
    expect(customerQuery).toContain("activeSubscriptionIds.includes(Number(offer.assignedPackageSubscriptionId))");
  });

  it("generates from the full approved brand catalogue; templates are optional and package bounds remain authoritative", () => {
    expect(generator).toContain('eq(opportunityGenerationTemplates.status,"approved")');
    expect(generator).toContain("buildCompanySpotlightPool");
    expect(generator).not.toContain("templateIds.has(company.id)");
    expect(generator).not.toContain("const templateRows=await tx.select()");
    expect(generator).toContain('eq(opportunityGenerationTemplates.companyReferenceId,company.id)');
    expect(generator).toContain('createCatalogueIdentityOpportunityTemplate(company,packageMinimum,"USD")');
    expect(generator).toContain("selectOpportunityGenerationTerms");
    expect(generator).toContain("packageUsdUnitsToNativeMinor");
    expect(generator).toContain("opensAt:new Date(Math.floor(input.now.getTime()/1000)*1000)");
    expect(generator).toContain("companyRotationEnabled");
    expect(generator).toContain("control.enabled!==true");
    expect(generator).toContain("The active package's saved capital bounds are invalid.");
    expect(generator).toContain("template?Number(template.id):null");
  });

  it("preserves the 16-tier catalogue, backfills missing policy rows, and fails closed on unapproved terms", () => {
    const packageInsert = packageCatalogueMigration.match(/INSERT INTO `packages` \(`name`[\s\S]*?VALUES([\s\S]*?)ON DUPLICATE KEY UPDATE/i)?.[1] ?? "";
    const seededNames = [...packageInsert.matchAll(/\('([^']+)',\d+,\d+,\d+,1,1\)/g)].map(match => match[1]);
    expect(seededNames).toHaveLength(16);
    expect(new Set(seededNames).size).toBe(16);
    expect(packagePolicyAlignmentMigration).toContain("INSERT INTO `opportunity_package_policies` (`packageName`)");
    expect(packagePolicyAlignmentMigration).toContain("LEFT JOIN `opportunity_package_policies` AS `opp` ON `opp`.`packageName` = `p`.`name`");
    expect(packagePolicyAlignmentMigration).toContain("WHERE `opp`.`id` IS NULL");
    expect(explicitTermsMigration).toContain("SET `enabled` = 0, `automaticDelivery` = 0, `automaticTradingEnabled` = 0");
    expect(explicitTermsMigration).toContain("`minimumPayoutRateBps` IS NULL OR `maximumPayoutRateBps` IS NULL");
    expect(generator).toContain(".innerJoin(opportunityPackagePolicies,eq(opportunityPackagePolicies.packageName,packages.name))");
    expect(generator).toContain("hasConfiguredTradingOfferPolicy(row)");
    expect(generator).not.toContain("DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY");
  });

  it("binds generation to the exact active package subscription and its persisted package policy", () => {
    expect(generator).toContain("eq(opportunityPackagePolicies.packageName,packages.name)");
    expect(generator).toContain("eq(customerPackageSubscriptions.id,candidate.subscriptionId)");
    expect(generator).toContain("eq(customerPackageSubscriptions.userId,input.userId)");
    expect(generator).toContain('eq(customerPackageSubscriptions.status,"active")');
    expect(generator).toContain("hasConfiguredTradingOfferPolicy(row)");
    expect(generator).toContain("if(!selectedSubscription||!selectedPolicy)return null;");
    expect(generator).toContain("minimumPayoutRateBps:selectedPolicy.minimumPayoutRateBps==null?null:Number(selectedPolicy.minimumPayoutRateBps)");
    expect(generator).toContain("maximumPayoutRateBps:selectedPolicy.maximumPayoutRateBps==null?null:Number(selectedPolicy.maximumPayoutRateBps)");
    expect(generator).toContain("minimumTradeDurationSeconds:selectedPolicy.minimumTradeDurationSeconds==null?null:Number(selectedPolicy.minimumTradeDurationSeconds)");
    expect(generator).toContain("maximumTradeDurationSeconds:selectedPolicy.maximumTradeDurationSeconds==null?null:Number(selectedPolicy.maximumTradeDurationSeconds)");
    expect(generator).toContain("packageSubscriptionId:Number(selectedSubscription.subscriptionId)");
    expect(generator).toContain("packageId:Number(selectedSubscription.packageId)");
    expect(generator).toContain("packagePolicyVersion:Number(selectedPolicy.policyVersion||1)");
    expect(generator).not.toContain("DEFAULT_NEW_PACKAGE_OPPORTUNITY_POLICY");
  });

  it("continues generation without an approved company identity and persists the absence explicitly", () => {
    expect(generator).not.toContain("if(!approvedPool.length)return null");
    expect(generator).toContain("createUnattributedCatalogueOpportunityTemplate(packageMinimum,\"USD\")");
    expect(generator).toContain("companyReferenceId:company?.id??null");
    expect(generator).toContain("companyDisplayName:company?.name??null");
    expect(generator).toContain("companyReferenceMetadataJson:companyMetadata?JSON.stringify(companyMetadata):null");
    expect(customerQuery).toContain("companyRotationEnabled:generatedOffer?Boolean(generationSnapshot.companyRotationEnabled&&offer.companyReferenceId):globalPolicy.companyRotationEnabled");
    expect(lifecycle).toContain("} else if (item.companyRotationEnabled) {");
    expect(migration106).toContain("MODIFY COLUMN `companyReferenceId` VARCHAR(32) NULL");
    expect(schema).toContain('companyReferenceId: varchar("companyReferenceId", { length: 32 }),');
    expect(schema).not.toContain('companyReferenceId: varchar("companyReferenceId", { length: 32 }).notNull(),\n  configuredProfitRateBps');
  });

  it("persists one immutable customer/package/template assignment under a lock and unique idempotency key", () => {
    expect(generator).toContain("trading.opportunityGenerator.${input.userId}");
    expect(generator).toContain("generationKey=`auto:");
    expect(migration).toContain("opportunity_offers_generation_key_uq");
    expect(generator).toContain("packageSnapshotJson:JSON.stringify(snapshot)");
    expect(generator).toContain("templateVersion:template?Number(template.version):null");
    expect(generator).toContain("assignedUserId:input.userId");
    expect(customerQuery).toContain("generationAssignmentByOffer");
    expect(customerQuery).toContain("savedBounds");
    expect(customerQuery).toContain("generatedOffer?Number(offer.configuredProfitRateBps)");
  });

  it("keeps the worker pauseable, batch-observable, and default-on only through its migration seed", () => {
    expect(customerQuery).toContain("options.automaticGenerationEnabled===true");
    expect(db).toContain("trade.opportunityGeneration.control");
    expect(db).toContain("opportunityGenerationBatches");
    expect(db).toContain("automatic_opportunity_generation_control_updated");
    expect(migration).toContain("'trade.opportunityGeneration.control'");
    expect(migration).toContain("JSON_OBJECT('enabled',TRUE,'version',1");
    expect(journal).toContain('"tag": "0103_automatic_opportunity_generation_templates"');
    expect(journal).toContain('"tag": "0104_catalogue_native_opportunity_generation"');
    expect(migration104).toContain("MODIFY COLUMN");
  });

  it("shows catalogue company identity instead of the BRAND display sentinel in customer popup headings", () => {
    expect(customerPortal).toContain('String(popup.companyDisplayName||popup.symbol||"Opportunity")+" opportunity notice"');
    expect(customerPortal).toContain('popup.companyDisplayName||popup.symbol||"Company unavailable"');
    expect(customerPortal).toContain('value!=="Informational"');
    expect(customerPortal).toContain('"Brand catalogue opportunity"');
  });

  it("explains automatic generation in the customer dashboard and displays catalogue company identity", () => {
    expect(customerPortal).toContain("opportunities are generated automatically");
    expect(customerPortal).not.toContain("When an administrator publishes an opportunity");
    expect(customerPortal).toContain("x.companyDisplayName||x.symbol");
    expect(customerPortal).toContain('"Brand catalogue opportunity"');
  });

  it("revalidates pinned companies when popup persistence occurs and expires generated assignments safely", () => {
    expect(lifecycle).toContain("if (item.companyReferenceId)");
    expect(lifecycle).toContain("catalogueState.verifiedIds.includes(pinned.id)");
    expect(lifecycle).toContain("opportunity_generation_assignments SET status='delivered'");
    expect(lifecycle).toContain("opportunity_generation_assignments SET status='expired'");
    expect(lifecycle).toContain("p.deliveryStatus='expired'");
    expect(lifecycle).toContain("e.status='expired'");
  });

  it("reports global delivery master states rather than stale per-package mirror columns", () => {
    const monitorStart = db.indexOf("export async function getOpportunityGenerationMonitor()");
    const monitorEnd = db.indexOf("\nexport async function listOpportunityPackagePolicies()", monitorStart);
    const monitor = db.slice(monitorStart, monitorEnd);
    expect(monitorStart).toBeGreaterThanOrEqual(0);
    expect(monitorEnd).toBeGreaterThan(monitorStart);
    expect(monitor).toContain("const globalPolicy=await getTradeGlobalControls()");
    expect(monitor).toContain("policyEnabled:Boolean(globalPolicy.available&&globalPolicy.tierPolicyMasterEnabled)");
    expect(monitor).toContain("automaticDelivery:Boolean(globalPolicy.available&&globalPolicy.informationalPopupDeliveryEnabled)");
    expect(monitor).not.toContain("policyEnabled:Boolean(policy.enabled)");
    expect(monitor).not.toContain("automaticDelivery:Boolean(policy.automaticDelivery)");
  });

  it("uses global delivery masters instead of legacy per-package boolean mirrors", () => {
    expect(generator).not.toContain("eq(opportunityPackagePolicies.enabled,true)");
    expect(generator).not.toContain("eq(opportunityPackagePolicies.automaticDelivery,true)");
    expect(generator).toContain("if(approvedPool.length>0&&input.companyRotationEnabled){");
    expect(generator).toContain("companyRotationEnabled:Boolean(input.companyRotationEnabled)");
  });

  it("expires catalogue-native generated offers and delivery rows without requiring a manual template", () => {
    const retentionStart = lifecycle.indexOf("export async function runOpportunityRetention()");
    const retention = lifecycle.slice(retentionStart);
    expect(retentionStart).toBeGreaterThanOrEqual(0);
    expect(retention).toContain("assignedUserId IS NOT NULL AND generationKey IS NOT NULL");
    expect(retention.match(/generationKey IS NOT NULL/g) ?? []).toHaveLength(3);
    expect(retention).not.toContain("generationTemplateId IS NOT NULL");
  });

  it("offers administrator approval, reasoned pause/resume, and visible customer-specific assignment history", () => {
    expect(admin).toContain("Approve template");
    expect(admin).toContain("Pause automatic generation");
    expect(admin).toContain("Enable automatic generation");
    expect(admin).toContain("Latest persisted assignments");
    expect(admin).toContain("currently admin-verified, enabled, non-archived");
    expect(admin).toContain("no template is required");
  });

  it("blocks manual and bulk-import offer creation at the server API", () => {
    expect(router).toContain('createOffer: adminProcedure.input(z.unknown()).mutation(() => { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Manual opportunity publication is retired.');
    expect(router).toContain('bulkCreateOffers: adminProcedure.input(z.unknown()).mutation(() => { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Manual opportunity CSV import is retired.');
    expect(router).toContain("saved company templates are optional display-term enrichment");
    expect(router).toContain("a company template is not required");
    expect(db).toContain("assignedUserId:input.userId");
  });

  it("limits the admin open feed to generated assignments and exposes durable diagnostic detail", () => {
    const openStart = db.indexOf("export async function listOpenOffers");
    const openQuery = db.slice(openStart, db.indexOf("\n", openStart));
    expect(openStart).toBeGreaterThanOrEqual(0);
    expect(openQuery).toContain("isNotNull(opportunityOffers.assignedUserId)");
    expect(openQuery).toContain("isNotNull(opportunityOffers.generationKey)");
    expect(db).toContain("packageBreakdown:policies.map");
    expect(db).toContain("failureSummary:failures?JSON.stringify({customers:failureDetails");
    expect(admin).toContain("Batch {batch.id}");
    expect(admin).toContain("Package breakdown · UTC day");
  });
  it("enforces customer entitlement and package daily quotas transactionally before rotation allocation", () => {
    expect(generator).toContain("termsSnapshotJson:customerPackageSubscriptions.termsSnapshotJson");
    expect(generator).toContain("packageDailyOpportunityQuota:packages.opportunitiesPerDay");
    expect(generator).toContain("policyDailyOpportunityQuota:opportunityPackagePolicies.maxPopupsPerDay");
    expect(generator).toContain("const customerDailyQuota=");
    expect(generator).toContain("const effectiveDailyQuota=");
    expect(generator).toContain("eq(opportunityGenerationAssignments.packageSubscriptionId,Number(row.subscriptionId))");
    expect(generator).toContain("eq(opportunityGenerationAssignments.packageId,Number(row.packageId))");
    expect(generator).toContain("gte(opportunityGenerationAssignments.generatedAt,input.quotaWindowStart)");
    expect(generator).toContain("if(subscriptionUsed>=customerDailyQuota||packageUsed>=effectiveDailyQuota)continue;");
    expect(generator).toContain("customerDailyQuota:Number(selectedSubscription.customerDailyQuota)");
    expect(generator).toContain("packageDailyOpportunityQuota:Number(selectedSubscription.effectiveDailyQuota)");
    expect(generator).toContain("quotaWindowStart:input.quotaWindowStart.toISOString()");
  });

  it("keeps quota checks, rotation cursor writes, offer persistence and assignment snapshots in one transaction", () => {
    expect(generator).toContain("return db.transaction(async tx=>{");
    expect(generator).toContain("tx.update(appSettings).set({settingValue:JSON.stringify(selection.state)");
    expect(generator).toContain("tx.insert(opportunityOffers).values({");
    expect(generator).toContain("tx.insert(opportunityGenerationAssignments).values({");
    expect(generator).toContain("packageSnapshotJson:JSON.stringify(snapshot)");
    expect(generator.indexOf("tx.update(appSettings).set({settingValue:JSON.stringify(selection.state)"))
      .toBeLessThan(generator.indexOf("tx.insert(opportunityOffers).values({"));
  });

});
