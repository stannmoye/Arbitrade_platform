#!/usr/bin/env node
/** Offline count, identity, and source-governance validation. */
import { readFile } from "node:fs/promises";
const file = new URL("../server/data/company-catalogue.json", import.meta.url);
const normalize = (value) => String(value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
try {
  const data = JSON.parse(await readFile(file, "utf8"));
  if (data.schemaVersion !== 1 || data.targetCount !== 950 || data.companyCount !== 950 || !Array.isArray(data.companies) || data.companies.length !== 950) throw new Error("Expected exactly 950 catalogue records.");
  const ids = new Set(), ciks = new Set(), names = new Set(), listings = new Set();
  for (const [index, c] of data.companies.entries()) {
    const label = "record " + (index + 1);
    if (!c.id || ids.has(c.id)) throw new Error(label + ": invalid or duplicate ID"); ids.add(c.id);
    if (!/^\d{10}$/.test(c.cik) || ciks.has(c.cik)) throw new Error(label + ": invalid or duplicate CIK"); ciks.add(c.cik);
    if (!c.name?.trim() || c.name.length > 160) throw new Error(label + ": invalid name");
    const name = normalize(c.name); if (!name || names.has(name)) throw new Error(label + ": duplicate issuer name"); names.add(name);
    if (!c.ticker?.trim() || c.symbol !== c.ticker || !["Nasdaq", "NYSE"].includes(c.exchangeCode)) throw new Error(label + ": invalid ticker or exchange");
    const listing = c.exchangeCode.toUpperCase() + ":" + c.symbol.toUpperCase();
    if (listings.has(listing)) throw new Error(label + ": duplicate exchange/symbol"); listings.add(listing);
    if (c.countryCode !== "US" || c.countryName !== "United States") throw new Error(label + ": invalid listing-market country");
    if (c.sector !== null || c.headquartersCountry !== null || c.logoUrl !== null || c.instrumentType !== null) throw new Error(label + ": unsupported metadata was populated");
    if (c.listingStatus !== "unverified" || c.lastVerifiedAt !== null || c.requiresManualVerification !== true) throw new Error(label + ": source data must remain unverified");
    if (c.sourceObservedAt !== "2026-07-24T13:32:36Z") throw new Error(label + ": source observation timestamp is invalid");
  }
  const s = data.source;
  if (s.sourceSnapshotCommit !== "613c946973fb3cab27ecee35905eb5d91731f8e0" || s.sourceSnapshotGitBlobSha !== "c3116b277d7b4df067a136078d6895ebfc06c287" ||
      s.sourceSnapshotRecordCount !== 10432 || s.sourceOfficialPayloadSha256 !== "e6fbad74d63540e73239f257809cf217b9d6b4fed2410691f0c8c576c9a6cf3c" ||
      s.licenseStatus !== "verified_open" || s.rawRedistributionAllowed !== true ||
      s.derivedFactsRedistributionStatus !== "allowed" || s.commercialUseStatus !== "allowed" || s.attributionRequired !== true) {
    throw new Error("Pinned source provenance or distribution terms are not cleared.");
  }
  console.log("[company-catalogue] PASS: 950 unique SEC-derived records; all remain unverified; source provenance and licensing metadata match.");
} catch (error) {
  console.error("[company-catalogue] FAIL: " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
