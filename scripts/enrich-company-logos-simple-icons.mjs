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
const CONCURRENCY = 6;

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

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Arbitrade-company-logo-cache/1.0", accept: "image/svg+xml,application/json,text/plain" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} while fetching ${url}`);
  return response.text();
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

catalogue.logoSource = {
  providerName: "Simple Icons CC0-1.0 plus existing local neutral placeholders",
  providerVersion: SIMPLE_ICONS_VERSION,
  metadataUrl: SIMPLE_ICONS_DATA_URL,
  licensePolicy: "Only entries explicitly marked CC0-1.0 are applied; unmatched or failed records retain their local placeholder.",
  explicitCc0Only: true,
  trademarkNote: "Company names and marks remain the property of their respective owners; CC0 artwork licensing does not transfer trademark rights.",
  updatedAt: new Date().toISOString(),
  matchedCompanyCount: updated,
  placeholderCompanyCount: catalogue.companies.filter((company) => company.logoSourceName === "Neutral company-reference placeholder").length,
};
await writeFile(CATALOGUE_PATH, JSON.stringify(catalogue, null, 2) + "\n", "utf8");

console.log(`[company-logos] Updated ${updated} unambiguous, explicitly CC0-licensed brand assets; ${catalogue.companies.length - updated} records remain unchanged or use placeholders.`);
if (errors.length) {
  console.warn("[company-logos] Some matched assets could not be fetched; those records keep their existing source metadata where the download failed.");
  for (const error of errors.slice(0, 20)) console.warn(" - " + error);
  if (errors.length > 20) console.warn(` - ... and ${errors.length - 20} more`);
}
