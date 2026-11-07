# Window 5 — Trade Settings Administration & Persistence Handoff

**Status:** Implementation checkpoint; exact-head CI and hosted acceptance pending.  
**Branch:** `workstream/window-5-admin-trade-settings-persistence`  
**Base:** `main` at `0f1fafba3bba30cfd7d2605bf6aeb8387fa2664b`

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

## Tests and acceptance

Regression tests were added in `client/src/trading-delivery-policy-client-contracts.test.ts`; they have **not yet been executed in this session**. No test result is claimed.

Required exact-head checks:
- Focused: `pnpm test -- client/src/trading-delivery-policy-client-contracts.test.ts`
- Full: `pnpm test`
- TypeScript: `pnpm check`
- Production build: `pnpm build`
- Diff hygiene: `git diff --check`

Hosted authenticated admin-browser acceptance remains required for save persistence after refresh, invalid API responses, role denial, package isolation, keyboard accessibility and mobile/desktop layout. Unit/contract tests alone do not establish hosted database persistence or production behavior.

## Window 7 integration instructions

1. Keep this PR unmerged until exact-head checks pass.
2. Reconcile the five changed source/test files with concurrent work; do not replace whole files from another branch.
3. Run the focused and full test/typecheck/build checks on the integrated head.
4. Verify database persistence and authorization against disposable MySQL/MariaDB and authenticated browser sessions.
5. Confirm that package fee and delivery retry saves retain drafts on failure and only show success after fresh persisted-state verification.
6. Preserve the hard-disabled automatic financial execution boundary.
