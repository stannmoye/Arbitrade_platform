# Integration Dependencies

**Coordination baseline:** 2026-11-04

## Confirmed Window 3 generation dependencies

| Dependency | Existing owner / source | Required behaviour | Integration check |
| --- | --- | --- | --- |
| Customer tier qualification | Existing qualification service and persisted package subscriptions; implementation owner outside WS1 | Generation consumes only active server-assigned eligible subscriptions. It must not create or infer qualification. | Qualifying credit/threshold and entitlement integration; no customer-selected tier. |
| Package configuration | Existing package records and `opportunityPackagePolicies` | Read persisted package-specific bounds and policy versions; never hardcode terms or let templates override bounds. | Multiple package policies generate within their own saved bounds; snapshots remain stable. |
| Company catalogue | Existing `companyCatalogueReference` source and `trade.companyCatalogue.adminState` | Use stable Logo IDs and current approved/enabled/non-archived records; preserve name/logo/country metadata. | 1,811-record integrity, status filtering, country filtering, rotation and restart tests. |
| Company rotation | Existing `company-spotlight-rotation` module and saved per-customer/package cursor | Advance once per durable assignment, transactionally; respect repeat policy and filter fingerprint. | Concurrent generation, replay and restart do not duplicate or skip cursor advancement. |
| Opportunity delivery | Existing `opportunityLifecycle.ts` and `opportunity-delivery-lifecycle` module | WS1 persists offers/assignments and passes them to existing delivery. Delivery owns queue, capacity, dispatch, retries and customer acknowledgement. | One delivery per user/offer; bounded capacity; retry/lease recovery; no wallet/ledger mutation. |
| Admin visibility | Existing `adminOperations` procedures and `AdminOpportunityTemplates` UI | Expose generation control, batch/assignment monitor and optional template administration with audit/version checks. | Admin authorization, save/read-back, reason/version conflict, useful failure state. |
| Final integration | Window 7 | Reconcile shared files and migrations, run exact-head checks and end-to-end acceptance. | Window 7 handoff checklist in `INTEGRATION_HANDOFF.md`. |

## Confirmed Workstream 4 dependencies

| Dependency | Existing owner / source | Required behaviour | Integration check |
| --- | --- | --- | --- |
| Opportunity generation | Window 3 candidate code in PR #278 (`feat/automatic-template-opportunities`); ownership confirmation pending | Persist customer/package-scoped offers and generation assignments; pass those offers into the existing popup lifecycle. Window 4 does not create a second generator. | Eligible generated offers enter the existing delivery admission path once; replay does not duplicate the customer/offer event. |
| Tier qualification and package policy | Existing server-owned qualification/subscription and policy services; ownership to be reconciled with Windows 2/3 | Deliver only to active, unexpired, server-assigned eligible subscriptions and valid enabled package/global delivery policy. | Eligible/ineligible customer matrix, quota exhaustion, disabled package, global pause and expired subscription checks. |
| Delivery retry policy | Existing `trade.deliveryRetryPolicy` app setting and `opportunity-delivery-retry-policy` module | Use the single persisted retry policy; missing/invalid/future-effective policy fails closed. Do not introduce another retry setting. | Attempts, retry deadlines, lease expiry/reclaim, stale-token fencing and terminal outcomes. |
| Customer rendering | Existing `customer.opportunities`, `customer.popupDeliveryStatus`, `CustomerOpportunityAlert` and `customer-popup-eligibility.ts` | A claimed `in_progress` event is renderable only with its server-issued lease token; acknowledgements must return with the same token. | Contract tests for lease propagation and browser tests for first display, refresh recovery, duplicate tabs and dismissal. |
| Final integration | Window 7 | Reconcile Window 1 generation branch with Window 4 delivery contract and all other workstreams; run exact-head CI and hosted acceptance. | Verify migration order, MySQL/MariaDB delivery integration, authenticated browser acceptance and no financial side effects. |

## Window 1 company-catalogue dependencies

