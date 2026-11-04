# Integration Dependencies

**Updated:** 2026-11-04

| Consumer | Provider / owner | Required contract | Integration verification |
|---|---|---|---|
| Window 3 generation | Window 1 company catalogue and rotation | parseCompanyCatalogueAdminState, buildCompanySpotlightPool, nextCompanySpotlight; stable Logo IDs, approval allowlist, country filters, durable customer/package cursor. Empty pool permits null company identity. | Brand-only selection; all statuses; country filters; empty pool; replay; transaction rollback; restart. |
| Window 3 generation | Window 2 package policies — PR #284 | Consume persisted `opportunity_package_policies` rows selected by the active server-owned subscription; use saved capital bounds, payout/duration ranges and policy version. `server/modules/package-opportunity-policy.ts` owns the editor patch allowlist/default resolver, not generation-time fallback. | 16 package policies remain independent; invalid/missing bounds fail closed; snapshots retain policy version; no defaults are applied over missing saved rows. |
| Window 4 delivery | Window 3 persisted generated offers | Customer-assigned open offers, generation key, package/company snapshots and durable assignment status. | Existing delivery worker consumes without a competing generator; delivery idempotency and lease/retry recovery remain intact. |
| Window 3 generation | Window 4 delivery — PR #280 | Persist offers only; pass through the existing customer delivery lifecycle. `in_progress` first-render requires a non-empty server-issued lease token, returned unchanged for `received`/`rendered` acknowledgements. | Company-neutral assignments remain company-neutral; leased first render, refresh recovery, retry after received/render failure, and no financial side effects. |
| Window 3 generation | Existing database worker and batch infrastructure | Bounded round-robin customer scan, generation lock, durable batch status, stale-batch recovery and unique assignment key. | Repeated cycles, overlapping workers, restart, partial failure and retry. |
| Window 3 generation | Window 6 monitoring — PR #279 | Return aggregate `customerFailures` from `runAutoTradeCycle`; Window 6 classifies partial customer failures as degraded in the existing worker-health registry. Durable generation batches retain bounded internal failure details. | One shared `trading-opportunities` worker status; partial batch is degraded; aggregate health message contains no customer IDs or raw exception text. |
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
