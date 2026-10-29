## 2026-10-29 — PART 4 handoff status (latest verified source review)

- Repository `stannmoye/Arbitrade_platform`; current `main`: `07b17ca401d5f0582bf09fba8b6625f4a8af42e6`.
- Active continuation PR #243 was fetched at `a3bcbf234d5cef903fed324b6fa04d7ac9a12ac7`, based on that `main` SHA; it was open and mergeable, with four known failing DB/installer workflows. The working copy is on `integration/trading-parts-1-6-finalization`.
- Repairs in this increment: forward-only migration 0094 makes absent duration bounds nullable; blank rotation filters persist as `NULL`; settlement/worker fixtures set explicit test-only capital limits; rollback assertions require the exact nested SQLSTATE 45000 failure. Migrations are registered in Drizzle, portal, installer recovery and runtime bridge.
- Local validation: `pnpm check` passed; `pnpm test` passed (105 files, 829 tests; 3 files/17 DB-only tests skipped); installer tests passed (30 files, 171 tests); `pnpm build` passed. Focused migration/schema tests passed (19/19). DB-backed acceptance awaits exact-head MySQL 8.4/MariaDB 11.4 CI after push; no production database was accessed.
- PR #238 remains open/draft at head `1932435c93c04b46675d86ee44eb837c1a1f112f`, based on PR #233 branch `feat/trading-package-popup-policy` at `0c7302a6fd418af95d42e426b1e715976e7e7b5e`. Do not merge #238 independently to `main`.
- Validation-only draft PR #242 targets `main` to trigger current workflows against the Part 4 head. Do not merge #242.
- Added forward-only migration 0089 for `trade_positions.walletFundingPlanJson` and registered it in the journal, portal runner, installer recovery and worker runtime-schema path. Corrected migration-order tests, the popup INSERT bound-value count and duplicate-delivery current read. Added a disposable MySQL 8.4/MariaDB 11.4 integration workflow that follows installer migration order and tests durable rotation.
- Exact-head rotation database run [40929821492](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40929821492) passed on both DBs; final fixture uses at least 3 companies and verifies one duplicate cursor advance, four unique concurrent assignments, snapshots, fresh-process restart, rollback and cycle 2 only after exhaustion.
- Also passed exact-head application [40929821517](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40929821517), Trading recovery [40929821444](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40929821444), settlement DB integration [40929821435](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40929821435), tier/worker DB integration [40929821422](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40929821422), installer [40929821482](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40929821482), and Mining regression [40929821644](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40929821644). The type-check/test/build job in run [40929821416](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40929821416) passed; its separate generic customer portal browser-recovery job was still in progress, so the full workflow is not claimed completed.
- Local `pnpm check`, `pnpm test`, and `pnpm build` were unavailable because GitHub DNS prevented local checkout. No production database/server was accessed.
- Remaining blockers: PR #230 has a merge conflict; PR #233/#235 have conflicting 0086/0087 migration histories requiring a unified forward-only sequence. No source PR has been merged to main, so Part 4 is not integration-complete or final acceptance-complete.
- PR #236 stays open/draft. Dedicated authenticated UI and persisted-settings acceptance on a suitable non-production server is explicitly deferred and remains unverified.

---


## 2026-10-29 — Part 4 execution-state fail-closed correction

- Restricted popup execution eligibility to the schema's explicit retryable states `READY` and `RETRYING`; terminal, in-flight, unknown, and invalid `PENDING` states are not claimable through this presentation-policy helper.
- Added regression assertions for retryable and unknown execution statuses. This follows the actual `opportunity_popup_events.executionStatus` enum in `drizzle/schema.ts`.
- Exact-head GitHub Actions still reports zero PR workflow runs for the previously inspected commit; test execution remains pending.

---
## 2026-10-29 — Part 4 follow-up validation correction

- Expanded automatic-execution eligibility to include the `OPENED` event status. Opening a popup is a presentation event and must not accidentally exclude an otherwise eligible server-owned automatic execution.
- Kept `RUNNING` execution attempts excluded from new claims to avoid re-claiming in-flight work.
- Added regression assertions for `NOTICED`, `OPENED`, and `DISMISSED` events plus failed delivery, terminal execution, in-flight execution and withdrawn events.
- Validation remains source-level only: GitHub Actions reports zero check runs for the latest inspected commit. Local package scripts and database concurrency tests remain outstanding.

---

## 2026-10-29 — PART 4 — COMPANY ROTATION & OPPORTUNITY PRESENTATION

