## 2026-10-29 — Part 3 CI regression follow-up

- Part identity: **PART 3 — AUTOMATIC TRADING WORKER & CUSTOMER ISOLATION**.
- Follow-up commit `606f6d7460078b127c31f9da8c0d7acd64da8c79` on `feat/trading-worker-isolation-recovery-part3` updates the worker-cycle contract assertion to match the combined in-flight/backoff guard and sanitizes the initial startup-cycle catch log.
- Exact-head GitHub Actions for prior head `e2ce4db72490857ba178e53473aee60dc2e9b4b6` showed TypeScript check passed, but test failed in `server/trading-opportunity-worker.contract.test.ts`: the old assertion expected `if (tradeCycleRunning) return;`, while the implementation correctly checks both overlap and retry deferral. The assertion was updated; CI for the new head has not yet reported a run.
- Prior CI run had 776 passing tests, 15 skipped and one failing assertion; production build was skipped after the test failure. This is not a green validation result.
- Remaining worker gaps are unchanged: process-local backoff is not a distributed lease; no acceptance evidence yet for durable multi-instance claiming, stale-lease recovery, crash/restart, quota concurrency, financial idempotency, or strict customer isolation.
- Do not merge or deploy until exact-head CI and database-backed worker tests pass.

---

## 2026-10-29 — Part 3 worker failure backoff and ownership alignment

