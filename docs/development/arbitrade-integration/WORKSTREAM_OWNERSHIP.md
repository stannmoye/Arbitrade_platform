# Workstream Ownership

**Coordination baseline:** 2026-11-04  
**Authority:** The six implementation assignments supplied to the development windows; Window 7 is final integration.

| Window | Workstream | Owned responsibility | Explicit exclusions | Observed PR / branch evidence |
| --- | --- | --- | --- | --- |
| 1 | Company Catalogue & Automatic Company Rotation | Preserve the existing company catalogue and logos; support brand-only identities; own company eligibility, admin verification/status rules, country filtering, rotation sequence, repeat policy and durable rotation cursor. | Does not own package policy, opportunity-generation orchestration, delivery lifecycle, global Trade settings UI, financial execution or final integration. | PR #283, `feat/workstream-1-company-catalogue-rotation-contract`; PR #278 also changes company-rotation integration and must be reconciled. |
| 2 | Package Policies & Configuration | Own package-specific opportunity policy contracts/defaults, validation, independent package settings and backward-compatible configuration persistence. | Does not own company selection, opportunity-generation worker orchestration, delivery lifecycle, Trade admin navigation or final integration. | PR #284, `feat/window-2-package-opportunity-policy-contract`. |
| 3 | Automatic Opportunity Generation Engine | Generate and persist non-financial opportunities for eligible customers using existing catalogue and package policy contracts; enforce generation idempotency, immutable snapshots and safe recovery. | Does not own catalogue eligibility/rotation implementation, package policy administration, delivery queue/portal rendering, financial execution or final integration. | PR #278 contains substantial generation-engine code but its PR description labels it Window 1. Window 7 must reconcile that attribution with the supplied Window 3 assignment; do not infer branch ownership from the PR label. |
| 4 | Opportunity Delivery & Customer Portal | Own the existing persisted popup-delivery lifecycle contract, customer-scoped dispatch claims, lease/fencing, received/rendered/failed acknowledgements, customer display eligibility, idempotent visibility and recovery. | Does not own generation, tier qualification, package/global admin settings, real-money execution, customer-fund allocation, settlement or final integration. | PR #280, `feat/stage4-opportunity-delivery-contract`; depends on generation changes in PR #278 and must be rebased/retargeted after its base is integrated. |
| 5 | Admin Trade Settings & Database Persistence | Audit the Trade administration interface and settings; remove duplicate/conflicting controls; make settings saves persist reliably with clear success/error feedback; keep UI and backend configuration contracts consistent. | Does not own company catalogue, generation/delivery workers, independent test infrastructure, financial execution or final integration. | PR #274 is a Phase 0 blueprint only. No confirmed implementation PR for the complete Window 5 assignment was identified in the current open-PR search. |
| 6 | Testing, Monitoring & Production Readiness | Independently verify cross-workstream behavior; improve regression and integration tests; surface worker failures in existing durable monitoring; verify recovery, installation/upgrade and deployment-readiness evidence. | Does not own opportunity business logic, delivery lifecycle implementation, new monitoring tables/endpoints, financial execution, production deployment or final integration. | PR #279, `feat/stage-6-opportunity-worker-observability`. |
| 7 | Final Integration and Verification | Compare all six implementation branches; resolve shared-file/schema/API conflicts; verify migration order and contracts; run exact-final-head checks and integrated acceptance; report readiness and make the merge decision. | Does not replace implementation ownership of Windows 1–6. | Final integration authority; no implementation PR is assumed. |

## Ownership and branch attribution rules

1. The workstream names and boundaries above follow the actual assignments supplied to the windows, not historical labels copied into earlier PR descriptions.
2. A PR may contain changes that serve more than one workstream. Its title or author's earlier label does not automatically transfer ownership of another window's responsibility.
3. PR #278 currently contains catalogue-rotation integration and opportunity-generation engine code while its description labels it Workstream 1. Window 7 must reconcile the catalogue portion with Window 1 and the generation portion with Window 3 before merge.
4. PR #283 is the observed Window 1 company-catalogue/rotation contract branch. PR #284 is the observed Window 2 package-policy contract branch. PR #280 is the observed Window 4 delivery-contract branch. PR #279 is the observed Window 6 monitoring branch.
5. Obtain the exact Window 3 and Window 5 implementation branch/commit/PR from their owners; do not infer completion from adjacent branches or documentation-only PRs.

## Conflict rules

1. A file or service has one primary implementation owner. Other workstreams propose changes through a coordinated PR or documented interface.
2. Shared schema, migration journal, router, worker registration and global settings changes require explicit coordination with every affected owner.
3. Do not create a parallel service, table, worker, setting or endpoint when an existing owner already provides it.
4. Window 7 records the final ownership reconciliation and unresolved overlaps before integration.
