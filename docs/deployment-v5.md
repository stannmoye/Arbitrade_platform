# Arbitrade V5 Deployment and Recovery

## Runtime boundary
The V5 application is practice/simulation/research-only until a named, verifiable execution and settlement provider is configured. No seed balance or configured profit is withdrawable or presented as a real return.

## Container
- Node.js 22 and pnpm 10.18.
- `DATABASE_URL` is required at runtime for persistent data.
- `MANUS_PROJECT_ID`, `MANUS_JWT_SECRET`, and `MANUS_OAUTH_API_URL` remain server-only.
- `PORT` defaults to 3000.
- Health check: `GET /api/health`.

## Migrations and seed
1. Back up the MySQL database.
2. Run the additive Drizzle migration set, including `drizzle/0005_v5_foundation.sql`.
3. Verify migration completion and run ledger/balance reconciliation.
4. Only in a non-production environment, run `installer/v5-practice-seed.sql`.
5. Never run practice seed data against a live-money database.

## Scheduled endpoints
- `POST /api/scheduled/daily-reports` — generate reports after each customer's local reporting day closes.
- `POST /api/scheduled/email-queue` — process queued email jobs with idempotent retries.
- `POST /api/scheduled/reconcile` — compare stored wallet balances with immutable ledger totals.
- `POST /api/scheduled/settlements` — settle eligible practice/simulation investments exactly once.

Use UTC cron and inspect each customer's timezone boundary inside the handler. A failed job must remain visible and retryable.

## cPanel/shared hosting
Required capabilities: Node.js 22+, MySQL 8-compatible database, HTTPS, writable application storage or object storage, cron, outbound HTTPS, and SMTP/API credentials. PHP-only hosting cannot run the Express server. Use a reverse proxy or the host's Node application runner, protect `.env`, and remove/rename the installer after setup.

## Recovery
- Restore the latest database backup before application files.
- Run migrations forward; never rewrite ledger history.
- Reconcile stored balances against ledger totals.
- Mark incomplete jobs for idempotent retry.
- Keep live-money execution disabled until provider state and settlement results are verified.
