# Arbitrade V5 Requirement-to-Code/Data Matrix

Status vocabulary is exactly: **EXISTING / CORRECTED / EXTENDED / REBUILT / NEW / BLOCKED**.

| Requirement area | Status | Current evidence | Target implementation | Affected code/data |
|---|---|---|---|---|
| Pre-implementation audit | EXISTING → EXTENDED | Existing README, spec, migrations and tests reviewed | Keep this matrix current through final acceptance | `docs/implementation-matrix.md`, `plan.md` |
| Customer portal shell | EXISTING → REBUILT | `client/src/App.tsx` monolith | Route/feature modules with server-backed state | `client/src/app`, `client/src/pages/customer` |
| Admin portal shell | EXISTING → REBUILT | Test UI and browser `sessionStorage` gate | Server-authenticated role/permission portal | `client/src/pages/admin`, `server/routers.ts` |
| Authentication/session | CORRECTED | App-issued signed sessions, scrypt password hashes and local database users | Keep session revocation, role checks and security controls app-owned | `server/_core/localAuth.ts`, `server/_core/localIdentityService.ts`, auth tables/migrations |
| Roles/permissions | EXISTING → NEW | Only `user/admin` enum | Granular deny-by-default permissions and admin guards | roles, permissions, role_permissions tables |
| Packages/active subscriptions | EXTENDED | Basic package name and package policy exist | Dates, entitlements, active checks, expiry lifecycle | packages, subscriptions, entitlements |
| Companies/logos | NEW | Frontend values are hard-coded | Database-owned companies and logo references | companies table/storage index |
| Trading types | NEW | No persisted trading type model | Admin-managed records plus historical snapshot | trading_types, investment snapshots |
| Opportunities | EXTENDED → REBUILT | Basic open offer model exists | Company, title, trading type, eligibility, caps, status transitions | opportunities, delivery records |
| Purchase limits/concurrency | NEW | No atomic cap/duplicate enforcement | Transactional cap and status-aware customer identity | purchases, unique active-success identity, idempotency |
| Multiple investments | EXTENDED → REBUILT | Basic trade position exists | Per-investment lifecycle, max-active atomic checks, exactly-once settlement | investments, settlements |
| Decimal-safe money | NEW | Integer minor units only and JS numeric calculations | Decimal value object, asset precision, rounding snapshots | money module, asset_precision table |
| Wallets/ledger | EXTENDED → REBUILT | Basic balance and ledger tables exist | Immutable entries, source references, snapshots, reconciliation | wallets, wallet_ledger, snapshots, reconciliation |
| Multi-wallet funding | NEW | No funding plan | Priority, eligibility, split plan, no partial deduction on failure | funding_rules, funding_plans, funding_sources |
| FX provider/quotes | NEW | No FX quote service | Cached provider rates, validity and tolerance checks | fx_rates, swap_quotes, provider settings |
| Automatic Swap | NEW | No server workflow | OFF requires final approval; ON only required conversion | swap_executions, conversion ledger |
| Fees/spreads | NEW | Reward only, no distinct fee model | Explicit configured fee components and audited application point | fee_rules, fee ledger entries |
| Trading financial lifecycle | EXTENDED → CORRECTED | Timer settlement credited reserved estimates; settlement refs lacked database uniqueness; package labels were treated as entitlement; and manual settlement could substitute expected reward for an actual result | Scheduled time only records an awaiting-confirmation event. Settlement locks the trade, claims references uniquely, and replays safely. Eligible opportunities with insufficient funds remain visible and record a missed opportunity. Active subscriptions gate delivery/allocation. Actual signed gross profit/loss, 15%-default fee, net result, fee policy version/rounding, principal return, and outcome are posted transactionally; customer display uses database-recorded results and marks pending earnings as estimates. | `server/db.ts`, `server/modules/realized-profit-accounting.ts`, `drizzle/0067_trade_settlement_reference_claims.sql`, `drizzle/0068_trade_realized_profit_accounting.sql`, `server/*settlement*.contract.test.ts`, `server/modules/realized-profit-accounting.test.ts` |
| Growth/tools modules | NEW | Mostly visual placeholders | Accurate records, clear estimates versus confirmed results, and ledger-backed financial outcomes where applicable | bots, backtests, smart entries, reinvestments |
| Customer navigation | EXISTING → REBUILT | Visual sections exist | Home, Trade, Portfolio, History, Transactions, Reports, Notifications, Activity, Wallets, Settings, Security, Help, Tools | customer route pages |
| UX state machine | EXTENDED | Toasts and some loading exist | Server-confirmed processing/success/failure/pending states | shared async/action components |
| Trading history/transactions | EXTENDED → REBUILT | Existing activity view requires verification | Internal-ledger-derived, customer-scoped, fee/profit terminology | history queries, transaction queries |
| PDF/CSV reports | EXTENDED | V5 report table existed without customer-day enforcement | Daily local-time reports, access control, exports | v5_reports, report service, PDF service |
| Reporting timezone/DST | EXTENDED | No persisted timezone history or boundary helper | Effective timezone history and half-open UTC intervals, including DST | customer_timezone_history, server/modules/v5-workflows.ts |
| Daily emails | EXTENDED | Email job statuses existed without preference persistence | queued/processing/sent/failed/retrying/suppressed with idempotency | v5_email_jobs, customer_email_preferences, settings |
| Admin dashboard | EXISTING → REBUILT | Static test KPIs | Live DB counts, health, failed jobs, reports, wallets | admin queries/pages |
| Admin settings | EXTENDED | Some app settings exist | Precision, fees, FX, SMTP, branding, email switch, funding rules | settings tables/API |
| Balance adjustments | NEW | No safe adjustment path | Reason/reference, compensating ledger, audit trail | adjustments, audit_events |
| Security baseline | EXTENDED → CORRECTED | Basic JWT/PKCE | CSRF, rate limits, secure upload, 2FA enforcement points, secret hygiene | middleware, security migrations |
| Failed jobs/backups | EXTENDED | Recovery documentation existed without failed-job table | DB queue, retries, failed-job admin view, recovery documentation | v5_failed_jobs, docs/deployment-v5.md |
| Seed/reference data | EXISTING → EXTENDED | Seed/reference assets exist | Clearly distinguish reference data from actual recorded trading and ledger outcomes | seed scripts, environment flags |
| cPanel/container deployment | EXISTING → EXTENDED | Dockerfile and installer exist | Health path, cron routes, env docs, backup/recovery | Dockerfile, installer, docs |
| Acceptance tests | EXTENDED | Core money/purchase tests existed | Add internal-ledger trade lifecycle, settlement, DST, correction and idempotency coverage | server/modules/v5-workflows.test.ts |
| Hosting and URL | NEW | Local runtime only | Verified published/container URL; otherwise clearly labeled preview | webdev config/deployment |
