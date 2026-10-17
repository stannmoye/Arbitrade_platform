# Arbitrade production installer

## Supported hosting

- **cPanel with Setup Node.js App:** Node.js 20+, pnpm 10.18, MySQL/MariaDB, HTTPS, and a private terminal are required.
- **VPS / Node-compatible host:** Node.js 20+, pnpm 10.18, MySQL/MariaDB, HTTPS, and shell access are required.
- **PHP-only hosting:** unsupported for the application runtime. The PHP page is only a configuration wizard; it cannot run the Node.js app or its migrations by itself.

## Browser-assisted installation

1. Upload/deploy the application into its private application root. Set up the Node.js app in cPanel and create a database plus a dedicated database user. Grant that user privileges on the application database.
2. For a **fresh installation**, select a new, empty database. For an **existing installation**, restore/import the application's database first. Do not use fresh-install mode with an existing database.
3. Temporarily open /installer/ over HTTPS and complete index.php. It verifies database connectivity and checks whether the database matches the selected mode. It writes .env with mode 0600, a one-time .installer-bootstrap.json with mode 0600, and a .configured lock. It does not run migrations from PHP.
4. In the **private cPanel terminal**, change to the application root and run exactly one matching command.

   Fresh database:

       node installer/run-install.mjs --fresh-install

   Existing database already imported:

       node installer/run-install.mjs --existing-database

5. The script verifies Node.js version, required secrets, database connectivity, database state, and the saved install mode before doing work. It installs locked dependencies and builds the app. Fresh mode applies the documented initial schema and creates the administrator from the one-time bootstrap; existing mode runs pending Drizzle migrations and does not replace accounts or credentials. The one-time bootstrap is deleted after successful completion and .installed is written as a lock.
6. Configure cPanel's Node.js startup file as dist/index.js, restart the app, and check https://YOUR_DOMAIN/api/health returns {"status":"ok"}. Test administrator login, customer login, email delivery if configured, and access controls.
7. Remove or deny public access to the installer directory after verification. Keep .env, the bootstrap file, database dumps, uploads, and logs outside the public document root whenever possible. The repository's .htaccess also denies HTTP access to installer secrets on Apache, but do not rely on that as the only protection.

## Existing-database moves

The installer intentionally does **not** import a database dump in the browser and does not overwrite a non-empty database. Restore the canonical database backup using the protected cPanel terminal procedure in ../cpanel/README.md and ../docs/host-migration-and-persistence.md before choosing existing-database mode. Verify the target database carefully; wallet, ledger, customer, admin, package, and settings data must remain together.

## Recovery and safety

- Do not delete .configured or .installed to reinstall over a live site.
- If a run fails before completion, inspect the terminal error and correct the cause before rerunning the same command. The one-time bootstrap remains available until the account-creation step succeeds; it contains a plaintext password and must be protected.
- Back up MySQL before applying migrations. Existing-mode migrations are forward migrations, not a database restore.
- Do not automatically enable reward processing or live financial execution as part of installation. Any provider-dependent execution must be configured and independently verified separately.
- Configure SMTP, OAuth callback URLs, SPF, DKIM, DMARC, rate limits, CSRF protections appropriate to the deployment, administrator 2FA, backups, and monitoring before production launch.
