# Workstream Status

**Last inspected:** 2026-11-04  
**Repository main:** `0f1fafba3bba30cfd7d2605bf6aeb8387fa2664b`  
**Window 3 branch:** `feat/automatic-template-opportunities`
**Latest code/test SHA verified:** `26bc9054ab0b4f43617131b3aa2290d9a12479ed`
**Pull request:** [#278](https://github.com/stannmoye/Arbitrade_platform/pull/278) — open, draft, not merged.

## Window 1 — Company Catalogue and Automatic Company Rotation

Window 1 owns the company catalogue, approved-company identity/filtering contract, and existing durable automatic company-rotation contract/state. Window 1 does not own Automatic Opportunity Generation.

## Window 3 — Automatic Opportunity Generation

**Implementation state:** Implemented in PR #278. The quota and database-integration corrections passed the exact-head workflow set on the code/test SHA above. Window 3's ownership documentation is being aligned in a separate documentation-only correction; final handover approval remains with Window 7.

Observed Window 3 scope in PR #278:
- Generate opportunities for eligible server-assigned customer subscriptions using the approved company catalogue.
- Enforce each subscription's saved entitlement quota and the applicable package-wide quota before candidate selection.
- Preserve package terms and company identity/rotation snapshots; persist generation assignments transactionally and idempotently.
- Hand persisted offers to the existing delivery lifecycle; do not create a parallel delivery worker.
- Keep automatic financial execution hard-disabled.

### Exact-head GitHub Actions evidence

All ten workflow groups completed successfully on code/test SHA `26bc9054ab0b4f43617131b3aa2290d9a12479ed`:

1. [Trading settlement reconciliation database integration — run 41788526483](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526483)
2. [Trading tier qualification database integration — run 41788526478](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526478)
3. [Trading administrator wallet idempotency integration — run 41788526547](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526547)
4. [Trading company rotation durable allocation database integration — run 41788526528](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526528)
5. [Trading opportunity worker concurrency and recovery integration — run 41788526516](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526516). MySQL 8.4 and MariaDB 11.4 both passed.
6. [Verify Arbitrade trading recovery changes — run 41788526474](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526474)
7. [Mining regression checks — run 41788526555](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526555)
8. [Verify application — run 41788526482](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526482)
9. [Installer validation — run 41788526479](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526479)
10. [Build and test production source — run 41788526517](https://github.com/stannmoye/Arbitrade_platform/actions/runs/41788526517)

This exact-head workflow evidence applies to code/test SHA `26bc9054ab0b4f43617131b3aa2290d9a12479ed`. A later documentation-only ownership correction is not represented by these run SHAs; Window 7 should assess the final documentation commit separately and must not attribute these older run results to that later commit.

## Window 7 — Final Integration and Verification

Window 7 owns cross-workstream reconciliation, migration ordering, exact-head integration checks, hosted acceptance and the final handover/merge decision. Window 3 has not been officially handed over until Window 7 completes its review.

## Windows 2, 4, 5 and 6

Their precise assigned scopes and statuses are not inferred here. Each assigned owner must provide its own branch, commit, PR, changed-file list and exact-head test evidence before integration.

## Not established by this status

- No authenticated customer/admin acceptance against Blitz or another deployed environment is claimed.
- No production database migration or deployment is claimed.
- No real-money execution, automatic customer-fund allocation, or unattended financial settlement is enabled by this workstream.
- A green workflow result is not proof that the hosted customer portal is currently showing pop-ups.
