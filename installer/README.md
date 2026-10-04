# Arbitrade production installer

## Supported deployment targets

- **cPanel Node.js application:** supported when the host provides Node.js 20+, MySQL/MariaDB, HTTPS, cron, and an application runner.
- **VPS / Node-compatible host:** supported with Node.js 20+, pnpm 10.18, MySQL/MariaDB, HTTPS, cron, and SMTP/API access.
- **PHP-only hosting:** not supported for the Express application. Use cPanel Setup Node.js App or a VPS.

## Production installation

1. Create a dedicated MySQL database and database user.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, `SESSION_SECRET`, `PASSWORD_PEPPER`, `PUBLIC_APP_URL`, and email/provider settings.
3. Protect `.env` (`chmod 600 .env`) and keep it outside the public web root.
4. Run `./installer/install.sh` or the commands in `cpanel/README.md`.
5. Provision the administrator and customer accounts privately:

```bash
ADMIN_EMAIL=admin@your-domain.example ADMIN_PASSWORD='use-a-new-12-character-password' \
CUSTOMER_EMAIL=customer@your-domain.example CUSTOMER_PASSWORD='use-a-different-12-character-password' \
pnpm accounts:provision
```

The command creates both accounts in the MySQL `users` table and stores only salted scrypt password hashes. It does not write plaintext credentials to the repository or environment files.

6. Remove or protect `installer/index.php` after configuration. Never expose the installer publicly.
7. Start the application with `pnpm start` through the cPanel Node application runner or a reverse proxy.

The installer does not provide default credentials. Account emails and passwords must be chosen privately by the deployment owner and supplied only when provisioning the database.

## OAuth and email

OAuth callback URLs are `/api/oauth/google/callback` and `/api/oauth/microsoft/callback`. Store all client secrets and SMTP credentials in `.env` or the cPanel environment settings. Configure SPF, DKIM, and DMARC for the production sender.

## Financial safety boundary

The application is production-deployable, but real-money execution and verified returns require a real, approved execution and settlement integration. Until that provider is configured, opportunities must remain clearly classified as Practice, Simulation, or Research and must not be presented as live execution or withdrawable returns.
