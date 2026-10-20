# Arbitrade Stage 4 — Notifications, Communications & Support Acceptance

**Status:** In progress — implementation branch only; not release-accepted.  
**Branch:** `feat/stage-4-live-notifications-support`  
**Pull request:** [#95 — Stage 4: live notifications, two-way support and real sound controls](https://github.com/stannmoye/Arbitrade_platform/pull/95)  
**Baseline:** Stages 1–3 and the hosting-required test were user-confirmed complete on 2026-10-20. Do not infer independent hosted verification from that report.

This file is the durable acceptance checklist for Stage 4. Add new agreed requirements here rather than relying on chat history alone. Keep checkboxes open until supported by implementation and test evidence.

## Latest consolidated batch (2026-10-20)

- Fixed the TypeScript failure in `listNotificationEventCursor` by guarding Drizzle's possibly-undefined `or()` result before adding it to the SQL predicate. This preserves visibility for legacy `NULL` categories while respecting disabled-category filtering.
- Stake & Earn reward and maturity-release notifications now carry recipient-scoped stable event keys, explicit `ledger_credit` categories, and priorities; notification rows remain in the same database transaction as their ledger entries.
- Added contract coverage for Stake & Earn notification idempotency/category metadata and transaction ordering.
- **Verification state:** earlier build and application tests passed on the preceding head, but TypeScript failed at `server/db.ts:522`; the fix above is committed and must be revalidated on the current exact head. Do not mark the relevant release gates complete until exact-head CI passes.


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
- [ ] Persist drafts/publishing history, scheduling/expiry where implemented, and delivery/read reporting; clearly distinguish published, delivered, read and failed states, including partial broadcast counts and safe retries.
- [ ] Do not turn message publishing into a financial operation.
- [ ] Ensure announcements submitted from the agreed support/communications workflow reach the same notification pipeline; avoid maintaining unrelated duplicate publishing implementations.

### C. Admin category visibility policy
- [ ] Persist independent switches for account, transaction, deposit, withdrawal, ledger credit, ledger debit, trading activity, trading reward, mining activity, mining reward, support/ticket, announcement, promotion, platform update/upgrade and security.
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
- [ ] Deposit and withdrawal UI flows are currently provider-gated/mock or blocked; success/status notifications remain pending until a real persisted request lifecycle exists. Never invent successful deposits or payouts merely to make the bell look active.
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

## Exact-head validation evidence (2026-10-20)

The latest verified branch head is `473914a584aa87dc38d226e2ca2d7c6f99666084` (`fix(stage-4): serve notification sounds in dev and production builds`). All three consolidated workflow groups for this exact commit succeeded:
- [Installer validation, run 1441](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39498469827): all jobs passed, including fresh MariaDB, MySQL 8 compatibility/recovery, installer/migration regression tests, production build/server smoke checks, and deployment package generation. The targeted notification migration assertion script ran on both disposable databases; duplicate event keys were rejected on both engines. The MySQL recovery fixtures also confirmed failed/interrupted migration state remained blocked without replaying SQL or fabricating tracker entries.
- [Five-theme/browser validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39498469801): Chromium viewport and five-theme smoke matrix passed with 1,182 checks; the new real-browser playback check covered all five bundled notification WAV assets. Application/theme regression tests, TypeScript validation, and production build passed.
- [Mining database regression](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39498469921): MySQL/MariaDB mining idempotency transaction checks passed.
- The successful installer run published the `arbitrade-universal-installer` artifact from this exact commit.

These are CI checks on the feature branch, not a production-host acceptance test. Browser asset playback does not by itself prove customer preference handling, admin event mapping, reconnect deduplication, or post-commit sound timing. Those and the remaining event-coverage, announcement lifecycle, ticket authorization, transport, accessibility, and release sign-off gaps remain open.

## Current branch evidence and known gaps (2026-10-20)

### Implemented in the current draft, pending exact-head verification
- Dynamic customer notification query and popover, unread count, category labels, read actions, timestamps and inbox link.
- Persistent notification metadata: event key, category, priority and internal link; migration `0054_notification_event_idempotency.sql`.
- Recipient-scoped event keys and text validation helper with unit tests.
- Admin announcement/promotion/platform-update composer with one-customer/all-customer targeting and category visibility controls.
- Ticket creation/reply notifications using keyed events.
- Ticket creation now also creates a customer-facing Ticket badge with the ticket number and subject; notification enqueue failures no longer turn an already-persisted ticket into an apparent failed submission.
- Customer and admin ticket desks now expose an explicit reopen action for closed tickets; the server verifies ticket ownership/administrator role and emits idempotent support notifications after the status change.
- Some trade allocation/manual settlement event notifications.
- Five bundled WAV files and administrator sound policy fields.
- Follow-up fix: customer notification API now applies the server-side category visibility policy, so disabled categories are hidden consistently in customer bell/inbox results.
- Follow-up fix: the live customer header reads persisted administrator sound settings and checks the customer's local sound opt-in before playing a newly observed notification sound.
- Follow-up fix: the full customer notification centre now shows the same category badges as the bell, safe internal links, and loading/error/retry states; responsive inbox styling was added.
- Security lifecycle update: customer session revocation now verifies the session belongs to the authenticated customer, returns `NOT_FOUND` for unknown session IDs, and attempts a recipient-scoped high-priority security notification after the revocation succeeds. Notification delivery is best-effort and does not roll back or misreport the security action; a contract test covers ownership, ordering and failure handling.
- Follow-up fix: Mining package/boost/swap/conversion notices now use the `mining` category and stable recipient-scoped event keys; unit tests cover category metadata, idempotency SQL, and input validation.

### Announcement delivery persistence update (2026-10-20)

- Admin broadcasts now persist a campaign record and a per-recipient delivery ledger before fan-out.
- Reusing an administrator/event key with a different title, body, category, priority, link, or target is rejected.
- Delivery attempts are bounded to batches of 50; failed recipients remain recorded for safe retries without recreating successful deliveries.
- The admin router exposes a bounded announcement history with persisted delivered/read/failed/pending/expired counts.
- Customer mark-read updates the matching campaign delivery record only for that authenticated recipient.
- Migration `0055_notification_campaign_delivery_tracking.sql` is tracked by both the normal portal migration runner and read-only migration recovery diagnostics.
- The admin composer supports optional schedule/expiry timestamps; a bounded server worker publishes due campaigns and expires overdue campaigns. Expired campaign notifications are suppressed from the customer inbox and sound/event cursor without deleting underlying records.
- The admin communications screen shows persisted delivered/read/failed/pending/expired counts and can retry failed deliveries for a persisted campaign.
- Exact-head CI and disposable-schema migration testing remain release gates; source-level contract tests are not proof of runtime correctness.

### Six remaining Stage 4 work areas

Track these as six acceptance work areas within Stage 4, not as six separate top-level project stages. Close each only when its evidence is recorded.

1. **Database migration verification — COMPLETE:** exact-head commit `f2d58f5a503ae1c91b5d6012195a3d48650a9b85` passed installer validation, including disposable MariaDB 11.4 and MySQL 8 compatibility/recovery jobs. See [installer validation run 39499136545](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39499136545).
2. **Real event integration — OPEN:** verify persisted deposit/withdrawal lifecycles and the other real financial, trading, mining, swap, ticket, account and security event boundaries. Do not fake success for provider-gated deposit/withdrawal flows.
3. **Browser sound behavior — PARTIAL:** the exact-head Chromium viewport/five-theme workflow passed 1,182/1,182 checks with zero failures ([run 39499137228](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39499137228)). This does not alone establish full preference, post-commit financial timing, volume/autoplay, or reconnect-deduplication acceptance.
4. **Ticket lifecycle and attachments — OPEN:** verify assignment/status/reopen/reply flows, attachment ownership and authorization, and customer/admin regression behavior, including runtime concurrency and browser interactions.
5. **Live-update transport — OPEN:** verify supported push delivery or explicitly accept and test bounded polling/reconnect as the hosting-compatible fallback.
6. **Final acceptance and release — OPEN:** finish keyboard/screen-reader/reduced-motion/accessibility review, responsive/theme checks, verify the release ZIP corresponds to the validated source, and record limitations before release sign-off.

## Remaining before Stage 4 can be called complete
- [x] Run exact-head validation workflows on `f2d58f5a503ae1c91b5d6012195a3d48650a9b85`: Stage 3 five-theme validation, installer validation, and mining database regression all passed.
- [x] Exercise migration assertions/recovery with disposable MySQL 8 and MariaDB 11.4 on the exact head.
- [ ] Verify all real event sources for deposit, withdrawal, ledger credit/debit, mining, swap, trading and account/security lifecycle. Customer session-revocation and signup-credit notifications are implemented, but overall event coverage remains incomplete.
- [ ] Verify sound configuration end-to-end, including event mapping, actual browser playback, preferences, autoplay handling, post-commit timing and reconnect deduplication.
- [ ] Verify announcement persistence, scheduling/expiry and delivery/read reporting end-to-end against the exact head; campaign/delivery ledger, bounded retries, history counts and the due/expiry worker are implemented, but source-level coverage alone is not runtime acceptance.
- [ ] Finish ticket status/assignment/reopen/attachment authorization and customer/admin regression tests, including runtime concurrency.
- [ ] Add and verify real-time push transport where supported, retaining bounded polling/reconnect fallback for cPanel/shared hosting.
- [ ] Finish responsive/theme/accessibility regression checks and validate the release ZIP.
- [ ] Keep PR #95 draft/unmerged until remaining acceptance evidence is reviewed.

## Change log

- 2026-10-20: CI review of the sound-policy extraction found the Vitest include list only covered the theme-policy client test, so the existing notification-sound deduplication tests and the newly added sound-policy table tests were not actually being executed by `pnpm test`. Expanded the include list to cover `client/src/notification-sound-*.test.ts`, ensuring both client sound-policy suites run in CI rather than relying on TypeScript/build alone. Exact-head CI for this test-discovery fix is pending.


- 2026-10-20: Extracted the customer notification category-to-sound mapping into `client/src/notification-sound-policy.ts` and added table-driven coverage for deposit/withdrawal, ledger credit/debit, trading/mining rewards, support, announcements/promotions/platform updates, security, unknown future categories and missing categories. The header now uses the shared policy helper rather than an inline conditional chain. Previous exact head `6fd8b901652eaa5a9d470265daf89cdb37bb1d41` passed all three Stage 4 validation workflows (438 tests passed, 6 skipped; TypeScript/build; 1,177/1,177 browser checks; installer, disposable MariaDB/MySQL 8 recovery, and package validation). The new sound-policy extraction requires its own exact-head CI before acceptance.


- 2026-10-20: The latest full application-suite run exposed one stale assertion in `server/_core/attachmentPolicy.test.ts`: it still expected an 8-character token after the validator was intentionally tightened to the 48-character token generated by the presign route. Updated the core policy test to assert the new contract and reject weak/uppercase/nested identifiers. This is a test expectation correction, not a rollback of the security constraint; rerun is pending on the new head.


- 2026-10-20: Tightened support attachment registration to require the presign route's full 48-character lowercase hex token (192 bits of randomness); short legacy-looking tokens are rejected because registration otherwise accepted a weaker key shape than the route currently generates. Updated regression tests for valid full-entropy keys, short tokens, uppercase tokens, traversal, and nested paths. Exact-head CI remains pending.


- 2026-10-20: Presigned upload URL validation now returns the original provider URL unchanged after validating its HTTPS scheme and credential fields; it no longer serializes the parsed URL, which can normalize URL components. Added a regression for explicit default-port normalization. Expanded attachment-policy regressions for known-extension MIME mismatches with trailing dots/spaces and invalid configuration fail-closed behavior. Exact-head CI for these new tests is pending.


- 2026-10-20: Hardened support upload URL validation against WHATWG URL parser normalization: reject surrounding whitespace and embedded ASCII control bytes before parsing, preventing a provider-supplied signed bearer URL from being silently changed by the parser. Added unit cases for embedded tabs/newlines, DEL, and leading/trailing whitespace, plus route-level contract assertions that validation occurs before the URL is returned. New commits `eddf07c`, `433a5ac`, `356242b`, and `af3f6ee`; exact-head CI is pending and this is not yet release-accepted.


- 2026-10-20: Hardened the customer attachment-registration API so it rejects storage keys that do not match the support presign route's generated-key format before persisting attachment metadata. Added a source-contract regression assertion that validation precedes database registration. Exact-head CI and authenticated ticket/attachment integration checks remain pending.

- 2026-10-20: Tightened notification navigation validation to reject every percent-encoded ASCII control byte (`%00`–`%1F` and `%7F`), not only CR/LF and backslash. Added regression cases for encoded NUL, tab, vertical-tab, unit-separator and DEL. This is a security-focused source/test change; exact-head CI must verify it before release acceptance.
- 2026-10-20: Consolidated the Stage 4 product and acceptance scope in a repository document.
- 2026-10-20: Updated the customer notification router to enforce category visibility server-side.
- 2026-10-20: Updated customer header sound handling to use the persisted admin sound policy and respect local customer opt-in.
- 2026-10-20: Added category badges and responsive states to the full customer inbox, and made Mining activity notices category-aware and idempotent with focused tests.
- 2026-10-20: Added authorized ticket reopening on both portals with status-change notifications; deposit/withdrawal events remain gated on verified provider lifecycle records.
- 2026-10-20: Added a sound-policy readiness guard so the customer bell does not play a category sound before the saved visibility policy has loaded.
- 2026-10-20: Matched customer category-policy refresh to the five-second notification poll interval so admin visibility changes propagate promptly.
- 2026-10-20: Made Stake & Earn allocation/deallocation notifications category-aware and idempotent, persisted in the same transaction as their ledger and position state so committed debits/releases cannot silently miss the inbox notice.
- 2026-10-20: Split Mining activity from Mining reward and Trading activity from Trading reward so administrators can hide rewards independently and customers receive accurate badges.
- 2026-10-20: Added partial broadcast delivery counts and same-event-key retries for unchanged drafts to avoid duplicate notices when a broadcast only partly succeeds.
- 2026-10-20: Added a separately configurable administrator sound mapping for confirmed deposit notifications instead of reusing the generic wallet-credit sound; older saved sound policies fall back to the default until saved again.
- 2026-10-20: Recorded exact-head CI evidence for the previously completed feature head; subsequent sound-policy changes are awaiting their own checks and must not inherit that earlier pass status.

- 2026-10-20: Added a regression assertion that migration recovery diagnostics include portal migration `0054_notification_event_idempotency.sql`.
- 2026-10-20: Moved customer-only reference and theme override styles out of the initial global CSS payload; customer routes now load both stylesheets before first render to reduce the admin/landing CSS bundle without changing customer styling scope.
- 2026-10-20: Hardened support attachment validation to reject malformed bare MIME types (including values that could incorrectly match wildcard policies) and filenames containing control characters; added focused regression cases. Presign endpoint now distinguishes authentication failures from managed-storage failures, returns safe retry guidance for provider/network errors, and avoids leaking internal exception messages. These changes require fresh exact-head CI; earlier CI evidence does not apply.

- 2026-10-20: Wrapped ticket message persistence and ticket-status transition in one database transaction, with a ticket-row `FOR UPDATE` lock to serialize concurrent replies/status changes. Notification delivery remains post-commit and best-effort so notification outages do not make committed replies appear to fail. Add/retain concurrent close-versus-reply integration coverage before accepting this lifecycle hardening.

- 2026-10-20: Support attachment presigning now rejects malformed, non-HTTPS, or credential-bearing upload URLs and no longer forwards raw storage-provider error text to customers. The customer form's partial-failure message now distinguishes a created ticket from a failed attachment and warns against resubmitting the whole form, preventing accidental duplicate tickets.

- 2026-10-20: Customer ticket submission now stays disabled across the full create-ticket → presign → upload → attachment-registration flow. This prevents repeated clicks during a slow upload from creating duplicate tickets, and the error path avoids exposing provider exception text or falsely claiming an attachment was saved.

- 2026-10-20: Added `server/support-ticket-submit.contract.test.ts` to the normal Vitest suite. It guards the active customer Support Centre's full submission lock, attachment registration path, generic uncertainty/partial-failure messaging, and HTTPS-only presigned upload URL checks. These are source-contract regression tests; browser-level upload failure and real database concurrency checks remain required separately.

- 2026-10-20: Corrected the partial-upload failure message in the active Customer Support Centre: it now directs the customer to contact support with the existing ticket number instead of promising an attachment retry action that is not yet available in the current ticket UI. Added a source-contract regression assertion for this behavior.

- 2026-10-20: Extracted presigned upload URL validation into the pure helper `server/support-upload-security.ts` and added executable unit cases for valid signed HTTPS URLs, HTTP, script schemes, relative paths, embedded credentials, malformed URLs, empty values, and non-string input. The active support-center submission flow also has a source-contract regression test. CI must pass before treating these changes as fully verified.

- 2026-10-20: Added direct Vitest coverage for the attachment-policy helper: allowed MIME wildcards, extension-based fallback, malformed/control-character metadata, zero/negative/fractional/oversized files, and traversal or malformed storage keys. The existing source-contract tests also verify the active support form and secondary ticket form submission locks plus safe presigned URL response behavior.

- 2026-10-20: Customer ticket thread follow-up: customer ticket message/reply endpoints now return an explicit `NOT_FOUND` result when a ticket is not owned by the authenticated customer, and customer reply input is trimmed before minimum-length validation. The customer UI now uses generic reply/reopen failure guidance rather than echoing raw server error text, and the open-ticket status copy correctly says support is reviewing the request. Exact-head CI is pending; do not treat these latest edits as verified until the current PR-head workflows finish.

- 2026-10-20: Confirmed the admin reply route relies on the transactional `addTicketMessage` lifecycle for its message-keyed notification, avoiding a second route-level notification. Admin ticket reply input is now trimmed and missing tickets return a typed `NOT_FOUND` error. Added source-contract assertions for the single notification path, normalized admin input, and generic customer reply/reopen errors. These checks complement, but do not replace, database concurrency and browser interaction tests.

- 2026-10-20: Ticket lifecycle UX follow-up: resolved tickets now require an explicit reopen action before the customer can continue replying, matching the existing backend reopen lifecycle for both resolved and closed tickets. Added source-contract checks for that UI behavior and the database transaction/row-lock/closed-ticket guard. Browser and exact-head CI verification remains required.


- 2026-10-20: Admin ticket reply preflight now performs a targeted indexed ticket-ID lookup instead of loading the entire admin ticket inbox and scanning it for one record. This reduces query work as the inbox grows while retaining the typed `NOT_FOUND` response and transactional reply authorization. Added a focused source-contract assertion; exact-head CI is the verification gate, with no repeated local test loops.

- 2026-10-20: Backend support reply enforcement now matches the customer UI: customer replies to either `resolved` or `closed` tickets are rejected until the ticket is explicitly reopened. The check runs after the ticket row is locked inside the reply transaction, preventing stale UI state or a direct API call from bypassing the lifecycle. The focused source-contract assertion was updated once; runtime database concurrency remains part of final CI/disposable-DB verification.

- 2026-10-20: Admin broadcast targeting now normalizes the optional target ID before querying recipients. Invalid values (zero, negative, fractional, unsafe, NaN, or infinite) fail closed rather than being treated as a request to broadcast to every customer. Added unit regression cases and administrator-ID validation; exact-head CI remains the verification gate.

- 2026-10-20: Customer broadcast fan-out now processes recipients in bounded batches of 50 rather than launching one unbounded Promise.allSettled wave. Per-recipient failures are counted while later batches continue, and the aggregate result remains explicit. Added unit coverage for ordering, empty input, batch limits, and invalid batch sizes. Exact-head CI and load behavior still require verification.
- 2026-10-20: Hardened the shared notification text normalizer to normalize platform-specific line endings, reject invisible control bytes and non-text runtime values, enforce single-line titles/event keys, and validate the configured length bound while preserving multiline message bodies. Added focused unit regression coverage for event-key scoping/limits, recipient validation, bounded batching, category visibility, safe internal links, and post-settlement reward notice construction. These new tests and the latest source change require exact-head CI; prior passing workflows do not apply.


- 2026-10-20: Corrected two edge cases during the consolidated Stage 4 review: scheduled-announcement lifecycle metrics now count the persisted outcome (so a campaign that expires between the expiry sweep and scheduled batch is not falsely reported as published), and the SQL sound/event cursor explicitly preserves legacy notifications with a NULL category when other categories are disabled. Added focused contract regressions for both. These changes are committed on the current draft branch; exact-head CI remains pending and earlier green runs do not certify these commits.
