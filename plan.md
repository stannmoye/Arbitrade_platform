# Arbitrade V5 Rebuild Plan

## Outcome
Rebuild the Arbitrade customer portal, admin portal, backend, database model, financial workflows, reporting and deployment around `AI ENGINEER MASTER UNIFIED SPECIFICATION — V5`. Preserve compatible existing authentication, support and simulation behavior where safe; replace hard-coded demo finance behavior with database-driven, auditable application behavior.

The live-money gate is mandatory: until a verifiable broker/exchange/provider execution and settlement mechanism is explicitly configured and tested, all opportunities and investments remain structurally labeled `PRACTICE`, `SIMULATION`, or `RESEARCH`. No configured reward is credited as a real return.

## Architecture
- **Web application:** React + TypeScript + Vite for customer and admin portals, split by route and feature modules rather than a single monolithic page.
- **API:** Express + tRPC, with server-authoritative validation for packages, opportunities, funding, FX quotes, Automatic Swap, purchases, investments, settlements, reports, exports and admin actions.
- **Database:** MySQL-compatible Drizzle schema with additive migrations, immutable ledger entries, stored wallet balances updated in the same transaction, idempotency keys, audit events and reconciliation records.
- **Money:** fixed-precision decimal arithmetic using a decimal library; asset/currency precision, minimum units and rounding modes are stored in the database and captured in calculation snapshots.
- **Authentication:** preserve `webdev_app_session` / Manus OAuth compatibility; add application roles, permissions, admin 2FA readiness, customer security settings and server-side authorization.
- **Jobs:** database-backed queue plus `/api/scheduled/*` handlers for daily reports, email delivery, FX refresh, settlement simulation and reconciliation. Jobs are retryable and idempotent.
- **Hosting:** container deployment with `/api/health`, API-before-static routing, runtime-only secrets, and a cPanel/shared-hosting recovery guide. Live-money providers remain disabled unless explicitly configured.

## Design direction
- **Design movement:** quiet institutional fintech control room: editorial hierarchy, dense but calm data surfaces, restrained neo-brutalist rules and accessible status color.
- **Core principles:** trust before excitement; every number has a source/status; explicit approval for sensitive actions; simulation/live boundaries are always visible.
- **Color philosophy:** graphite/navy foundation, warm paper surfaces, mint for valid/active states, amber for review, coral for blocked/loss states; no casino-like gradients or urgency manipulation.
- **Layout paradigm:** persistent workspace rail with a command header, route-aware primary canvas, detail drawer/review panel and a separate chronological activity stream; mobile collapses into Home / Trade / Portfolio / Activity / Menu.
- **Signature elements:** freshness/status bars, source-and-assumption chips, ledger-style ruled rows, a persistent Practice/Simulation/Research ribbon.
- **Interaction philosophy:** Idle → Processing → Success/Failure/Pending; no optimistic financial success; all final actions revalidate on the server and display a durable activity record.
- **Animation:** 150–240 ms state transitions, reduced-motion support, no countdown manipulation, server timestamps rendered as countdowns only.
- **Typography:** modern sans-serif UI with tabular numerals for amounts and a restrained condensed display treatment for totals.
- **Brand essence:** a calm, auditable opportunity workspace for customers and operators; precise, honest, controlled.
- **Brand voice:** “Review the assumptions before you approve.” / “This result is simulated until verified execution is connected.”
- **Wordmark & logo:** retain the existing compass/route mark and use it as the navigation and status motif.
- **Signature brand color:** `#7CE7C2` mint signal.

## Implementation phases
1. Audit and matrix (this plan and `docs/implementation-matrix.md`).
2. Schema, precision, immutable ledger, idempotency and reconciliation.
3. Packages, active-package checks, opportunities, trading types and purchase limits.
4. Multiple investments, server-authoritative timing and exactly-once settlement.
5. Multi-wallet funding, FX quotes, Automatic Swap, rate tolerance and conversion ledger.
6. Keep real execution/return blocked; add explicit practice/research execution states.
7. Customer/admin navigation and database-backed settings/entitlements.
8. History, transactions, reports, local-timezone boundaries, PDFs, email queue and retention.
9. Security hardening, roles, 2FA enforcement points, uploads, backups and failed-job monitoring.
10. cPanel/container deployment, cron documentation, seed data and recovery.
11. Acceptance tests, reconciliation checks and final matrix.

