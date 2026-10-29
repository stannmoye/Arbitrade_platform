import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Migration 0072 was shipped before fresh-install testing exposed its dependency on
// portal-chain columns. Accept the original hash for already-applied databases while
// fresh installs use the corrected migration body.
const LEGACY_MIGRATION_HASH_ALIASES = new Map([
  ["a2f897e5e500ae7fb54c71cc6756510191f02d615e3e62c4a3a68f824898cafc", "0072_wallet_ledger_reconciliation_indexes"],
]);

export async function loadExpectedMainMigrationHistory(root) {
  const journal = JSON.parse(await readFile(resolve(root, "drizzle/meta/_journal.json"), "utf8"));
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) throw new Error("The Drizzle migration journal is missing or empty.");
  const migrations = [];
  const seenTags = new Set();
  const seenHashes = new Set();
  for (const entry of journal.entries) {
    if (typeof entry?.tag !== "string" || !/^[0-9]{4}_[A-Za-z0-9_-]+$/.test(entry.tag) ||
        !Number.isSafeInteger(Number(entry.when)) || Number(entry.when) <= 0 || seenTags.has(entry.tag)) {
      throw new Error("The Drizzle migration journal contains an invalid or duplicate entry.");
    }
    seenTags.add(entry.tag);
    const sql = await readFile(resolve(root, "drizzle", entry.tag + ".sql"), "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    if (seenHashes.has(hash)) throw new Error("The Drizzle journal contains duplicate migration contents; history cannot be verified safely.");
    seenHashes.add(hash);
    migrations.push({ tag: entry.tag, hash, createdAt: Number(entry.when) });
  }

  // These are exact open-PR migration tails that were observed on live branches.
  // Their SQL is preserved verbatim under docs/trading/migration-history and is
  // hash-checked here. They are accepted only as exact suffixes after the common
  // applied prefix; current forward migrations can then be appended safely.
  const legacyManifest = JSON.parse(await readFile(resolve(root, "installer/legacy-main-migration-histories.json"), "utf8"));
  const commonPrefixLength = Number(legacyManifest.commonPrefixLength);
  if (!Number.isSafeInteger(commonPrefixLength) || commonPrefixLength < 1 || commonPrefixLength > migrations.length ||
      !Array.isArray(legacyManifest.lineages)) throw new Error("The archived Trading migration lineages are invalid.");
  for (const lineage of legacyManifest.lineages) {
    if (typeof lineage?.name !== "string" || typeof lineage?.headSha !== "string" || !/^[a-f0-9]{40}$/i.test(lineage.headSha) || !Array.isArray(lineage.entries)) {
      throw new Error("An archived Trading migration lineage is malformed.");
    }
    for (const entry of lineage.entries) {
      if (typeof entry?.tag !== "string" || !/^[0-9]{4}_[A-Za-z0-9_-]+$/.test(entry.tag) ||
          !/^[a-f0-9]{64}$/i.test(String(entry.hash)) || !Number.isSafeInteger(Number(entry.createdAt)) ||
          typeof entry.archivePath !== "string" || entry.archivePath.includes("..")) {
        throw new Error("An archived Trading migration entry is malformed.");
      }
      const archivedSql = await readFile(resolve(root, entry.archivePath), "utf8");
      const archivedHash = createHash("sha256").update(archivedSql).digest("hex");
      if (archivedHash !== entry.hash) throw new Error(`Archived migration ${entry.tag} no longer matches its recorded hash.`);
    }
  }
  migrations.commonPrefixLength = commonPrefixLength;
  migrations.legacyLineages = legacyManifest.lineages;
  return { journal, migrations };
}

function rowMatchesCanonical(row, migration) {
  const hash = String(row?.hash ?? "");
  const createdAt = Number(row?.created_at);
  const legacyTag = LEGACY_MIGRATION_HASH_ALIASES.get(hash);
  return createdAt === migration.createdAt && (hash === migration.hash || (legacyTag !== undefined && legacyTag === migration.tag));
}

function rowMatchesLegacy(row, migration) {
  return String(row?.hash ?? "") === migration.hash && Number(row?.created_at) === Number(migration.createdAt);
}

