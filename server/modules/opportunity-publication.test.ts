import { describe, expect, it } from "vitest";
import { validateOpportunityOfferClosure, validateOpportunityOfferPublication } from "./opportunity-publication";

const validInput = {
  symbol: " ABC ",
  venueFrom: " Venue A ",
  venueTo: " Venue B ",
  currency: "USD" as const,
  minimumMinor: 1000,
  expectedRewardBps: 85,
  durationSeconds: 60,
  sourceReference: " source-record-42 ",
  reviewNotes: " Reviewed against the cited record. ",
};

describe("validateOpportunityOfferPublication", () => {
  it("normalizes required source and review evidence alongside accepted terms", () => {
    expect(validateOpportunityOfferPublication(validInput)).toMatchObject({
      symbol: "ABC",
      venueFrom: "Venue A",
      venueTo: "Venue B",
      sourceReference: "source-record-42",
      reviewNotes: "Reviewed against the cited record.",
      expectedRewardBps: 85,
      durationSeconds: 60,
    });
  });

  it("rejects blank/oversized evidence and non-finite or out-of-range offer terms", () => {
    expect(() => validateOpportunityOfferPublication({ ...validInput, sourceReference: "  " })).toThrow("Source reference");
    expect(() => validateOpportunityOfferPublication({ ...validInput, reviewNotes: "  " })).toThrow("Review notes");
    expect(() => validateOpportunityOfferPublication({ ...validInput, sourceReference: "x".repeat(161) })).toThrow("Source reference");
    expect(() => validateOpportunityOfferPublication({ ...validInput, minimumMinor: Number.MAX_SAFE_INTEGER + 1 })).toThrow("safe integer");
    expect(() => validateOpportunityOfferPublication({ ...validInput, durationSeconds: 86401 })).toThrow("duration");
  });

  it("rejects invalid schedules and rewards earlier than expiry", () => {
    const opensAt = new Date("2026-11-03T12:00:00.000Z");
    expect(() => validateOpportunityOfferPublication({ ...validInput, opensAt, closesAt: opensAt }))
      .toThrow("expiry must be later");
    expect(() => validateOpportunityOfferPublication({ ...validInput, closesAt: new Date("2026-11-03T12:01:00.000Z"), rewardAt: opensAt }))
      .toThrow("Reward time must not precede");
    expect(() => validateOpportunityOfferPublication({ ...validInput, opensAt: new Date(Number.NaN) }))
      .toThrow("Opening time must be a valid timestamp");
  });
});

describe("validateOpportunityOfferClosure", () => {
  it("requires a positive safe offer ID and a non-empty trimmed reason", () => {
    expect(validateOpportunityOfferClosure({ offerId: 7, reason: "  reviewed terms changed  " })).toEqual({
      offerId: 7,
      reason: "reviewed terms changed",
    });
    expect(() => validateOpportunityOfferClosure({ offerId: 0, reason: "valid reason" })).toThrow("positive safe integer");
    expect(() => validateOpportunityOfferClosure({ offerId: 7, reason: "   " })).toThrow("Closure reason");
    expect(() => validateOpportunityOfferClosure({ offerId: 7, reason: "x".repeat(2001) })).toThrow("Closure reason");
  });
});
