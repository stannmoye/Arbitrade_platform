import { describe, expect, it } from "vitest";
import {
  COMPANY_REFERENCE_CATALOGUE,
  findCompanyReferencesBySymbol,
  getCompanyReferenceById,
  getCompanyReferenceSummary,
  getRandomCompanyReference,
  searchCompanyReferences,
} from "./company-catalogue-reference";

describe("1,000-company static reference catalogue", () => {
  it("loads 1,000 unique records and local logo paths", () => {
    expect(COMPANY_REFERENCE_CATALOGUE).toHaveLength(1000);
    expect(new Set(COMPANY_REFERENCE_CATALOGUE.map((company) => company.id)).size).toBe(1000);
    expect(new Set(COMPANY_REFERENCE_CATALOGUE.map((company) => company.logoUrl)).size).toBe(1000);
    expect(COMPANY_REFERENCE_CATALOGUE.every((company) => company.logoUrl.startsWith("/assets/company-logos/"))).toBe(true);
  });

  it("keeps every record unverified instead of treating catalogue membership as trading eligibility", () => {
    expect(COMPANY_REFERENCE_CATALOGUE.every((company) =>
      company.listingStatus === "unverified" &&
      company.lastVerifiedAt === null &&
      company.requiresManualVerification
    )).toBe(true);
    expect(COMPANY_REFERENCE_CATALOGUE.every((company) => company.recordCompleteness === "incomplete")).toBe(true);
    expect(getCompanyReferenceSummary().incompleteRecords).toBe(1000);
    expect(getCompanyReferenceSummary().eligibleForVerifiedTradeRotation).toBe(0);
    const safePlaceholderCount = COMPANY_REFERENCE_CATALOGUE.filter((company) =>
      company.logoSourceName === "Neutral company-reference placeholder" &&
      company.logoSourceSlug === "neutral-placeholder" &&
      company.logoSourceUrl === "internal://neutral-company-reference-placeholder"
    ).length;
    expect(getCompanyReferenceSummary().logoReusePermissionVerified).toBe(safePlaceholderCount);
    const result = searchCompanyReferences({ limit: 1 })[0]!;
    expect(result.referenceOnly).toBe(true);
    const isSafePlaceholder = result.logoSourceName === "Neutral company-reference placeholder" &&
      result.logoSourceSlug === "neutral-placeholder" &&
      result.logoSourceUrl === "internal://neutral-company-reference-placeholder";
    expect(result.logoReusePermissionVerified).toBe(isSafePlaceholder);
    const sourceRecord = COMPANY_REFERENCE_CATALOGUE.find((company) => company.id === result.id)!;
    expect(result.logoUrl).toBe(isSafePlaceholder ? sourceRecord.logoUrl : null);
    expect(result.eligibleForVerifiedTradeRotation).toBe(false);
  });

  it("supports ID lookup and bounded search without a database", () => {
    const sample = COMPANY_REFERENCE_CATALOGUE[0]!;
    expect(getCompanyReferenceById(sample.id)?.id).toBe(sample.id);
    expect(searchCompanyReferences({ search: sample.name, limit: 5 }).some((company) => company.id === sample.id)).toBe(true);
    expect(searchCompanyReferences({ countryCode: "ZZ" })).toHaveLength(0);
    expect(searchCompanyReferences({ limit: 1000 })).toHaveLength(100);
  });

  it("returns a clearly reference-only random spotlight, never a verified trade", () => {
    const sample = getRandomCompanyReference(() => 0);
    expect(sample.id).toBe(COMPANY_REFERENCE_CATALOGUE[0]!.id);
    expect(sample.referenceOnly).toBe(true);
    expect(sample.recordCompleteness).toBe("incomplete");
    expect(sample.listingStatus).toBe("unverified");
    expect(sample.eligibleForVerifiedTradeRotation).toBe(false);
    expect(sample.logoReusePermissionVerified).toBe(true);
    expect(sample.logoUrl).toBe(COMPANY_REFERENCE_CATALOGUE[0]!.logoUrl);
    expect(() => getRandomCompanyReference(() => 1)).toThrow("Random source");
  });

  it("does not repeat the previous spotlight when alternatives exist", () => {
    const first = getRandomCompanyReference(() => 0);
    const next = getRandomCompanyReference(() => 0, [first.id]);
    expect(next.id).toBe(COMPANY_REFERENCE_CATALOGUE[1]!.id);
    expect(next.id).not.toBe(first.id);
  });

  it("falls back to the full catalogue only when every ID is excluded", () => {
    const allIds = COMPANY_REFERENCE_CATALOGUE.map((company) => company.id);
    expect(getRandomCompanyReference(() => 0, allIds).id).toBe(COMPANY_REFERENCE_CATALOGUE[0]!.id);
  });

  it("returns every exact symbol match rather than guessing across exchanges", () => {
    const sample = COMPANY_REFERENCE_CATALOGUE[0]!;
    expect(findCompanyReferencesBySymbol(sample.symbol).some((company) => company.id === sample.id)).toBe(true);
    expect(findCompanyReferencesBySymbol("   ")).toHaveLength(0);
  });
});