export function validateMainMigrationHistory(trackerRows, expectedMigrations) {
  if (!Array.isArray(trackerRows) || trackerRows.length === 0) return { allowed: false, reason: "The Drizzle migration tracker is empty or unreadable." };
  if (!Array.isArray(expectedMigrations) || expectedMigrations.length === 0) return { allowed: false, reason: "The repository migration journal could not be verified." };
  const hashes = trackerRows.map((row) => String(row?.hash ?? ""));
  if (hashes.some((hash) => !/^[a-f0-9]{64}$/i.test(hash)) || new Set(hashes).size !== hashes.length) {
    return { allowed: false, reason: "The Drizzle tracker contains malformed or duplicate migration hashes." };
  }

  // Canonical main history remains a strict contiguous prefix.
  if (trackerRows.length <= expectedMigrations.length &&
      trackerRows.every((row, index) => rowMatchesCanonical(row, expectedMigrations[index]))) {
    return { allowed: true, reason: "Recorded Drizzle migrations form a contiguous prefix matching the repository journal." };
  }

  const commonPrefixLength = Number(expectedMigrations.commonPrefixLength);
  const lineages = expectedMigrations.legacyLineages;
  if (!Number.isSafeInteger(commonPrefixLength) || commonPrefixLength < 1 || !Array.isArray(lineages) ||
      trackerRows.length < commonPrefixLength || expectedMigrations.length < commonPrefixLength) {
    return { allowed: false, reason: "The Drizzle tracker contains a migration hash that does not match the repository journal." };
  }
  for (let i = 0; i < commonPrefixLength; i++) {
    if (!rowMatchesCanonical(trackerRows[i], expectedMigrations[i])) {
      return { allowed: false, reason: "The Drizzle tracker does not match the established common migration prefix." };
    }
  }

  for (const lineage of lineages) {
    const legacyEntries = lineage.entries;
    const availableSuffixLength = trackerRows.length - commonPrefixLength;
    const suffixLength = Math.min(availableSuffixLength, legacyEntries.length);
    let suffixMatches = true;
    for (let i = 0; i < suffixLength; i++) {
      if (!rowMatchesLegacy(trackerRows[commonPrefixLength + i], legacyEntries[i])) {
        suffixMatches = false;
        break;
      }
    }
    if (!suffixMatches) continue;

    // Once a known branch suffix is present, integrated migrations are appended in
    // canonical order. Hashes already applied under the old branch tags are skipped
    // by the migration runner; the PR #230 0086 variant is deliberately rerun because
    // the current main 0086 file is a distinct, additive historical migration.
    const legacyHashes = new Set(legacyEntries.slice(0, suffixLength).map((entry) => entry.hash));
    const canonicalTail = expectedMigrations.slice(commonPrefixLength).filter((entry) => !legacyHashes.has(entry.hash));
    const appendedRows = trackerRows.slice(commonPrefixLength + suffixLength);
    if (appendedRows.length <= canonicalTail.length &&
        appendedRows.every((row, index) => rowMatchesCanonical(row, canonicalTail[index]))) {
      return { allowed: true, reason: `Recorded history matches the exact ${lineage.name} migration tail and any appended canonical forward migrations.` };
    }
  }

  return { allowed: false, reason: "The Drizzle tracker history is not a known exact branch lineage or a safe forward-only extension; administrator review is required." };
}

export function classifyMainMigrationPreflight({ mode, tableCount, trackerExists, trackerCount, trackerHistoryValid }) {
  if (mode !== "existing") return { allowed: true, reason: "Fresh-install mode is handled by the empty-database check." };
  if (!Number.isInteger(tableCount) || tableCount < 1) return { allowed: false, reason: "Existing-database mode requires a non-empty imported database." };
  if (!trackerExists) return { allowed: false, reason: "The imported database has no __drizzle_migrations tracker. Its migration history cannot be verified, so automatic main migrations are unsafe." };
  if (!Number.isInteger(trackerCount) || trackerCount < 1) return { allowed: false, reason: "The imported database has an empty or unreadable __drizzle_migrations tracker. Its migration history cannot be verified, so automatic main migrations are unsafe." };
  if (trackerHistoryValid !== true) return { allowed: false, reason: "The imported database migration history does not match the repository journal. No automatic main migrations are safe until an administrator reviews and establishes a verified baseline." };
  return { allowed: true, reason: "Recorded Drizzle migration history matches the repository journal or an archived exact forward-only lineage." };
}
