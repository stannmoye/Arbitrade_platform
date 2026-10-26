import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type CompanyReferenceRecord = {
  id: string;
  name: string;
  ticker: string;
  symbol: string;
  exchangeCode: string;
  countryCode: string;
  countryName: string;
  logoUrl: string;
  domain: string;
  logoSourceName: "Logo.dev";
  logoSourceUrl: string;
  listingStatus: "unverified";
  lastVerifiedAt: null;
  requiresManualVerification: true;
  sourceConfidence: "brand-name-only";
  sector: null;
  headquartersCountry: null;
  instrumentType: "Brand";
  recordCompleteness: "brand-only";
};

type LogoMappingRow = {
  company_name: string;
  domain: string;
  filename: string;
  detail_url: string;
  source_asset_url: string;
};

export type CompanyReferenceSearch = {
  search?: string;
  countryCode?: string;
  limit?: number;
};

export type CompanyReferenceResponse = CompanyReferenceRecord & {
  referenceOnly: true;
  logoReusePermissionVerified: false;
  eligibleForVerifiedTradeRotation: false;
};

function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

function loadLogoMapping(): LogoMappingRow[] {
  const mappingPath = resolve(process.cwd(), "client/public/assets/company-logo-source/logo-mapping.csv");
  const lines = readFileSync(mappingPath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("The new company logo mapping is missing or empty.");
  const headers = parseCsvRow(lines[0]!);
  const required = ["company_name", "domain", "filename", "detail_url", "source_asset_url"];
  const indexes = Object.fromEntries(required.map((key) => [key, headers.indexOf(key)]));
  if (required.some((key) => indexes[key]! < 0)) throw new Error("The new company logo mapping is missing required columns.");
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvRow(line);
    return Object.fromEntries(required.map((key) => [key, values[indexes[key]!] ?? ""])) as LogoMappingRow;
  }).filter((row) => row.company_name && row.filename);
  const names = new Set<string>();
  for (const row of rows) {
    const normalized = row.company_name.trim().toLowerCase();
    if (names.has(normalized)) throw new Error(`Duplicate company name in new logo mapping: ${row.company_name}`);
    names.add(normalized);
  }
  if (rows.length !== 1811) throw new Error(`Expected 1,811 mapped company logos, found ${rows.length}.`);
  return rows;
}

const mapping = loadLogoMapping();

function toReference(row: LogoMappingRow, index: number): CompanyReferenceRecord {
  const filename = row.filename.replace(/^\/+/, "");
  if (filename.includes("..") || filename.startsWith("http:") || filename.startsWith("https:")) {
    throw new Error(`Invalid local logo filename for ${row.company_name}`);
  }
  return {
    id: `logo-brand-${String(index + 1).padStart(4, "0")}`,
    name: row.company_name.trim(),
    ticker: "",
    symbol: "",
    exchangeCode: "",
    countryCode: "",
    countryName: "",
    logoUrl: `/assets/company-logo-source/${filename.split("/").map(encodeURIComponent).join("/")}`,
    domain: row.domain,
    logoSourceName: "Logo.dev",
    logoSourceUrl: row.detail_url || row.source_asset_url,
    listingStatus: "unverified",
    lastVerifiedAt: null,
    requiresManualVerification: true,
    sourceConfidence: "brand-name-only",
    sector: null,
    headquartersCountry: null,
    instrumentType: "Brand",
    recordCompleteness: "brand-only",
  };
}

export const COMPANY_REFERENCE_CATALOGUE: readonly CompanyReferenceRecord[] = Object.freeze(
  mapping.map((row, index) => Object.freeze(toReference(row, index))),
);
const byId = new Map(COMPANY_REFERENCE_CATALOGUE.map((company) => [company.id, company]));

function asReferenceResponse(company: CompanyReferenceRecord): CompanyReferenceResponse {
  return {
    ...company,
    referenceOnly: true,
    logoReusePermissionVerified: false,
    eligibleForVerifiedTradeRotation: false,
  };
}

export function getCompanyReferenceById(id: string): CompanyReferenceResponse | undefined {
  const company = byId.get(id);
  return company ? asReferenceResponse(company) : undefined;
}

/** Random informational brand spotlight only; this is not a security listing or trade record. */
export function getRandomCompanyReference(
  random: () => number = Math.random,
  excludeIds: readonly string[] = [],
): CompanyReferenceResponse {
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new Error("Random source must return a value in [0, 1)");
  }
  const excluded = new Set(excludeIds);
  const alternatives = COMPANY_REFERENCE_CATALOGUE.filter((company) => !excluded.has(company.id));
  const candidates = alternatives.length ? alternatives : COMPANY_REFERENCE_CATALOGUE;
  return asReferenceResponse(candidates[Math.floor(sample * candidates.length)]!);
}

/** The logo archive contains no exchange symbols; do not guess ticker matches. */
export function findCompanyReferencesBySymbol(_symbol: string): CompanyReferenceResponse[] {
  return [];
}

export function searchCompanyReferences(filters: CompanyReferenceSearch = {}): CompanyReferenceResponse[] {
  const term = filters.search?.trim().toLowerCase();
  const limit = Number.isFinite(filters.limit) ? Math.max(1, Math.min(100, Math.floor(filters.limit!))) : 50;
  if (filters.countryCode?.trim()) return [];
  const results: CompanyReferenceResponse[] = [];
  for (const company of COMPANY_REFERENCE_CATALOGUE) {
    if (term && ![company.name, company.domain].some((value) => value.toLowerCase().includes(term))) continue;
    results.push(asReferenceResponse(company));
    if (results.length >= limit) break;
  }
  return results;
}

export function getCompanyReferenceSummary() {
  return {
    total: COMPANY_REFERENCE_CATALOGUE.length,
    incompleteRecords: COMPANY_REFERENCE_CATALOGUE.length,
    unverified: COMPANY_REFERENCE_CATALOGUE.length,
    verifiedActive: 0,
    localLogoPaths: COMPANY_REFERENCE_CATALOGUE.filter((company) => company.logoUrl.startsWith("/assets/company-logo-source/")).length,
    logoReusePermissionVerified: 0,
    eligibleForVerifiedTradeRotation: 0,
    generatedAt: null,
    countryCounts: {},
    dataLimitations: [
      "The new logo archive contains company names, domains, and logos only.",
      "Ticker symbols, exchange codes, and company countries are not supplied by this archive.",
      "Brand-logo redistribution and commercial-use terms must be reviewed with Logo.dev.",
    ],
    sourceProvider: null,
    logoProvider: "Logo.dev",
    note: "Brand-only reference data. Not a verified securities catalogue and not eligible for trade execution.",
  };
}
