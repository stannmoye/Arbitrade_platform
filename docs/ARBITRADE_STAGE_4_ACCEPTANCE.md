

### 2026-10-21 customer notification accessibility semantics checkpoint

- Added labelled notification-history region semantics, heading/description associations, `aria-busy` during first/older-page loading, polite loading/empty status announcements, and contextual names for individual and bulk read controls in `client/src/App.tsx`.
- Added `server/customer-notifications-accessibility.contract.test.ts`.
- Focused verification passed: 6 Vitest files / 42 tests covering notification polling, sound deduplication/policy/volume, pagination, and the accessibility contract; `pnpm check` passed; `git diff --check` passed after `pnpm install --frozen-lockfile` restored the declared dependencies.
- This closes the concrete source-level semantics gap for the customer notification centre, but the broader accessibility criterion remains open for keyboard-only, screen-reader, reduced-motion, hosted browser, and manual assistive-technology evidence. No full Stage 4 completion claim is made.
