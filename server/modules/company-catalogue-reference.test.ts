import { describe, expect, it } from "vitest";
import {
  COMPANY_REFERENCE_CATALOGUE,
  findCompanyReferencesBySymbol,
  getCompanyReferenceById,
  getCompanyReferenceSummary,
  getRandomCompanyReference,
  searchCompanyReferences,
} from "./company-catalogue-reference";

describe("Logo.dev brand-only static reference catalogue", () => {
  it("loads all 1,811 mapped brands with unique IDs and local logo paths", () => {
    expect(COMPANY_REFERENCE_CATALOGUE).toHaveLength(1811);
    expect(new Set(COMPANY_REFERENCE_CATALOGUE.map((company) => company.id)).size).toBe(1811);
    expect(new Set(COMPANY_REFERENCE_CATALOGUE.map((company) => company.name.toLowerCase())).size).toBe(1811);
    expect(COMPANY_REFERENCE_CATALOGUE.every((company) => company.logoUrl.startsWith("/assets/company-logo-source/by-country/"))).toBe(true);
  });

  it("never presents brand names as verified securities or trade-eligible listings", () => {
    expect(COMPANY_REFERENCE_CATALOGUE.every((company) =>
      company.listingStatus === "unverified" &&
      company.lastVerifiedAt === null &&
      company.requiresManualVerification &&
      company.recordCompleteness === "brand-only" &&
      company.instrumentType === "Brand"
    )).toBe(true);
    expect(getCompanyReferenceSummary().incompleteRecords).toBe(1811);
    expect(getCompanyReferenceSummary().eligibleForVerifiedTradeRotation).toBe(0);
    const result = searchCompanyReferences({ limit: 1 })[0]!;
    expect(result.referenceOnly).toBe(true);
    expect(result.logoReusePermissionVerified).toBe(false);
    expect(result.eligibleForVerifiedTradeRotation).toBe(false);
  });

  it("supports ID lookup and bounded name/domain search without a database", () => {
    const sample = COMPANY_REFERENCE_CATALOGUE[0]!;
    expect(getCompanyReferenceById(sample.id)?.id).toBe(sample.id);
    expect(searchCompanyReferences({ search: sample.name, limit: 5 }).some((company) => company.id === sample.id)).toBe(true);
    expect(searchCompanyReferences({ search: sample.domain, limit: 5 }).length).toBeGreaterThan(0);
    expect(searchCompanyReferences({ limit: 1000 })).toHaveLength(1000);
    expect(COMPANY_REFERENCE_CATALOGUE.every((company) => company.countryName.length > 0)).toBe(true);
  });

  it("returns a brand-only random spotlight and rejects invalid random sources", () => {
    const sample = getRandomCompanyReference(() => 0);
    expect(sample.id).toBe(COMPANY_REFERENCE_CATALOGUE[0]!.id);
    expect(sample.referenceOnly).toBe(true);
    expect(sample.recordCompleteness).toBe("brand-only");
    expect(sample.listingStatus).toBe("unverified");
    expect(sample.eligibleForVerifiedTradeRotation).toBe(false);
    expect(sample.logoReusePermissionVerified).toBe(false);
    expect(sample.logoUrl).toBe(COMPANY_REFERENCE_CATALOGUE[0]!.logoUrl);
    expect(() => getRandomCompanyReference(() => 1)).toThrow("Random source");
  });

  it("does not repeat the previous spotlight when alternatives exist", () => {
    const first = getRandomCompanyReference(() => 0);
    const next = getRandomCompanyReference(() => 0, [first.id]);
    expect(next.id).toBe(COMPANY_REFERENCE_CATALOGUE[1]!.id);
    expect(next.id).not.toBe(first.id);
  });

  it("falls back to the full brand list only when every ID is excluded", () => {
    const allIds = COMPANY_REFERENCE_CATALOGUE.map((company) => company.id);
    expect(getRandomCompanyReference(() => 0, allIds).id).toBe(COMPANY_REFERENCE_CATALOGUE[0]!.id);
  });

  it("loads public ticker candidates by stable logo ID but never treats them as verified listings", () => {
    const apple = getCompanyReferenceById("logo-brand-0001");
    expect(apple?.name).toBe("Apple");
    expect(apple?.ticker).toBe("AAPL");
    expect(apple?.symbol).toBe("AAPL");
    expect(apple?.exchangeCode).toBe("NASDAQ");
    expect(apple?.tickerResearchStatus).toBe("Public");
    expect(apple?.listingStatus).toBe("unverified");
    expect(apple?.eligibleForVerifiedTradeRotation).toBe(false);
    expect(findCompanyReferencesBySymbol("aapl").map((company) => company.id)).toContain("logo-brand-0001");
    expect(findCompanyReferencesBySymbol("   ")).toHaveLength(0);
    expect(getCompanyReferenceSummary().tickerCandidates).toBe(814);
  });

  it("does not expose invented placeholder codes as candidate tickers", () => {
    const placeholders = COMPANY_REFERENCE_CATALOGUE.filter((company) =>
      company.tickerResearchStatus === "PLACEHOLDER - invented code, not a real ticker"
    );
    expect(placeholders).toHaveLength(637);
    expect(placeholders.every((company) => company.ticker === "" && company.exchangeCode === "")).toBe(true);
  });
});
