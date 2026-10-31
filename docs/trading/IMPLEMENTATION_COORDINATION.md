## 2026-10-31 — Stage 3C.2: daily attempt budget versus retry ceiling

- Work remains on `fix/trade-lifecycle-and-admin-policy-completion`; PR #258 remains draft and must not be merged without explicit authorization.
- Corrected a policy mismatch: `maxTradeAttemptsPerDay` now limits the customer's total automatic execution claims across opportunities for the UTC day, including transient technical retries. It is no longer treated as the per-event retry maximum.
- Claims lock the customer row before the opportunity row (matching trade-allocation lock order), read the persisted package policy and count durable `executionAttemptCount` values for the customer/day. This serializes cross-event claims and prevents parallel workers from exceeding the configured budget.
- The per-opportunity transient retry ceiling remains a separate bounded internal safety control. A policy value of zero disables the daily cap. Exhausted daily budget defers not-yet-attempted opportunities until next UTC day; no wallet or ledger operation occurs.
- Added exact-head worker DB coverage for cross-opportunity daily cap exhaustion and updated admin UI/docs. CI and both DB engine results are pending.

---

## 2026-10-31 — Stage 3C.1: durable delivery cadence and post-completion timing

- Work remains isolated on `fix/trade-lifecycle-and-admin-policy-completion`; PR #258 remains draft and must not be merged without explicit authorization.
- Reconciled the remaining schedule gap: daily opportunity allowance and simultaneous visible-offer capacity were already separate, but min/max cadence and randomization were not applied by the worker. A stable deadline is now derived from the durable delivery-event ID, customer ID and policy version, so all workers/restarts calculate the same inclusive interval without a new migration.
- The post-completion gap now anchors to the most recent settled trade's persisted completion timestamp, rather than the last popup delivery. Both schedule gates must expire before the worker creates another delivery.
- Added helper tests and source-contract coverage. Exact-head CI and DB integrations are pending for this increment.

---

## 2026-10-31 — Stage 2 settlement confirmation and delayed wallet-credit lifecycle

- Work branch: `fix/trade-lifecycle-and-admin-policy-completion`, based on verified `main` SHA `048620efa2c68d707c87fb22ba63ebeb6a924772`. Keep this work isolated until exact-head CI, disposable MySQL/MariaDB integration and final review pass.
- Part 2 now separates `settlesAt` (trade duration end), `settlementReviewAt` (review eligibility after saved settlement delay), and `creditAt` (earliest wallet posting time after the review deadline and configured credit delay). Existing rows with null review timestamps use their prior `creditAt` as the review gate when available, otherwise `settlesAt`; null credit timestamps fall back to the review deadline. Historical timestamps are not rewritten.
- Administrator confirmation stores the actual result, evidence reference claim, confirmation actor/time and fee-policy snapshot under transaction, but does not post ledger entries, change wallet balances, release principal, finalize the reward reservation, or mark the popup terminal.
- The bounded monitored `settlement-credit-posting` worker posts only a confirmed result after `creditAt`. It locks and verifies the trade, reference claim, saved fee calculation, reservation and principal; then commits ledger entries, wallet balance changes, reservation finalization and terminal trade state atomically. Settlement notifications and popup completion happen after this commit.
- Additive migration `0096_trade_settlement_review_timestamp.sql` is registered in the Drizzle journal, guarded migration verification, runtime schema bridge, portal migration runner, installer recovery diagnostics and worker schema contracts.
- Regression tests and the disposable database integration script cover confirmation-before-credit, late confirmation, no timer-only posting, concurrent worker idempotency, replay and wallet/ledger consistency. These checks remain pending exact-head CI; do not mark the stage complete or merge until the CI and MySQL 8.4/MariaDB 11.4 jobs pass.

---

# Trading Implementation Coordination

**Updated:** 2026-10-29  
**Scope:** Trade/Trading only. Do not change Mining or unrelated application menus.

