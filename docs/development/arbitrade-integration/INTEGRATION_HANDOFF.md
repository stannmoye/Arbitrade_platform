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


## Window 4 — Opportunity Delivery & Customer Portal handoff

- **Dependent implementation branch:** `feat/stage4-opportunity-delivery-contract` (based on Window 1 PR #278 head `6d6d09ba1a001c9c50e54f46a0d58dad83daff16`).
- Window 4 reuses the existing durable delivery lifecycle and customer API/UI. It does not add a competing worker, queue, schema, migration, endpoint, retry setting or financial side effect.
- The customer first-render handoff requires the server-issued dispatch lease token: `queued` is claimed as `in_progress`, the customer response carries `deliveryLeaseToken`, the UI accepts `in_progress` only with a non-empty token, and `received`/`rendered` acknowledgements return the same token.
- Regression tests cover lease-gated client eligibility, propagation of the lease from the existing server dispatch claim, and acknowledgement with the same token.
- A follow-on failure-recovery fix handles the case where the browser acknowledges `received` but reports a rendering failure before `rendered`: the persisted state is passed to the retry helper, and `received` can transition to `retry_wait` or terminal `failed` according to the saved retry policy.
- Regression coverage includes temporary retry after a received acknowledgement and permanent failure without retry. Unit tests and database/browser acceptance must still be run at the final integrated head.
- Pending-capacity admission now returns a structured `PENDING_DELIVERY_LIMIT` reason instead of silently disappearing. Expected capacity skips are distinguished from `PERSISTENCE_NOT_CONFIRMED`, which remains a hard persistence error.
- Delivery-prefixed diagnostics are stored in the existing `opportunity_generation_assignments.failureReason` field for generated opportunities. Covered reasons include global pause, schedule cooldown, daily quota, visible capacity, burst limit, pending limit and persistence failure; successful delivery clears the previous delivery diagnostic.
- The customer read's persistence-ID assertion was corrected so expected pending-capacity rejections are excluded only after missing persistence IDs have been checked.
- The disposable-database integration script now asserts that a second queued popup is rejected at a pending limit of one and returns the exact structured skip reason. This integration test is committed but has not yet been run.
- **Merge order:** integrate Window 1 PR #278 first, then rebase/merge the Window 4 dependent PR. Do not merge the Window 4 branch directly to `main` while its base branch is unmerged.
- **No migration:** Window 4 adds no database schema changes. Window 7 must run the existing popup delivery integration against the final combined migration chain on disposable MySQL 8.4 and MariaDB 11.4, plus authenticated browser acceptance for first display, refresh recovery, multi-tab locking, expiry and dismissal.
- No Blitz deployment, production migration, financial execution, customer-fund allocation, or settlement is included in this handoff.
