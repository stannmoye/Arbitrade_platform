# Trading Implementation Coordination

**Canonical base:** `main` (resolve and record the full SHA before each implementation increment)  
**Canonical requirements:** `docs/TRADING_SYSTEM_SPECIFICATION.md` and `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md`  
**Issue:** [#228](https://github.com/stannmoye/Arbitrade_platform/issues/228)  
**Scope:** Trade/Trading only. Do not change Mining or unrelated menus.

## Ownership boundaries

| Part | Primary ownership | Avoid changing without agreement |
|---|---|---|
| Part 1 — Package configuration & admin controls | Admin package editor, package API input schemas, package administration service validation/persistence, package policy version/audit contracts, admin customer eligibility/package status presentation, related tests | Worker scheduler/qualification queue, wallet-credit/FX transaction engine, catalogue rotation, settlement engine, global integration configuration |
| Part 2 | Customer Trading presentation and eligibility read-only contract | Admin package persistence, wallet credit/FX, workers, settlement |
| Part 3 | Qualifying admin-credit attribution and FX evidence | Package editor/UI, catalogue rotation, settlement |
| Part 4 | Durable qualification/opportunity worker and scheduling/recovery | Admin package editor, wallet transaction semantics, catalogue policy UI |
| Part 5 | Catalogue rotation and customer opportunity/card presentation contracts | Package admin persistence, wallet credit/FX engine, settlement |
| Part 6 — Integrator | Cross-part review, conflict resolution, final integration/tests/docs | Must coordinate shared-contract changes; no blind cherry-picking or duplicate migrations |

These are provisional ownership boundaries for parallel work. The project owner/integrator should amend assignments before any cross-boundary edits.

## Shared contracts

- Existing `packages` records and the existing package administration service remain the sole package system. Do not create a competing table/service.
- Qualifying thresholds are USD minor-unit integers attributed only to explicitly qualifying manual credits from the authorized admin Credit Customer / wallet-credit flow.
- Package duration and daily quota contribution are package policy; trade duration and expanded-card display duration are separate settings.
- Rates use integer basis points; monetary values use integer minor units or the repository's established decimal-safe representation.
- Admin package writes must be role-protected, server-validated, versioned and audited. Existing/open entitlements and trades retain their snapshots under the canonical effective-time policy.
- Customer APIs must not expose package catalogue or activation/selection actions.
- Database migrations must be ordered, forward-only, retry-safe and registered according to the existing migration policy.

## Active overlap requiring integration review

At the time this document was created, these open PRs touch overlapping Trading requirements and must be checked against current `main` before parallel commits are integrated:

- [PR #232 — Require explicit admin values for new Trading tiers](https://github.com/stannmoye/Arbitrade_platform/pull/232): new-tier form defaults and required threshold/duration/quota.
- [PR #230 — Implement durable admin-configured Trading pop-ups and wallet funding](https://github.com/stannmoye/Arbitrade_platform/pull/230): package policy fields, popup snapshots, wallet funding, migration 0086.
- [PR #231 — Fail closed on missing Trading policy and clarify retry availability](https://github.com/stannmoye/Arbitrade_platform/pull/231): policy read/update and admin controls.

Do not duplicate these changes or assume any PR is merged merely because its branch exists. Inspect each PR's current head, changed files, migration registration and exact-head CI before reusing or superseding its work. Coordinate shared files such as `client/src/App.tsx`, `server/db.ts`, `server/routers.ts`, `drizzle/schema.ts`, migration journals and package policy tests.

## Part 1 acceptance checklist

- [ ] Admin can create, edit, enable/disable, and archive/delete where the existing model permits; all persisted fields reload accurately.
- [ ] No implicit threshold, duration, or quota defaults are presented as owner-approved policy for new packages.
- [ ] All supported package fields from the canonical specification/manual are editable or explicitly documented as blocked/unimplemented; no decorative controls.
- [ ] Server validates all required fields, bounds, range ordering, safe integers, dates and supported enumerations.
- [ ] Authorization rejects non-admin writes and customer package selection/activation is unavailable.
- [ ] Policy edits create versioned actor/time/reason audit evidence and do not rewrite existing snapshots.
- [ ] Admin customer views show automatically assigned tier IDs/status and cumulative qualifying USD amount, with appropriate authorization.
- [ ] Unit/contract and disposable-database tests cover validation, authorization, create/update persistence, reload, audit/version behavior and prohibited customer actions.
- [ ] Exact-head CI evidence is recorded; never claim tests passed without observed results.

## Integration protocol

1. Each part works on a dedicated branch based on a freshly resolved `main` SHA and reports that SHA.
2. Before editing shared files, check this document and active PR diffs; agree on API/schema contracts with the owner/integrator.
3. Keep migrations unique and sequential. Do not rewrite migration history to hide superseded behavior.
4. Run focused tests while developing, then exact-head `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, and `pnpm build` where an executable workspace is available. Record unavailable checks explicitly.
5. Do not merge or deploy from a part branch. Part 6 owns integration review and final cross-part validation.


## Part 1 final acceptance snapshot — 2026-10-29

**Evidence SHA:** `41092475d50a9e4a2337233d143c9d380cf15c91`  
**Main SHA checked:** `07b17ca401d5f0582bf09fba8b6625f4a8af42e6`  
**PR #234:** open draft; no merge/deployment.

### Exact-head verification

All seven required workflows passed on the evidence SHA:
- [Production source build/test](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40905977492) — 96 test files passed, 3 skipped; 783 tests passed, 16 skipped; production build/type-check and browser recovery checks passed.
- [Installer validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40905977646) — 30 test files and 169 tests passed; TypeScript validation, migration regression, fresh MariaDB install, MySQL 8 compatibility/recovery, bundle budget and server smoke test passed.
- [Trading tier qualification DB integration](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40905977623) — MySQL 8.4 and MariaDB 11.4 integration jobs passed.
- [Trading settlement reconciliation DB integration](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40905977402) — MySQL 8.4 and MariaDB 11.4 passed.
- [Application verification](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40905977545) — passed.
- [Trading recovery verification](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40905977734) — passed.
- [Mining regression checks](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40905977408) — passed.

### Acceptance checklist at the Part 1 boundary

- [x] Required new-tier threshold, duration and daily quota are not silently defaulted; server create/update validation and date-order checks are present.
- [x] Policy editor covers allocation, delivery schedule/display/audio, retries, trade concurrency, settlement and reward caps.
- [x] Policy batch validation rejects duplicate and unknown tier rows; persistence increments policy versions and writes actor/reason/before-after audit evidence in the same transaction.
- [x] Opt-in disposable-DB policy integration exercises save/reload, version/audit persistence, customer-write rejection and unchanged state after rejected customer writes.
- [x] Admin customer listing uses persisted automatic assignment/subscription data for tier identifiers, status, terms version, qualifying-balance snapshot and expiry.
- [x] Exact-head CI has seven successful workflows on the evidence SHA.
- [ ] Cross-PR integration and final integrated-head acceptance — Part 6 responsibility, still outstanding.

### Overlapping PR and migration plan

- **#234 first as the Part 1 baseline** for admin tier forms, schemas, audit/version persistence and customer assignment display.
- **#231** must be reconciled next for fail-closed policy reads and explicit enablement; retain Part 1's transactional audit/version behavior and avoid reintroducing silent policy-row creation/defaults.
- **#230** supplies popup snapshots and wallet-funding/FX behavior; preserve its snapshot semantics and coordinate shared `server/db.ts`, `server/routers.ts`, `client/src/App.tsx` and schema changes.
- **#233** supplies advanced policy editor and company rotation/snapshot work; preserve its controls while avoiding duplicate UI and conflicting policy defaults.
- **#232** is largely superseded by the explicit blank/default behavior already in #234; take only any unique tests/behavior not already present.
- **Known migration collision:** main ends at migration `0085`. #230 adds `0086_trading_popup_policy_snapshots.sql`; #233 independently adds `0086_trading_popup_policy_ranges.sql`, followed by `0087_trading_company_spotlight_rotation.sql` and `0088_trading_popup_trade_snapshots.sql`. Integrate #230's 0086, then renumber the three #233 migrations to 0087, 0088 and 0089 respectively. Update the migration journal, installer migration registry, recovery/status diagnostics, schema checks and tests consistently. Validate fresh install and recovery after renumbering. Do not rewrite any migration already applied on main.
- **Integration blocker:** all four overlapping PRs were open when reviewed; their shared-file changes are not yet reconciled on a single branch. Do not merge/deploy until Part 6 has one integrated head and reruns installer, policy persistence, tier qualification, settlement, recovery and full source checks on that exact SHA.

**Disposition:** Part 1 is ready for Part 6 integration review. It is not a declaration that final cross-part acceptance or production release is complete.


## Latest Part 1 database-backed acceptance rerun

**Code-tested SHA:** `584f55390a6f5136ece1f4db27d0feb14fcfd0ef` — all seven required workflows passed on this exact SHA. This supersedes the earlier code-tested SHA in the preceding acceptance snapshot for Part 1 code.

- Production source suite: 96 test files passed, 3 skipped; 783 tests passed, 17 skipped.
- Disposable fresh-MariaDB integration suite: 6 tests passed for Trading package create/edit/reload, required field persistence, explicit disabled-by-default creation, effective dates, terms versioning, audit evidence, invalid input rejection, and admin-only writes. Policy integration also passed duplicate-row rejection, unknown-tier rejection with transaction rollback, version/audit persistence, and unchanged-state assertions after rejected writes.
- Installer validation, TypeScript, bundle budget/production smoke, fresh MariaDB, MySQL 8 compatibility/recovery, migration regression, tier qualification, settlement reconciliation, browser recovery, app verification, Trading recovery, and Mining regression all passed on the code-tested SHA.
- The current docs commit(s) after this SHA must receive their own exact-head workflow result; do not reuse the code-tested SHA as evidence for the later documentation head.

### Final Part 1 disposition

Part 1 package/policy persistence and focused authorization/audit acceptance work is ready for Part 6 integration review. It is **not merge-ready** until the branch is reconciled with current main and PRs #230–#233. The branch was 2 commits behind main at this check. Resolve shared-file conflicts and the duplicate 0086 migration number on the Part 6 integration branch, run final integrated installer/settlement/worker checks there, and keep PR #234 draft/unmerged until that gate passes. No deployment or production database mutation occurred.


## Part 1 / Part 6 handoff checkpoint — 2026-10-29

**Current Part 1 branch:** `part1/package-configuration-admin-controls-20261029`  
**Code head inspected before this documentation checkpoint:** `0ba2a39b97b5901d7888492fef2eae702c029cb0`  
**Acceptance:** not complete; PR #234 stays draft and unmerged.

### Additional policy persistence safeguards
- Policy update now loads and locks the current row inside the same transaction, merges submitted values over persisted values, validates the merged effective policy, and versions/audits each accepted update in that transaction.
- Missing policy rows are initialized disabled, with automatic delivery and automatic trading explicitly disabled. The admin editor has separate enablement controls; router input accepts the corresponding optional booleans.
- Duplicate tier names and unknown tier names are rejected; a thrown validation/audit/DB error aborts the enclosing transaction.
- These safeguards have been source-reviewed but still require disposable-DB acceptance tests on the exact final head. Source-text contract assertions alone are insufficient evidence.

### Integration status and recommended order
1. **PR #232** — preserve explicit blank defaults for new tiers and required values. Avoid duplicating its form changes.
2. **PR #231** — reconcile fail-closed reads and explicit policy enablement with this branch's disabled missing-row initialization. Verify customer/runtime readers use the persisted fail-closed query and never invoke lazy initialization.
3. **PR #230** — integrate wallet funding and popup policy snapshots with the package editor; inspect migration 0086 and shared `db.ts`, router, UI and tests.
4. **PR #233** — integrate versioned delivery editor, rotation and opportunity snapshots; resolve its migration 0086 collision with PR #230's different migration purpose, plus migrations 0087/0088, journal ordering, installer registration and recovery checks. Never rewrite an already-applied migration.
5. Re-run the full seven-workflow acceptance suite on the integrated candidate, then review all exact-head results before any merge. Keep Part 1 draft until Part 6 accepts the integrated code.

### Verified CI evidence and limitations
- Seven required workflows previously passed at `584f55390a6f5136ece1f4db27d0feb14fcfd0ef`; that result predates the latest policy persistence/enablement edits and is not proof for the new head.
- On code head `0ba2a39b97b5901d7888492fef2eae702c029cb0`, the seven required workflows were queued/pending at the time of inspection. The documentation commit creates a new head, so Part 6 must inspect workflow runs for the final SHA.
- No new DB-backed test counts are claimed. Required DB acceptance includes partial-update preservation, duplicate/unknown-tier rejection, all-or-nothing rollback, persisted audit identity/reason/old+new values/version, and unauthorized-write state invariance.

## Part 1 latest verification delta — 2026-10-29 16:42 UTC

The latest source head before this documentation checkpoint is `b2d6db69b7c69eb6c01b08e20fe41b70ad5e7a7d`; current `main` observed as `07b17ca401d5f0582bf09fba8b6625f4a8af42e6`. A disposable-DB integration test now submits a true partial policy update (required base fields only) and asserts omitted delivery/trading enablement, display, retry and settlement values remain unchanged. It also checks audit metadata's previous/next values and version. Package update integration now rejects inverted effective dates and verifies the database row remains unchanged.

An exact-head run had previously failed because a source contract still expected the old default-enabled initializer text. That assertion was corrected at `0861f791cd329c583c471c3c81e4dedcce62ca8d`; its rerun was still in progress when this checkpoint was prepared. Workflows for `b2d6db69b7c69eb6c01b08e20fe41b70ad5e7a7d` were also in progress. **No exact-head success is claimed until all seven final-head workflows complete.**

The DB integration fixture is opt-in and CI provisions a disposable MariaDB database; no production data was accessed. Part 1 remains unaccepted until final-head CI passes and Part 6 reconciles PRs #230–#233, including the conflicting 0086 migration identities.


## Part 1 exact-head acceptance and Part 6 handoff — 2026-10-29 16:45 UTC

- PR #234 head tested at this checkpoint: `0c3933f7e02afde43e647d07888cf146f9d4b234`; current `main`: `07b17ca401d5f0582bf09fba8b6625f4a8af42e6`. PR #234 remains draft/unmerged. The checkpoint documentation commit itself creates a new head, so Part 6 must inspect fresh workflow results for the resulting SHA.
- Exact-head CI: Trading tier qualification DB integration passed ([40914228669](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40914228669)); Trading settlement reconciliation DB integration passed ([40914228499](https://github.com/stannmoye/Arbitrade_platform/actions/runs/40914228499)). Production source build/test, recovery verification, application verification and Mining regression were in progress; installer validation was pending. No full exact-head green status is claimed.
- Package persistence path: admin tier form -> `adminOperations.createTradingPackage` / `updateTradingPackage` (`server/routers.ts`) -> `createAdminTradingPackage` / `updateAdminTradingPackage` (`server/db.ts`) -> existing `packages` table and `v5AuditEvents`. Policy path: admin `AdminPackages` editor -> `adminOperations.updatePackagePolicies` -> `updateOpportunityPackagePolicies`, which locks and merges existing policy rows, validates effective values, increments `policyVersion`, and persists policy plus audit record in one transaction.
- Database acceptance coverage is in opt-in disposable-database suite `server/appearance-settings-persistence.integration.test.ts`: package create/edit/reload, terms version, date rejection with unchanged row, actor/reason/old+new audit fields, admin/customer role rejection; policy partial-update preservation, version and audit metadata, duplicate/unknown tier rejection with unchanged state. Confirm exact final installer job output and record actual test counts before acceptance; source-text assertions are not substitutes.
- Integration order: (1) preserve PR #232's explicit blank new-tier defaults; (2) reconcile PR #231's fail-closed runtime reads and explicit enablement; (3) reconcile PR #230's wallet funding and popup snapshots; (4) integrate PR #233's delivery editor, rotation and opportunity snapshots; (5) resolve schema/journal/installer/startup registration conflicts, then run all seven workflows on the integrated candidate. PRs #230, #231, #232 and #233 were still separate dependencies at this checkpoint.
- **Known migration collision:** PR #230's `drizzle/0086_trading_popup_policy_snapshots.sql` and PR #233's `drizzle/0086_trading_popup_policy_ranges.sql` have the same migration number but different purposes; PR #233 also adds 0087 and 0088. Part 6 must inspect both branches' actual SQL and journal registrations and reconcile with forward-only migration strategy. Never edit an already-applied migration to disguise the collision.
- **Part 6 decision:** Part 1 is not accepted and is not ready for merge/deployment. It is ready only for a review of the proposed integration plan, not final integrated acceptance. Final acceptance requires fresh all-green exact-head CI, confirmed disposable-DB test output, and cross-PR migration/shared-file reconciliation.
