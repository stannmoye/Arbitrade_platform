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
  ["Romania", "RO", 13], ["Czechia", "CZ", 13], ["Portugal", "PT", 13], ["Hong Kong", "HK", 13], ["Peru", "PE", 13],
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
  const expected = new Map([...POOL_A, ...POOL_B].map(([name, code, target]) => [code, { name, target }]));
  const counts = new Map(), ids = new Set(), names = new Set(), issuerNames = new Map(), listings = new Set(), paths = new Set(), logoHashes = new Map();
  for (const [index, company] of data.companies.entries()) {
    const label = "record " + (index + 1);
    for (const key of ["id", "name", "ticker", "symbol", "exchangeCode", "countryCode", "countryName", "logoUrl", "logoSourceUrl", "logoSourceSlug", "logoSha256"]) {
      if (typeof company[key] !== "string" || !company[key].trim()) fail(label + ": missing " + key);
    }
    if (ids.has(company.id)) fail(label + ": duplicate ID"); ids.add(company.id);
    const normalizedName = String(company.name).normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const issuerMatches = issuerNames.get(normalizedName) ?? [];
    issuerMatches.push({ id: company.id, name: company.name, countryCode: company.countryCode, exchangeCode: company.exchangeCode, symbol: company.symbol });
    issuerNames.set(normalizedName, issuerMatches);
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
    if (company.recordCompleteness !== "incomplete") fail(label + ": records using neutral placeholders must be marked incomplete until source verification and official brand assets are cleared.");
    if (!company.logoUrl.startsWith("/assets/company-logos/") || company.logoUrl.includes("://")) fail(label + ": logo must be referenced locally.");
    if (company.logoSourceName === "Neutral company-reference placeholder") {
      if (company.logoSourceSlug !== "neutral-placeholder" || company.logoSourceUrl !== "internal://neutral-company-reference-placeholder") fail(label + ": invalid neutral placeholder source metadata.");
    } else if (String(company.logoSourceName ?? "").startsWith("Simple Icons")) {
      if (!/^[a-z0-9_-]+$/.test(company.logoSourceSlug) || !/^https:\/\//.test(company.logoSourceUrl) || company.logoLicense !== "CC0-1.0") fail(label + ": invalid Simple Icons source/license metadata.");
    } else if (/^Official company website (declared-favicon|apple-touch-icon|standard-favicon|logo-labelled-image|declared-svg-icon)$/.test(company.logoSourceName)) {
      if (!/^https:\/\//i.test(String(company.logoSourceUrl ?? "")) || !/^https:\/\//i.test(String(company.logoHomepageUrl ?? ""))) fail(label + ": official-site logo source requires HTTPS source and homepage URLs.");
      if (!/^official-website-[a-z0-9-]+$/.test(company.logoSourceSlug)) fail(label + ": invalid official-site source slug.");
    } else if (company.logoSourceName === "Wikimedia Commons") {
      const license = String(company.logoLicense ?? "").trim();
      const reusableLicense = /^CC0(?:[ -]1\.0)?$/i.test(license)
        || /^CC BY(?:-SA)? (?:3\.0|4\.0)$/i.test(license)
        || /^Public domain$/i.test(license);
      if (!/^q\d+$/i.test(company.logoSourceSlug)
        || !/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/i.test(company.logoSourceUrl)
        || !/^https?:\/\//i.test(String(company.logoLicenseUrl ?? ""))
        || !reusableLicense) fail(label + ": invalid Wikimedia Commons source/license metadata.");
      if (/^CC BY(?:-SA)? /i.test(license) && !String(company.logoAttribution ?? "").trim()) {
        fail(label + ": attribution is required for the recorded Creative Commons licence.");
      }
    } else fail(label + ": logo source is not on the explicit allowlist.");
    if (!/^[a-f0-9]{64}$/i.test(company.logoSha256)) fail(label + ": missing or invalid SHA-256 for logo asset.");
    if (!/^[a-z0-9-]+\.(svg|png|webp|ico|jpg|jpeg)$/.test(company.logoUrl.split("/").at(-1))) fail(label + ": unexpected logo asset path.");
    if (paths.has(company.logoUrl)) fail(label + ": duplicate local logo path"); paths.add(company.logoUrl);
    logoHashes.set(company.logoUrl, company.logoSha256.toLowerCase());
  }
  const duplicateIssuerNames = [...issuerNames.values()].filter((matches) => matches.length > 1);
  if (duplicateIssuerNames.length) {
    for (const matches of duplicateIssuerNames) console.error("[company-logos] DUPLICATE ISSUER BLOCKER: " + matches.map((item) => item.name + " (" + item.countryCode + ", " + item.exchangeCode + ":" + item.symbol + ")").join(" | "));
    fail("Found " + duplicateIssuerNames.length + " normalized issuer-name groups duplicated across countries; catalogue must contain 1,000 distinct companies.");
  }
  const poolACount = [...POOL_A].reduce((total, [, code]) => total + (counts.get(code) ?? 0), 0);
  const poolBCount = [...POOL_B].reduce((total, [, code]) => total + (counts.get(code) ?? 0), 0);
  if (poolACount + poolBCount !== 1000) fail("Pool totals do not add up to 1,000.");
  if (data.targetDistribution?.poolA?.total !== poolACount || data.targetDistribution?.poolB?.total !== poolBCount) fail("Catalogue pool distribution metadata is inconsistent.");
  const reported = data.targetDistribution?.countsByCountry ?? {};
  for (const [name, code, target] of [...POOL_A, ...POOL_B]) {
    const canonicalName = code === "US" ? "United States" : code === "GB" ? "United Kingdom" : name;
    const actual = counts.get(code) ?? 0;
    if (actual !== target) fail("Country allocation mismatch for " + canonicalName + ": expected " + target + ", found " + actual + ".");
    if ((reported[canonicalName] ?? 0) !== actual) fail("Reported country count does not match: " + canonicalName);
  }
  if (Object.values(reported).reduce((total, count) => total + Number(count || 0), 0) !== 1000) fail("Reported country counts do not add up to 1,000.");
  const allLogoFiles = (await readdir(LOGO_DIR)).filter((name) => !name.startsWith("."));
  if (allLogoFiles.length !== 1000) fail("Expected exactly 1,000 cached logo files; found " + allLogoFiles.length + ".");
  if (allLogoFiles.some((name) => !/^[a-z0-9-]+\.(svg|png|webp|ico|jpg|jpeg)$/.test(name))) fail("Logo directory contains an unexpected image format or unsafe filename.");
  for (const relativePath of paths) {
    const filePath = join(ROOT, "client/public", relativePath.replace(/^\/+/, ""));
    const info = await stat(filePath);
    if (!info.isFile() || info.size <= 0 || info.size > 200 * 1024) fail("Logo file has invalid size: " + relativePath + " (" + info.size + " bytes)");
    const company = data.companies.find((entry) => entry.logoUrl === relativePath);
    if (!company || (company.logoBytes != null && company.logoBytes !== info.size)) fail("Logo byte-size metadata mismatch: " + relativePath);
    const bytes = await readFile(filePath);
    const body = bytes.toString("utf8");
    if (createHash("sha256").update(bytes).digest("hex").toLowerCase() !== logoHashes.get(relativePath)) fail("Logo SHA-256 mismatch: " + relativePath);
    const extension = relativePath.split(".").at(-1).toLowerCase();
    if (extension === "svg") {
      if (!/<svg\b/i.test(body) || !/<\/svg\s*>/i.test(body) || /<script\b|<foreignObject\b|javascript\s*:/i.test(body)) fail("Logo is not a safe standalone SVG: " + relativePath);
    } else {
      const validRaster = extension === "png" ? bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
        : extension === "jpg" || extension === "jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : extension === "webp" ? body.slice(0, 4) === "RIFF" && body.slice(8, 12) === "WEBP"
        : extension === "ico" ? bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0
        : false;
      if (!validRaster) fail("Logo file content does not match its image extension: " + relativePath);
    }
  }
  if (!/^[a-f0-9]{40}$/i.test(data.source?.sourceCommit ?? "")) fail("Company identity source snapshot commit is not pinned.");
  const cc0SourcePolicy = data.logoSource?.explicitCc0Only === true && String(data.logoSource?.providerName ?? "").includes("Simple Icons CC0-1.0");
  const wikimediaReusePolicy = data.logoSource?.wikimediaCommonsEnabled === true
    && Array.isArray(data.logoSource?.permittedWikimediaLicenses)
    && data.logoSource.permittedWikimediaLicenses.includes("CC0")
    && data.logoSource.permittedWikimediaLicenses.includes("CC BY")
    && data.logoSource.permittedWikimediaLicenses.includes("CC BY-SA")
    && data.logoSource.permittedWikimediaLicenses.includes("Public domain");
  const officialSiteSourcePolicy = data.companies.every((company) => {
    if (!String(company.logoSourceName ?? "").startsWith("Official company website ")) return true;
    return /^https:\/\//i.test(String(company.logoSourceUrl ?? "")) && /^https:\/\//i.test(String(company.logoHomepageUrl ?? ""));
  });
  const untouchedLegacyPlaceholderState = data.logoSource?.providerName === "Locally generated neutral company-reference placeholders"
    && data.logoSource?.reusePermissionVerified === true
    && data.companies.every((company) => company.logoSourceName === "Neutral company-reference placeholder");
  if (!cc0SourcePolicy && !wikimediaReusePolicy && !officialSiteSourcePolicy && !untouchedLegacyPlaceholderState) fail("Logo source metadata does not satisfy an approved provenance policy.");
  console.log("[company-logos] STRUCTURAL PASS: 1,000 reference records across " + counts.size + " represented countries, Pool A=" + poolACount + ", Pool B=" + poolBCount + ", exactly 1,000 local image assets, no runtime logo URLs.");
  const missingCountries = [...expected.entries()].filter(([code]) => !(counts.get(code) > 0)).map(([, value]) => value.name);
  if (missingCountries.length) {
    fail("No records for replacement country allocation: " + missingCountries.join(", ") + ". Every one of the 46 configured countries must be represented.");
  }
  const placeholderCount = data.companies.filter((company) => company.logoSourceName === "Neutral company-reference placeholder").length;
  const sourcedCount = data.companies.length - placeholderCount;
  console.log("[company-logos] LOGO SOURCE COUNTS: " + sourcedCount + " sourced assets; " + placeholderCount + " neutral placeholders.");
  console.warn("[company-logos] LICENSING NOTE: official-site favicons/images have verified source URLs but may still require separate redistribution-rights review.");
  console.warn("[company-logos] LIMITATION: company identities/listing status and headquarters country remain unverified. Placeholder images are not company brand logos; logos do not establish trading eligibility or prove a transaction occurred.");
} catch (error) {
  console.error("[company-logos] FAIL: " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
