# Window 7 — Integration Handoff

**Updated:** 2026-11-04  
**Window 3 branch:** workstream/3-automatic-opportunity-engine  
**Base dependency:** Window 1 generation implementation from PR #278, branch feat/automatic-template-opportunities, base head b7567f4ae2b1c99342014925c5a667d1896fba21. Also reconcile the separate Window 1 company-selection contract branch feat/workstream-1-company-catalogue-rotation-contract.

## Window 3 implementation handoff

Window 3 extends the existing generator with a missing company-neutral path required by Window 1's new company-selection contract.

### Exact changes

- server/modules/opportunity-generation-template.ts: adds createUnattributedCatalogueOpportunityTemplate; generation terms allow a nullable company reference while admin-managed templates still require a valid Logo ID.
- server/db.ts: no longer aborts generation when the approved company pool is empty; skips rotation and template lookup in that case; persists null company identity and avoids resolving null IDs in the admin monitor.
- drizzle/schema.ts: makes only opportunity_generation_assignments.companyReferenceId nullable; the company template table remains strict.
- drizzle/0106_company_neutral_opportunity_assignments.sql: forward migration to align the assignment column with the company-neutral contract.
- drizzle/meta/_journal.json: registers migration 0106 after 0105.
- server/modules/opportunity-generation-template.test.ts and server/opportunity-generation.contract.test.ts: cover neutral term selection and nullable persistence.

### Integration instructions

1. Integrate the Window 1 company contract and Window 2 package-policy interface without creating duplicate selectors or policy services.
2. Review server/db.ts against Window 2 package-policy changes and any Window 6 worker-health changes once that window's exact assignment/branch is confirmed; preserve their logic.
3. Keep Window 4's existing delivery lifecycle as the sole delivery owner. A company-neutral offer must pass through the same existing delivery lifecycle.
4. Verify generated offer and assignment rows persist with null company identity when the eligible company pool is empty; verify no template query or rotation cursor mutation occurs for that case.
5. Verify the same generation key is idempotent and package policy terms are unchanged on retry/restart.
6. Validate migration 0106 after 0105 on MySQL 8.4 and MariaDB 11.4, including upgrade with historical non-null assignments.
7. Run pnpm install --frozen-lockfile, pnpm check, focused generation tests, pnpm test, pnpm build, migration validation and existing worker/delivery integrations on the final integrated SHA.
8. Run authenticated customer/admin browser acceptance on a dedicated staging deployment. CI alone does not prove hosted pop-up display.

## Safety and rollout

No wallet/ledger, trade execution, customer-fund allocation, result determination or settlement behavior is added or enabled. No production migration, deployment, or hosted acceptance is claimed by this branch. Window 7 owns final integration and merge authority.


## Cross-workstream branches now identified

- Window 2 policy PR #284: `feat/window-2-package-opportunity-policy-contract` at `3d794c64cd4f542d852ebf97dc18796014a5548b`. The generator already reads persisted policy rows and calls `hasConfiguredTradingOfferPolicy`; Window 2's typed resolver belongs to package-policy writes. Do not call its new-package defaults as runtime fallback.
- Window 4 delivery PR #280: `feat/stage4-opportunity-delivery-contract` at `6981e176d49de86e1f18cba1736aca0ef621de51`, based on `6d6d09ba1a001c9c50e54f46a0d58dad83daff16`, an ancestor of Window 1's current base by two commits. Reconcile its received-state retry fix and lease-token contract into the integrated branch.
- Window 6 observability PR #279: `feat/stage-6-opportunity-worker-observability` at `975b3edea82ec877fad0652fb98a3312e70321e2`. It adds aggregate failure classification to the existing worker-health path. Window 3 now returns `customerFailures` using its already-persisted batch failure count; Window 7 should retain one worker-health registry and one aggregate count.
- Window 5 admin persistence PR #285: `workstream/window-5-admin-trade-settings-persistence` at `65557fa20f1beca9d4dd2fa437e02502fa8bab44`. Its settings UI/API persistence work shares admin and router surfaces but does not replace generation-owned persistence.

## Existing generation architecture investigation

The existing PR #278 implementation was inspected before extending it:

1. **Approved-template dependency:** templates are optional enrichment for the already-selected company. Catalogue-native terms are used when no template exists.
2. **Generation eligibility:** the worker scans active server-assigned auto-tier subscriptions, enabled packages and saved package policies with valid payout/duration bounds. The current package-policy interface still needs reconciliation with Window 2.
3. **Package selection:** the generation transaction locks the customer generator key and selects the first eligible subscription with valid saved terms. A customer with multiple subscriptions currently receives at most one open generated offer at a time.
4. **Company selection:** generation uses the existing approved company spotlight pool and per-customer/package rotation. This branch adds the Window 1 contract's empty-pool case.
5. **Scheduling:** the current customer cycle uses saved delivery interval/randomization and post-completion timing to determine readiness; the scheduled wrapper ticks every 30 seconds. Window 7 must confirm the final Window 2 scheduling contract.
6. **Creation:** offer, assignment and package/company snapshot are written in one transaction. Selected payout/duration are persisted and not rerolled on replay.
7. **Persistence:** generated offers are customer-assigned open opportunity_offers rows; generation provenance is stored in opportunity_generation_assignments and batch state in opportunity_generation_batches.
8. **Duplicate prevention:** per-customer generation lock, reusable-open-offer lookup and unique generation key protect concurrent/repeated cycles.
9. **Recovery:** a durable round-robin customer cursor bounds scans; batches left running beyond five minutes are marked partial/interrupted while successful assignments remain persisted for retry.
10. **APIs and consumers:** existing adminOperations generation control/monitor/template procedures remain the admin surface; customer.opportunities is the authenticated customer read path; opportunityLifecycle.ts remains the delivery owner. No second API or delivery queue is added.

## Observed integration risks requiring Window 7 review

- The current generation call is reached through listCustomerOpportunities during runAutoTradeCycle. The enclosing runTradeCycle scheduler also invokes separate monitored settlement-reconciliation and confirmed-credit-posting workers. Window 3 did not change or activate those financial workers. The existing AUTOMATIC_FINANCIAL_EXECUTION_ENABLED constant is hard-set to false in server/db.ts, and createTrade rejects calls while it is false. Window 7 must preserve that guard and verify generation remains non-financial.
- The legacy market refresh path ensureMarketDrivenOpportunities still reports generationDisabled and creates zero opportunities on the inspected base. It must not be mistaken for the catalogue-native generation worker.
- Generation currently shares some readiness/capacity calculations with customer delivery. Reconcile Window 2's package-policy contract and Window 4's delivery ownership before changing those gates; do not fork the policy or delivery services.
- Window 1's new contract branch and Window 2's final package-policy branch must both be included in Window 7's integration comparison. Window 2's branch was not present in the branch listing during this work.
