# Window 7 — Integration Handoff

**Updated:** 2026-11-04  
**Window 3 branch:** workstream/3-automatic-opportunity-engine  
**Base dependency:** Window 1 generation implementation from PR #278, branch feat/automatic-template-opportunities, base head b7567f4ae2b1c99342014925c5a667d1896fba21. Also reconcile the separate Window 1 company-selection contract branch feat/workstream-1-company-catalogue-rotation-contract.

## Window 3 implementation handoff

Window 3 extends the existing generator with a missing company-neutral path required by Window 1's new company-selection contract.

### Exact changes

- server/modules/opportunity-generation-template.ts: adds createUnattributedCatalogueOpportunityTemplate; generation terms allow a nullable company reference while admin-managed templates still require a valid Logo ID. Company-neutral inputs are now checked against canonical sentinel metadata and reject extra fields or attempts to substitute a company identity.
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
- Window 5 admin settings PR #285: `workstream/window-5-admin-trade-settings-persistence` at `65557fa20f1beca9d4dd2fa437e02502fa8bab44`. Its current changed files are client admin components and client contract tests only; it does not change the server router, server/db.ts or migrations. Verify the existing save/read-back APIs still match the revised controls, and keep generation-owned persistence unchanged.

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


## Window 3 — package-policy audit findings (2026-11-04)

Migration history establishes the following without requiring a production database read:

- `0069_trading_package_activation.sql` defines the canonical 16-package catalogue.
- `0081_trading_tier_policy_alignment.sql` inserts a policy row for each existing package whose exact package name has no policy row. It preserves existing policy rows and their saved values.
- `0089_trading_popup_policy_ranges.sql` adds explicit payout/duration bounds and disables policy rows whose bounds are absent or invalid. It does not assign administrator-approved payout or duration terms to the 16 packages.
- Window 2's resolver preserves existing saved values on partial edits. Its new-package defaults are not a runtime fallback for existing tiers.
- Window 3 selects a policy by exact `packages.name = opportunity_package_policies.packageName` match and fails closed when saved payout/duration terms are invalid. It does not synthesize missing terms.

### Required read-only deployment audit

Run this against a read-only connection to the target database before enabling customer delivery. It reports each existing package and its matching saved policy without modifying data:

```sql
SELECT
  p.id AS package_id,
  p.name AS package_name,
  p.enabled AS package_enabled,
  opp.id AS policy_id,
  opp.policyVersion AS policy_version,
  opp.minimumTradeUnits,
  opp.maximumTradeUnits,
  opp.minimumPayoutRateBps,
  opp.maximumPayoutRateBps,
  opp.minimumTradeDurationSeconds,
  opp.maximumTradeDurationSeconds,
  opp.maxPendingDeliveries,
  CASE
    WHEN opp.id IS NULL THEN 'MISSING_POLICY'
    WHEN p.enabled <> 1 THEN 'PACKAGE_DISABLED'
    WHEN opp.policyVersion IS NULL OR opp.policyVersion < 1 THEN 'INVALID_POLICY_VERSION'
    WHEN opp.minimumTradeUnits IS NULL OR opp.maximumTradeUnits IS NULL
      OR opp.minimumTradeUnits < 1 OR opp.maximumTradeUnits < opp.minimumTradeUnits THEN 'INVALID_CAPITAL_BOUNDS'
    WHEN opp.minimumPayoutRateBps IS NULL OR opp.maximumPayoutRateBps IS NULL
      OR opp.minimumPayoutRateBps < 1 OR opp.maximumPayoutRateBps < opp.minimumPayoutRateBps
      OR opp.maximumPayoutRateBps > 5000 THEN 'INVALID_PAYOUT_BOUNDS'
    WHEN opp.minimumTradeDurationSeconds IS NULL OR opp.maximumTradeDurationSeconds IS NULL
      OR opp.minimumTradeDurationSeconds < 10
      OR opp.maximumTradeDurationSeconds < opp.minimumTradeDurationSeconds
      OR opp.maximumTradeDurationSeconds > 86400 THEN 'INVALID_DURATION_BOUNDS'
    WHEN opp.maxPendingDeliveries < 1 THEN 'PENDING_DELIVERY_LIMIT_DISABLED'
    ELSE 'TERMS_READY'
  END AS audit_status
FROM packages AS p
LEFT JOIN opportunity_package_policies AS opp
  ON opp.packageName = p.name
ORDER BY p.id;
```

