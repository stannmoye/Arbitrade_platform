# Workstream Status

**Last inspected:** 2026-11-04  
**Main checkpoint:** 0f1fafba3bba30cfd7d2605bf6aeb8387fa2664b  
**Window 1 company contract branch:** feat/workstream-1-company-catalogue-rotation-contract  
**Window 3 branch:** workstream/3-automatic-opportunity-engine

## Window 1 — Company Catalogue & Automatic Company Rotation

Contract branch documents the existing catalogue and rotation interface. It preserves 1,811 brand records and supports empty-pool behavior. Window 3 consumes this contract.

## Window 2 — Package Policies & Configuration

Assigned to package-specific policies. Its current branch/interface was not available in the repository branch search at the time of this update. Window 3 must reconcile the final policy contract before integration; no replacement policy service is created here.

## Window 3 — Automatic Opportunity Generation Engine

**Implementation:** Extends the existing PR #278 generation engine rather than creating a second generator.

Implemented in this branch:
- Allows generation when the current approved company-display pool is empty.
- Persists a company-neutral opportunity with NULL company identity rather than failing or inventing an unapproved company.
- Keeps optional company templates restricted to an already-selected approved company.
- Makes assignment company identity nullable with forward migration 0106.
- Adds unit and generation-contract regression coverage.

Existing generation infrastructure reused:
- Customer/package generation lock and unique generation key.
- Persisted package/company snapshots and assignment rows.
- Existing generation batch lifecycle and stale-running recovery.
- Existing customer/package rotation transaction.
- Existing opportunity delivery lifecycle handoff.

**Validation:** Source changes and test contracts are committed to this branch. Local test commands and database-backed MySQL/MariaDB execution have not been run in this connector-only session. Exact-head CI and disposable-database migration tests remain required.

## Window 4 — Opportunity Delivery & Customer Portal

Owns the existing delivery lifecycle and consumes persisted generated offers. Window 3 does not add a delivery worker or endpoint.

## Window 6 — Testing, Monitoring & Production Readiness

Owns worker-health and final readiness verification. Window 3 reuses existing generation batches and monitoring surfaces.

## Window 7 — Final Integration

Must reconcile Window 1/2 contracts with this branch and Window 4/6 changes, verify migration 0106 order, run exact-head checks and authenticated hosted acceptance. No merge or production deployment is claimed.
