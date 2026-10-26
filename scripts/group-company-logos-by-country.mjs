#!/usr/bin/env node
/**
 * Group the local company-logo assets into country-named folders.
 *
 * Run from the repository root:
 *   node scripts/group-company-logos-by-country.mjs --dry-run
 *   node scripts/group-company-logos-by-country.mjs --apply
 *
 * Unknown country assignments are preserved under "Unverified" rather than guessed.
 */
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const assetRoot = path.join(root, "client/public/assets/company-logo-source");
const indexPath = path.join(assetRoot, "company-logo-index.json");
const groupsPath = path.join(assetRoot, "company-logo-country-groups.json");
const csvPath = path.join(assetRoot, "logo-mapping.csv");
const apply = process.argv.includes("--apply");
if (!apply && !process.argv.includes("--dry-run")) {
  console.error("Choose --dry-run or --apply. No changes made.");
  process.exit(2);
}

const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
const manifest = JSON.parse(await fs.readFile(groupsPath, "utf8"));
if (!Array.isArray(index.logos) || index.logos.length !== 1811) {
  throw new Error(`Expected exactly 1811 logo records; found ${index.logos?.length ?? "none"}.`);
}
const ids = new Set(index.logos.map(x => x.logoId));
if (ids.size !== 1811 || !Array.from({ length: 1811 }, (_, i) => i + 1).every(id => ids.has(id))) {
  throw new Error("Logo IDs must be unique and cover 1..1811 before grouping.");
}

const plans = [];
for (const item of index.logos) {
  const country = typeof item.country === "string" && item.country.trim()
    ? item.country.trim()
    : "Unverified";
  const filename = path.basename(item.logoFile || "");
  if (!filename) throw new Error(`Missing filename for logo ID ${item.logoId}`);
  const destinationRelative = path.posix.join("by-country", country, filename);
  const source = path.resolve(assetRoot, item.logoFile);
  const destination = path.resolve(assetRoot, destinationRelative);
  if (!source.startsWith(assetRoot + path.sep) || !destination.startsWith(assetRoot + path.sep)) {
    throw new Error(`Unsafe asset path for logo ID ${item.logoId}`);
  }
  plans.push({ item, country, filename, source, destination, destinationRelative });
}

const destinations = new Set(plans.map(p => p.destination));
if (destinations.size !== plans.length) {
  throw new Error("Destination filename collision detected; refusing to overwrite logos.");
}
if (apply) {
  // Validate all source files and collisions before changing anything.
  for (const p of plans) {
    await fs.access(p.source);
    try {
      await fs.access(p.destination);
      throw new Error(`Destination already exists: ${p.destinationRelative}`);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  for (const p of plans) {
    await fs.mkdir(path.dirname(p.destination), { recursive: true });
    await fs.rename(p.source, p.destination);
    p.item.logoFile = p.destinationRelative;
  }

  // Keep the CSV's filename field in sync with the moved images.
  const csv = await fs.readFile(csvPath, "utf8");
  const lines = csv.split(/\r?\n/);
  if (lines.length > 1) {
    const header = lines[0].split(",");
    const filenameColumn = header.indexOf("filename");
    const idColumn = header.indexOf("catalogue_number");
    if (filenameColumn < 0 || idColumn < 0) throw new Error("CSV is missing required filename/catalogue_number columns.");
    // CSV records in this source have no commas in these fields; retain all other columns unchanged.
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      const cells = lines[i].split(",");
      const id = Number(cells[idColumn]);
      const logo = index.logos.find(x => x.logoId === id);
      if (logo) cells[filenameColumn] = logo.logoFile;
      lines[i] = cells.join(",");
    }
    await fs.writeFile(csvPath, lines.join("\n"), "utf8");
  }

  await fs.writeFile(indexPath, JSON.stringify(index, null, 2) + "\n", "utf8");
  for (const [country, records] of Object.entries(manifest.countryGroups || {})) {
    for (const record of records) {
      const item = index.logos.find(x => x.logoId === record.logoId);
      if (item) record.logoFile = item.logoFile;
    }
  }
  manifest.notes = [
    "Logo IDs are preserved from the source index.",
    "Physical images are stored under by-country/<Country>/.",
    "Unverified entries are stored under by-country/Unverified/ until their headquarters can be confirmed."
  ];
  await fs.writeFile(groupsPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`Moved ${plans.length} logos into ${new Set(plans.map(p => p.country)).size} country/status folders.`);
} else {
  const counts = {};
  for (const p of plans) counts[p.country] = (counts[p.country] || 0) + 1;
  console.log(JSON.stringify({ mode: "dry-run", total: plans.length, folders: counts }, null, 2));
}
