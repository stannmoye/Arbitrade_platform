# Arbitrade installation and deployment

## Supported environments

- **cPanel:** cPanel Setup Node.js App, Node.js 20+ (Node 22 recommended), pnpm 10.18.x, MySQL/MariaDB, HTTPS, and private terminal access.
- **VPS:** Debian/Ubuntu, Node.js 20+, pnpm 10.18.x, MySQL/MariaDB, and root/sudo access for server provisioning.
- **PHP-only hosting is not sufficient.** The PHP wizard configures this Node.js application; it cannot itself keep the Express server running or safely execute privileged commands.

## Browser wizard

1. Upload/extract the repository into a private application root. Create a MySQL database and dedicated user in cPanel and grant that user privileges on the database.
2. Create the Node.js app in cPanel if you use cPanel. Use the repository as application root and dist/index.js as the startup file.
3. Open /installer/ over HTTPS and follow the staged wizard. It displays PHP/MySQL prerequisites and validates the supplied database connection. Use a new, empty database for fresh installation.

   The first-screen preflight also checks PHP 8.2+, required PHP extensions (`pdo_mysql`, `openssl`, `json`, `mbstring`), configuration-directory write access, package/lockfile presence, dependency and build artifacts, HTTPS detection, measurable free disk space, and existing install-lock state. Critical PHP/version/extension/package/permission failures are blocked on submission. Node.js version is deliberately not guessed by PHP: verify Node.js 20+ in cPanel Setup Node.js App; the private Node installer checks the actual runtime.
4. For existing data, first take and verify a current restorable backup, then import the intended SQL backup into the target database using cPanel/phpMyAdmin or a trusted private terminal. Select **Restore/migrate existing database** in the wizard and confirm both the backup and import. The public web wizard intentionally does not upload or execute SQL dumps; large imports can exceed cPanel upload/execution limits and make recovery unreliable.
5. The wizard tests the database connection, refuses a non-empty database in fresh mode, requires the `users` table in existing mode, and records the sorted database table inventory in the protected one-time bootstrap. Keep `.env`, `.installer-bootstrap.json`, and `.configured` private; do not commit or share them.
6. From the private application terminal, run exactly one matching command:

~~~bash
node installer/run-install.mjs --fresh-install
~~~

   Fresh database.

~~~bash
node installer/run-install.mjs --existing-database --confirm-existing-migrations
~~~

   Existing database already restored.

   The script validates Node.js, pnpm, configuration, database connectivity, and database state before installing locked dependencies and building. It writes a private `installer/.install-in-progress.json` marker before dependency installation and updates the current stage before each migration/build/admin step. If a command fails or the process is interrupted, the marker remains and blocks a blind rerun; review the saved stage, private terminal output, backup, and migration state before an administrator deliberately clears the marker for recovery. It re-reads the current database table inventory and compares it with the inventory captured by the browser wizard; if the target database has changed, it stops before migrations and asks you to verify the target and rerun the wizard. Fresh mode requires the captured and current database to be empty, applies the initial schema, and creates the administrator. Existing mode requires explicit browser backup/import confirmation and the CLI confirmation flag because it applies forward migrations. It runs the main Drizzle migrations, portal migrations, and idempotent mining migrations/package-rate migration; it does not import a dump or create a replacement administrator. Reward processing is not automatically enabled.

7. Set/restart the cPanel Node.js application with startup file dist/index.js.
8. After the app is running, run the post-install checks from the private terminal:

