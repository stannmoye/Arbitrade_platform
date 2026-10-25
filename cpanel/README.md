# cPanel deployment

This repository is a production Node.js application. It requires cPanel **Setup Node.js App** (Node 20+), MySQL/MariaDB, HTTPS, and cron. PHP-only hosting cannot run the Express server.

## Browser-assisted installer

For the guided configuration wizard, follow [installer/README.md](../installer/README.md). The wizard checks the database and writes protected configuration; because PHP cannot run this Node.js app's migrations, finish from the private cPanel terminal with one of:

- New empty database: `node installer/run-install.mjs --fresh-install`
- Existing database already imported: `node installer/run-install.mjs --existing-database --confirm-existing-migrations`

Do not choose fresh-install mode for a database containing existing customer or wallet records. The installer intentionally does not replace existing accounts or import a database dump over HTTP.

## 1. Create the cPanel resources

1. Create a MySQL database and a dedicated database user.
2. Grant that user all privileges on the application database.
3. Create a Node.js application in cPanel with the repository directory as the application root.
4. Set the startup file to `dist/index.js` and the application URL to the HTTPS domain.
5. The browser installer defaults `TRUST_PROXY_HOPS=0` because it cannot safely infer your network topology. This is the safe direct-client mode and does not trust forwarded headers. Only change it to `1` after verifying that exactly one trusted reverse proxy sits in front of Node and sanitizes forwarded headers. If the proxy chain is unknown, keep `0`; invalid values fall back to `0` rather than crashing startup.
6. Create only any additional required environment variables from `.env.example` in cPanel; do not upload `.env` to a public directory.

## 2. Install and initialize

If you used the browser wizard, run only the matching installer command below. Do not separately rerun the migration/provisioning commands from older versions of this guide.

Fresh, empty database:

~~~bash
node installer/run-install.mjs --fresh-install
~~~

Existing database restored from a verified backup:

~~~bash
node installer/run-install.mjs --existing-database --confirm-existing-migrations
~~~

The existing-database command requires an explicit confirmation because it applies forward migrations. Before running it, verify DATABASE_URL points to the intended database and that a restorable backup exists. The installer runs the main Drizzle, portal, and idempotent mining migrations and builds the application. It does not import SQL dumps, replace existing account credentials, provision a replacement administrator, or enable reward processing automatically.

The fresh-install command creates the administrator account from the protected one-time bootstrap entered in the wizard. It does not create arbitrary demo customer accounts. Never run account provisioning against a restored production database.

After installation, restart the cPanel Node.js application. Then run these checks from the private application terminal:

~~~bash
pnpm installer:verify
~~~

Email delivery is configured after the administrator signs in. Open **Communications → Email & SMTP Settings**, choose the provider, save its credentials, and use the portal's test-email action. No email-provider environment variables are required for installation.

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
