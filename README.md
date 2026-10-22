# Arbitrade Platform

Arbitrade is a Node.js/Express and React customer-and-operations platform for database-backed opportunity workflows, wallets, immutable ledger records, reporting, support, and administration.

## Production requirements

- Node.js 20+ (Node.js 22 recommended)
- pnpm 10.18
- MySQL 8-compatible or MariaDB database
- HTTPS
- SMTP or an approved email provider
- cPanel Setup Node.js App or a VPS

## Database source of truth

The repository-root `database.sql` is the single canonical database artifact for this application. It contains the database-backed application state, including accounts, wallets, balances, ledgers, mining packages, mining contracts, CKI economics, settings, and portal records. Before moving hosts or completing database changes, run `pnpm db:backup:github`; on a new empty database, run `pnpm db:restore:github`. See [`DATABASE_SOURCE_OF_TRUTH.md`](DATABASE_SOURCE_OF_TRUTH.md).

The application does not ship default users, default passwords, demo seed data, or client-only authentication fallbacks.

## Local development

```bash
pnpm install
cp .env.example .env
pnpm check
pnpm test
pnpm dev
```

Set `DATABASE_URL`, `SESSION_SECRET`, and `PASSWORD_PEPPER` before using authentication. Configure `TOTP_ENCRYPTION_KEY` as a stable 32-byte key (64 hex characters or base64) before customer authenticator enrollment; losing or rotating it makes enrolled authenticator secrets unreadable. Do not commit `.env` or encryption keys. After enrollment, save the one-time recovery codes offline: each code can start one replacement setup, and the new authenticator must be confirmed within ten minutes. Regenerating codes invalidates the old set. Recovery codes do not replace a lost encryption key; restore that key from its protected backup.

## Production build

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
ADMIN_EMAIL=admin@your-domain.example ADMIN_PASSWORD='use-a-new-12-character-password' \
CUSTOMER_EMAIL=customer@your-domain.example CUSTOMER_PASSWORD='use-a-different-12-character-password' \
pnpm accounts:provision
pnpm start
```

The provisioning command creates both required accounts in MySQL, stores salted scrypt hashes, and never stores plaintext passwords in the repository.

Migration `0006_v5_reporting_jobs.sql` adds customer reporting-timezone history, daily-report preferences, failed-job visibility, and the customer/reporting-day uniqueness invariant. Back up MySQL before applying it and reconcile wallet balances afterward.

## cPanel deployment

Follow [`cpanel/README.md`](cpanel/README.md). The browser-assisted setup wizard is documented in [`installer/README.md`](installer/README.md): it validates database access and writes protected configuration, then the private cPanel terminal runs `node installer/run-install.mjs --fresh-install` for a new empty database or `node installer/run-install.mjs --existing-database` after an existing database has been imported. It never replaces existing account credentials. Configure the Node application startup file as `dist/index.js`, keep `.env` outside the public document root, and use cPanel Cron for authenticated scheduled work. PHP-only hosting cannot run the Express application.

## Main routes

- `/` — workspace gateway
- `/customer` — database-authenticated customer portal
- `/ops-console-7f3a` — database-authenticated administrator portal
- `/api/health` — health check

## Database and security

Customer and administrator accounts, roles, packages, opportunities, balances, ledger entries, support tickets, notifications, and operational settings are stored in MySQL. Local passwords use salted scrypt hashes; sessions are signed, httpOnly cookies. Financial values use decimal-safe server-side rules and immutable ledger records.

Before production launch, configure HTTPS, SMTP, rate limiting, CSRF protections appropriate to the deployment, admin 2FA, backups, reconciliation, and provider secrets through the host environment.

The V5 workflow safety layer blocks `LIVE` execution without a named provider, execution reference, and result-retrieval mechanism. Settlement calculations require a verified provider result reference; configured opportunity estimates are never sufficient.

## Financial safety boundary

The product is production-deployable, but real-money execution and verified returns are blocked until a named, approved execution/settlement mechanism is configured and independently verified. Until then, opportunities must be classified as Practice, Simulation, or Research. The application must not credit configured estimates as real profit or present simulated balances as withdrawable funds.

## OAuth and email

OAuth callback URLs:

```text
https://YOUR_DOMAIN/api/oauth/google/callback
https://YOUR_DOMAIN/api/oauth/microsoft/callback
```

Keep OAuth client secrets and SMTP credentials server-side. Configure SPF, DKIM, DMARC, sender verification, and failure/retry handling.

## Recovery

Back up MySQL before migrations. Restore the database first, run forward migrations only, reconcile stored balances against the immutable ledger, retry incomplete jobs idempotently, and then restart the Node application.
