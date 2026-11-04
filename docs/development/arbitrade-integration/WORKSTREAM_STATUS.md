# Workstream Status

**Last inspected:** 2026-11-04  
**Repository main:** `0f1fafba3bba30cfd7d2605bf6aeb8387fa2664b`  
**Workstream 1 branch:** `feat/automatic-template-opportunities`  
**Workstream 1 code head inspected:** `2629baa75c1644b3771511a4b085b0085eca79fb`  
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

At code head `aa27d664475eaf40dd4ff3d3414b267e569484e9`, the repository returned 10 pull-request workflow runs, all `completed/success`:

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

This is exact-head CI evidence for that earlier code SHA. On the current code head `2629baa75c1644b3771511a4b085b0085eca79fb`, 24 of 25 GitHub checks have completed successfully with no failures; the remaining local-preview customer-portal browser recovery check is still installing Playwright Chromium. The API-copy correction and both regression-contract updates are included in this current head.

## Not established by this status

- No authenticated customer/admin browser acceptance against Blitz or another deployed environment is claimed.
- No production database migration or deployment is claimed.
- No real-money execution, automatic customer fund allocation, or unattended financial settlement is enabled by this workstream.
- A green workflow result is not proof that the hosted customer portal is currently showing pop-ups.

## Windows 2–6

Status is pending each assigned owner’s own branch, commit, PR, changed-file list and exact-head test evidence. Do not mark a window complete from its assignment alone.


## Window 2 — Package Policies & Configuration

**Implementation branch:** `feat/window-2-package-opportunity-policy-contract`  
**Baseline:** `0f1fafba3bba30cfd7d2605bf6aeb8387fa2664b`  
**Current implementation checkpoint:** `4c01348e193f9acd73c1d1f930fa15242948bc5f`  
**Pull request:** [#284](https://github.com/stannmoye/Arbitrade_platform/pull/284) — open, draft, unmerged.  
**PR head at creation:** `92224d32dd85bb8249f094df1e8dcd8afb815a0d`.

Implemented on the Window 2 branch:
- Added `server/modules/package-opportunity-policy.ts` as the canonical typed policy row/patch contract and single source for new-package policy defaults and package-isolated merge resolution.
- Reused existing `packages` and `opportunity_package_policies`; no schema or migration changes.
- Updated `server/db.ts` to use the canonical default object, typed package patch, centralized patch allowlist and package-name-safe resolver.
- Added pure regression tests for default policy safety, preservation of omitted saved fields, package isolation, cross-package mismatch rejection and exclusion of global/immutable fields.

**Validation:** tests have been authored but have not been executed in this environment. Exact-head CI is required before integration. The live database was not queried, so the count/integrity of all 16 installed package records is not claimed as verified by Window 2.