## 2026-10-30 — Admin Trading navigation and clarity fixes

- Shared Trading destinations now carry explicit focus identifiers. The admin portal compares both destination and focus when applying active navigation state, so package, quota, wallet, fee, settlement, delivery and company-reference items no longer appear to be the same selected page.
- Trading labels were rewritten in plain language: **Customer tiers**, **Daily trade allowance**, **When offers appear**, **Money used for trades**, **Returns and fees**, **Try failed trades again**, **Check finished trades**, and **Pause new trades**. Short explanations are visible beside each menu item rather than being available only through a hover title.
- Removed the duplicate tier-form fields for daily popup cap and maximum active investments. The central Trading delivery policy remains authoritative; the compatible server contract receives neutral legacy values of `0` when tier terms are created or saved.
- Added larger touch targets, wrapped menu explanations, wider field spacing, and readable wrapping for operations tables. Added `docs/trading/ADMIN_UI_FIX_LOG.md` with the complete change record and validation results.
- Regression coverage was updated in `server/trading-admin-navigation.contract.test.ts`.

## 2026-10-29 — Mainline Trading audit fixes

- **FX evidence precision:** the qualifying-credit and cross-wallet allocation paths truncated provider source timestamps to 16 characters, while `fx_rate_snapshots.sourceDate` was also limited to `varchar(16)`. This discarded seconds and offset/provenance detail required by the FX contract. The paths now persist the complete provider timestamp; forward-only migration `0095_fx_snapshot_source_timestamp_precision.sql` widens the column to `varchar(64)` and is registered in the Drizzle journal, portal runner, installer recovery diagnostics, and worker runtime-schema bridge. Existing truncated rows cannot be reconstructed and remain historical evidence of the prior schema.
- **Customer return copy:** the customer home opportunity feed rendered configured return rates as `+…%` / “estimated reward” and missed amounts as “Potential reward”. Those labels could be read as market-earned or credited results. The cards now say “Configured return”; missed rows explicitly say “Not allocated · no ledger credit”; the supporting safety copy uses “configured returns”.
- Regression coverage is in `server/trading-audit-fixes.contract.test.ts`; migration registration coverage is extended in `scripts/worker-schema-contracts.test.mjs`.

## Part 4 — Company Rotation & Opportunity Presentation

### Ownership

Part 4 owns:
- Existing company catalogue integrity and stable Logo ID mapping.
- Durable company rotation order/cursor semantics and per-opportunity company snapshots.
- Customer opportunity/company-reference presentation and display-only dismissal behavior.
- Rotation/presentation regression tests and the related contract documentation.

Part 4 does not own package administration forms, wallet transaction implementation, worker scheduling/lifecycle design, or global integrations. Changes in those areas require coordination with the corresponding owners.

### Catalogue contract

- Source of truth is the existing local 1,811-record catalogue mapped by stable Logo IDs `logo-brand-0001` through `logo-brand-1811`.
- The local logo mapping is joined to the base compressed ticker snapshot and three supplemental Brotli parts by numeric Logo ID, never fuzzy company-name matching.
- Source classifications currently total 814 Public-labelled candidates, 637 placeholders, 265 parent ticker references, and 95 historical ticker references. The 814 Public-labelled records remain unverified research candidates; none are eligible for verified trade rotation.
- Company name, local logo, country-folder metadata, supplied ticker/status and stable Logo ID must remain together. Catalogue membership is informational only and cannot establish a listing, execution, price, or profit.

### Rotation and opportunity snapshot contract

