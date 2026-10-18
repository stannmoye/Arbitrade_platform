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

## Acceptance still required

- [ ] Run the new contract test and the complete application test suite on the current branch.
- [ ] Run TypeScript validation and production build on the current branch.
- [ ] Verify representative customer and administrator routes at 320, 375, 768, 1024, and desktop viewport widths in a real browser.
- [ ] Confirm there is no unintended horizontal page overflow; horizontally scrollable financial tables must remain keyboard accessible.
- [ ] Inspect form errors, disabled/busy controls, dialogs, dropdowns, and focus visibility under all five themes.
- [ ] Confirm actual contrast ratios for text, controls, status states, and focus indicators; CSS presence alone does not prove WCAG conformance.
- [ ] Continue shared-component adoption where it can be done without changing business behaviour or existing route layouts.

## Working rule

Do not mark Stage 2 complete based solely on source changes or CI. Record actual test results and viewport/browser evidence before closing the stage. Keep Stage 3 theme-policy acceptance distinct from Stage 2 completion.
