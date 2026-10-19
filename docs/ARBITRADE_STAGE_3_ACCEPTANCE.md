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
- [x] Run the updated application/theme-policy tests and TypeScript validation on the current implementation commit.
- [x] Build the production client and server bundles on the current implementation commit.
- [x] Run the Chromium viewport/five-theme smoke matrix on the current implementation commit.
- [ ] Complete human keyboard-only and screen-reader review.
- [ ] Verify live server authorization, database persistence, and cross-account isolation in authenticated staging.
- [ ] Record human/staging evidence and remaining limitations before Stage 3 closeout.

## Current code change

The shared `arbitrade-theme` key previously stored both administrator previews and customer preferences, and customer preferences were shared between accounts on the same browser. In a shared browser, an administrator's preview or another customer's preference could be mistaken for the active customer's choice when customer choice was enabled and the theme was allowed. The context now resolves a role- and account-specific storage key, and storage events are filtered to the active role/account key. Unit tests cover role separation, account isolation, and event filtering.

A follow-up review found that storage-key scoping and persistence gating prevented cross-account writes, but the document theme could still briefly render the previous account's in-memory theme between an identity/role change and the restoration effect. The provider now uses the safe default for the active role while `themePreferenceReadyKey !== activeStorageKey`, then applies the restored preference. A source-contract assertion protects this readiness gate. Commits: `eac324a9bf28e25323b42fa90eac65eb98a58852` and `2234da9fe475786373fd2c25360475b368569545`.

## Current-head CI validation

Two completed GitHub Actions runs provide validation evidence:

- Run [#591](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39342933987) tested implementation commit `66c72f4c4a599b1e82890f2fb080a6b7e4b05aed`.
- Run [#592](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39343171197) tested the current PR head `961098376d645b7392d3a6b4bf95de92572d95bf`, which includes the acceptance-ledger documentation update.

Run #592 completed successfully:
- Application and theme-policy regression tests: **passed**.
- TypeScript validation: **passed**.
- Production build: **passed**.
- Chromium viewport and five-theme smoke matrix: **passed — 1,174 checks, 1,174 passed, 0 failures**.
- Browser evidence artifact for run #592: [stage-2-browser-acceptance](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39343171197/artifacts/12229469110).

The browser job uses a static client preview and mocked API responses for several interactions. These results verify the automated browser matrix but do not prove live server authorization or database persistence.

## External limitations

No staging URL has been confirmed. Authenticated deployed-session acceptance is therefore still pending, as are human keyboard-only and screen-reader review. Keep those limitations separate from source-level and CI validation; do not claim deployment or production readiness until the remaining acceptance gates are addressed.