- The worker selects a company only while creating the durable opportunity. The customer/package cursor is row-locked and updated in the same database transaction as the opportunity row and its company metadata snapshot.
- The event key `userId:offerId:quotaDay` is the idempotency boundary. Creation rechecks for an existing event after acquiring the rotation lock; retries for an existing event must not advance the cursor a second time.
- The saved cursor stores the filtered-pool fingerprint, repeat policy, cycle, next index, request count and last Logo ID. A restart resumes from this database state. The persisted opportunity metadata records rotation-state version, assigned cycle, sequence, pool fingerprint and repeat policy alongside the company identity and source metadata.
- Under `avoid_until_exhausted`, a deterministic order avoids repeats for the configured customer/package scope until the filtered pool has been traversed. A changed filter or repeat policy changes the pool fingerprint and deliberately starts a new cursor scope for the new pool.
- Under `allow_repeats`, each assignment remains durable and sequenced, but repeats are permitted by policy.
- Any preview is read-only. It must not create a cursor, update a cursor, create an opportunity, allocate capital or write a ledger entry.
- Customer cards render the saved company reference from the opportunity/trade snapshot. They do not request a fresh random company to decorate an existing opportunity.

### Dismissal and presentation contract

- Dismiss/minimize/maximize/expanded-card timeout are presentation actions only.
- A dismissed event may be hidden from the expanded card, but successful delivery and non-terminal execution remain eligible for the server-owned automatic worker. Dismissal must not cancel execution, change the countdown, alter entitlements, debit/credit a wallet, or settle a trade.
- Display fields must come from persisted server data. Missing status, company metadata, or timestamps are shown as unavailable/pending rather than fabricated.
- A company reference is labelled as a reference-only catalogue entry. No ticker/logo/country folder is presented as proof of market execution or realized profit.

### Coordination dependencies

| Area | Owner | Required integration |
| --- | --- | --- |
| Package settings, filters, repeat policy and policy version | Part 1 / PR #233 | Rotation reads only saved admin policy. Changes apply to future opportunities; existing opportunity snapshots remain immutable. |
| Opportunity creation, durable scheduling, restart recovery and customer isolation | Part 3 | Worker creates one idempotent opportunity and invokes the rotation allocator inside that creation transaction. |
| Funding, FX evidence, wallet ledger and settlement | Part 2 | Company rotation never changes wallet/ledger state; dismissal must not gate server-owned execution or settlement. |
| Final integration and exact-head acceptance | Part 6 | Resolve migration ordering and shared-file conflicts, then run exact-head CI and integration suites before merge. |

### Active related changes reviewed

- PR #230 contains the durable popup creation/funding slice and overlaps lifecycle/schema files.
- PR #231 contains fail-closed package policy/runtime changes.
- PR #232 removes implicit defaults from new tier creation.
- PR #233 contains package policy controls, company-rotation settings, rotation implementation, and popup snapshot schema changes.
- PR #234 proposes this coordination document as a separate documentation change.

Because these changes overlap, Part 4 is layered on the PR #233 branch for review and must not be merged independently into `main`. The integrator should reconcile this branch with PR #230 and PR #234, preserve migration order, and verify the resulting combined head.

### Verification checklist

- [x] Catalogue loader and existing tests assert 1,811 records, unique stable IDs, local logo paths and unverified listing status.
- [x] Pure rotation tests cover full-pool traversal, repeat policy, filter changes and restart restoration from persisted JSON state.
- [x] Popup execution policy has regression tests proving that dismissal is not execution cancellation.
- [x] Contract tests check that the opportunity transaction snapshots rotation metadata and that customer preview does not write rotation state.
- [ ] Run `pnpm check`, `pnpm test`, `pnpm build`, database integration tests and installer/migration checks on the final combined dependency head.
- [ ] Confirm exact-head CI and merge requirements on the final combined integration head.
- [x] Verify durable rotation on disposable MySQL 8.4 and MariaDB 11.4 with duplicate/concurrent deliveries, restart recovery, rollback, filter/policy changes, immutable snapshots, and a multi-company exhaustion pool (tested source head `1932435c93c04b46675d86ee44eb837c1a1f112f`).

No merge into `main`, production migration, or deployment is authorized by this document.


## 2026-10-29 — CI-driven Part 4 correction and current integration disposition

