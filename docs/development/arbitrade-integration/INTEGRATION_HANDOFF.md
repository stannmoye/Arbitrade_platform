# Window 7 — Integration Handoff

**Prepared by:** Window 6 — Testing, Monitoring & Production Readiness  
**Prepared:** 2026-11-04  
**Window 6 PR:** [#279](https://github.com/stannmoye/Arbitrade_platform/pull/279)  
**Branch:** `feat/stage-6-opportunity-worker-observability`  
**Implementation head with executed CI:** `962ae780e62e44ded236454040302afe9c5241e4`  
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

See `VERIFICATION_MATRIX.md` for the exact workflow run links, per-component result, evidence scope and outstanding gates.

**Evidence limitations:** CI was run on the Window 6 branch, not on a final combined head containing all workstream PRs. The Vite preview browser test is not authenticated Blitz/staging acceptance. No production database, production deployment, production performance profile or live hosted runtime was tested.

## Findings and shared-file conflicts

1. **PR #278 — generation and company catalogue:** Window 1 changes `server/db.ts`, `server/_core/index.ts` adjacent worker flow and customer popup eligibility. PR #279 also changes `server/db.ts` and `server/_core/index.ts`. Reconcile exact diffs; do not replace whole files.
2. **PR #278 — missing delivery flag finding:** PR #261 had identified that customer display required `delivery.enabled` while the customer opportunity response omitted it. Source inspection of PR #278's current branch confirms its delivery summary now returns `enabled: globalDeliveryEnabled`. Verify API read-back and browser behavior on the integrated head.
3. **PR #278 / #280 — lease-gated display:** PR #278's customer popup eligibility accepts `in_progress` only when a non-empty server-issued `deliveryLeaseToken` is present. PR #280 adds matching regression assertions and acknowledgement propagation. Preserve this rule when reconciling the Window 6 branch, which is based on the earlier main checkpoint and does not include the newer helper change.
4. **PR #261 — worker health current/history semantics:** PR #261 changes `server/_core/workerHealth.ts` and related tests. It adds current-instance versus historical-instance handling and is complementary to Window 6's partial-batch degraded classification. PR #261 was observed as non-mergeable during this inspection. Merge behavior through a reviewed combined diff; do not overwrite either implementation.
5. **PR #284 — package policy:** integrate and test independent package policy read/write behavior before declaring package settings ready.
6. **Windows 3 and 5:** no confirmed open implementation PR for these windows was identified in the current open-PR search. Obtain their exact branch/commit/PR and ownership contracts rather than inferring them.

## Required integration and acceptance steps

1. Inspect current `main` and refresh the exact heads of PRs #278, #279, #280, #283, #284 and PR #261 immediately before integration.
2. Obtain Window 3 and Window 5 branch/PR heads and update the ownership/dependency documents.
3. Compare shared edits to `server/db.ts`, `server/_core/index.ts`, `server/_core/workerHealth.ts`, `server/opportunityLifecycle.ts`, `client/src/customer-popup-eligibility.ts`, `client/src/App.tsx`, `drizzle/schema.ts`, migration SQL and `drizzle/meta/_journal.json`.
4. Reconcile migration order, including Window 1 migrations 0103–0105 and any other workstream migrations. Preserve existing packages, company catalogue, logos, customers and historical rows.
5. Preserve the one existing delivery lifecycle, idempotency keys, pending limits, dispatch leases, fencing, retry policy and terminal-state rules.
6. Add/execute an integrated database regression that injects one customer-cycle failure, confirms subsequent customers still process, reads the persisted `degraded` worker health record and verifies the sanitized error code/message.
7. Run generation-specific replay/concurrency/snapshot tests and delivery-specific lease/retry/refresh recovery tests on disposable MySQL 8.4 and MariaDB 11.4 databases.
8. Run full frozen install, TypeScript check, automated tests, installer/migration tests, production build and server smoke checks on the exact final combined SHA.
9. Run authenticated browser acceptance against a dedicated Blitz/staging deployment with eligible and ineligible test customers. Record the deployed SHA and browser evidence; do not substitute local Vite preview.
10. Verify that opportunity generation and delivery produce no real-money execution, customer-fund allocation, unattended settlement or wallet/ledger mutations.
11. Report all PASS/PARTIAL/PENDING rows in `VERIFICATION_MATRIX.md`, including exact workflow links and database versions.

## Merge and deployment boundary

Window 6 has not merged any PR and has not deployed the branch. Window 7 owns final conflict resolution, integrated validation, acceptance and merge authority. Do not apply migrations to production as part of verification. Preserve authorization, audit controls and the financial separation boundary.

## Shared-document integration note

PR #278 also creates the canonical eight coordination documents. This Window 6 branch contains earlier copies of several of those files plus Window 6 updates. If PR #278 is integrated first, Window 7 must merge Window 6's status, dependencies, monitoring contract, verification matrix and handoff into the canonical documents; do not replace newer Window 1 documents with stale snapshots.

**Window 6 PR:** [#279](https://github.com/stannmoye/Arbitrade_platform/pull/279) — open, draft, unmerged.
