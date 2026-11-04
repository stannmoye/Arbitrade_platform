import { describe, expect, it } from "vitest";
import {
  createCatalogueIdentityOpportunityTemplate,
  createUnattributedCatalogueOpportunityTemplate,
  selectOpportunityGenerationTerms,
  validateOpportunityGenerationTemplate,
  type OpportunityGenerationPackageBounds,
  type OpportunityGenerationTemplate,
} from "./opportunity-generation-template";

const template: OpportunityGenerationTemplate = {
  templateName: "Reviewed BTC route",
  companyReferenceId: "logo-brand-0991",
  symbol: "BTC",
  venueFrom: "Venue A",
  venueTo: "Venue B",
  currency: "USD",
  minimumMinor: 10_000,
  sourceReference: "source-record-42",
  reviewNotes: "Reviewed against the cited source.",
};
const packageA: OpportunityGenerationPackageBounds = {
  minimumPayoutRateBps: 200,
  maximumPayoutRateBps: 300,
  minimumTradeDurationSeconds: 60,
  maximumTradeDurationSeconds: 120,
};
const packageB: OpportunityGenerationPackageBounds = {
  minimumPayoutRateBps: 700,
  maximumPayoutRateBps: 900,
  minimumTradeDurationSeconds: 600,
  maximumTradeDurationSeconds: 900,
};

