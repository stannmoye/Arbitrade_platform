# Stage 2 — Shared Design System Acceptance

**Status:** In progress  
**Working branch:** `feat/stage-2-design-system-foundation`  
**Last updated:** 2026-10-18

## Implemented foundation

- [x] Semantic design tokens and shared layout/form/button/status/table primitives.
- [x] Original theme preserved as the baseline; semantic tokens are defined for all five themes.
- [x] Responsive touch targets and overflow handling for dense data tables and select controls.
- [x] Keyboard-visible focus indicators, invalid-field feedback, forced-colour support, higher-contrast preferences, and reduced-motion handling.
- [x] Dialog sizing and footer wrapping for short screens, zoom, and mobile keyboards.
- [x] Additive adoption of the shared page foundation without replacing established page layouts.
- [x] Automated CSS contract tests added in `server/design-system-contract.test.ts`.

## Automated contract coverage added in the current working branch

The contract suite checks semantic text contrast (4.5:1) and focus-indicator contrast (3:1) across all five themes, including Original Arbitrade fallback values. It also checks customer/admin root adoption, theme-selector status and description semantics, touch-target sizing for shared buttons, selects, inputs and textareas, and responsive dialog affordances. These are source-level regression checks; they do not replace browser testing or a full rendered contrast audit.

Run these checks from the repository root:

- `npm test -- server/design-system-contract.test.ts`
- `npm run check`
- `npm run build`

Do not mark these as passed until CI or a local run reports success.

## Automated CI coverage

A dedicated workflow, `.github/workflows/stage-2-design-system.yml`, runs the full test suite, TypeScript validation, and production build as three parallel jobs on pushes to the Stage 2 branch. The same workflow is configured for pull requests targeting `integration/auth-installer-vps-safety` and for manual dispatch. A configured workflow is not evidence of a passing run; record the actual run result before marking checks complete.\n\n## Latest automated validation evidence

- GitHub Actions run: [39174934891](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39174934891).
- Result: all three parallel jobs passed for code commit `1bf20c1a3e0792616a8877f2c2282da13e35486f`.
- Application tests: 28 test files, 199 tests passed.
- TypeScript: `pnpm check` passed.
- Production build: `pnpm build` passed.
- The run includes the latest appearance-admin state-update fix. A documentation-only follow-up will trigger the same workflow again.
- Remaining limitation: no real-browser viewport evidence has been captured yet; Stage 2 remains in progress.

## Acceptance still required

- [x] Run the new contract test and the complete application test suite on the current branch (CI: 28 test files, 199 tests passed).
- [x] Run TypeScript validation and production build on the current branch (both CI jobs passed).
- [ ] Verify representative customer and administrator routes at 320, 375, 768, 1024, and desktop viewport widths in a real browser.
- [x] Add an accessible name and region semantics to keyboard-focusable shared table overflow containers; callers can provide contextual names, and the component showcase demonstrates the prop.
- [ ] Confirm there is no unintended horizontal page overflow; horizontally scrollable financial tables must remain keyboard accessible in a real browser.
- [ ] Inspect form errors, disabled/busy controls, dialogs, dropdowns, and focus visibility under all five themes.
- [ ] Confirm actual contrast ratios for text, controls, status states, and focus indicators; CSS presence alone does not prove WCAG conformance.
- [ ] Continue shared-component adoption where it can be done without changing business behaviour or existing route layouts.

## Working rule

Do not mark Stage 2 complete based solely on source changes or CI. Record actual test results and viewport/browser evidence before closing the stage. Keep Stage 3 theme-policy acceptance distinct from Stage 2 completion.

## Continuation review — 2026-10-19

- Reviewed the current Stage 2 implementation in parallel across the theme context, appearance settings normalization and tests, admin theme-management UI, application stylesheet imports, shared UI controls, navigation, workflow, and acceptance contract.
- Fixed an impure React state updater in `client/src/components/AdminAppearance.tsx`: removing the currently published default theme no longer triggers another state setter from inside a functional state updater. The saved policy normalization also keeps the default inside the enabled-theme allow-list.
- Validation for code commit `1bf20c1a3e0792616a8877f2c2282da13e35486f`: [GitHub Actions run 39174934891](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39174934891) passed all three jobs—28 test files / 199 tests, TypeScript, and production build.
- No real-browser viewport evidence is available yet. Keep the five-theme viewport checks, horizontal-overflow inspection, and rendered contrast verification open; do not mark Stage 2 complete until those are recorded.
