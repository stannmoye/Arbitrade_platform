import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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
  return { journal, migrations };
}

export function validateMainMigrationHistory(trackerRows, expectedMigrations) {
  if (!Array.isArray(trackerRows) || trackerRows.length === 0) return { allowed: false, reason: "The Drizzle migration tracker is empty or unreadable." };
  if (!Array.isArray(expectedMigrations) || expectedMigrations.length === 0) return { allowed: false, reason: "The repository migration journal could not be verified." };
  const expectedByHash = new Map(expectedMigrations.map((migration, index) => [migration.hash, { createdAt: migration.createdAt, index }]));
  const seen = new Set();
  const seenIndexes = new Set();
  for (const row of trackerRows) {
    const hash = String(row?.hash ?? "");
    const createdAt = Number(row?.created_at);
    const expected = expectedByHash.get(hash);
    if (!/^[a-f0-9]{64}$/i.test(hash) || !expected) return { allowed: false, reason: "The Drizzle tracker contains a migration hash that does not match the repository journal." };
    if (seen.has(hash)) return { allowed: false, reason: "The Drizzle tracker contains duplicate migration hashes." };
    if (!Number.isSafeInteger(createdAt) || createdAt !== expected.createdAt) return { allowed: false, reason: "A recorded Drizzle migration timestamp does not match its repository journal entry." };
    seen.add(hash);
    seenIndexes.add(expected.index);
  }
  const appliedIndexes = [...seenIndexes].sort((left, right) => left - right);
  if (appliedIndexes.some((index, position) => index !== position)) {
    return { allowed: false, reason: "The Drizzle tracker has a gap in the ordered migration journal; automatic migration is unsafe." };
  }
  return { allowed: true, reason: "Recorded Drizzle migrations form a contiguous prefix matching the repository journal." };
}

export function classifyMainMigrationPreflight({ mode, tableCount, trackerExists, trackerCount, trackerHistoryValid }) {
  if (mode !== "existing") return { allowed: true, reason: "Fresh-install mode is handled by the empty-database check." };
  if (!Number.isInteger(tableCount) || tableCount < 1) return { allowed: false, reason: "Existing-database mode requires a non-empty imported database." };
  if (!trackerExists) return { allowed: false, reason: "The imported database has no __drizzle_migrations tracker. Its migration history cannot be verified, so automatic main migrations are unsafe." };
  if (!Number.isInteger(trackerCount) || trackerCount < 1) return { allowed: false, reason: "The imported database has an empty or unreadable __drizzle_migrations tracker. Its migration history cannot be verified, so automatic main migrations are unsafe." };
  if (trackerHistoryValid !== true) return { allowed: false, reason: "The imported database migration history does not match the repository journal. No automatic main migrations are safe until an administrator reviews and establishes a verified baseline." };
  return { allowed: true, reason: "Recorded Drizzle migration history matches the repository journal." };
}
