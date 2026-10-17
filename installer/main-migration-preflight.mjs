/**
 * Fail closed when an imported database has no usable Drizzle migration history.
 * MySQL DDL is not fully transactional, so an untracked schema cannot safely be
 * treated as a clean starting point for automatic migrations.
 */
export function classifyMainMigrationPreflight({ mode, tableCount, trackerExists, trackerCount }) {
  if (mode !== "existing") return { allowed: true, reason: "Fresh-install mode is handled by the empty-database check." };
  if (!Number.isInteger(tableCount) || tableCount < 1) {
    return { allowed: false, reason: "Existing-database mode requires a non-empty imported database." };
  }
  if (!trackerExists) {
    return {
      allowed: false,
      reason: "The imported database has no __drizzle_migrations tracker. Its migration history cannot be verified, so automatic main migrations are unsafe.",
    };
  }
  if (!Number.isInteger(trackerCount) || trackerCount < 1) {
    return {
      allowed: false,
      reason: "The imported database has an empty or unreadable __drizzle_migrations tracker. Its migration history cannot be verified, so automatic main migrations are unsafe.",
    };
  }
  return { allowed: true, reason: "A non-empty Drizzle migration tracker exists." };
}
