#!/usr/bin/env node
/**
 * Convert the existing local catalogue logo artwork to compact, sequential PNGs.
 * These are local renderings of the currently stored artwork; this does not claim
 * that placeholder artwork is an official company logo.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOGUE_PATH = join(ROOT, "server/data/company-catalogue-1000.json");
const LOGO_DIR = join(ROOT, "client/public/assets/company-logos");
const MANIFEST_PATH = join(ROOT, "docs/company-logo-replacement-manifest.csv");
const countryFolder = (name) => String(name).normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
const catalogue = JSON.parse(await readFile(CATALOGUE_PATH, "utf8"));
if (!Array.isArray(catalogue.companies) || catalogue.companies.length !== 1000) {
  throw new Error("Refusing to number logos: expected exactly 1,000 existing catalogue records.");
}
await mkdir(LOGO_DIR, { recursive: true });
const existingFiles = await readdir(LOGO_DIR);
for (const [index, company] of catalogue.companies.entries()) {
  const id = index + 1;
  const sourcePath = join(ROOT, "client/public", String(company.logoUrl).replace(/^\/+/, ""));
  const sourceBytes = await readFile(sourcePath);
  const pngBytes = await sharp(sourceBytes, { density: 144 })
    .resize({ width: 96, height: 96, fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  const folder = countryFolder(company.countryName);
  const filename = id + ".png";
  await mkdir(join(LOGO_DIR, folder), { recursive: true });
  await writeFile(join(LOGO_DIR, folder, filename), pngBytes);
  company.logoUrl = "/assets/company-logos/" + folder + "/" + filename;
  company.logoBytes = pngBytes.length;
  company.logoSha256 = createHash("sha256").update(pngBytes).digest("hex");
}
for (const filename of existingFiles) {
  if (/^[a-z0-9-]+\.svg$/i.test(filename) || /^(?:[1-9]\d{0,2}|1000)\.png$/.test(filename)) await rm(join(LOGO_DIR, filename), { force: true });
}
await writeFile(CATALOGUE_PATH, JSON.stringify(catalogue, null, 2) + "\n");

try {
  const manifest = await readFile(MANIFEST_PATH, "utf8");
  const lines = manifest.trimEnd().split(/\r?\n/);
  if (lines.length !== 1001) throw new Error("Manifest must contain a header and exactly 1,000 rows.");
  lines[0] = lines[0].replace("current_catalogue_logo_path", "current_catalogue_logo_path");
  for (let i = 1; i < lines.length; i++) {
    const expectedId = String(i);
    if (!lines[i].startsWith('"' + expectedId + '",')) throw new Error("Manifest row order/ID mismatch at row " + i);
    const company = catalogue.companies[i - 1];
    const folder = countryFolder(company.countryName);
    lines[i] = lines[i].replace(/,"[^"]*"\s*$/, ',"/assets/company-logos/' + folder + '/' + expectedId + '.png"');
  }
  await writeFile(MANIFEST_PATH, lines.join("\n") + "\n");
} catch (error) {
  throw new Error("Failed to update numeric logo manifest: " + error.message);
}
console.log("Sorted exactly 1,000 local PNG logo assets into country folders, with numeric filenames 1.png through 1000.png.");
