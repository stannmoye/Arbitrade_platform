#!/usr/bin/env node
/**
 * Download each company's own site icon for one 50-company batch.
 * Only uses explicitly mapped official homepages. No image-search scraping.
 * Prefers logo-like SVG/PNG and Apple touch icons, then declared favicon, then /favicon.ico.
 * Existing catalogue records and filenames are preserved; only successful icon downloads update metadata.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOGUE = join(ROOT, "server/data/company-catalogue-1000.json");
const LOGO_DIR = join(ROOT, "client/public/assets/company-logos");
const BATCH_SIZE = 50;
const batch = Number(process.env.LOGO_BATCH ?? process.argv[2] ?? 1);
const MAX_BYTES = 150 * 1024;
const USER_AGENT = "ArbitradeCompanyLogoFetcher/1.0 (+official-site favicon extraction)";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

if (!Number.isInteger(batch) || batch < 1 || batch > 20) throw new Error("LOGO_BATCH must be between 1 and 20.");

// Domains below were identified as the companies' own sites. Do not add ambiguous domains
// without confirming the company identity first; unknown entries stay pending, not guessed.
const OFFICIAL_SITES = {
  "jp-3-d-matrix-ltd-7777-5d23fe3d": "https://www.3dmatrix.com/",
  "jp-4cs-hd-co-ltd-3726-68a12118": "https://www.4cs-holdings.co.jp/en/",
  "jp-a-a-material-corporation-5391-1744979d": "https://aa-material.co.jp/eng/company/",
  "jp-a-d-holon-holdings-company-limited-7745-4ccde400": "https://andholon.com/en/",
  "jp-a-d-works-group-co-ltd-2982-4f2880a9": "https://www.adwg.co.jp/en/",
  "jp-ab-company-co-ltd-9251-efc7382d": "https://www.ab-company.co.jp/",
  "jp-abalance-corporation-3856-f6f28473": "https://www2.abalance.jp/aboutus/abalance/",
  "jp-abc-mart-inc-2670-9f4a83d0": "https://www.abc-mart.co.jp/",
  "jp-abeja-inc-5574-08b3a823": "https://www.abejainc.com/en/company",
  "jp-abist-co-ltd-6087-8dccda2c": "https://www.abist.co.jp/en/",
  "jp-accelia-inc-271a-383135f9": "https://www.accelia.jp/",
  "jp-access-co-ltd-4813-be1a8936": "https://www.access-company.com/",
  "in-20-microns-ltd-20microns-919ac70f": "https://www.20microns.com/",
  "in-360-one-wam-ltd-360one-09490cef": "https://www.360.one/",
  "in-3b-blackbio-dx-ltd-3bblackbio-efd20dbc": "https://3bblackbio.com/",
  "in-3b-films-ltd-3bfilms-151d41dc": "https://www.3bfilms.com/",
  "in-3c-it-solutions-and-telecoms-india-ltd-3cit-09074294": "https://www.3citsolutions.com/",
  "in-3i-infotech-ltd-3iinfoltd-19baaa74": "https://www.3i-infotech.com/",
  "in-3m-india-ltd-3mindia-18db5b55": "https://www.3mindia.com/",
  "in-3p-land-holdings-ltd-3pland-ff24b660": "https://3pland.com/",
  "in-5paisa-capital-ltd-5paisa-14e4e6c8": "https://www.5paisa.com/",
  "in-63-moons-technologies-ltd-63moons-7cf68307": "https://www.63moons.com/",
  "in-7nr-retail-ltd-7nr-d7db40c3": "https://www.7nrretailltd.in/",
  "in-7seas-entertainment-ltd-7seasl-64cc2752": "https://www.7seasent.com/",
  "fr-2crsi-s-a-al2si-a114086a": "https://www.2crsi.com/",
  "fr-74software-74sw-8443116c": "https://www.74software.com/",
  "fr-ab-science-s-a-ab-af4b7c3d": "https://www.ab-science.com/",
  "fr-abc-arbitrage-sa-abca-7278b50d": "https://www.abc-arbitrage.com/",
  "fr-abeo-sa-0rjy-ca2e45d4": "https://www.abeo.eu/",
  "fr-abionyx-pharma-sa-abnx-75dc3ca3": "https://www.abionyx.com/",
  "fr-abivax-sa-abvx-2306718a": "https://www.abivax.com/",
  "fr-accor-s-a-ac-77967177": "https://group.accor.com/",
  "fr-acheter-louer-alalo-6d2044be": "https://www.acheter-louer.fr/",
  "fr-acteos-s-a-eos-7d241b1b": "https://www.acteos.com/",
  "fr-actia-group-alati-b2937f60": "https://www.actia.com/",
  "fr-activium-group-mlact-11a98f1e": "https://www.activium.fr/",
  "fr-ada-alada-a5c5146b": "https://www.ada.fr/",
  "fr-adeunis-alarf-371c17e8": "https://www.adeunis.com/",
  "it-a-b-p-nocivelli-s-p-a-abp-1849154d": "https://www.abpnocivelli.com/",
  "it-a2a-spa-0n54-c993524c": "https://www.gruppoa2a.it/",
  "it-acea-s-p-a-0mhd-941cd98d": "https://www.acea.it/",
  "it-acinque-ac5-7df02124": "https://www.acinque.it/",
  "it-alerion-clean-power-s-p-a-0p3o-55117d10": "https://www.alerion.it/",
  "it-alfio-bardolla-training-group-spa-abtg-8736bbe1": "https://www.alfiobardolla.com/",
  "it-alfonsino-s-p-a-alfo-42c4c503": "https://www.alfonsino.it/",
  "it-almawave-s-p-a-aiw-a0d4d0ec": "https://www.almawave.com/"
};

function decodeHtml(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/gi, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function extensionFor(type, url) {
  const mime = String(type || "").split(";")[0].trim().toLowerCase();
  if (mime === "image/svg+xml") return ".svg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";
  if (mime === "image/x-icon" || mime === "image/vnd.microsoft.icon" || mime === "image/ico") return ".ico";
  const suffix = extname(new URL(url).pathname).toLowerCase();
  return [".svg", ".png", ".webp", ".jpg", ".jpeg", ".ico"].includes(suffix) ? (suffix === ".jpeg" ? ".jpg" : suffix) : null;
}
async function get(url, headers = {}, timeout = 18000) {
  return fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,image/svg+xml,image/png,image/webp,image/x-icon,*/*;q=0.7", ...headers },
    signal: AbortSignal.timeout(timeout),
    redirect: "follow"
  });
}
function extractIconCandidates(html, homepage) {
  const found = [];
  const seen = new Set();
  const add = (raw, priority, kind) => {
    if (!raw) return;
    const cleaned = decodeHtml(raw.trim().replace(/^['"]|['"]$/g, ""));
    if (!cleaned || cleaned.startsWith("data:") || cleaned.startsWith("javascript:")) return;
    let url;
    try { url = new URL(cleaned, homepage).href; } catch { return; }
    if (!/^https?:$/i.test(new URL(url).protocol) || seen.has(url)) return;
    seen.add(url);
    found.push({ url, priority, kind });
  };
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    const rawTag = tag[0];
    const rel = ((rawTag.match(/\brel\s*=\s*["']([^"']+)["']/i) || [])[1] || "").toLowerCase();
    const href = (rawTag.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    if (/apple-touch-icon|apple-touch-icon-precomposed/.test(rel)) add(href, 0, "apple-touch-icon");
    else if (/icon/.test(rel) && /svg/i.test(href + " " + rawTag)) add(href, 1, "declared-svg-icon");
    else if (/icon/.test(rel)) add(href, 2, "declared-favicon");
  }
  // Some sites publish SVG logos as image elements; only accept an image explicitly labelled logo.
  for (const tag of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const rawTag = tag[0];
    const label = ((rawTag.match(/\b(?:alt|title|class|id)\s*=\s*["']([^"']+)["']/i) || [])[1] || "").toLowerCase();
    const src = (rawTag.match(/\b(?:src|srcset)\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (src && /logo|brand-mark|brandmark|site-icon/.test(label)) add(src.split(",")[0].trim().split(/\s+/)[0], 1, "logo-labelled-image");
  }
  found.sort((a, b) => a.priority - b.priority);
  const origin = new URL(homepage).origin;
  add(new URL("/favicon.ico", origin).href, 3, "standard-favicon");
  return found;
}
async function downloadIcon(candidate) {
  try {
    const response = await get(candidate.url, {}, 15000);
    if (!response.ok) return null;
    const mime = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!mime.startsWith("image/") && !/\.ico(?:$|\?)/i.test(response.url)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 100 || bytes.length > MAX_BYTES) return null;
    const ext = extensionFor(mime, response.url || candidate.url);
    if (!ext) return null;
    if (ext === ".svg") {
      const svg = bytes.toString("utf8");
      if (!/<svg[\s>]/i.test(svg) || /<script\b|<foreignObject\b/i.test(svg)) return null;
    }
    // Reject HTML error pages served with a misleading image content type.
    if (bytes.subarray(0, 100).toString("utf8").toLowerCase().includes("<!doctype html")) return null;
    return { bytes, ext, sourceUrl: response.url || candidate.url, mime, sha256: sha256(bytes), iconKind: candidate.kind };
  } catch { return null; }
}

const catalogue = JSON.parse(await readFile(CATALOGUE, "utf8"));
if (!Array.isArray(catalogue.companies) || catalogue.companies.length !== 1000) {
  throw new Error("Expected the existing 1,000-company catalogue; refusing to rebuild it.");
}
const start = (batch - 1) * BATCH_SIZE;
const companies = catalogue.companies.slice(start, start + BATCH_SIZE);
if (companies.length !== BATCH_SIZE) throw new Error("Batch " + batch + " does not contain 50 records.");
await mkdir(LOGO_DIR, { recursive: true });

let downloaded = 0;
let alreadyReal = 0;
let failed = 0;
let unverifiedSite = 0;
const report = [];

for (let i = 0; i < companies.length; i++) {
  const company = companies[i];
  const officialHomepage = OFFICIAL_SITES[company.id];
  if (!String(company.logoSourceName || "").toLowerCase().includes("placeholder")) {
    alreadyReal++;
    report.push({ id: company.id, name: company.name, status: "already-real", homepage: officialHomepage || null });
    continue;
  }
  if (!officialHomepage) {
    unverifiedSite++;
    report.push({ id: company.id, name: company.name, status: "official-site-not-verified", note: "No confirmed official homepage mapping; left existing asset unchanged." });
    console.warn("No verified official site for " + company.name + "; leaving placeholder unchanged.");
    continue;
  }
  let homepageResponse;
  try {
    homepageResponse = await get(officialHomepage, { accept: "text/html,application/xhtml+xml" }, 22000);
    if (!homepageResponse.ok) throw new Error("HTTP " + homepageResponse.status);
    const contentType = (homepageResponse.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("Homepage did not return HTML");
  } catch (error) {
    failed++;
    report.push({ id: company.id, name: company.name, status: "official-site-fetch-failed", homepage: officialHomepage, error: error.message });
    console.warn("Official site unavailable for " + company.name + ": " + error.message);
    continue;
  }
  const finalHomepage = homepageResponse.url || officialHomepage;
  const html = await homepageResponse.text();
  const candidates = extractIconCandidates(html, finalHomepage);
  let asset = null;
  for (const candidate of candidates.slice(0, 12)) {
    asset = await downloadIcon(candidate);
    if (asset) break;
  }
  if (!asset) {
    failed++;
    report.push({ id: company.id, name: company.name, status: "no-usable-site-icon", homepage: finalHomepage, candidatesChecked: Math.min(candidates.length, 12) });
    console.warn("No usable icon from official site for " + company.name);
    await sleep(250);
    continue;
  }
  const publicPath = String(company.logoUrl || "").replace(/^\//, "");
  const oldFullPath = join(ROOT, "client/public", publicPath);
  const newPublicPath = publicPath.replace(/\.[^.]+$/, "") + asset.ext;
  const fullPath = join(ROOT, "client/public", newPublicPath);
  await writeFile(fullPath, asset.bytes);
  if (oldFullPath !== fullPath) await rm(oldFullPath, { force: true });
  company.logoUrl = "/" + newPublicPath;
  company.logoSourceName = "Official company website " + asset.iconKind;
  company.logoSourceUrl = asset.sourceUrl;
  company.logoSourceSlug = "official-website-favicon";
  company.logoHomepageUrl = finalHomepage;
  company.logoMimeType = asset.mime;
  company.logoBytes = asset.bytes.length;
  company.logoSha256 = asset.sha256;
  company.logoRetrievedAt = new Date().toISOString();
  company.logoSearchProvider = "Official company website favicon extraction";
  downloaded++;
  report.push({
    id: company.id, name: company.name, status: "official-site-icon-downloaded",
    homepage: finalHomepage, iconKind: asset.iconKind, source: asset.sourceUrl,
    bytes: asset.bytes.length, mime: asset.mime, sha256: asset.sha256
  });
  console.log("Saved official-site icon " + (start + i + 1) + "/1000 " + company.name + " (" + asset.bytes.length + " bytes)");
  await sleep(250);
}

catalogue.logoBatchDownload = {
  provider: "Official company websites: declared logo/favicon/apple-touch-icon extraction",
  batch,
  range: [start + 1, start + companies.length],
  attemptedAt: new Date().toISOString(),
  downloaded,
  alreadyReal,
  failed,
  unverifiedSite,
  note: "Only icons fetched from an explicitly mapped official homepage are accepted. Unverified sites and failed icons remain pending; catalogue records are not regenerated."
};
await writeFile(CATALOGUE, JSON.stringify(catalogue, null, 2) + "\n");
await writeFile(join(ROOT, "server/data", "company-logo-batch-" + String(batch).padStart(2, "0") + "-report.json"), JSON.stringify({ ...catalogue.logoBatchDownload, results: report }, null, 2) + "\n");
console.log(JSON.stringify(catalogue.logoBatchDownload, null, 2));
if (downloaded === 0 && alreadyReal === 0) process.exitCode = 1;
