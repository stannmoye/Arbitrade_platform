# Arbitrade production deployment and recovery

## Runtime

- Node.js 20+ (Node.js 22 recommended)
- pnpm 10.18
- MySQL 8-compatible or MariaDB database
- HTTPS and secure cookies
- cPanel Setup Node.js App or a VPS process manager
- cPanel Cron or an equivalent UTC scheduler
- SMTP/API credentials stored as server-side environment variables

Required environment variables are documented in `.env.example`. `DATABASE_URL`, `SESSION_SECRET`, and `PASSWORD_PEPPER` are mandatory for production.

## Database setup

1. Create a dedicated database and least-privilege application user.
2. Back up the database before applying migrations.
3. Back up the target database, run the base migrations with `pnpm db:migrate`, then apply portal migrations with `pnpm db:portal-migrate` and Mining migrations with `node scripts/apply-mining-migrations.mjs`. Apply the initial versioned CKI package rates using `NODE_ENV=production pnpm db:mining-rates -- --confirm-host-migration --confirm-production` after reviewing the target.
4. Provision an administrator using `pnpm admin:create` with `ADMIN_EMAIL` and `ADMIN_PASSWORD` supplied only in the private server shell.
5. Verify `/api/health`, customer registration, customer login, administrator login, and role-protected procedures.

No demo users, default passwords, or development seed data are shipped or imported by the production installer.

## cPanel

Follow [`cpanel/README.md`](../cpanel/README.md). Set the Node application startup file to `dist/index.js`, keep `.env` outside the public document root, and run `pnpm build` after installing dependencies and applying migrations.

PHP-only hosting cannot run this Express application. A cPanel account must provide the Node.js application runner.

## Email delivery and scheduled summaries

- This release supports SMTP only. Set `MAIL_PROVIDER=smtp` plus `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, and optionally `SMTP_FROM_NAME` / `SMTP_REPLY_TO` as **server-only environment secrets**. Do not place SMTP credentials in the admin settings database or commit a populated `.env` file.
- Until SMTP is complete, outbound delivery stays disabled. The app queues mail in an encrypted, idempotent outbox and retries temporary failures; check the admin Email center for readiness and send controlled test mail to the admin or one verified customer.
- Inbox verification and password recovery use hashed, expiring one-time codes with resend cooldowns and attempt limits. Inbox verification is not identity verification/KYC. Financial-looking alert templates explicitly identify internal ledger adjustments as simulated; they do not represent real deposits, withdrawals, custody, or payments.
- To enable daily customer summaries, set both `EMAIL_DAILY_DIGEST_TIME` (`HH:MM`, 24-hour local wall time) and `EMAIL_DAILY_DIGEST_TIMEZONE` (an IANA zone such as `Europe/London`). Digests are queued once per customer/local day only when SMTP is configured, the customer inbox is verified, and the customer has not opted out. No schedule is active while either setting is blank.
- The mail worker and daily scheduler run inside the application process. Keep that process continuously running; if the host sleeps or restarts, jobs resume after restart and the daily scheduler catches the configured minute when it next runs. For multi-instance production, use a durable external scheduler/worker and retain the outbox idempotency guarantees.

## Financial safety boundary

The application is production-deployable, but real-money execution and verified returns are **blocked** until a named, approved execution/settlement provider supplies verifiable results. Before that integration exists, opportunities must be classified as Practice, Simulation, or Research; no configured rate may be credited as real profit and no simulated balance may be presented as withdrawable funds.

## Mining simulation and earnings persistence

- A successfully confirmed purchase creates an active entitlement at purchase time and snapshots that published package version's daily CKI rate. Administrators can edit rates and publish a new package version through the admin portal; that changes future purchases, not existing contract snapshots.
- When the administrator enables reward processing, eligible package time is prorated using the snapshotted daily rate and the CKI/day ÷ 86,400-second formula. Non-zero rewards are transactionally recorded in the CKI wallet ledger, `mining_reward_events`, and package allocations, using idempotency keys and customer checkpoints. The periodic worker requires the application process to keep running.
- CKI package amounts are **internal simulated estimates**, not verified pool output, guaranteed returns, withdrawable balances, or cash payouts. The reward switch and all economics/package versions are persisted in MySQL/MariaDB; preserve that database (or restore a current backup) to keep admin edits across host changes.

## Host migration and persistence

Follow [`host-migration-and-persistence.md`](host-migration-and-persistence.md) for a verified encrypted backup/restore procedure, safe database cutover, secret continuity, and cPanel/sandbox host considerations. GitHub stores source and migrations, not live customer rows or administrator setting values.

## Recovery

1. Stop the Node application.
2. Restore the latest verified database backup.
3. Run forward migrations only; never rewrite immutable ledger history.
4. Reconcile stored wallet balances against ledger totals.
5. Mark incomplete jobs for idempotent retry.
6. Restart the application and verify health, authentication, authorization, reports, and email queue status.
