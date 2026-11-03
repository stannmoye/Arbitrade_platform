import { describe, expect, it } from "vitest";
import {
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
