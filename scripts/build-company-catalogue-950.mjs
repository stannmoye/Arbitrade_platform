#!/usr/bin/env node
/** Rebuild the static catalogue from an immutable SEC snapshot. No DB access. */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const TARGET_COUNT = 950;
const SOURCE_COMMIT = "613c946973fb3cab27ecee35905eb5d91731f8e0";
const SOURCE_REGISTRY_COMMIT = "0755fc68a578aafcf98d095cad66a2cffd78f17e";
const SOURCE_URL = "https://raw.githubusercontent.com/VlKAS/open-tax-ledger/613c946973fb3cab27ecee35905eb5d91731f8e0/reference-data/sec-company-tickers-exchange.json";
const EXPECTED_GIT_BLOB_SHA = "c3116b277d7b4df067a136078d6895ebfc06c287";
const OFFICIAL_SOURCE_SHA256 = "e6fbad74d63540e73239f257809cf217b9d6b4fed2410691f0c8c576c9a6cf3c";
const OFFICIAL_LAST_MODIFIED = "2026-07-24T13:32:36Z";
const EXPECTED_SOURCE_ROWS = 10432;
const OUTPUT_PATH = fileURLToPath(new URL("../server/data/company-catalogue.json", import.meta.url));
const EXCHANGES = ["Nasdaq", "NYSE"];
const EXCLUDED_NAME_PATTERN = /\b(?:ETF|ETN|ETP|FUND|TRUST)\b/i;
const compare = (a, b) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
const normalizedName = (value) => String(value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function createCatalogue(data) {
  if (JSON.stringify(data.fields) !== JSON.stringify(["cik", "name", "ticker", "exchange"]) ||
      !Array.isArray(data.data) || data.data.length !== EXPECTED_SOURCE_ROWS) {
    throw new Error("Pinned SEC source has an unexpected schema or row count.");
  }
  const fields = Object.fromEntries(data.fields.map((name, index) => [name, index]));
  const grouped = new Map(), seenCik = new Set(), seenNames = new Set();
  for (const row of data.data) {
    const cik = String(row[fields.cik] ?? "").trim(), name = String(row[fields.name] ?? "").trim();
    const ticker = String(row[fields.ticker] ?? "").trim(), exchange = String(row[fields.exchange] ?? "").trim();
    if (!cik || !name || !ticker || !EXCHANGES.includes(exchange) || EXCLUDED_NAME_PATTERN.test(name)) continue;
    const normalized = normalizedName(name);
    if (!normalized || seenCik.has(cik) || seenNames.has(normalized)) continue;
    seenCik.add(cik); seenNames.add(normalized);
    if (!grouped.has(exchange)) grouped.set(exchange, []);
    grouped.get(exchange).push({ cik, name, ticker, exchange });
  }
  for (const rows of grouped.values()) rows.sort((a, b) => compare(normalizedName(a.name), normalizedName(b.name)) || compare(a.ticker, b.ticker) || compare(a.cik, b.cik));
  const exchanges = [...grouped.keys()].sort(compare), selected = [];
  while (selected.length < TARGET_COUNT) {
    let added = false;
    for (const exchange of exchanges) {
      const record = grouped.get(exchange).shift();
      if (!record) continue;
      selected.push(record); added = true;
      if (selected.length === TARGET_COUNT) break;
    }
    if (!added) break;
  }
  if (selected.length !== TARGET_COUNT) throw new Error("SEC source yielded only " + selected.length + " eligible records; refusing to fabricate entries.");
  const companies = selected.map((record) => {
    const cik = record.cik.padStart(10, "0");
    return {
      id: "sec-cik-" + cik, cik, name: record.name, ticker: record.ticker, symbol: record.ticker,
      exchangeCode: record.exchange, countryCode: "US", countryName: "United States",
      headquartersCountry: null, sector: null, logoUrl: null, instrumentType: null,
      listingStatus: "unverified", lastVerifiedAt: null, requiresManualVerification: true,
      sourceConfidence: "official_sec_reference", sourceRecordId: cik, sourceObservedAt: OFFICIAL_LAST_MODIFIED
    };
  });
  if (new Set(companies.map((c) => c.id)).size !== TARGET_COUNT ||
      new Set(companies.map((c) => normalizedName(c.name))).size !== TARGET_COUNT ||
      new Set(companies.map((c) => c.exchangeCode.toUpperCase() + ":" + c.symbol.toUpperCase())).size !== TARGET_COUNT) {
    throw new Error("Generated catalogue contains duplicate identities.");
  }
  return {
    schemaVersion: 1, generatedAt: "2026-10-25", targetCount: TARGET_COUNT, companyCount: TARGET_COUNT,
    source: {
      providerName: "U.S. Securities and Exchange Commission (SEC EDGAR)",
      sourceFilePath: "company_tickers_exchange.json", sourceFileUrl: "https://www.sec.gov/files/company_tickers_exchange.json",
      sourceSnapshotUrl: SOURCE_URL, sourceSnapshotRepository: "https://github.com/VlKAS/open-tax-ledger",
      sourceSnapshotCommit: SOURCE_COMMIT, sourceSnapshotGitBlobSha: EXPECTED_GIT_BLOB_SHA,
      sourceSnapshotAt: OFFICIAL_LAST_MODIFIED, sourceSnapshotRecordCount: EXPECTED_SOURCE_ROWS,
      sourceFields: ["cik", "name", "ticker", "exchange"], sourceOfficialPayloadSha256: OFFICIAL_SOURCE_SHA256,
      licenseName: "SEC Website Dissemination Policy", licenseUrl: "https://www.sec.gov/about/privacy-information",
      licenseStatus: "verified_open", rawRedistributionAllowed: true, derivedFactsRedistributionStatus: "allowed",
      commercialUseStatus: "allowed", attributionRequired: true,
      licenseRegistryUrl: "https://raw.githubusercontent.com/adanos-software/free-ticker-database/0755fc68a578aafcf98d095cad66a2cffd78f17e/data/masterfiles/sources.json",
      licenseRegistryCommit: SOURCE_REGISTRY_COMMIT,
      attribution: "Source: U.S. Securities and Exchange Commission, company_tickers_exchange.json.",
      selectionPolicy: "950 unique CIK/name records, round-robin across Nasdaq and NYSE; excludes blank/OTC venues and obvious ETF, ETN, ETP, fund and trust names.",
      confidence: "official_source_but_unverified_listing_status"
    },
    dataLimitations: [
      "SEC company_tickers_exchange.json maps filers to ticker/exchange associations; it is not a global security master and does not guarantee accuracy or scope.",
      "The source snapshot was last modified on 2026-07-24, so it is not a current listing-status check. All rows remain unverified.",
      "countryCode identifies the U.S. listing market, not issuer headquarters or domicile.",
      "The source does not provide dependable sector, headquarters, logo or instrument-type fields; these remain null rather than guessed.",
      "Name-pattern filtering cannot prove every selected filer is an operating company; manually review entries before company-only use."
    ],
    companies
  };
}

try {
  const response = await fetch(SOURCE_URL, { headers: { "user-agent": "Arbitrade-static-company-catalogue-builder/1.0" } });
  if (!response.ok) throw new Error("Pinned SEC source download failed with HTTP " + response.status);
  const raw = await response.text();
  const gitBlobSha = createHash("sha1").update("blob " + Buffer.byteLength(raw) + "\0" + raw, "utf8").digest("hex");
  if (gitBlobSha !== EXPECTED_GIT_BLOB_SHA) throw new Error("Pinned source Git blob SHA mismatch; refusing to build.");
  const payload = createCatalogue(JSON.parse(raw));
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log("Wrote " + TARGET_COUNT + " reference records. No database connection was opened.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
