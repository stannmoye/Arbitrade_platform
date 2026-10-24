# Self-hosted deployment and integrations

Arbitrade runs on an operator-controlled VPS or cPanel Node.js host and uses the operator's MySQL/MariaDB database. It does not require a hosted builder identity service, hosted application proxy, hosted object-storage gateway, or hosted scheduled-work service.

## Source of truth and installation

The canonical source is the `main` branch. Build and deploy an exact commit SHA, never an unverified ZIP or moving branch name. Use Node.js 22 and pnpm 10.18.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
# Edit .env in a private directory; use independent cryptographically random secrets.
pnpm check
pnpm test
pnpm build
```

Configure `DATABASE_URL` for the dedicated MySQL/MariaDB database and use a strong, stable `SESSION_SECRET`, `PASSWORD_PEPPER`, and `TOTP_ENCRYPTION_KEY`. Keep these secrets outside Git and outside the public document root. Do not rotate the session/pepper/encryption keys casually: rotations can invalidate sessions or make protected account data unreadable.

Use the install wizard and commands in [the installer guide](../installer/README.md). For an existing database, take and verify a restorable backup and follow the existing-database path. Do not run fresh-install mode on an existing database. Keep the guarded migration process intact: never fabricate migration tracker entries or automatically retry a partially committed MySQL DDL migration.

## Accounts and sessions

Registration and sign-in are handled by Arbitrade routes, local password hashes, the `users` table, and signed `arbitrade_app_session` cookies. Role assignment is database-controlled; an external identity string cannot automatically promote a user to administrator. A cookie rename means existing browser sessions must sign in again after upgrade. Existing account and financial rows are not removed by this code change.

Google/Microsoft OAuth are optional direct provider integrations. They use the providers' standard endpoints and local callback routes; leave their client settings unset to disable the corresponding sign-in method. Arbitrade local email/password login does not require external OAuth credentials.

## Database and file persistence

Structured application, customer, package, ledger, audit, support, notification, and scheduler records are persisted to the configured MySQL/MariaDB database.

Uploaded binary files are stored on a durable private filesystem volume, not in a hosted object-storage account. Set `UPLOADS_DIR` to a persistent directory outside `public_html` (or any other public web root), with write access limited to the Node service user. Back up this directory alongside the database and restore both together. The database stores support attachment metadata, stable storage keys, size/type, ticket ownership, and audit associations. The application serves files through authenticated `/storage/...` routes; generated public assets are a separate namespace and private namespaces fail closed.

Support uploads are allocated through the authenticated local `/api/support/attachments/presign` endpoint and posted to the application-owned `/api/support/attachments/upload` endpoint. The old externally signed upload URL flow is not used.

## Background jobs

Migration `0070_local_scheduled_jobs.sql` creates the `local_scheduled_jobs` table. Once `DATABASE_URL` is available, the server starts its local worker. Jobs, ownership, UTC cron expressions, next-run times, leases, execution counts, last status, and error details are durable in MySQL. The worker claims due rows with a lease and invokes only loopback application paths matching `/api/scheduled/...`; arbitrary remote callback URLs are rejected.

Cron expressions use six UTC fields (`second minute hour day-of-month month day-of-week`) and must specify second zero, so a job runs no more frequently than once per minute. A callback endpoint must verify the task ID, timestamp, exact request body and HMAC using `verifyScheduledCallback` from `server/_core/heartbeat.ts`. Make callback effects idempotent: a lease reduces duplicate execution but cannot provide exactly-once effects across process crashes or network timeouts. Only register application-owned callback routes; do not use this scheduler as evidence that a financial provider executed or settled a trade.

## Optional integrations

These integrations are independent and can remain disabled until the operator configures them. Their absence does not disable local login, MySQL persistence, local uploads, core portal routes, or the local job worker.

- **Chat/completions:** `AI_API_BASE_URL` defaults to an Ollama-compatible local endpoint at `http://127.0.0.1:11434/v1`. Set `AI_API_KEY` only when the configured provider requires it. A remote API without a key is rejected.
- **Image generation/editing:** set `IMAGE_API_BASE_URL` to an operator-controlled OpenAI-compatible image API and `IMAGE_API_KEY` if required. Image bytes are downloaded and persisted locally. If the endpoint is not configured, the feature returns an explicit configuration error rather than routing through a hidden proxy.
- **Speech transcription:** `TRANSCRIPTION_API_BASE_URL` defaults to a locally hosted Whisper-compatible API at `http://127.0.0.1:8000/v1`; `TRANSCRIPTION_API_KEY` is optional for loopback/local endpoints and required for remote endpoints.
- **Maps:** `GOOGLE_MAPS_BROWSER_KEY` is intentionally public and must be HTTP-referrer restricted in the provider console. `GOOGLE_MAPS_SERVER_KEY` is server-only. Map features remain disabled when the respective key is not configured.
- **External REST connector:** `DATA_API_BASE_URL` and optionally `DATA_API_KEY` point directly to an API selected by the operator. It is not an application-platform proxy.
- **Email/owner alerts:** configure the SMTP variables and `OWNER_NOTIFICATION_EMAIL` to enable email. Database-backed customer notifications are stored locally.
- **Market data, FX and real execution:** configure only verified, authorized provider endpoints as separate integrations. Never infer execution, settlement, deposits, withdrawals or financial profits from timers, generated values, UI state, or a generic AI/REST endpoint. The financial ledger remains the database source of truth and must be reconciled with provider evidence.

## Upgrade and validation

After deploying the exact new source, install locked dependencies, back up the database and upload volume, apply migrations through the documented guarded installer/migration commands, then run:

```sh
pnpm check
pnpm test
pnpm build
pnpm installer:verify
pnpm installer:diagnose
```

Check `GET /api/health`, registration/login, password reset/email delivery if configured, admin role enforcement, private support upload/download authorization, generated assets, and local scheduled-job failure reporting. The source change alone cannot configure VPS secrets, provision local AI models, install OS packages, configure DNS/TLS, or prove a live external financial provider's execution/settlement path.