- Refreshed live GitHub state before editing. `main` remains `07b17ca401d5f0582bf09fba8b6625f4a8af42e6`; PR #238 remains open/draft and stacked on PR #233. The previously reviewed Part 4 head had no workflow runs.
- PR #233 exact-head CI exposed a real schema defect in disposable MySQL 8.4 and MariaDB 11.4 settlement tests: Drizzle inserts `trade_positions.walletFundingPlanJson`, but migration 0088 only added this snapshot to `opportunity_popup_events`. A forward-only `0092_trading_trade_wallet_funding_plan_snapshot.sql` is being added, registered in the journal, portal migration runner, installer recovery registry and runtime-schema bridge, with a worker preflight contract. Historical migrations 0086–0088 must not be rewritten.
- Two migration-order regression tests had brittle hard-coded journal tail offsets; their assertions are changed to verify neighboring historical entries and the complete recent migration order.
- The correction is not validated until fresh exact-head CI passes, including MySQL 8.4/MariaDB 11.4 settlement integration and installer regression tests. Local `pnpm` checks were unavailable because repository checkout failed when GitHub DNS could not resolve.
- Live dependency state at review: PR #230 is open/non-draft and reports merge conflict; #231–#237 remain open/draft/unmerged. PR #235 migrations conflict numerically with #233's 0086–0088 and must be reconciled into one forward-only sequence before integration. PR #238 must not merge independently into `main`.
- PR #236 is aligned to current `main` at head `e9184988c9dbfde346278e697d8a9b64f47ec229`; seven generic workflows passed on that exact head. Dedicated authenticated UI and persisted-settings acceptance remain unverified and deferred by user decision. Generic browser-recovery CI is not evidence that the dedicated runner ran.
- Status: Part 4 implementation remains partially complete; integration and acceptance are not complete. Fresh exact-head CI and database concurrency/restart/idempotency/rollback/pool-exhaustion/snapshot coverage on the reconciled dependency branch remain required.

- Concrete correction commit: `6f8da2dde430b15ad060eb7883f9642e342d4609`. The handoff-only follow-up commit was `279ff07d8bcba5273ae013174bff1bf46f15c93d`. The exact-SHA workflow endpoint and combined-status endpoint returned zero runs/statuses for these inspected heads; this is missing CI evidence, not a pass.


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


## 2026-10-29 — Current verified Part 4 source head and database acceptance

- **Exact implementation/test head:** `1932435c93c04b46675d86ee44eb837c1a1f112f`. Current `main`: `07b17ca401d5f0582bf09fba8b6625f4a8af42e6`. PR #238 remains open/draft and stacked on PR #233; it has not been merged. Validation-only PR #242 targets `main` to run main-targeted workflows against this same feature head; **do not merge #242**.
- The disposable rotation workflow follows the installer-equivalent schema sequence: guarded main migrations, portal migration registry, worker runtime-schema bridge, worker schema verification, then lifecycle integration against an isolated database.
- Rotation matrix [40929821492](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40929821492) passed on MySQL 8.4 and MariaDB 11.4. Both logs report `ok=true`, two concurrent duplicate deliveries with one cursor advance, four distinct concurrent company assignments, stable opportunity snapshots after policy changes, fresh-process cursor recovery, transaction rollback after a controlled insert failure, and a filtered pool of **3** companies traversed without repeats before cycle 2.
- Other successful workflows on this exact source head: [Verify application 40929821517](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40929821517), [Trading recovery 40929821444](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40929821444), [settlement database integration 40929821435](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40929821435), [tier qualification / worker integration 40929821422](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40929821422), [installer validation 40929821482](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40929821482), and [Mining regression 40929821644](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40929821644). The type-check/test/build job in [build/test production 40929821416](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40929821416) passed, but that workflow's separate generic customer-portal browser-recovery job remained in progress at the last check; the overall run is not claimed as complete.
- Defects found by actual DB runs and fixed: popup INSERT placeholder count was 26 for 27 bound values; the post-cursor-lock idempotency recheck used a stale repeatable-read snapshot instead of a locking/current read; the first integration setup omitted portal migrations required by real install order; and the exhaustion fixture allowed a one-company pool. Current branch uses 27 placeholders, a `SELECT ... FOR UPDATE` current read, installer-equivalent schema setup, and a pool fixture requiring at least three companies.
- Forward-only migration `0092_trading_trade_wallet_funding_plan_snapshot.sql` adds nullable `trade_positions.walletFundingPlanJson` and is registered in the journal, portal runner, installer recovery, and worker runtime-schema bridge. Historical migrations 0086–0088 were not rewritten.
- Local `pnpm check`, `pnpm test`, and `pnpm build` could not run because local checkout failed when GitHub could not be resolved from this environment. GitHub CI ran the relevant install/type-check/test/build/database/installer checks listed above. No production server or database was accessed.
- **Status distinction:** the Part 4 rotation/snapshot slice has passed the branch-head database acceptance and the listed CI jobs. It is **not integration-complete or final acceptance-complete**: PR #230 remains merge-conflicted; #233 and #235 remain open and have overlapping 0086/0087 migration history, including main's historical `0086_trading_popup_policy_snapshots.sql`. A forward-only unified migration/dependency sequence and CI on the final combined head remain blockers. No merge or production migration is claimed.
- Part 5 PR #236 remains open/draft at `e9184988c9dbfde346278e697d8a9b64f47ec229`. Dedicated authenticated UI and persisted-settings acceptance on a suitable non-production server are deferred by user decision and are not claimed as passed.


