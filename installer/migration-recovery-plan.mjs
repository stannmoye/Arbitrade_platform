const MIGRATION_STAGES = new Set([
  "main-database-migrations",
  "portal-database-migrations",
  "mining-database-migrations",
  "initial-reward-rate-migration",
]);

const TRACKER_STATES = new Set(["not_started", "complete", "partial", "unknown"]);

/**
 * Return a conservative, advisory-only recovery decision.
 *
 * This function never runs migrations, removes markers, or authorizes an
 * unattended retry. "complete" means tracker evidence only; schema verification
 * is a separate required input.
 */
export function planMigrationRecovery({
  stage,
  trackerStatus = "unknown",
  schemaVerified = false,
  backupVerified = false,
}) {
  if (typeof stage !== "string" || !stage.trim()) {
    return {
      decision: "manual_review_required",
      nextStep: "The install stage is missing; preserve all evidence and have an administrator inspect the installation and database.",
      retryAllowed: false,
    };
  }

  if (!backupVerified) {
    return {
      decision: "backup_required",
      nextStep: "Create a current database backup and verify that it can be restored before changing installation or migration state.",
      retryAllowed: false,
    };
  }

  if (!MIGRATION_STAGES.has(stage)) {
    return {
      decision: "inspect_stage_before_retry",
      nextStep: "Inspect the recorded stage, private terminal output, application artifacts, and database state. Do not rerun automatically.",
      retryAllowed: false,
    };
  }

  if (!TRACKER_STATES.has(trackerStatus)) {
    return {
      decision: "manual_review_required",
      nextStep: "Migration tracker evidence is invalid; inspect the actual tracker and schema before choosing a recovery action.",
      retryAllowed: false,
    };
  }

  if (trackerStatus === "partial") {
    return {
      decision: "manual_repair_required",
      nextStep: "A migration may have partially applied. Compare the exact migration SQL with the actual schema and data, then document a repair plan before retrying.",
      retryAllowed: false,
    };
  }

  if (trackerStatus === "unknown") {
    return {
      decision: "inspect_migration_state",
      nextStep: "Inspect migration records and actual schema. A missing or unreadable tracker does not prove that no migration ran.",
      retryAllowed: false,
    };
  }

  if (!schemaVerified) {
    return {
      decision: trackerStatus === "complete" ? "verify_schema_before_resume" : "verify_schema_before_retry",
      nextStep: "Verify the actual schema and data against the migration files; tracker status alone is not proof of completion or non-execution.",
      retryAllowed: false,
    };
  }

  if (trackerStatus === "complete") {
    return {
      decision: "migrations_verified",
      nextStep: "Do not rerun completed migrations. Have an administrator inspect the remaining installation stages and resume only the necessary non-migration work.",
      retryAllowed: false,
    };
  }

  return {
    decision: "reviewed_retry_candidate",
    nextStep: "Evidence indicates the migration has not started and the schema was independently verified. An administrator may approve a deliberate retry; this planner does not execute it.",
    retryAllowed: false,
  };
}
