# Window 7 — Integration Handoff

**Prepared by:** Window 6 — Testing, Monitoring & Production Readiness  
**Prepared:** 2026-11-04  
**Window 6 PR:** [#279](https://github.com/stannmoye/Arbitrade_platform/pull/279)  
**Branch:** `feat/stage-6-opportunity-worker-observability`  
**Implementation head with executed CI:** `962ae780e62e44ded236454040302afe9c5241e4`  
**Latest Window 6 follow-up head at handoff:** `30eec7efd714942c44459cd5a46f82f98d0f72f9`  
**Default branch checkpoint used by PR #279:** `0f1fafba3bba30cfd7d2605bf6aeb8387fa2664b`

## What Window 6 delivers

PR #279 improves observability of partial customer-batch failures in the existing Trading opportunities worker:

- `runAutoTradeCycle` counts failed customer sub-cycles in aggregate as `customerFailures` while continuing the remaining customer batch.
- The existing `runMonitoredWorkerCycle` accepts an optional result classifier and records a partial batch as `degraded`.
- The existing `trading-opportunities` worker uses that classifier.
- `CUSTOMER_CYCLE_FAILURES` is a stable sanitized diagnostic code.
- The aggregate diagnostic does not include customer identifiers or raw exception text.
- Existing worker-health registry, admin health surface, diagnostics and worker lifecycle are reused.

No new table, column, index, migration, worker, queue, endpoint, customer API or admin setting is introduced. No financial execution, customer-fund allocation, unattended settlement or production deployment is introduced.

## Validation evidence

GitHub Actions associated with implementation head `962ae780e62e44ded236454040302afe9c5241e4` completed successfully:

1. Production source pipeline: locked install, source contract validation, TypeScript check, automated tests, installer/migration contract tests and production build.
2. Separate customer/portal browser acceptance against a local Vite preview.
3. Opportunity worker lifecycle on disposable MySQL 8.4 and MariaDB 11.4, including concurrent claims, lease recovery/fencing, qualified-customer popup delivery and no financial mutations.
4. Company rotation on MySQL 8.4 and MariaDB 11.4, including durable rotation, duplicate delivery, restart, rollback and snapshots.
5. Tier qualification migration/backfill/concurrency on MySQL 8.4 and MariaDB 11.4.
6. Settlement reconciliation on MySQL 8.4 and MariaDB 11.4.
7. Trading recovery, application verification, Mining regression and installer validation, including fresh disposable MySQL/MariaDB installation and migration-recovery checks.

See `VERIFICATION_MATRIX.md` for exact workflow run links, per-component result, evidence scope and outstanding gates.

**New durable-monitoring check:** Added `scripts/trading-worker-health.integration.ts` and a step in `.github/workflows/trading-opportunity-worker-integration.yml`. The script runs the production `runMonitoredWorkerCycle` with a synthetic partial-batch result against the disposable migrated database, then reads the current process health summary and asserts persisted `degraded`, `CUSTOMER_CYCLE_FAILURES`, aggregate-only diagnostic text and failure count. This verifies durable monitor persistence without invoking real trade execution or mutating customer/financial records. The first run [41772087185](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41772087185) remained in progress because the integration script did not close the mysql2 pool after assertions. The script now closes the pool in `finally` using `closeDbPool()`. Corrected exact-head CI is queued in [41774129112](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41774129112); wait for both database jobs before marking the assertion passed.

**Evidence limitations:** CI was run on the Window 6 branch, not on a final combined head containing all workstream PRs. The Vite preview browser test is not authenticated Blitz/staging acceptance. No production database, production deployment, production performance profile or live hosted runtime was tested.

**Synthetic performance tool:** Added `scripts/profile-worker-health.ts`, exposed as `pnpm profile:worker-health`. The MySQL/MariaDB worker matrix now executes it with 5,000 iterations, using 501 synthetic rows per status, verifying the 500-row cap and emitting latency percentiles and process memory observations. Exact-head CI [41774129112](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41774129112) is queued. This is a diagnostic-computation microprofile only; it does not represent SQL latency, end-to-end worker throughput, production load or Blitz performance. No results are claimed until CI completes.

## Current workstream/PR references

- **Window 1 — Company Catalogue & Automatic Company Rotation:** PR [#283](https://github.com/stannmoye/Arbitrade_platform/pull/283), branch `feat/workstream-1-company-catalogue-rotation-contract`, head `43796420d428456d3154488997f085ba63fae58e`.
- **Window 2 — Package Policies & Configuration:** PR [#284](https://github.com/stannmoye/Arbitrade_platform/pull/284), branch `feat/window-2-package-opportunity-policy-contract`, head `e2f4f0b3710d1eecb1a3b1ee2c1d256786e12292`.
- **Window 3 — Automatic Opportunity Generation Engine:** generation implementation is currently present in PR [#278](https://github.com/stannmoye/Arbitrade_platform/pull/278), branch `feat/automatic-template-opportunities`, head `b7567f4ae2b1c99342014925c5a667d1896fba21`. Its PR description labels it Window 1; the supplied assignment puts generation in Window 3. Window 7 must reconcile this ownership attribution with Window 1's company-catalogue changes.
- **Window 4 — Opportunity Delivery & Customer Portal:** PR [#280](https://github.com/stannmoye/Arbitrade_platform/pull/280), branch `feat/stage4-opportunity-delivery-contract`, head `f77bada696e7c5373d9333b1316bdacbf8943c39`.
- **Window 5 — Admin Trade Settings & Database Persistence:** PR [#274](https://github.com/stannmoye/Arbitrade_platform/pull/274) is a Phase 0 blueprint only; obtain the Window 5 implementation branch/PR directly from its owner.
- **Window 6 — Testing, Monitoring & Production Readiness:** PR [#279](https://github.com/stannmoye/Arbitrade_platform/pull/279), this branch.
- **Window 7 — Final Integration and Verification:** final integration authority.

## Findings and shared-file conflicts

1. **PR #278 generation/catalogue overlap:** PR #278 changes `server/db.ts`, worker orchestration and customer popup eligibility, and contains both generation and catalogue-rotation integration. Separate Window 1 catalogue/rotation ownership from Window 3 generation ownership. Do not attribute all of PR #278 to one workstream solely from its older PR description.
2. **PR #278 delivery summary:** PR #261 had identified that customer display required `delivery.enabled` while the customer opportunity response omitted it. Source inspection of PR #278's current `server/db.ts` confirms its returned delivery summary now includes `enabled: globalDeliveryEnabled`. Verify API read-back and browser behavior on the integrated head.
3. **PR #278 / #280 lease-gated display:** PR #278's customer popup eligibility accepts `in_progress` only when a non-empty server-issued `deliveryLeaseToken` is present. PR #280 adds matching regression assertions and acknowledgement propagation. Preserve this rule when reconciling the Window 6 branch, which is based on the earlier main checkpoint and does not include the newer helper change.
4. **PR #261 worker-health current/history semantics:** PR #261 changes `server/_core/workerHealth.ts` and related tests. It adds current-instance versus historical-instance handling and is complementary to Window 6's partial-batch degraded classification. PR #261 was observed as non-mergeable during this inspection. Merge behavior through a reviewed combined diff; do not overwrite either implementation.
5. **PR #284 package policy:** integrate and test independent package policy read/write behavior before declaring package settings ready.
6. **Window 5 settings persistence:** PR #274 is only a Phase 0 blueprint. Confirm Window 5's implementation PR and run UI save/read-back, refresh persistence, authorization and error-state tests.
7. **Shared code conflicts:** PR #279 overlaps PR #278 in `server/db.ts` and `server/_core/index.ts`; PR #261 overlaps PR #279 in `server/_core/workerHealth.ts` and tests. Compare exact diffs and resolve semantically.
8. **Windows 3 and 5 implementation heads:** obtain their current branch/commit/PR from their owners. Do not infer completion from another window's changes.

## Required integration and acceptance steps

1. Refresh exact heads of PRs #278, #279, #280, #283, #284 and PR #261 immediately before integration.
2. Obtain Window 3 and Window 5 implementation branch/PR heads and update ownership/dependency documentation.
3. Compare shared edits to `server/db.ts`, `server/_core/index.ts`, `server/_core/workerHealth.ts`, `server/opportunityLifecycle.ts`, `client/src/customer-popup-eligibility.ts`, `client/src/App.tsx`, `drizzle/schema.ts`, migration SQL and `drizzle/meta/_journal.json`.
4. Reconcile migration order, including Window 3's generation migrations 0103–0105 and any other workstream migrations. Preserve existing packages, company catalogue, logos, customers and historical rows.
5. Preserve the one existing delivery lifecycle, idempotency keys, pending limits, dispatch leases, fencing, retry policy and terminal-state rules.
6. Add/execute an integrated database regression that injects one customer-cycle failure, confirms subsequent customers still process, reads the persisted `degraded` worker-health record and verifies the sanitized error code/message.
7. Run generation-specific replay/concurrency/snapshot tests and delivery-specific lease/retry/refresh recovery tests on disposable MySQL 8.4 and MariaDB 11.4 databases.
8. Run full frozen install, TypeScript check, automated tests, installer/migration tests, production build and server smoke checks on the exact final combined SHA.
9. Run authenticated browser acceptance against a dedicated Blitz/staging deployment with eligible and ineligible test customers. Record the deployed SHA and browser evidence; do not substitute local Vite preview.
10. Verify opportunity generation and delivery produce no real-money execution, customer-fund allocation, unattended settlement or wallet/ledger mutations.
11. Report all PASS/PARTIAL/PENDING rows in `VERIFICATION_MATRIX.md`, including exact workflow links and database versions.

## Merge and deployment boundary

Window 6 has not merged any PR and has not deployed the branch. Window 7 owns final conflict resolution, integrated validation, acceptance and merge authority. Do not apply migrations to production as part of verification. Preserve authorization, audit controls and the financial separation boundary.

## Shared-document integration note

PR #278 also creates the canonical eight coordination documents. This Window 6 branch contains earlier copies of several of those files plus Window 6 updates. If PR #278 is integrated first, Window 7 must merge Window 6's status, dependencies, monitoring contract, verification matrix and handoff into the canonical documents; do not replace newer canonical files with stale snapshots.

**Window 6 PR:** [#279](https://github.com/stannmoye/Arbitrade_platform/pull/279) — open, draft, unmerged.