describe("opportunity generation templates", () => {
  it("builds a brand-only catalogue opportunity without inventing a ticker or exchange", () => {
    const generated = createCatalogueIdentityOpportunityTemplate({ id: "logo-brand-0991", name: "Example Brand" }, 25_000);
    expect(generated).toMatchObject({ templateName: "Example Brand opportunity", companyReferenceId: "logo-brand-0991", symbol: "BRAND", venueFrom: "Informational", venueTo: "Informational", currency: "USD", minimumMinor: 25_000, sourceReference: "company-catalogue:logo-brand-0991" });
    expect(generated.reviewNotes).toContain("does not assert a market listing");
  });

  it("creates a company-neutral informational opportunity when no approved company is available", () => {
    const generated = createUnattributedCatalogueOpportunityTemplate(25_000);
    expect(generated).toMatchObject({
      templateName: "Informational opportunity",
      companyReferenceId: null,
      symbol: "BRAND",
      venueFrom: "Informational",
      venueTo: "Informational",
      currency: "USD",
      minimumMinor: 25_000,
      sourceReference: "company-catalogue:no-approved-company",
    });
    expect(generated.reviewNotes).toContain("not associated with a company");
    const values = [250, 90];
    const terms = selectOpportunityGenerationTerms(generated, packageA, () => values.shift()!);
    expect(terms).toMatchObject({ companyReferenceId: null, configuredPayoutRateBps: 250, tradeDurationSeconds: 90 });
    expect(() => validateOpportunityGenerationTemplate(generated)).toThrow(/Company reference ID/);
    expect(() => selectOpportunityGenerationTerms({ ...generated, expectedRewardBps: 999 }, packageA)).toThrow(/cannot override/);
    expect(() => selectOpportunityGenerationTerms({ ...generated, templateName: "Unreviewed company" }, packageA)).toThrow(/non-canonical identity/);
    expect(() => selectOpportunityGenerationTerms({ ...generated, companyReferenceId: "logo-brand-0991" }, packageA)).toThrow(/must not contain a company reference/);
  });

  it("rejects malformed catalogue identities", () => {
    expect(() => createCatalogueIdentityOpportunityTemplate({ id: "fake", name: "Brand" }, 100)).toThrow(/Logo ID/);
    expect(() => createCatalogueIdentityOpportunityTemplate({ id: "logo-brand-0991", name: " " }, 100)).toThrow(/Company name/);
    expect(() => createCatalogueIdentityOpportunityTemplate({ id: "logo-brand-0991", name: "Brand" }, 0)).toThrow(/Package minimum/);
  });
  it("normalizes template text and retains company/source provenance", () => {
    expect(validateOpportunityGenerationTemplate({
      ...template,
      templateName: "  Reviewed BTC route ",
      companyReferenceId: " logo-brand-0991 ",
      sourceReference: " source-record-42 ",
      reviewNotes: " Reviewed against the cited source. ",
    })).toEqual(template);
  });

  it("requires nonblank bounded source evidence and rejects absent evidence", () => {
    for (const sourceReference of [undefined, "", "   ", "x".repeat(161)]) {
      expect(() => validateOpportunityGenerationTemplate({ ...template, sourceReference })).toThrow(/Source reference/);
    }
    for (const reviewNotes of [undefined, " ", "x".repeat(2001)]) {
      expect(() => validateOpportunityGenerationTemplate({ ...template, reviewNotes })).toThrow(/Review notes/);
    }
  });

  it("rejects template-level payout or duration overrides", () => {
    expect(() => validateOpportunityGenerationTemplate({ ...template, expectedRewardBps: 250 })).toThrow(/cannot set or override/);
    expect(() => validateOpportunityGenerationTemplate({ ...template, durationSeconds: 90 })).toThrow(/cannot set or override/);
  });

  it("selects independently from each package's saved ranges", () => {
    const valuesA = [250, 90];
    const valuesB = [800, 750];
    const termsA = selectOpportunityGenerationTerms(template, packageA, () => valuesA.shift()!);
    const termsB = selectOpportunityGenerationTerms(template, packageB, () => valuesB.shift()!);
    expect(termsA).toMatchObject({ configuredPayoutRateBps: 250, tradeDurationSeconds: 90, sourceReference: template.sourceReference });
    expect(termsB).toMatchObject({ configuredPayoutRateBps: 800, tradeDurationSeconds: 750, sourceReference: template.sourceReference });
    expect(termsA.payoutSemantics).toBe("configured_payout_not_market_earned_profit");
    expect(termsB.payoutSemantics).toBe("configured_payout_not_market_earned_profit");
  });

  it("accepts inclusive configured endpoints for payout and duration", () => {
    const values = [1, 10, 5000, 86400];
    const low = selectOpportunityGenerationTerms(template, {
      minimumPayoutRateBps: 1, maximumPayoutRateBps: 1,
      minimumTradeDurationSeconds: 10, maximumTradeDurationSeconds: 10,
    }, () => values.shift()!);
    expect(low).toMatchObject({ configuredPayoutRateBps: 1, tradeDurationSeconds: 10 });
    const high = selectOpportunityGenerationTerms(template, {
      minimumPayoutRateBps: 5000, maximumPayoutRateBps: 5000,
      minimumTradeDurationSeconds: 86400, maximumTradeDurationSeconds: 86400,
    }, () => values.shift()!);
    expect(high).toMatchObject({ configuredPayoutRateBps: 5000, tradeDurationSeconds: 86400 });
  });

  it("fails closed for absent, null, malformed, inverted, or unsafe package settings", () => {
    expect(() => selectOpportunityGenerationTerms(template, undefined)).toThrow(/Saved package/);
    for (const invalid of [
      { ...packageA, maximumPayoutRateBps: undefined },
      { ...packageA, minimumPayoutRateBps: null },
      { ...packageA, maximumTradeDurationSeconds: null },
      { ...packageA, minimumPayoutRateBps: 0 },
      { ...packageA, maximumPayoutRateBps: 5001 },
      { ...packageA, minimumPayoutRateBps: 2.5 },
      { ...packageA, minimumPayoutRateBps: Number.MAX_SAFE_INTEGER + 1 },
      { ...packageA, minimumPayoutRateBps: 301 },
      { ...packageA, minimumTradeDurationSeconds: 9 },
      { ...packageA, maximumTradeDurationSeconds: 86401 },
      { ...packageA, minimumTradeDurationSeconds: 121 },
    ]) {
      expect(() => selectOpportunityGenerationTerms(template, invalid)).toThrow();
    }
  });

  it("keeps cryptographic selections inside each package range", () => {
    for (let index = 0; index < 40; index += 1) {
      const terms = selectOpportunityGenerationTerms(template, packageA);
      expect(terms.configuredPayoutRateBps).toBeGreaterThanOrEqual(packageA.minimumPayoutRateBps!);
      expect(terms.configuredPayoutRateBps).toBeLessThanOrEqual(packageA.maximumPayoutRateBps!);
      expect(terms.tradeDurationSeconds).toBeGreaterThanOrEqual(packageA.minimumTradeDurationSeconds!);
      expect(terms.tradeDurationSeconds).toBeLessThanOrEqual(packageA.maximumTradeDurationSeconds!);
    }
  });
});
