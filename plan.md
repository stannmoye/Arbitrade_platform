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
