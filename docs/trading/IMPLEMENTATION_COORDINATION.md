# Trading Implementation Coordination

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
- Automatic opportunity execution now stores a per-event UUID lease token; `createTrade` rejects stale tokens before wallet work, and completion/failure updates require the current token. `executionRetryAfter` acts as the lease expiry/retry time so a later worker can reclaim abandoned RUNNING work. This is source-implemented but not yet accepted until disposable-database concurrency and restart tests pass.
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
