# Stage 3 — Five-Theme Architecture and Administrator Theme Controls

**Status:** In progress  
**Working branch:** `feat/stage-3-five-theme-architecture`  
**Base implementation checkpoint:** `22ca05ad65e20078775ca7956f121019fa6a966b`  
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
- [x] Fix cross-role preference leakage: administrator previews and customer preferences now use separate browser-storage keys.
- [x] Add focused tests for role-specific theme storage and storage-event filtering.
- [ ] Run the new focused tests and the existing theme-policy/authorization checks.
- [ ] Review theme compatibility overrides against the active customer and administrator portal components; fix any concrete visual integration gaps found.
- [ ] Verify administrator save/retry behaviour and that disabled themes cannot be selected by customers.
- [ ] Verify preference restoration after refresh and role changes without administrator/customer storage crossover.
- [ ] Capture authenticated browser evidence for the theme selector, admin preview/publish controls, and all five themes when a suitable browser/staging environment is available.
- [ ] Record rendered contrast/accessibility findings; source-level token checks alone do not prove rendered WCAG conformance.
- [ ] Update this checklist with actual test commands/results and remaining limitations before Stage 3 closeout.

## Current code change

The shared `arbitrade-theme` key previously stored both administrator previews and customer preferences. In a shared browser, an administrator's preview could be mistaken for a customer's preference when customer choice was enabled and the previewed theme was in the allow-list. The context now resolves a role-specific storage key, and storage events are filtered to the active role's key. The new unit tests cover key separation and event filtering.

## Validation record

No Stage 3 tests have been run for this branch yet. Do not infer a pass from the existence of test files or from Stage 2 CI results. Update this section only with observed commands, results, commit SHA, and CI links.

## External limitations

No staging URL was provided at Stage 3 start. Authenticated deployed-session acceptance is therefore not currently available. Keep that limitation separate from source-level and CI validation, and do not claim deployment or production readiness.
