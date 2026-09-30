# Arbitrade Crypto Opportunity Platform

This repository contains the first safe prototype slice of Arbitrade: a premium simulated-funds market intelligence workspace with customer and admin views.

## Included in this build

- Midnight Ledger dashboard UI
- Simulated USD, EUR, GBP, BTC, ETH balances
- Total, available, locked, pending, invested-style and earned-style views
- Opportunity radar with spread, capacity, freshness, risk and stress-case details
- Reservation modal with explicit simulated allocation and no-guarantee disclosure
- Wallet and fund-lock controls
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

The application now exposes separate test portals:

- `/` — portal gateway
- `/customer` — customer portal
- `/admin` — admin portal

### Seeded test accounts

- Customer: `customer@arbitrade.test` — Pro package, Growth group
- Admin: `admin@arbitrade.test` — Super admin test account
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

The customer route now starts at a sign-up/sign-in experience. Sign-up offers Google, Microsoft and email methods. Google and Microsoft paths simulate successful identity authentication and then require the same profile-completion fields: first name, last name, address, country, phone and mobile phone. Email registration also requires a password with a 12-character strength hint.

Each onboarding session generates a customer account number in the format `ARB-########`, displays it before portal access and provides a copy action. The screen also includes consent capture, email-verification readiness, 2FA readiness, device-alert readiness, password visibility control and a customer-safe test-account notice. In a live deployment, OAuth callbacks, profile data, password hashes, verification records and account numbers must be persisted server-side with secure session cookies and provider secrets kept off the client.
