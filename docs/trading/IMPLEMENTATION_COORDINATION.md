# Trading Implementation Coordination

**Updated:** 2026-10-29  
**Scope:** Trade/Trading only. Do not change Mining or unrelated application menus.

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
- PR #233 exact-head CI exposed a real schema defect in disposable MySQL 8.4 and MariaDB 11.4 settlement tests: Drizzle inserts `trade_positions.walletFundingPlanJson`, but migration 0088 only added this snapshot to `opportunity_popup_events`. A forward-only `0089_trading_trade_wallet_funding_plan_snapshot.sql` is being added, registered in the journal, portal migration runner, installer recovery registry and runtime-schema bridge, with a worker preflight contract. Historical migrations 0086–0088 must not be rewritten.
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
- Forward-only migration `0089_trading_trade_wallet_funding_plan_snapshot.sql` adds nullable `trade_positions.walletFundingPlanJson` and is registered in the journal, portal runner, installer recovery, and worker runtime-schema bridge. Historical migrations 0086–0088 were not rewritten.
- Local `pnpm check`, `pnpm test`, and `pnpm build` could not run because local checkout failed when GitHub could not be resolved from this environment. GitHub CI ran the relevant install/type-check/test/build/database/installer checks listed above. No production server or database was accessed.
- **Status distinction:** the Part 4 rotation/snapshot slice has passed the branch-head database acceptance and the listed CI jobs. It is **not integration-complete or final acceptance-complete**: PR #230 remains merge-conflicted; #233 and #235 remain open and have overlapping 0086/0087 migration history, including main's historical `0086_trading_popup_policy_snapshots.sql`. A forward-only unified migration/dependency sequence and CI on the final combined head remain blockers. No merge or production migration is claimed.
- Part 5 PR #236 remains open/draft at `e9184988c9dbfde346278e697d8a9b64f47ec229`. Dedicated authenticated UI and persisted-settings acceptance on a suitable non-production server are deferred by user decision and are not claimed as passed.
