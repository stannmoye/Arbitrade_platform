import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("reviewed opportunity publication contracts", () => {
  it("requires source references and review notes at both admin publication API boundaries", () => {
    const single = router.slice(router.indexOf("createOffer: adminProcedure.input"), router.indexOf("bulkCreateOffers: adminProcedure.input"));
    const bulk = router.slice(router.indexOf("bulkCreateOffers: adminProcedure.input"), router.indexOf("tickets: adminProcedure.query"));
    for (const procedure of [single, bulk]) {
      expect(procedure).toContain("sourceReference: z.string().trim().min(1).max(160)");
      expect(procedure).toContain("reviewNotes: z.string().trim().min(1).max(2000)");
    }
    expect(single).toContain("createOpportunityOffer(ctx.user.id, input)");
    expect(bulk).toContain("bulkCreateOpportunityOffers(ctx.user.id, input.offers)");
  });

  it("persists offer and source/review/accepted terms in one transaction with an offer-specific audit reference", () => {
    const start = database.indexOf("type PersistedOpportunityPublication = {");
    const end = database.indexOf("export const ADMIN_LEDGER_ACTIVITY_PAGE_SIZE", start);
    const publication = database.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(publication).toContain("db.transaction(async tx =>");
    expect(publication).toContain("tx.insert(opportunityOffers).values");
    expect(publication).toContain("tx.insert(v5AuditEvents).values");
    expect(publication).toContain('action: "trading_opportunity_published"');
    expect(publication).toContain('entityType: "opportunity_offer"');
    expect(publication).toContain("entityId: String(offer.id)");
    expect(publication).toContain("reference: offer.publication.sourceReference");
    expect(publication).toContain("reason: offer.publication.reviewNotes");
    expect(publication).toContain("acceptedTerms");
    expect(publication).toContain("assessPublishedOfferPackageCompatibility");
    expect(publication).toContain("assessOpportunityPackageCompatibility(publication, rules)");
    expect(publication).toContain("packageCompatibility: offer.compatibility");
    expect(publication).toContain("source: offer.publication.sourceReference");
    expect(publication).toContain("reviewNotes: offer.publication.reviewNotes");
    expect(publication).toContain("new: acceptedTerms");
    expect(publication).toContain("compatibility: persisted.compatibility");
    expect(publication).toContain("actorUserId: adminId");
    expect(publication.match(/db\.transaction\(async tx =>/g)).toHaveLength(3);
  });

  it("includes publication records in the existing read-only Trade Audit History allowlist", () => {
    const allowlist = database.match(/const TRADE_SETTINGS_AUDIT_ACTIONS = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
    expect(allowlist).toContain('"trading_opportunity_published"');
    expect(database).toContain('entityType === "opportunity_offer"');
    const historyStart = database.indexOf("export async function listAdminTradeAuditHistory(");
    const historyEnd = database.indexOf("export async function getTradeFeePolicy()", historyStart);
    const history = database.slice(historyStart, historyEnd);
    expect(history).toContain("inArray(v5AuditEvents.action, [...TRADE_SETTINGS_AUDIT_ACTIONS])");
    expect(history).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });

  it("exposes manual close only as an admin-protected mutation with a required reason", () => {
    const start = router.indexOf("closeOffer: adminProcedure.input");
    const end = router.indexOf("tickets: adminProcedure.query", start);
    const procedure = router.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(procedure).toContain('reason: z.string().trim().min(1).max(2000)');
    expect(procedure).toContain("closeOpportunityOffer(ctx.user.id, input)");
  });

  it("locks and closes only open offers with an atomic immutable state/reason audit and fresh read-back", () => {
    const start = database.indexOf("export async function closeOpportunityOffer(");
    const end = database.indexOf("export const ADMIN_LEDGER_ACTIVITY_PAGE_SIZE", start);
    const closure = database.slice(start, end);
    const closureAudit = database.slice(database.indexOf("function opportunityClosureAuditEvent"), start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(closure).toContain("db.transaction(async tx =>");
    expect(closure).toContain(".for(\"update\")");
    expect(closure).toContain('eq(opportunityOffers.status, "open")');
    expect(closure).toContain("opportunityClosureAuditEvent(adminId, closure.offerId, closure.reason)");
    expect(closureAudit).toContain('action: "trading_opportunity_closed"');
    expect(closureAudit).toContain('old: { status: "open" }, new: { status: "closed" }, reason');
    expect(closure).toContain("idempotent: true");
    expect(closure).toContain("fresh persisted read-back");
    expect(closure).toContain("savedOffer?.status !== \"closed\"");
    expect(closure).not.toContain("opportunityDeliveryEvents");
    expect(closure).not.toContain("opportunityPopupEvents");
    expect(database).toMatch(/eq\(opportunityOffers\.status,\s*"open"\)/);
    expect(database).toContain('"trading_opportunity_closed"] as const');
  });
});
