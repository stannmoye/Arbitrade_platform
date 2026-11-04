# Window 7 — Integration Handoff

**Prepared by:** Window 1 — Automatic Opportunity Generation  
**Prepared:** 2026-11-04  
**Workstream 1 PR:** [#278](https://github.com/stannmoye/Arbitrade_platform/pull/278)  
**Branch:** `feat/automatic-template-opportunities`  
**Code head inspected:** `aa27d664475eaf40dd4ff3d3414b267e569484e9`

## What Window 1 hands off

The branch implements catalogue-native automatic opportunity generation and keeps manual company templates optional. It uses the existing customer entitlement, package-policy, company-catalogue, company-rotation and opportunity-delivery infrastructure. The current PR contains 48 changed files and migrations 0103–0105.

Key implementation files include:
- `server/modules/opportunity-generation-template.ts`
- `server/db.ts`
- `server/opportunityLifecycle.ts`
- `server/routers.ts`
- `client/src/components/AdminOpportunityTemplates.tsx`
- `drizzle/0103_automatic_opportunity_generation_templates.sql`
- `drizzle/0104_catalogue_native_opportunity_generation.sql`
- `drizzle/0105_default_on_global_information_delivery.sql`

## Required integration steps

1. Inspect the latest `main`, all six implementation branches and open PRs immediately before integration.
2. Obtain and record the exact Window 2–6 ownership rows and PR heads. They are not inferred in this handoff.
3. Compare all changes touching `server/db.ts`, `server/routers.ts`, `server/opportunityLifecycle.ts`, `drizzle/schema.ts`, `drizzle/meta/_journal.json`, `client/src/App.tsx` and canonical Trading documentation.
4. Reconcile schema changes and preserve global migration order. Keep 0103, 0104 and 0105 in order unless a reviewed conflict requires a coordinated rebase.
5. Verify generation consumes active server-assigned subscriptions and saved package policies; company selection uses current approved/enabled/non-archived IDs and saved country filters.
6. Verify template absence does not block generation and that a template cannot override package bounds.
7. Verify a generation replay returns/reuses the persisted assignment without rerolling terms or advancing rotation twice.
8. Verify existing delivery lifecycle remains the only delivery owner and that capacity, idempotency, lease/retry and recovery semantics remain intact.
9. Verify generation and delivery create no trade allocation, wallet change, ledger entry, result, or settlement.
10. Run `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, `pnpm build`, migration validation and disposable MySQL 8.4 / MariaDB 11.4 integrations against the final integrated SHA.
11. Run the required authenticated browser acceptance against a dedicated staging deployment with seeded eligible and ineligible customers. Do not substitute mocked browser tests for authenticated staging evidence.
12. Report exact integrated SHA, workflow links/results, database engine versions, browser target SHA and any outstanding production rollout gates.

## Merge and deployment boundary

Window 1 has not merged to `main` and has not deployed the branch. Window 7 owns the final integration decision. Do not deploy or apply migrations to production as part of integration verification. The user’s separate financial boundary remains in force.


## Window 6 — Testing, Monitoring & Production Readiness handoff

**Branch:** `feat/stage-6-opportunity-worker-observability`  
**Scope:** The existing Trading opportunities worker previously caught each customer's exception and logged only its class, then returned a normal batch result. The outer monitored cycle therefore recorded a healthy heartbeat despite partial customer failures.

### Changes
- `runAutoTradeCycle` now returns aggregate `customerFailures` while continuing the remaining customer batch.
- The existing `runMonitoredWorkerCycle` accepts an optional result classifier and records partial outcomes as degraded.
- The Trading opportunities worker uses that classifier and records a bounded aggregate message with the number of failed customer sub-cycles.
- `CUSTOMER_CYCLE_FAILURES` is a stable sanitized diagnostic code.
- Contract tests cover aggregation and degraded classification.
- No schema, migration, endpoint, customer-facing API or financial behavior changes.

### Integration checks for Window 7
1. Reconcile the `server/db.ts` edit with Workstream 1's generation changes.
2. Reconcile `server/_core/index.ts` and `server/_core/workerHealth.ts` with other worker/runtime edits.
3. Run exact-final-head `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, `pnpm build`, and the existing disposable MySQL 8.4 / MariaDB 11.4 worker integration suites.
4. Confirm a failed customer sub-cycle increments only the aggregate count, does not stop processing subsequent customers, and marks the durable Trading opportunities worker as degraded.
5. Confirm no customer identifier or raw exception is persisted in the health record.
6. Preserve existing worker retry/backoff, idempotency, lease fencing, graceful shutdown and best-effort monitor persistence.
7. Do not claim Blitz/staging or production acceptance from CI alone.

No database migration or production deployment is part of Window 6. Window 7 retains final integration and merge authority.
