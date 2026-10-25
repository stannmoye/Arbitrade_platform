#!/usr/bin/env node
/**
 * Enrich the existing static catalogue with explicitly CC0-1.0 Simple Icons where
 * the company name matches unambiguously. Unmatched records keep their current
 * local placeholder. This script never regenerates the catalogue or changes record IDs.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOGUE_PATH = join(ROOT, "server/data/company-catalogue-1000.json");
const LOGO_ROOT = join(ROOT, "client/public");
const SIMPLE_ICONS_VERSION = "16.35.0";
const SIMPLE_ICONS_DATA_URL = `https://raw.githubusercontent.com/simple-icons/simple-icons/${SIMPLE_ICONS_VERSION}/data/simple-icons.json`;
const SIMPLE_ICONS_RAW_ROOT = `https://raw.githubusercontent.com/simple-icons/simple-icons/${SIMPLE_ICONS_VERSION}/icons`;
const MAX_LOGO_BYTES = 200 * 1024;
const CONCURRENCY = 3;

function normalized(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const LEGAL_SUFFIXES = new Set([
  "inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited",
  "plc", "llc", "llp", "lp", "ag", "sa", "sas", "sarl", "nv", "bv", "se", "spa",
  "pte", "pty", "holdings", "holding", "group", "class", "ordinary", "depositary",
  "adr", "ads", "the",
]);

function identityKey(value) {
  const tokens = normalized(value).split(" ").filter(Boolean);
  while (tokens.length && LEGAL_SUFFIXES.has(tokens.at(-1))) tokens.pop();
  return tokens.join(" ");
}

const USER_AGENT = "Arbitrade-company-logo-cache/1.1 (https://github.com/stannmoye/Arbitrade_platform)";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchResponse(url) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "image/svg+xml,application/json,text/plain,*/*" },
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      lastError = error;
      if (attempt >= 3) break;
      await pause(500 * (attempt + 1));
      continue;
    }
    if (response.ok) return response;
    const error = new Error("HTTP " + response.status + " while fetching " + url);
    if (attempt < 3 && (response.status === 429 || response.status >= 500)) {
      lastError = error;
      await pause(500 * (attempt + 1));
      continue;
    }
    throw error;
  }
  throw lastError ?? new Error("Unknown network failure while fetching " + url);
}

async function fetchText(url) {
  return (await fetchResponse(url)).text();
}

async function fetchJson(url) {
  // Keep Wikimedia requests conservative and identify this client as required by its API guidance.
  if (/wikidata\.org|commons\.wikimedia\.org/.test(String(url))) await pause(350);
  return JSON.parse(await fetchText(url));
}