~~~bash
pnpm installer:verify
~~~

   The verifier loads `.env` relative to the application root (rather than assuming the terminal's current directory), checks the Node.js 20+ runtime and pnpm 10.18.x version, confirms the package and lockfile exist, validates that the package start script launches `dist/index.js` in production mode, checks that `PUBLIC_APP_URL` is a valid HTTPS URL, and then checks database connectivity, required tables, administrator presence, migration trackers, the build artifact, installer locks, bootstrap cleanup, incomplete-installation markers, `.env` permissions, SMTP connectivity when enabled, and GET `/api/health`. The health result includes response time. The final summary reports `READY`, `READY WITH WARNINGS`, or `NOT READY`; any failed check causes a non-zero exit code. A health check cannot pass until the Node.js application has been started. The install and SMTP CLI scripts also load `.env` from the application root.
9. If SMTP is configured, send an explicit test message to an address you control:

~~~bash
pnpm installer:test-smtp --to=you@example.com
~~~

   This verifies SMTP connectivity/authentication and sends one test email. Provider error details are deliberately limited to avoid logging secrets.
10. Remove or deny public access to /installer/ after verification. Keep .env, bootstrap state, SQL dumps, logs, and uploads private. The install lock is not a substitute for removing public access.

## Deployment diagnostics

Run this from the private application root after configuring the environment:

~~~bash
pnpm installer:diagnose
~~~

The read-only diagnostic checks the Node.js and pnpm versions, production start command, build artifact, required environment-variable presence, public URL/HTTPS, configured port, local TCP listener, `/api/health`, and a non-mutating MySQL `SELECT 1` connection check. When `MAIL_PROVIDER=smtp`, it also checks that required SMTP settings are present; it does not send a message or test the provider connection. Use `pnpm installer:test-smtp --to=you@example.com` for an explicit SMTP test.

It never prints database URLs, passwords, tokens, or other environment values. Database failures report an error code and troubleshooting guidance, not connection credentials. A successful result is a deployment triage aid, not proof that every feature works or that the installation is secure.

Common follow-up actions:
- **Database connection fails:** confirm the database exists, the configured user has privileges, the host/port is correct for the hosting provider, and the private environment value is current.
- **No local listener / health fails:** confirm the host's application port and startup-file settings, rebuild if needed, restart through cPanel Setup Node.js App or the configured VPS service, then inspect private logs.
- **Required environment setting missing:** configure it in the private `.env` or hosting environment; never paste secret values into issue reports.
- **HTTP public URL:** configure HTTPS and the correct `PUBLIC_APP_URL` before production traffic.

## Database safety

- Fresh mode refuses to proceed if the database contains tables.
- Existing mode requires an already imported database and never replaces existing account credentials.
- Back up MySQL before migrations. For host migration, follow the host migration and persistence guide in ../docs/host-migration-and-persistence.md.
- Do not run fresh mode against a restored or production database.
- Do not delete .configured or installer/.installed to force a reinstall over existing data.
- The wizard does not provide a browser-based SQL dump importer because large imports can exceed cPanel limits and make recovery unreliable.

## SMTP and OAuth

The browser wizard includes a **Test SMTP settings** action on the email step. Enter a recipient inbox you control; the test submits the SMTP values only to the server-side `installer/smtp-test.php` endpoint, which invokes the existing Nodemailer test script with a restricted child-process argument list and environment. It does not save `.env`, echo credentials, or log SMTP passwords. The web test requires Node.js to be visible in the PHP process PATH, installed `node_modules/nodemailer` and `node_modules/dotenv`, and PHP process execution support. Some cPanel hosts hide Node.js from PHP-FPM or disable `proc_open`; in that case, finish configuration and use the private terminal fallback below. A successful test means the SMTP server accepted the test message, not that it reached the recipient's inbox.

After installation, the private terminal fallback remains available:

~~~bash
pnpm installer:test-smtp --to=you@example.com
~~~

Configure SPF, DKIM, DMARC, and your provider's sender authorization separately.

Google and Microsoft OAuth callback URLs are generated from the application URL. Register the exact callback URLs in the provider consoles and test sign-in; credentials alone do not prove provider-side approval or callback configuration.

## Cron jobs

cPanel and VPS hosts expose different scheduler APIs. The installer does not pretend it can create cron jobs without an authorized host API. Review the deployment schedule documentation in ../docs/deployment-v5.md, configure only the jobs required by the installed version, use the documented authentication secrets, and verify each job in the hosting control panel. Never expose an unauthenticated cron endpoint.

## VPS provisioning

For an existing, built checkout on a supported Debian/Ubuntu VPS:

~~~bash
sudo bash installer/vps-setup.sh --domain=example.com
~~~

To install Node.js 22 and pnpm 10.18.x as well:

~~~bash
sudo bash installer/vps-setup.sh --domain=example.com --install-runtime
~~~

To request HTTPS after DNS points to the VPS and ports 80/443 are reachable:

~~~bash
sudo bash installer/vps-setup.sh --domain=example.com --email=admin@example.com --install-runtime --enable-https
~~~

The script requires a configured .env and built dist/index.js. It creates a dedicated service user, protected systemd environment file, systemd service, and nginx reverse-proxy configuration. It refuses to overwrite an existing service or nginx configuration. Inspect the script before running it as root. Cron tasks and application-specific secrets still require explicit configuration.

## Starting, restarting, and diagnosing the application

After building and configuring the application, use the runtime helper from the private application terminal:

~~~bash
pnpm installer:runtime
~~~

It checks the production start command, confirms `dist/index.js` exists, reads the configured `PORT` (default 3000), and requests the local `/api/health` endpoint. It does not print environment values or secrets. If health fails, it reports the next diagnostic steps.

- **cPanel:** open **Setup Node.js App**, verify Node.js 20+ and the application root, confirm the startup file is `dist/index.js`, then use the control panel's **Restart** action. Run `pnpm installer:runtime` again after restarting. The helper cannot call cPanel's process manager.
- **VPS configured by this repository's setup script:** run `sudo node installer/runtime-status.mjs --restart-vps`. This only restarts an already-active `arbitrade.service` through systemd and waits up to 30 seconds for local health. It will not create a missing service or overwrite configuration.
- **VPS diagnostics:** `sudo systemctl status arbitrade.service --no-pager` and `sudo journalctl -u arbitrade.service -n 100 --no-pager`.
- **Health fails after restart:** confirm `PORT` matches the service configuration, rebuild with `pnpm build` if `dist/index.js` is missing, and inspect private service logs. Do not paste `.env` or passwords into support requests.

The runtime helper verifies process availability and the health endpoint; it does not prove that every application feature, scheduled task, OAuth provider, or SMTP delivery path is working.

## Troubleshooting and recovery

- **Database connection failure:** verify host, database name, username, password, port, TLS settings, and grants. Credentials are not included in the error message.
- **Fresh mode reports tables:** stop. Select a new empty database or restore data and use existing mode.
- **Build fails:** inspect the private terminal output and cPanel Node.js version. Do not delete installation locks to retry blindly.
- **Health check fails:** inspect the cPanel/VPS service logs and confirm PUBLIC_APP_URL, PORT, and DATABASE_URL.
- **Interrupted installation:** preserve a database backup and the current .env/lock files, inspect `installer/.install-in-progress.json` for the last recorded stage, review private terminal output and actual migration state, and recover deliberately. The marker intentionally blocks reruns; remove it only after an administrator confirms the recovery plan. Do not re-run schema initialization against an existing database.
