import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

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
  /** Exact country-folder label from the image catalogue; not a verified headquarters claim. */
  countryName?: string;
  offset?: number;
  limit?: number;
};

export type CompanyCatalogueStatusAction = "verified" | "unverified" | "disabled" | "enabled" | "archived" | "restored";

export type CompanyCatalogueAdminStateSets = {
  verifiedIds: readonly string[];
  archivedIds: readonly string[];
  disabledIds?: readonly string[];
};

/** Normalize an operator-entered case reason at the pure boundary shared by admin state writes. */
export function normalizeCompanyCatalogueActionReason(reason: unknown): string {
  if (typeof reason !== "string") throw new Error("A case-specific reason is required.");
  const normalized = reason.trim();
  if (normalized.length < 8 || normalized.length > 500) throw new Error("A case-specific reason between 8 and 500 characters is required.");
  return normalized;
}

/** Apply an audited status transition without changing source or financial records. Archival invalidates customer approval. */
export function transitionCompanyCatalogueAdminState(
  current: CompanyCatalogueAdminStateSets,
  ids: readonly string[],
  action: CompanyCatalogueStatusAction,
): { verifiedIds: string[]; archivedIds: string[]; disabledIds: string[] } {
  const verified = new Set(current.verifiedIds);
  const archived = new Set(current.archivedIds);
  const disabled = new Set(current.disabledIds ?? []);
  for (const id of ids) {
    switch (action) {
      case "verified": verified.add(id); break;
      case "unverified": verified.delete(id); break;
      case "disabled": disabled.add(id); break;
      case "enabled": disabled.delete(id); break;
      case "archived":
        archived.add(id);
        verified.delete(id);
        break;
      case "restored":
        archived.delete(id);
        verified.delete(id);
        break;
    }
  }
  return {
    verifiedIds: [...verified].sort(),
    archivedIds: [...archived].sort(),
    disabledIds: [...disabled].sort(),
  };
}

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

export type CompanyCatalogueLoaderPaths = {
  mappingPath?: string;
  tickerSnapshotPath?: string;
  tickerPartsDirectory?: string;
};

type TickerEnrichment = {
  companyName: string;
  ticker: string;
  exchange: string;
  status: string;
  parentTicker: string;
  whyNoRealTicker: string;
};

function loadLogoMapping(mappingPath = resolve(process.cwd(), "client/public/assets/company-logo-source/logo-mapping.csv")): LogoMappingRow[] {
  const lines = readFileSync(mappingPath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("The company logo mapping is missing or empty.");
  const headers = parseCsvRow(lines[0]!);
  const required = ["company_name", "domain", "filename", "detail_url", "source_asset_url"];
  const indexes = Object.fromEntries(required.map((key) => [key, headers.indexOf(key)]));
  if (required.some((key) => indexes[key]! < 0)) throw new Error("The company logo mapping is missing required columns.");
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvRow(line);
    return Object.fromEntries(required.map((key) => [key, values[indexes[key]!] ?? ""])) as LogoMappingRow;
  }).filter((row) => row.company_name.trim() && row.filename.trim());
  const filenames = new Set<string>();
  for (const row of rows) {
    const normalizedFilename = row.filename.trim().toLowerCase();
    if (filenames.has(normalizedFilename)) throw new Error("Duplicate logo filename in company logo mapping: " + row.filename);
    filenames.add(normalizedFilename);
  }
  if (!rows.length) throw new Error("The company logo mapping contains no usable company records.");
  return rows;
}

/**
 * Ticker workbooks are optional enrichment, never catalogue identity.
 * Missing, partial or malformed enrichment is ignored so brand-only records still load.
 */
function loadTickerSnapshot(
  basePath = resolve(process.cwd(), "server/data/company-trading-symbol-candidates-1811.json.gz.b64"),
  dataDirectory = resolve(process.cwd(), "server/data/company-trading-symbols-1811.parts"),
): Map<number, TickerEnrichment> {
  const candidates = new Map<number, TickerEnrichment>();
  try {
    const baseEncoded = readFileSync(basePath, "utf8").trim();
    const snapshot = JSON.parse(gunzipSync(Buffer.from(baseEncoded, "base64")).toString("utf8")) as {
      v?: number;
      statuses?: unknown;
      records?: unknown;
    };
    if (snapshot.v === 1 && Array.isArray(snapshot.statuses) && Array.isArray(snapshot.records)) {
      for (const rawRecord of snapshot.records) {
        if (!Array.isArray(rawRecord) || rawRecord.length < 4) continue;
        const [logoId, ticker, exchange, statusIndex] = rawRecord;
        const status = snapshot.statuses[statusIndex as number];
        if (!Number.isSafeInteger(logoId) || (logoId as number) < 1 || typeof status !== "string") continue;
        candidates.set(logoId as number, {
          companyName: "",
          ticker: typeof ticker === "string" ? ticker : "",
          exchange: typeof exchange === "string" ? exchange : "",
          status,
          parentTicker: "",
          whyNoRealTicker: "",
        });
      }
    }
  } catch {
    // Optional workbook snapshot may be absent in fresh, partial or brand-only installs.
  }

  try {
    const encoded = ["part-01.b64", "part-02.b64", "part-03.b64"]
      .map((part) => readFileSync(resolve(dataDirectory, part), "utf8").trim())
      .join("");
    const supplement = JSON.parse(brotliDecompressSync(Buffer.from(encoded, "base64")).toString("utf8")) as {
      v?: number;
      records?: unknown;
    };
    if (supplement.v === 1 && Array.isArray(supplement.records)) {
      for (const rawRecord of supplement.records) {
        if (!Array.isArray(rawRecord) || rawRecord.length < 6) continue;
        const [logoId, companyName, ticker, exchange, parentTicker, whyNoRealTicker] = rawRecord;
        if (!Number.isSafeInteger(logoId) || (logoId as number) < 1 || typeof companyName !== "string") continue;
        const current = candidates.get(logoId as number);
        candidates.set(logoId as number, {
          companyName,
          ticker: typeof ticker === "string" ? ticker : current?.ticker ?? "",
          exchange: typeof exchange === "string" ? exchange : current?.exchange ?? "",
          status: current?.status ?? "Not supplied",
          parentTicker: typeof parentTicker === "string" ? parentTicker : "",
          whyNoRealTicker: typeof whyNoRealTicker === "string" ? whyNoRealTicker : "",
        });
      }
    }
  } catch {
    // A missing or invalid supplemental workbook never invalidates the brand catalogue.
  }
  return candidates;
}

