# Sandbox database and integrated KYC

The sandbox app uses an isolated local MySQL database. The integrated application is based on `main`; KYC v2 is included in the same customer/admin app rather than being deployed as a separate branch. Keep `.env`, database passwords, session secrets, and plaintext test passwords out of GitHub.

## Initialize a disposable sandbox database

Load the private environment and provision the regular application schema using the repository's current schema. Use only an empty/disposable database for `push --force` because schema synchronization may change tables.

```sh
set -a
. ./.env
set +a
pnpm exec drizzle-kit push --force
pnpm db:portal-migrate
```

`db:portal-migrate` applies the additive KYC v2 and admin-email SQL migrations (`0034_kyc_v2.sql`, then `0035_email_notifications.sql`). Those migrations are idempotent and do not replay the historical migration chain. Several older migration files use `ADD COLUMN IF NOT EXISTS`, which MySQL 8 rejects; do not use the full legacy chain as a substitute for a current-schema setup without first repairing it.

## Portal testing

- Customer portal: `/customer` — includes KYC email and phone checks, address submission, document/liveness demo steps, and status tracking.
- Admin portal: `/ops-console-7f3a` — includes KYC Control Center, manual review, audit, SMTP/report tools, and the existing main-branch operations pages.
- Use the sandbox test credentials supplied by the project owner. Passwords and hashes are not included in this guide.

KYC is a **test workflow**, not a production identity-verification deployment. The customer document capture field currently records a demo storage key; there is no connected document-storage/OCR provider, SMS gateway, biometric/liveness provider, or sanctions-screening service. Address, document, and face decisions therefore remain in manual review or local demo mode. Admin policy settings are saved and audited, but provider-specific thresholds/retention are not enforced by an external verification service. Configure and validate providers before using this workflow for real customers.

The admin SMTP & Reports panel uses a database-backed SMTP configuration whose password is encrypted using `SESSION_SECRET` (or `PASSWORD_PEPPER`) before it is stored. Transactional KYC/authentication and queued account email use the separate runtime-configured secure mail transport; the app labels these channels separately.

## Data handling

The sandbox database is isolated from production. SQL snapshots can contain the two authorized sandbox accounts, their account records, and password hashes, so treat the full export as test data. Do not commit database dumps or restore them over production. The public sandbox URL is temporary; a sandbox service can stop when the workspace sleeps and is not a 24/7 production host.
