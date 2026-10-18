# Arbitrade Stage 1 — Application Audit and Development Baseline

**Audit date:** 2026-10-18  
**Roadmap:** `docs/ARBITRADE_MASTER_DEVELOPMENT_ROADMAP.md` (version 2.0; 30 stages)  
**Audited branch:** `integration/auth-installer-vps-safety`  
**Audit status:** In progress — source inventory and CI baseline are recorded. GitHub Actions run 39121401277 passed, but route/API/access mapping and measured browser/viewport acceptance remain outstanding.  
**Rule:** This is a source inspection, not a claim that the application has been built, tested, or production-validated.

## 1. Repository and stack observed

The repository is a TypeScript application with a React/Vite client, an Express server, tRPC APIs, Drizzle ORM, and a MySQL/MariaDB database. The README states Node.js 20+ (Node.js 22 recommended), pnpm 10.18, HTTPS, and SMTP/approved email configuration for production.

Key source locations observed:

- `client/src/App.tsx` — main customer/admin portal application and many page/component implementations. Current inspected blob SHA: `93a52e7cca80f758058b55b557d102c7f0aa4f6c`.
- `client/src/index.css` — large global stylesheet; inspected source length was approximately 227 KB.
- `client/src/components/CustomerSlideMenu.tsx` — customer navigation registry and menu.
- `client/src/components/AdminSlideMenu.tsx` — administrator menu implementation (listed in the client component directory).
- `client/src/admin-navigation.ts` — canonical admin navigation groups and destinations.
- `client/src/contexts/ThemeContext.tsx` — existing standalone light/dark theme context.
- `server/_core/index.ts` — Express startup, authentication endpoints, background workers and application middleware.
- `server/routers.ts` — tRPC API router and customer/admin operations.
- `server/db.ts`, `server/storage.ts`, `drizzle/schema.ts`, `drizzle/*.sql`, and root `database.sql` — database and migration surface.
- `shared/money.ts` and `shared/money.test.ts` — shared decimal-safe money utilities and tests.
- `installer/` — PHP setup wizard, install scripts, preflight/recovery helpers and installer safety tests.
- `cpanel/README.md`, `installer/README.md`, `installer/vps-setup.sh`, and related VPS scripts — deployment instructions and tools.
- `.github/workflows/installer-validation.yml` — an existing installer-validation workflow.
- `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, and `vitest.installer.config.ts` — dependency and test configuration.

## 2. Routes and portal shape

The repository documents these main entry points:

- `/` — portal gateway.
- `/customer` — customer authentication and portal.
- `/ops-console-7f3a` — administrator authentication and operations portal.
- `/api/health` — health endpoint.
- `/installer/` — temporary PHP setup wizard.

The main React application has dedicated customer and admin flows. Source inspection identified customer areas for dashboard/workspace, wallet, opportunities/trading, mining, yield/staking, activity, notifications, account preferences, security, support, reports, knowledge/resources and research. Admin areas include overview, customer directory, finance/ledger review, credit/debit adjustments, currencies/assets, mining, opportunities, policies, API/provider settings, branding, sound settings, audit, support tickets, email, KYC, delivery monitoring, risk watchlist, transaction review and exports/reports. Exact reachability and behaviour of every menu destination still needs systematic route testing.

## 3. Existing functionality that should be preserved and verified

Source inspection indicates the project already contains substantial functionality. This roadmap must improve it incrementally rather than replace it wholesale.

- Database-backed customer and admin authentication flows are present in the main application and server.
- The backend contains wallet/balance and ledger operations, customer notifications, opportunity/trade lifecycle code, mining logic, staking/yield operations, KYC, support tickets, email delivery, audit-related APIs and operational tooling.
- The customer notification centre reads notification records and supports marking notifications read.
- The admin portal includes a **Sound settings** screen. It currently exposes three sound categories in the inspected component: opportunity pop-up, wallet credited and wallet debited. It uses 30 generated tone presets and stores global settings through the admin settings API. Sound playback also depends on browser audio support and a customer-side local preference.
- A branding screen exists for platform name, tagline, browser title, accent colour, logo, favicon and share-image URL. This is not the same as a complete five-theme system.
- The main application includes pointer-based button-press/ripple feedback.
- Responsive CSS exists, with a global 320 px minimum body width, several mobile layouts at approximately 760 px, some 900 px rules, and repeated `prefers-reduced-motion` overrides. These are source-level observations only: they do not prove there is no overflow, clipped content, keyboard trap, or unusable touch target at real viewport sizes.
- Customer wallet preferences are stored through the server API and include trading currency, swap currency, auto-top-up and withdrawal-whitelist preferences.
- The repository contains numerous unit/integration-style test files, including authentication, admin authorization, mining rules/motion, money handling, opportunity eligibility/lifecycle, trade settlement and installer safety/recovery tests.

These observations are from code/document inspection only. They do not establish that every feature is wired correctly or passes tests in a running environment.

## 4. Initial findings and risks to investigate

### P0 — Preserve financial correctness and existing account/data state
- Never use frontend animation, local storage, estimated opportunity returns, mining countdowns or sound as proof of a financial event.
- Confirm wallet balances, transaction states, trade settlement, mining credits and swaps against authoritative server/database records and immutable ledger behaviour.
- Do not run migrations, provisioning, database restore/backup commands, account creation, wallet adjustments, settlement workers or destructive cleanup as part of a visual audit.
- The README and `TODO.md` explicitly state that verified third-party settlement is not connected and that configured estimates must not be treated as verified real profit. Keep that boundary intact.

### P1 — Very large central frontend files
- `client/src/App.tsx` is approximately 248 KB and includes many customer/admin components and workflows in one file.
- `client/src/index.css` is approximately 227 KB. Several additional large feature stylesheets exist.
- This increases the risk of accidental regressions and makes broad redesign changes difficult to review. Before refactoring, identify existing CSS ownership and dependencies. Prefer small, reversible changes and avoid a large rewrite.

### P1 — Theme architecture needs a careful reconciliation
- The standalone `ThemeContext.tsx` supports only `light` and `dark` and persists a simple localStorage value when switchable.
- Source search found no `ThemeProvider` or `useTheme` usage in `client/src/App.tsx`, and `client/src/main.tsx` does not wrap the application in `ThemeProvider`. The existing context therefore appears unused by the active application entry point; confirm with a repository-wide search before changing it.
- The active portal instead relies on its existing dark-oriented global CSS and database-backed branding configuration/custom CSS variables. Branding accent settings are not a complete theme system.
- Stage 3 should establish one consistent theme policy and shared design tokens, preserving the current rendered appearance as Theme 1. Avoid introducing theme-provider behaviour during the baseline audit.

### P1 — Notification/sound scope is narrower than the new roadmap
- A notification centre and sound settings already exist, so the new work should extend and test them rather than create a duplicate system.
- Current admin sound controls observed cover opportunity, credit and debit categories, not the complete event catalogue in the roadmap. Event mapping, deduplication, preferences, quiet mode, volume and confirmed backend event semantics need an explicit gap review.
- Verify whether sound playback is triggered by confirmed persisted events or by local UI callbacks; avoid celebratory sound on a request alone.

### P1 — Route/documentation consistency and unreachable legacy code
- Source inspection of `App.tsx` confirms `/` renders `PortalGateway`, paths beginning `/ops-console-7f3a` render `AdminRoute`, and other paths (including `/customer`) render `CustomerPortal`, which calls the database-backed `trpc.auth.me` query. This contradicts the old route-manifest wording that described a simulated customer workspace; the manifest has now been corrected to match source-level routing.
- The active `App()` implementation returns for the root/admin/customer routing cases at lines around 441–443. A second, older UI implementation begins immediately after the unconditional customer return and is unreachable. This legacy block contains hard-coded demo balances/content and simulated interactions. Do not treat it as the active portal; review its safe removal separately after checking whether any imports/constants are shared.
- These conclusions are from source inspection. HTTP routing, deep-link fallback and session behaviour still need runtime/browser confirmation.

### P2 — Responsive baseline is present but not measured
- Existing mobile media queries and reduced-motion styles are positive starting points.
- No actual viewport/browser checks have been executed during this source audit. Layouts must be checked at the roadmap widths: 320, 360, 390, 430, 480, 768, 1024, 1280, 1440 and 1920 px, including keyboard/dialog behaviour and horizontal overflow.

### P2 — Deployment documentation is substantial but requires environment-specific proof
- The repository documents a universal installer, cPanel Node.js application setup, private terminal commands, VPS setup/rollback tools and verification/diagnostic scripts.
- PHP-only hosting cannot run the Express server. Installer files should not remain publicly accessible after setup; private application files, `.env`, SQL dumps and logs must not be exposed.
- No clean sandbox install, cPanel install or fresh VPS install was performed as part of this source review. These remain separate verification tasks in Stage 30.

## 5. Test and build baseline

The package scripts declare these non-destructive baseline commands:

```bash
pnpm check
pnpm test
pnpm build
```

Installer-specific tests/configuration also exist, including `vitest.installer.config.ts`, shell/Node safety tests and the `installer-validation.yml` workflow.

**Execution status:** GitHub Actions **Installer validation** run [39121401277](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39121401277) completed with overall conclusion **success**. The syntax job passed TypeScript validation, the application test suite, installer/migration safety tests, migration preflight/recovery regression tests, production build, frontend bundle/runtime-config budget checks, and the production-server smoke test without a database. The disposable fresh-MariaDB job passed its fresh-install, admin, migration-tracker and cleanup checks. The disposable MySQL 8 job passed the same fresh-install checks plus migration retry/recovery guards. The deployment-packages job assembled and validated one universal deployment ZIP and uploaded it as a workflow artifact. These are CI results on the workflow's tested commit; they do not prove that cPanel or a fresh VPS has been installed and exercised, and the ZIP artifact still needs environment-specific installation verification. No database-mutating commands were run against production as part of this audit.

## 6. Inventory findings added after CI and navigation review

### Customer navigation inventory
The customer navigation registry in `client/src/components/CustomerSlideMenu.tsx` has 5 groups and 22 listed destinations: Main navigation (8), Core Workspace (2), Project & Investment (5), Knowledge & Support (4), and Transparency & Updates (3). `Token Launch` and `Tokenomics` are explicitly marked planned/review-only; menu presence must not be interpreted as a live financial product. `CustomerWorkspace` renders several destinations through explicit section checks and the remaining resource/preference panels through registries. Customer sections are primarily in-app state, not independent URL routes. The mapping from each target to its component is partly established, but backend/API/access-policy verification remains outstanding.

### Administrator navigation inventory
`client/src/admin-navigation.ts` defines 9 groups and 33 navigation entries spanning overview, customers, finance, opportunities, verification/risk, communications, platform configuration, integrations, and governance/reports. Multiple entries intentionally share a canonical target (for example, related KYC/risk entries and opportunity subitems). Stage 1 must verify each distinct target is actually rendered and permission-guarded; a menu entry alone does not prove a functioning screen.

### Existing sound/event wiring (source inspection)
- `client/src/App.tsx` defines 30 generated tone presets and a sound settings shape with three configurable categories: `opportunity`, `credit`, and `debit`, plus global enable and opportunity-loop flags.
- The customer workspace fetches `trpc.customer.soundSettings` and polls every 15 seconds. Sound effects are also gated by the local-storage preference `wisebond-sound-effects`.
- Opportunity sound is called when a current offer popup is shown, subject to customer and administrator sound settings.
- The investment mutation invokes debit-style feedback in its success callback and failure-style feedback in its error callback; the source still needs semantic verification against backend responses and UI wording.
- The transaction-process view tracks seen event IDs and invokes debit/credit sound when new `DEBIT`/`CREDIT` events arrive, which is a useful deduplication baseline. It intentionally marks the initial fetched events as already seen, so opening the view does not replay historical sounds.
- Admin sound settings are persisted through `trpc.adminOperations.updateSettings`. The current source does not yet demonstrate a complete event-specific catalogue for deposit arrival, withdrawal requested/processed, trade settlement, mining reward, swap, or support events. Do not add celebratory feedback for an unconfirmed request.

These are source-level observations, not end-to-end proof of event timing or financial semantics.

### Backend API/access and transaction-console trace (additional pass)
- The shared tRPC middleware defines `protectedProcedure` to reject missing users and `adminProcedure` to reject users whose role is not `admin`. The current customer router contains 56 protected-procedure references and no public procedures within that router; the admin operations router contains 63 admin-procedure references. These counts are a useful first-pass guardrail, not a substitute for checking every nested router, helper, and object-level ownership rule.
- Customer financial and account endpoints generally pass `ctx.user.id` into the relevant service layer. The customer-facing `settle` mutation explicitly rejects direct settlement and states that settlement requires administrator confirmation after external payment confirmation. This is an important control to preserve.
- The customer sound-settings query reads the global `sound.settings` application setting through an authenticated procedure; administrator settings updates are guarded by `adminProcedure`. The persisted sound schema currently supports only `opportunity`, `credit`, `debit`, `enabled`, and `loopOpportunity`; event-specific deposit/withdrawal/mining/swap/support mappings are not present in that schema.
- The customer `opportunities` query records transaction-console events for auto-trades, settlements, and missed opportunities as it reads results. `recordTransactionConsoleEvent` deduplicates events with a transaction code per user and session, which mitigates repeated polling duplicates. This read-with-side-effects pattern still deserves tests for concurrency, missing session cookies, cross-session duplication, and event ordering before expanding notification triggers.
- `recordTransactionConsolePulse` creates `SYSTEM_ACTIVITY` rows that its own source comments explicitly describe as simulated and not wallet mutations. Some generated titles/messages resemble transaction lifecycle updates, so the UI should keep such activity unmistakably separate from actual ledger-confirmed debits, credits, investments, and settlements. Future sound effects must never play as if a simulated pulse were a real financial event.

These findings are source inspection only; they do not replace authorization tests or end-to-end event verification.

### Route-to-renderer source trace (additional pass)
- All 25 distinct administrator navigation targets in `client/src/admin-navigation.ts` have a corresponding section-render condition in `AdminPortal`. Multiple labels intentionally converge on the same canonical target. This verifies menu-to-renderer mapping only; each panel's mutation/query permissions and side effects still require procedure-level tracing and tests.
- The customer menu's core destinations (dashboard, wallet, opportunities, activity, mining, yield, support, account, advanced tools, and intelligence) are handled through dedicated section branches or the shared investment-category registry. The 12 resource destinations are backed by `customerResourceNavigation` and rendered through `customerResourceIds`; planned token-related entries must remain clearly marked as planned. Several customer preference destinations use a separate preference registry. These panels do not have individual URL paths.
- A source-text search found no direct `ThemeProvider` or `useTheme` usage in the active app entry or `App.tsx`; the current theme context appears unused. Repository-wide runtime confirmation is not available in this audit pass.
- The global stylesheet has a 320 px minimum body width, mobile breakpoints near 760 px and some 900 px layouts, plus reduced-motion overrides. No measured viewport screenshots, browser interaction checks, or keyboard/screen-reader acceptance results have been collected yet. This remains a Stage 1 exit blocker.


### Financial operation and Mining service trace (additional pass)
- **Customer Mining purchase confirmation:** source inspection shows the operation runs in a database transaction, validates a user-scoped quote under `FOR UPDATE`, checks quote expiry/version/configuration and rate deviation, validates available main-wallet funds, enforces the per-customer package claim, debits the main wallet, records mining ledger entries, creates the entitlement, marks the quote executed, and stores an idempotent result. The UI should present the returned purchase result only after the server mutation succeeds; the configured CKI reward disclaimer must remain visible and must not be described as verified pool output or a cash payout.
- **Customer Mining swap confirmation:** source inspection shows a user-scoped quote locked with `FOR UPDATE`, checks expiry and configuration version, recalculates pricing within configured tolerance, checks the available CKI balance, then performs conversion in a transaction and stores the idempotent result plus notification. Add explicit tests for retries and competing confirmations before relying on UI feedback for this flow.
- **Manual trade settlement concurrency gap to test:** the service checks pending status and duplicate settlement reference before posting ledger rows, updates wallet balance arithmetically, then updates the trade using a conditional status predicate. In the inspected code, the trade is not visibly locked before its initial status/reference checks, and the conditional update's affected-row count is not checked before ledger/settlement completion is returned. Concurrent confirmations may therefore need a stronger lock/conditional-write invariant and regression tests. Do not change this financial path as part of a visual-only stage.
- **Administrator balance adjustment concurrency gap to test:** the service performs a read-then-compute balance update inside a transaction, but the inspected balance read does not visibly use `FOR UPDATE`; the resulting absolute `availableMinor` can be vulnerable to lost updates if concurrent writers do not serialize on another shared lock. The ledger reference also uses administrator ID plus millisecond timestamp, so collision handling should be reviewed. Test concurrent credits/debits, insufficient-funds races, missing-balance creation and unique reference constraints before changing implementation.
- **Important distinction:** the Mining purchase/swap flows explicitly use idempotency keys and transactional quote checks; do not assume all financial pathways have the same concurrency guarantees. Add operation-specific tests and document results separately.

These are source-based risk findings for test planning, not proof of a production incident. No live balances, trades, Mining purchases or swaps were changed.
## 7. Initial priority queue

1. Obtain baseline type-check, test, and production-build results without touching production data.
2. Build a complete inventory of customer/admin destinations and map each to the actual component/API and access policy.
3. Identify existing CSS breakpoints, shared components and the true source of the current theme/branding behaviour.
4. Trace existing sound settings to the backend settings schema and real event call sites.
5. Confirm database-backed financial and notification event semantics before designing any new UI feedback.
6. Resolve discrepancies in route/deployment documentation.
7. Capture repeatable screenshots/manual observations at the target viewport widths before visual changes.
8. Only after the baseline is understood, proceed to Stage 2 (shared design system and responsive foundation), preserving working behaviour.



### Financial service and administrator-action trace (additional pass)
- `createTrade` performs its allocation in a database transaction. The source locks the customer row and the relevant wallet row, validates offer/package/limits and available balance, updates available and locked wallet amounts, inserts a ledger reservation, creates the trade position/lifecycle record, and links the opportunity delivery event. The delivery-event path supports replaying an already-created trade instead of allocating a second time. Preserve these atomicity and idempotency controls in later UI work.
- `manuallySettleTrade` performs wallet, ledger, trade-state, reward-reservation and lifecycle updates inside a database transaction. It rejects non-pending trades, negative/non-integer rewards, rewards above the reserved amount, missing wallets, and settlement references already found in the trade table. However, source inspection shows the initial trade read is not explicitly row-locked and the final conditional trade update's affected-row count is not checked. The reference check also needs a concurrency/unique-constraint review. Record these as high-priority verification items; do not attempt to settle or repair any real records during this audit.
- `adjustCustomerBalance` uses a transaction and validates administrator/customer targeting, enabled currency, positive amount, and insufficient-balance debits. It writes a ledger entry and customer notification with the wallet adjustment. The existing-balance read/update path does not visibly lock the balance row, and the update writes a calculated absolute balance. Concurrent adjustments therefore need a targeted concurrency test and review of affected-row/ledger atomicity before this pathway is treated as fully verified. No balance was changed during this inspection.
- The manual-settlement UI refreshes the pending-settlement and ledger queries after a successful response. This is useful feedback, but the UI refresh is not itself proof of ledger correctness; acceptance checks must compare trade status, ledger entries, available/locked balances, reward reservation and lifecycle evidence after the transaction.
- Repository search located trade-recovery classification/planner/context tests and a read-only evidence-collection workflow. These support careful recovery analysis but do not by themselves prove concurrent settlement or concurrent balance-adjustment safety. Add explicit service-level and disposable-database regression coverage for those cases before making claims of complete financial verification.

**Scope boundary:** this pass was read-only source inspection. No financial services, balances, ledger records, migrations, installer behaviour or customer-facing screens were changed.

## 8. Audit checkpoint

- [x] Read the 30-stage roadmap and confirm Stage 1 is first.
- [x] Inspect repository structure and declared stack/scripts.
- [x] Inspect main app entry, styles, navigation, theme context, sound settings, notification view, server entry/router and installer documentation.
- [x] Record initial findings and priorities in this report.
- [x] Retrieve CI evidence for type-check, application tests, installer/recovery tests and production build (workflow run 39121401277: success).
- [ ] Complete route-to-component/API/access-policy mapping for all customer/admin destinations; initial menu registry counts recorded above.
- [ ] Complete measured responsive/browser baseline.
- [ ] Complete theme/provider usage mapping and verify sound events against authoritative backend event semantics; initial source call sites recorded above.
- [ ] Update this report with evidence and mark Stage 1 complete only when exit criteria are satisfied.

**Next action:** Complete route-target and access-policy tracing, inspect ThemeContext/provider usage across app entry points, reconcile `route-manifest.md`, and continue responsive/browser baseline checks. Do not begin a broad UI rewrite yet.

## 10. Transaction-console, mining/swap, and event-truth follow-up (2026-10-18)

### Transaction-console event semantics
- `server/transactionConsole.ts` stores session-scoped console rows. `openTransactionConsoleSession` generates a random cookie-backed session and deletes existing console-event rows for that user before inserting a `SESSION_OPENED` entry. Confirm this retention behavior is intentional before treating the console as a durable audit history.
- `recordTransactionConsoleEvent` skips insertion when the transaction-console cookie is absent. Its duplicate check is a SELECT followed by INSERT scoped to user, session and transaction code. Unless a matching database uniqueness constraint exists, concurrent requests may race and insert duplicates; schema/index and concurrency tests remain required.
- `recordTransactionConsolePulse` explicitly describes its rows as simulated and non-wallet-mutating. It creates `SYSTEM_ACTIVITY` entries using configurable phrase templates. These rows are not ledger evidence and must not trigger financial-success sounds.
- Simulated status/copy can resemble real transaction lifecycle language. Customer-facing labels and sound routing must preserve the distinction between simulated telemetry and ledger-backed transactions.

### Mining and swap API
- Mining endpoints use `protectedProcedure` and pass `ctx.user.id` into service functions. Swap quote accepts token amount and target asset; confirmation accepts quote ID and an idempotency key; mining transaction history is authenticated.
- `server/mining.ts` uses Decimal arithmetic, validates supported main-wallet assets/precision, locks wallet rows before debits, checks available balance, conditionally debits, and inserts ledger entries. Credit paths lock existing wallet rows and write ledger entries. These are source-level controls, not proof of every transaction path or database constraint.
- Swap confirmation begins an idempotency flow inside a mining DB transaction. End-to-end verification must still cover quote ownership, expiry/status, one-time consumption, source-token debit/reservation, target-wallet credit, fees, ledger correspondence and replay under concurrent confirmations.
- Mining network telemetry includes an explicit `simulationOnly: true` marker. Keep this separate from real earnings, wallet balances, ledger history and success notifications.

### Notification and customer-history boundary
- The source exposes DB helpers including `listNotifications` and `markCustomerNotificationsRead`; mining history reads mining-ledger transactions and mining boost activations. Exact router filters and all customer history data sources still need end-to-end tracing before every displayed history view can be called authoritative.
- An API response or optimistic refresh alone does not prove a financial transaction posted. Sound/notification acceptance must require authoritative persisted state and matching ledger evidence; pending quotes, simulated console activity, errors and failed/retried requests must not announce financial success.

### Outstanding Stage 1 checks
1. Inspect swap confirmation end-to-end, including idempotency implementation and schema uniqueness/locking.
2. Trace customer notification/history procedures to storage queries and confirm per-user scoping.
3. Inspect console-event schema/indexes for deduplication and session-retention semantics; add targeted race/replay tests before proposing financial code changes.
4. Perform browser viewport, keyboard, reduced-motion and sound-permission checks when an available browser test environment can be used. No browser acceptance run is claimed here.
5. Stage 1 remains **in progress**. This source audit did not change financial logic or customer balances.


### Mining purchase flow follow-up
Source review of `client/src/components/CustomerMining.tsx`, `server/routers.ts`, and `server/mining.ts` found that the customer purchase button calls the convenience purchase endpoint without a separate terms-acceptance field. That endpoint calls the quote-confirmation service with `acceptedTerms: true`. Review whether this satisfies the product's intended consent requirement; if explicit acknowledgement is required, add a focused UI and server-side regression test while preserving quote validation, idempotency, and ledger safeguards. This is a source-level finding, not a confirmed production incident.

## 11. Swap idempotency, notification ownership, and ledger path (2026-10-18)

### Manual mining swap — source path traced
- `confirmCustomerMiningSwap` derives a request key using the operation prefix and customer ID, starts an explicit database transaction, reserves/loads an idempotency record, verifies the account is active, and selects the swap quote joined to its snapshot with both quote ID and snapshot owner ID constrained to the authenticated customer. The selected quote row is locked with `FOR UPDATE`.
- Confirmation rejects a missing/non-`QUOTED`/expired quote, invalid stored quote details, changed economics configuration version, insufficient CKI available balance, and market movement beyond the configured deviation threshold. It refreshes the relevant rate before executing.
- The conversion path credits the target main-wallet balance, writes a mining transaction and balanced per-asset ledger entries, creates a funding-plan and conversion record, changes the FX quote status to `EXECUTED`, stores the idempotent result and creates a customer notification within the transaction callback. The outer transaction commits only if the callback completes; errors roll back.
- The idempotency key is normalized and hashed with the operation prefix and customer ID; the idempotency table has a unique key on `keyValue`. The implementation locks the idempotency row and rejects command mismatch. A repeated successful key returns the stored result. Concurrent confirmation and rollback/retry behavior should still be proven by tests on the supported MySQL/MariaDB versions.
- The token source balance is read before `postMiningLedgerEntries`; the posting helper locks the affected mining-wallet rows in sorted ID order and checks resulting user balances are not negative before writing entries/updating wallet balances. This is a protective ledger path, but targeted concurrent-spend tests remain necessary to verify transaction isolation and row-lock behavior end-to-end.
- This source trace is stronger evidence than the earlier initial review, but it is not a substitute for executing race/replay tests against a disposable database. No real customer balances were changed.

### Customer notifications — ownership confirmed at helper boundary
- `listNotifications(userId)` filters `customerNotifications.userId = userId`.
- `markCustomerNotificationsRead(userId, notificationId)` constrains both notification ID and user ID; marking all unread notifications also includes the same user-ID condition. The helper returns that same user's filtered list after update.
- The router exposes these through `protectedProcedure` and passes `ctx.user.id`, rather than accepting a customer ID from the request. This is positive source-level ownership evidence for the notification path; authorization integration tests remain useful.

### Transaction-console deduplication — schema observation
- The Drizzle `transactionConsoleEvents` definition does not declare a unique index for `(userId, sessionKey, transactionCode)`. The source-level SELECT-then-INSERT duplicate guard can therefore race unless an equivalent constraint exists in an installer-created schema or external migration. Inspect all SQL migration/installer definitions before deciding on a schema change; do not modify production data or migrations as part of this audit note.
- Session open currently deletes all transaction-console events for the user, not only the current session. Confirm expected retention and customer-facing copy before changing it.

### Still outstanding
1. Run targeted swap replay/concurrent-confirmation and concurrent-spend tests against disposable MariaDB and MySQL 8 databases.
2. Inspect all installer and migration SQL for transaction-console indexes and confirm deployed schema parity.
3. Complete browser-based responsive/accessibility checks and event-to-sound acceptance tests in a real browser environment.
4. Keep Stage 1 open until remaining acceptance evidence is recorded.

## 12. Installer-schema parity and final swap trace (2026-10-18)

### Transaction-console schema parity confirmed
- Inspected both `drizzle/schema.ts` and `drizzle/0012_transaction_console.sql`. Neither declares a unique constraint on `(userId, sessionKey, transactionCode)`; the migration only adds a non-unique session lookup index on `(userId, sessionKey, id)`. This confirms the deduplication race concern exists in the checked-in Drizzle schema and this migration, rather than merely being an uncertainty about those two definitions. Before adding a unique index, check deployed-schema drift and existing duplicate rows, and plan a guarded/backward-compatible migration with explicit duplicate handling.
- `openTransactionConsoleSession` deletes every console event for the user, not just events for the current session. `closeTransactionConsoleSession` deletes only rows belonging to the current user and cookie session. This asymmetry is confirmed in source; whether to retain older sessions is a product/data-retention decision and should not be changed without deciding the intended history semantics.
- Console rows are therefore a transient UI feed, not a durable audit trail. Use the authoritative transaction/ledger tables for financial records.

### Manual swap confirmation trace — remaining nuance
- Confirmed the full `confirmCustomerMiningSwap` source path: customer-scoped quote/snapshot join with `FOR UPDATE`; quote status and expiry checks; stored details parsing; economics-version check; refreshed rate/deviation check; available CKI balance check; conversion execution; idempotency result storage; and notification creation within the database transaction.
- `beginMiningIdempotency` inserts-or-reuses a unique `keyValue`, locks the row, rejects command mismatch and returns a stored result when present. The schema declares `keyValue` unique. The confirmation flow is transaction-wrapped, but actual same-key and different-key concurrency behaviour, transaction isolation, and cross-database compatibility remain unproven until regression tests run.
- `executeTokenConversion` validates that the per-asset ledger balances and credits the destination main wallet through the canonical `mining-conversion:<quoteId>` reference before recording mining-ledger entries and the conversion/plan records. The surrounding transaction should make these writes atomic on transactional tables; test failures injected between steps and replay/concurrency cases before claiming verified behaviour.
- `listCustomerMiningTransactions(userId)` filters mining ledger transactions and boost activations by the supplied user ID and combines them into a recent history view. Its router must continue supplying the authenticated `ctx.user.id`; this view is not a substitute for reconciling the separate main-wallet and mining ledgers.

### Required next verification
1. Review database engine/table definitions and migration tooling to confirm all participating tables are transactional and migration rollout is safe.
2. Add/run duplicate-event migration preflight and idempotency/replay/concurrency regression tests in disposable MariaDB and MySQL 8.
3. Decide whether transaction-console history is intentionally deleted on new session, then document retention policy.
4. Complete browser/responsive and event-to-sound checks; none are claimed as run in this source-only pass.
5. Stage 1 remains **in progress**. No financial code, database schema, or customer data was changed by this audit update.

### Follow-up schema-width check
- The initial transaction-console table migration declares `amountMinor` as `INT`, while the current Drizzle schema uses a bigint representation. Follow-up search found `drizzle/0043_wallet_minor_units_bigint.sql` explicitly alters `transaction_console_events.amountMinor` to `BIGINT NULL`, and the schema-audit script expects the live column type to be bigint. This resolves the apparent migration-history discrepancy for deployments that have applied migration 0043; still verify the installed migration ledger and live schema on each target environment.
- This follow-up is a source/migration inspection only. No database connection or live schema was inspected, and no migration was run.

## 13. Transaction-console migration parity and numeric-width finding (2026-10-18)

- A direct comparison shows the initial table definition in `drizzle/0012_transaction_console.sql` creates `amountMinor int`, while `drizzle/schema.ts` declares a bigint. Follow-up inspection found that `drizzle/0043_wallet_minor_units_bigint.sql` explicitly widens `transaction_console_events.amountMinor` to `BIGINT NULL`, and the portal migration runner includes migration 0043. Therefore this is an initial-definition mismatch that is addressed by the later migration **when that migration has actually been applied**, not evidence by itself that the final intended schema remains mismatched.
- The checked-in 0012 table definition and Drizzle schema still do not declare a unique constraint for `(userId, sessionKey, transactionCode)`; migration 0043 changes only the numeric width for this table. The application-level SELECT-then-INSERT duplicate guard can therefore admit duplicates under concurrent requests if no out-of-band constraint exists. Before any schema change, preflight duplicates and review null transaction codes and existing deployment drift.
- The portal migration runner uses per-file checksums/status tracking and refuses untracked existing schemas unless an operator explicitly confirms a reviewed baseline. That is a useful safeguard, but it does not prove a particular installation has applied migration 0043. Verify actual disposable MariaDB/MySQL 8 schemas and installer recovery paths before claiming deployment parity.
- The transaction-console pulse code intentionally marks system activity as simulated and does not mutate wallets. Keep simulated telemetry distinct from authoritative ledger-backed financial events. Console rows are transient session UI data, not a durable financial audit record.
- No schema, installer, financial logic, or customer data was changed. No database concurrency test was run during this source-only continuation; Stage 1 remains **in progress**.

## 14. Event-to-sound wiring trace (2026-10-18)

- The active customer workspace polls the authenticated sound-settings query every 15 seconds, while the transaction-console feed polls for current session events. Browser playback also requires the customer's local `wisebond-sound-effects=on` preference; administrator configuration alone does not override that local opt-in.
- The transaction-process event watcher initializes its seen-ID set from the first loaded batch, then plays the configured debit sound for newly seen `DEBIT` rows and the credit sound for newly seen `CREDIT` rows. This avoids replaying the initial history on mount, but it also means any event arriving before the user enables sound or while the feed is unavailable is not guaranteed to be replayed later. Treat this as presentation feedback, not a delivery guarantee.
- Other source paths use generic opportunity chimes after successful support-ticket submission and admin ticket reply, while wallet/trade mutation handlers play a success sound after successful mutation and a failure-style sound on errors. These generic sounds do not yet provide the requested administrator-controlled per-event taxonomy (deposit, withdrawal, mining, swap, support, and other event-specific settings).
- The server-side global sound settings query is authenticated, but returns the global setting object; the admin update path remains the policy boundary. Continue checking that every customer-facing sound is gated consistently and never signals financial success before the authoritative mutation resolves.
- No sound logic was changed and no browser audio acceptance test was run. Browser gesture/unlock behaviour, mobile playback, repeated polling, mute/enable transitions and event ordering remain Stage 1 verification items.


## 15. Swap confirmation and notification ownership follow-up (2026-10-18)

- The Mining router exposes `confirmSwap` as a `protectedProcedure` and passes `ctx.user.id` to `confirmCustomerMiningSwap`. The public input is limited to a positive integer quote ID and an idempotency key of 8–160 characters. This confirms authentication and user-context propagation at the router boundary; it does not by itself prove quote ownership or transaction correctness.
- The service builds a user-scoped request key with the `mining-swap` namespace and enters `inMiningTransaction` before beginning the `mining.swap.confirm` idempotency flow. The success path records the result with `finishMiningIdempotency` and creates a customer notification after constructing the conversion result. The source search confirms these controls are present, but the complete quote-locking, quote-owner, quote-expiry/status, one-time consumption, fee, debit/credit, and concurrent-replay path still requires a focused full-function review and regression tests.
- Customer notification helpers are ownership-scoped: `listNotifications(userId)` filters by `customer_notifications.userId`; `markCustomerNotificationsRead(userId, notificationId)` constrains both notification ID and user ID, and mark-all-read uses the same user scope. The customer router passes `ctx.user.id` to both procedures. This is a source-level ownership finding, not a substitute for cross-account integration tests.
- The current `customer_notifications` schema has no event identifier or deduplication key. Repeated invocation of a notification-producing operation can therefore create multiple notification rows unless the caller or operation's idempotency transaction prevents replay. Confirm this with retry/replay tests before centralizing notification delivery.
- The `transaction_console_events` schema has session/user fields and no declared unique index in the inspected table definition; the audit's earlier concurrency finding remains open. A code-level duplicate guard does not guarantee uniqueness under simultaneous inserts.
- **Next verification (updated after section 16):** add or extend tests for wrong-owner quote IDs, expired/already-executed quotes, concurrent same-key and different-key confirmations, ledger debit/credit correspondence, and notification replay/rollback; run targeted tests and record exact results. The full-function source trace is now recorded in section 16. Do not change production data or run migrations as part of this audit.


## 16. Full Mining swap confirmation source trace (2026-10-18)

A focused read of `confirmCustomerMiningSwap`, `executeTokenConversion`, and the mining ledger store helpers established these source-level controls:

- **Ownership and row concurrency:** the confirmation query joins the quote to its snapshot and filters by `q.id`, `s.userId`, and `s.purpose='manual_swap'`, using `FOR UPDATE`. A quote ID belonging to another user or another quote purpose will not match this query.
- **Lifecycle and configuration:** confirmation rejects quotes not in `QUOTED` state, expired quotes, malformed quote details, and quotes whose stored configuration version differs from current configuration.
- **Rate tolerance:** the service recalculates conversion economics from current rates and rejects a net amount that moves outside the configured basis-point tolerance. The credited amount remains the quoted destination amount when within tolerance; this is a design choice to verify against product requirements and receipt wording.
- **Replay protection:** a user-scoped request key is reserved through `beginMiningIdempotency` inside the database transaction, and a successful result is persisted by `finishMiningIdempotency`. A same-key replay can return the stored result. Distinct-key concurrent confirmation should serialize on the quote row and observe its changed status after the first transaction commits; this must still be proven by automated concurrency tests.
- **Ledger and balance checks:** `executeTokenConversion` constructs CKI debit/clearing and target-asset credit/clearing/fee entries. `postMiningLedgerEntries` validates per-asset journal balance, locks wallet rows in stable ID order, computes new balances, and rejects negative customer Mining wallet balances before posting ledger rows and persisting the wallet balances. The conversion also credits the target asset through the canonical main-wallet balance/ledger helper and marks the quote `EXECUTED` within the surrounding transaction.
- **Notifications:** the completion notification is inserted after conversion execution and idempotency result storage but before the transaction callback returns. Notification delivery/deduplication and transaction rollback behaviour should be tested with retries; the notification table itself has no unique event key.
- **Boundary to preserve:** Mining's `v5_wallets` journal and the canonical `customer_balances` main wallet are separate stores. Confirm that product labels, displayed balances, and history make this cross-store conversion clear and that a failure in either ledger path rolls the complete database transaction back.

**Source-review result:** the inspected implementation contains quote ownership, lifecycle, idempotency, tolerance, and ledger non-negative/balancing guards. This is not test evidence. Still required: wrong-owner/expired/executed quote tests; same-key and different-key concurrency tests; assertions that the CKI debit, clearing entries, target-wallet credit, canonical main-wallet credit, fee and conversion receipt all agree; notification replay/rollback tests; and an integration test proving atomic rollback across both wallet stores. No tests were run and no runtime or financial data was changed during this review.

## 17. Mining idempotency unit-test addition (2026-10-18)

Added `server/mining-store.test.ts` with unit coverage for the pure `requestKey` helper:

- The same normalized client key, operation namespace, and customer produce the same opaque digest.
- The same client-supplied key is isolated across different customer IDs.
- The same client-supplied key is isolated across different operation namespaces.
- Surrounding whitespace is normalized before hashing.
- Empty, too-short, too-long, whitespace-containing, and unsupported-character keys are rejected.

**Verification status:** the test file was committed to the working branch, but this environment has not executed the Vitest suite or type-check. These are test definitions, not passing test evidence. The unit tests do not replace database-backed tests for quote ownership/expiry, same-key replay, simultaneous different-key confirmations, ledger correspondence, atomic rollback, or notification replay/ownership. Those remain required before Stage 1 can be approved.


## 18. Transaction-wrapper regression coverage (2026-10-18)

Extended `server/mining-store.test.ts` with focused unit tests for `inMiningTransaction`:

- The success path begins a transaction, runs the callback, commits, and returns the callback result.
- The failure path begins a transaction, runs the callback, rolls back, and rethrows the original error.
- The tests use a lightweight mock connection and do not require a database.

**Verification status:** Test definitions are committed in `13b2ea81f0885a06848cecbea4c2a2bf64c0853a`. This environment has not executed these newly added cases against the current commit. The most recently inspected successful CI run checks an earlier workflow commit and is not evidence that these new cases passed. Database-backed swap quote lifecycle, concurrent replay, ledger correspondence, cross-store rollback, and notification deduplication/ownership tests remain outstanding.

**Next action:** Run `pnpm test -- server/mining-store.test.ts` and `pnpm check` on the current branch, then implement integration tests using an isolated disposable MySQL/MariaDB database. Do not use production data or mark Stage 1 complete until the new tests and remaining route/API/access and browser checks have passed.

## 17. Transaction wrapper regression coverage

- Added unit coverage in `server/mining-store.test.ts` for a transaction callback succeeding, callback failure causing rollback and preserving the original callback error, commit failure causing a rollback attempt while preserving the commit error, and begin-transaction failure preventing callback execution.
- Test changes committed on `integration/auth-installer-vps-safety`: `2b77a8472125671381013c4b5a4781c13576ac71`.
- **Execution status: pending.** These are test definitions only; they have not been run in this environment. The commit/rollback cases use a mocked `PoolConnection` and do not prove database-backed swap atomicity.
- Still required: execute `pnpm test -- server/mining-store.test.ts` and `pnpm check`; then add isolated database-backed tests for quote ownership/status/expiry, same-key replay, concurrent confirmations with distinct keys, ledger/main-wallet correspondence, and rollback after injected conversion failures. Do not use production credentials or change production financial data for these tests.



## 19. Rollback-failure diagnostics hardening (2026-10-18)

- Updated `inMiningTransaction` to preserve the original operation/commit error if the rollback attempt also fails. When possible, the rollback error is attached to the original error as `rollbackError` for diagnostics; attaching metadata to a frozen error is safely ignored so it cannot replace the original failure.
- Added a unit test that simulates both an operation failure and a rollback failure, asserting that the original error is still thrown and the rollback error remains available as diagnostic metadata.
- Implementation commit: `c88b62a1d20e5471ba66c4ea9aa1a44dc3474411`.
- Test commit: `d11c7abd59865a3be76403e9481d19096d0c1b28`.
- **Verification status: pending.** The updated Vitest file and TypeScript checks have not been executed in this continuation. This hardens error reporting but does not prove database rollback succeeded after a real database failure. Stage 1 remains in progress.


## 20. Automated Mining regression CI added and executed (2026-10-18)

- Added `.github/workflows/mining-regression.yml` to run `pnpm test -- server/mining-store.test.ts` and `pnpm check` for pull requests targeting `main`, pushes to `main` and the active integration branch, and manual dispatch.
- The first workflow attempt failed during Node setup because pnpm was not installed before the Node action attempted to initialize pnpm caching. The workflow step order was corrected so pnpm is configured before Node caching.
- Successful workflow run: [Mining regression checks](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39126931162), commit `1756134739c4aa7408a032b2afbdf12403b55a3b`. Dependency installation, the targeted Mining store Vitest file, and the TypeScript check all completed successfully.
- This is passing unit-test/type-check evidence for the current Mining store unit suite, not proof of database-backed financial integrity. Still required: isolated MariaDB/MySQL swap ownership/expiry/replay/concurrency tests, ledger-to-main-wallet reconciliation, injected-failure rollback coverage across participating stores, notification replay/ownership tests, and remaining API/accessibility/theme/sound/responsive browser checks.
- Stage 1 remains **in progress**. No production database, customer data, or live financial balances were accessed or changed during this validation.


## 21. Per-asset ledger safeguards and current CI evidence (2026-10-18)

- Added unit tests for three pre-write ledger invariants: each asset's journal entries must net to zero independently; different assets cannot cancel one another; and amounts exceeding the asset's supported precision are rejected before database operations.
- Test commit: `990f0cea7816660ba03c54e947e8d3f4c1c12443`.
- **CI verified:** [Mining regression checks](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39127597399) completed successfully for that commit. Dependency installation, `pnpm test -- server/mining-store.test.ts`, and `pnpm check` all passed.
- These are unit-level safeguards only. They do not establish that live MySQL transactions balance and reconcile across the Mining ledger and main-wallet ledger, nor prove quote ownership/expiry, concurrent confirmation behavior, injected-failure rollback, or notification deduplication. Those database-backed checks remain outstanding; Stage 1 is still in progress.


## 22. Mining idempotency reservation regression tests (2026-10-18)

- Added four unit tests around `beginMiningIdempotency`: completed retry returns the stored JSON result; reusing a key for a different command is rejected; a missing reservation row is rejected; and an in-progress reservation with no stored result returns `null`.
- Test commit: `ba5d7ab739d84c35c13c379987139aa0c18eff34`.
- **CI verified:** [Mining regression checks](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39128083628) completed successfully for this commit. Dependency installation, the Mining store regression test file, and `pnpm check` all passed.
- These are mock-connection unit tests. They do not prove real database locking, simultaneous same-key/different-key behavior, transaction isolation, or cross-wallet atomic rollback. Isolated MySQL/MariaDB integration tests remain required.
- Stage 1 remains **in progress**; no production database or customer financial data was accessed or changed.

## 23. Unfinished idempotency reservation guard (2026-10-18)

- Source review found that `beginMiningIdempotency` returned `null` both when it had just inserted a new reservation and when an existing reservation had no stored result. Callers interpret `null` as permission to proceed, so a pre-existing unfinished reservation could be treated like a fresh request.
- Updated the helper to inspect the `INSERT IGNORE` result: a newly inserted row may proceed; a duplicate row with a stored result returns that result; a duplicate row with no result now fails with an explicit in-progress error instead of rerunning the operation.
- Added/adjusted mock tests for a newly inserted reservation, an existing unfinished reservation, and a completed retry modeled as an ignored duplicate insert.
- Implementation commit: `59e683fec930da4d56e5b66d06ee92a7978e8d25`.
- Regression-test commits: `5e5de580151cc9aa47da00a25517ef405bbf475f` and `19ec6fac9c16940881fa8d91c31415009730c604`.
- **Verification status:** GitHub Actions was triggered for the updated code. The latest run must complete successfully before these newly added tests are marked CI-verified. This is still mock-connection coverage; real database concurrency/replay and transaction rollback tests remain required.
- Stage 1 remains **in progress**. No production database or customer financial data was accessed or changed.

## 24. Idempotency result persistence guard (2026-10-18)

- Follow-up review found that `finishMiningIdempotency` did not check whether its update actually saved the operation result. If the reservation row were missing or already populated unexpectedly, the caller could otherwise continue without confirming the replay result was stored.
- The helper now updates only rows whose `resultJson` is still NULL and throws if exactly one row was not updated. When used inside the existing Mining transaction wrapper, this error is intended to abort the transaction rather than commit financial changes without a saved idempotency result.
- Added regression tests for successful conditional persistence and the missing/already-filled reservation failure case.
- Implementation commit: `3cc362ed6dc89a18080c71921c41abe17a4a414f`.
- Test commit: `78881b72531e6ed104f60e4d0b60e7ee7e70be16`.
- **Verification status:** GitHub Actions run [39128826878](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39128826878) completed successfully, including Mining store regression tests and the TypeScript check. This run includes the result-persistence failure rollback test added in commit `ea640b462452583a5884b7db1a6b7e3fcb93c70f`.
- Tests still use mocked connections; database-backed concurrency, cross-ledger atomicity, and rollback under real database failures remain outstanding.
- Stage 1 remains **in progress**. No production database or customer financial data was accessed or changed.


## 25. Idempotency schema and quote-confirmation review (2026-10-18)

- Verified the Drizzle schema and foundation migration both define `v5_idempotency_keys.keyValue` as NOT NULL with a UNIQUE constraint. Mining request keys are namespaced by operation and user ID before hashing the caller-supplied key, so different Mining commands/users do not intentionally share the same stored key.
- Reviewed the package-confirmation path: it locks the user-owned quote row, requires `QUOTED` status and a future expiry, verifies the published package version and pricing configuration snapshot, rechecks rate deviation and available main-wallet funds, and records the purchase, ledgers, quote status, notification, and idempotency result inside the transaction wrapper.
- This is source/schema review, not a real database execution. Outstanding risks still require isolated MySQL/MariaDB tests: unique-key contention under simultaneous requests; quote confirmation racing with another confirmation; rollback across both main-wallet and Mining ledger writes; and notification delivery/replay behavior.
- Latest observed CI status: workflow run [39128928653](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39128928653) completed successfully after the audit record update; the code-and-test run [39128826878](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39128826878) also passed Mining store regression tests and TypeScript checking.
- Stage 1 remains **in progress**. No production database, customer data, or live financial balances were accessed or changed.


## 26. Main-wallet BIGINT precision boundary review (2026-10-18)

- Source review found that Mining's `walletMinor` rejects debit/credit amounts outside JavaScript's safe-integer range, but `readMainWalletBalance` converts the database's `customer_balances.availableMinor` value to `Number` without applying the same `Number.isSafeInteger` guard.
- The column is a signed MySQL `BIGINT` (see migration `0043_wallet_minor_units_bigint.sql`). Values above JavaScript's safe-integer limit cannot be represented exactly as a `number`; an imprecise balance can affect displayed available balance and comparisons before the conditional SQL debit update. The SQL predicate `availableMinor>=?` is an additional safeguard, but does not replace exact read/compare semantics.
- Recommended before production: fail closed when a loaded minor-unit balance is not a safe integer, or adopt exact bigint/string arithmetic end-to-end with driver configuration and tests. Add tests for the largest supported value, one above the safe-integer boundary, and conditional debit behavior.
- Resolution: `parseMainWalletMinor` now accepts only non-negative integer values from `0` through `Number.MAX_SAFE_INTEGER`, handling decimal strings through `BigInt` before conversion. Malformed strings, negative values, unsafe numeric values, and values above the safe-integer boundary fail closed. Regression tests cover the maximum safe integer and invalid/over-boundary inputs.
- Implementation commit: `00490e28ca885c1536899bbc2a26ee78ff41b974`; regression-test commit: `3c1380c86693c6f614e3c7c93228c7ed154b17c7`.
- Status: **unit-level safeguard implemented and CI-verified; database-backed debit/credit concurrency and cross-ledger atomicity remain unverified**. The guard intentionally fails closed rather than attempting exact `BIGINT` arithmetic above JavaScript's supported range.
- Stage 1 remains **in progress**. No production database was queried and no financial records were changed.


## 27. Main-wallet precision fix — CI verification (2026-10-18)

- Corrected the integer-string validation expression in `server/mining.ts` so valid decimal integer strings are accepted and malformed strings are rejected.
- GitHub Actions [Mining regression checks — Run #27](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39129770879) completed with conclusion **success** on commit `00490e28ca885c1536899bbc2a26ee78ff41b974`.
- The job's dependency installation, Mining store regression tests, and TypeScript check all completed successfully.
- The current draft integration pull request is [#58](https://github.com/stannmoye/Arbitrade_platform/pull/58); it remains open and unmerged. A passing focused regression workflow does not imply that every required pull-request check or production acceptance gate has passed.
- Remaining Stage 1 blockers: isolated MySQL/MariaDB concurrency and rollback tests, ledger reconciliation, notification replay/ownership checks, full API/access-control verification, and measured browser/viewport acceptance. Production remains unapproved.
- No production database, customer balances, or live financial transactions were accessed or changed.


## 28. Run #28 confirmation and parallel Stage 1 workstreams (2026-10-18)

- Confirmed GitHub Actions [Mining regression checks — Run #28](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39129998734) completed with conclusion **success** on commit `c31fc8f0b78f71491f4c78242af79b7b875a4a78`.
- The workflow's single job, `Mining unit tests and TypeScript check`, completed successfully. This confirms the focused unit-test and type-check baseline after the audit-documentation update.
- Parallel source review reconfirmed the transaction-console schema history: migration `drizzle/0043_wallet_minor_units_bigint.sql` widens `transaction_console_events.amountMinor` to BIGINT, but actual deployment parity still requires migration-ledger/schema verification on disposable supported databases.
- The application-level SELECT-then-INSERT guard for transaction-console event duplicates remains a concurrency risk unless a verified database uniqueness constraint exists. Do not add a unique constraint before a duplicate-data preflight and review of null/legacy transaction codes.
- The sound audit remains source-based: administrator navigation exposes Sound & Notifications, but requested per-event sound controls and browser interaction acceptance are not yet verified as complete.
- Work is split into independent tracks to reduce idle time: (1) migration/deduplication preflight and disposable database tests, (2) swap/idempotency/ledger rollback integration tests, and (3) API authorization plus sound/responsive-browser acceptance. Changes affecting the same schema or transaction paths must be serialized after shared prerequisites are verified.
- No database-backed integration test, browser acceptance run, production deployment, or financial-data mutation occurred in this checkpoint.
- Stage 1 remains **in progress**. Run #28 does not close the database, authorization, notification, or browser acceptance gates.


## 29. Simulated transaction-console activity labeling fix (2026-10-18)

- Fixed a presentation-integrity issue in `server/transactionConsole.ts`: generated `SYSTEM_ACTIVITY` rows previously used transaction-like titles/statuses such as “Transaction route confirmed” and stored the generated outcome as if it were the event status, despite the code comment describing these rows as simulated.
- Added `presentSimulatedActivity`, which now returns status `SIMULATED`, title `Simulated system activity`, an explicit “SIMULATION ONLY — no wallet movement was performed” message prefix, and the generated outcome separately as `simulatedOutcome`.
- Persisted `simulationOnly: true` and `simulatedOutcome` in event metadata so downstream UI and audit code can distinguish generated telemetry from ledger-backed transactions.
- Added `server/transactionConsole.test.ts` coverage for all five generated outcome categories and expanded `.github/workflows/mining-regression.yml` to run it alongside the Mining regression suite.
- Verification: GitHub Actions [Mining regression checks — Run #33](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39130570653) completed successfully, including the combined regression tests and TypeScript check, on commit `14603d98f81638ad9c4e47ab913fee81d980a72d`.
- Parallel source review: swap confirmation uses a customer-scoped quote/snapshot join with `FOR UPDATE`; idempotency keys are unique and operation-scoped; notification reads/updates constrain customer ownership. These are source-level findings, not substitutes for database-backed concurrency or authorization tests.
- Still open: transaction-console SELECT-then-INSERT deduplication race, migration/schema parity on disposable MySQL/MariaDB databases, full sound/notification behavior, and measured responsive-browser acceptance. No production database or production deployment was accessed.
- Stage 1 remains **in progress**; production readiness remains blocked.


## 29. Transaction-console duplicate race remediation (2026-10-18)

- Implemented MySQL advisory-lock serialization around the transaction-console event existence check and insert, keyed by a SHA-256 digest of customer ID, session key, and transaction code. Lock names are fixed at 64 characters and do not expose those identifiers.
- The event insertion path now fails closed if the lock cannot be acquired and releases the lock in a `finally` block after both successful and unsuccessful callbacks.
- Added unit coverage for lock-name scope/opacity, acquire-work-release ordering, timeout fail-closed behavior, and lock release when work throws.
- This mitigates the application-level SELECT-then-INSERT race among requests using this code path without requiring a uniqueness migration against legacy installations. Database-backed concurrency verification is still required; the test suite does not prove behavior on every supported MySQL/MariaDB version.
- No production database or production data was accessed or changed. Stage 1 remains **in progress** pending CI, database integration, API, and browser acceptance.
