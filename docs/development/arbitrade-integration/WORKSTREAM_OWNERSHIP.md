# Workstream Ownership

**Updated:** 2026-11-04

| Window | Workstream | Owned responsibility | Explicit exclusions |
|---|---|---|---|
| 1 | Company Catalogue & Automatic Company Rotation | Preserve the 1,811-entry brand catalogue and logos; expose approved-display pool and durable customer/package rotation interfaces. | Does not own package policy, opportunity generation, or delivery lifecycle. |
| 2 | Package Policies & Configuration | Own package-specific opportunity policy configuration and its persisted read/validation interface. | Does not own company selection, generation orchestration, or delivery dispatch. |
| 3 | Automatic Opportunity Generation Engine | Own non-financial generation orchestration, scheduling, durable batch lifecycle, generation persistence coordination, idempotent recovery and generation diagnostics. Consume Window 1 and Window 2 contracts. | Does not own catalogue/rotation, package policy editing, popup delivery internals, customer financial execution, fund allocation, or settlement. |
| 4 | Opportunity Delivery & Customer Portal | Consume persisted generated opportunities through the existing delivery lifecycle; own delivery dispatch, lease/retry/acknowledgement and customer presentation handoff. | Does not create a competing generator, company selector, or package-policy owner. |
| 5 | Admin Trade Settings & Database Persistence | Own the Trade administration settings UI, save workflows, settings persistence, validation feedback and related admin API/UI organization. Coordinate package-policy writes with Window 2 and generation controls with Window 3. | Does not own generation scheduling, opportunity persistence, customer delivery lifecycle or financial execution. |
| 6 | Testing, Monitoring & Production Readiness | Own independent verification, worker health/diagnostic classification, regression coverage and production-readiness evidence. Reuse the existing worker-health registry. | Does not create a competing generator, package policy, company selector, delivery worker or financial execution path. |
| 7 | Final Integration & Verification | Compare all six implementation branches; reconcile shared files/contracts/migrations; run exact-head verification and make the integration/merge decision. | Does not replace implementation ownership or merge unverified work. |

## Window 3 implementation boundary

The existing generation implementation introduced on PR #278 is the starting point, not a competing service to replace. Window 3 maintains and completes the generation engine on top of that implementation. The generator must call Window 1's company-selection interface and Window 2's package-policy interface; it persists generated offers and assignments for Window 4's existing delivery lifecycle.

## Window 3 — current implementation and handoff boundary

- Implementation PR: [#286](https://github.com/stannmoye/Arbitrade_platform/pull/286), branch `workstream/3-automatic-opportunity-engine`.
- Dependency/base: Window 1 generation foundation PR #278. Window 3 does not own PR #278 and must not retarget or merge it.
- Generation owns the per-customer transaction, package/subscription eligibility selection, generation-side daily quota enforcement, durable assignment/snapshot persistence, idempotent retry and generation batch diagnostics.
- Window 1 remains authoritative for company catalogue loading, approved pool construction and rotation selection semantics. Window 2 remains authoritative for saved package-policy editing and validation. Window 4 remains authoritative for delivery dispatch, leases, retries, acknowledgements and customer rendering. Window 6 remains authoritative for worker-health classification and presentation.
- Window 3 may coordinate changes to `server/db.ts` but must not create parallel catalogue, package-policy, delivery or worker-monitoring services.
- Window 7 alone approves the final integrated branch. PR #286 remains open and unmerged until Window 7 explicitly approves it.

## Shared conflict rules

1. A service, table, worker, endpoint or setting has one primary owner.
2. Shared-file edits must be based on the latest dependency head and reviewed against other open workstream PRs.
3. Window 3 may change generation-owned persistence and orchestration, but must coordinate schema, server/db.ts, worker registration, admin settings and monitoring changes with Windows 1, 2, 4, 5 and 6.
4. Window 7 owns final conflict resolution, migration ordering and merge authority.