- Layered this Part 4 increment on the `feat/trading-package-popup-policy` review branch to avoid silently editing the Part 1 branch or merging into `main`.
- Kept company assignment inside `ensurePopupDeliveries`: the per-customer/package rotation cursor is locked and advanced in the same transaction as the idempotent opportunity row and its company snapshot.
- Added rotation cycle, sequence, filtered-pool fingerprint, repeat policy, and snapshot version to the saved company metadata so opportunity records preserve their exact assignment context across restart and review.
- Converted the customer company spotlight endpoint to a read-only preview query and removed the customer's automatically fetched/next-reference spotlight. Customer company identity now comes from persisted opportunity/trade snapshots; the catalogue remains searchable as informational reference data.
- Fixed a lifecycle boundary: dismissing a customer popup no longer suppresses automatic worker execution. Execution eligibility is computed independently of the presentation status, and regression tests cover dismissed, failed-delivery, and terminal-execution cases.
- Updated the canonical Trading specification, companion admin manual, and `docs/trading/IMPLEMENTATION_COORDINATION.md` with the dismissal, snapshot, rotation, ownership and integration contracts.
- Added tests for restart restoration, rotation sequence/cycle metadata, read-only preview, transactional snapshot expectations, and presentation/execution isolation.
- Validation: source-contract review completed; local `pnpm check`, `pnpm test`, and `pnpm build` could not be run in this environment because GitHub network access is unavailable to the local shell. Exact-head GitHub CI remains required before acceptance. No merge to `main`, production migration, or deployment was performed.

---

## 2026-10-29 — Durable package-scoped company spotlight rotation

- Added administrator-controlled package settings for informational company spotlight rotation: enabled state, exact country-folder filters, and repeat behavior. The pool uses the existing 1,811-record catalogue and preserves each stable Logo ID, name, logo and country-folder metadata.
- Added a transactional per-customer/per-package cursor in the existing app-settings table. A row lock serializes concurrent requests; stable ordering avoids repeats until the filtered pool is traversed. A changed filter fingerprint resets only the affected scope's cycle.
- Replaced random company-reference polling with a protected customer endpoint that advances the durable cursor on demand, reducing periodic database work. Spotlight records remain reference-only and cannot create trades or alter financial state.
- Added additive migration 0087 and registered it in Drizzle, portal migration, installer recovery and worker runtime preflight. Added rotation unit and integration contract tests.
- Validation pending on the new commit; the previous validated head passed TypeScript, automated tests, production build, installer validation, and both Trading database integration suites.

## 2026-10-29 — Administrator badge and published-offer bounds for Trading pop-ups

- Extended the existing Trading policy editor and admin-only persistence path with an allowlisted badge label/style, inclusive minimum/maximum published reward-rate filters stored in integer basis points, and minimum/maximum published duration filters in seconds.
- Future pop-up delivery filters existing administrator-published offers against those bounds. It does not invent new reward rates or durations, and saves policy version, badge and original published duration on the durable popup event so existing events retain their original snapshot.
- Added forward migration 0086 and registered it with Drizzle, portal migration, installer recovery and worker runtime preflight. Added runtime schema-contract checks and migration-tail test updates.
- Validation for this new increment has not run on its eventual commit yet. The previous commit `3ed9264e436de9a150b7acbddfd8807fc7900fd9` passed the application, installer, Mining, Trading DB and recovery checks, including production type-check/test/build and the real-browser job. No production migration or deployment was run.

## 2026-10-29 — Expanded administrator Trading delivery policy controls

- Branch: `feat/trading-package-popup-policy`, based on canonical `main` SHA `7356c5870807592c8e890a3937cf3fb0f2a403fc`.
- Extended the existing **Trade Settings → Opportunity Engine** tier-policy editor to load and edit persisted delivery window, cadence bounds, expanded/completed pop-up display times, post-completion gap, pending-delivery caps, delivery/trade retry limits, concurrency, settlement timing, minimum eligible reward basis points, daily/per-trade reward caps, and card-close policy.
- Strengthened the existing admin-only save path: validate the entire submitted batch before writes, persist all tier changes in one database transaction, bump the per-tier policy version, and record previous/next policy plus actor in the audit stream. The UI requires confirmation, reports server errors, and refreshes only after success. Active trade snapshots remain intact.
- Added a source-contract test for UI/schema/router/service wiring. This increment does not yet implement configurable package badges, inclusive minimum/maximum per-pop-up reward-rate bounds, per-pop-up trade-duration bounds, stable-ID company rotation or restart-safe opportunity snapshots; those need a separate schema and worker integration increment.
- Validation: source checks have not yet run on this commit. No production migration or deployment was performed.

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


