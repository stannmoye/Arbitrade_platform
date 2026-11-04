# Window 5 — Trade Settings Administration & Persistence Handoff

**Status:** Implementation checkpoint; the ten-workflow suite passed on commit `9022aa1ed3a168007d7ffedabbabcbf221f60468`. A subsequent timing-hydration hardening change is awaiting its own CI run. Authenticated administrator save/read-back acceptance remains outstanding.
**Branch:** `workstream/window-5-admin-trade-settings-persistence`
**Base:** `main` at `0f1fafba3bba30cfd7d2605bf6aeb8387fa2664b`
**Previously verified implementation head:** `9022aa1ed3a168007d7ffedabbabcbf221f60468`
**Latest code head requiring CI:** `7a6c669663c6b9010bd970148b51d491b40f6229`

## Existing architecture retained

This work builds on the Trade Settings implementation merged through PR #275 and the route-ownership reconciliation merged through PR #276. It does not introduce a second settings service, new database table, migration, API, worker, or navigation registry.

The existing owners remain authoritative:

- `client/src/trade-settings-ownership.ts` — editable setting ownership and read/write paths.
- Existing `adminOperations` tRPC queries and mutations — administrator-only API boundary.
- Existing `app_settings`, package terms/policies and versioned package-fee records — persistence.
- Existing server-side transactional writes, optimistic versions, audit events and read-back verification — persistence contract.
- Existing Trade Settings route owners — menu and submenu organization.

The canonical route map is documented in `TRADE_SETTINGS_ADMIN_BLUEPRINT_RECONCILIATION.md`; this handoff does not change those ownership decisions.

## Window 5 changes in this checkpoint

1. Added reusable client-side validation contracts for package fee and shared delivery-retry drafts.
2. Package fee editor now explains invalid fee rate, rounding mode, future effective time and audit-reason fields before save. It continues to require fresh read-back confirmation before displaying success.
3. Shared retry editor now mirrors the server contract:
   - no-retry means exactly one initial attempt and zero retry intervals;
   - temporary retry requires a configured policy and exactly one interval per retry attempt;
   - attempts must be a whole number from 1 to 20;
   - intervals remain whole seconds from 5 through 3,600;
   - effective time and a 5–500 character audit reason are required.
4. Both editors display accessible validation errors and use the existing green success / clear error feedback styles. Success is displayed only after mutation completion and fresh server read-back.
5. Added regression contracts for valid and invalid fee/retry drafts and the visible feedback wiring.
6. Retained the pre-existing branch change in `AdminOperationsPages.tsx`, including normalization of global timing settings so valid zero values are not silently replaced by defaults. The normalizer now also enforces the existing server API's integer/range constraints, replacing malformed, fractional and out-of-range stored values with safe defaults while preserving valid zeroes. Window 7 should review this file's complete diff in context with concurrent settings work.
7. Added regression coverage for invalid persisted timing values, including negative, fractional and out-of-range values.

## Database and API impact

- No database schema or migration changes.
- No API procedure or input schema changes.
- No database writes were performed by this workstream.
- Existing administrator-only tRPC procedures, audit requirements, version checks and server validation remain in force.
- No package records, company catalogue entries, customer records or historical data are changed.
- No financial execution, customer-fund allocation, wallet/ledger mutation, settlement, payout or transfer capability is introduced or enabled.

## Dependencies and coordination

- Window 2 owns package policy semantics and defaults. This branch consumes the current package-policy contract and does not redefine defaults.
- Window 3 owns generation controls and must continue to consume the existing global/package policy owners.
- Window 4 owns delivery behavior and must consume the shared retry policy contract; the retry editor only validates and persists the existing shared policy.
- Window 7 must reconcile this branch against the exact heads of PRs #278–#280 and the existing Trade Settings ownership registry before integration.

The eight shared integration documents are being introduced by the parallel Window 1 PR #278 and are not present on this branch's `main` base yet. Do not create a competing copy; Window 7 should add this handoff to the shared status/dependency documents when reconciling #278.

## Automated verification on exact head

All ten GitHub Actions workflow runs for `65557fa20f1beca9d4dd2fa437e02502fa8bab44` completed successfully:

- Verify application.
- Mining regression checks.
- Arbitrade trading recovery verification.
- Company rotation durable-allocation database integration.
- Opportunity worker concurrency and recovery database integration.
- Settlement reconciliation database integration.
- Installer validation.
- Tier qualification database integration.
- Administrator wallet idempotency database integration.
- Production-source build and test, including customer-portal real-browser recovery checks.

The application and mining suites reported 1,143 tests passed and 27 skipped (146 test files passed, 5 skipped). TypeScript checking and production build passed. Installer validation included a disposable fresh MariaDB install, migration checks, production build/bundle budgets, server smoke test and deployment-package validation.

Trading database integration jobs passed on MySQL 8.4 and MariaDB 11.4 where configured. Coverage included durable company rotation, worker concurrency/recovery, tier qualification, wallet idempotency/authorization, and settlement reconciliation. Customer portal browser recovery checks passed in the CI browser environment.

Opportunity delivery integration confirmed persisted popup delivery and customer read-back, worker-cycle idempotency, and fail-closed conditions. It also confirmed no wallet/ledger mutation and no trade rows created by popup delivery; automatic financial execution remained disabled.

The ten workflows above also passed on documentation commit `9022aa1ed3a168007d7ffedabbabcbf221f60468`. The later normalizer hardening and its regression test were committed as `3af5e7af924bb8a94a09bfd0d662653a8a94702e` and `7a6c669663c6b9010bd970148b51d491b40f6229`; those newer commits require a fresh exact-head CI run before integration.

## Remaining acceptance gap

CI does not replace an authenticated administrator session against the actual hosted deployment. Still required before claiming the entire Trade settings surface is production-verified:

- Exercise each Trade-admin Save operation with an authorized admin session.
- Confirm success appears only after fresh persisted-state read-back and survives page refresh.
- Confirm invalid input and API failures show clear errors without discarding the user's draft.
- Confirm non-admin access is denied.
- Confirm package-specific edits do not alter another package.
- Confirm independent switches can be enabled together where policy allows.
- Verify keyboard accessibility and mobile/desktop layout.
- Use disposable test records/database only; do not mutate production customer or financial records.

No Blitz production session or production database was accessed in this workstream. Therefore this handoff does not claim that the user's reported live Save-button or popup issue is resolved in Blitz.

## Window 7 integration instructions

1. Keep this PR unmerged until integrated-head checks and authenticated administrator persistence acceptance are complete.
2. Reconcile the changed source/test files with concurrent work; do not replace whole files from another branch.
3. Re-run focused tests, full test suite, typecheck, production build and diff hygiene on the integrated head.
4. Verify database persistence and authorization against disposable MySQL/MariaDB and authenticated browser sessions.
5. Confirm package fee and delivery retry saves retain drafts on failure and only show success after fresh persisted-state verification.
6. Review the complete pre-existing `AdminOperationsPages.tsx` diff, especially global Trade settings normalization and read-back checks.
7. Preserve the hard-disabled automatic financial execution boundary.
