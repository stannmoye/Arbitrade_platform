# Integration Dependencies

**Updated:** 2026-11-04

| Consumer | Provider | Required contract | Current evidence |
|---|---|---|---|
| Window 3 opportunity-generation engine | Window 1 catalogue/rotation | Pool eligibility, country filter, repeat policy, stable Logo ID, selected company snapshot and persisted cursor | Implemented in `server/modules/company-spotlight-rotation.ts`; current worker integration is in `server/opportunityLifecycle.ts` |
| Window 7 final integration | Windows 1–6 | Dedicated branches/PRs, ownership, migration and API declarations, exact-head tests | Pending completion of all workstreams |

The company cursor must be locked per customer/package, rechecked for idempotency, and committed with the opportunity snapshot. An empty company pool must not block otherwise eligible opportunity publication.