A package marked `TERMS_READY` has structurally valid saved terms only. It does not prove that an eligible customer subscription exists, global delivery masters are enabled, a worker is healthy, or a popup is visible in the hosted browser. Do not change policy rows based only on this report; missing or invalid payout/duration terms require an administrator-approved value for that package.

### Stage 2 status

- Source-level migration and generator contract reviewed.
- A Window 3 regression test now locks the 16-package seed count, missing-policy row backfill, explicit invalid-term disablement, exact package-name policy join, and no runtime-default fallback.
- Live package/policy counts and values remain unverified until this read-only query is run against the target database.

## Window 3 — required-correction review (2026-11-04)

**Implementation branch:** `workstream/3-automatic-opportunity-engine`  
**PR:** [#286](https://github.com/stannmoye/Arbitrade_platform/pull/286), stacked on Window 1 generation foundation PR #278.  
**Do not merge independently. Window 7 owns final integration and approval.**

### Daily quota enforcement added

The generator now reads the active subscription's immutable `termsSnapshotJson`, the package's `opportunitiesPerDay`/`maxPopupsPerDay`, and the exact-name package policy's `maxPopupsPerDay`/`dailyPopupTarget`. It follows the existing delivery-cap semantics: a positive administrator/package cap narrows the entitlement; zero means no additional cap; a positive daily target narrows the entitlement. While holding the existing per-customer generation lock and database transaction, it counts that customer's existing generated assignments for both the selected subscription and package within the active quota window. Exhausted or zero-quota candidates are skipped before company rotation is advanced. The resulting assignment snapshot records the applied customer quota, package quota and quota-window start.

The check is generation-side. It does not depend on customer UI or delivery admission. The per-customer lock serializes concurrent cycles for the same customer; the count and subsequent offer/assignment inserts share one transaction.

### Rotation rollback and concurrency

Rotation cursor updates, generated offer insertion and assignment snapshot insertion remain inside the same `db.transaction` callback. A thrown persistence error aborts that transaction, so the cursor write is expected to roll back with the offer/assignment. The customer-scoped `app_settings` row lock serializes concurrent generation attempts for that customer. A source-level regression assertion now checks this transaction boundary and ordering.

**Not yet proven:** a genuine MySQL/MariaDB failure-injection test must demonstrate that a forced offer/assignment insert failure leaves the rotation cursor unchanged and that a subsequent retry reuses the next valid allocation. Source inspection is not a substitute for this database test.

### Catalogue and delivery boundaries

- Generation continues to use Window 1's approved brand catalogue and does not require ticker, symbol, exchange listing or market quote fields. The latest Window 1 loader correction is on PR #283; Window 7 must reconcile that exact branch into the integrated ancestry before final validation.
- Window 3 does not replace Window 4's delivery worker, lease, retry, acknowledgement or customer rendering implementation. The existing `deliveryLeaseToken` is passed through the delivery response and acknowledgement path. Verify on the final integrated SHA that every `in_progress` response contains a non-empty server-issued lease token and the customer returns that exact token for `received`/`rendered` acknowledgements.
- Financial execution remains separate. The generation transaction writes informational offers and generation assignments only. Preserve the hard-disabled `AUTOMATIC_FINANCIAL_EXECUTION_ENABLED` guard and do not introduce allocation, wallet/ledger mutation, transfer or unattended settlement.

### Database integration evidence and remaining blocker

A source-level test was added for quota selection/counting and for the shared transaction containing quota checks, rotation state, offer insertion and immutable assignment snapshot. These tests have **not yet been executed**.

No genuine MySQL 8.4 or MariaDB 11.4 generation integration test has been run in this environment. Therefore the following remain unverified and are explicit handover blockers:
- customer/package eligibility and independent package policy selection against real schemas;
- catalogue company selection on both database engines;
- repeated and concurrent worker idempotency;
- forced transaction rollback and rotation recovery;
- per-subscription and per-package daily quota boundaries under concurrent workers;
- immutable snapshot persistence and replay;
- migration application on both database engines.

Do not report these checks as passed. Window 7 must run disposable-engine integrations on the exact integrated SHA and attach the logs/results. No production database migration or mutation is authorized by this handoff.
