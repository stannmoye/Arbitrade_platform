#!/usr/bin/env node
/** Validate the generated 1,000-company catalogue and every local SVG logo. */
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOGUE = join(ROOT, "server/data/company-catalogue-1000.json");
const LOGO_DIR = join(ROOT, "client/public/assets/company-logos");
const POOL_A = [
  ["Japan", "JP", 14], ["India", "IN", 14], ["France", "FR", 14], ["Italy", "IT", 14], ["Brazil", "BR", 14],
  ["Russia", "RU", 14], ["Mexico", "MX", 14], ["South Korea", "KR", 14], ["Spain", "ES", 14], ["Indonesia", "ID", 14],
  ["Turkey", "TR", 14], ["Netherlands", "NL", 14], ["Saudi Arabia", "SA", 14], ["Switzerland", "CH", 14], ["Poland", "PL", 14],
  ["Taiwan", "TW", 14], ["Belgium", "BE", 14], ["Sweden", "SE", 14], ["Argentina", "AR", 14], ["Ireland", "IE", 14],
  ["Thailand", "TH", 14], ["United Arab Emirates", "AE", 14], ["Israel", "IL", 14], ["Austria", "AT", 14], ["Norway", "NO", 14],
  ["Singapore", "SG", 14], ["Vietnam", "VN", 14], ["Bangladesh", "BD", 14], ["Egypt", "EG", 14], ["Philippines", "PH", 14],
  ["Malaysia", "MY", 13], ["Denmark", "DK", 13], ["South Africa", "ZA", 13], ["Finland", "FI", 13], ["Chile", "CL", 13],
  ["Romania", "RO", 13], ["Czechia", "CZ", 13], ["Portugal", "PT", 13], ["Kazakhstan", "KZ", 13], ["Peru", "PE", 13],
];
const POOL_B = [
  ["United States", "US", 75], ["United Kingdom", "GB", 75], ["Germany", "DE", 75],
  ["Australia", "AU", 75], ["Canada", "CA", 75], ["China", "CN", 75],
];
const fail = (message) => { throw new Error(message); };
try {
  const data = JSON.parse(await readFile(CATALOGUE, "utf8"));
  if (data.schemaVersion !== 1 || data.targetCount !== 1000 || data.companyCount !== 1000 || !Array.isArray(data.companies) || data.companies.length !== 1000) {
    fail("Expected a 1,000-record static company catalogue.");
  }
  const expected = new Map([...POOL_A, ...POOL_B].map(([name, code]) => [code, { name }]));
  const counts = new Map(), ids = new Set(), names = new Set(), listings = new Set(), paths = new Set(), logoHashes = new Map();
  for (const [index, company] of data.companies.entries()) {
    const label = "record " + (index + 1);
    for (const key of ["id", "name", "ticker", "symbol", "exchangeCode", "countryCode", "countryName", "logoUrl", "logoSourceUrl", "logoSourceSlug", "logoSha256"]) {
      if (typeof company[key] !== "string" || !company[key].trim()) fail(label + ": missing " + key);
    }
    if (ids.has(company.id)) fail(label + ": duplicate ID"); ids.add(company.id);
    const normalizedName = String(company.name).normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const nameKey = company.countryCode + "|" + normalizedName;
    if (names.has(nameKey)) fail(label + ": duplicate company name within country"); names.add(nameKey);
    const listing = String(company.exchangeCode).toUpperCase() + ":" + String(company.symbol).toUpperCase();
    if (listings.has(listing)) fail(label + ": duplicate exchange/symbol"); listings.add(listing);
    if (!expected.has(company.countryCode)) fail(label + ": country is outside the requested 46-country allocation");
    const expectedCountryName = company.countryCode === "US" ? "United States" : company.countryCode === "GB" ? "United Kingdom" : expected.get(company.countryCode).name;
    if (company.countryName !== expectedCountryName) fail(label + ": countryName does not match countryCode (expected " + expectedCountryName + ").");
    counts.set(company.countryCode, (counts.get(company.countryCode) ?? 0) + 1);
    if (company.listingStatus !== "unverified" || company.lastVerifiedAt !== null || company.requiresManualVerification !== true) {
      fail(label + ": source rows must remain unverified.");
    }
    if (company.instrumentType !== "Stock") fail(label + ": non-stock instrument in catalogue.");
    if (!company.logoUrl.startsWith("/assets/company-logos/") || company.logoUrl.includes("://")) fail(label + ": logo must be referenced locally.");
    if (company.logoSourceName === "Tradient Companies Logo API") {
      if (company.logoSourceUrl !== "https://logo.tradient.org/v1/" + company.logoSourceSlug + ".svg") fail(label + ": source URL does not match the recorded logo slug.");
    } else if (company.logoSourceName === "Official company website favicon") {
      if (company.logoSourceSlug !== "official-site-favicon" || !/^https?:\/\//i.test(company.logoSourceUrl)) fail(label + ": invalid official website favicon source metadata.");
    } else fail(label + ": unsupported logo source.");
    if (!/^[a-f0-9]{64}$/i.test(company.logoSha256)) fail(label + ": missing or invalid SHA-256 for logo asset.");
    if (!/^[a-z0-9-]+\.svg$/.test(company.logoUrl.split("/").at(-1))) fail(label + ": unexpected logo asset path.");
    if (paths.has(company.logoUrl)) fail(label + ": duplicate local logo path"); paths.add(company.logoUrl);
    logoHashes.set(company.logoUrl, company.logoSha256.toLowerCase());
  }
  const poolACount = [...POOL_A].reduce((total, [, code]) => total + (counts.get(code) ?? 0), 0);
  const poolBCount = [...POOL_B].reduce((total, [, code]) => total + (counts.get(code) ?? 0), 0);
  if (poolACount + poolBCount !== 1000) fail("Pool totals do not add up to 1,000.");
  if (data.targetDistribution?.poolA?.total !== poolACount || data.targetDistribution?.poolB?.total !== poolBCount) fail("Catalogue pool distribution metadata is inconsistent.");
  const reported = data.targetDistribution?.countsByCountry ?? {};
  for (const [name, code] of [...POOL_A, ...POOL_B]) {
    const canonicalName = code === "US" ? "United States" : code === "GB" ? "United Kingdom" : name;
    const actual = counts.get(code) ?? 0;
    if ((reported[canonicalName] ?? 0) !== actual) fail("Reported country count does not match: " + canonicalName);
  }
  if (Object.values(reported).reduce((total, count) => total + Number(count || 0), 0) !== 1000) fail("Reported country counts do not add up to 1,000.");
  const allLogoFiles = (await readdir(LOGO_DIR)).filter((name) => !name.startsWith("."));
  if (allLogoFiles.length !== 1000) fail("Expected exactly 1,000 cached logo files; found " + allLogoFiles.length + ".");
  if (allLogoFiles.some((name) => !/^[a-z0-9-]+\.svg$/.test(name))) fail("Logo directory contains an unexpected non-SVG or unsafe filename.");
  for (const relativePath of paths) {
    const filePath = join(ROOT, "client/public", relativePath.replace(/^\/+/, ""));
    const info = await stat(filePath);
    if (!info.isFile() || info.size <= 0 || info.size > 200 * 1024) fail("Logo file has invalid size: " + relativePath + " (" + info.size + " bytes)");
    const company = data.companies.find((entry) => entry.logoUrl === relativePath);
    if (!company || (company.logoBytes != null && company.logoBytes !== info.size)) fail("Logo byte-size metadata mismatch: " + relativePath);
    const bytes = await readFile(filePath);
    const body = bytes.toString("utf8");
    if (createHash("sha256").update(bytes).digest("hex").toLowerCase() !== logoHashes.get(relativePath)) fail("Logo SHA-256 mismatch: " + relativePath);
    if (!/<svg\b/i.test(body) || !/<\/svg\s*>/i.test(body) || /<script\b|<foreignObject\b|javascript\s*:/i.test(body)) fail("Logo is not a safe standalone SVG: " + relativePath);
  }
  if (!/^[a-f0-9]{40}$/i.test(data.source?.sourceCommit ?? "") || !/^[a-f0-9]{40}$/i.test(data.logoSource?.repositoryCommit ?? "")) fail("Source snapshot commits are not pinned.");
  const reported = data.targetDistribution?.countsByCountry ?? {};
  console.log("[company-logos] PASS: 1,000 records across " + counts.size + " requested countries, Pool A=" + poolACount + ", Pool B=" + poolBCount + ", exactly 1,000 local SVGs, no runtime logo URLs.");
} catch (error) {
  console.error("[company-logos] FAIL: " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
