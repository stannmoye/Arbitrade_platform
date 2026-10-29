# Trading Implementation Coordination

**Canonical base:** `main` (resolve and record the full SHA before each implementation increment)  
**Canonical requirements:** `docs/TRADING_SYSTEM_SPECIFICATION.md` and `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md`  
**Issue:** [#228](https://github.com/stannmoye/Arbitrade_platform/issues/228)  
**Scope:** Trade/Trading only. Do not change Mining or unrelated menus.

## Ownership boundaries

| Part | Primary ownership | Avoid changing without agreement |
|---|---|---|
| Part 1 — Package configuration & admin controls | Admin package editor, package API input schemas, package administration service validation/persistence, package policy version/audit contracts, admin customer eligibility/package status presentation, related tests | Worker scheduler/qualification queue, wallet-credit/FX transaction engine, catalogue rotation, settlement engine, global integration configuration |
| Part 2 — Financial integrity & FX funding | Wallet adjustment/funding transactions, FX provider integration, decimal-safe conversion, request idempotency and financial regression tests | Admin package editor/policy persistence, global worker scheduling, catalogue rotation and unrelated financial features |
| Part 3 — Qualification and worker processing | Durable qualification/opportunity workers, queue leasing, restart recovery, quota reconciliation and worker idempotency | Wallet transaction semantics/FX provider integration, admin package editor and catalogue UI |
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


## Part 2 financial integrity status — 2026-10-29

- Branch: `part2/financial-integrity-fx-funding-20261029`, based on main SHA `7356c5870807592c8e890a3937cf3fb0f2a403fc`.
- Implemented in this increment: decimal-safe conversion from native minor units to USD minor units, half-up USD-cent quantization, and focused unit tests; qualifying admin-credit attribution now uses this helper.
- Existing qualification FX evidence and atomic queue enqueue are present on the base branch. Their exact-head integration tests remain required.
- Blocking/pending: database-backed request idempotency for admin wallet adjustments and complete review/acceptance of the multi-wallet funding implementation in PR #230. No claim of full financial acceptance until these are implemented and verified.
- Part 2 does not merge to main or deploy. Integrator must reconcile this coordination file with the same file introduced by PR #234 before merging either branch.


### Part 2 follow-up audit — 2026-10-29

- Fixed a provenance precision issue: the ledger's `qualifyingDepositRate` now stores the original provider-returned rate representation instead of converting it through JavaScript `Number` and back to a string. This avoids losing significant digits in the persisted audit snapshot. Added a source-contract regression assertion.
- This is a targeted source change only. No test runner or build has been executed in this environment; exact-head CI and disposable-database checks remain pending.
- Additional blocking finding confirmed during service review: `adjustCustomerBalance` still generates a fresh random ledger reference per call and does not accept a stable request idempotency key. The transaction locks the target user and an existing wallet row, but the endpoint still requires concurrency tests for balance creation/update, reversals, and same-request replay. Do not treat per-ledger uniqueness or the qualification outbox key as request-level idempotency.
- PR #230 is open and non-draft at head `e7c625471e7b19c68a3b0b56d8de6c01f4eb1b9d`; its changed files overlap `server/db.ts`, `server/routers.ts`, `drizzle/schema.ts`, and migration `0086_trading_popup_policy_snapshots.sql`. Reconcile that exact diff before implementing a new idempotency schema or funding transaction to avoid duplicate migration/table designs.


## Part 2 — request idempotency increment (2026-10-29)

- Administrator wallet adjustment submissions now carry a stable client request key; retries of the same payload reuse that key.
- The request hash, idempotency key and serialized committed result are stored in a unique database record inside the same transaction as the wallet/ledger mutation. A repeated key with a different payload is rejected; a committed retry replays the original result without re-fetching FX or repeating post-commit side effects.
- Added migration `0087_admin_wallet_adjustment_idempotency.sql`. Because PR #230 also carries migration 0086, the final integrator must preserve sequential journal indices and apply both migrations in order when reconciling the shared schema.
- Database concurrency/rollback integration still must be run against the exact combined head before acceptance.


### Part 2 acceptance checkpoint — 2026-10-29 16:05 UTC

- PR #239 exact head `c51493471d2a1eecce5b9185055878589a721d69` passed all seven associated workflows, including MySQL 8.4 and MariaDB 11.4 tier qualification integration and installer/migration regression tests.
- PR #230 contains an injected mid-transaction cross-wallet rollback scenario. Its first run failed before the injected failure because the standard migration path lacked legacy `opportunity_package_policies` columns from migration 0051. The feature branch's migration 0086 was updated to add those columns idempotently.
- The corrected PR #230 tree has not yielded an exact-head CI run yet. Therefore rollback acceptance remains blocked. Do not mark Part 2 complete until the test proves source/target wallet balances, ledger rows and FX snapshots all remain unchanged after the injected error on both supported database engines.
- PR #239 migration 0087 depends on PR #230 migration 0086. Integrate both migrations in one sequential journal; do not merge them independently/out of order.
- PR #230 is currently based on older main commit `21a9f6a95aa72d464886c1c164016491ec7391dd` and reports non-mergeable. Rebase/reconcile its overlapping `server/db.ts`, schema, router and migration changes against current main before accepting the combined implementation.
