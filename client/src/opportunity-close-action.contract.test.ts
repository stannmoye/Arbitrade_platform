import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ownerLinks } from "./components/TradeSettingsAdminGuide";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const closeAction = readFileSync(new URL("./components/OpportunityCloseAction.tsx", import.meta.url), "utf8");
const guide = readFileSync(new URL("./components/TradeSettingsAdminGuide.tsx", import.meta.url), "utf8");
const opportunityPage = app.slice(app.indexOf("function AdminOpportunityEngine()"), app.indexOf("type AdminTradeGlobalMasterKey"));

 describe("manual close on Publish & Manage Opportunities", () => {
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
    expect(opportunityPage).toContain('role={closeFeedback.kind==="error"?"alert":"status"}');
    expect(opportunityPage).toContain("A fresh persisted read-back verified its closed status and audit record.");
    expect(opportunityPage).toContain("closeFeedback.kind");
  });

  it("preserves delivered history and does not put close instructions in the read-only Guide", () => {
    expect(closeAction).toContain("existing delivered popup and trade history are left unchanged");
    expect(guide).not.toContain("Close opportunity…");
    expect(guide).not.toContain("manual close");
  });

  it("states the saved provenance fields and verification limit precisely in Guide and publishing copy", () => {
    const ownerDescription = ownerLinks.find((link) => link.routeId === "trade-opportunity-publishing")?.description ?? "";
    for (const copy of [ownerDescription, opportunityPage]) {
      expect(copy).toContain("source reference");
      expect(copy).toContain("review note");
      expect(copy).toContain("does not independently verify");
      expect(copy).toContain("external evidence");
    }
    expect(guide).toContain("Required source references and operator review notes are saved in Trade Audit History");
    expect(guide).toContain("the platform does not independently verify the external evidence or the substance of the note");
    expect(opportunityPage).toContain("the platform does not independently verify the external evidence or the substance of the note");
  });
});