## Explicit migration-lineage blocker — verified from live branch files

- Current `main` Drizzle journal has 55 entries and ends at `0085_trade_settlement_schema_reconciliation`. Main also contains `drizzle/0086_trading_popup_policy_snapshots.sql`, but that file is not in the current main Drizzle journal or portal migration registry. It overlaps policy and snapshot fields with the later feature migrations and therefore cannot be treated as a harmless unique next migration.
- PR #233's journal records `0089_trading_popup_policy_ranges` at `1793318400005`, `0090_trading_company_spotlight_rotation` at `1793318400006`, then `0091_trading_popup_trade_snapshots` and Part 4's `0092_trading_trade_wallet_funding_plan_snapshot`.
- PR #235's journal instead records `0087_trading_opportunity_execution_leases` at `1793318400004` and `0088_trading_package_policy_schema_reconciliation` at `1793318400005`. Their SQL adds lease/delivery state and broad package/trade schema reconciliation that partially overlaps the Part 4/policy schema.
- This is a real upgrade-history conflict: `installer/main-migration-preflight.mjs` requires tracker hashes and `created_at` values to match an exact contiguous prefix of the repository journal. `scripts/guarded-main-migrate.mjs` rejects an unrecorded migration whose timestamp is less than or equal to the latest recorded timestamp. A simple union of the two journals can therefore reject installations that already applied only the #233 or only the #235 branch, even if the DDL is additive.
- **Not resolved by the current Part 4 branch.** Before merging the dependency chain, implement and test an explicit forward-only migration-history/schema reconciliation strategy for databases with main-only, #233-only and #235-only migration histories (including duplicate timestamps, policy field nullability/defaults, lease columns and worker preflight). Preserve original migration SQL and existing tracker records; do not just rename files, retimestamp old entries, or bypass the guard. The new rotation workflow tests the current clean disposable install sequence, but it is not evidence that all these alternative upgrade histories are safe.


## Final exact-head workflow outcome for documentation-reviewed head

The documentation-only branch head `df5f98871770e48453d22fc6b4b1fa9e0d751fc1` received successful conclusions for all eight main-targeted workflows: `40930505736` rotation MySQL/MariaDB integration, `40930505775` settlement MySQL/MariaDB integration, `40930505738` tier/worker integration, `40930505737` application install/type-check/test/build, `40930505724` Trading recovery, `40930505718` installer validation, `40930505765` Mining regression, and `40930505771` build/test production including its generic browser-recovery job. These are source CI results, not live-server acceptance. The separate dedicated Part 5 authenticated UI and persisted-settings acceptance remains deferred.