- Part identity: **PART 3 — AUTOMATIC TRADING WORKER & CUSTOMER ISOLATION**.
- Baseline `main` SHA: `7356c5870807592c8e890a3937cf3fb0f2a403fc`. Work is isolated on `feat/trading-worker-isolation-recovery-part3`; no merge or deployment.
- Updated the automatic Trading opportunity cycle to defer repeated failed cycles with capped exponential backoff (30s base, five-minute cap), reset the backoff after a successful cycle, and sanitize structured error diagnostics.
- Added a source-contract regression test for backoff and recovery-to-normal-cadence behavior.
- Added `docs/trading/IMPLEMENTATION_COORDINATION.md` with the six-part ownership map, shared contracts, active PR overlap list and worker integration boundaries.
- Validation limitation: GitHub clone/network access was unavailable in this session, so `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, `pnpm build`, and disposable MySQL/MariaDB concurrency tests have not been run. The backoff guard is process-local load protection, not a distributed lease.
- Still required before acceptance: exact-head CI, DB-backed multi-worker/expired-lease/restart/idempotency/customer-isolation tests, and a broader review of the existing lifecycle/settlement/reconciliation paths. No claims are made that these gaps are closed.

---

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


## 2026-10-29 — Part 3 worker log privacy hardening

- Updated the automatic Trading per-customer failure log to emit only the error class name (or `UnknownError`), not a customer ID or raw exception message.
- Added a worker contract assertion that protects this logging boundary.
- Commit: `f6910d86ecf473ea928ea14306b6c075632aa26c` (implementation); `1801d1bd45817ad6e2c4357a1a70607b9a89f7f2` (regression test).
- CI has been triggered for the new head. Earlier exact-head workflow results were green for the recovery workflow, app validation, tier-qualification DB integration, and settlement reconciliation on MySQL 8.4/MariaDB 11.4. The new commit's complete CI set is queued/running and must be checked again before acceptance.
- This change is intentionally narrow: it does not claim to add distributed opportunity leases, durable crash recovery, or multi-instance fencing. Those remain acceptance gaps for Part 3.


## 2026-10-29 — Part 3 opportunity execution lease fencing increment

- Added nullable `executionLeaseToken` to the canonical Drizzle schema and new forward migration `0086_trading_opportunity_execution_leases.sql`; registered the migration in the main journal, portal migration runner, migration recovery inventory, and runtime schema bridge.
- Each automatic opportunity claim now creates a UUID lease token while holding the popup-event row lock. The token is passed into `createTrade`; the transaction rejects stale worker tokens before wallet allocation. Completion and failure updates are scoped to the current token, and a fenced stale worker does not mark the opportunity missed.
- Added source-contract regression assertions for token generation, schema/migration registration, trade-creation fencing, and stale-worker handling.
- Latest recorded commit at this note: `7068f09eef0c27f060f51b77b8b55607d08ff7ab`. CI for the new head must finish and be checked. No disposable MySQL/MariaDB integration test has yet proven lease expiry/reclaim, simultaneous workers, or crash/restart behavior on the actual opportunity lifecycle.
- Remaining acceptance gaps: no separate customer-level distributed lease; database-backed race/restart/quota/financial-idempotency acceptance tests still required. Keep PR #235 draft and do not merge/deploy until exact-head checks and integration evidence pass.


## 2026-10-29 — Part 3 worker integration tests and installer assertion correction

- Fixed the installer regression assertion: `opportunity_popup_events` is no longer incorrectly required to appear in legacy migration `0062_worker_runtime_tables.sql`; its lease column is validated separately through migration `0086` and the worker schema contract.
- Added `scripts/trading-opportunity-worker.integration.ts`, a disposable-database integration test that runs the actual database-backed claim function with competing concurrent claimants, verifies only one claim wins, forces an expired lease and verifies a new fencing token is issued, and confirms a stale token is rejected before wallet/ledger mutations.
- The integration test also runs concurrent `createTrade` retries against a previously committed delivery-event trade and asserts both responses return the same trade ID with no extra trade row, ledger entry, or wallet balance change.
- Added `.github/workflows/trading-opportunity-worker-integration.yml` to run the lifecycle test against MySQL 8.4 and MariaDB 11.4 after applying the guarded migration chain.
- Fixed execution completion to require the active lease token, and exported the claim function for the integration harness.
- Latest recorded head for this increment: `cb20c0bbd41b67b109ae0499bd222202342f269a`. Installer validation and all exact-head workflows must pass before accepting this Part. The new database integration run is queued and has not yet supplied results.
- Coverage limitation: the lease-recovery test simulates a worker that disappears by allowing its persisted retry/lease deadline to expire; it does not restart a real server process. Concurrent quota enforcement and a full fresh-allocation race with wallet reservation still need explicit database acceptance evidence.
- PR #235 remains draft, unmerged, and undeployed.


## 2026-10-29 — Part 3 migration compatibility follow-up

- The first disposable-database run uncovered a second legacy schema gap: `tradeId` and `policyVersion` from the historical delivery-diagnostics migration were also absent from the guarded migration path. The forward migration and startup schema reconciliation now repair and verify these fields as well.
- Expanded the worker schema contract to validate delivery diagnostics, event-to-trade linkage, policy version, and execution lease token.
- The earlier installer regression suite passed after the 0062 assertion correction. The new opportunity integration run exposed the missing `tradeId` column, so the run is correctly treated as failed; the expanded migration fix is awaiting a fresh exact-head run.
- Current source head at this note: `39d7ffbfffedf5c45858420add9da63b627c0868`. Keep PR #235 draft and do not merge/deploy pending a successful fresh MySQL/MariaDB opportunity integration run and exact-head CI.


## 2026-10-29 — Part 3 final worker acceptance

- Added forward migration `0087_trading_package_policy_schema_reconciliation.sql` after a real fresh-database allocation test exposed historical package-policy fields missing from the guarded main migration chain. The repair is registered in the Drizzle journal, portal runner, runtime bridge, startup drift reconciliation, and installer recovery diagnostics.
- Expanded disposable-database coverage to kill the actual child Node worker after it claims an opportunity, reclaim the expired lease, and prove both prior lease tokens are fenced.
- Added a cross-event contention test with a one-opportunity daily quota. Competing allocations must leave exactly one trade and one wallet/ledger reservation; duplicate requests replay safely and the losing opportunity is rejected for quota exhaustion.
- Exact-head source revision `d3ed24aa75afa7d4242c252e04aea2bc9d8831ca` passed the worker lifecycle integration on MySQL 8.4 and MariaDB 11.4, tier qualification integration, settlement integration, installer regression tests, fresh MariaDB install, MySQL installer compatibility/recovery, TypeScript validation, application tests, production build/smoke, browser recovery checks, application verification, trading recovery verification, and mining regression checks.
- PR #235 remains open/draft/unmerged/undeployed. No production database was accessed or migrated.
