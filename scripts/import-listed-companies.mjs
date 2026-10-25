#!/usr/bin/env node
/**
 * Import company records from a CSV export supplied by an approved/licensed data source.
 *
 * Required headers:
 * name,ticker,exchangeCode,instrumentType,listingStatus,headquartersCity,
 * headquartersCountry,countryCode,sector,providerId,dataSource,sourceUrl,lastVerifiedAt
 *
 * This script intentionally does not download or invent company records. Obtain the
 * export under the provider's terms and retain the source/provenance for every row.
 * Usage: DATABASE_URL=... node scripts/import-listed-companies.mjs /secure/path/listed-companies.csv
 */
import fs from "node:fs";
import { createPool } from "mysql2/promise";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/import-listed-companies.mjs <licensed-company-export.csv>");
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(2);
}

const REQUIRED = ["name", "ticker", "exchangeCode", "instrumentType", "listingStatus", "countryCode", "dataSource", "lastVerifiedAt"];
const ALLOWED_STATUSES = new Set(["active", "suspended", "delisted", "unverified"]);
const ALLOWED_TYPES = new Set(["equity", "adr", "reit", "fund", "other"]);

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.length === 0) quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); if (row.some(v => v.trim())) rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); if (row.some(v => v.trim())) rows.push(row); }
  if (rows.length < 2) throw new Error("CSV must contain a header and at least one data row.");
  const headers = rows.shift().map(h => h.trim());
  if (new Set(headers).size !== headers.length) throw new Error("CSV contains duplicate headers.");
  const missing = REQUIRED.filter(h => !headers.includes(h));
  if (missing.length) throw new Error(`Missing required CSV headers: ${missing.join(", ")}`);
  return rows.map((values, index) => Object.fromEntries(headers.map((h, i) => [h, String(values[i] ?? "").trim()])))
    .map((record, index) => ({ ...record, _row: index + 2 }));
}

function validate(record) {
  const errors = [];
  if (!record.name || record.name.length > 160) errors.push("name must be 1–160 characters");
  if (!/^[A-Za-z0-9.\-_^]{1,32}$/.test(record.ticker)) errors.push("ticker format is invalid");
  if (!/^[A-Za-z0-9.\-_]{1,32}$/.test(record.exchangeCode)) errors.push("exchangeCode format is invalid");
  if (!ALLOWED_TYPES.has(record.instrumentType)) errors.push("instrumentType is not allowed");
  if (!ALLOWED_STATUSES.has(record.listingStatus)) errors.push("listingStatus is not allowed");
  if (!/^[A-Z]{2}$/.test(record.countryCode)) errors.push("countryCode must be ISO alpha-2 uppercase");
  if (!record.dataSource || record.dataSource.length > 160) errors.push("dataSource is required");
  if (!record.lastVerifiedAt || Number.isNaN(Date.parse(record.lastVerifiedAt))) errors.push("lastVerifiedAt must be a valid date");
  if (record.listingStatus === "active" && !record.providerId) errors.push("active records require a providerId for provenance");
  if (record.sourceUrl && !/^https:\/\//i.test(record.sourceUrl)) errors.push("sourceUrl must use HTTPS");
  return errors;
}

const records = parseCsv(fs.readFileSync(inputPath, "utf8"));
const errors = [];
const seen = new Set();
for (const record of records) {
  const key = `${record.exchangeCode.toUpperCase()}:${record.ticker.toUpperCase()}`;
  if (seen.has(key)) errors.push(`row ${record._row}: duplicate exchange/ticker ${key}`);
  seen.add(key);
  const rowErrors = validate(record);
  for (const error of rowErrors) errors.push(`row ${record._row}: ${error}`);
}
if (errors.length) {
  console.error(`Rejected ${errors.length} validation issue(s); database was not changed.`);
  for (const error of errors.slice(0, 100)) console.error(`- ${error}`);
  process.exit(1);
}

const url = new URL(process.env.DATABASE_URL);
const pool = createPool({
  host: url.hostname, port: Number(url.port || 3306),
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.slice(1)),
  ssl: url.searchParams.get("ssl") ? JSON.parse(url.searchParams.get("ssl")) : undefined,
  connectionLimit: 2,
});
const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  let inserted = 0, updated = 0;
  for (const record of records) {
    const values = [
      record.name, record.name, record.ticker.toUpperCase(), record.exchangeCode.toUpperCase(),
      record.instrumentType, record.listingStatus, record.headquartersCity || null,
      record.headquartersCountry || null, record.countryCode, record.sector || null,
      record.providerId || null, record.dataSource, record.sourceUrl || null,
      new Date(record.lastVerifiedAt),
    ];
    const [result] = await connection.execute(
      `INSERT INTO companies
        (name, logoUrl, ticker, exchangeCode, instrumentType, listingStatus, headquartersCity,
         headquartersCountry, countryCode, sector, providerId, dataSource, sourceUrl, lastVerifiedAt, status)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name=VALUES(name), ticker=VALUES(ticker), instrumentType=VALUES(instrumentType),
         listingStatus=VALUES(listingStatus), headquartersCity=VALUES(headquartersCity),
         headquartersCountry=VALUES(headquartersCountry), countryCode=VALUES(countryCode),
         sector=VALUES(sector), dataSource=VALUES(dataSource), sourceUrl=VALUES(sourceUrl),
         lastVerifiedAt=VALUES(lastVerifiedAt), status=IF(VALUES(listingStatus)='active','active','disabled')`,
      [values[0], values[2], values[3], values[4], values[5], values[6], values[7], values[8], values[9], values[10], values[11], values[12], values[13], record.listingStatus === "active" ? "active" : "disabled"],
    );
    if (result.affectedRows === 1) inserted++;
    else updated++;
  }
  await connection.commit();
  const [summary] = await connection.query(
    "SELECT COUNT(*) AS total, SUM(listingStatus='active' AND lastVerifiedAt >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 180 DAY)) AS verifiedActive FROM companies WHERE ticker IS NOT NULL",
  );
  console.log(JSON.stringify({ importedRows: records.length, insertedOrChanged: inserted, updatedOrDuplicate: updated, catalogue: summary[0] }, null, 2));
} catch (error) {
  await connection.rollback();
  console.error("Import failed; transaction rolled back:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  connection.release();
  await pool.end();
}
