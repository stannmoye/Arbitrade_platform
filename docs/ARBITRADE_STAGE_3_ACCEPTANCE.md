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
- [ ] Run the updated focused tests and existing theme-policy/authorization checks.
- [ ] Review theme compatibility overrides against active customer/admin components; fix any concrete visual integration gaps found.
- [ ] Verify administrator save/retry behaviour and that disabled themes cannot be selected by customers.
- [ ] Verify preference restoration after refresh and account/role changes without storage crossover.
- [ ] Capture authenticated browser evidence for the theme selector, admin preview/publish controls, and all five themes when a suitable browser/staging environment is available.
- [ ] Record rendered contrast/accessibility findings; source-level token checks alone do not prove rendered WCAG conformance.
- [ ] Update this checklist with actual test commands/results and remaining limitations before Stage 3 closeout.

## Current code change

The shared `arbitrade-theme` key previously stored both administrator previews and customer preferences, and customer preferences were shared between accounts on the same browser. In a shared browser, an administrator's preview or another customer's preference could be mistaken for the active customer's choice when customer choice was enabled and the theme was allowed. The context now resolves a role- and account-specific storage key, and storage events are filtered to the active role/account key. The new unit tests cover role separation, account isolation, and event filtering.

## Validation record

GitHub Actions run [#521](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39333847850) completed successfully on commit `bf4c7c044585aa4b6d2b2d2207cb6ac3085af790`: application/theme-policy regression tests, TypeScript validation, production build, and Chromium viewport/five-theme smoke matrix all passed. This is the last verified successful run before the account-transition fix described below; it does not validate the newer commits.

## Follow-up regression fix — account/role transition theme flash

Code review found that storage-key scoping and persistence gating prevented cross-account writes, but the document theme could still briefly render the previous account's in-memory theme between an identity/role change and the restoration effect. The provider now uses the safe default for the active role while `themePreferenceReadyKey !== activeStorageKey`, then applies the restored preference. A source-contract assertion protects this readiness gate. Commits: `eac324a9bf28e25323b42fa90eac65eb98a58852` and `2234da9fe475786373fd2c25360475b368569545`. Validation of these newer commits is pending; do not treat run #521 as validation of them.

## External limitations

No staging URL was provided at Stage 3 start. Authenticated deployed-session acceptance is therefore not currently available. Keep that limitation separate from source-level and CI validation, and do not claim deployment or production readiness.
