# Integration Dependencies

**Coordination baseline:** 2026-11-04

## Confirmed Workstream 1 dependencies

| Dependency | Existing owner / source | Required behaviour | Integration check |
| --- | --- | --- | --- |
| Customer tier qualification | Existing qualification service and persisted package subscriptions; implementation owner outside WS1 | Generation consumes only active server-assigned eligible subscriptions. It must not create or infer qualification. | Qualifying credit/threshold and entitlement integration; no customer-selected tier. |
| Package configuration | Existing package records and `opportunityPackagePolicies` | Read persisted package-specific bounds and policy versions; never hardcode terms or let templates override bounds. | Multiple package policies generate within their own saved bounds; snapshots remain stable. |
| Company catalogue | Existing `companyCatalogueReference` source and `trade.companyCatalogue.adminState` | Use stable Logo IDs and current approved/enabled/non-archived records; preserve name/logo/country metadata. | 1,811-record integrity, status filtering, country filtering, rotation and restart tests. |
| Company rotation | Existing `company-spotlight-rotation` module and saved per-customer/package cursor | Advance once per durable assignment, transactionally; respect repeat policy and filter fingerprint. | Concurrent generation, replay and restart do not duplicate or skip cursor advancement. |
| Opportunity delivery | Existing `opportunityLifecycle.ts` and `opportunity-delivery-lifecycle` module | WS1 persists offers/assignments and passes them to existing delivery. Delivery owns queue, capacity, dispatch, retries and customer acknowledgement. | One delivery per user/offer; bounded capacity; retry/lease recovery; no wallet/ledger mutation. |
| Admin visibility | Existing `adminOperations` procedures and `AdminOpportunityTemplates` UI | Expose generation control, batch/assignment monitor and optional template administration with audit/version checks. | Admin authorization, save/read-back, reason/version conflict, useful failure state. |
| Final integration | Window 7 | Reconcile shared files and migrations, run exact-head checks and end-to-end acceptance. | Window 7 handoff checklist in `INTEGRATION_HANDOFF.md`. |

## Other implementation windows

The exact ownership map for Windows 2–6 must be supplied by those windows. Do not assign owners based on observed changed files or guess from architecture components. Each window must add its named owner, contract, changed paths, migration numbers and dependencies here.

## Known shared-file conflict hotspots

- `server/db.ts`, `server/routers.ts`, `server/opportunityLifecycle.ts`
- `drizzle/schema.ts`, `drizzle/meta/_journal.json`, ordered `drizzle/*.sql`
- `client/src/App.tsx`, admin Trading components
- `docs/TRADING_SYSTEM_SPECIFICATION.md`, `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md`, `progress.md`

Any overlapping edit must be compared against both branch heads before cherry-picking or resolving. Never replace a whole file with an older branch copy.
