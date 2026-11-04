# Window 7 — Integration Handoff

**Prepared by:** Window 3 — Automatic Opportunity Generation  
**Prepared:** 2026-11-04  
**Workstream 3 PR:** [#278](https://github.com/stannmoye/Arbitrade_platform/pull/278)  
**Branch:** `feat/automatic-template-opportunities`  
**Latest verified code/test SHA (before this documentation-only correction):** `26bc9054ab0b4f43617131b3aa2290d9a12479ed`

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

The disposable-database regression scenario exercises the production generator through `listCustomerOpportunities` on MySQL 8.4 and MariaDB 11.4:
- **Exhausted first package:** exactly three assignments consume the first package's cap; the second subscription has one available slot. Generation skips the first entitlement, assigns to the second subscription, stores its subscription and quota snapshot, and leaves assignment counts at three and one.
- **All packages exhausted:** after closing the generated offer to prevent the idempotent-reuse path from masking quota selection, both entitlements have zero capacity. The worker creates no open offer, adds no assignment, and does not advance either package's rotation cursor.
- **Both packages available:** capacity is restored for both candidates. Existing earliest-expiry ordering selects the first subscription; both the offer and assignment persist its exact subscription ID and the saved entitlement quota.
- **Concurrent generation and retry:** concurrent worker cycles resolve to the same offer, create exactly one assignment/quota slot, and advance rotation once. A repeated worker cycle reuses the existing offer, preserves its idempotency key, terms snapshot, payout rate and duration, and creates no assignment.

The second subscription's start and expiry timestamps are anchored to the test's captured `now`, not wall-clock time at fixture insertion, so slower database setup cannot make it appear not-yet-active. Assertions use the actual disposable database and production quota-accounting path rather than a standalone helper.

## Window 3 — Failed-integration diagnosis and rollback test correction

The failed Trading opportunity worker run on reviewed commit `bff7124560a9cb1b2f637f5d6a5b47fbaea1a496` (run [41782014205](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41782014205)) failed on both MySQL 8.4 and MariaDB 11.4. In both engine jobs, the test deliberately raised `forced_rotation_generation_failure` at the generated-offer INSERT, but the integration script did not catch/assert that expected exception. Node therefore exited before the rollback assertions ran. This was a test-harness defect, not a MySQL/MariaDB transaction incompatibility.

The regression now explicitly captures and asserts the nested database error chain contains `forced_rotation_generation_failure`, then retains the checks that the rotation cursor is unchanged and no partial offer remains. It drops the trigger and retries generation; the successful retry must advance the durable rotation counter exactly once. The failure injection and rollback assertions are retained, not skipped or relaxed.

On later test commit `a844e517ced41049b0167ec70d4a0a62239caed6`, the MySQL job exposed a separate fixture issue: `formulaCooling` was true and `formulaReadyAt` was one second ahead, so generation never reached subscription selection. The fixture had left a post-completion interval active; MySQL's second-precision timestamp boundary made that scheduling gate observable. Commit `69da1a6052435795ab27c0d629d8dad009cf2f59` disables all cadence intervals in the isolated rollback scenario. It does not weaken quota assertions. The deterministic clock correction from commit `78244cde599201ccc32014eea3a6f9996fee6907` remains in place.

### Exact-head CI evidence — latest code/test SHA before this documentation-only correction

All ten required workflow groups passed on exact code/test SHA `26bc9054ab0b4f43617131b3aa2290d9a12479ed`:
- [Build and test production source — run 41788526517](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526517) — TypeScript, 148 test files / 1,161 tests passed (5 files / 27 tests skipped), 31 additional test files / 176 tests passed, production build and customer-portal real-browser recovery checks.
- [Trading opportunity worker concurrency and recovery integration — run 41788526516](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526516) — MySQL 8.4 and MariaDB 11.4 both passed, including quota selection, all-exhausted, both-available, retry, concurrency and rollback coverage.
- [Trading company rotation durable allocation database integration — run 41788526528](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526528) — passed.
- [Trading tier qualification database integration — run 41788526478](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526478) — passed.
- [Trading settlement reconciliation database integration — run 41788526483](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526483) — passed.
- [Trading administrator wallet idempotency integration — run 41788526547](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526547) — passed.
- [Verify Arbitrade trading recovery changes — run 41788526474](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526474) — passed.
- [Mining regression checks — run 41788526555](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526555) — passed.
- [Verify application — run 41788526482](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526482) — passed.
- [Installer validation — run 41788526479](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526479) — passed.

### Earlier code/test evidence — superseded

The preceding code/test SHA `0a618706b2cdab2778ca6ef95c70f7dde55564d2` also passed its workflow set ([worker integration run 41787906677](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41787906677)); it is older than `26bc9054ab0b4f43617131b3aa2290d9a12479ed` and is not the latest code/test evidence. The exact-head links above certify only `26bc9054ab0b4f43617131b3aa2290d9a12479ed`.

This is a documentation-only ownership correction after the verified code/test SHA; no application, migration or test code is changed here. The workflow evidence above is not represented as running on the later documentation-only commit. Window 7 should review that documentation commit separately. No authenticated Blitz production acceptance or deployment is claimed.
