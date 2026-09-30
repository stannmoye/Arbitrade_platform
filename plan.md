# Arbitrade OAuth and Portable Installer Plan

## Outcome
Add a production-shaped configuration path for live Google and Microsoft customer authentication and a guided installer that can be used on a VPS or a Node-compatible shared host. Keep provider secrets server-side, preserve the current simulated-finance boundary, and make unsupported shared-hosting environments fail with clear manual instructions rather than pretending to install successfully.

## Architecture
- **Frontend:** existing React customer signup route redirects Google/Microsoft buttons to same-origin server OAuth start endpoints. Callback returns to customer profile completion after the provider identity is established.
- **Backend:** Express OAuth routes use environment-provided client IDs/secrets, a secure state cookie for CSRF protection, authorization-code exchange, provider userinfo retrieval, existing `users` upsert, and existing httpOnly session cookie creation. No OAuth secret is exposed to browser JavaScript.
- **Installer:** `installer/index.php` is a visual, session-backed wizard that collects non-secret deployment configuration and writes a locked `.env` atomically. It detects PHP/PDO/MySQL capabilities and gives explicit Node/pnpm migration instructions. `installer/install.sh` performs repeatable CLI preflight, optional dependency installation only when explicitly requested, database migration, and demo-data import.
- **Configuration:** `.env.example` documents Google, Microsoft, SMTP/SendGrid, 2FA, database, admin and session settings. Secrets are written with restrictive permissions and never rendered back into the UI.
- **Serving:** SPA assets remain static-capable; `/api/*` and OAuth routes remain server-handled. Personalized/auth responses are not cacheable.

## Redirect URI contract
For an installation at `https://example.com`, register:
- `https://example.com/api/oauth/google/callback`
- `https://example.com/api/oauth/microsoft/callback`

The installer stores the exact public origin and derives fallback redirect URIs only when explicitly allowed.

## Hosting boundary
A VPS or Node-compatible shared host is supported. Ordinary PHP-only shared hosting cannot run this Express/React server; the installer reports that constraint and supplies a manual migration path. Never grant the web server permission to execute arbitrary package-manager commands from a browser request.

## Verification
Use source inspection plus `pnpm check`, `pnpm build`, `pnpm test`, health checks, and direct OAuth configuration endpoint checks that do not require real provider credentials. Do not claim live provider authentication is verified until the owner supplies provider credentials and completes provider-console redirect registration.
