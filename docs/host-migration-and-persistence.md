# Hosting, persistence, and moving Arbitrade to a new host

## What must persist

GitHub permanently stores the application source, migrations, and deployment instructions. It is not the live application database. Customer accounts, CKI balances and ledgers, mining contracts, package versions, admin economics versions, portal settings, and audit events are stored in MySQL/MariaDB. They remain available after an app-host change only if the new host points to the same database or that database is restored from a current backup.

Do **not** commit a plaintext database dump, `.env`, passwords, API credentials, `SESSION_SECRET`, or `PASSWORD_PEPPER`. Keep encrypted backups in private/off-site backup storage; keep the GPG key in a separate password manager or other secure location. An encrypted file without its key cannot be restored.

## Recommended arrangement

Use a database service that is independent of the app host, if available: cPanel or a sandbox runs the Node.js app, while a persistent MySQL/MariaDB database holds the state. Configure each app deployment with its own private environment, pointing at the same database. This separates host replacement from data retention.

If a sandbox only supplies a local database, treat a newly created sandbox as a separate environment. It does not automatically share or sync the old sandbox database. Use the backup/restore procedure below. On cPanel, ensure the account includes the Node.js application runner and persistent MySQL/MariaDB; PHP-only hosting is insufficient for this application.

## Move an existing deployment without losing current data

1. **Prepare the destination.** Create the Node.js app and an empty MySQL/MariaDB database with a dedicated user. Install the same application release from GitHub. Never restore over a database containing tables.
2. **Stop writes on the old host.** Put the application in a maintenance window and stop its Node.js process and any cron/worker jobs. Do not run both hosts as active writers during the final transfer.
3. **Take a fresh final backup on the old host.** From a private terminal with its `DATABASE_URL` set, run `scripts/backup-sandbox-db.sh <private-output.sql.gz.gpg> <passphrase-file>`. The helper creates a transaction-consistent encrypted full database dump and verifies it. Also preserve the runtime configuration using `scripts/backup-sandbox-runtime.sh`; review host-specific URLs and credentials before reuse. Store the encrypted archives off the old host and retain their key separately. Do not rely on a months-old repository snapshot when the live database has newer changes.
4. **Restore the database to the destination.** Set the destination's private `DATABASE_URL` to the empty target database and run `scripts/restore-sandbox-db.sh <backup.sql.gz.gpg> <passphrase-file>`. It verifies the archive and refuses a non-empty database. If the host lacks the MariaDB/MySQL client or GPG, restore from a trusted machine that can securely reach the destination DB, or use the hosting provider's documented database import path. Never place decrypted SQL or credentials in the public web root.
5. **Preserve secrets needed to read existing data.** Keep the existing `SESSION_SECRET` and `PASSWORD_PEPPER` unless intentionally rotating them with a tested account/session transition. The encrypted SMTP admin password uses a server secret; changing the encryption key can make it unreadable. Set new host URLs, OAuth callback URLs, and SMTP/provider credentials as private environment variables. Do not put secrets in GitHub.
6. **Apply forward migrations to the same database.** After restoring, set `DATABASE_URL` to that existing application database; mining contracts, CKI wallets, ledgers, and economics live alongside the other application data in that one database. Run `pnpm db:migrate`, then `pnpm db:portal-migrate`, then `NODE_ENV=production node scripts/apply-mining-migrations.mjs --confirm-host-migration --confirm-production` (omit `NODE_ENV=production` and `--confirm-production` only for a non-production environment). After privately verifying the target, apply initial CKI rates with `pnpm db:mining-rates -- --confirm-host-migration`; add `NODE_ENV=production` and `--confirm-production` in production. Migration 0045 adds reward-method snapshots; the CKI rate migration creates new versions for future purchases and does not rewrite active contract snapshots, customer balances, or ledger history.
7. **Build and verify before switching traffic.** Install from the lockfile, run `pnpm build`, start the Node app, and verify `/api/health`, customer/admin login, authorization, admin settings, package versions, balances, and ledger history. Only then point the domain at the new host and resume its scheduler. Keep a known-good backup and the old host stopped until reconciliation passes.

If the new host should use a different database rather than the restored one, do not provision demo accounts or seed over the restored records. Create a separate test environment or use the existing restored admin account.

## Keeping it durable after cutover

- Schedule encrypted daily database backups to storage independent from both the application host and its database host; retain multiple dated restore points and alert on failed or unexpectedly small backups.
- Back up runtime configuration separately, encrypted, and keep the decryption key separate from the archive.
- Test restoring to an empty disposable database periodically. A backup is not proven until the app can start against a restored copy and account/ledger checks pass.
- Keep application code and schema migrations in GitHub. Admin changes are versioned in the database and audit trail, not hard-coded in source; include the database in backups to preserve those settings.
- If the host is lost, deploy code from GitHub, restore the latest verified DB backup, apply forward migrations, set the protected runtime environment, then validate before reopening customer access.

## Current workspace boundary

A sandbox's local database is not live-synced to another sandbox or to GitHub. This repository contains encrypted historical snapshot artifacts, but a new host needs the **latest** backup and its separately stored passphrase. No data transfer occurs merely because code was merged to GitHub. Do not claim that current live customer data has moved until a fresh source backup has been restored and verified on the destination.