## Project structure
```text
client/src/
  app/                 route shell, providers, authentication state
  pages/customer/      customer portal pages
  pages/admin/         admin portal pages
  components/          shared UI and review/status components
  features/            opportunities, wallets, investments, reports, tools
server/
  _core/               runtime, session, OAuth, tRPC and scheduled auth
  modules/             domain services and validation
  jobs/                queued/scheduled work
  reports/             timezone and PDF generation
  routers.ts           API contract and authorization boundaries
  db.ts                database adapter and transactions
drizzle/
  schema.ts            current schema
  migrations/          additive migration SQL
shared/
  money.ts             fixed-precision value objects and rounding
  domain.ts            shared enums and API types
docs/
  implementation-matrix.md
  deployment.md
  recovery.md
  security.md
```

## Financial safety decisions
- All money-changing commands require an idempotency key and a database transaction.
- Balances are stored but never trusted without ledger reconciliation.
- Ledger entries are append-only. Corrections are linked compensating entries.
- A customer can purchase the same opportunity successfully once; many customers may purchase until an atomic global cap is reached.
- Failed/cancelled attempts do not consume successful-purchase entitlement.
- Active investments continue their recorded lifecycle after package expiry by default.
- Automatic Swap defaults OFF and only authorizes the required conversion for the current investment.
- Invalid/expired/out-of-tolerance FX quotes cause zero deduction and no investment.
- Live execution, verified returns and loss settlement are `BLOCKED` until the owner defines a real provider workflow.

## Delivery and validation
Use `pnpm check`, `pnpm test`, `pnpm build`, targeted financial concurrency tests, API health checks, seed verification and a production container smoke test. Publish only a version whose build and health path are verified. The final delivery will include the hosted URL and clearly labeled practice/test credentials; no production credentials will be created or exposed.


## CoinKi Mining database-driven implementation addendum

The user's latest clarification supersedes the earlier demo-only reward model for Mining: customers purchase hash power in a real farm, the operator sells farm capacity to a third party, and no mining-pool connection is required. Reward credits must flow from actual third-party earnings, allocated by each customer's purchased eligible package power. Do not invent reward values from hashrate alone or label a settlement as verified before its source data is recorded. Other investment/trading modules retain their existing live-execution safety gates.

### Persisted configuration and data flow

- Add an additive, idempotent Mining migration plus a dedicated script that applies only this migration (do not replay unrelated migrations or account-seeding SQL). Add a database-backed default contract duration in months and a per-package display order; keep package financial terms in immutable `mining_package_versions` and purchase-time duration/terms in the customer entitlement snapshot. Do not rewrite any existing contracts.
- Seed package versions in catalog-published status and display order from the explicit seed values in the user specification: CKI Genesis — USD 100 and 1 TH/s; CKI Velocity — USD 300 and 3 TH/s; CKI Quantum — USD 600 and 7 TH/s; CKI Titan — USD 1,200 and 16 TH/s; CKI Infinity — USD 2,500 and 40 TH/s; all have a 24-month term. One-lifetime-purchase-per-customer claims are enforced in the database. One-click package purchases are enabled independently from CKI posting; active entitlements start immediately and per-package hash-time intervals are persisted. CKI posting remains blocked until actual third-party settlement ingestion and allocation policy are implemented and verified. Admins can later change package names, prices, hashrates, terms and availability using the existing versioned workflows.
- Keep the CKI/USD reference centralized in the versioned database economics row. The user specified 1 CKI = $1.27; the storage field `tokenUnitsPerUsd` is CKI per USD, so persist its inverse (`0.787401574803149606`) and show $1.27 as an administrator-configured internal reference, not a market quote. Preserve effective dates, editor identity and audit history. Persist the existing simulated difficulty baseline (100 TH/s) in that same versioned row and require it as an explicit input to the difficulty calculation instead of retaining a code fallback.
- Replace fixed/demo package reward estimates with the user's actual farm-settlement model: persist each actual third-party settlement period, settlement asset/currency, gross and distributable amount, costs/revenue-share rule, source/reference, effective FX/CKI valuation and recording administrator. Allocate only distributable earnings to customers by their purchased, eligible package TH/s-seconds (including an enabled boost only for its linked contract), then credit CKI with exact-decimal/idempotent ledger entries and one auditable package allocation per period. The settlement source, customer share, costs and conversion/allocation basis still require the user's response; never synthesize or post rewards from package hashrate alone. The earlier 2 CKI/day attachment example is illustrative, not a settlement value.
- Keep the no-pool design: the third-party farm settlement—not a pool feed—is the source of actual earnings. Purchase-derived hash rate alone is not revenue; the settlement record or verified incoming source is required before calculating actual CKI credits.
- Reuse exact-decimal arithmetic, idempotent reward events and the shared CKI ledger. Every reward period stores the actual active purchase snapshot, settlement reference, package/TH/s-seconds allocation, CKI amount, USD equivalent, CKI valuation/FX snapshots and allocation model. Package availability controls new purchases only; it does not cancel or change existing contracts. A financial estimate must remain distinctly labeled from a posted, sourced settlement.
- Remove conflicting hard-coded frontend business defaults ($1.60 CKI and the sample $10/10-TH/s package). Admin forms must load current settings and package data from the API/database, using empty or loading values rather than sample business constants. Unit conversions, mathematical formulas, stable identity labels and fixed enum allowlists remain code, not editable settings.
- The current data store is the isolated Sandbox MariaDB, separate from production. Values written there persist across app-process restarts but this temporary Sandbox is not a production-grade permanence or uptime guarantee. Do not claim the records have migrated to a production database.