| Dependency | Existing owner / source | Required behaviour | Integration check |
| --- | --- | --- | --- |
| Static catalogue and logos | `company-catalogue-reference.ts` and checked-in 1,811-row source | Preserve stable Logo IDs, names, local assets and brand-only identity. | Assert 1,811 entries and every local logo asset resolves on the integrated head. |
| Eligibility and rotation | Window 1 PR #283; `company-spotlight-rotation.ts` | Use current admin-verified/enabled/non-archived allowlist, exact country filters and durable per-customer/package cursor. | MySQL/MariaDB rotation, restart, replay, empty pool and disabled/archived precedence. |

## Window 2 package-policy dependencies

| Dependency | Existing owner / source | Required behaviour | Integration check |
| --- | --- | --- | --- |
| Package policy contract | Window 2 PR #284; `package-opportunity-policy.ts` | Centralize new-package defaults, package-owned patch allowlist and package-isolated resolver; preserve omitted existing fields and keep global master toggles out of the package mutation. | Test package A/B isolation, invalid package mismatch, explicit zero preservation, package-policy validation, global master exclusion and hard-false financial execution. |
| Generation consumer | Window 3 | Read the selected package's persisted policy without duplicating defaults or changing global masters. | Verify package-specific terms and timing snapshots on integrated generation path. |

## Window 5 admin-settings dependencies

- Reuse the existing settings and fee/retry mutations; Window 5 changes client validation and feedback only. Global informational delivery, company rotation, randomized timing, burst and tier-policy masters are owned by Package Configuration and must remain editable through the existing audited global-control mutation.
- Preserve the current/historical worker-health table changes in `AdminOperationsPages.tsx` when merging Window 5's global timing hydration fix.
- Run client validation tests plus authorized save/read-back, invalid-value rejection, role denial, refresh persistence and mobile/desktop browser checks.

## Window 6 monitoring dependencies

- Reuse migration 0084, `worker_health_registry`, `runMonitoredWorkerCycle`, System Diagnostics and the existing Worker Health & Recovery page.
- A non-zero aggregate `customerFailures` count must persist a degraded outcome; health messages must not include customer identifiers or raw exception text.
- Current-process rows drive live diagnostics; historical rows remain visible but are excluded from current-process health classification.

## Other implementation windows

Window 3 must confirm the generation-engine branch/commit attribution for PR #278. All other implementation windows have observed PR evidence recorded above and in WORKSTREAM_STATUS.md. Do not infer completion from branch names alone; record exact changed paths, migration numbers, dependencies and exact-head test evidence.

## Known shared-file conflict hotspots

- `server/db.ts`, `server/routers.ts`, `server/opportunityLifecycle.ts`
- `drizzle/schema.ts`, `drizzle/meta/_journal.json`, ordered `drizzle/*.sql`
- `client/src/App.tsx`, admin Trading components
- `docs/TRADING_SYSTEM_SPECIFICATION.md`, `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md`, `progress.md`

Any overlapping edit must be compared against both branch heads before cherry-picking or resolving. Never replace a whole file with an older branch copy.

## Workstream 6 dependencies

| Dependency | Workstream / existing owner | Required behaviour | Integration check |
| --- | --- | --- | --- |
| Opportunity cycle result | Window 1 generation worker / existing `runAutoTradeCycle` | Reuse the existing failure counter and expose aggregate `customerFailures` without customer identifiers or raw exception text. | Partial customer batch is observable as degraded while the remaining customer work continues. |
| Durable worker health | Existing Worker Health & Recovery implementation (migration 0084) | Reuse `runMonitoredWorkerCycle`, `worker_health_registry`, admin diagnostics and sanitization. | Exact integrated-head tests verify aggregate failure classification and current-process status. |
| Worker lifecycle and startup | Existing `server/_core/index.ts` registration | Preserve existing timer, bounded batch, retry/backoff and shutdown semantics. | Existing cycle recovery/concurrency contracts remain green. |
| Current versus historical instances | Existing worker-health registry and System Diagnostics | Derive current scope from the process instance ID; keep history visible without counting old stale instances as current failures. | Unit tests cover filtering and ensure current degraded/not-started rows remain actionable. |
| Final integration | Window 7 | Reconcile shared files and verify no duplicate monitor/table/API is introduced. | Run checks on the final integrated SHA. |

The existing PR #261 is based on an older mainline checkpoint and is not merged wholesale. Its current-versus-historical worker-health behavior is being adapted onto the newer shared worker-health implementation to avoid replacing newer diagnostics fields and queue reporting.
