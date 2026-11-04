# Workstream Ownership

**Coordination baseline:** 2026-11-04

## Confirmed ownership

| Window | Workstream | Owned responsibility | Explicit exclusions |
| --- | --- | --- | --- |
| 1 | Automatic Opportunity Generation | Remove the unnecessary per-company approved-template prerequisite; generate customer/package-specific opportunities from the approved existing catalogue; preserve package terms and company rotation; persist generation assignments and snapshots; hand persisted offers to the existing delivery lifecycle. | Does not own qualification, delivery lifecycle internals, customer popup rendering, global Trade settings UI, financial execution/allocation/settlement, or final integration. |
| 4 | Opportunity Delivery & Customer Portal | Own the existing persisted popup-delivery lifecycle contract: customer-scoped dispatch claims, lease/fencing handoff, received/rendered/failed acknowledgements, customer-side popup eligibility and rendering integration, idempotent visibility and recovery verification. | Does not own opportunity generation, tier qualification, package/global admin settings, real-money execution, customer-fund allocation, settlement, wallet/ledger mutation, or final integration. |
| 7 | Final Integration and Verification | Compare all six implementation branches; resolve shared-file/schema/API conflicts; verify migration order and contracts; run exact-head checks and integrated acceptance; report readiness. | Does not replace the implementation ownership of Windows 1–6. |

## Workstream slots requiring confirmation from their assigned windows

The assignment prompts for Windows 2, 3, 5 and 6 are not present in this repository snapshot or in Workstream 1's handoff. Their names and boundaries are intentionally not guessed. Each owner must replace its row with the exact assigned scope and explicit exclusions before Window 7 integrates.

| Window | Workstream name | Owner must document |
| --- | --- | --- |
| 2 | Pending owner confirmation | Exact scope, owned paths/services, interfaces, exclusions |
| 3 | Pending owner confirmation | Exact scope, owned paths/services, interfaces, exclusions |
| 5 | Pending owner confirmation | Exact scope, owned paths/services, interfaces, exclusions |
| 6 | Pending owner confirmation | Exact scope, owned paths/services, interfaces, exclusions |

## Conflict rules

1. A file or service has one primary implementation owner. Other workstreams propose changes through a coordinated PR or documented interface.
2. Shared schema, migration journal, router, worker registration and global settings changes require explicit coordination with every affected owner.
3. Do not create a parallel service, table, worker, setting or endpoint when an existing owner already provides it.
4. Window 7 records the final ownership reconciliation and unresolved overlaps before integration.
