# Arbitrade Crypto Opportunity Platform

This repository contains the first safe prototype slice of Arbitrade: a premium simulated-funds market intelligence workspace with customer and admin views.

## Included in this build

- Midnight Ledger dashboard UI
- Simulated USD, EUR, GBP, BTC, ETH balances
- Total, available, locked, pending, invested-style and earned-style views
- Opportunity radar with spread, capacity, freshness, risk and stress-case details
- Reservation modal with explicit simulated allocation and no-guarantee disclosure
- Five admin-gated participation modules: swaps, token launches, protocol rewards, liquidity pools, and referral rewards
- Admin feature registry with enable/disable toggles
- Customer access and fund restriction controls
- Demo-mode environment controls
- Activity and notification centre
- Responsive layout and reduced-motion support
- Project-specific logo at `client/public/arbitrade-mark.svg`
- Product/engineering specification at `docs/arbitrade-platform-spec.md`

## Run locally

```bash
pnpm install
pnpm check
pnpm dev
```

The app runs on port 3000 by default. All balances and actions are simulated. This prototype does not accept real deposits, connect live custody, place live trades, or process live cards/bank transfers.

## Build

```bash
pnpm build
pnpm start
```

## Production boundary

Before adding real money movement, integrate only through approved and regulated payment, custody, banking, exchange, KYC/AML, and blockchain providers. Add legal and compliance review, ledger reconciliation, independent security testing, and jurisdiction-specific customer disclosures first. Never present simulated or estimated outcomes as guaranteed returns.

## Production-shaped hosted test mode

The application exposes separate test portals:

- `/` — customer signup/login entry
- `/customer` — customer portal
- `/ops-console-7f3a` — unlisted admin operations portal

### Seeded test accounts

- Customer: `customer@arbitrade.test` — Pro package, Growth group
- Admin: use the seeded hosted test credentials supplied in the test handoff
- Additional seeded customers are visible in the admin portal: Amelia Stone and Noah Wilson.

### Customer portal capabilities

- Package-filtered opportunity feed
- Configurable opportunity popups and sound preference
- Persistent notification inbox
- Wallet and cash views
- Mock deposit and withdrawal workflows
- Activity stream
- Trade-limit visibility
- Pro package entitlement display

### Admin portal capabilities

- Customer groups and package overview
- Global opportunity-rate ceiling
- Starter, Growth, Pro and Institutional package policies
- Per-customer KYC, withdrawal, 2FA and facial-verification toggles
- Per-customer activity and trade-limit views
- Provider/API registry
- Mock adapter health states
- Audit-log view
- Production-shaped dual-approval and immutable-audit guidance

This is a production-shaped test environment, not a live financial deployment. Provider names such as MockPay, MockBank, MockKYC, MockExchange and MockChain are intentionally simulated. No real funds, custody, bank accounts, card networks, identity documents, blockchain transactions or withdrawals are connected.

## Customer onboarding and authentication

The customer route starts at a signup/sign-in experience. Sign-up offers Google, Microsoft and email methods. Google and Microsoft now start server-side provider OAuth when credentials have been configured; after callback the customer completes the same profile fields: first name, last name, address, country, phone and mobile phone. Email registration also requires a password with a 12-character strength hint.

Each onboarding session generates a customer account number in the format `ARB-########`, displays it before portal access and provides a copy action. The screen also includes consent capture, email-verification readiness, 2FA readiness, device-alert readiness, password visibility control and a customer-safe test-account notice.

## Live Google/Microsoft sign-in and guided installation

The customer provider buttons use these real server-side routes when configured:

- `GET /api/oauth/google/start` and `GET /api/oauth/google/callback`
- `GET /api/oauth/microsoft/start` and `GET /api/oauth/microsoft/callback`

The implementation uses authorization-code + PKCE, an httpOnly state cookie for CSRF protection, server-only client secrets, provider profile retrieval, the existing user upsert, and the existing session-cookie mechanism. The customer is returned to profile completion after identity authentication. Missing credentials return a clear configuration response rather than exposing secrets or pretending the provider is active.

### Installer assets

- `.env.example` — server-only configuration reference
- `installer/index.php` — temporary visual configuration wizard
- `installer/install.sh` — CLI dependency preflight, locked install, database migration and optional demo seed
- `installer/demo.sql` — explicit test-only demo users
- `installer/README.md` — provider-console and hosting instructions
- `plan.md` — implementation and deployment plan

The installer asks for the public URL, database credentials, Google and Microsoft credentials, SendGrid/SMTP credentials, 2FA policy, and initial admin email/password. It writes `.env` atomically with restrictive permissions and can create the database when the supplied database user has permission.

**Important:** PHP-only shared hosting cannot run this Express/React application. Use a VPS or a Node-compatible shared host. The installer does not execute package managers from a browser request; dependency installation is an explicit shell operation. Remove or rename the installer after setup and block access to `.env`.

Register these exact provider redirect URIs for an installation at `https://YOUR_DOMAIN`:

```text
https://YOUR_DOMAIN/api/oauth/google/callback
https://YOUR_DOMAIN/api/oauth/microsoft/callback
```

OAuth configuration is live-capable, but balances, opportunities, deposits, withdrawals, and earnings remain simulated until separately integrated with regulated providers and a production ledger.

## Authenticated customer workflows

The customer `/customer` route now uses the platform's real Manus-authenticated application session rather than the former client-only test gate. The Power tools area includes:

- Account-linked session registration and device revocation using request metadata; no hard-coded UK location.
- Persisted risk-report requests routed to the admin operations surface.
- Persisted support tickets with priority, status, thread messages, admin replies, and customer notifications.
- Support attachments uploaded through an authenticated managed-storage presign endpoint and indexed in `support_attachments`.
- Browser notification chimes after successful customer ticket submission and admin replies.

The additive migration is `drizzle/0001_silent_tinkerer.sql`.

### Production configuration boundary

This change removes the fake session identity and client-only risk/ticket state. It does **not** invent live market, exchange, custody, banking, email, or push-notification credentials. Live investment opportunity data, real money movement, and external customer email require separately configured regulated providers and protected secrets. The managed storage presign endpoint returns a configuration error until the runtime storage capability is available.