function plainMetadata(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function claimValues(entity, property) {
  return (entity?.claims?.[property] ?? [])
    .map((claim) => claim?.mainsnak?.datavalue?.value)
    .filter((value) => value != null);
}

function canonicalCommonsLicense(metadata) {
  const shortName = plainMetadata(metadata?.LicenseShortName?.value);
  const licenseUrl = plainMetadata(metadata?.LicenseUrl?.value);
  const text = (shortName + " " + licenseUrl).toLowerCase();
  if (/public domain/i.test(shortName)) {
    return { license: "Public domain", url: licenseUrl || "https://creativecommons.org/publicdomain/mark/1.0/" };
  }
  if (/creativecommons\.org\/publicdomain\/zero\/1\.0/.test(text) || /\bcc0(?:[ -]1\.0)?\b/i.test(shortName)) {
    return { license: "CC0 1.0", url: licenseUrl };
  }
  const anyVersion = shortName.match(/\b(3\.0|4\.0)\b/)?.[1];
  const saVersion = text.match(/(?:by-sa|attribution[- ]sharealike)[/ _-](3\.0|4\.0)/i)?.[1] || anyVersion;
  if (saVersion && (/creativecommons\.org\/licenses\/by-sa\//.test(text) || /creative commons attribution[- ]sharealike/i.test(shortName) || /^cc by-sa/i.test(shortName))) {
    return { license: "CC BY-SA " + saVersion, url: licenseUrl };
  }
  const byVersion = text.match(/creativecommons\.org\/licenses\/by\/(3\.0|4\.0)/i)?.[1] || anyVersion;
  if (byVersion && !/by-sa|by-nc|by-nd|noncommercial|no derivatives/i.test(text)
      && (/creativecommons\.org\/licenses\/by\//.test(text) || /^cc by(?:\s|$)/i.test(shortName) || /creative commons attribution(?![- ]share alike)/i.test(shortName))) {
    return { license: "CC BY " + byVersion, url: licenseUrl };
  }
  return null;
}

async function wikidataLogoFor(company) {
  const key = identityKey(company.name);
  if (!key) return null;
  const searchUrl = new URL("https://www.wikidata.org/w/api.php");
  searchUrl.search = new URLSearchParams({
    action: "wbsearchentities", search: company.name, language: "en", uselang: "en",
    type: "item", limit: "10", format: "json",
  }).toString();
  const search = await fetchJson(searchUrl);
  const exact = (search.search ?? []).filter((item) =>
    identityKey(item.label) === key || identityKey(item.match?.text) === key
  );
  const ids = [...new Set(exact.map((item) => item.id).filter((id) => /^Q\d+$/.test(id ?? "")))];
  // Exact matches with multiple Wikidata items are ambiguous; fail closed rather than guessing.
  if (ids.length !== 1) return null;

  const qid = ids[0];
  const entityUrl = new URL("https://www.wikidata.org/w/api.php");
  entityUrl.search = new URLSearchParams({
    action: "wbgetentities", ids: qid, props: "claims|labels|aliases",
    languages: "en", format: "json",
  }).toString();
  const entityResponse = await fetchJson(entityUrl);
  const entity = entityResponse.entities?.[qid];
  if (!entity || entity.missing !== undefined) return null;
  const label = entity.labels?.en?.value;
  const aliases = (entity.aliases?.en ?? []).map((entry) => entry.value);
  if (![label, ...aliases].some((value) => identityKey(value) === key)) return null;

  const tickers = claimValues(entity, "P249").map((value) => String(value).trim().toUpperCase()).filter(Boolean);
  if (tickers.length && !tickers.includes(String(company.ticker).trim().toUpperCase())) return null;

  const filenames = [...new Set(claimValues(entity, "P154").map((value) => String(value).trim()).filter(Boolean))];
  const svgFiles = filenames.filter((filename) => /\.svg$/i.test(filename) && !/[<>\u0000-\u001f]/.test(filename));
  if (svgFiles.length !== 1) return null;
  return { qid, filename: svgFiles[0] };
}

async function wikimediaSvgFor(filename) {
  const commonsUrl = new URL("https://commons.wikimedia.org/w/api.php");
  commonsUrl.search = new URLSearchParams({
    action: "query", prop: "imageinfo", iiprop: "url|extmetadata",
    titles: "File:" + filename, format: "json", formatversion: "2",
  }).toString();
  const response = await fetchJson(commonsUrl);
  const page = response.query?.pages?.[0];
  const info = page?.imageinfo?.[0];
  if (!page || page.missing || !info?.url || !info?.descriptionurl) return null;
  if (!/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//i.test(info.url)) return null;

  const licenseInfo = canonicalCommonsLicense(info.extmetadata ?? {});
  if (!licenseInfo || !/^https?:\/\//i.test(licenseInfo.url)) return null;
  const attribution = plainMetadata(info.extmetadata?.Artist?.value || info.extmetadata?.Credit?.value);
  if (/^CC BY(?:-SA)? /i.test(licenseInfo.license) && !attribution) return null;

  const svg = safeSvg(await fetchText(info.url), filename);
  return {
    svg, sourceUrl: info.descriptionurl, license: licenseInfo.license,
    licenseUrl: licenseInfo.url, attribution, filename,
  };
}

function slugFor(icon) {
  return icon.slug || normalized(icon.title).replace(/[^a-z0-9]/g, "");
}

function safeSvg(svg, label) {
  if (Buffer.byteLength(svg, "utf8") > MAX_LOGO_BYTES) throw new Error(label + ": SVG exceeds size budget.");
  if (!/<svg\b/i.test(svg) || !/<\/svg\s*>/i.test(svg)) throw new Error(label + ": source is not a complete SVG.");
  if (/<script\b|<foreignObject\b|javascript\s*:/i.test(svg)) throw new Error(label + ": unsafe SVG content.");
  return svg.endsWith("\n") ? svg : svg + "\n";
}

async function mapLimit(items, limit, task) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      await task(items[index], index);
    }
  });
  await Promise.all(workers);
}

const catalogue = JSON.parse(await readFile(CATALOGUE_PATH, "utf8"));
if (!Array.isArray(catalogue.companies) || catalogue.companies.length !== 1000) {
  throw new Error("Expected the existing 1,000-record catalogue; refusing to regenerate or alter its membership.");
}

const data = JSON.parse(await fetchText(SIMPLE_ICONS_DATA_URL));
if (!Array.isArray(data)) throw new Error("Simple Icons metadata response was not an array.");

const iconByKey = new Map();
for (const icon of data) {
  // Use only entries explicitly marked CC0-1.0; missing license metadata is not treated as permission.
  if (icon.license?.type !== "CC0-1.0" || typeof icon.source !== "string" || !icon.source.startsWith("https://")) continue;
  const slug = slugFor(icon);
  if (!slug || !/^[a-z0-9_-]+$/.test(slug)) continue;
  const keys = new Set([identityKey(icon.title), ...(icon.aliases?.aka ?? []).map(identityKey)].filter(Boolean));
  for (const key of keys) {
    const existing = iconByKey.get(key);
    if (existing && existing.slug !== slug) iconByKey.set(key, null); // ambiguous brand key: never guess
    else if (!iconByKey.has(key)) iconByKey.set(key, { ...icon, slug });
  }
}

const planned = [];
for (const company of catalogue.companies) {
  const key = identityKey(company.name);
  const icon = key ? iconByKey.get(key) : null;
  if (!icon) continue;
  planned.push({ company, icon });
}

let updated = 0;
let skipped = 0;
const errors = [];
await mapLimit(planned, CONCURRENCY, async ({ company, icon }) => {
  try {
    const svg = safeSvg(await fetchText(`${SIMPLE_ICONS_RAW_ROOT}/${icon.slug}.svg`), company.name);
    const relativePath = company.logoUrl.replace(/^\/+/, "");
    if (!relativePath.startsWith("assets/company-logos/") || relativePath.includes("..")) throw new Error("Unexpected local logo path.");
    const target = join(LOGO_ROOT, relativePath.replace(/^assets\//, "assets/"));
    await writeFile(target, svg, "utf8");
    const info = await stat(target);
    company.logoSha256 = createHash("sha256").update(svg, "utf8").digest("hex");
    company.logoBytes = info.size;
    company.logoSourceName = "Simple Icons CC0-1.0";
    company.logoSourceUrl = icon.source;
    company.logoSourceSlug = icon.slug;
    company.logoLicense = "CC0-1.0";
    updated++;
  } catch (error) {
    skipped++;
    errors.push(company.name + ": " + (error instanceof Error ? error.message : String(error)));
  }
});


let wikimediaUpdated = 0;
let wikimediaSkipped = 0;
const wikimediaErrors = [];
const needingLogos = catalogue.companies.filter((company) =>
  company.logoSourceName === "Neutral company-reference placeholder"
);
await mapLimit(needingLogos, CONCURRENCY, async (company) => {
  try {
    const source = await wikidataLogoFor(company);
    if (!source) { wikimediaSkipped++; return; }
    const logo = await wikimediaSvgFor(source.filename);
    if (!logo) { wikimediaSkipped++; return; }

    const relativePath = company.logoUrl.replace(/^\/+/, "");
    if (!relativePath.startsWith("assets/company-logos/") || relativePath.includes("..")) {
      throw new Error("Unexpected local logo path.");
    }
    const target = join(LOGO_ROOT, relativePath);
    await writeFile(target, logo.svg, "utf8");
    const info = await stat(target);
    company.logoSha256 = createHash("sha256").update(logo.svg, "utf8").digest("hex");
    company.logoBytes = info.size;
    company.logoSourceName = "Wikimedia Commons";
    company.logoSourceUrl = logo.sourceUrl;
    company.logoSourceSlug = source.qid.toLowerCase();
    company.logoLicense = logo.license;
    company.logoLicenseUrl = logo.licenseUrl;
    company.logoAttribution = logo.attribution;
    company.logoWikidataId = source.qid;
    company.logoCommonsFile = logo.filename;
    wikimediaUpdated++;
  } catch (error) {
    wikimediaSkipped++;
    wikimediaErrors.push(company.name + ": " + (error instanceof Error ? error.message : String(error)));
  }
});

const simpleIconsCount = catalogue.companies.filter((company) => company.logoSourceName === "Simple Icons CC0-1.0" && company.logoLicense === "CC0-1.0").length;
const wikimediaCount = catalogue.companies.filter((company) => company.logoSourceName === "Wikimedia Commons").length;
const placeholderCount = catalogue.companies.filter((company) => company.logoSourceName === "Neutral company-reference placeholder").length;

catalogue.logoSource = {
  providerName: "Simple Icons CC0-1.0 plus Wikidata/Wikimedia Commons sourced logos",
  providerVersion: SIMPLE_ICONS_VERSION,
  metadataUrl: SIMPLE_ICONS_DATA_URL,
  licensePolicy: "Only explicitly CC0, CC BY, CC BY-SA, and public-domain SVG artwork is cached; exact-name or exact-alias identity matches are required. Unmatched or failed records retain local placeholders.",
  explicitCc0Only: false,
  wikimediaCommonsEnabled: true,
  permittedWikimediaLicenses: ["CC0", "CC BY", "CC BY-SA", "Public domain"],
  wikidataSourceUrl: "https://www.wikidata.org/",
  wikimediaCommonsApiUrl: "https://commons.wikimedia.org/w/api.php",
  updatedAt: new Date().toISOString(),
  matchedCompanyCount: simpleIconsCount + wikimediaCount,
  simpleIconsCc0Count: simpleIconsCount,
  wikimediaCommonsLogoCount: wikimediaCount,
  placeholderCompanyCount: placeholderCount,
  trademarkNote: "Cached artwork licences do not transfer trademark rights; source page, licence URL and attribution (where required) are recorded per asset."
};
await writeFile(CATALOGUE_PATH, JSON.stringify(catalogue, null, 2) + "\n", "utf8");

console.log("[company-logos] Downloaded " + updated + " Simple Icons assets and " + wikimediaUpdated + " Wikimedia Commons logos this run. Catalogue now contains " + simpleIconsCount + " CC0 icons, " + wikimediaCount + " Commons assets, and " + placeholderCount + " placeholders among " + catalogue.companies.length + " companies.");
if (errors.length || wikimediaErrors.length) {
  const allErrors = [...errors, ...wikimediaErrors];
  console.warn("[company-logos] Some candidate assets were skipped after identity, source, licence, or download checks.");
  for (const error of allErrors.slice(0, 20)) console.warn(" - " + error);
  if (allErrors.length > 20) console.warn(" - ... and " + (allErrors.length - 20) + " more");
}
