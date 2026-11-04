# Integration Dependencies

**Coordination baseline:** 2026-11-04

## Cross-workstream dependency map

| Producer / owner | Contract or existing source | Consumer | Required behavior | Verification |
| --- | --- | --- | --- | --- |
| Window 1 — Company Catalogue & Automatic Company Rotation | Existing company catalogue, `company-spotlight-rotation`, admin catalogue state, saved customer/package rotation cursor; PR #283 documents brand-only contract. | Window 3 generation; Window 4 delivery/display snapshots. | Preserve all 1,811 company identities/logos; brand-only records valid; select only verified, enabled, non-archived records; apply country and repeat policy; persist rotation once per assignment. | Catalogue integrity/logo test, brand-only selection, status/country filtering, concurrent rotation, replay/restart and snapshot tests. |
| Window 2 — Package Policies & Configuration | Existing package rows and package-specific policy records; PR #284 adds canonical typed policy contract/defaults. | Window 3 generation; Window 5 admin settings. | Each of 16 packages retains independent validated bounds and policy version; invalid or unavailable policy fails closed; save/read-back does not mutate another package. | Package A/B isolation, full package preservation, validation, settings persistence and migration compatibility tests. |
| Window 3 — Automatic Opportunity Generation Engine | Existing eligible customer subscriptions, Window 1 company selector and Window 2 package policy contract. PR #278 currently contains generation code but is labelled Window 1 in its PR description. | Window 4 delivery; Window 6 verification. | Generate only for server-qualified customers; no mandatory company template; persist immutable customer/package/company snapshots and a unique generation key; retry reuses assignment and does not advance rotation twice. | No-template brand-only generation, package-bound checks, concurrent generation/replay, atomic persistence and no financial side effects. |
| Window 4 — Opportunity Delivery & Customer Portal | Existing `opportunityLifecycle.ts`, `opportunity-delivery-lifecycle`, retry policy, customer opportunity API and popup eligibility. PR #280 covers lease-token handoff. | Customer browser; Window 6 verification. | One delivery per customer/offer; bounded capacity; lease/fencing; stale-token rejection; received/rendered acknowledgement; refresh recovery; terminal states stay terminal. | MySQL/MariaDB integration for admission, duplicate prevention, lease expiry/retry/fencing and browser/API tests. |
| Window 5 — Admin Trade Settings & Database Persistence | Existing Trade admin settings UI, API procedures, app settings and package policy contracts. | Windows 2–4; Window 6 verification. | Each control has one authoritative owner and persistence path; save validates, writes transactionally where needed, reads back and reports success/failure; no duplicated or contradictory controls. | UI save/read-back, refresh persistence, package independence, authorization/audit and failure feedback tests. |
| Window 6 — Testing, Monitoring & Production Readiness | Existing `runAutoTradeCycle`, `runMonitoredWorkerCycle`, `worker_health_registry`, admin Worker Health & Recovery and System Diagnostics. PR #279 adds aggregate partial-batch failure classification. | Window 7 final integration. | Continue processing unaffected customers; mark partial batches degraded; persist only sanitized aggregate diagnostics; verify install/upgrade, recovery and full workflow. | Exact-head source pipeline, disposable MySQL/MariaDB, worker health persistence, browser acceptance and deployment gates. |
| Window 7 — Final Integration | All six workstream branches and the shared contracts. | Main branch / release candidate. | Reconcile exact heads, ownership, shared-file conflicts, migration ordering, API contracts and security/financial boundaries. | Full integrated-head CI, DB engines, authenticated staging browser acceptance and recorded go/no-go report. |

## Window 6 specific dependencies

| Dependency | Existing owner / source | Required behavior | Integration check |
| --- | --- | --- | --- |
| Customer qualification | Existing tier qualification service and Window 2 package policy contracts | Only active server-assigned entitlements are eligible; generation must not infer or create qualification. | Qualified and unqualified customer fixtures; expiry and package isolation. |
| Generation result | Window 3 generation engine; current `runAutoTradeCycle` path | Return aggregate `customerFailures` without customer IDs or raw exception text; continue remaining customers. | Inject one failed customer and verify later customers still process. |
| Company selector | Window 1 company spotlight rotation | Stable brand-only identities, approved/enabled/non-archived pool, country filters and durable cursor. | Brand-only, filter, concurrency, replay and restart cases. |
| Package policy | Window 2 package policy contract | Persisted package-specific bounds and version remain independent. | Save/read-back for multiple packages and generated snapshot assertions. |
| Delivery lifecycle | Window 4 existing delivery lifecycle | Existing queue, pending limits, lease/fencing, retries and customer acknowledgements remain the only delivery implementation. | Duplicate delivery, stale lease, retry expiry, refresh and no financial mutations. |
| Admin settings | Window 5 Trade administration | Controls save/read back and admin diagnostics accurately reflect persisted state. | Browser save/refresh/error-state tests; no duplicate setting source. |
| Durable worker health | Existing Worker Health & Recovery implementation; PR #261 current/history changes and PR #279 partial-batch classification | Preserve current-instance/history semantics and record partial batches as degraded using sanitized codes. | Disposable DB read-back of degraded state plus current/history dashboard tests. |
| Installation and migration | Existing guarded migration and installer flows; all workstream migrations | Forward-only, ordered, retry-safe migration; no reset/reseed of populated customer/package/catalogue data. | Fresh and upgrade runs on MySQL 8.4 and MariaDB 11.4 with the final journal. |
| Final integration | Window 7 | Reconcile all six branches and validate exact final SHA. | Full source, database and authenticated hosted browser acceptance. |

## Known shared-file conflict hotspots

- `server/db.ts`, `server/routers.ts`, `server/opportunityLifecycle.ts`
- `server/_core/index.ts`, `server/_core/workerHealth.ts`, related worker tests
- `drizzle/schema.ts`, `drizzle/meta/_journal.json`, ordered `drizzle/*.sql`
- `client/src/App.tsx`, `client/src/customer-popup-eligibility.ts`, admin Trading components
- `docs/TRADING_SYSTEM_SPECIFICATION.md`, `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md`, `progress.md`

PR #261 and PR #279 both edit worker-health implementation/tests. PR #278 overlaps PR #279 in database and worker registration files. PR #280 is based on a Window 1 snapshot and depends on PR #278. Compare exact diffs and preserve both contracts; never replace a whole file with an older branch copy.
