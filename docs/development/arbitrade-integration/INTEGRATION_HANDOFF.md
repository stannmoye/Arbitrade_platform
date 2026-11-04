# Integration Handoff

**Updated:** 2026-11-04  
**From:** Window 1 — Company Catalogue & Automatic Company Rotation  
**To:** Window 7 — Final Integration

## Window 1 handoff

- Dedicated branch: `feat/workstream-1-company-catalogue-rotation-contract`.
- Base: `main` at `0f1fafba3bba30cfd7d2605bf6aeb8387fa2664b`.
- Reuses the existing 1,811-record source catalogue, current admin allowlist, package rotation controls, rotation cursor storage and opportunity snapshot fields.
- Corrects production initialization so the logo mapping and stable company IDs are authoritative; ticker/exchange workbooks are optional enrichment and missing or incomplete workbook data cannot block startup or selection.
- Adds loader tests for genuine brand-only records and partial optional ticker enrichment. The module-initialization regression copies the actual 1,811-row source logo mapping into an isolated working directory, imports the actual production module with all ticker files absent, and checks stable IDs, names, logo paths and zero supplied tickers.
- The initial failing CI revealed two fixture defects, not a runtime ticker dependency: the generated mapping used literal backslash-n separators, and one no-enrichment test accidentally read the repository ticker snapshot. The test now uses real newline separators, explicitly points to absent ticker paths, and uses the genuine checked-in mapping for the full module-import regression.
- No database migration is required: no schema or persisted data shape changes were made. Existing app settings, company IDs, cursor values and opportunity snapshots remain untouched.
- Adds explicit brand-only selection regression coverage and a documented internal service contract.
- No database migration, table, API endpoint or financial execution behavior is added.

## Window 3 integration

Use the existing `buildCompanySpotlightPool` and `nextCompanySpotlight` exports. Do not use the older ticker-required `company-rotation.ts` helper for brand-only company selection. Preserve transaction lock/idempotency order and atomically persist cursor plus opportunity snapshot. If no approved company matches, publish without a company identity.

## Window 7 verification checklist

1. Review PR changes and ensure no catalogue/logo/customer/history data is deleted.
2. Confirm the production loader uses stable ID/name/logo identity and treats ticker/exchange metadata as optional enrichment.
3. Run `pnpm exec vitest run server/modules/company-catalogue-reference.test.ts server/modules/company-spotlight-rotation.test.ts server/modules/company-spotlight-rotation.contract.test.ts`; the catalogue suite now also imports the production module in a child process with all ticker files absent.
4. Run `pnpm exec tsx scripts/trading-company-rotation.integration.ts` against disposable MySQL 8.4 and MariaDB 11.4 databases.
5. Verify all 1,811 source records and local logo paths remain intact.
6. Confirm exact-head CI on the latest commit. CI is automated verification, not live production verification. No production migration or deployment is authorized by this handoff.

## Validation evidence

The corrected implementation was validated on commit `9692c380b4a69d4d2055ddeb11cc16c967f380d2`: **25/25 GitHub Actions checks passed, zero failures**. This included Verify Arbitrade trading recovery changes, Mining regression checks, Verify application, Build and test production source, Installer validation, and dedicated company-rotation, tier-qualification, worker-recovery, wallet-idempotency and settlement-reconciliation workflows. MySQL 8.4 and MariaDB 11.4 company-rotation integration jobs passed.

The application test job reported 146 test files passed / 5 skipped and 1,144 tests passed / 27 skipped; the additional trading recovery suite reported 31 test files and 176 tests passed. Production build and installer validation passed. The real-browser recovery check also passed. Skipped tests are reported as skipped by CI, not represented as executed.

The documentation-only handoff update will trigger a new exact-head CI run; Window 7 should use the final PR head and its check-runs.

## Pull request
- Draft PR: https://github.com/stannmoye/Arbitrade_platform/pull/283
- Target: `main`
- Corrected implementation was fully green on `9692c380b4a69d4d2055ddeb11cc16c967f380d2` (25/25 checks). A documentation/test-cleanup commit may advance the head; use the final PR head SHA and its associated check-runs as the source of truth.
- PR is intentionally unmerged and remains open/draft for Window 7's independent review. Window 1 does not claim final acceptance.
