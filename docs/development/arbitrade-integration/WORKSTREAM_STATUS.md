# Workstream Status

**Last inspected:** 2026-11-04  
**Repository main:** `0f1fafba3bba30cfd7d2605bf6aeb8387fa2664b`  
**Workstream 1 branch:** `feat/automatic-template-opportunities`  
**Workstream 1 latest branch tip inspected:** `b7567f4ae2b1c99342014925c5a667d1896fba21`  
**Pull request:** [#278](https://github.com/stannmoye/Arbitrade_platform/pull/278) — open, draft, not merged.

## Window 1 — Automatic Opportunity Generation

**Implementation state:** Implemented on PR #278; ready for Window 7 integration review.

Observed scope in the branch:
- Customer-specific generation from the existing approved company catalogue without a one-template-per-company prerequisite.
- Brand-only catalogue-native identity with no fabricated ticker or venue.
- Optional approved template enrichment for the selected company.
- Package-specific persisted capital, payout-rate and duration bounds.
- Durable customer/package generation lock, unique generation key, assignment and package/company snapshots.
- Existing company rotation integration and delivery lifecycle handoff.
- Admin generation control, batch/assignment monitoring and audit/version checks.
- Migrations 0103, 0104 and 0105.

### Exact-head GitHub Actions evidence

At code head `aa27d664475eaf40dd4ff3d3414b267e569484e9`, the repository returned 10 pull-request workflow runs, all `completed/success`. At code/test head `2629baa75c1644b3771511a4b085b0085eca79fb`, 24 of 25 checks completed successfully with no failures; the remaining local-preview customer-portal browser recovery check was still installing Playwright Chromium. The current PR head `b7567f4ae2b1c99342014925c5a667d1896fba21` adds only a documentation refresh and has no new workflow runs recorded.

1. Trading settlement reconciliation database integration
2. Trading tier qualification database integration
3. Trading administrator wallet idempotency integration
4. Trading company rotation durable allocation database integration
5. Trading opportunity worker concurrency and recovery integration
6. Verify Arbitrade trading recovery changes
7. Mining regression checks
8. Verify application
9. Installer validation
10. Build and test production source

This is exact-head CI evidence for the named code SHA, not hosted acceptance. No authenticated Blitz/staging browser acceptance or production deployment is established.

## Not established by this status

- No authenticated customer/admin browser acceptance against Blitz or another deployed environment is claimed.
- No production database migration or deployment is claimed.
- No real-money execution, automatic customer fund allocation, or unattended financial settlement is enabled by this workstream.
- A green workflow result is not proof that the hosted customer portal is currently showing pop-ups.

## Window 4 — Opportunity Delivery & Customer Portal

**Implementation state:** Existing delivery lifecycle and customer popup UI are reused; lease-gated first-render compatibility is present on Window 1 PR #278 and is covered by Window 4 regression tests in `feat/stage4-opportunity-delivery-contract`.

Observed existing owners/paths:
- `server/opportunityLifecycle.ts`: customer-scoped dispatch claim, lease fencing, retry and acknowledgement.
- `server/modules/opportunity-delivery-lifecycle.ts` and `server/modules/opportunity-delivery-retry-policy.ts`: bounded delivery state machine and single retry-policy parser.
- `server/db.ts`: eligibility, durable popup admission, customer read, and lease-token propagation.
- `server/routers.ts`: protected customer read and acknowledgement procedures.
- `client/src/customer-popup-eligibility.ts` and `client/src/App.tsx`: customer display eligibility and persistent popup UI.
- `scripts/trading-popup-delivery.integration.ts`: disposable-database delivery, idempotency and acknowledgement coverage.

**Critical handoff contract:** `in_progress` is accepted for first render only when a non-empty server-issued lease token accompanies the event. The browser must acknowledge `received` and `rendered` with that same token. Window 4 adds regression assertions; it does not duplicate Window 1’s helper correction or introduce a new worker/table/API.

**Database/API changes:** No new schema, migration or endpoint. Existing `customer.opportunities`, `customer.popupDeliveryStatus` and popup lifecycle routes remain authoritative.

**Validation status:** Regression changes are committed in this branch; exact-head CI and disposable MySQL/MariaDB/browser execution must be recorded after the dependent PR is opened. Blitz authenticated acceptance remains outstanding and is not claimed.

**Dependency:** PR #278 must be integrated before this dependent PR can be merged into `main`.

## Window 6 — Testing, Monitoring & Production Readiness

- **Branch:** `feat/stage-6-opportunity-worker-observability`
- **PR:** [#279](https://github.com/stannmoye/Arbitrade_platform/pull/279) — open, draft, not merged.
- **Observed head:** `962ae780e62e44ded236454040302afe9c5241e4`.
- **Implementation:** Partial customer sub-cycle failures are surfaced through the existing worker cycle result and mark the Trading opportunities worker degraded. Window 7 adapted this to the newer shared generation implementation by reusing its existing `failures` counter and exposing it as aggregate `customerFailures`; it did not add a second counter.
- **Monitoring compatibility:** The existing worker-health registry remains authoritative. The older PR #261 branch is based on an older mainline checkpoint and cannot be merged wholesale; its current-versus-historical instance distinction has been ported into the newer worker-health summary, System Diagnostics and admin table/export surfaces.
- **Database/API:** No Window 6 migration, new table, endpoint or customer API. Existing migration 0084 and admin-only monitoring paths are reused.
- **Branch CI evidence:** 10 GitHub Actions workflows on PR #279 head `962ae780e62e44ded236454040302afe9c5241e4` returned completed/success. This is evidence for that branch head only, not for the combined Window 7 branch.
- **Integrated validation:** Not yet executed. Exact final-head tests, type check, build, database integrations and browser acceptance remain required. No Blitz acceptance, production migration or deployment is claimed.

## Windows 2, 3 and 5

Status is pending each assigned owner’s own branch, commit, PR, changed-file list and exact-head test evidence. Their names and boundaries are not inferred from repository file changes.
