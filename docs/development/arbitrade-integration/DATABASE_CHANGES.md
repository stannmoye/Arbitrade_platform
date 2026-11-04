# Database Changes

**Updated:** 2026-11-04

## Existing generation migrations

Workstream 1's existing PR #278 introduces migrations 0103–0105 for generated offer assignment columns, generation templates/batches/assignments, catalogue-native template provenance and default informational delivery controls. These migrations must remain ordered and be reconciled by Window 7 with all workstream migration changes.

## Window 3 migration 0106

### 0106_company_neutral_opportunity_assignments.sql

- Changes only opportunity_generation_assignments.companyReferenceId from NOT NULL to NULL.
- Allows an informational opportunity to be generated when the Window 1 approved-display pool is empty.
- Existing company IDs and historical assignments remain unchanged.
- Company identity on opportunity_offers was already nullable; this migration aligns the assignment snapshot with that existing contract.
- No package, customer, wallet, ledger, trade, execution, result or settlement data is changed.

## Preservation and rollout rules

- Preserve all 16 existing packages, 1,811 catalogue identities and logos, customer records, historical opportunities and snapshots.
- Do not drop, rebuild, truncate or reseed existing business tables.
- Apply forward migrations only through supported migration runners.
- Window 7 must validate the combined ordered journal and migration 0106 on disposable MySQL 8.4 and MariaDB 11.4 databases, including upgrade from the supported pre-0106 schema.
- No production migration or deployment is claimed by Window 3.
