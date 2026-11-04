# Window 7 — Integration Handoff

**Prepared by:** Window 1 — Automatic Opportunity Generation  
**Prepared:** 2026-11-04  
**Workstream 1 PR:** [#278](https://github.com/stannmoye/Arbitrade_platform/pull/278)  
**Branch:** `feat/automatic-template-opportunities`  
**Code head inspected:** `2629baa75c1644b3771511a4b085b0085eca79fb`

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


## Company rotation transaction safety — Stage 1 correction

At Window 3's Stage 1 correction, generation was found to persist the selected company rotation cursor before currency resolution and before the opportunity/assignment inserts. A later non-exceptional early return (for example, no enabled currency row) could therefore commit the cursor without a corresponding generated opportunity.

The generator now keeps the customer/package rotation row locked while selecting the company, retains the proposed next state in memory, and writes that state only after both the opportunity row and immutable generation assignment have been inserted in the same transaction. A rollback therefore restores the prior cursor. The transaction retries up to four times for MySQL/MariaDB deadlock and lock-wait-timeout errors; each retry starts after the failed transaction has rolled back.

Regression coverage added:
- Contract assertion that the rotation update occurs after the offer and assignment inserts.
- Disposable MySQL 8.4 / MariaDB 11.4 integration scenario injecting a SQL failure at opportunity insertion, asserting the cursor and opportunity count remain unchanged, then retrying successfully.
- Concurrent same-customer worker cycles asserting both calls reuse the same opportunity and advance the cursor only once.

The integration scenario is part of `scripts/trading-popup-delivery.integration.ts` and is guarded to refuse non-loopback or non-disposable database names. Results must be evaluated from GitHub Actions for the exact final commit; source assertions are not database test evidence.
