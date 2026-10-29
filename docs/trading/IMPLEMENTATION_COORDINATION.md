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
