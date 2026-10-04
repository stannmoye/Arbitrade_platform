# Arbitrade Platform

Arbitrade is a Node.js/Express and React customer-and-operations platform for database-backed opportunity workflows, wallets, immutable ledger records, reporting, support, and administration.

## Production requirements

- Node.js 20+ (22 recommended)
- pnpm 10.18
- MySQL 8-compatible or MariaDB database
- HTTPS
- SMTP or an approved email provider
- cPanel Setup Node.js App or a VPS

The application does not ship default users, default passwords, demo seed data, or client-only authentication fallbacks.

## Local development

```bash
pnpm install
cp .env.example .env
pnpm check
pnpm test
pnpm dev
```

Set `DATABASE_URL`, `SESSION_SECRET`, and `PASSWORD_PEPPER` before using authentication. Do not commit `.env`.

## Production build

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
ADMIN_EMAIL=admin@your-domain.example ADMIN_PASSWORD='use-a-new-12-character-password' pnpm admin:create
pnpm start
```

The administrator command stores a salted scrypt hash in MySQL and does not store the plaintext password.

## cPanel deployment

Follow [`cpanel/README.md`](cpanel/README.md). Configure the Node application startup file as `dist/index.js`, keep `.env` outside the public document root, and use cPanel Cron for authenticated scheduled work. PHP-only hosting cannot run this Express application.

## Main routes

- `/` — workspace gateway
- `/customer` — database-authenticated customer portal
- `/ops-console-7f3a` — database-authenticated administrator portal
- `/api/health` — health check

## Database and security

Customer and administrator accounts, roles, packages, opportunities, balances, ledger entries, support tickets, notifications, and operational settings are stored in MySQL. Local passwords use salted scrypt hashes; sessions are signed, httpOnly cookies. Financial values use decimal-safe server-side rules and immutable ledger records.

Before production launch, configure HTTPS, SMTP, rate limiting, CSRF protections appropriate to the deployment, admin 2FA, backups, reconciliation, and provider secrets through the host environment.

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
