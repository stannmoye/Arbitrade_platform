import catalogueJson from "../data/company-catalogue-1000.json";

export type CompanyReferenceRecord = {
  id: string;
  name: string;
  ticker: string;
  symbol: string;
  exchangeCode: string;
  countryCode: string;
  countryName: string;
  logoUrl: string;
  logoSourceName: string;
  logoSourceUrl: string;
  logoSourceSlug: string;
  listingStatus: "unverified";
  lastVerifiedAt: null;
  requiresManualVerification: true;
  sourceConfidence: string;
  sector: string | null;
  headquartersCountry: string | null;
  instrumentType: "Stock";
  recordCompleteness: "incomplete";
};

type CataloguePayload = {
  schemaVersion: number;
  targetCount: number;
  companyCount: number;
  generatedAt: string;
  companies: CompanyReferenceRecord[];
  targetDistribution?: unknown;
  source?: { providerName?: string; sourceCommit?: string };
  logoSource?: { providerName?: string; repositoryCommit?: string };
  dataLimitations?: string[];
};

export type CompanyReferenceSearch = {
  search?: string;
  countryCode?: string;
  limit?: number;
};
export type CompanyReferenceResponse = Omit<CompanyReferenceRecord, "logoUrl"> & {
  logoUrl: string | null;
  referenceOnly: true;
  logoReusePermissionVerified: boolean;
  eligibleForVerifiedTradeRotation: false;
};

function asReferenceResponse(company: CompanyReferenceRecord): CompanyReferenceResponse {
  const approvedPlaceholder =
    company.logoSourceName === "Neutral company-reference placeholder" &&
    company.logoSourceSlug === "neutral-placeholder" &&
    company.logoSourceUrl === "internal://neutral-company-reference-placeholder";
  return {
    ...company,
    logoUrl: approvedPlaceholder ? company.logoUrl : null,
    referenceOnly: true,
    logoReusePermissionVerified: approvedPlaceholder,
    eligibleForVerifiedTradeRotation: false,
  };
}

const payload = catalogueJson as unknown as CataloguePayload;

function validateReferenceCatalogue(value: CataloguePayload): void {
  if (value.schemaVersion !== 1 || value.targetCount !== 1000 || value.companyCount !== 1000 || !Array.isArray(value.companies) || value.companies.length !== 1000) {
    throw new Error("Company reference catalogue must contain exactly 1,000 records.");
  }
  const ids = new Set<string>();
  const logoPaths = new Set<string>();
  for (const company of value.companies) {
    if (!company.id || !company.name || !company.symbol || !company.ticker || !company.exchangeCode || !company.countryCode || !company.countryName) {
      throw new Error("Company reference catalogue contains an incomplete identity record.");
    }
    if (ids.has(company.id)) throw new Error("Company reference catalogue contains duplicate IDs.");
    ids.add(company.id);
    if (!company.logoUrl.startsWith("/assets/company-logos/") || company.logoUrl.includes("://")) {
      throw new Error("Company reference catalogue must use local logo paths only.");
    }
    if (logoPaths.has(company.logoUrl)) throw new Error("Company reference catalogue contains duplicate logo paths.");
    logoPaths.add(company.logoUrl);
    if (company.listingStatus !== "unverified" || company.lastVerifiedAt !== null || company.requiresManualVerification !== true) {
      throw new Error("Unverified reference records must not be promoted to verified listings.");
    }
  }
}

validateReferenceCatalogue(payload);

export const COMPANY_REFERENCE_CATALOGUE: readonly CompanyReferenceRecord[] = Object.freeze(
  payload.companies.map((company) => Object.freeze({ ...company })),
);

const byId = new Map(COMPANY_REFERENCE_CATALOGUE.map((company) => [company.id, company]));

export function getCompanyReferenceById(id: string): CompanyReferenceResponse | undefined {
  const company = byId.get(id);
  return company ? asReferenceResponse(company) : undefined;
}

/** Random informational spotlight only; never use this as a trade or execution record. */
export function getRandomCompanyReference(random: () => number = Math.random): CompanyReferenceResponse {
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new Error("Random source must return a value in [0, 1)");
  }
  const index = Math.floor(sample * COMPANY_REFERENCE_CATALOGUE.length);
  return asReferenceResponse(COMPANY_REFERENCE_CATALOGUE[index]!);
}

/** Returns all exact ticker/symbol matches; callers must not guess between markets. */
export function findCompanyReferencesBySymbol(symbol: string): CompanyReferenceResponse[] {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) return [];
  return COMPANY_REFERENCE_CATALOGUE
    .filter((company) => company.symbol.toUpperCase() === normalized || company.ticker.toUpperCase() === normalized)
    .map(asReferenceResponse);
}

export function searchCompanyReferences(filters: CompanyReferenceSearch = {}): CompanyReferenceResponse[] {
  const term = filters.search?.trim().toLowerCase();
  const countryCode = filters.countryCode?.trim().toUpperCase();
  const limit = Number.isFinite(filters.limit) ? Math.max(1, Math.min(100, Math.floor(filters.limit!))) : 50;
  const results: CompanyReferenceResponse[] = [];
  for (const company of COMPANY_REFERENCE_CATALOGUE) {
    if (term && ![company.name, company.ticker, company.symbol, company.exchangeCode].some((value) => value.toLowerCase().includes(term))) continue;
    if (countryCode && company.countryCode.toUpperCase() !== countryCode) continue;
    results.push(asReferenceResponse(company));
    if (results.length >= limit) break;
  }
  return results;
}

export function getCompanyReferenceSummary() {
  const countryCounts: Record<string, number> = {};
  for (const company of COMPANY_REFERENCE_CATALOGUE) countryCounts[company.countryName] = (countryCounts[company.countryName] ?? 0) + 1;
  return {
    total: COMPANY_REFERENCE_CATALOGUE.length,
    incompleteRecords: COMPANY_REFERENCE_CATALOGUE.filter((company) => company.recordCompleteness === "incomplete").length,
    unverified: COMPANY_REFERENCE_CATALOGUE.filter((company) => company.listingStatus === "unverified").length,
    verifiedActive: 0,
    localLogoPaths: COMPANY_REFERENCE_CATALOGUE.filter((company) => company.logoUrl.startsWith("/assets/company-logos/")).length,
    logoReusePermissionVerified: COMPANY_REFERENCE_CATALOGUE.filter((company) => company.logoSourceName === "Neutral company-reference placeholder" && company.logoSourceSlug === "neutral-placeholder" && company.logoSourceUrl === "internal://neutral-company-reference-placeholder").length,
    eligibleForVerifiedTradeRotation: 0,
    generatedAt: payload.generatedAt,
    countryCounts,
    dataLimitations: payload.dataLimitations ?? [],
    sourceProvider: payload.source?.providerName ?? null,
    logoProvider: payload.logoSource?.providerName ?? null,
    note: "Reference-only data. Every record is explicitly incomplete until listing status, headquarters and permitted official brand assets are verified. Locally generated initials are neutral placeholders, not company logos. Catalogue membership is not proof of a real trade or trading eligibility.",
  };
}
