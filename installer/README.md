# Arbitrade installation and deployment

## Supported environments

- **cPanel:** cPanel Setup Node.js App, Node.js 20+ (Node 22 recommended), pnpm 10.18.x, MySQL/MariaDB, HTTPS, and private terminal access.
- **VPS:** Debian/Ubuntu, Node.js 20+, pnpm 10.18.x, MySQL/MariaDB, and root/sudo access for server provisioning.
- **PHP-only hosting is not sufficient.** The PHP wizard configures this Node.js application; it cannot itself keep the Express server running or safely execute privileged commands.

## Browser wizard

1. Upload/extract the repository into a private application root. Create a MySQL database and dedicated user in cPanel and grant that user privileges on the database.
2. Create the Node.js app in cPanel if you use cPanel. Use the repository as application root and dist/index.js as the startup file.
3. Open /installer/ over HTTPS and follow the staged wizard. It displays PHP/MySQL prerequisites and validates the supplied database connection. Use a new, empty database for fresh installation.
4. For existing data, restore a verified backup to the target database before opening the wizard and select **Existing installation**. The wizard does not upload or import large SQL dumps through HTTP.
5. The wizard writes a protected .env, a one-time .installer-bootstrap.json, and .configured. Keep them outside the public document root where possible. Do not commit or share them.
6. From the private application terminal, run exactly one matching command:

~~~bash
node installer/run-install.mjs --fresh-install
~~~

   Fresh database.

~~~bash
node installer/run-install.mjs --existing-database
~~~

   Existing database already restored.

   The script validates Node.js, pnpm, configuration, database connectivity, and database state before installing locked dependencies and building. Fresh mode applies the initial schema and creates the administrator. Existing mode preserves existing accounts and data and applies the main Drizzle migrations; it does not import a dump or create a replacement administrator. Review the migration and host-migration instructions before production use.

7. Set/restart the cPanel Node.js application with startup file dist/index.js.
8. After the app is running, run the post-install checks from the private terminal:

~~~bash
pnpm installer:verify
~~~

   The verifier checks database connectivity, the users table, administrator presence, the build artifact, and GET /api/health. A health check cannot pass until the Node.js application has been started.
9. If SMTP is configured, send an explicit test message to an address you control:

~~~bash
pnpm installer:test-smtp --to=you@example.com
~~~

   This verifies SMTP connectivity/authentication and sends one test email. Provider error details are deliberately limited to avoid logging secrets.
10. Remove or deny public access to /installer/ after verification. Keep .env, bootstrap state, SQL dumps, logs, and uploads private. The install lock is not a substitute for removing public access.

## Database safety

- Fresh mode refuses to proceed if the database contains tables.
- Existing mode requires an already imported database and never replaces existing account credentials.
- Back up MySQL before migrations. For host migration, follow the host migration and persistence guide in ../docs/host-migration-and-persistence.md.
- Do not run fresh mode against a restored or production database.
- Do not delete .configured or installer/.installed to force a reinstall over existing data.
- The wizard does not provide a browser-based SQL dump importer because large imports can exceed cPanel limits and make recovery unreliable.

## SMTP and OAuth

The wizard stores SMTP credentials server-side. It does not claim SMTP works until the explicit test-email command succeeds. Configure SPF, DKIM, DMARC, and your provider's sender authorization separately.

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

## Troubleshooting and recovery

- **Database connection failure:** verify host, database name, username, password, port, TLS settings, and grants. Credentials are not included in the error message.
- **Fresh mode reports tables:** stop. Select a new empty database or restore data and use existing mode.
- **Build fails:** inspect the private terminal output and cPanel Node.js version. Do not delete installation locks to retry blindly.
- **Health check fails:** inspect the cPanel/VPS service logs and confirm PUBLIC_APP_URL, PORT, and DATABASE_URL.
- **Interrupted installation:** preserve a database backup and the current .env/lock files, review the exact failure, and recover deliberately. Do not re-run schema initialization against an existing database.
