

## 8. Follow-on implementation checkpoint — customer notification accessibility semantics (2026-10-21)

- Starting checkpoint: `58620816dcc67efca01be6c78a02f6dcc060a44d`.
- `client/src/App.tsx` now exposes the customer notification history as a labelled region with heading/description references and an `aria-busy` state while the first or older page is loading. Loading and empty states are polite status announcements. The unread count and individual/bulk read controls have contextual accessible names.
- Added `server/customer-notifications-accessibility.contract.test.ts` covering these semantics. No notification query, persistence, authorization, pagination, polling, or sound logic was changed.
- Validation: after `pnpm install --frozen-lockfile` restored the clean checkout's declared dependencies, the focused Vitest run passed 6 files / 42 tests, including notification polling, sound policy/deduplication/volume, pagination, and the new accessibility contract. `pnpm check` and `git diff --check` passed. No production build was claimed or run for this slice.
- Limitation: source-contract and TypeScript evidence do not constitute full keyboard-only, screen-reader, reduced-motion, hosted browser, or manual assistive-technology acceptance. Those remain open. Deposit/withdrawal lifecycle notifications remain blocked on an authoritative provider/custody lifecycle; no synthetic financial event was added.
