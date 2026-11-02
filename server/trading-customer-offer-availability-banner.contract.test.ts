import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");

describe("customer opportunity availability banner", () => {
  it("counts actual eligible open offers separately from the daily pop-up allowance", () => {
    expect(source).toContain("availableOffers={opportunityMeta.data?((opportunityMeta.data.offers||[]).filter((offer:any)=>offer.popupEligible===true&&String(offer.offerStatus||\"\").toLowerCase()===\"open\").length):undefined}");
    expect(source).toContain("eligible open offer");
    expect(source).toContain("Daily pop-up allowance:");
    expect(source).toContain("Alerts appear when an eligible published offer and delivery policy are available.");
    expect(source).not.toContain("opportunities monitored today.");
    expect(source).not.toContain("Opportunities Detected");
  });

  it("shows a loading state before the authenticated opportunity read completes", () => {
    expect(source).toContain("availableOffers===undefined?\"Checking eligible offers\"");
    expect(source).toContain("Checking published offers…");
  });
});