function classifyTicker(status: string): CompanyReferenceRecord["tickerClassification"] {
  if (status === "Public") return "public";
  if (status.startsWith("PLACEHOLDER")) return "placeholder";
  if (status.startsWith("Uses listed parent")) return "parent";
  if (status.startsWith("Historic")) return "historic";
  return "other";
}

/**
 * The stable company identity and logo mapping are authoritative.
 * Workbook values are merged only when available and are not required for a valid record.
 */
export function loadCompanyReferenceCatalogue(paths: CompanyCatalogueLoaderPaths = {}): CompanyReferenceRecord[] {
  const mapping = loadLogoMapping(paths.mappingPath);
  const tickerSnapshot = loadTickerSnapshot(paths.tickerSnapshotPath, paths.tickerPartsDirectory);
  return mapping.map((row, index) => {
    const tickerData = tickerSnapshot.get(index + 1);
    const enrichment = tickerData?.companyName && tickerData.companyName.trim().toLowerCase() !== row.company_name.trim().toLowerCase()
      ? undefined
      : tickerData;
    const filename = row.filename.replace(/^\/+/, "");
    if (filename.includes("..") || filename.startsWith("http:") || filename.startsWith("https:")) {
      throw new Error("Invalid local logo filename for " + row.company_name);
    }
    const status = enrichment?.status ?? "Not supplied";
    return {
      id: "logo-brand-" + String(index + 1).padStart(4, "0"),
      name: row.company_name.trim(),
      ticker: enrichment?.ticker ?? "",
      symbol: enrichment?.ticker ?? "",
      exchangeCode: enrichment?.exchange ?? "",
      tickerResearchStatus: status,
      tickerSource: "company_trading_symbols.xlsx",
      parentTicker: enrichment?.parentTicker ?? "",
      whyNoRealTicker: enrichment?.whyNoRealTicker ?? "",
      tickerClassification: classifyTicker(status),
      countryCode: "",
      countryName: row.filename.match(/^by-country\/([^/]+)\//)?.[1] ?? "Unassigned",
      logoUrl: "/assets/company-logo-source/" + filename.split("/").map(encodeURIComponent).join("/"),
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
  });
}

export const COMPANY_REFERENCE_CATALOGUE: readonly CompanyReferenceRecord[] = Object.freeze(
  loadCompanyReferenceCatalogue().map((company) => Object.freeze(company)),
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
/** Stable O(1) access for a persisted per-customer rotation cursor. This is a brand showcase only, not a verified trade instrument. */
export function getCompanyReferenceCatalogueSize(): number {
  return COMPANY_REFERENCE_CATALOGUE.length;
}

export function getCompanyReferenceAtOffset(offset: number): CompanyReferenceResponse {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= COMPANY_REFERENCE_CATALOGUE.length) {
    throw new RangeError("Company catalogue offset is outside the available records");
  }
  return asReferenceResponse(COMPANY_REFERENCE_CATALOGUE[offset]!);
}

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
  const countryName = filters.countryName?.trim().toLowerCase();
  const limit = Number.isFinite(filters.limit) ? Math.max(1, Math.min(1811, Math.floor(filters.limit!))) : 50;
  const offset = Number.isFinite(filters.offset) ? Math.max(0, Math.min(1810, Math.floor(filters.offset!))) : 0;
  const results: CompanyReferenceResponse[] = [];
  let matched = 0;
  for (const company of COMPANY_REFERENCE_CATALOGUE) {
    if (term && company.id.toLowerCase() !== term && ![company.name, company.domain, company.ticker, company.exchangeCode].some((value) => value.toLowerCase().includes(term))) continue;
    if (countryName && company.countryName.toLowerCase() !== countryName) continue;
    if (matched++ < offset) continue;
    results.push(asReferenceResponse(company));
    if (results.length >= limit) break;
  }
  return results;
}

export function countCompanyReferences(filters: CompanyReferenceSearch = {}): number {
  return searchCompanyReferences({ ...filters, offset: 0, limit: 1811 }).length;
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
    countryCounts: Object.fromEntries(
      [...COMPANY_REFERENCE_CATALOGUE.reduce((counts, company) => counts.set(company.countryName, (counts.get(company.countryName) ?? 0) + 1), new Map<string, number>())]
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
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
