# Arbitrade Platform

Arbitrade is a Node.js/Express and React customer-and-operations platform for database-backed opportunity workflows, wallets, immutable ledger records, reporting, support, and administration.

## Production requirements

- Node.js 20+ (Node.js 22 recommended)
- pnpm 10.18
- MySQL 8-compatible or MariaDB database
- HTTPS
- SMTP or an approved email provider
- cPanel Setup Node.js App or a VPS

## Self-hosted runtime

The runtime uses Arbitrade-owned MySQL sessions, the configured MySQL/MariaDB database, persistent local file storage, a database-backed scheduler and operator-configured optional integrations. No hosted builder identity, API proxy, storage gateway or scheduler is required. Read [the self-hosted deployment guide](docs/SELF_HOSTED_DEPLOYMENT.md) before installing or upgrading.

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

Set `DATABASE_URL` for the application database. The installer generates security secrets automatically; when no installer-provided secrets exist, the runtime generates and persists them in a private `.arbitrade-runtime-secrets.json` file. Keep that file on durable private storage and back it up. Do not commit `.env` or runtime secret files.

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

The trading workflow records real-money trading allocations, capital movements, realized results, fees, and settlement in the customer's internal ledger. Financial changes must be supported by recorded trade lifecycle/result data and posted transactionally and idempotently; configured estimates alone must never be recorded as realized profit.

## Trading financial accounting

Trading is treated as a real-money operation. Trading allocations, capital debits and returns, realized profits, platform fees, losses, and settlement records must be posted to the customer's internal ledger as appropriate to the actual trade lifecycle. Every posting must be durable, auditable, transactional, and idempotent. The interface must display committed ledger results, not create financial changes on its own. Deposit and withdrawal workflows are specified separately.

## OAuth and email

OAuth callback URLs:

```text
https://YOUR_DOMAIN/api/oauth/google/callback
https://YOUR_DOMAIN/api/oauth/microsoft/callback
```

Configure email delivery from the authenticated admin portal after installation. Email, AI, speech transcription, image, and maps integrations are optional and are not required for the application to start.

## Recovery

Back up MySQL before migrations. Restore the database first, run forward migrations only, reconcile stored balances against the immutable ledger, retry incomplete jobs idempotently, and then restart the Node application.


## Canonical build and release instructions

All CI and external deployment tools should use the repository-root `Dockerfile` and build from the verified `main` commit. See [`BUILD_AND_RELEASE.md`](BUILD_AND_RELEASE.md) for the standard build commands, required runtime configuration, release gates, and source-of-truth policy. Do not deploy from an unmerged release branch or ZIP archive.

## Connected coding agents and build platforms

Read [`AGENTS.md`](AGENTS.md), [`BUILD_SOURCE.json`](BUILD_SOURCE.json), [`docs/REPOSITORY_GUIDE.md`](docs/REPOSITORY_GUIDE.md), and [`BUILD_AND_RELEASE.md`](BUILD_AND_RELEASE.md) before building or changing this application. Resolve the current full SHA of `main` at build time. Use repository root as the build context and the root `Dockerfile` as the production container definition; do not use an unmerged feature branch, a cached main SHA, or a historical Stage 4/Pass 4-only ZIP as the latest source.

The current full-application release workflow is [`.github/workflows/full-production-release.yml`](.github/workflows/full-production-release.yml). It packages the integrated application from `main`, verifies Stages 1–5 and the six theme variants, and attaches a detached SHA-256 checksum. See `BUILD_SOURCE.json` for artifact scope and acceptance status. Passing build checks does not by itself mean hosted Stage 5 acceptance or production certification is complete.


## Canonical trading system requirements

Before changing the customer Trading page or any trading-related backend, read [docs/TRADING_SYSTEM_SPECIFICATION.md](docs/TRADING_SYSTEM_SPECIFICATION.md). This is the canonical product contract for package eligibility, automatic opportunity processing, insufficient-balance opportunity cards, trade lifecycle, fee and wallet accounting, company catalogue/rotation, notifications, and admin controls. All developers and AI coding agents must follow it and update the specification and companion PDF together when requirements are formally revised.
