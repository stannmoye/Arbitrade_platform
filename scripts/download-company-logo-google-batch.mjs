#!/usr/bin/env node
/**
 * Fetch actual logo image files for one 50-company batch from Bing Images results.
 * Reads the existing catalogue and only replaces placeholder entries in the selected batch.
 * Does not rebuild or regenerate the catalogue or any records.
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
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";

if (!Number.isInteger(batch) || batch < 1 || batch > 20) throw new Error("LOGO_BATCH must be between 1 and 20.");

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url, headers = {}, timeout = 25000) {
  return fetch(url, { headers: { "user-agent": USER_AGENT, ...headers }, signal: AbortSignal.timeout(timeout), redirect: "follow" });
}
function decodeHtml(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function imageCandidates(html) {
  const candidates = [];
  const seen = new Set();
  // Bing Images stores original image URLs as murl fields in JSON result metadata.
  for (const match of html.matchAll(/"murl"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"/g)) {
    let url = "";
    try { url = JSON.parse('"' + match[1] + '"'); } catch { continue; }
    url = decodeHtml(url);
    if (/^https?:\\/\\//i.test(url) && !seen.has(url)) { seen.add(url); candidates.push(url); }
  }
  // Fallback for search-result markup that exposes an encoded direct image URL.
  for (const match of html.matchAll(/(?:imgurl=)(https?%3A%2F%2F[^&"\\s]+)/gi)) {
    let url = match[1];
    try { url = decodeURIComponent(url); } catch {}
    url = decodeHtml(url);
    if (/^https?:\\/\\//i.test(url) && !seen.has(url)) { seen.add(url); candidates.push(url); }
  }
  return candidates;
}
function extensionFor(type, url) {
  const mime = String(type || "").split(";")[0].trim().toLowerCase();
  if (mime === "image/svg+xml") return ".svg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";
  const suffix = extname(new URL(url).pathname).toLowerCase();
  return [".svg", ".png", ".webp", ".jpg", ".jpeg"].includes(suffix) ? (suffix === ".jpeg" ? ".jpg" : suffix) : null;
}
async function findCandidates(company) {
  const query = encodeURIComponent('"' + company.name + '" ' + company.countryName + " official company logo");
  const url = "https://www.bing.com/images/search?q=" + query + "&form=HDRSC3";
  const response = await get(url, { accept: "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" });
  if (!response.ok) throw new Error("Bing Images returned HTTP " + response.status);
  const candidates = imageCandidates(await response.text());
  if (!candidates.length) throw new Error("Bing Images returned no direct image URLs");
  return candidates;
}
async function downloadCandidate(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!["https:", "http:"].includes(parsed.protocol)) return null;
  if (/google\.(?:com|usercontent\.com)$/i.test(parsed.hostname) || /gstatic\.com$/i.test(parsed.hostname)) return null;
  try {
    const response = await get(url, { accept: "image/avif,image/webp,image/svg+xml,image/png,image/jpeg,image/*;q=0.8" }, 18000);
    if (!response.ok) return null;
    const type = response.headers.get("content-type") || "";
    if (!type.toLowerCase().startsWith("image/")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 150 || bytes.length > MAX_BYTES) return null;
    const ext = extensionFor(type, url);
    if (!ext) return null;
    if (ext === ".svg") {
      const text = bytes.toString("utf8");
      if (!/<svg[\s>]/i.test(text) || /Neutral company reference placeholder/i.test(text)) return null;
    }
    return { bytes, ext, sourceUrl: response.url || url, mime: type.split(";")[0], sha256: sha256(bytes) };
  } catch { return null; }
}

const catalogue = JSON.parse(await readFile(CATALOGUE, "utf8"));
if (!Array.isArray(catalogue.companies) || catalogue.companies.length !== 1000) throw new Error("Expected the existing 1,000-company catalogue; refusing to rebuild it.");
const start = (batch - 1) * BATCH_SIZE;
const companies = catalogue.companies.slice(start, start + BATCH_SIZE);
if (companies.length !== BATCH_SIZE) throw new Error("Batch " + batch + " does not contain 50 records.");
await mkdir(LOGO_DIR, { recursive: true });
let downloaded = 0;
let alreadyReal = 0;
let failed = 0;
const report = [];

for (let i = 0; i < companies.length; i++) {
  const company = companies[i];
  if (!String(company.logoSourceName || "").toLowerCase().includes("placeholder")) {
    alreadyReal++;
    report.push({ id: company.id, status: "already-real" });
    continue;
  }
  let candidates = [];
  try { candidates = await findCandidates(company); }
  catch (error) { console.warn("Bing Images search failed for " + company.name + ": " + error.message); }
  let asset = null;
  for (const url of candidates.slice(0, 12)) {
    asset = await downloadCandidate(url);
    if (asset) break;
  }
  if (!asset) {
    failed++;
    report.push({ id: company.id, name: company.name, status: "no-downloadable-image" });
    console.warn("No usable image found for " + (start + i + 1) + "/1000 " + company.name);
    await sleep(700);
    continue;
  }
  const publicPath = String(company.logoUrl || "").replace(/^\//, "");
  const oldFullPath = join(ROOT, "client/public", publicPath);
  const newPublicPath = publicPath.replace(/\.[^.]+$/, "") + asset.ext;
  const fullPath = join(ROOT, "client/public", newPublicPath);
  await writeFile(fullPath, asset.bytes);
  if (oldFullPath !== fullPath) await rm(oldFullPath, { force: true });
  company.logoUrl = "/" + newPublicPath;
  company.logoSourceName = "Bing Images result; original image source";
  company.logoSourceUrl = asset.sourceUrl;
  company.logoSourceSlug = "bing-images-source";
  company.logoMimeType = asset.mime;
  company.logoBytes = asset.bytes.length;
  company.logoSha256 = asset.sha256;
  company.logoRetrievedAt = new Date().toISOString();
  company.logoSearchProvider = "Bing Images";
  downloaded++;
  report.push({ id: company.id, name: company.name, status: "downloaded", bytes: asset.bytes.length, source: asset.sourceUrl });
  console.log("Downloaded " + (start + i + 1) + "/1000 " + company.name + " (" + asset.bytes.length + " bytes)");
  await sleep(900);
}

catalogue.logoBatchDownload = {
  provider: "Bing Images search; image bytes fetched from each result's original host",
  batch,
  range: [start + 1, start + companies.length],
  attemptedAt: new Date().toISOString(),
  downloaded,
  alreadyReal,
  failed,
  note: "Bing Images is a discovery tool; source URLs are stored per downloaded image. Automated matching is not a substitute for visual review of brand identity or a rights check."
};
await writeFile(CATALOGUE, JSON.stringify(catalogue, null, 2) + "\n");
await writeFile(join(ROOT, "server/data", "company-logo-batch-" + String(batch).padStart(2, "0") + "-report.json"), JSON.stringify({ ...catalogue.logoBatchDownload, results: report }, null, 2) + "\n");
console.log(JSON.stringify(catalogue.logoBatchDownload, null, 2));
if (downloaded === 0 && alreadyReal === 0) process.exitCode = 1;
