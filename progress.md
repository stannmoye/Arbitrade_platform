## 2026-10-29 — Admin-editable Trading pop-up and company rotation requirements

- Verified that PR #226, **Disable synthetic Trading opportunity generation**, merged into `main` as `21a9f6a95aa72d464886c1c164016491ec7391dd`. Its six main-commit workflows all completed successfully: Trading settlement DB integration, Trading tier qualification DB integration, Mining regression checks, application verification, installer validation, and production source build/test. No production deployment or production database change was performed.
- Started documentation branch `docs/admin-editable-trading-popups` from that verified main commit.
- Added `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md` with the admin package-edit buttons and meanings, badge settings, threshold/duration/quota, required capital and capital bounds, configurable profit percentage range, display duration, schedule, limits, company rotation, audit history, customer pop-up content, restart-safe worker requirements and acceptance checks.
- Updated `docs/TRADING_SYSTEM_SPECIFICATION.md`, `AGENTS.md`, and `docs/admin-portal-menu-guide.md` to link to and enforce the manual.
- Important financial integrity rule: an admin-configured percentage range is not permission to randomly generate realized profit. Until an approved auditable result exists, the customer sees a labelled policy/estimate range, not earned profit or a wallet credit. The catalogue remains local reference data and does not establish listing or execution.
- Company rotation must use stable Logo IDs and the existing local 1,811-record catalogue, preserve matching name/logo/country metadata, persist rotation state, avoid repeats within the configured pool where possible, and resume safely after restart without duplicate opportunity/allocation/settlement.
- Validation state for this documentation branch: edits are committed on the feature branch; exact-head CI has not yet run. Next step is to inspect the diff, open a PR, and merge to `main` only after the required checks pass. The repository currently has no tracked `docs/TRADING_SYSTEM_SPECIFICATION.pdf`; no PDF update is claimed.

# Current Trading Handoff — 2026-10-29

