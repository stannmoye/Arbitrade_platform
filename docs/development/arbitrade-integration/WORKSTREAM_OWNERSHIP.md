# Workstream Ownership

**Coordination baseline:** 2026-11-04

## Confirmed ownership

| Window | Workstream | Owned responsibility | Explicit exclusions |
| --- | --- | --- | --- |
| 1 | Automatic Opportunity Generation | Remove the unnecessary per-company approved-template prerequisite; generate customer/package-specific opportunities from the approved existing catalogue; preserve package terms and company rotation; persist generation assignments and snapshots; hand persisted offers to the existing delivery lifecycle. | Does not own qualification, delivery worker internals, global Trade settings UI, financial execution/allocation/settlement, or final integration. |
| 2 | Package Policies & Configuration | Own the typed package opportunity-policy contract, package-specific default policy, patch allowlist, and package-isolated policy merge/resolution. Reuse `packages` and `opportunity_package_policies`; preserve existing policy rows and package terms. | Does not own company selection/rotation implementation, opportunity generation, customer delivery worker, global delivery-master controls, financial execution/allocation/settlement, or final integration. |
| 7 | Final Integration and Verification | Compare all six implementation branches; resolve shared-file/schema/API conflicts; verify migration order and contracts; run exact-head checks and integrated acceptance; report readiness. | Does not replace the implementation ownership of Windows 1–6. |

## Workstream slots requiring confirmation from their assigned windows

The assignment prompts for Windows 2–6 are not present in this repository snapshot or in Workstream 1's handoff. Their names and boundaries are intentionally not guessed. Each owner must replace its row with the exact assigned scope and explicit exclusions before Window 7 integrates.

| Window | Workstream name | Owner must document |
| --- | --- | --- |
| 2 | Package Policies & Configuration | See confirmed ownership above; primary files `server/modules/package-opportunity-policy.ts`, `server/db.ts`, and package policy contract tests. |
| 3 | Pending owner confirmation | Exact scope, owned paths/services, interfaces, exclusions |
| 4 | Pending owner confirmation | Exact scope, owned paths/services, interfaces, exclusions |
| 5 | Pending owner confirmation | Exact scope, owned paths/services, interfaces, exclusions |
| 6 | Pending owner confirmation | Exact scope, owned paths/services, interfaces, exclusions |

## Conflict rules

1. A file or service has one primary implementation owner. Other workstreams propose changes through a coordinated PR or documented interface.
2. Shared schema, migration journal, router, worker registration and global settings changes require explicit coordination with every affected owner.
3. Do not create a parallel service, table, worker, setting or endpoint when an existing owner already provides it.
4. Window 7 records the final ownership reconciliation and unresolved overlaps before integration.
