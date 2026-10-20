# Arbitrade Stage 4 — Notifications, Communications & Support Acceptance

**Status:** In progress — implementation branch only; not release-accepted.  
**Branch:** `feat/stage-4-live-notifications-support`  
**Pull request:** [#95 — Stage 4: live notifications, two-way support and real sound controls](https://github.com/stannmoye/Arbitrade_platform/pull/95)  
**Baseline:** Stages 1–3 and the hosting-required test were user-confirmed complete on 2026-10-20. Do not infer independent hosted verification from that report.

This file is the durable acceptance checklist for Stage 4. Add new agreed requirements here rather than relying on chat history alone. Keep checkboxes open until supported by implementation and test evidence.

## Product requirements

### A. Customer notification centre
- [ ] Replace all hard-coded bell counts with the authenticated customer's unread, visible notification count.
- [ ] Show recent notifications in an accessible, responsive popover and a full notification centre.
- [ ] Show category badges and meaningful subjects/titles: Ticket, Announcement, Update (including platform upgrades), Promotion, Deposit, Withdrawal, Balance credit, Balance debit, Mining reward, Trading reward, Security, Transaction, Account.
- [ ] Support read/unread status, mark one read, mark all read, timestamps, links to the relevant page, empty/loading/error/retry states and pagination/history.
- [ ] Keep disabled categories out of the bell, unread count and customer inbox while retaining the underlying records; re-enabling a category makes eligible records visible again.
- [ ] Poll or push updates safely with bounded retries/reconnection and no duplicate notifications or sound on reconnect.

### B. Central admin communications form
- [ ] Provide one canonical customer communication workflow for announcements, platform updates/upgrades and promotions, with subject, message, category, priority, optional safe internal link and recipient selection.
- [ ] Target exactly one selected customer or all customer accounts; reject invalid/non-customer recipients and enforce administrator authorization on the server.
- [ ] Show the subject and correct category badge on the customer side.
- [ ] Persist drafts/publishing history, scheduling/expiry where implemented, and delivery/read reporting; clearly distinguish published, delivered, read and failed states.
- [ ] Do not turn message publishing into a financial operation.
- [ ] Ensure announcements submitted from the agreed support/communications workflow reach the same notification pipeline; avoid maintaining unrelated duplicate publishing implementations.

### C. Admin category visibility policy
- [ ] Persist independent switches for account, transaction, deposit, withdrawal, ledger credit, ledger debit, trading, mining, support/ticket, announcement, promotion, platform update/upgrade and security.
- [ ] Apply policy server-side as well as in the UI so disabled categories are consistently hidden in the customer bell, unread count and inbox.
- [ ] Policy changes take effect promptly on connected customer sessions.
- [ ] Visibility changes must never disable, cancel, delay or falsify the underlying transaction, reward, ticket, ledger write or security event.
- [ ] Keep changes auditable and provide clear saved/error feedback.

### D. Two-way ticketing
- [ ] Improve customer and administrator ticket forms with validation, subject, category, priority, reference and clear status.
- [ ] Keep replies in one persisted conversation with author, role, timestamps and unread reply indicators.
- [ ] Notify the other participant on ticket creation, reply, assignment/status change, resolution and reopening where applicable.
- [ ] Validate attachments by type/size and authorize access to the owning ticket; do not trust client-supplied customer IDs.
- [ ] Support queue filtering, assignment, lifecycle transitions, history and error/retry feedback.

### E. Five real sounds and preferences
- [ ] Ship five actual audio files (not oscillator-generated tones) and preview them in admin settings.
- [ ] Let an administrator choose the default sound for customer notifications and configure event-specific sounds/enablement for balance credit/debit, deposit, withdrawal, trading, mining, support, announcements, opportunities and failure/security where appropriate.
- [ ] Respect the customer's local opt-in/mute preference, browser gesture/autoplay limits and volume controls where supported.
- [ ] Play financial success sounds only after the authoritative operation has committed successfully; never on pending, failed, reversed or uncommitted activity.
- [ ] Deduplicate playback on polling, retries, reconnection and repeated event delivery.

### F. Real event integration
- [ ] Connect notifications to verified, persisted event boundaries for deposits, withdrawals, ledger credit/debit, trading, mining rewards, swaps, upgrades, promotions, tickets, account and security lifecycle.
- [ ] Use stable event identifiers, scoped by recipient, with database-enforced idempotency.
- [ ] Do not fabricate a financial success event or present simulated estimates as withdrawable funds.
- [ ] Keep the internal database ledger authoritative; no external payment provider or live-money execution should be added implicitly by notification work.

### G. Engineering quality and release
- [ ] Use database-backed persistence and forward-only, tracked migrations compatible with MySQL 8 and MariaDB.
- [ ] Preserve customer/admin authorization and cross-account isolation; validate inputs and safe internal links.
- [ ] Add unit, router/authorization, migration, idempotency, and event-boundary tests.
- [ ] Run exact-head type-check, unit tests, production build, installer validation, migration tests on disposable MySQL/MariaDB schemas, and review every workflow result.
- [ ] Perform responsive, keyboard, screen-reader, reduced-motion and theme/accessibility regression checks.
- [ ] Verify the release ZIP is built from the verified source; do not deploy or apply migrations to the user's production host/database from this PR.
- [ ] Record known limitations and honest evidence; CI passing alone is not hosted acceptance.

## Current branch evidence and known gaps (2026-10-20)

### Implemented in the current draft, pending exact-head verification
- Dynamic customer notification query and popover, unread count, category labels, read actions, timestamps and inbox link.
- Persistent notification metadata: event key, category, priority and internal link; migration `0054_notification_event_idempotency.sql`.
- Recipient-scoped event keys and text validation helper with unit tests.
- Admin announcement/promotion/platform-update composer with one-customer/all-customer targeting and category visibility controls.
- Ticket creation/reply notifications using keyed events.
- Some trade allocation/manual settlement event notifications.
- Five bundled WAV files and administrator sound policy fields.
- Follow-up fix: customer notification API now applies the server-side category visibility policy, so disabled categories are hidden consistently in customer bell/inbox results.
- Follow-up fix: the live customer header reads persisted administrator sound settings and checks the customer's local sound opt-in before playing a newly observed notification sound.
- Follow-up fix: the full customer notification centre now shows the same category badges as the bell, safe internal links, and loading/error/retry states; responsive inbox styling was added.
- Follow-up fix: Mining package/boost/swap/conversion notices now use the `mining` category and stable recipient-scoped event keys; unit tests cover category metadata, idempotency SQL, and input validation.

### Remaining before Stage 4 can be called complete
- [ ] Run exact-head checks and review CI status after the latest commits.
- [ ] Exercise migration 0054 with disposable MySQL 8 and MariaDB schemas, including rerun/idempotency and tracked recovery behavior.
- [ ] Verify all real event sources for deposit, withdrawal, ledger credit/debit, mining, swap, trading and account/security lifecycle; coverage is currently incomplete.
- [ ] Verify sound configuration end-to-end, including event mapping, actual browser playback, preferences, autoplay handling and reconnect deduplication.
- [ ] Finish announcement persistence/scheduling/expiry and delivery/read reporting.
- [ ] Finish ticket status/assignment/reopen/attachment authorization and customer/admin regression tests.
- [ ] Add and verify real-time push transport where supported, retaining bounded polling/reconnect fallback for cPanel/shared hosting.
- [ ] Finish responsive/theme/accessibility regression checks and validate the release ZIP.
- [ ] Keep PR #95 draft/unmerged until the above evidence is reviewed.

## Change log
- 2026-10-20: Consolidated the Stage 4 product and acceptance scope in a repository document.
- 2026-10-20: Updated the customer notification router to enforce category visibility server-side.
- 2026-10-20: Updated customer header sound handling to use the persisted admin sound policy and respect local customer opt-in.
- 2026-10-20: Added category badges and responsive states to the full customer inbox, and made Mining activity notices category-aware and idempotent with focused tests.
