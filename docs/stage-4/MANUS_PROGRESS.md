

### Work unit 7 — customer notification accessibility semantics (implementation complete; browser assistive-tech acceptance still open)

- Starting checkpoint: `58620816dcc67efca01be6c78a02f6dcc060a44d`.
- Changed `client/src/App.tsx` in `CustomerNotifications`: added a labelled notification-history region tied to the page heading/description, exposed loading state through `aria-busy`, announced loading and empty states with polite status regions, labelled the unread count, and gave individual and bulk read controls contextual accessible names. Notification data, authorization, polling, pagination, and sound behavior were unchanged.
- Added `server/customer-notifications-accessibility.contract.test.ts` to protect the semantic labels, busy state, transient announcements, and contextual read-control names.
- Commands actually run: initial attempt before dependency restore failed because the clean checkout had no installed Vitest/type packages; `pnpm install --frozen-lockfile` then succeeded with no lockfile change. Focused regression command passed 6 files / 42 tests: notification polling, sound deduplication/policy/volume, notification pagination, and the new accessibility contract. `pnpm check` passed. `git diff --check` passed.
- Status: this concrete accessibility implementation slice is complete and locally verified. It is not a claim of full keyboard, screen-reader, reduced-motion, hosted browser, or assistive-technology acceptance; those remain open pending the supported browser/CI environment.
- Next concrete task: preserve this change, review the exact PR checks after push, then continue only with another concrete unverified Stage 4 gap. Provider-backed deposit/withdrawal success remains blocked and must not be simulated; final production build verification remains reserved for ChatGPT.
