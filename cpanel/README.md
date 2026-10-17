# cPanel deployment

This repository is a production Node.js application. It requires cPanel **Setup Node.js App** (Node 20+), MySQL/MariaDB, HTTPS, and cron. PHP-only hosting cannot run the Express server.

## Browser-assisted installer

For the guided configuration wizard, follow [installer/README.md](../installer/README.md). The wizard checks the database and writes protected configuration; because PHP cannot run this Node.js app's migrations, finish from the private cPanel terminal with one of:

- New empty database: `node installer/run-install.mjs --fresh-install`
- Existing database already imported: `node installer/run-install.mjs --existing-database`

Do not choose fresh-install mode for a database containing existing customer or wallet records. The installer intentionally does not replace existing accounts or import a database dump over HTTP.

## 1. Create the cPanel resources

1. Create a MySQL database and a dedicated database user.
2. Grant that user all privileges on the application database.
3. Create a Node.js application in cPanel with the repository directory as the application root.
4. Set the startup file to `dist/index.js` and the application URL to the HTTPS domain.
5. Create the environment variables from `.env.example` in cPanel; do not upload `.env` to a public directory.

## 2. Install and initialize

From the Node application terminal:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:portal-migrate
NODE_ENV=production node scripts/apply-mining-migrations.mjs --confirm-host-migration --confirm-production
NODE_ENV=production pnpm db:mining-rates -- --confirm-host-migration --confirm-production
NODE_ENV=production pnpm db:mining-enable-rewards -- --confirm-host-migration --confirm-production
pnpm build
ADMIN_EMAIL=admin@your-domain.example ADMIN_PASSWORD='use-a-new-12-character-password' \
CUSTOMER_EMAIL=customer@your-domain.example CUSTOMER_PASSWORD='use-a-different-12-character-password' \
pnpm accounts:provision
```

Set `DATABASE_URL` to the application's existing MySQL/MariaDB database; the migration and CKI wallet/ledger use that same database, and this process does not create a second database. Verify the target privately before supplying the confirmation flags. The mining schema migration is forward-only and preserves existing contract snapshots, balances, and ledger history; the CKI rate migration creates new package versions for future purchases only. The final, idempotent enablement migration writes a versioned `globalEnabled=true` setting effective at run time, starts eligible existing contracts from then on using their saved rates, and creates no retroactive credits. The admin portal can still change this setting later.

Run the provisioning command only through the private cPanel terminal on a fresh installation. For an existing-data move, restore the existing database instead of creating/provisioning replacement accounts; see the data-preserving procedure below. Passwords are salted and hashed with scrypt and are never stored in the repository or `.env`.

The command prints the account email addresses only. Keep the two passwords in your private password manager and change them after the first login if they were used as temporary onboarding credentials.

## 3. Start and verify

Start/restart the cPanel Node application, then verify:

- `GET /api/health` returns `{"status":"ok"}`
- customer registration creates a row in `users`
- administrator login uses the provisioned database account
- no customer can access administrator procedures
- HTTPS cookies are enabled and the application URL is correct

## 4. Cron

Use cPanel Cron Jobs with UTC schedules for the scheduled handlers documented in `docs/deployment-v5.md`. Use the application's signed scheduler secret or protected server route; never expose a cron endpoint without authentication. The installer cannot create or verify cPanel cron entries unless your hosting account exposes an authorized cPanel API; verify each entry in cPanel after configuring it.

## 5. Production boundary

The product is production-deployable, but real-money execution and verified returns remain disabled until an actual execution/settlement provider is configured and approved. The application must not credit configured rates as real profit. Do not import development/demo seed data into production.

## 6. Recovery

Back up MySQL before migrations. Restore the database first, run forward migrations, reconcile wallet balances against the immutable ledger, then restart the Node application. Keep `.env`, uploads, logs, and database backups outside the public web root.

For host-to-host migration, encrypted backup/restore steps, and preservation of admin settings and CKI package versions, follow [`docs/host-migration-and-persistence.md`](../docs/host-migration-and-persistence.md). The application source on GitHub does not contain live database state; restore the database or point the app at the existing persistent database.
