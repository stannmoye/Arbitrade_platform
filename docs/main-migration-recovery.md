# Main Drizzle migration failure recovery

## Purpose

The main MySQL migration chain contains historical DDL that is not universally idempotent. MySQL can commit DDL before a migration fails, while Drizzle records a migration only after its SQL finishes. Retrying a failed migration blindly can therefore fail again or leave the schema inconsistent.

The guarded runner (`pnpm db:migrate` and the migration step used by the installer) records a persistent status in `main_migration_run_guard`. If a run is left `started` or marked `failed`, the runner refuses another automatic attempt. This is an intentional safety stop, not automatic recovery.

## Required recovery procedure

1. Stop application writes and background workers for the affected database.
2. Take a fresh backup and prove it can be restored to an isolated database before changing the affected database.
3. Record the current values in `main_migration_run_guard` and `__drizzle_migrations`; preserve the failure logs and the exact deployed commit.
4. Identify the first journal entry not recorded in `__drizzle_migrations`. Inspect that SQL file statement-by-statement and compare each statement with the actual database schema. Do not assume that a missing tracker row means none of its DDL ran.
5. Prefer restoring the verified backup from immediately before the failed migration, then rerun through `pnpm db:migrate`. If restore is not possible, have a database administrator reconcile every partially applied DDL statement and verify the resulting schema and data against the migration's intended state.
6. Only after the database is restored or the failed migration has been fully reconciled should an administrator update the Drizzle migration history and reset `main_migration_run_guard`. Use the exact migration file checksum and `when` timestamp from this checkout's `drizzle/meta/_journal.json`; do not guess values or mark a migration applied merely to bypass the guard.
7. Run the guarded migration command, then the portal/mining migration checks and the application smoke tests. Preserve the backup until all checks pass.

## Important limits

- The guard prevents repeat attempts through the repository's `db:migrate` and `db:push` scripts; it cannot protect a person who bypasses it and invokes `drizzle-kit migrate` directly.
- It cannot retrospectively identify a partial migration that happened before the guard existed.
- A migration tracker count alone does not prove schema integrity.
- Never test recovery against production first. Reproduce the recovery on an isolated restored copy.

If the database history is missing, empty, or cannot be reconciled confidently, stop and restore a verified backup or have an experienced database administrator establish a documented baseline. Do not use the installer to force a migration through an unknown schema.