## 2026-10-29 — Part 4 CI-driven schema correction and dependency handoff

- Refreshed GitHub PRs #230–#238 and current `main`. Current `main`: `07b17ca401d5f0582bf09fba8b6625f4a8af42e6`. Part 4 PR #238 was at `fd0cf980929e03aa5cdb50c4582cf45585458cd5` before this correction; it had no exact-head workflow runs and remains draft/stacked on PR #233.
- Investigated PR #233's failed MySQL 8.4 and MariaDB 11.4 settlement integrations. Both failed because Drizzle selected `trade_positions.walletFundingPlanJson` but migration 0088 did not add it to that table. A forward-only migration 0089 is being added, registered in the Drizzle journal, portal runner, installer recovery list and worker runtime-schema bridge, with a worker preflight contract.
- Fixed the two migration-order tests whose hard-coded journal offsets failed and updated this handoff plus `docs/trading/IMPLEMENTATION_COORDINATION.md`.
- Local validation is unavailable because GitHub host resolution prevented repository checkout; `pnpm check`, `pnpm test` and `pnpm build` have not been run locally. No production database/server was accessed. Exact-head CI must be checked after this source change.
- Integration remains blocked: PRs #230–#237 remain open/unmerged in the latest refresh; PR #230 reports a merge conflict; main's historical `0086_trading_popup_policy_snapshots.sql` and PR #233/#235 same-numbered migrations require an explicit forward-only migration sequence. Do not merge #238 independently.
- Part 5 PR #236 current head `e9184988c9dbfde346278e697d8a9b64f47ec229` has seven successful generic workflows. Its dedicated authenticated UI runner and persisted-settings server acceptance are not verified; the real-server run was explicitly deferred.
- Disposition: Part 4 is not integration-complete or acceptance-complete. Exact-head CI and the integrated migration/lifecycle checks remain required; dedicated server acceptance remains deferred.


- Exact source correction commit: `6f8da2dde430b15ad060eb7883f9642e342d4609`. Immediately after pushing that commit, the exact-SHA workflow and combined-status APIs returned no checks; the new source is not yet reported as passing. Refresh the PR head and CI results before acceptance.


## 2026-10-29 — Exact-head CI results after schema and contract fixes

- Code correction `6f8da2dde430b15ad060eb7883f9642e342d4609` adds migration 0089 and registers it across the Drizzle journal, portal runner, installer recovery and worker runtime-schema path. Follow-up test correction `928833c577518fad488b147f7e2cf63b73fd2edb` aligns popup contract assertions with the current `executionEligible` predicate and excludes `trade_positions` from a test that specifically asserts the legacy 0062 bridge tables. The separate migration contract asserts the 0089 column directly.
- Validation-only draft PR #242 runs the existing `main`-targeted workflows against the exact Part 4 branch head `928833c577518fad488b147f7e2cf63b73fd2edb`; PR #238 remains stacked on #233. Exact-head run evidence:
  - Verify application, run [40927079937](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40927079937): main install/type-check/test/build job passed.
  - Trading recovery, run [40927079945](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40927079945): typecheck/tests/production-build job passed.
  - Settlement integration, run [40927079950](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40927079950): MySQL 8.4 and MariaDB 11.4 passed.
  - Tier qualification integration, run [40927080170](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40927080170): MySQL 8.4, MariaDB 11.4 and real worker assignment/reversal passed.
  - Mining regression, run [40927079934](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40927079934): passed. No Mining files were changed.
  - Installer validation, run [40927079996](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40927079996): application unit tests, installer/migration regressions, TypeScript, build/smoke, syntax, fresh MariaDB, MySQL compatibility/recovery and deployment package jobs passed.
  - Build/test production, run [40927079932](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40927079932): its type-check/test/build job passed; the separate generic customer-portal real-browser recovery job was still running at this record time. This generic recovery job is not the dedicated Part 5 authenticated acceptance runner.
