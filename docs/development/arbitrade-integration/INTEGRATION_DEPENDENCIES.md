# Integration Dependencies

**Updated:** 2026-11-04

| Consumer | Provider / owner | Required contract | Integration verification |
|---|---|---|---|
| Window 3 generation | Window 1 company catalogue and rotation | parseCompanyCatalogueAdminState, buildCompanySpotlightPool, nextCompanySpotlight; stable Logo IDs, approval allowlist, country filters, durable customer/package cursor. Empty pool permits null company identity. | Brand-only selection; all statuses; country filters; empty pool; replay; transaction rollback; restart. |
| Window 3 generation | Window 2 package policies | Active subscription and package-specific enabled state, quota, capital bounds, payout range, duration range, policy version and schedule. | 16 package policies remain independent; invalid policy fails closed; snapshots retain policy version. |
| Window 4 delivery | Window 3 persisted generated offers | Customer-assigned open offers, generation key, package/company snapshots and durable assignment status. | Existing delivery worker consumes without a competing generator; delivery idempotency and lease/retry recovery remain intact. |
| Window 3 generation | Existing database worker and batch infrastructure | Bounded round-robin customer scan, generation lock, durable batch status, stale-batch recovery and unique assignment key. | Repeated cycles, overlapping workers, restart, partial failure and retry. |
| Window 3 generation | Monitoring owner (Window 6 assignment to be confirmed) | Reuse the existing worker-health registry and generation batch monitor; do not create a second registry. | Confirm the designated owner and verify worker failure/degraded state and sanitized diagnostics. |
| All workstreams | Window 7 integration | Exact branch heads, shared-file conflict list, ordered migration journal, CI and authenticated acceptance evidence. | Final integrated-head verification and merge decision. |

## Known shared-file conflict hotspots

- server/db.ts: package policy reads, generation core, worker cycle and customer read path.
- server/_core/index.ts: worker registration and lifecycle.
- server/opportunityLifecycle.ts: delivery handoff and company validation.
- drizzle/schema.ts, drizzle/meta/_journal.json, ordered migrations.
- server/modules/company-spotlight-rotation.ts: Window 1-owned interface; do not fork or replace.
- server/_core/workerHealth.ts: Window 6-owned monitoring; coordinate changes.
- Admin/customer Trading components and canonical documentation.

Do not replace whole files from stale branches. Compare exact branch heads and apply narrow reviewed changes.