**Repository:** [stannmoye/Arbitrade_platform](https://github.com/stannmoye/Arbitrade_platform)  
**Canonical branch:** `main`  
**Baseline `main` before this increment:** `6befd5ed7036818abf05144a2b522f49e3715645` (PR #220 squash merge)  
**Completed task:** Task 3 — durable worker health, recovery visibility and Trade Settings dashboard.  
**Status:** PR #217 was merged after exact-head CI passed. Post-merge checks on `main` were started and must be verified before considering this increment fully accepted. No production migration or deployment has been run. Automated checks do not certify the user's live server.

## Authoritative Trading tier policy

This policy is final and must be followed throughout the application:

- Customers must not browse, select, subscribe to, purchase, or activate Trading packages/tiers.
- Only authorized administrators configure tiers and their thresholds, duration, quota, schedule, allocation limits, risk controls and display settings.
- Tier entitlement is assigned automatically by the server only when cumulative, persisted qualifying credits manually submitted by an authorized administrator through the admin portal's **Credit Customer / wallet-credit form** meet an enabled tier's threshold.
- The admin portal's **Credit Customer / wallet-credit form is the sole qualifying source**. Only a positive customer credit manually submitted by an authorized administrator, explicitly classified as qualifying, and committed as `admin_manual_deposit_credit` qualifies. Customer/provider deposits, signup credits, imports, generic adjustments, profits, rewards, returned principal, bonuses, transfers, swaps, conversions and all other credit paths are excluded.
- Preserve the USD-minor-unit attribution and the currency rate, provider/source and timestamp used at credit time. Stale or unverifiable rates fail closed. A separately audited reversal linked to the original credit reverses that qualifying attribution; an ordinary debit does not.
- All active qualifying tiers contribute their configured daily opportunity quotas cumulatively. Never assign a fallback tier or quota.
- Customer-facing Trading UI/API may expose only a read-only eligibility result and total daily opportunity allowance. Do not expose tier names, thresholds, catalogue, subscription history, internal entitlement identifiers, or activation/management actions.
- Customer reads, login, refresh, popup views and client actions must not create entitlements, allocate capital, run worker lifecycle transitions or settle trades. The scheduled server worker owns automatic processing.
- Internal-ledger records, actual supported trade outcomes, transactional idempotency, auditability and reconciliation remain mandatory. Estimates are never realized results or ledger credits.

## Changes present in PR #205 at last inspection

- Replaced the customer package catalogue/activation experience with a read-only eligibility and combined allowance summary.
- Removed customer package listing/activation routes and legacy activation service references from the changed application code.
- Added explicit administrator classification of manual credits, qualifying USD attribution and conversion evidence, and audited deposit reversals. Policy clarification: only the admin portal's Credit Customer flow may create a qualifying Trading tier credit; all other deposit/credit paths are excluded.
- Added forward migration `0080_qualifying_admin_deposit_attribution.sql`; it preserves legacy subscription rows for audit but expires legacy customer-created entitlements. Migration history is retained and must not be deleted or rewritten to pretend old migrations never existed.
- Added/reconciled automatic tier entitlement creation, cumulative quota evaluation, worker-only lifecycle operations, API sanitization and policy contract tests.
- Updated `docs/TRADING_SYSTEM_SPECIFICATION.md` and `AGENTS.md`, removed the duplicate `docs/implementation-matrix.md`, and updated this handoff and the administrator menu guide to the authoritative policy.

## Admin-portal-only qualifying-credit clarification (2026-10-28)

- Reaffirmed the sole qualifying source: a positive credit manually submitted by an authorized administrator through the admin portal's **Credit Customer / wallet-credit form**, explicitly classified as `qualifying_deposit`, and committed to the customer's ledger as `admin_manual_deposit_credit`.
- Explicitly excluded customer/provider/payment-gateway deposits, signup credits, imported/opening balances, generic adjustments, profits, rewards, returned principal, bonuses, transfers, swaps, conversions and all other credit/deposit paths.
- Updated the canonical Trading specification, `AGENTS.md`, README, admin menu guide, master roadmap and this handoff. Updated the Credit Customer form copy to state the sole source and strengthened the Trading qualification contract tests to check admin-only route protection and signup-credit exclusion.
- The server-side implementation already gates qualifying attribution on the admin-only `adjustCustomerBalance` route, an explicit qualifying classification, a customer account, and the `admin_manual_deposit_credit` ledger type; tier reconciliation sums only that ledger type and linked audited reversals. The regression suite still needs to run on the exact final branch head.

## Required remaining work

1. Continue repository-wide searching on the PR branch for old customer Trading package selection, activation, manual assignment, wallet-balance qualification, repeat-purchase and cooldown flows. Distinguish obsolete Trading policy from unrelated Mining packages and immutable migration history.
2. Review all active Trading guides, admin menu documentation, roadmap, test contracts, router/API exports, components, service modules, settings, schema, migration journal and installer migration lists. Rewrite conflicting active docs; preserve historical audit records only when clearly historical and not presented as current instructions.
3. Verify migration `0079` against canonical `main` and ensure the settlement-timing repair and migration `0080`/ `0081` apply in the correct order. Do not merge the conflicting migration from PR #200 without explicit reconciliation.
4. Inspect the full PR #205 diff, especially the treatment of legacy entitlements and qualifying-credit/reversal attribution.
5. Run exact-final-SHA validation: `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, `pnpm build`, migration/installer validation, browser acceptance, Trading recovery checks and Mining regression checks. Report only results verified on the exact SHA.
6. Do not merge or deploy without authorization and successful validation.

## Latest documentation consistency increment

- Updated `docs/admin-portal-menu-guide.md` to remove manual customer package assignment from account creation/editing and Opportunity Engine guidance, and to document automatic tier qualification.
- The documentation-only commit created by that update is `52bfa0cf2d230883ef581edf14242ad921a7cedc`. The branch head moved; re-fetch the current PR head before any further write or validation.

## Credit-time USD conversion clarification (2026-10-28)

- Only qualifying credits submitted through the authorized admin portal Credit Customer form count toward Trading tier thresholds.
- For each qualifying credit, the server must fetch a live USD rate for the selected enabled wallet currency at credit time, persist the exact rate/provider/source timestamp and FX snapshot, and attribute the resulting USD minor units to that ledger credit. USD is 1:1; supported fiat uses Frankfurter/ECB with Open ExchangeRate API fallback and configured crypto/token IDs use CoinGecko. Do not fall back to editable registry rates; fail closed when a valid fresh API rate is unavailable.
- Admin customer views must show automatically assigned active Trading tiers and cumulative qualifying USD totals. Normal transfers are explicitly out of scope and must remain unchanged.
- Code changes for this clarification: `server/marketProviders.ts` adds `fetchCurrencyUsdRate`; `server/db.ts` calls it before the qualifying credit transaction, validates the currency configuration again inside the transaction, and records rate evidence in `fxRateSnapshots` and the qualifying ledger row. These changes are not yet validated by CI or a local test run.

## Durable automatic Trading tier qualification worker (2026-10-28)

- Added schema and migration `drizzle/0082_trading_tier_qualification_jobs.sql` for an indexed durable queue with unique source ledger IDs, processing leases, attempt counts, retry availability and dead-letter error storage; registered it in `drizzle/meta/_journal.json`.
- Qualifying administrator credits and qualifying-deposit reversals now enqueue a job atomically inside the same database transaction as the ledger entry. Non-qualifying credits and normal transfers are excluded.
- Added `runTradingTierQualificationWorkerCycle` in `server/db.ts`. It claims a bounded batch under row locks, reconciles each customer's cumulative USD eligibility, marks success, retries failures with exponential backoff, reclaims stale leases, and dead-letters after eight attempts.
- Registered the worker in `server/_core/index.ts` on a five-second unreferenced timer with an overlap guard. Idle processing uses indexed queue queries instead of scanning the full customer list.
- Added contract assertions for queue schema/migration, atomic enqueue, worker registration, bounded processing and retry behavior.
- Validation status: implementation changes are committed to the existing feature branch, but typecheck/build/tests and GitHub CI for the exact resulting head have not yet been verified. Do not claim production readiness until those checks pass and migration deployment is confirmed.

## Qualification queue migration reconciliation (2026-10-28)

- Follow-up inspection found an unjournaled duplicate migration file, `drizzle/0081_trading_tier_qualification_jobs.sql`, defining the same queue with incompatible column/status names. It was removed from the feature branch; the ordered journal's canonical queue migration remains `0082_trading_tier_qualification_jobs.sql`, matching `drizzle/schema.ts` and worker code.
- Added an idempotent `INSERT IGNORE` backfill to migration 0082 for qualifying admin credit/reversal ledger entries already persisted before the queue existed, and added a contract assertion for that backfill.
- Commits for this repair are on the existing PR branch. The exact latest commit is `a753e4d4ae9a28712a964e9e22f75a8b877c04c4`; GitHub Actions checks have started but are not yet complete.
- Still required before accepting this worker: review CI results for the exact head; run real disposable MySQL/MariaDB migration and concurrency tests for fresh schema, upgrade/backfill, duplicate enqueue/delivery, lease expiry/fencing, retries and tier/quota results. No production migration, deployment or merge has been performed.

## Disposable database verification added (2026-10-28)

- Added `scripts/trading-tier-qualification-db.integration.mjs` and `.github/workflows/trading-tier-qualification-db-integration.yml` to exercise the actual 0082 queue migration on isolated MySQL 8.4 and MariaDB 11.4 services.
- The database test seeds qualifying credit/reversal rows plus excluded rows, verifies migration backfill and unique-key duplicate prevention, exercises competing row-locked claims, confirms expired lease recovery and stale-lease fencing at database timestamp precision, and checks durable dead-letter status.
- The first CI run exposed a syntax error in the new test harness's URL validation; that harness error was corrected and the latest test commit is running again. Do not treat the earlier failed run as a product-code failure or as a passing result.
- The database suite verifies queue/migration mechanics, not the full application entitlement calculation against a complete production-shaped schema. Actual cumulative tier assignment/quota integration and exact-head full CI must still pass before this worker can be accepted.

- The MySQL 8.4 queue integration run passed on the then-current head. The first MariaDB 11.4 attempt failed before tests because the shared TCP root-password health check was incompatible with MariaDB's container defaults; the workflow now uses a MariaDB-native socket health check for that matrix leg. This is test-environment setup, not a migration assertion failure. The corrected exact-head run is pending.

## Real worker entitlement integration coverage (2026-10-28)

- Added a second disposable-MySQL integration leg that applies the complete guarded migration chain, imports the real `runTradingTierQualificationWorkerCycle`, and verifies actual automatic tier assignment at the USD 300 threshold (USD 100 + USD 300 tiers), cumulative daily quota of 10, and no USD 500 tier.
- The same test exercises concurrent worker cycles, stale processing lease recovery, transient failure retry, dead-letter transition on attempt eight, and reversal-driven revocation of the USD 300 tier while retaining the USD 100 tier and its quota.
- This stronger integration test is newly added and must pass on the exact final head before the worker is accepted. No production database has been touched.

- The first real-worker integration run showed both jobs remained pending because the test inserted `availableAt` at the current instant while the worker deliberately compares against a second-precision claim timestamp. The worker returned `claimed: 0`; this was a test-fixture scheduling race, not an entitlement or retry failure. The fixture now seeds immediate-test jobs as already due (10 seconds in the past) so it deterministically tests worker behavior rather than same-second timestamp rounding.

- Verification update: on commit `afad597ffcd4f2b459e83d0940b16a6fd10de978`, the real-worker MySQL integration passed. It confirmed two active tiers at USD 300, cumulative quota 10, no USD 500 tier, reversal-driven revocation back to quota 6, concurrent cycle idempotency, expired-lease recovery, retry, and dead-letter on attempt eight. The queue migration/backfill/concurrency matrix passed on both MySQL 8.4 and MariaDB 11.4. Exact-head typecheck/tests/build and remaining release/installer checks are still running; no merge or production migration has occurred.


## Admin-credit and FX end-to-end verification extension (2026-10-28)

- Expanded `scripts/trading-tier-qualification-worker.integration.ts` to call the real `adjustCustomerBalance` service against the disposable migrated MySQL database, rather than relying only on synthetic ledger/job rows.
- Added assertions that an explicitly qualifying USD admin credit writes the attributed ledger entry and durable queue job, while a non-qualifying admin credit is excluded from qualification and does not enqueue a job.
- Added a deterministic mocked Frankfurter response for a test-only non-USD wallet. The test deliberately sets the editable currency-registry rate to 99 and verifies that 100 native units are valued using the API-derived 0.5 USD rate (USD 50.00), and that provider/rate/source-time evidence is written to the FX snapshot store.
- The first run exposed a real schema mismatch: `fx_rate_snapshots.sourceDate` is limited to 16 characters, while the credit service attempted to store a full ISO timestamp in that column. Updated the stored summary field to fit the schema while retaining the complete source timestamp in `rawJson` and the qualifying ledger timestamp column.
- Exact-head integration, typecheck, test, build, installer and recovery checks are running on commit `e4baa336d4a0e2776537a04fe46e70badf8b4670`. The earlier failed run is not counted as passing. No production database has been touched; PR #205 remains unmerged.


- Follow-up exact-head run confirmed the source-date column-size issue was fixed, then exposed an overly strict test assertion: Frankfurter publishes a calendar date for fiat rates, while the full request/fetch timestamp is recorded separately. The integration assertion now checks the provider's calendar source date and the full `fetchedAt` timestamp independently. The exact latest head must pass the full suite before acceptance.

- Extended the actual admin-service integration coverage again to verify a partial reversal links to its original qualifying ledger entry, enqueues its own durable job, subtracts the recorded USD attribution, and rejects an over-reversal without creating a ledger entry/job. The exact latest head is `1527835cbb196b5287adc03c8027d15e1c65befd`; its full CI run is the acceptance gate.


## Latest acceptance and merge status — 2026-10-28

- PR #205 was squash-merged into `main` as `a51682da54b9e70434728de3e81fc088ce3f7148` after the exact feature-head checks were all green.
- Verified actual `adjustCustomerBalance` service integration on a disposable migrated MySQL database: qualifying USD credit, excluded non-qualifying credit, atomic durable queue creation, mocked API-derived non-USD rate and persisted FX evidence, linked partial reversal, over-reversal rejection, and worker processing.
- Verified worker behavior: cumulative tier/quota assignment, reversal-driven tier revocation, concurrent-cycle idempotency, stale-lease recovery, transient retry, and dead-letter after attempt eight.
- Verified queue migration/backfill/concurrency on disposable MySQL 8.4 and MariaDB 11.4. Type-check, unit tests, production build, browser checks, installer/migration recovery, application verification, and Trading recovery checks all passed on the exact feature head.
- Post-merge CI is running against the merge commit. Check the exact main SHA and all post-merge workflow results before deployment.
- Ordinary wallet-transfer implementation was not modified by this qualification change. The new integration test proves non-qualifying admin credits are excluded; do not describe this as a separate end-to-end transfer test.
- No production database has been touched. Do not begin the next worker until post-merge CI is green and this first worker has been verified after deployment.


## Task 2 — automatic opportunity scheduler and Trade lifecycle worker (2026-10-28)

- Started from the current main source at `e59eab4acd14f57125e8893fe9b30a14963753ce` on branch `feat/trading-opportunity-lifecycle-worker`; Task 1's merged tier qualification implementation was preserved.
- Replaced the per-cycle full `users` table scan with a bounded (default 100, maximum 250) round-robin query over currently active, automatically assigned Trading tier entitlements. The batch cursor is stored in `app_settings` and locked transactionally so concurrent server instances advance through eligible customer IDs; customers without an active auto-assigned tier are not scheduled.
- Added an entitlement lookup index in migration `0083_trading_opportunity_worker_indexes.sql` and registered it in the Drizzle schema and journal.
- Added a process-local overlap guard around the 30-second Trading cycle. Existing settlement reconciliation remains separate from actual settlement and cannot credit funds merely because a scheduled time elapsed.
- Added contract coverage for bounded entitlement selection, cursor locking/wrap-around, index registration and the cycle overlap guard.
- Validation status at this handoff update: source changes are committed to the Task 2 branch, but exact-head CI, type-check, tests, build, and installer/migration checks have not yet been verified. No production database or deployment has been touched.

## Current verified handoff — 2026-10-28 (post-merge)

- Canonical `main` is now at `d3f85084354f009c44236fb2e5c1dd0d0cf17435`; Task 2 was merged through [PR #207](https://github.com/stannmoye/Arbitrade_platform/pull/207).
- Post-merge GitHub Actions on that exact main SHA passed: application type-check/tests/build, Trading tier-qualification database integration, installer validation, Mining regression checks, and the two subsequent Blitz build runs.
- Task 2 implementation is merged: bounded round-robin scheduling (default batch 100, maximum 250), persisted/locked cursor, overlap guard, active auto-assigned entitlement filtering, indexed lookup migration `0083`, and lifecycle recovery coverage.
- Disposable-database integration and automated checks are verified; these results do not prove the worker has been exercised on the user's own production server.
- Remaining Stage 2 acceptance item: after the user's server is available, verify startup/migration `0083`, worker health and bounded scheduling, opportunity lifecycle recovery, and that settlement/reconciliation does not credit funds without confirmed outcomes. Also run a separate end-to-end ordinary wallet-transfer boundary test; the qualification integration only proves that non-qualifying credits are excluded.
- No production deployment or database migration has been performed by this work. The user has deferred Blitz/UI testing until later; keep PR #208 open and do not merge it as part of this stage.

## Progressive customer Trading package journey (2026-10-28)

- Customer Trading UI now presents a progressive, read-only journey: customers without an active tier see the first qualifying milestone; customers with an active tier see their highest active package and only the next enabled qualifying package.
- The customer eligibility API derives qualifying USD-minor attribution from the explicit admin manual credit/reversal ledger types and returns only the current tier, one next tier, the remaining qualifying amount, durations, and quota values. It does not expose the full package catalogue or any activation route.
- Updated the canonical Trading specification, root agent rules, administrator menu guide, and contract tests to reflect this limited progressive display while retaining the ban on customer browsing, selection, subscription, purchase, and activation.
- Validation remains pending for the exact feature branch head. No production deployment or database migration was performed for this UI change.

## Customer Trading package journey UI refinement (2026-10-28)

**Active PR:** [#208](https://github.com/stannmoye/Arbitrade_platform/pull/208) on `feature/customer-progressive-trading-tier-ui`. The branch is synchronized with current `main`; exact-head validation is pending.

- Removed any local-currency assumption from the customer milestone display. The qualification threshold is labelled as a USD equivalent because the authoritative ledger attribution is stored in USD minor units; explanatory copy makes clear that supported ledger-wallet credits are valued at the time an authorized administrator records a qualifying credit.
- Refined the read-only customer journey with theme-aware responsive cards, compact typography, current-package and next-milestone metrics, an accessible progress indicator, refresh/loading/error states, and reduced-motion support. The page does not expose a full catalogue or activation controls.
- Exact-head validation is pending for the UI refinement. No production deployment or database migration was performed.



## 2026-10-28 — Animated package progress design

- Added a dark navy mission-control/orbital visualization to the customer package-progress component, based on the supplied screenshot and 3.8-second reference video.
- The orbit animation is decorative only: it displays the already-returned current tier, next milestone, progress percentage, and daily allowance; it does not trigger or imply trade execution or financial changes.
- Added responsive styling and a `prefers-reduced-motion` fallback.
- Changed files: `client/src/components/CustomerTradingEligibility.tsx`, `client/src/components/CustomerTradingEligibility.css`.
- Validation status: source edits committed to `design/animated-package-progress`; build, type-check, and test suite have not yet been run in this environment. Customer/admin package-detail loading errors are intentionally deferred until the visual design increment is reviewed, per the user's instruction.
- Next step: run exact-branch CI and inspect the rendered UI at mobile and desktop widths before merging.


## 2026-10-29 — Trading worker health monitoring increment

- Started from canonical `main` commit `ca3330891296c274caa1b04c58554a9bebe635a0`; the existing qualification and bounded opportunity worker code is preserved.
- Added forward migration `0084_worker_health_registry.sql` and a matching Drizzle table to persist per-worker/per-server-instance status, heartbeat, last success/failure, run duration, consecutive failures, and sanitized error text.
- Added monitoring around Trading tier qualification, opportunity/lifecycle processing, settlement reconciliation, local scheduled jobs, notification campaigns, Mining reward/feed cycles, popup retention, and market-data refresh. Health writes are best-effort and do not prevent the underlying worker from processing durable work.
- Added an admin-only read endpoint and **Trade Settings → Worker Health & Recovery** dashboard with auto-refresh, stale/degraded/not-started classification, and durable qualification queue counts. Unavailable monitoring is explicit; it is never represented as zero or healthy.
- Added status-classifier tests and `docs/trading-worker-health-and-recovery.md`.
- Safety boundary: dead-lettered jobs are visible and the audited recovery action is described below. A retry only requeues a validated job for normal idempotent worker processing; it does not directly change a wallet or settle a trade.
- Exact feature-head CI passed before merge, including application verification, Trading qualification database integration, Mining regression, installer validation, production build/tests and browser/portal validation. Migration `0084` has not been applied to a production database.


## 2026-10-29 — Task 3 follow-up: audited operator recovery

- The Worker Health dashboard now lists the latest 25 dead-lettered qualification jobs and accepts a required recovery reason (8–500 characters).
- Admin-only server mutation locks the job and source ledger, validates the source type and USD attribution (including a linked qualifying-deposit reversal), only permits a job still marked `dead`, resets the queue item and adds `trading_tier_qualification_job.requeued` to `v5_audit_events` in the same transaction. It never edits a wallet balance or directly changes tier/settlement state.
- The integration test exercises both rejected invalid-attribution retry and a successful audited retry through the normal qualification worker, including duplicate-entitlement prevention.
- Added `0084_worker_health_registry.sql` to the runtime worker-schema bridge, portal migration list, and installer migration-recovery catalogue. Updated existing migration-order tests to account for 0084 as the newest journal entry.
- Worker status query limits historical reads to 500 recent rows; per-cycle monitoring skips overlapping cycles; error output is sanitized before storing/displaying.
- Exact feature-head CI passed for commit `002dcf0eed39c27ab7adc4d33fcd5b4686661bdd`; PR #217 was squash-merged as `b07ef3b8bf87b723e975a92127fcbd1b83f2b750`. The main branch now points to that merge commit.
- Post-merge checks on the exact `main` commit were queued at the time of this update. Check all resulting workflow runs before calling the increment fully accepted. No production migration, deployment, or live-host verification is claimed.


## 2026-10-29 — Installer worker-runtime verification increment

- Created branch `feat/installer-worker-runtime-verification` from the current canonical `main`.
- Added `pnpm installer:verify-workers`, a read-only diagnostic for the production startup wrapper, guarded migration and worker-schema preflight phases, persistent application process, server-managed Trading worker registration, durable qualification queue table, and worker health registry column/index contracts.
- Added unit tests for valid startup wiring, missing worker registrations, missing health columns, malformed index definitions, and alignment of the installer checks with the supported startup wrapper. Registered syntax checks in the installer validation workflow and documented the post-install command.
- Fixed an existing installer diagnostic mismatch: both `installer:verify` and `installer:diagnose` previously expected a direct `NODE_ENV=production node dist/index.js` start command, but the canonical package uses `scripts/start-with-diagnostics.mjs` to run guarded migrations and worker-schema preflight first. Both checks now validate the actual supported wrapper.
- Validation status: implementation committed to the feature branch; exact-head CI and test results are pending. No production database, migration, or server was accessed or changed.


## 2026-10-29 — Installer worker-runtime CI follow-up

- Exact-head CI identified a failure in the disposable Trading worker integration: the recovery test invoked the worker in the same second that the audited requeue wrote its current-time `availableAt`, while the database comparison uses second precision. The job remained pending because the test cycle ran before the row was due; this did not establish a worker processing defect.
- Updated the integration fixture to move only the disposable test job's `availableAt` into the past after validating the audited requeue, making the test deterministic while preserving the production requeue behavior.
- Follow-up validation is pending on the new exact head. Do not merge until the Trading integration and all other required checks pass. No production database, migration, or live server was accessed or changed.


## 2026-10-29 — Graceful server-worker shutdown increment

- Started `feat/graceful-server-worker-shutdown` from canonical `main` at merge commit `2676234b0394fe97feba46e9e2eb7c66b4dc992c`.
- Added a shared worker-runtime registry for recurring timers, wired the Trading and supporting background-worker timers into it, and registered SIGTERM/SIGINT shutdown handling.
- Shutdown stops future timer ticks, closes idle HTTP connections, drains active requests and monitored worker cycles, then closes the shared MySQL pool. A bounded deadline force-closes remaining HTTP connections if drain does not complete.
- Added a database-pool close function, a monitored-worker drain function, unit tests for timer cancellation and cycle draining, and `docs/server-worker-shutdown.md`.
- Validation is pending on the exact feature head. No production server or database was accessed; no financial records or migrations were changed.


## 2026-10-29 — Database-backed settlement reconciliation verification

- Started branch `test/settlement-reconciliation-db-integration` from the verified `main` commit `6befd5ed7036818abf05144a2b522f49e3715645`.
- Adding an isolated integration test that applies the guarded migration chain and calls the actual `reconcileAllDueTradesAwaitingConfirmation` worker against disposable MySQL 8.4 and MariaDB 11.4 databases.
- The first disposable MariaDB run exposed schema drift: after the guarded main migration chain, `trade_positions.rewardReservedMinor` was missing even though the application schema and trade-allocation code require it. The current post-migration verifier only checked `creditAt` and `lifecycleStage`, so this mismatch passed migration startup verification.
- Root-cause inspection found legacy settlement migrations `0051_advanced_auto_trading.sql` and `0053_manual_settlement_lifecycle.sql` are listed in the portal migration runner but absent from the canonical main journal. The main runtime startup does not guarantee that separate portal migration chain runs before workers use those fields.
- Adding forward migration `0085_trade_settlement_schema_reconciliation.sql` to restore the settlement columns/tables/indexes idempotently, and extending the guarded main migration's post-run schema verification to repair and verify the actual columns and lifecycle/reservation tables. Historical migration files/journal history are preserved.
- The repair migration applied successfully in the follow-up MariaDB job, but the integration fixture then hit the existing unique `(userId, offerId)` trade constraint because all test rows reused offer ID 1. The fixture now gives each disposable trade a unique offer ID. Two journal-order contract tests also required their expected latest migration sequence to be updated for 0085.
- The real-database integration still needs to pass on both MySQL 8.4 and MariaDB 11.4 after these fixture/contract fixes. This is verification-only; no production database or server was accessed, and no financial outcomes are rewritten.


## 2026-10-29 — Trading pop-up financial rules clarified

- Updated `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md`, `docs/TRADING_SYSTEM_SPECIFICATION.md`, `AGENTS.md`, `.github/copilot-instructions.md`, the admin menu guide, worker health/recovery guide, and worker shutdown guide.
- Admins configure inclusive per-pop-up percentage bounds (including decimals such as 2.7%), required capital/ranges, and trade-duration bounds. Server selects and persists each opportunity's rate/capital/duration once; retries and restarts must reuse the same snapshot.
- Funding may span eligible customer wallets. Cross-currency funding requires a fresh timestamped FX quote, auditable native-currency ledger entries, stable wallet locking, and an all-or-none transaction. Invalid/stale FX or insufficient funds fails closed.
- Use integer basis points, minor-unit money math, explicit rounding, exact fee/payout reconciliation, and persisted UTC deadlines. Startup recovery must find overdue work without resetting timers or duplicating debits, payouts, or company rotation.
- A configured percentage formula is a platform-defined contractual payout unless supported by actual execution/result evidence; UI and terms must not misrepresent it as market-earned profit.
- Documentation changes are on `docs/admin-editable-trading-popups` and await exact-head CI/review before merge. No production deployment or database operation was performed.


## 2026-10-29 — Part 1 final acceptance snapshot (PR #234)

- **Branch:** `part1/package-configuration-admin-controls-20261029`
- **Exact code-tested SHA:** `41092475d50a9e4a2337233d143c9d380cf15c91`
- **Current main SHA at acceptance review:** `07b17ca401d5f0582bf09fba8b6625f4a8af42e6`
- **PR #234:** open, draft, unmerged. No deployment or production database access was performed.
- **Exact-head CI:** all seven required workflows completed successfully on `41092475d50a9e4a2337233d143c9d380cf15c91`: production source build/test; installer validation; Trading tier qualification DB integration; Trading settlement reconciliation DB integration; application verification; Trading recovery verification; Mining regression checks.
- **Observed test totals:** production test suite reports 96 files passed, 3 skipped; 783 tests passed, 16 skipped. Installer regression suite reports 30 files and 169 tests passed. Tier qualification integration reports successful concurrency, cumulative quotas, retry/reversal and stale-lease checks on MySQL 8.4 and MariaDB 11.4; settlement integration passed on both database engines. The installer run also reports TypeScript validation, application tests, production bundle budget/smoke test, migration regression and installer recovery/fresh-install jobs passing.
- **Package/policy persistence evidence:** the opt-in disposable-DB integration test exercises policy read, save, reload, policy-version increment, persisted actor/reason/previous-next policy audit evidence, rejection of customer writes, and unchanged policy state after rejected writes. The exact-head installer validation passed. This is evidence for the policy-write path; it is not a claim that every field of every package create/edit flow has a separate database-backed test.
- **Admin controls in this branch:** new tier threshold, duration and daily quota are not silently prefilled; required values remain unset until entered. Server-side create/update schemas validate required values and effective dates. Tier changes require a 5–500 character audit reason. Policy writes validate the batch, reject duplicate tier names and unknown tiers, increment per-tier versions, and persist audit records transactionally. The policy editor exposes allocation, delivery, display/audio, retry, trade concurrency, settlement and reward controls; the separate policy-field component keeps advanced controls out of the initial bundle.
- **Customer/eligibility boundary:** admin customer listing surfaces persisted automatic assignment identifiers/status/terms/balance snapshot/expiry. Eligibility and worker/FX behavior remain owned by the corresponding parts; this PR did not add a duplicate worker or FX implementation.
- **Migration review:** Part 1 itself adds no migration and leaves the main journal ending at `0085_trade_settlement_schema_reconciliation`. PR #230 and PR #233 independently introduce different migration files numbered `0086`, so they cannot both be integrated unchanged. Preserve PR #230's `0086_trading_popup_policy_snapshots.sql`; when integrating PR #233 after it, renumber PR #233's policy-ranges migration to `0087`, spotlight rotation to `0088`, and popup trade snapshots to `0089`, then reconcile all journal entries, migration registration/recovery diagnostics and references. Do not rewrite applied migration history. This must be performed and validated by Part 6 on the integration branch.
- **Cross-PR review:** #230 (popup snapshots and wallet funding/FX), #231 (fail-closed runtime policy and enablement), #232 (explicit tier defaults, largely superseded by #234), and #233 (policy editor, rotation and snapshot dependencies) remain open at review time. Shared files overlap. Do not cherry-pick blindly or merge from this branch.
- **Disposition:** Part 1 implementation and its exact-head checks are ready for Part 6 integration review. Overall cross-part acceptance is not complete until Part 6 reconciles shared files and the duplicate migration number, runs integrated installer/settlement checks on the final integration SHA, and confirms the final customer/admin contracts.


## 2026-10-29 — Part 1 database-backed package acceptance rerun

- **Code-tested SHA:** `584f55390a6f5136ece1f4db27d0feb14fcfd0ef`
- **Result:** all seven required workflows passed on this exact SHA: production source build/test, installer validation, Trading tier qualification DB integration, Trading settlement reconciliation DB integration, application verification, Trading recovery verification, and Mining regression checks.
- **Production source suite:** 96 test files passed, 3 skipped; 783 tests passed, 17 skipped. The additional skipped test is not a failure; the opt-in disposable database suite ran separately in the fresh-MariaDB installer job.
- **Database-backed package test:** 6 tests passed in `server/appearance-settings-persistence.integration.test.ts`, including create/edit/reload of tier terms, default-disabled creation, threshold/duration/quota/cap persistence, effective dates and terms-version increment, create/update audit records, invalid values/date ordering, and non-admin write rejection. The test uses the CI disposable fresh-install MariaDB database and cleans up its package/policy/audit rows.
- **Database-backed policy test:** the same opt-in suite passed duplicate tier rejection, unknown-tier rejection with transaction rollback, policy save/reload, policy version increment, audit actor/reason/before-after values, customer write rejection, and unchanged state after rejected writes.
- **Other exact-head checks:** installer regression test suite, TypeScript validation, production build/bundle budgets/smoke test, fresh MariaDB install, MySQL 8.4 compatibility/recovery, tier qualification on MySQL 8.4 and MariaDB 11.4, settlement reconciliation on both engines, browser recovery, application verification, Trading recovery, and Mining regression all passed.
- **Current branch head after this evidence update:** documentation commits follow the code-tested SHA; treat their exact-head workflows as the final gate and do not use this SHA's results as proof for a later commit.
- **Remaining integration boundary:** Part 1 is ready for Part 6 review, not standalone merge. PRs #230–#233 remain open with shared-file overlaps. Migration collision remains: #230 and #233 both propose migration number 0086; preserve #230's 0086 and renumber #233's policy ranges/rotation/trade snapshot migrations to 0087/0088/0089, update journal/installer/recovery references, and validate the integrated branch. No merge or deployment was performed.


## Part 1 final-acceptance checkpoint — 2026-10-29 16:40 UTC

- **Branch:** `part1/package-configuration-admin-controls-20261029`.
- **Code head before this documentation checkpoint:** `0ba2a39b97b5901d7888492fef2eae702c029cb0`. Exact-head workflows were queued/pending at the time of inspection; earlier green workflows for `584f55390a6f5136ece1f4db27d0feb14fcfd0ef` are historical evidence only and do not verify subsequent code edits.
- **Current implementation changes:** package policy updates now read/lock existing rows inside a transaction, merge incoming values over persisted values before validating, preserve omitted optional policy fields, reject duplicate tier names, and record previous/next values with actor, reason and incremented policy version in the same transaction. Missing policy rows are created explicitly disabled; policy enabled, delivery enabled and automatic trading enabled are independently represented in the admin editor and router schema.
- **Package editor:** required qualifying threshold, duration and daily quota remain blank for new tiers; enabled defaults false; create/edit requires an audit reason. Existing tier assignment identity/status/terms/balance/expiry is shown from persisted assignment records.
- **Tests:** focused source-contract tests were extended for audit reasons, transactional/versioned policy updates, partial-field preservation and fail-closed explicit enablement. These source assertions are not database-backed proof. The previous seven-workflow pass at `584f55390a6f5136ece1f4db27d0feb14fcfd0ef` included the disposable-database package/policy test set according to the then-current CI report, but the subsequent code changes require exact-head reruns. No exact database test counts are claimed for the new head until its logs finish.
- **Exact-head CI:** the seven required workflows (production source build/test, Trading tier qualification DB integration, Trading settlement reconciliation DB integration, installer validation, application verification, Trading recovery verification and Mining regression) were queued/pending on the inspected code head. The documentation update itself will also produce a new head and must be checked.
- **Cross-PR status:** PRs #230, #231, #232 and #233 are all still open/unmerged. #230 owns wallet funding and popup snapshots (including migration 0086); #231 owns fail-closed runtime policy reads; #232 owns explicit tier defaults; #233 owns delivery policy editor, rotation and opportunity snapshots with migrations 0086–0088. Migration 0086 is a known filename/number collision between #230's `trading_popup_policy_snapshots` and #233's `trading_popup_policy_ranges`; do not merge both as-is or rewrite an applied migration. Part 6 must reconcile journal entries, installer registration and startup recovery contracts, renumbering with a forward-compatible migration where required.
- **Disposition:** Part 1 is not complete and PR #234 remains draft/unmerged. No production database or deployment was touched. Outstanding acceptance gates: exact-head CI after these changes; actual DB-backed partial-update preservation/rollback/duplicate/unknown-tier/audit authorization tests; explicit proof that unauthorized writes leave state unchanged; cross-PR migration and shared-file integration with #230–#233. Do not claim 100% or merge until these gates are satisfied.

## Part 1 follow-up verification — 2026-10-29 16:42 UTC

- **Source head before this checkpoint:** `b2d6db69b7c69eb6c01b08e20fe41b70ad5e7a7d`; latest `main` observed: `07b17ca401d5f0582bf09fba8b6625f4a8af42e6`.
- Added disposable-database assertions that policy partial updates preserve omitted enablement, display, retry and settlement fields; audit metadata contains the prior and next field values and version. Added an invalid effective-date update check asserting the persisted tier row remains unchanged.
- Exact-head CI had exposed a stale source-contract assertion after the missing-policy initializer was changed to set `enabled=false`, `automaticDelivery=false` and `automaticTradingEnabled=false`. The assertion was updated in commit `0861f791cd329c583c471c3c81e4dedcce62ca8d`; that SHA's checks are not a substitute for the latest run.
- Workflows for `b2d6db69b7c69eb6c01b08e20fe41b70ad5e7a7d` were in progress at inspection. No latest-head pass/fail counts are claimed yet.
- The opt-in disposable MariaDB integration suite `server/appearance-settings-persistence.integration.test.ts` already exercises Trading tier create/edit/reload, role rejection, persisted audit, policy update/version/reload, duplicate/unknown-tier rollback and unchanged state after rejected writes. The new assertions extend partial-update preservation, audit old/next values, and invalid update-date rollback. These tests must pass in the installer DB-integration workflow on the final SHA.
- **Disposition unchanged:** Part 1 is not complete. Exact final-head CI, the opt-in DB integration suite, and Part 6 cross-PR/migration reconciliation remain gates. No production data or deployment was touched.


## Part 1 final-acceptance checkpoint — 2026-10-29 16:45 UTC

- **Current PR #234 head inspected:** `0c3933f7e02afde43e647d07888cf146f9d4b234`. **Current `main` inspected:** `07b17ca401d5f0582bf09fba8b6625f4a8af42e6`. PR #234 remains open, draft and unmerged.
- **Exact-head workflow status at inspection:** Trading tier qualification database integration **passed** ([run 40914228669](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40914228669)); Trading settlement reconciliation database integration **passed** ([run 40914228499](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40914228499)). Production source build/test ([40914228635](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40914228635)), recovery verification ([40914228708](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40914228708)), application verification ([40914228523](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40914228523)) and Mining regression ([40914228471](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40914228471)) were still running; installer validation ([40914228423](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40914228423)) was pending. These results apply only to the exact SHA above; later documentation commits require a new exact-head check.
- The successful Trading qualification worker integration log confirms concurrent tier assignment, bounded scheduler cursor rotation, cumulative quotas, audited safe retry, invalid-source retry rejection, reversal revocation, stale-lease recovery, automatic retries and dead-letter persistence. The settlement DB workflow passed on this SHA. No package/policy DB test count is claimed until the installer workflow log confirms the opt-in disposable-DB suite completed.
- Source review confirms package create/edit persists threshold, duration, daily quota, popup cap, active-investment cap, enabled state and effective dates; the UI leaves required threshold/duration/quota blank for new tiers and starts them disabled. The opt-in `server/appearance-settings-persistence.integration.test.ts` contains database-backed package create/edit/reload/audit/role-rejection checks and policy partial-update/version/audit/duplicate/unknown-tier rollback checks. Those are real DB tests, but must be confirmed in the final installer run, not inferred from source presence.
- Policy writes validate a 5–500 character reason, reject duplicate and unknown tier names, lock and merge existing policy fields, increment versions, and write actor/reason/previous/next audit data in the same transaction. Package create/update has server-side field/date validation and audit records. These findings are source review plus existing test coverage, not a declaration that every acceptance item is complete.
- **Migration and cross-PR blocker:** PRs #230–#233 remain separate integration dependencies. PR #230 and #233 both use migration number 0086 for different schema changes; #233 also adds 0087/0088. Their shared schema, journal, installer registration, startup recovery, router, DB and UI changes must be reconciled by Part 6. Do not rewrite an applied migration, merge blindly, or deploy.
- **Disposition:** Part 1 remains incomplete pending all seven exact-head workflows, verified package/policy DB test output on the final candidate, and Part 6 integration/migration review. No production database or deployment was touched.


## Part 1 verified database acceptance results — 2026-10-29 16:46 UTC

- On exact source/documentation head `db2494a95b3b84a870f5ab650669de2dc16d2e88`, the opt-in disposable MariaDB integration suite ran with `RUN_APPEARANCE_SETTINGS_DB_INTEGRATION=1`: `server/appearance-settings-persistence.integration.test.ts` **1 file passed, 6 tests passed**. It includes policy partial-update preservation, versioned audit metadata, customer role rejection, duplicate/unknown-tier rejection without partial writes, package create/edit/reload and effective-date rejection with unchanged persisted values. No production database was used.
- On that same SHA, installer validation passed, including TypeScript validation, syntax, installer/migration regression tests, production build/bundle budget/server smoke, fresh-install MariaDB, MySQL 8 compatibility/recovery, application unit tests and deployment packaging (final deployment-packages job was still running at the instant the run was first inspected; verify the workflow final conclusion). Application verification passed; Trading tier qualification DB integration passed; Trading settlement reconciliation DB integration passed; Trading recovery verification passed; Mining regression passed.
- Production source workflow's Type-check/test/build job passed, but its additional customer-portal real-browser recovery check was still running when inspected. Do not describe the full seven-workflow suite as green until that browser check and deployment packaging finish.
- These results verify the head above only. The next documentation commit changes the branch head and therefore requires fresh exact-head CI; record that resulting SHA and all seven conclusions before final acceptance.
- Migration conflict remains unresolved by design: PR #230 migration 0086 and PR #233 migration 0086 have different SQL purposes. Part 6 must reconcile the two migrations and journal/installer registration forward-only; do not merge either blindly or rewrite already-applied migration history.
