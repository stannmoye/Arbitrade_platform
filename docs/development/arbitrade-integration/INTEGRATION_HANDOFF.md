# Window 7 — Integration Handoff

**Prepared by:** Window 1 — Automatic Opportunity Generation  
**Prepared:** 2026-11-04  
**Workstream 1 PR:** [#278](https://github.com/stannmoye/Arbitrade_platform/pull/278)  
**Branch:** `feat/automatic-template-opportunities`  
**Latest PR head:** `b7567f4ae2b1c99342014925c5a667d1896fba21`  
**Latest code/test head with recorded CI:** `2629baa75c1644b3771511a4b085b0085eca79fb`

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
2. Obtain and record the exact Window 2, 3 and 5 ownership rows and PR heads. Window 6 is recorded below; its integration is staged in the shared branch.
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


## Window 4 — Opportunity Delivery & Customer Portal handoff

- **Dependent implementation branch:** `feat/stage4-opportunity-delivery-contract` (based on Window 1 PR #278 head `6d6d09ba1a001c9c50e54f46a0d58dad83daff16`).
- Window 4 reuses the existing durable delivery lifecycle and customer API/UI. It does not add a competing worker, queue, schema, migration, endpoint, retry setting or financial side effect.
- The customer first-render handoff requires the server-issued dispatch lease token: `queued` is claimed as `in_progress`, the customer response carries `deliveryLeaseToken`, the UI accepts `in_progress` only with a non-empty token, and `received`/`rendered` acknowledgements return the same token.
- Regression tests cover lease-gated client eligibility, propagation of the lease from the existing server dispatch claim, and acknowledgement with the same token.
- **Merge order:** integrate Window 1 PR #278 first, then rebase/merge the Window 4 dependent PR. Do not merge the Window 4 branch directly to `main` while its base branch is unmerged.
- **No migration:** Window 4 adds no database schema changes. Window 7 must run the existing popup delivery integration against the final combined migration chain on disposable MySQL 8.4 and MariaDB 11.4, plus authenticated browser acceptance for first display, refresh recovery, multi-tab locking, expiry and dismissal.
- No Blitz deployment, production migration, financial execution, customer-fund allocation, or settlement is included in this handoff.


## Window 6 — Testing, Monitoring & Production Readiness handoff

**Branch:** `feat/stage-6-opportunity-worker-observability`  
**PR:** [#279](https://github.com/stannmoye/Arbitrade_platform/pull/279)  
**Inspected head:** `962ae780e62e44ded236454040302afe9c5241e4`

### Integrated behaviour

- Reuses the existing customer-cycle `failures` counter in `runAutoTradeCycle` and exposes it to monitoring as aggregate `customerFailures`.
- The existing `runMonitoredWorkerCycle` accepts an optional result classifier and records partial outcomes as degraded.
- The Trading opportunities worker uses that classifier and records a bounded aggregate message with the failed-customer count.
- `CUSTOMER_CYCLE_FAILURES` is a stable sanitized diagnostic code.
- Current worker rows are explicitly marked using the existing process instance ID. System Diagnostics classifies only current-process rows; historical rows remain visible in the admin UI and exports.
- No new schema, migration, endpoint, customer-facing API or financial behaviour is introduced.

### Integration checks for Window 7

1. Verify the existing failure counter continues to process later customers and is exposed as aggregate `customerFailures` without adding a competing counter.
2. Verify partial customer failure persists a degraded worker-health status even when the outer worker cycle resolves.
3. Verify aggregate health messages contain no customer identifiers, account details or raw exception text.
4. Verify current-process degraded and not-started workers remain actionable while historical stale rows do not inflate live diagnostics.
5. Preserve existing timer, bounded batch, retry/backoff, idempotency, lease fencing, graceful shutdown and best-effort monitor persistence.
6. Run exact-final-head unit/contract tests, `pnpm check`, `pnpm test`, `pnpm build`, disposable MySQL 8.4 and MariaDB 11.4 integrations, and authenticated staging browser acceptance.
7. Do not claim Blitz/staging or production acceptance from CI alone.

### Existing PR #261 coordination

PR #261's worker-health history correction was based on an older mainline SHA and diverges from the current integration checkpoint. Window 7 did not merge that stale branch. The current-versus-historical behavior was reviewed and adapted to the newer worker-health data shape so it preserves existing opportunity-delivery diagnostics and safe error-code fields. The adapted changes remain unvalidated until CI runs on the combined integration head.
