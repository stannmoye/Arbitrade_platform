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

The latest validation is workflow run [#594](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39343974780), associated with PR head `53233400e38345be3dadefa2fb284a192d90f7d6`. All four jobs completed successfully:

- Application and theme-policy regression tests: **passed**.
- TypeScript validation: **passed**.
- Production build: **passed**.
- Chromium viewport and five-theme smoke matrix: **passed** — the prior detailed report records 1,174 checks and 0 failures; the latest browser job also completed and uploaded its evidence artifact.
- Latest browser evidence artifact: [stage-2-browser-acceptance](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39343974780/artifacts/12230530948).

The prior fully inspected report from run #593 confirms 1,174/1,174 checks passed with no recorded failures. The report includes responsive checks at widths from 320 to 1920 pixels, theme-token contrast sampling, visible keyboard focus checks, admin appearance interaction checks, and screenshots for the entry, customer, and administrator routes.

The lowest reported semantic-token contrast ratios across the five themes were:
- Main text on canvas: **14.52:1**.
- Main text on surface: **15.19:1**.
- Soft text on canvas: **8.94:1**.
- Muted text on canvas: **4.70:1**.
- Focus ring on canvas: **5.64:1**.

Those figures are from the report's sampled semantic token pairs, not a guarantee for every text element in every portal. The report explicitly notes that admin appearance interactions use mocked authentication/tRPC responses, live API authorization and persistence are not tested, and broader authenticated portal plus human screen-reader coverage remains outstanding. Selected mobile screenshots were reviewed as a preliminary visual check; this does not count as a complete human accessibility audit.

## Code review notes

Reviewed `ThemeContext.tsx`, `theme-storage.ts`, and `theme-storage.test.ts` at the latest recorded head. Role/account key isolation, storage-event filtering, customer allow-list revalidation, and the preference-readiness gate are present, with focused unit coverage. No additional source change was justified by this bounded review. This is not a substitute for testing account transitions against a live authenticated session.

## External limitations

No staging URL has been confirmed. Authenticated deployed-session acceptance is therefore still pending, as are human keyboard-only and screen-reader review. Keep those limitations separate from source-level and CI validation; do not claim deployment or production readiness until the remaining acceptance gates are addressed.
