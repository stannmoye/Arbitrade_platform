# Workstream Status

**Last verified:** 2026-11-04  
**Default branch checkpoint:** `main` at `0f1fafba3bba30cfd7d2605bf6aeb8387fa2664b`  
**Window 6 branch:** `feat/stage-6-opportunity-worker-observability`  
**Window 6 implementation head with executed CI:** `962ae780e62e44ded236454040302afe9c5241e4`  
**Window 6 PR:** [#279](https://github.com/stannmoye/Arbitrade_platform/pull/279) — open, draft, not merged.

## Window 1 — Company catalogue and automatic generation

- PR [#278](https://github.com/stannmoye/Arbitrade_platform/pull/278), branch `feat/automatic-template-opportunities`, current head `b7567f4ae2b1c99342014925c5a667d1896fba21`.
- PR [#283](https://github.com/stannmoye/Arbitrade_platform/pull/283), branch `feat/workstream-1-company-catalogue-rotation-contract`, head `43796420d428456d3154488997f085ba63fae58e`.
- PR #278 contains catalogue-native opportunity generation, optional templates, package policy snapshots, persisted generation assignments and migrations 0103–0105.
- PR #283 adds explicit brand-only rotation and catalogue/logo regression contracts. Its exact-head execution remains to be confirmed.
- Do not infer that PR #278's current documentation-only head has the same CI evidence as its earlier code heads. Window 7 must run all checks on the integrated head.

## Window 2 — Package policies and configuration

- PR [#284](https://github.com/stannmoye/Arbitrade_platform/pull/284), branch `feat/window-2-package-opportunity-policy-contract`, head `e2f4f0b3710d1eecb1a3b1ee2c1d256786e12292`.
- The package-policy contract is under active implementation. Exact integrated persistence and independence tests remain a Window 7 gate.

## Window 4 — Opportunity delivery and customer portal

- PR [#280](https://github.com/stannmoye/Arbitrade_platform/pull/280), branch `feat/stage4-opportunity-delivery-contract`, head `f77bada696e7c5373d9333b1316bdacbf8943c39`.
- It depends on PR #278 and is based on an immutable Window 1 checkpoint. Rebase/retarget after Window 1 integration; do not merge its snapshot base independently.
- Its lease-gated first-render assertions are not yet equivalent to authenticated Blitz acceptance.

## Window 6 — Testing, monitoring and production readiness

**Implementation:** PR #279 adds aggregate per-customer failure reporting to the existing `runAutoTradeCycle`, optional result classification to `runMonitoredWorkerCycle`, degraded status for the existing `trading-opportunities` worker, and sanitized diagnostic code `CUSTOMER_CYCLE_FAILURES`.

**Files changed by PR #279:**
- `server/db.ts`
- `server/_core/workerHealth.ts`
- `server/_core/index.ts`
- `server/trading-opportunity-worker.contract.test.ts`
- `server/_core/workerHealth.test.ts`
- Shared coordination documents.

**Schema/API:** No new table, column, index, migration, worker, queue, endpoint, customer API or setting. Existing worker-health registry and monitoring routes are reused.

### Exact-head GitHub Actions evidence

The following GitHub Actions runs are associated with Window 6 implementation head `962ae780e62e44ded236454040302afe9c5241e4`. All listed jobs completed successfully:

- [Build and test production source #2177](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41768827044): locked dependency install, source-contract checks, TypeScript, automated tests, installer/migration contract tests and production build; its separate Vite-preview customer/portal browser job also completed successfully.
- [Opportunity worker lifecycle](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41768826996): disposable MariaDB 11.4 and MySQL 8.4; concurrent claims, lease recovery/fencing, qualified-customer popup delivery and no financial mutations.
- [Company rotation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41768826974): disposable MySQL 8.4 and MariaDB 11.4; durable rotation, duplicate delivery, restart, rollback and snapshots.
- [Tier qualification](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41768827000): disposable MySQL 8.4 and MariaDB 11.4 migration/backfill/concurrency checks and worker assignment/reversal integration.
- [Settlement reconciliation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41768827077): disposable MySQL 8.4 and MariaDB 11.4.
- [Trading recovery verification](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41768826978), [application verification](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41768827090), [Mining regression](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41768827052), and [installer validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41768827029): all completed successfully. Installer jobs exercised fresh disposable MariaDB/MySQL installation, migration recovery and existing-database guards.

This is CI evidence for the Window 6 branch head, not evidence for a final combined branch containing PRs #278–#284. The browser job starts a local Vite preview; it is not authenticated Blitz/staging acceptance.

### Remaining Window 6 verification gates

- Add/retain a true integrated generation-to-customer-portal acceptance on the final combined head.
- Run exact-final-head MySQL 8.4 and MariaDB 11.4 migrations and workflow integrations after reconciling migrations 0103–0105 and all other workstream changes.
- Verify the durable worker-health row becomes `degraded` after a partial customer batch against a disposable database; current added regression coverage includes source-contract assertions, while general worker-health derivation and sanitization tests are unit tests.
- Run authenticated browser acceptance against the actual target deployment (Blitz/staging) with eligible and ineligible test customers. No such hosted test is claimed.
- No performance/load profile or memory measurement is claimed.
- No production migration, production deployment or live-runtime verification is claimed.

## Other implementation windows

The current open-PR inspection did not identify a confirmed implementation PR for Windows 3 or 5. Their status and ownership paths must be supplied by those windows; do not infer completion from unrelated branches.

## Integration conflicts and findings

- PR #261 (`fix/trade-worker-health-diagnostics`) overlaps `server/_core/workerHealth.ts` and related tests with PR #279. It adds current-instance versus historical-instance health semantics. Its branch is currently reported non-mergeable. Window 7 must combine behavior by reviewed diff, not take either file wholesale.
- PR #261 previously identified a customer display blocker: `delivery.enabled` was missing from the delivery summary. Source inspection of PR #278's current `server/db.ts` confirms the returned delivery summary now includes `enabled: globalDeliveryEnabled`; verify this in integrated API/browser tests.
- PR #278's `client/src/customer-popup-eligibility.ts` accepts `in_progress` only when a non-empty server-issued `deliveryLeaseToken` is present. The Window 6 branch is based on main and does not contain that later change; Window 7 must preserve the PR #278/PR #280 lease gate.
- PR #279 also overlaps PR #278 in `server/db.ts` and `server/_core/index.ts`. Reconcile exact branch diffs.
- Preserve the financial boundary: opportunity generation and delivery verification must not activate real-money execution, customer-fund allocation, unattended settlement or wallet/ledger side effects.

## Window 7 authority

Window 7 owns cross-branch reconciliation, final migration ordering, exact-final-head CI, authenticated hosted acceptance and the merge decision. No implementation window merges directly to `main`.
