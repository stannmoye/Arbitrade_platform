# Workstream Ownership

**Coordination baseline:** 2026-11-04

## Confirmed ownership

| Window | Workstream | Owned responsibility | Explicit exclusions |
| --- | --- | --- | --- |
| 1 | Company Catalogue and Automatic Company Rotation | Own the company catalogue, approved-company identity and filtering contract, and the existing durable automatic company-rotation contract/state. | Does not own opportunity-generation candidate selection, quota enforcement, offer/assignment persistence, delivery internals, financial execution/allocation/settlement, or final integration. |
| 3 | Automatic Opportunity Generation | Generate customer/package-specific opportunities from eligible server-assigned subscriptions and the approved catalogue; enforce subscription and package quotas; persist offers, assignments and snapshots transactionally; invoke Window 1's catalogue/rotation contracts; hand persisted offers to the existing delivery lifecycle. | Does not own the catalogue or standalone rotation service, package qualification, delivery worker internals, financial execution/allocation/settlement, or final integration. |
| 7 | Final Integration and Verification | Compare all six implementation branches; resolve shared-file/schema/API conflicts; verify migration order and contracts; run exact-head checks and integrated acceptance; report readiness. | Does not replace the implementation ownership of Windows 1–6. |

## Workstream slots requiring confirmation from their assigned windows

Window 3 ownership is confirmed by its assigned Stage 3 scope and PR #278. The assignment prompts for Windows 2, 4, 5 and 6 are not present in this repository snapshot; their names and boundaries are intentionally not guessed. Each assigned owner must document its exact scope and explicit exclusions before Window 7 integrates.

| Window | Workstream name | Owner must document |
| --- | --- | --- |
| 2 | Pending owner confirmation | Exact scope, owned paths/services, interfaces, exclusions |
| 4 | Pending owner confirmation | Exact scope, owned paths/services, interfaces, exclusions |
| 5 | Pending owner confirmation | Exact scope, owned paths/services, interfaces, exclusions |
| 6 | Pending owner confirmation | Exact scope, owned paths/services, interfaces, exclusions |

## Conflict rules

1. A file or service has one primary implementation owner. Other workstreams propose changes through a coordinated PR or documented interface.
2. Shared schema, migration journal, router, worker registration and global settings changes require explicit coordination with every affected owner.
3. Do not create a parallel service, table, worker, setting or endpoint when an existing owner already provides it.
4. Window 7 records the final ownership reconciliation and unresolved overlaps before integration.
