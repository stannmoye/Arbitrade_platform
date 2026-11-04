# Integration Handoff

**Updated:** 2026-11-04  
**From:** Window 1 — Company Catalogue & Automatic Company Rotation  
**To:** Window 7 — Final Integration

## Window 1 handoff

- Dedicated branch: `feat/workstream-1-company-catalogue-rotation-contract`.
- Base: `main` at `0f1fafba3bba30cfd7d2605bf6aeb8387fa2664b`.
- Reuses the existing 1,811-record source catalogue, current admin allowlist, package rotation controls, rotation cursor storage and opportunity snapshot fields.
- Corrects production initialization so the logo mapping and stable company IDs are authoritative; ticker/exchange workbooks are optional enrichment and missing or incomplete workbook data cannot block startup or selection.
- Adds isolated production-loader fixture tests for absent ticker files and partial ticker enrichment, plus explicit empty-pool no-fallback coverage.
- No database migration is required: no schema or persisted data shape changes were made. Existing app settings, company IDs, cursor values and opportunity snapshots remain untouched.
- Adds explicit brand-only selection regression coverage and a documented internal service contract.
- No database migration, table, API endpoint or financial execution behavior is added.

## Window 3 integration

Use the existing `buildCompanySpotlightPool` and `nextCompanySpotlight` exports. Do not use the older ticker-required `company-rotation.ts` helper for brand-only company selection. Preserve transaction lock/idempotency order and atomically persist cursor plus opportunity snapshot. If no approved company matches, publish without a company identity.

## Window 7 verification checklist

1. Review PR changes and ensure no catalogue/logo/customer/history data is deleted.
2. Confirm the production loader uses stable ID/name/logo identity and treats ticker/exchange metadata as optional enrichment.
3. Run `pnpm exec vitest run server/modules/company-catalogue-reference.test.ts server/modules/company-spotlight-rotation.test.ts server/modules/company-spotlight-rotation.contract.test.ts`.
4. Run `pnpm exec tsx scripts/trading-company-rotation.integration.ts` against disposable MySQL 8.4 and MariaDB 11.4 databases.
5. Verify all 1,811 source records and local logo paths remain intact.
6. Confirm exact-head CI on the corrected commit. CI is automated verification, not live production verification. No production migration or deployment is authorized by this handoff.

## Pull request
- Draft PR: https://github.com/stannmoye/Arbitrade_platform/pull/283
- Target: `main`
- Corrected implementation and regression tests are being re-verified on the latest branch head; use the PR head SHA and its associated check-runs as the source of truth.
- PR is intentionally unmerged. The prior 24-check result applied to the earlier loader implementation and does not verify this correction. Await fresh exact-head CI before approval.
