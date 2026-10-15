# GitHub-backed sandbox state

This project can persist the live application database in the private GitHub repository at:

```text
backups/live/latest.sql.gz
```

The snapshot contains the database records for users, wallet balances, ledger history, mining packages, mining contracts, economics versions, admin settings, and other application state.

## Save current state before changing or replacing a sandbox

From the repository root on the running sandbox:

```bash
set -a
. ./.env
set +a
scripts/backup-to-github.sh
```

The script creates a transaction-consistent compressed MySQL dump, commits it, and pushes it to the current GitHub branch. Each commit preserves the previous snapshot in Git history.

Run this after creating or editing mining packages, changing wallet balances, changing admin settings, provisioning accounts, or making other database changes.

## Restore into a new sandbox

Clone the repository, create an empty MySQL/MariaDB database, configure `.env` with its `DATABASE_URL`, and run:

```bash
set -a
. ./.env
set +a
scripts/restore-from-github.sh
pnpm db:migrate
pnpm db:portal-migrate
pnpm build
pnpm start
```

The restore script refuses to import into a non-empty database. Use the same application `SESSION_SECRET` and `PASSWORD_PEPPER` when the existing sessions, encrypted settings, or account behavior must remain compatible.

## Important operating rule

GitHub stores the snapshot, not a live SQL server. A database change is not in GitHub until `scripts/backup-to-github.sh` has been run and the push succeeds. Before replacing or deleting a sandbox, always run the backup command and confirm the commit appears on GitHub.

This workflow intentionally uses the private repository as the state store. Keep repository access restricted because the snapshot contains application data and password hashes. Do not commit a plaintext `.env` or database connection password; those are deployment connection settings, separate from the application records inside the snapshot.
