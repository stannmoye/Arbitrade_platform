import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ownerLinks } from "./components/TradeSettingsAdminGuide";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const closeAction = readFileSync(new URL("./components/OpportunityCloseAction.tsx", import.meta.url), "utf8");
const guide = readFileSync(new URL("./components/TradeSettingsAdminGuide.tsx", import.meta.url), "utf8");
const templateAdmin = readFileSync(new URL("./components/AdminOpportunityTemplates.tsx", import.meta.url), "utf8");
const opportunityPage = app.slice(app.indexOf("function AdminOpportunityEngine()"), app.indexOf("type AdminTradeGlobalMasterKey"));

 describe("audited close on generated Opportunity Generation & Management", () => {
  it("renders the close action only from the existing owner page", () => {
    expect(opportunityPage).toContain("<OpportunityCloseAction");
    expect(app.match(/<OpportunityCloseAction\b/g)).toHaveLength(1);
    expect(opportunityPage).toContain("closeOfferMutation");
    expect(opportunityPage).toContain("await offers.refetch()");
  });

  it("requires a clear non-empty reason and shows pending, error and read-back success status", () => {
    expect(closeAction).toContain("Required reason for manual close");
    expect(closeAction).toContain("disabled={pending || !reason.trim()}");
    expect(closeAction).toContain("Closing and verifying…");
    expect(opportunityPage).toMatch(/role=\{closeFeedback\.kind\s*===\s*"error"\s*\?\s*"alert"\s*:\s*"status"\}/);
    expect(opportunityPage).toContain("A fresh persisted read-back verified its closed status and audit record.");
    expect(opportunityPage).toContain("closeFeedback.kind");
  });

  it("preserves delivered history and does not put close instructions in the read-only Guide", () => {
    expect(closeAction).toContain("existing delivered popup and trade history are left unchanged");
    expect(guide).not.toContain("Close opportunity…");
    expect(guide).not.toContain("manual close");
  });

  it("states the template provenance fields and verification limit precisely", () => {
    const ownerDescription = ownerLinks.find((link) => link.routeId === "trade-opportunity-publishing")?.description ?? "";
    expect(ownerDescription).toContain("administrator-approved reusable templates");
    expect(templateAdmin).toContain("Source reference");
    expect(templateAdmin).toContain("Administrator review notes");
    expect(templateAdmin).toContain("are not independently verified");
    expect(guide).not.toContain("manually published or validated-import");
    expect(opportunityPage).toContain("Manual publication and CSV import are disabled");
  });
});
