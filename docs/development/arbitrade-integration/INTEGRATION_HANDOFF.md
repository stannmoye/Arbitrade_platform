# Window 7 — Integration Handoff

**Prepared by:** Window 3 — Automatic Opportunity Generation  
**Prepared:** 2026-11-04  
**Workstream 3 PR:** [#278](https://github.com/stannmoye/Arbitrade_platform/pull/278)  
**Branch:** `feat/automatic-template-opportunities`  
**Code head inspected:** `78244cde599201ccc32014eea3a6f9996fee6907`

## What Window 3 hands off

This branch owns the Window 3 automatic opportunity-generation implementation. It extends the existing customer entitlement, persisted package-policy, approved company-catalogue, company-rotation and opportunity-delivery infrastructure; it does not introduce a second generator or delivery lifecycle. Manual company templates remain optional display-term enrichment.

Window 3 owns candidate subscription selection, per-subscription and per-package daily quota enforcement, the generation transaction, immutable package/company snapshots, generation idempotency, rotation commit/rollback safety, and the corresponding MySQL 8.4 / MariaDB 11.4 integration coverage. Window 1 retains ownership of the company catalogue and its approved-company rotation contract; Window 4 retains ownership of delivery admission, leases, acknowledgements and customer rendering.

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

PR #278 (Window 3) remains open, draft and unmerged; this handoff does not authorize a merge or deployment. Window 7 owns the independent integration decision. Do not deploy or apply migrations to production as part of integration verification. The user’s separate financial boundary remains in force.


## Window 3 — Company rotation transaction safety and rollback regression

At Window 3's Stage 1 correction, generation was found to persist the selected company rotation cursor before currency resolution and before the opportunity/assignment inserts. A later non-exceptional early return (for example, no enabled currency row) could therefore commit the cursor without a corresponding generated opportunity.

The generator now keeps the customer/package rotation row locked while selecting the company, retains the proposed next state in memory, and writes that state only after both the opportunity row and immutable generation assignment have been inserted in the same transaction. A rollback therefore restores the prior cursor. The transaction retries up to four times for MySQL/MariaDB deadlock and lock-wait-timeout errors; each retry starts after the failed transaction has rolled back.

Regression coverage added:
- Contract assertion that the rotation update occurs after the offer and assignment inserts.
- Disposable MySQL 8.4 / MariaDB 11.4 integration scenario injecting a SQL failure at opportunity insertion, asserting the cursor and opportunity count remain unchanged, then retrying successfully.
- Concurrent same-customer worker cycles asserting both calls reuse the same opportunity and advance the cursor only once.

The integration scenario is part of `scripts/trading-popup-delivery.integration.ts` and is guarded to refuse non-loopback or non-disposable database names. Results must be evaluated from GitHub Actions for the exact final commit; source assertions are not database test evidence.


## Window 3 — Per-package quota selection correction

The generator now evaluates quota availability for every eligible subscription before selecting a candidate. The selection occurs inside the existing per-customer generation transaction and lock.

For each candidate, it:
- Reads the saved subscription entitlement quota and package daily allowance.
- Applies the persisted package-policy popup cap and daily target.
- Resolves the candidate package's own calendar-day or rolling-24-hour quota window.
- Counts generation assignments for both the exact subscription and the customer/package pair in that window.
- Skips the candidate when either its subscription entitlement or package-wide cap is exhausted, then continues to the next eligible subscription.
- Persists the selected entitlement quota, effective package quota and quota-window start in the immutable assignment snapshot.

The disposable-database regression scenario has multiple active subscriptions across two packages. It establishes exactly three assignments against the first package and sets its effective daily cap to three, while a second package has a separate one-assignment allowance. The second subscription's start and expiry timestamps are anchored to the test's captured `now` value, not wall-clock time at fixture insertion, so slower MySQL setup cannot make the subscription appear not-yet-active. The next worker cycle must skip the exhausted first package, persist its new assignment against the second package/subscription, record both selected limits as one in the immutable snapshot, leave the first package at three assignments, and give the second package exactly one assignment. This verifies actual database selection behavior rather than only source text or a helper function.

## Window 3 — Failed-integration diagnosis and rollback test correction

The failing Trading opportunity worker concurrency and recovery integration jobs on MySQL 8.4 and MariaDB 11.4 both reached the deliberately injected forced_rotation_generation_failure trigger at the generated-offer INSERT. The generation transaction raised the expected database exception and rolled back. The integration script did not catch/assert that deliberate exception, so Node exited before the cursor and partial-write rollback assertions could run.

The regression now explicitly captures and asserts the nested database error chain contains forced_rotation_generation_failure, then retains the existing checks that the rotation cursor is unchanged and no partial offer remains. It drops the trigger and retries generation; the successful retry must advance the durable rotation counter exactly once. The failure injection and rollback assertions are retained, not skipped or relaxed.

The original quota regression fixture was made deterministic in commit `78244cde599201ccc32014eea3a6f9996fee6907`: its second subscription now uses the integration's captured clock. On that exact commit, the opportunity worker concurrency and recovery integration passed on both MySQL 8.4 and MariaDB 11.4 ([run 41786743846](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41786743846)). The complete required workflow set is being rerun against the final documentation commit; use the final exact-head workflow evidence rather than earlier runs. These CI results do not constitute authenticated Blitz staging acceptance or production deployment.
