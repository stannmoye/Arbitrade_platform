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


## Window 2 — Package policy handoff

- Pull request: [#284](https://github.com/stannmoye/Arbitrade_platform/pull/284) (open, draft, unmerged).
- PR head at creation: `92224d32dd85bb8249f094df1e8dcd8afb815a0d`; the current PR head may advance with this handoff-document update.
- Branch: `feat/window-2-package-opportunity-policy-contract`.
- Baseline: `0f1fafba3bba30cfd7d2605bf6aeb8387fa2664b`.
- Implementation head at handoff preparation: `4c01348e193f9acd73c1d1f930fa15242948bc5f`.
- Reuses the existing `opportunity_package_policies` store; no schema or migration change.
- Canonical policy contract/defaults/patch allowlist: `server/modules/package-opportunity-policy.ts`.
- Persistence integration: `server/db.ts` now uses the typed patch contract, central allowlist and package-name-safe policy resolver. Existing row locking, validation, policy version increments, audit writes and package rename transaction remain in place.
- Tests: `server/package-opportunity-policy.contract.test.ts` covers defaults, partial update preservation, cross-package isolation and immutable/global field exclusions. `server/trading-package-eligibility.contract.test.ts` was updated to assert the centralized defaults/resolver instead of the removed inline constant/assignment. Tests have not been executed locally; corrected-head CI is queued/in progress and must pass before integration.

### Window 7 integration checks

1. Rebase/compare this branch with Window 1 PR #278 before integrating because both modify `server/db.ts`; reconcile import and helper changes, never replace the whole file.
2. Confirm Window 1 generation reads the same `opportunity_package_policies` row for each selected package and snapshots the matching `policyVersion` and package ID.
3. Verify all 16 existing package rows remain unchanged except explicitly intended edits; verify each has exactly one policy row and package rename keeps the row attached.
4. Run package policy tests and authenticated MySQL 8.4/MariaDB 11.4 persistence integration, including per-package divergent bounds, omitted-field preservation, concurrent partial updates, invalid patches and version conflict behaviour.
5. Confirm Window 4 delivery consumes the same saved package-specific daily cap, schedule and pending limit; no second delivery policy or worker is introduced.
6. Verify no global control is patchable through `updatePackagePolicies`; automatic financial execution remains hard-disabled.
7. Run exact integrated-head TypeScript, full tests, production build, migration validation and authenticated browser acceptance.
