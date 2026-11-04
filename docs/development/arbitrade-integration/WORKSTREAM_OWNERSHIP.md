# Workstream Ownership

**Updated:** 2026-11-04

| Window | Workstream | Owned responsibility | Explicit exclusions |
|---|---|---|---|
| 1 | Company Catalogue & Automatic Company Rotation | Preserve the 1,811-entry brand catalogue and logos; expose approved-display pool and durable customer/package rotation interfaces. | Does not own package policy, opportunity generation, or delivery lifecycle. |
| 2 | Package Policies & Configuration | Own package-specific opportunity policy configuration and its persisted read/validation interface. | Does not own company selection, generation orchestration, or delivery dispatch. |
| 3 | Automatic Opportunity Generation Engine | Own non-financial generation orchestration, scheduling, durable batch lifecycle, generation persistence coordination, idempotent recovery and generation diagnostics. Consume Window 1 and Window 2 contracts. | Does not own catalogue/rotation, package policy editing, popup delivery internals, customer financial execution, fund allocation, or settlement. |
| 4 | Opportunity Delivery & Customer Portal | Consume persisted generated opportunities through the existing delivery lifecycle; own delivery dispatch, lease/retry/acknowledgement and customer presentation handoff. | Does not create a competing generator, company selector, or package-policy owner. |
| 5 | Pending explicit assignment confirmation | Owner must record exact responsibility, paths, interfaces and exclusions from its assigned prompt. | Do not infer ownership. |
| 6 | Testing, Monitoring & Production Readiness | Own verification, durable worker-health/diagnostic presentation and production-readiness evidence. | Does not duplicate generation, company selection, package policy, or delivery services. |
| 7 | Final Integration & Verification | Compare all six implementation branches; reconcile shared files/contracts/migrations; run exact-head verification and make the integration/merge decision. | Does not replace implementation ownership or merge unverified work. |

## Window 3 implementation boundary

The existing generation implementation introduced on PR #278 is the starting point, not a competing service to replace. Window 3 maintains and completes the generation engine on top of that implementation. The generator must call Window 1's company-selection interface and Window 2's package-policy interface; it persists generated offers and assignments for Window 4's existing delivery lifecycle.

## Shared conflict rules

1. A service, table, worker, endpoint or setting has one primary owner.
2. Shared-file edits must be based on the latest dependency head and reviewed against other open workstream PRs.
3. Window 3 may change generation-owned persistence and orchestration, but must coordinate schema, server/db.ts, worker registration and monitoring changes with Windows 1, 2, 4 and 6.
4. Window 7 owns final conflict resolution, migration ordering and merge authority.
