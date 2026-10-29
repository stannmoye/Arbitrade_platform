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
