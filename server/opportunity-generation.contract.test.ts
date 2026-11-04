import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const lifecycle = readFileSync(new URL("./opportunityLifecycle.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0103_automatic_opportunity_generation_templates.sql", import.meta.url), "utf8");
const migration104 = readFileSync(new URL("../drizzle/0104_catalogue_native_opportunity_generation.sql", import.meta.url), "utf8");
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

  it("uses global delivery masters instead of legacy per-package boolean mirrors", () => {
    expect(generator).not.toContain("eq(opportunityPackagePolicies.enabled,true)");
    expect(generator).not.toContain("eq(opportunityPackagePolicies.automaticDelivery,true)");
    expect(generator).toContain("if(input.companyRotationEnabled){");
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
});
