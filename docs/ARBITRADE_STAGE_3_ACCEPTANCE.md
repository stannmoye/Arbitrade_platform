# Stage 3 — Five-Theme Architecture and Administrator Theme Controls

**Status:** In progress  
**Working branch:** `feat/stage-3-theme-controls`  
**Base:** Current `feat/stage-2-design-system-foundation` branch  
**Started:** 2026-10-19

## Objective

Finish and verify the existing five-theme implementation without duplicating Stage 2's shared design-system work. Preserve Original Arbitrade as the default and keep server-side administrator policy authoritative.

## Baseline implementation found

- Five semantic theme identifiers and labels exist: Original Arbitrade, Midnight Premium, Clean Light, Emerald Finance, and Aurora Modern.
- `client/src/theme-system.css` defines semantic theme tokens and compatibility bridges for legacy portal styling.
- `client/src/contexts/ThemeContext.tsx` loads the public appearance policy, distinguishes administrators from customers, validates customer choices against the enabled-theme allow-list, and applies the selected theme to the document root.
- `client/src/components/AdminAppearance.tsx` exposes preview, default-theme, enabled-theme, and customer-choice controls.
- Server-side appearance settings normalization and administrator-only update validation already exist.
- Focused policy, persistence, and authorization tests already exist; reuse them rather than creating duplicate suites.

## Stage 3 work ledger

- [x] Inspect the existing Stage 2 implementation and identify its active theme integration points.
- [x] Fix cross-role preference leakage: administrator previews and customer preferences use separate browser-storage keys.
- [x] Scope browser-stored preferences to the signed-in account to prevent theme crossover on shared devices.
- [x] Add focused tests for role/account isolation and storage-event filtering.
- [x] Update stale source-contract assertions to the new storage helper and Stage 3 workflow.
- [x] Run the updated application/theme-policy tests and TypeScript validation on the implementation commit.
- [x] Build the production client and server bundles on the implementation commit.
- [x] Run the Chromium viewport/five-theme smoke matrix on the implementation commit and current documentation head.
- [x] Inspect the downloaded browser report and selected mobile screenshots for the current PR head.
- [x] Recheck the latest Stage 3 workflow run and review the theme context/storage isolation code.
- [ ] Complete human keyboard-only and screen-reader review.
- [ ] Verify live server authorization, database persistence, and cross-account isolation in authenticated staging.
- [ ] Record human/staging evidence and remaining limitations before Stage 3 closeout.

## Current code change

The shared `arbitrade-theme` key previously stored both administrator previews and customer preferences, and customer preferences were shared between accounts on the same browser. In a shared browser, an administrator's preview or another customer's preference could be mistaken for the active customer's choice when customer choice was enabled and the theme was allowed. The context now resolves a role- and account-specific storage key, and storage events are filtered to the active role/account key. Unit tests cover role separation, account isolation, and event filtering.

A follow-up review found that storage-key scoping and persistence gating prevented cross-account writes, but the document theme could still briefly render the previous account's in-memory theme between an identity/role change and the restoration effect. The provider now uses the safe default for the active role while `themePreferenceReadyKey !== activeStorageKey`, then applies the restored preference. A source-contract assertion protects this readiness gate. Commits: `eac324a9bf28e25323b42fa90eac65eb98a58852` and `2234da9fe475786373fd2c25360475b368569545`.

## Current-head CI validation

The latest verified PR head is `1e218fe3dbb380e5258668e9b3eb8c15c2f996da`. Workflow [run #596](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39344814962) completed successfully with all four jobs passing:

- Application and theme-policy regression tests: **passed**.
- TypeScript validation: **passed**.
- Production build: **passed**.
- Chromium viewport and five-theme smoke matrix: **passed** — the downloaded `report.json` was independently inspected: **1,174 checks passed, 0 failures**, with no recorded page errors.

The browser matrix covers the gateway (`/`), customer (`/customer`), and admin (`/ops-console-7f3a`) routes; ten viewport widths (320, 360, 390, 430, 480, 768, 1024, 1280, 1440, and 1920 px); and five themes. The report contains 150 sampled semantic-token contrast checks per category and 150 rendered-text contrast samples (1,800 measured text instances in total). No sampled rendered-text cases fell below threshold; the lowest measured rendered-text ratio was 5.05:1.

The lowest sampled semantic-token contrast ratios were:
- Main text on canvas: **14.52:1**.
- Main text on surface: **15.19:1**.
- Soft text on canvas: **8.94:1**.
- Muted text on canvas: **4.70:1**.
- Focus ring on canvas: **5.64:1**.

These are sampled results, not a guarantee for every rendered element. The evidence artifact is [stage-2-browser-acceptance for run #596](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39344814962/artifacts/12230606501) (52 files, including the JSON report and screenshots; generated 2026-10-20). Selected mobile screenshots were also available for visual inspection.

## Code review notes

Reviewed `ThemeContext.tsx`, `theme-storage.ts`, and `theme-storage.test.ts` at the latest recorded head. Role/account key isolation, storage-event filtering, customer allow-list revalidation, and the preference-readiness gate are present, with focused unit coverage. The downloaded report was checked directly for totals, failed rows, page errors, route/theme/viewport coverage, and minimum sampled contrast values. No additional source change was justified by this bounded review. This is not a substitute for testing account transitions against a live authenticated session.

## External limitations

The browser matrix uses a static client preview and mocked authentication/tRPC responses for some interactions. It does not prove live server authorization or database persistence. No staging URL or access has been confirmed. Human keyboard-only and screen-reader review, plus authenticated staging acceptance for authorization, persistence, and cross-account isolation, remain pending. Keep those limitations separate from source-level and CI validation; do not claim deployment or production readiness until the remaining acceptance gates are addressed.