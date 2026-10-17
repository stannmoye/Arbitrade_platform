/**
 * Conservative status labels for read-only migration diagnostics.
 * These labels describe tracker evidence, not proof that every schema change
 * is healthy. MySQL DDL can partially apply before a migration is recorded.
 */
export function classifyMigrationTracker({ trackerExists, appliedCount, expectedCount }) {
  if (!trackerExists) {
    return {
      status: "cannot_verify",
      explanation: "The migration tracker is missing; this does not prove migrations never ran.",
    };
  }
  if (!Number.isInteger(appliedCount) || appliedCount < 0 || !Number.isInteger(expectedCount) || expectedCount < 1) {
    return { status: "cannot_verify", explanation: "Tracker counts are invalid or unavailable." };
  }
  if (appliedCount === 0) {
    return { status: "not_started", explanation: "The tracker exists but has no recorded migrations." };
  }
  if (appliedCount < expectedCount) {
    return {
      status: "incomplete_or_partial",
      explanation: "Fewer migrations are recorded than this checkout expects; inspect the exact schema before retrying.",
    };
  }
  if (appliedCount === expectedCount) {
    return {
      status: "tracker_count_complete_schema_unverified",
      explanation: "The expected number of migrations is recorded, but this count alone does not verify schema integrity.",
    };
  }
  return {
    status: "cannot_verify",
    explanation: "The tracker has more entries than this checkout expects; the database may belong to another release.",
  };
}