- The first workflow pass exposed stale contract tests asserting the old `popupEligible` variable in execution guards, plus the legacy worker-bridge assertion applied to the new trade snapshot contract. Those assertions were corrected; the follow-up exact-head CI above passed on the revised source-test commit.
- Local `pnpm check`, `pnpm test` and `pnpm build` were not executed because this environment could not resolve GitHub for a repository checkout. GitHub CI executed the project’s install/check/test/build workflows. No production database or server was used.
- Current status remains **not integration-complete and not acceptance-complete**: PR #230 reports a merge conflict; PR #233 and #235 remain open and their overlapping 0086/0087 migration histories require a forward-only reconciliation against main's historical 0086 before merge. The dedicated authenticated Part 5 UI runner and persisted-settings server acceptance remain deferred by user decision. PR #242 is validation-only, draft, and must never be merged.


## 2026-10-29 — Current Part 4 database acceptance and integration handoff

- Exact tested source head: `1932435c93c04b46675d86ee44eb837c1a1f112f`. Rotation DB run [40929821492](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40929821492) passed MySQL 8.4 and MariaDB 11.4 with a three-company pool; duplicate idempotency, concurrent sequence ordering, restart restoration, rollback and snapshot stability passed.
- The same head passed application, Trading recovery, settlement DB integration, tier qualification/worker integration, installer validation and Mining regression workflows. The production build/test workflow's main build/test job passed; its generic browser-recovery subjob was still running at last check.
- Database findings fixed: missing INSERT placeholder, stale-snapshot duplicate check, incomplete portal-migration setup in the initial test workflow, and a one-company exhaustion fixture that did not prove full traversal.
- Part 4 remains not integration-complete because PR #230 is merge-conflicted and PR #233/#235 migrations collide numerically with the main branch's older 0086 file. Preserve historical migration files and reconcile the combined forward-only sequence before merge.
- Dedicated Part 5 authenticated Playwright/persisted-settings acceptance remains deferred. No live production server/database was accessed.


## Explicit migration-lineage blocker — verified from live branch files

- Current `main` Drizzle journal has 55 entries and ends at `0085_trade_settlement_schema_reconciliation`. Main also contains `drizzle/0086_trading_popup_policy_snapshots.sql`, but that file is not in the current main Drizzle journal or portal migration registry. It overlaps policy and snapshot fields with the later feature migrations and therefore cannot be treated as a harmless unique next migration.
- PR #233's journal records `0089_trading_popup_policy_ranges` at `1793318400005`, `0090_trading_company_spotlight_rotation` at `1793318400006`, then `0091_trading_popup_trade_snapshots` and Part 4's `0092_trading_trade_wallet_funding_plan_snapshot`.
- PR #235's journal instead records `0087_trading_opportunity_execution_leases` at `1793318400004` and `0088_trading_package_policy_schema_reconciliation` at `1793318400005`. Their SQL adds lease/delivery state and broad package/trade schema reconciliation that partially overlaps the Part 4/policy schema.
- This is a real upgrade-history conflict: `installer/main-migration-preflight.mjs` requires tracker hashes and `created_at` values to match an exact contiguous prefix of the repository journal. `scripts/guarded-main-migrate.mjs` rejects an unrecorded migration whose timestamp is less than or equal to the latest recorded timestamp. A simple union of the two journals can therefore reject installations that already applied only the #233 or only the #235 branch, even if the DDL is additive.
- **Not resolved by the current Part 4 branch.** Before merging the dependency chain, implement and test an explicit forward-only migration-history/schema reconciliation strategy for databases with main-only, #233-only and #235-only migration histories (including duplicate timestamps, policy field nullability/defaults, lease columns and worker preflight). Preserve original migration SQL and existing tracker records; do not just rename files, retimestamp old entries, or bypass the guard. The new rotation workflow tests the current clean disposable install sequence, but it is not evidence that all these alternative upgrade histories are safe.


## Final exact-head workflow outcome for documentation-reviewed head

The documentation-only branch head `df5f98871770e48453d22fc6b4b1fa9e0d751fc1` received successful conclusions for all eight main-targeted workflows: `40930505736` rotation MySQL/MariaDB integration, `40930505775` settlement MySQL/MariaDB integration, `40930505738` tier/worker integration, `40930505737` application install/type-check/test/build, `40930505724` Trading recovery, `40930505718` installer validation, `40930505765` Mining regression, and `40930505771` build/test production including its generic browser-recovery job. These are source CI results, not live-server acceptance. The separate dedicated Part 5 authenticated UI and persisted-settings acceptance remains deferred.


## 2026-10-29 — Trading Parts 1–6 final integration candidate (supersedes earlier status notes above)

