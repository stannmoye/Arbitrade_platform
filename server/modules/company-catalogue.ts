import catalogueJson from "../data/company-catalogue.json";

export type CompanyListingStatus = "active" | "suspended" | "delisted" | "unverified";
export type CompanyCatalogueItem = {
  id: string;
  cik: string;
  name: string;
  ticker: string;
  symbol: string;
  exchangeCode: string;
  countryCode: string | null;
  countryName: string | null;
  headquartersCountry: string | null;
  sector: string | null;
  logoUrl: string | null;
  instrumentType: string | null;
  listingStatus: CompanyListingStatus;
  lastVerifiedAt: string | null;
  requiresManualVerification: boolean;
  sourceConfidence: string;
  sourceRecordId: string;
  sourceObservedAt: string | null;
};
type CataloguePayload = {
  schemaVersion: number;
  generatedAt: string;
  targetCount: number;
  companyCount: number;
  source: {
    providerName: string;
    sourceFilePath: string;
    sourceFileUrl: string;
    sourceSnapshotUrl: string;
    sourceSnapshotRepository: string;
    sourceSnapshotCommit: string;
    sourceSnapshotGitBlobSha: string;
    sourceSnapshotAt: string;
    sourceSnapshotRecordCount: number;
    sourceFields: string[];
    sourceOfficialPayloadSha256: string;
    licenseName: string;
    licenseUrl: string;
    licenseStatus: string;
    rawRedistributionAllowed: boolean;
    derivedFactsRedistributionStatus: string;
    commercialUseStatus: string;
    attributionRequired: boolean;
    licenseRegistryUrl: string;
    licenseRegistryCommit: string;
    attribution: string;
    selectionPolicy: string;
    confidence: string;
  };
  dataLimitations: string[];
  companies: CompanyCatalogueItem[];
};
export type CompanyCatalogueSearch = { search?: string; countryCode?: string; exchangeCode?: string; limit?: number };

const payload = catalogueJson as unknown as CataloguePayload;
function validatePayload(value: CataloguePayload): void {
  if (value.schemaVersion !== 1 || value.targetCount !== 950 || value.companyCount !== 950 || value.companies.length !== 950) {
    throw new Error("Static company catalogue must contain exactly 950 records.");
  }
  const ids = new Set<string>(), ciks = new Set<string>(), names = new Set<string>(), listings = new Set<string>();
  for (const company of value.companies) {
    if (!company.id || !company.cik || !company.name || !company.ticker || !company.symbol || !company.exchangeCode) {
      throw new Error("Static company catalogue contains a record missing required identity fields.");
    }
    const normalized = company.name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const listing = company.exchangeCode.toUpperCase() + ":" + company.symbol.toUpperCase();
    if (ids.has(company.id) || ciks.has(company.cik) || names.has(normalized) || listings.has(listing)) {
      throw new Error("Static company catalogue contains duplicate identities.");
    }
    ids.add(company.id); ciks.add(company.cik); names.add(normalized); listings.add(listing);
    if (!/^\d{10}$/.test(company.cik)) throw new Error("Static company catalogue contains an invalid CIK.");
    if (company.countryCode !== "US" || company.countryName !== "United States") throw new Error("Country must reflect the selected U.S. listing market.");
    if (company.sector !== null || company.headquartersCountry !== null || company.logoUrl !== null || company.instrumentType !== null) {
      throw new Error("Unsupported source fields must remain null.");
    }
    if (company.listingStatus === "active" && (company.requiresManualVerification || !company.lastVerifiedAt || !Number.isFinite(Date.parse(company.lastVerifiedAt)))) {
      throw new Error("Active listings require independent verification.");
    }
  }
  const source = value.source;
  if (source.sourceSnapshotCommit !== "613c946973fb3cab27ecee35905eb5d91731f8e0" || source.sourceSnapshotGitBlobSha !== "c3116b277d7b4df067a136078d6895ebfc06c287" ||
      source.sourceSnapshotRecordCount !== 10432 || source.sourceOfficialPayloadSha256 !== "e6fbad74d63540e73239f257809cf217b9d6b4fed2410691f0c8c576c9a6cf3c" ||
      source.licenseStatus !== "verified_open" || source.rawRedistributionAllowed !== true ||
      source.derivedFactsRedistributionStatus !== "allowed" || source.commercialUseStatus !== "allowed" || source.attributionRequired !== true) {
    throw new Error("Pinned source provenance or licensing clearance is missing.");
  }
}
validatePayload(payload);
export const COMPANY_CATALOGUE: readonly CompanyCatalogueItem[] = Object.freeze(payload.companies.map((company) => Object.freeze({ ...company })));
const byId = new Map(COMPANY_CATALOGUE.map((company) => [company.id, company]));
const byListing = new Map(COMPANY_CATALOGUE.map((company) => [company.exchangeCode.toUpperCase() + ":" + company.symbol.toUpperCase(), company]));
export function getCompanyCatalogue(): readonly CompanyCatalogueItem[] { return COMPANY_CATALOGUE; }
export function getCompanyCatalogueById(id: string): CompanyCatalogueItem | undefined { return byId.get(id); }
export function getCompanyCatalogueBySymbol(symbol: string, exchangeCode?: string): CompanyCatalogueItem | undefined {
  const value = symbol.trim().toUpperCase();
  if (exchangeCode) return byListing.get(exchangeCode.trim().toUpperCase() + ":" + value);
  return COMPANY_CATALOGUE.find((company) => company.symbol.toUpperCase() === value || company.ticker.toUpperCase() === value);
}
export function searchCompanyCatalogue(filters: CompanyCatalogueSearch = {}): CompanyCatalogueItem[] {
  const search = filters.search?.trim().toLowerCase(), countryCode = filters.countryCode?.trim().toUpperCase();
  const exchangeCode = filters.exchangeCode?.trim().toUpperCase();
  const limit = Number.isFinite(filters.limit) ? Math.max(1, Math.min(100, Math.floor(filters.limit!))) : 50;
  const result: CompanyCatalogueItem[] = [];
  for (const company of COMPANY_CATALOGUE) {
    if (search && ![company.name, company.ticker, company.symbol, company.exchangeCode].some((value) => value.toLowerCase().includes(search))) continue;
    if (countryCode && company.countryCode !== countryCode) continue;
    if (exchangeCode && company.exchangeCode.toUpperCase() !== exchangeCode) continue;
    result.push(company); if (result.length >= limit) break;
  }
  return result;
}
export function getCompanyCatalogueSummary() {
  return {
    total: COMPANY_CATALOGUE.length,
    unverified: COMPANY_CATALOGUE.filter((company) => company.listingStatus === "unverified").length,
    verifiedActive: COMPANY_CATALOGUE.filter((company) => company.listingStatus === "active" && !company.requiresManualVerification && Boolean(company.lastVerifiedAt)).length,
    exchangeCount: new Set(COMPANY_CATALOGUE.map((company) => company.exchangeCode)).size,
    marketCountryCount: new Set(COMPANY_CATALOGUE.map((company) => company.countryCode).filter(Boolean)).size,
    source: {
      providerName: payload.source.providerName,
      sourceSnapshotAt: payload.source.sourceSnapshotAt,
      sourceOfficialPayloadSha256: payload.source.sourceOfficialPayloadSha256,
      licenseName: payload.source.licenseName,
      licenseStatus: payload.source.licenseStatus,
    },
  };
}
