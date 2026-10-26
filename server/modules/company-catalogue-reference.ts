import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { brotliDecompressSync } from "node:zlib";

export type CompanyReferenceRecord = {
  id: string;
  name: string;
  ticker: string;
  symbol: string;
  exchangeCode: string;
  tickerResearchStatus: string;
  tickerSource: "company_trading_symbols.xlsx";
  parentTicker: string;
  whyNoRealTicker: string;
  tickerClassification: "public" | "parent" | "historic" | "placeholder" | "other";
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

type TickerSnapshot = {
  v: number;
  n: number;
  source: string;
  statuses: string[];
  records: Array<[number, string, string, string, number, string, string]>;
};

function loadTickerSnapshot(): Map<number, { companyName: string; ticker: string; exchange: string; status: string; parentTicker: string; whyNoRealTicker: string }> {
  const dataDirectory = resolve(process.cwd(), "server/data/company-trading-symbols-1811.parts");
  const encoded = ["part-01.b64", "part-02.b64", "part-03.b64", "part-04.b64"]
    .map((part) => readFileSync(resolve(dataDirectory, part), "utf8").trim())
    .join("");
  const snapshot = JSON.parse(brotliDecompressSync(Buffer.from(encoded, "base64")).toString("utf8")) as TickerSnapshot;
  if (snapshot.v !== 2 || snapshot.n !== 1811 || snapshot.records.length !== 1811 || !Array.isArray(snapshot.statuses)) {
    throw new Error("The 1,811-company trading-symbol snapshot has an invalid schema or record count.");
  }
  const candidates = new Map<number, { companyName: string; ticker: string; exchange: string; status: string; parentTicker: string; whyNoRealTicker: string }>();
  const statusCounts = new Map<string, number>();
  for (const record of snapshot.records) {
    const [logoId, companyName, ticker, exchange, statusIndex, parentTicker, whyNoRealTicker] = record;
    const status = snapshot.statuses[statusIndex];
    if (!Number.isInteger(logoId) || logoId < 1 || logoId > 1811 || candidates.has(logoId) || !status || !companyName) {
      throw new Error("The trading-symbol snapshot contains an invalid or duplicate logo ID/status.");
    }
    if (!ticker || !exchange) throw new Error(`Supplied ticker/code and exchange fields must be preserved for logo ID ${logoId}.`);
    candidates.set(logoId, { companyName, ticker, exchange, status, parentTicker, whyNoRealTicker });
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  }
  const expected = new Map([
    ["Public", 814],
    ["PLACEHOLDER - invented code, not a real ticker", 637],
    ["Uses listed parent's ticker", 265],
    ["Historic ticker (no longer trading / delisted)", 95],
  ]);
  if (statusCounts.size !== expected.size || [...expected].some(([status, count]) => statusCounts.get(status) !== count)) {
    throw new Error("The trading-symbol snapshot does not preserve all expected workbook statuses.");
  }
  return candidates;
}

const mapping = loadLogoMapping();
const tickerSnapshot = loadTickerSnapshot();

function toReference(row: LogoMappingRow, index: number): CompanyReferenceRecord {
  const tickerData = tickerSnapshot.get(index + 1);
  if (!tickerData) throw new Error(`Missing ticker snapshot row for logo ID ${index + 1}.`);
  if (tickerData.companyName.trim().toLowerCase() !== row.company_name.trim().toLowerCase()) {
    throw new Error(`Company-name/Logo ID alignment mismatch for logo ID ${index + 1}: ${row.company_name} vs ${tickerData.companyName}.`);
  }
  const filename = row.filename.replace(/^\/+/, "");
  if (filename.includes("..") || filename.startsWith("http:") || filename.startsWith("https:")) {
    throw new Error(`Invalid local logo filename for ${row.company_name}`);
  }
  return {
    id: `logo-brand-${String(index + 1).padStart(4, "0")}`,
    name: row.company_name.trim(),
    ticker: tickerData?.ticker ?? "",
    symbol: tickerData?.ticker ?? "",
    exchangeCode: tickerData?.exchange ?? "",
    tickerResearchStatus: tickerData?.status ?? "Not supplied",
    tickerSource: "company_trading_symbols.xlsx",
    parentTicker: tickerData.parentTicker,
    whyNoRealTicker: tickerData.whyNoRealTicker,
    tickerClassification: tickerData.status === "Public" ? "public" : tickerData.status.startsWith("PLACEHOLDER") ? "placeholder" : tickerData.status.startsWith("Uses listed parent") ? "parent" : tickerData.status.startsWith("Historic") ? "historic" : "other",
    countryCode: "",
    countryName: (row.filename.match(/^by-country\/([^/]+)\//)?.[1] ?? "Unassigned"),
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

/** Finds exact symbols only among rows marked Public in the supplied workbook; never authorizes execution. */
export function findCompanyReferencesBySymbol(symbol: string): CompanyReferenceResponse[] {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) return [];
  return COMPANY_REFERENCE_CATALOGUE
    .filter((company) => company.tickerClassification === "public" && company.ticker && company.ticker.toUpperCase() === normalized)
    .map(asReferenceResponse);
}

export function searchCompanyReferences(filters: CompanyReferenceSearch = {}): CompanyReferenceResponse[] {
  const term = filters.search?.trim().toLowerCase();
  const limit = Number.isFinite(filters.limit) ? Math.max(1, Math.min(1811, Math.floor(filters.limit!))) : 50;
  const results: CompanyReferenceResponse[] = [];
  for (const company of COMPANY_REFERENCE_CATALOGUE) {
    if (term && ![company.name, company.domain, company.ticker, company.exchangeCode].some((value) => value.toLowerCase().includes(term))) continue;
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
    tickerCandidates: COMPANY_REFERENCE_CATALOGUE.filter((company) => company.tickerClassification === "public").length,
    suppliedTickerValues: COMPANY_REFERENCE_CATALOGUE.filter((company) => Boolean(company.ticker)).length,
    placeholderCodes: COMPANY_REFERENCE_CATALOGUE.filter((company) => company.tickerClassification === "placeholder").length,
    parentTickerReferences: COMPANY_REFERENCE_CATALOGUE.filter((company) => company.tickerClassification === "parent").length,
    historicalTickerReferences: COMPANY_REFERENCE_CATALOGUE.filter((company) => company.tickerClassification === "historic").length,
    verifiedActive: 0,
    localLogoPaths: COMPANY_REFERENCE_CATALOGUE.filter((company) => company.logoUrl.startsWith("/assets/company-logo-source/")).length,
    logoReusePermissionVerified: 0,
    eligibleForVerifiedTradeRotation: 0,
    generatedAt: null,
    countryCounts: {},
    dataLimitations: [
      "Ticker candidates were imported from company_trading_symbols.xlsx and are not independently verified.",
      "All ticker, exchange, status, parent-ticker, and explanatory fields from the supplied workbook are preserved for all 1,811 logo IDs.",
      "Invented placeholder codes are display-only and must never be sent to market-data or order APIs. Parent and historical ticker references retain their original classifications.",
      "All 1,811 records remain unverified and ineligible for verified trade rotation; the imported spreadsheet contains no authoritative per-row source citations.",
      "Brand-logo redistribution and commercial-use terms must be reviewed with Logo.dev.",
    ],
    sourceProvider: null,
    logoProvider: "Logo.dev",
    note: "Brand-only reference data. Not a verified securities catalogue and not eligible for trade execution.",
  };
}