### Existing modules to extend

- `drizzle/` and `scripts/`: additive versioned schema/seed migration and isolated Mining-only runner.
- `server/mining-store.ts`: typed effective-economics reader and central database-backed defaults.
- `server/mining.ts`: DB-sourced catalogue, configured per-package expected-reward estimate, immutable purchase terms and package-based reward intervals.
- `server/mining-admin.ts` and `server/routers.ts`: admin validation, versioned setting/package updates, per-package expected daily/hourly CKI and internal-USD reporting, display-order/availability controls, derived purchase/holder/active-hashrate metrics and audit writes.
- `server/mining-rules.ts`: centralized exact-decimal daily-reward proration with package-scoped boost attribution.
- `client/src/components/AdminMining.tsx`: existing operations console, replacing fallback defaults with DB-backed values and exposing reward settings and package statistics.
- `client/src/components/CustomerMining.tsx` and `client/src/mining-portal.css`: existing customer Mining design, displaying database-sourced price/hashrate/24-month term/configured reward estimate and respecting availability.

### Customer wallet, purchase, boost, payout and engine behavior

- A single Buy click uses the saved `customerWalletPreferences.tradingCurrency`, obtains a fresh server-side FX quote, revalidates current price, balance and availability, atomically debits the canonical main-wallet ledger, and activates the Mining entitlement. The click acknowledges the visible package terms. Enforce one successful purchase of each package per customer for its lifetime, in both the server and the database; expiry or replacement does not permit another buy. Persist active package TH/s and eligible time as idempotent per-package activity intervals, separately from reward receipts.
- Manual Mining conversion swaps the customer's full **available** CKI amount to a chosen main-wallet currency (USD, EUR, GBP, BTC, ETH or USDT), at the stored CKI reference plus the latest recorded target-asset FX rate/fee, and atomically credits the canonical main wallet. CKI cannot be requested as a direct cash payout. Locked/pending CKI is never silently converted.
- Manual payout requests use only main-wallet balances in USD/EUR/GBP/BTC/ETH/USDT and create a database-linked admin ticket. Reserve the requested non-promotional amount atomically in the wallet ledger until cancellation, rejection, or manual paid confirmation. Only an authorized administrator can resolve a ticket; paid requires a unique external transfer reference, rejection requires a note, and every terminal transition records its ledger release/settlement entry and resolution metadata. No external transfer is initiated. The current exact-head CI validates MySQL 8/MariaDB lifecycle, fail-closed policy/KYC behavior, and mocked customer/admin browser journeys; live authenticated staging acceptance and an approved transfer/custody provider remain prerequisites before real transfers.
- Boost duration is 120 seconds, with a four-hour per-customer start-to-start cooldown; persist both values in the versioned database economics configuration. The existing package-specific extra-TH/s values are all zero, so the user must configure a nonzero bonus amount before it can add hash power. Do not claim an enabled boost while its added capacity is zero.
- Replace the dummy “Run demo flow” and synthetic +1 CKI/RPM values with a slow, continuous engine/status flow while a customer has an active package; show idle when no package is active. Persist package/TH/s eligible intervals in the database, independently of financial reward posting. Use real recorded package/settlement/wallet data only; do not fabricate hardware telemetry. Until actual third-party settlements are connected, keep CKI credits blocked and label active mining as awaiting settlement.
- The current HTTP service and MariaDB are Sandbox-only. Production requires an explicitly selected host and separate production database/secret-management target. Do not claim production operation or clear unspecified users, balances, contracts or transaction history; broad demo-data removal awaits an exact scope.

### Mining interface design

Preserve the dark, industrial mission-control Mining dashboard, electric-cyan data accents and restrained amber status warnings. Keep the existing asymmetric engine-and-controls layout, high-contrast tabular numbers and version/status chips. The flow animation runs continuously at a slow, reduced-motion-aware pace only while a customer has active purchased hash power; it uses real stored package and settlement states and never adds dummy balances or invented RPM. Distinguish a database-configured CKI valuation from market pricing and a verified third-party settlement from an estimate. Do not add decorative assets or a second admin interface.
