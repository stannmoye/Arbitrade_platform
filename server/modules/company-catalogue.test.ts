import { describe, expect, it } from "vitest";
import { COMPANY_CATALOGUE, getCompanyCatalogueById, getCompanyCatalogueBySymbol, getCompanyCatalogueSummary, searchCompanyCatalogue } from "./company-catalogue";

describe("static SEC-derived company catalogue", () => {
  it("contains 950 unique issuers with stable CIK identities", () => {
    expect(COMPANY_CATALOGUE).toHaveLength(950);
    expect(new Set(COMPANY_CATALOGUE.map((c) => c.id)).size).toBe(950);
    expect(new Set(COMPANY_CATALOGUE.map((c) => c.cik)).size).toBe(950);
    expect(new Set(COMPANY_CATALOGUE.map((c) => c.name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())).size).toBe(950);
    expect(new Set(COMPANY_CATALOGUE.map((c) => c.exchangeCode.toUpperCase() + ":" + c.symbol.toUpperCase())).size).toBe(950);
  });
  it("does not present source rows as verified or tradable", () => {
    expect(COMPANY_CATALOGUE.every((c) => c.listingStatus === "unverified" && c.requiresManualVerification)).toBe(true);
    expect(COMPANY_CATALOGUE.every((c) => c.lastVerifiedAt === null)).toBe(true);
    expect(getCompanyCatalogueSummary().verifiedActive).toBe(0);
  });
  it("does not fabricate unavailable sector, headquarters, instrument-type or logo data", () => {
    expect(COMPANY_CATALOGUE.every((c) => c.sector === null && c.headquartersCountry === null && c.instrumentType === null && c.logoUrl === null)).toBe(true);
  });
  it("preserves the official-source metadata and reviewed distribution terms", () => {
    const summary = getCompanyCatalogueSummary();
    expect(summary.total).toBe(950);
    expect(summary.unverified).toBe(950);
    expect(summary.source.sourceOfficialPayloadSha256).toBe("e6fbad74d63540e73239f257809cf217b9d6b4fed2410691f0c8c576c9a6cf3c");
    expect(summary.source.licenseStatus).toBe("verified_open");
    expect(summary.exchangeCount).toBe(2);
  });
  it("supports stable ID, exchange-aware symbol and bounded search lookups", () => {
    const sample = COMPANY_CATALOGUE[0]!;
    expect(getCompanyCatalogueById(sample.id)?.cik).toBe(sample.cik);
    expect(getCompanyCatalogueBySymbol(sample.symbol, sample.exchangeCode)?.id).toBe(sample.id);
    expect(searchCompanyCatalogue({ search: sample.ticker, exchangeCode: sample.exchangeCode, limit: 3 }).some((c) => c.id === sample.id)).toBe(true);
    expect(searchCompanyCatalogue({ limit: 10000 })).toHaveLength(100);
    expect(searchCompanyCatalogue({ countryCode: "ZZ" })).toHaveLength(0);
  });
});
