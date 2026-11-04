# Integration Dependencies

**Coordination baseline:** 2026-11-04

## Confirmed Window 3 dependencies

**Ownership boundary:** Window 1 owns the Company Catalogue and Automatic Company Rotation. Window 3 owns Automatic Opportunity Generation and consumes Window 1's catalogue/rotation contracts. Window 7 owns Final Integration and Verification.

| Dependency | Existing owner / source | Required behaviour | Integration check |
| --- | --- | --- | --- |
| Customer tier qualification | Existing qualification service and persisted package subscriptions; separate from Window 3 generation | Generation consumes only active server-assigned eligible subscriptions. It must not create or infer qualification. | Qualifying credit/threshold and entitlement integration; no customer-selected tier. |
| Package configuration | Existing package records and `opportunityPackagePolicies` | Read persisted package-specific bounds and policy versions; never hardcode terms or let templates override bounds. | Multiple package policies generate within their own saved bounds; snapshots remain stable. |
| Company catalogue | Window 1 — Company Catalogue; existing `companyCatalogueReference` and `trade.companyCatalogue.adminState` | Use stable Logo IDs and current approved/enabled/non-archived records; preserve name/logo/country metadata. | 1,811-record integrity, status filtering, country filtering and catalogue-contract tests. |
| Company rotation | Window 1 — Automatic Company Rotation; existing `company-spotlight-rotation` module and saved per-customer/package cursor | Window 3 invokes the existing rotation contract. Commit rotation state consistently with the generated offer and assignment; respect repeat policy and filter fingerprint. | Concurrent generation, replay and restart do not duplicate or skip cursor advancement. |
| Opportunity generation | Window 3 — Automatic Opportunity Generation, PR #278 | Select eligible subscriptions and approved companies, enforce per-subscription and per-package quotas, and persist offers/assignments/snapshots transactionally and idempotently. | First package exhausted, all exhausted, both available, retry, concurrency and rollback scenarios. |
| Opportunity delivery | Window 4 — existing `opportunityLifecycle.ts` and `opportunity-delivery-lifecycle` module | Window 3 persists offers/assignments and hands offers to existing delivery. Window 4 owns delivery queue, capacity, dispatch, retries and customer acknowledgement. | One delivery per user/offer; bounded capacity; retry/lease recovery; no wallet/ledger mutation. |
| Admin visibility | Window 3 generation procedures and `AdminOpportunityTemplates` UI, using existing `adminOperations` infrastructure | Expose generation control, batch/assignment monitor and optional template administration with audit/version checks. | Admin authorization, save/read-back, reason/version conflict and useful failure state. |
| Final integration | Window 7 — Final Integration and Verification | Reconcile shared files and migrations, run exact-head checks, perform integrated acceptance and make the handover decision. | Window 7 handoff checklist in `INTEGRATION_HANDOFF.md`. |

## Other implementation windows

This matrix records only confirmed owners and interfaces. Do not infer additional ownership for Windows 2, 4, 5 or 6 beyond the confirmed Window 4 delivery boundary above. Each assigned owner should document its named scope, contract, changed paths, migration numbers and dependencies before Window 7 integrates.

## Known shared-file conflict hotspots

- `server/db.ts`, `server/routers.ts`, `server/opportunityLifecycle.ts`
- `drizzle/schema.ts`, `drizzle/meta/_journal.json`, ordered `drizzle/*.sql`
- `client/src/App.tsx`, admin Trading components
- `docs/TRADING_SYSTEM_SPECIFICATION.md`, `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md`, `progress.md`

Any overlapping edit must be compared against both branch heads before cherry-picking or resolving. Never replace a whole file with an older branch copy.
