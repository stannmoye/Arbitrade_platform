# Integration Handoff

**Updated:** 2026-11-04  
**From:** Window 1 — Company Catalogue & Automatic Company Rotation  
**To:** Window 7 — Final Integration

## Window 1 handoff

- Dedicated branch: `feat/workstream-1-company-catalogue-rotation-contract`.
- Base: `main` at `0f1fafba3bba30cfd7d2605bf6aeb8387fa2664b`.
- Reuses the existing 1,811-record source catalogue, current admin allowlist, package rotation controls, rotation cursor storage and opportunity snapshot fields.
- Adds explicit brand-only selection regression coverage and a documented internal service contract.
- No database migration, table, API endpoint or financial execution behavior is added.

## Window 3 integration

Use the existing `buildCompanySpotlightPool` and `nextCompanySpotlight` exports. Do not use the older ticker-required `company-rotation.ts` helper for brand-only company selection. Preserve transaction lock/idempotency order and atomically persist cursor plus opportunity snapshot. If no approved company matches, publish without a company identity.

## Window 7 verification checklist

1. Review PR changes and ensure no catalogue/logo/customer/history data is deleted.
2. Run `pnpm exec vitest run server/modules/company-spotlight-rotation.test.ts server/modules/company-spotlight-rotation.contract.test.ts`.
3. Run `pnpm exec tsx scripts/trading-company-rotation.integration.ts` against disposable MySQL 8.4 and MariaDB 11.4 databases.
4. Verify the 1,811-row mapping and all local logo paths remain intact.
5. Confirm exact-head CI before merging. No production migration or deployment is authorized by this handoff.
