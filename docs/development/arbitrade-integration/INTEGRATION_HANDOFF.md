# Window 7 Integration Handoff

**Date:** 2026-11-04  
**Repository:** `stannmoye/Arbitrade_platform`  
**Integration branch:** `integration/window7-final`  
**Target:** `main` (through a draft pull request only; no direct merge)

## 1. Integration baseline

- Initial main commit inspected: `0f1fafba3bba30cfd7d2605bf6aeb8387fa2664b`.
- Shared implementation checkpoint: `6d6d09ba1a001c9c50e54f46a0d58dad83daff16`.
- Window 7 created `integration/window7-final` at the shared checkpoint and advanced it to Window 4's delivery handoff head `f77bada696e7c5373d9333b1316bdacbf8943c39` before adding reviewed integration commits.
- The checkpoint is a descendant of the inspected main SHA and contains the substantial candidate generation implementation and migrations 0103–0105. It must be reviewed as part of the final PR; it is not already merged to main.
- All integration work is committed to the dedicated branch. No direct changes have been made to `main`.

## 2. Ownership and branch handoffs

| Window | Responsibility | PR / branch | Integration state |
| --- | --- | --- | --- |
| 1 | Company catalogue and automatic rotation | PR #283 / `feat/workstream-1-company-catalogue-rotation-contract` | Contract, docs and regression tests staged. |
| 2 | Package opportunity policies | PR #284 / `feat/window-2-package-opportunity-policy-contract` | Typed module and database resolver staged; source-contract tests adapted; source PR CI has failures that require owner rerun. |
| 3 | Automatic opportunity generation | Candidate PR #278 / `feat/automatic-template-opportunities` | Candidate code is in the shared checkpoint, but PR #278 labels it Window 1. Window 3 must confirm its ownership/commit handoff. |
| 4 | Opportunity delivery and customer portal | PR #280 / `feat/stage4-opportunity-delivery-contract` | Shared checkpoint plus delivery contract tests/docs staged. |
| 5 | Admin Trade settings and persistence | PR #285 / `workstream/window-5-admin-trade-settings-persistence` | Client validation, zero-safe hydration and read-back feedback staged. |
| 6 | Testing, monitoring and readiness | PR #279 / `feat/stage-6-opportunity-worker-observability` | Partial-cycle health and current/historical instance behaviour adapted to shared code. |
| 7 | Final integration | This branch | Owns reconciliation, exact-head verification and final PR. |

The exact ownership map is maintained in `WORKSTREAM_OWNERSHIP.md`. Do not use a PR title/branch name to override that map.

## 3. Reconciled shared contracts

### Catalogue and company rotation (Window 1)

- Preserve all 1,811 company catalogue records, stable Logo IDs and existing local logo assets.
- Brand-only records are valid display identities; ticker, exchange, listing or market-data fields are not required.
- Use `server/modules/company-spotlight-rotation.ts` as the canonical selector. The older ticker/recent-verification rotation path is not the informational opportunity selector.
- Only currently admin-verified, enabled and non-archived catalogue entries enter the eligible pool. Disabled/archived state overrides stale verified IDs.
- Country filtering and repeat avoidance are applied to the eligible pool; the per-customer/package cursor and company snapshot must persist atomically with opportunity creation.
- Missing/malformed settings or an empty eligible pool fail closed; never fabricate a company identity.

### Package policy (Window 2)

- `server/modules/package-opportunity-policy.ts` is the canonical typed policy contract, default source, patch allowlist and package-isolated resolver.
- Existing saved package policies are merged under the existing row lock; omitted fields and explicit zero values are preserved.
- Global tier-policy, popup-delivery, company-rotation, randomized-timing and burst masters remain separately owned by Package Configuration and are saved through the existing audited `adminOperations.updateGlobalTradeControl` mutation.
- Legacy per-package boolean placeholders are not exposed through the per-tier policy mutation.
- `automaticTradingEnabled` remains excluded and hard-false. No financial execution, customer-fund allocation or settlement is enabled.
- Current new-package policy defaults still contain zero generation targets (`minHourlyTarget`, `normalHourlyTarget`, `dailyPopupTarget`). Window 3 must reconcile these with the requested package-specific generation cadence before automatic scheduling can be declared complete.

### Generation and publishing (Window 3 candidate)

- The shared checkpoint contains the candidate generation worker, persisted opportunity lifecycle, batch records and migrations 0103–0105.
- Generation consumes package and company contracts and hands persisted opportunities to the existing delivery lifecycle.
- PR #278 is the candidate source but labels generation as Window 1. Window 3 must confirm the exact branch/commit and take ownership of the generation handoff before final integration.
- Opportunity generation/publishing remains non-financial. Do not activate automatic execution or customer-fund movements.

### Delivery (Window 4)

- Reuse the persisted customer-scoped delivery lifecycle, claims, leases/fencing, acknowledgements, retry and recovery.
- Preserve customer read/render eligibility and duplicate suppression.
- Do not create a second dispatcher, delivery table or queue.
- PR #280's delivery-contract tests and handoff documentation are staged. No exact-head integration CI or authenticated browser acceptance is yet recorded.