- **Repository/base:** `stannmoye/Arbitrade_platform`; local branch `integration/trading-parts-1-6-finalization`, based on the freshly fetched `main` SHA `07b17ca401d5f0582bf09fba8b6625f4a8af42e6`.
- **Verified implementation commit:** `c3575344` (`Integrate and verify Trading workstreams 1-6`). The source changes are committed locally; push, final integration PR, post-push CI and merge are the next steps.
- **Integrated work:** Parts 1–6 are combined against current `main`; branch-local migration histories are archived byte-for-byte and reconciled to a forward-only `0086`–`0093` chain, with exact-lineage preflight coverage. Wallet adjustments now use a durable globally unique request key, hash normalized operation parameters, lock/reserve inside the financial transaction, persist the original response atomically, suppress replay side effects, and retain UI retry keys for the matching payload until success. Admin Trading tier/policy changes require explicit audited reasons; missing policy defaults fail closed; assigned package IDs/status/terms/qualification snapshots are visible to administrators.
- **Local verification on the committed source:** `pnpm install --frozen-lockfile` succeeded earlier in this run; `pnpm check` passed; `pnpm test` passed with 105 files and 829 tests passed (3 database-only files / 17 tests skipped because no disposable DB URLs are configured); installer/recovery suite passed (30 files, 170 tests); `pnpm build` passed; strict standalone `tsc` passed for `scripts/trading-wallet-adjustment-idempotency.integration.ts`; `git diff --check` passed. The new MySQL 8.4/MariaDB 11.4 wallet idempotency integration workflow and script are committed for post-push execution.
- **Limits/next steps:** This sandbox has no Docker/Podman executable and no database-test URL, so disposable MySQL/MariaDB execution is not claimed locally. The dedicated authenticated server-dependent Part 5 acceptance remains deferred as authorized; no production server/database was accessed or deployed. After push, inspect all exact-head checks (including the new MySQL/MariaDB job), fix any failures, merge the integration PR into `main` only when required conditions permit, and record the confirmed GitHub merge SHA and post-merge conclusions here.


## 2026-10-29 — PR #243 exact-head CI repair (local verification complete)

- Repository: `stannmoye/Arbitrade_platform`; integration branch: `integration/trading-parts-1-6-finalization`; current branch tip before this repair: `ae0de8b1436979f1da918d1e0095add474780d8f`. PR #243 targets `main`; fetched `main` remains `07b17ca401d5f0582bf09fba8b6625f4a8af42e6`.
- Investigated the first PR #243 exact-head database workflow failures. They exposed (a) test fixtures relying on now fail-closed/disabled package policies, (b) an idempotency mismatch test that did not reach the intended payload-mismatch branch, (c) a newly tightened admin date validation contract, and (d) a regression in partial policy updates that had been hidden by full-object fixtures.
- Corrected the disposable opportunity-worker and settlement fixtures to explicitly seed and clean up enabled policy rows; made the wallet mismatch replay structurally valid; fixed admin date validation; and restored the required partial-save API semantics. Policy updates now lock the persisted row, merge omitted fields, validate the effective settings and atomically version/audit the complete batch. Optional advanced policy fields remain optional at the API boundary; required base controls remain explicit. The appearance persistence integration test again exercises partial updates and asserts omitted fields are preserved.
- Local verification on this source: `pnpm check` passed; `pnpm test` passed (105 files / 829 tests passed, 3 files / 17 tests skipped); installer/migration suite passed (30 files / 170 tests); `pnpm build` passed; focused Trading contracts passed (6 files / 57 tests); strict standalone TypeScript checking passed for the wallet-idempotency, opportunity-worker and settlement integration scripts; `git diff --check` passed.
- Real MySQL/MariaDB workflows have not yet rerun on these repairs. No local disposable DB service or `DATABASE_URL` is configured; database-backed acceptance remains pending exact-head GitHub CI. No production server/database was accessed and no deployment or `main` merge has been performed in this increment.
- Next: commit with required attribution, push to update PR #243, inspect and wait for all exact-head jobs (including both MySQL and MariaDB), resolve any further failures, then merge only when the brief's acceptance conditions and applicable required checks are met. After merge, fetch and verify actual `main` and its post-merge CI before reporting deployment steps.

- Exact source repair commit after those checks: `fe090cea277d3e7ec2c42d4edcdb6716d1efb16f`. This commit contains the verified source and test changes above; it is not yet pushed, and exact-head GitHub database workflows remain the next acceptance gate.
