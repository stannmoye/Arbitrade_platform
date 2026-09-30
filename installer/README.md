# Arbitrade guided installer

## Supported deployment targets

- **VPS / Node-compatible host:** supported. Use the visual wizard to create `.env`, then run `./installer/install.sh --seed-demo`.
- **Node-compatible shared hosting:** supported only when the host provides Node.js 22+, persistent application startup or a managed Node app, MySQL access, and HTTPS.
- **PHP-only shared hosting:** not supported for the Express application. The PHP wizard can collect configuration and create the environment file, but it cannot turn a PHP-only host into a Node runtime. Ask the host for Node support or use a VPS.

## Wizard

1. Copy the project to the server.
2. Point a temporary protected URL at `installer/index.php`.
3. Enter the public HTTPS URL, database credentials, OAuth credentials, email provider, 2FA policy, and initial admin email.
4. The wizard tests/creates the database when the database user has permission, writes `.env` atomically, and applies restrictive file permissions.
5. On the server shell run `./installer/install.sh --seed-demo`.
6. Remove or rename `installer/index.php`, remove `installer/.installed`, and deny web access to `.env`.
7. Run `pnpm build && pnpm start` behind a reverse proxy with TLS, or configure the host's Node application runner.

The browser wizard must not be granted permission to run `apt`, `pnpm`, `npm`, or arbitrary shell commands. Dependency installation stays in the explicit CLI script.

## Google Cloud setup

Create an OAuth client for a Web application. Add the exact redirect URI:

`https://YOUR_DOMAIN/api/oauth/google/callback`

Enable OpenID Connect, email, and profile scopes. Put the client ID and secret into the wizard. Do not commit them.

## Microsoft Entra setup

Register a Web platform redirect URI:

`https://YOUR_DOMAIN/api/oauth/microsoft/callback`

Use the common tenant for multi-tenant sign-in or replace the authority with a tenant-specific authority in `providerOAuth.ts`. Grant `openid`, `profile`, `email`, and the minimum required Microsoft Graph permissions. Create a client secret with the shortest practical expiry and rotate it.

## Email

Use either SendGrid or an SMTP relay. Configure SPF, DKIM, DMARC, a verified sender, and bounce handling. Never use a personal mailbox password. Keep API keys and SMTP passwords in `.env` or the host's secret manager.

## Important production boundary

This installer configures real identity-provider login only. The current Arbitrade balances, opportunities, deposits, withdrawals, and earnings remain simulated. Live money movement requires separate regulated payment/custody/KYC/AML integrations, server-side ledger controls, audit logging, reconciliation, and legal review.
