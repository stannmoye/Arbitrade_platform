#!/usr/bin/env node
/**
 * Build and import a reproducible 950-row starter catalogue from the upstream
 * global ticker reference dataset. Rows are deliberately marked "unverified":
 * the upstream CSV is a reference snapshot and does not prove live tradability.
 *
 * Usage: DATABASE_URL=... node scripts/seed-company-catalogue-950.mjs
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COUNT = 950;
const SOURCE_URL = "https://raw.githubusercontent.com/adanos-software/free-ticker-database/main/data/core_listings.csv";
const DATA_SOURCE = "Adanos Free Ticker Database (source listing status not independently verified)";
const here = path.dirname(fileURLToPath(import.meta.url));
const importer = path.join(here, "import-listed-companies.mjs");

function parseCsv(input) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.length === 0) quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); if (row.some(v => v.trim())) rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (quoted) throw new Error("Upstream CSV has an unterminated quoted field.");
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); if (row.some(v => v.trim())) rows.push(row); }
  if (rows.length < 2) throw new Error("Upstream CSV did not contain listing rows.");
  const headers = rows.shift().map(v => v.trim());
  return rows.map(values => Object.fromEntries(headers.map((header, i) => [header, String(values[i] ?? "").trim()])));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required when importing into the application tables.");
  process.exit(2);
}

try {
  const response = await fetch(SOURCE_URL, { headers: { "user-agent": "Arbitrade-company-catalogue-import/1.0" } });
  if (!response.ok) throw new Error(`Upstream source request failed with HTTP ${response.status}`);
  const sourceText = await response.text();
  const source = parseCsv(sourceText);
  const required = ["listing_key", "ticker", "exchange", "name", "asset_type", "stock_sector", "country", "country_code"];
  for (const field of required) if (!(field in source[0])) throw new Error(`Upstream schema changed: missing ${field}`);

  const unique = new Map();
  for (const row of source) {
    if (row.asset_type.toLowerCase() !== "stock") continue;
    if (!row.listing_key || !row.ticker || !row.exchange || !row.name || !/^[A-Z]{2}$/.test(row.country_code.toUpperCase())) continue;
    const key = `${row.exchange.toUpperCase()}:${row.ticker.toUpperCase()}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  const byCountry = new Map();
  for (const row of unique.values()) {
    const code = row.country_code.toUpperCase();
    if (!byCountry.has(code)) byCountry.set(code, []);
    byCountry.get(code).push(row);
  }
  for (const rows of byCountry.values()) rows.sort((a, b) => a.name.localeCompare(b.name) || a.ticker.localeCompare(b.ticker));

  // Round-robin countries so the starter set is not dominated by one market.
  const countryCodes = [...byCountry.keys()].sort();
  const selected = [];
  while (selected.length < COUNT) {
    let added = false;
    for (const code of countryCodes) {
      const row = byCountry.get(code).shift();
      if (!row) continue;
      selected.push(row);
      added = true;
      if (selected.length === COUNT) break;
    }
    if (!added) break;
  }
  if (selected.length < COUNT) throw new Error(`Source only yielded ${selected.length} eligible stock listings; refusing to invent rows.`);

  const now = new Date().toISOString();
  const headers = ["name", "ticker", "exchangeCode", "instrumentType", "listingStatus", "headquartersCity", "headquartersCountry", "countryCode", "sector", "providerId", "dataSource", "sourceUrl", "lastVerifiedAt"];
  const lines = [headers.join(",")];
  for (const row of selected) {
    const record = {
      name: row.name,
      ticker: row.ticker,
      exchangeCode: row.exchange,
      instrumentType: "equity",
      listingStatus: "unverified",
      headquartersCity: "",
      headquartersCountry: row.country,
      countryCode: row.country_code.toUpperCase(),
      sector: row.stock_sector,
      providerId: row.listing_key,
      dataSource: DATA_SOURCE,
      sourceUrl: SOURCE_URL,
      lastVerifiedAt: now,
    };
    lines.push(headers.map(header => csvCell(record[header])).join(","));
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "arbitrade-company-catalogue-"));
  const csvPath = path.join(tempDir, "listed-companies.csv");
  try {
    await writeFile(csvPath, lines.join("\n") + "\n", "utf8");
    console.log(`Prepared ${selected.length} unique stock listing records across ${new Set(selected.map(r => r.country_code)).size} country codes.`);
    console.log("Listing status is unverified; these records must not be treated as proof of current tradability.");
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [importer, csvPath], { stdio: "inherit", env: process.env });
      child.on("error", reject);
      child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Catalogue importer exited with code ${code}`)));
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
