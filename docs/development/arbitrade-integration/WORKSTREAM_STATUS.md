# Workstream Status

**Inspection date:** 2026-11-04  
**Repository:** `stannmoye/Arbitrade_platform`  
**Initial main SHA:** `0f1fafba3bba30cfd7d2605bf6aeb8387fa2664b`  
**Window 7 branch:** `integration/window7-final`  
**Integration state:** Staged, not merged to `main`; exact combined-head validation remains outstanding.

Individual workstream CI results below belong to the named PR heads only. They are not evidence that the combined Window 7 branch passes.

## Window 1 — Company Catalogue & Automatic Company Rotation

- **PR:** [#283](https://github.com/stannmoye/Arbitrade_platform/pull/283), open draft.
- **Branch/head:** `feat/workstream-1-company-catalogue-rotation-contract` / `36bc0423cc44fee6721ff1f56db67c976c3af719`.
- **Changes staged:** canonical company selection contract, coordination handoff, local-logo reference test and brand-only spotlight-rotation tests. The implementation reuses the existing catalogue and `company-spotlight-rotation.ts`; no table, endpoint or migration is added.
- **CI at inspected head:** 9 workflow groups completed successfully; installer validation remained queued.
- **Remaining:** finish installer validation and run the catalogue/rotation tests on the combined Window 7 head, including the preserved 1,811-record catalogue and every referenced local logo.

## Window 2 — Package Policies & Configuration

- **PR:** [#284](https://github.com/stannmoye/Arbitrade_platform/pull/284), open draft.
- **Branch/head:** `feat/window-2-package-opportunity-policy-contract` / `c274f3240e1354f855c4069b7f0d2920ec3e7713`.
- **Changes staged:** canonical typed package policy module, patch allowlist, package-isolated resolver and refactor of existing `server/db.ts`. No database schema or migration change.
- **Integration adaptation:** preserve global master ownership. Global tier-policy, informational popup delivery, company rotation, randomized timing and burst delivery remain in the audited global-control API; legacy per-package boolean placeholders are not exposed through the per-tier patch API. The package policy module remains aligned with that contract.
- **CI at inspected head:** 5 workflow groups succeeded; 3 failed (Mining regression, Verify recovery and Verify application); installer validation was cancelled and the production build/test workflow was still running.
- **Remaining:** owner must correct/re-run the failing source-contract suites on the exact latest head. Window 7 updated the integration-side source assertions to the canonical module/resolver, but has not run them locally.

## Window 3 — Automatic Opportunity Generation Engine

- **Candidate PR:** [#278](https://github.com/stannmoye/Arbitrade_platform/pull/278), open draft.
- **Candidate branch/head:** `feat/automatic-template-opportunities` / `b7567f4ae2b1c99342014925c5a667d1896fba21`.
- **Changes present in candidate:** substantial generation-engine implementation, durable opportunity persistence, generation migrations 0103–0105 and integration with company selection/delivery boundaries.
- **CI at inspected head:** 10 workflow groups completed successfully. This does not establish authenticated Blitz/browser acceptance.
- **Ownership blocker:** PR #278 labels its implementation Window 1, while the newer shared ownership contract assigns company catalogue/rotation to Window 1 and generation to Window 3. Window 7 has preserved the candidate code in its base but requires Window 3 to confirm its branch/commit and explicitly own the generation handoff before final integration.

## Window 4 — Opportunity Delivery & Customer Portal

- **PR:** [#280](https://github.com/stannmoye/Arbitrade_platform/pull/280), open draft.
- **Branch/head:** `feat/stage4-opportunity-delivery-contract` / `f77bada696e7c5373d9333b1316bdacbf8943c39`.
- **Changes staged:** delivery-contract regression coverage and handoff documentation. The branch is based on shared checkpoint `6d6d09ba1a001c9c50e54f46a0d58dad83daff16); the Window 7 branch was advanced to this head before adding integration changes.
- **CI:** no workflow runs were returned for the inspected PR head.
- **Remaining:** run the delivery lease/fencing, customer read/acknowledgement, idempotency, duplicate suppression and recovery tests on the combined head, followed by authenticated customer-portal browser acceptance.

## Window 5 — Admin Trade Settings & Database Persistence

- **PR:** [#285](https://github.com/stannmoye/Arbitrade_platform/pull/285), open draft.
- **Branch/head:** `workstream/window-5-admin-trade-settings-persistence` / `50f1d2240c8545c2203cc5e46d0299914f2d865a`.
- **Changes staged:** reusable client validation, delivery retry draft validation, package-fee draft validation, settings hydration that preserves numeric zero, and success/error feedback after fresh server read-back. No new API, table or migration.
- **CI at inspected head:** 9 workflow groups completed successfully; installer validation remained queued.
- **Integration correction:** one stale retry-validation assertion was updated to test the shared validation contract rather than an obsolete inline message.
- **Remaining:** rerun the exact combined-head UI/client tests and verify every affected Save path with authorized server persistence and refresh read-back.

## Window 6 — Testing, Monitoring & Production Readiness

- **PR:** [#279](https://github.com/stannmoye/Arbitrade_platform/pull/279), open draft.
- **Branch/head:** `feat/stage-6-opportunity-worker-observability` / `dce355779b76d8b565692483248f205c4f74784e`.
- **Changes staged:** aggregate partial-cycle failure classification through the existing worker-health registry; Window 7 reused the existing `failures` counter and exposes it as `customerFailures`, avoiding a duplicate counter. Current-versus-historical process scope is marked in worker-health rows, excluded from live diagnostics when historical, and shown in admin UI/exports.
- **Database/API:** no new schema, migration, endpoint or customer API; migration 0084 and existing admin monitoring paths are reused.
- **CI:** 8 workflow groups completed successfully on the latest documentation head; build/test remained queued and installer validation was cancelled. The earlier code head `962ae780e62e44ded236454040302afe9c5241e4` had 10 successful workflow groups.
- **Existing PR #261:** based on an older mainline checkpoint and diverges from the shared integration baseline. It was not merged wholesale; only reviewed current-versus-historical behaviour was adapted to the newer worker-health model.
- **Remaining:** exact combined-head tests for partial customer failure persistence, safe aggregate messages, current-process diagnostics and historical-row exclusion.

## Window 7 — Final Integration & Verification

- **Branch:** `integration/window7-final`.
- **Staged components:** Window 4 shared checkpoint; Window 1 catalogue contract/tests; Window 2 package-policy module/resolver; Window 5 admin settings changes; Window 6 monitoring changes; Window 1/Window 3 candidate generation code already present in the shared checkpoint.
- **Temporary conflict-inspection PRs:** #281 and #282 were closed without merging. No changes were made directly to `main`.
- **Tests executed by Window 7:** no local test runner, type check, production build, disposable database suite or authenticated browser acceptance has yet been executed in this window. GitHub Actions statuses above are from the individual workstream heads.
- **Outstanding blockers:** Window 3 ownership confirmation; Window 2 failed CI rerun; Window 4 exact-head CI/browser acceptance; Window 5 installer validation and combined-head Save verification; Window 6 exact combined-head tests.
- **Financial boundary:** no real-money execution, automatic customer-fund allocation, unattended settlement or fund transfers are introduced or enabled by this integration work.