---

## Part 3 — Automatic Trading worker and recovery

**Canonical base:** `main` at `7356c5870807592c8e890a3937cf3fb0f2a403fc` when this Part 3 increment began. Resolve the current full SHA again before integration.  
**Canonical requirements:** `docs/TRADING_SYSTEM_SPECIFICATION.md` and `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md`  
**Tracking issue:** [#228](https://github.com/stannmoye/Arbitrade_platform/issues/228)  
**Scope:** Trade/Trading only. Do not change Mining or unrelated menus.

## Six-part ownership

| Part | Primary ownership | Shared-boundary constraints |
|---|---|---|
| Part 1 — Package configuration & admin controls | Admin package editor, package API validation/persistence, policy version/audit, admin customer eligibility/package status | Coordinate package schema and policy effective-time changes; do not change worker lifecycle or wallet credit/FX internals. |
| Part 2 — Financial integrity & FX funding | Qualifying admin-credit attribution, timestamped FX evidence, atomic wallet funding and financial idempotency | Coordinate worker idempotency keys and durable snapshots; do not own scheduler/lifecycle implementation. |
| Part 3 — Automatic trading worker & customer isolation | Worker lifecycle, scheduler, bounded work claiming, leases/recovery/retry, worker health/shutdown, worker-specific tests | Do not rewrite package administration, wallet services, catalogue rotation, settlement accounting, or global deployment configuration. |
| Part 4 — Catalogue rotation & opportunity snapshots | Durable per-customer company rotation, stable Logo ID/name/logo/country association, opportunity snapshot contract | Coordinate durable opportunity uniqueness and worker transaction boundaries; do not introduce trade outcomes or settlement credits. |
| Part 5 — Customer Trading experience | Customer opportunity/card presentation, read-only eligibility display, display-only minimize/maximize behavior | Customer UI must not trigger eligibility, allocation, lifecycle transitions, or settlement. |
| Part 6 — Integrator | Cross-part conflict resolution, full regression suite, docs/handoff reconciliation, exact-head CI and integration decision | No blind cherry-picking or duplicate migrations; no merge/deployment without owner approval. |

These boundaries supersede any conflicting provisional role mapping in older handoffs. The project owner may explicitly reassign ownership before a part changes shared contracts.

## Shared contracts

- `main` is the source of truth. Each part starts from a freshly resolved full SHA and records it.
- Customers do not browse, choose, subscribe to, or activate tiers. Server eligibility derives only from explicitly qualifying manual administrator wallet credits; enabled tier daily quotas accumulate.
- Existing `packages` and current ledger/workflow services remain authoritative; do not create parallel package or wallet systems.
- Customer reads, login, refresh and UI actions must not execute worker lifecycle transitions or financial movements.
- Opportunity/trade snapshots retain selected capital, rate, duration, due time, policy version and any required FX evidence. Estimates and elapsed time are not execution evidence or realized profit.
- Worker claims and lifecycle changes must be bounded, idempotent, concurrency-safe, tenant/customer-scoped and restart-recoverable. Leases must expire/reclaim safely; retries must not repeat committed financial effects.
- Migrations are forward-only, ordered, retry-safe and registered in the repository's migration mechanisms.
- Do not expose secrets, credentials, raw customer identifiers, or sensitive financial records in worker logs.

## Active integration overlaps observed at baseline

Check current state before reusing or superseding these PRs; their status may change:
- [#230 — Implement durable admin-configured Trading pop-ups and wallet funding](https://github.com/stannmoye/Arbitrade_platform/pull/230)
- [#231 — Fail closed on missing Trading policy and clarify retry availability](https://github.com/stannmoye/Arbitrade_platform/pull/231)
- [#232 — Require explicit admin values for new Trading tiers](https://github.com/stannmoye/Arbitrade_platform/pull/232)
- [#233 — Expose versioned Trading delivery policy controls](https://github.com/stannmoye/Arbitrade_platform/pull/233)
- [#234 — Documentation-only ownership proposal](https://github.com/stannmoye/Arbitrade_platform/pull/234)

Shared paths requiring coordination include `server/_core/index.ts`, `server/_core/workerHealth.ts`, `server/_core/workerRuntime.ts`, `server/db.ts`, `server/routers.ts`, `drizzle/schema.ts`, migration journals, and worker integration tests.

## Part 3 worker contract

- Worker execution is server-side and independent of browser sessions.
- Keep one cycle per process in flight; bound customer batches and database polling.
- On repeated transient cycle failures, use capped exponential backoff, emit structured/sanitized diagnostics, and resume normal cadence after success.
- Durable database state remains authoritative across restarts. A process-local guard/backoff is only load protection, not a distributed customer lease.
- Automatic opportunity execution stores a per-event UUID lease token; `createTrade` rejects stale tokens before wallet work, and completion/failure updates require the current token. `executionRetryAfter` acts as the lease expiry/retry time so a later worker can reclaim abandoned RUNNING work. The disposable-DB integration harness covers competing claims, a real child-process kill after claim, expired-lease recovery under a new fencing token, stale-token rejection, concurrent fresh allocations across separate events, one-per-day quota enforcement, and idempotent replay on MySQL 8.4/MariaDB 11.4. Exact-head CI passed on code head `d3ed24aa75afa7d4242c252e04aea2bc9d8831ca`; see PR #235 for the recorded run results.
- Recovery must not re-roll committed snapshots, double-advance catalogue rotation, double-allocate capital, duplicate ledger movements, or infer settlement from elapsed time.
- Graceful shutdown stops scheduling, drains tracked cycles within the configured deadline, and leaves incomplete durable work recoverable.
- Monitor heartbeat, last success/failure, duration, consecutive failures and stale/dead-letter work where supported by the existing health registry.

## Integration protocol

1. Inspect current `main`, issue #228, canonical specification/manual, current worker source/tests, and open PR diffs before touching shared paths.
2. Agree on contracts with adjacent parts before changing wallet, package, catalogue or settlement code.
3. Add worker-specific tests for concurrency, crash/restart recovery, expired leases, retry limits, quota enforcement and customer isolation. Distinguish source-contract tests from disposable-database concurrency evidence.
4. Run `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, `pnpm build`, and relevant MySQL/MariaDB integration tests on the exact branch head when a runnable workspace is available.
5. Record exact commit SHA and CI URLs. A source change is not evidence of passing tests; CI green is not production acceptance.
6. Part branches remain unmerged and undeployed. Part 6 owns integration review.


## 2026-10-31 — Verified-only customer company identity policy merged

- PR [#256 — Show only admin-verified companies in customer pop-ups](https://github.com/stannmoye/Arbitrade_platform/pull/256) was squash-merged into `main` as `9b83dd507bc7e466b961737bc15ee0038038ea7c`.
- The current `trade.companyCatalogue.adminState` setting is the authority for customer pop-up identity: include only current `verifiedIds`, always exclude `archivedIds` (Archived takes precedence), apply country filters after approval, and fail closed with no company identity when the state is missing/malformed or no approved company matches.
- The customer preview uses the same approved pool. Active customer pop-up reads re-check current status so unverify/archive changes hide company identity immediately; immutable historical snapshots remain unchanged.
- The searchable customer catalogue remains a separate informational reference surface. It must never be used as a fallback or alternate source for opportunity pop-up identity. Admin approval is display-only and does not establish securities listing or trade-execution eligibility.
- All 25 exact-head PR checks passed before merge. Post-merge checks were still running/queued at the last recorded poll. No production deployment or database modification was performed.