### Admin settings (Window 5)

- Reuse existing admin settings mutations and authorization. Client-side validation supplements but does not replace server-side validation.
- Preserve numeric zero when hydrating saved timing values; never use truthy fallback for saved numeric settings.
- Save success is displayed only after fresh server read-back confirms all changed fields and a newer policy version.
- Invalid retry and fee drafts are blocked with accessible field-level errors; failed read-back preserves the user's draft.
- The Window 5 changes were merged into `AdminOperationsPages.tsx` without replacing Window 6's worker-health table/export changes.

### Monitoring (Window 6)

- Reuse migration 0084, `worker_health_registry`, `runMonitoredWorkerCycle`, System Diagnostics and the existing admin monitoring surfaces.
- The existing generation loop's failure counter is exposed as aggregate `customerFailures`; no second counter is introduced.
- A non-zero aggregate customer failure count marks the outer worker cycle degraded even if the batch completes.
- Aggregate health messages contain only a count and sanitized stable code `CUSTOMER_CYCLE_FAILURES`; no customer identifiers, account details or raw exception text.
- Worker rows include `isCurrentInstance`. Current-process rows drive live diagnostics; historical rows remain visible for investigation but do not inflate current health counts.
- PR #261 is based on an older mainline checkpoint and is not merged wholesale. Its current/historical behaviour was reviewed and adapted to the newer shared worker-health data shape.

## 4. Shared files and conflicts resolved on this branch

- `server/db.ts`: retained the existing generation loop and customer failure counter; integrated the canonical package policy resolver and typed patch allowlist; exposed the aggregate failure count to the worker monitor.
- `server/_core/workerHealth.ts`: extended the existing monitor with optional partial-result degradation, stable safe error code and current-instance marking.
- `server/_core/index.ts`: classified non-zero customer sub-cycle failures as degraded without changing worker scheduling.
- `server/_core/systemDiagnostics.ts`: filters live diagnostic classification to current-process worker rows.
- `client/src/components/AdminOperationsPages.tsx`: combined Window 5 zero-safe settings hydration with Window 6 current/historical health presentation and exports.
- `server/routers.ts`: no new endpoint or schema mutation is introduced by the staged Window 2/5 changes; global master controls remain on the existing route.
- `drizzle/schema.ts`, migration journal and seed catalogue: no new Window 2/4/5/6 schema or seed changes. Generation migrations 0103–0105 are part of the shared checkpoint and require integrated database verification.
- Eight canonical coordination documents are maintained under `docs/development/arbitrade-integration/`; the Window 1 company-selection, Window 5 settings and Window 6 verification handoffs are also included under `docs/trading/`.

## 5. Exact-head verification required

Before the integration PR can be marked ready:

1. Obtain Window 3's explicit confirmation of the generation branch/commit and reconcile its code attribution with PR #278.
2. Rerun Window 2's failing exact-head workflows after its source-contract test corrections; inspect any remaining failures.
3. Run the full type check, unit/contract suite and production build on the exact Window 7 head.
4. Run disposable MySQL 8.4 and MariaDB 11.4 integration tests for migration ordering, company rotation, package policy isolation, opportunity generation/persistence, duplicate prevention, delivery lease fencing, partial customer failures and worker recovery.
5. Verify all 1,811 catalogue records and local logos remain present and resolvable.
6. Verify that the original 16 packages and existing customer/company/historical records remain intact; do not recreate or reseed over existing data.
7. Run authenticated admin browser acceptance for global controls, per-package policies, every Save/read-back path, validation messages, mobile layout and current/historical worker health.
8. Run authenticated customer browser acceptance for qualification, persisted opportunity creation, customer delivery, rendering, acknowledgement and duplicate suppression.
9. Run installer/migration validation from a clean disposable database and an existing-upgrade database.
10. Record the exact final SHA and workflow URLs. CI alone does not establish Blitz acceptance or production readiness.

## 6. Safety and deployment boundary

- No real-money trading execution, automatic customer-fund allocation, unattended financial settlement or customer-fund transfer is implemented or activated.
- Do not weaken authorization, audit, idempotency, lease fencing, financial checks or migration safeguards.
- No production database migration, Blitz deployment or live customer test is performed by this integration branch.
- The final pull request targets `main` and remains draft until all six workstreams and exact-head verification are complete. Window 7 must not merge directly to `main`.

## 7. Current outstanding blockers

- Window 3 ownership/branch confirmation for the generation engine.
- Window 2 exact-head CI failures must be resolved and rerun.
- Window 4 has no exact-head CI or authenticated browser evidence.
- Window 5 installer validation and combined-head save/read-back browser checks remain.
- Window 6 latest-head CI and exact combined-head monitoring tests remain.
- Window 7 has not yet executed the integrated type check, test suite, build, database integrations or authenticated browser acceptance.
