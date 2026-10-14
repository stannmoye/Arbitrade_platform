# cPanel deployment

This repository is a production Node.js application. It requires cPanel **Setup Node.js App** (Node 20+), MySQL/MariaDB, HTTPS, and cron. PHP-only hosting cannot run the Express server.

## 1. Create the cPanel resources

1. Create a MySQL database and a dedicated database user.
2. Grant that user all privileges on the application database.
3. Create a Node.js application in cPanel with the repository directory as the application root.
4. Set the startup file to `dist/index.js` and the application URL to the HTTPS domain.
5. Create the environment variables from `.env.example` in cPanel; do not upload `.env` to a public directory.

## 2. Install and initialize

For a **new, empty production database**, you can import [`deployment/cpanel_merged.sql`](../deployment/cpanel_merged.sql) once using phpMyAdmin's **Import** tab. It consolidates the numbered SQL migrations, including the 2-minute/10-minute boost policy, all six published package versions, their CKI daily limits, and automatic formula-reward activation, in migration order. Back up first; do not import the full bundle over an existing database. Because direct import does not stamp Drizzle's migration journal, **skip `pnpm db:migrate` after importing the bundle**. For an existing installation, back up and apply only pending forward migrations. The bundle creates schema and migration-defined defaults; it does not create admin credentials, import development/demo account data, or include private environment settings.

From the Node application terminal:

```bash
pnpm install --frozen-lockfile
# Skip this command if you imported deployment/cpanel_merged.sql above.
pnpm db:migrate
pnpm build
ADMIN_EMAIL=admin@your-domain.example ADMIN_PASSWORD='use-a-new-12-character-password' \
CUSTOMER_EMAIL=customer@your-domain.example CUSTOMER_PASSWORD='use-a-different-12-character-password' \
pnpm accounts:provision
```

Run the provisioning command only through the private cPanel terminal. It creates or updates one administrator row and one customer row in `users`. Passwords are salted and hashed with scrypt and are never stored in the repository or `.env`.

The command prints the account email addresses only. Keep the two passwords in your private password manager and change them after the first login if they were used as temporary onboarding credentials.

## 3. Start and verify

Start/restart the cPanel Node application, then verify:

- `GET /api/health` returns `{"status":"ok"}`
- customer registration creates a row in `users`
- administrator login uses the provisioned database account
- no customer can access administrator procedures
- HTTPS cookies are enabled and the application URL is correct

## 4. Cron

Mining reward accrual and CKI auto-conversion are scheduled inside the continuously running Node application process; no browser or mining-pool connection is needed. Keep that application online so worker cycles continue and recover idempotently after restarts. Use cPanel Cron Jobs only for the other scheduled handlers documented in `docs/deployment-v5.md`; use the application's signed scheduler secret or protected server route and never expose an unauthenticated cron endpoint.

## 5. Production boundary

The product is production-deployable. CKI rewards are calculated by the published per-package daily-limit formula and recorded in the internal CKI ledger; no third-party mining-pool settlement is used or implied. Disclose that credits are platform-calculated, not measured farm output or guaranteed returns; CKI itself is not directly withdrawable, though it may be converted internally to a selected main-wallet asset under the configured swap terms. Do not import development/demo seed data into production.

## 6. Recovery

Back up MySQL before migrations. Restore the database first, run forward migrations, reconcile wallet balances against the immutable ledger, then restart the Node application. Keep `.env`, uploads, logs, and database backups outside the public web root.
