# Arbitrade Stage 4 — Notifications, Communications & Support Acceptance

**Status (reconciled 2026-10-21):** Stage 4 implementation scope is closed for the supported release; full-application package `v2.0.4-stage4-full` is published and verified. PR #95 is now merged into `integration/auth-installer-vps-safety` (merge commit `7f35d4d018b5bb1da0515ee37b1211dc045a66fb`). This merge does not mean the outstanding manual/end-to-end acceptance gates have passed; those remain open and owner-held.  
**Branch:** `feat/stage-4-live-notifications-support`  
**Pull request:** [#95 — Stage 4: live notifications, two-way support and real sound controls](https://github.com/stannmoye/Arbitrade_platform/pull/95)  
**Baseline:** Stages 1–3 and the hosting-required test were user-confirmed complete on 2026-10-20. Do not infer independent hosted verification from that report.

This file is the durable acceptance checklist for Stage 4. Add new agreed requirements here rather than relying on chat history alone. Keep checkboxes open until supported by implementation and test evidence.

## Stage 4 implementation-scope closure decision (2026-10-21)

**Decision:** close Stage 4 implementation work for the currently supported platform scope. The full-application package build and GitHub release are complete; manual/deployed acceptance remains separate and owner-held. This is a scope decision, not a claim that every unchecked acceptance scenario has passed.

- **Real-time transport:** accept bounded polling, retry/backoff and reconnect as the supported delivery mechanism for this release, including shared/cPanel hosting. Persistent push is deferred; it is not a Stage 4 implementation blocker.
- **Deposit/withdrawal success notices:** exclude provider-backed success integration until the platform has an authoritative persisted provider/custody completion lifecycle. Keep success notices blocked rather than inventing or inferring financial success.
- **Full application package release:** completed and verified as [`v2.0.4-stage4-full`](https://github.com/stannmoye/Arbitrade_platform/releases/tag/v2.0.4-stage4-full). The release ZIP has 54,550 entries, passes ZIP integrity, contains all six themes in compiled JS/CSS, includes Stage 4 notification/support code, migrations 0054–0058, five notification sounds, and matching version/build/provenance markers. This package publication does not authorize production deployment, production migrations, or real financial operations.
- **Existing implementation and CI:** the customer notification centre, category policy, sound controls/assets, campaign delivery persistence, two-way support, migrations, authorization/idempotency contracts, and CI build/test/browser/database checks are implemented and have passing exact-head workflows recorded below.
- **Verification-only residuals:** real-browser sound preference/autoplay/post-commit/reconnect scenarios; exhaustive source-to-event mapping; authenticated announcement/ticket/attachment/concurrency journeys; and full manual keyboard/screen-reader/reduced-motion acceptance remain recorded as unverified. Do not mark those checks passed or claim evidence that does not exist. Track them as release follow-up/limitations rather than adding more Stage 4 implementation scope.
- **Closure meaning:** Stage 4 can be treated as implementation-scope complete for planning and work tracking. PR #95 has since been merged into `integration/auth-installer-vps-safety`; that repository state supersedes older notes below that described it as draft/unmerged. The unchecked evidence items remain open. Merge status does not imply end-to-end acceptance or production approval.

## Follow-up implementation hardening and six-theme CI (2026-10-21)

- **PR #97 merged:** [Stage 4 follow-up — secure support attachments and six-theme acceptance](https://github.com/stannmoye/Arbitrade_platform/pull/97).
- **Merge commit:** `0e6ee4f072e35f143a2599703aa4fa29dccbe4c5`; tested source head before squash merge: `aff4b0134d5e8a793466c978ec7f89f31d49dba3`.
- **Attachment implementation:** presigning requires an authenticated current session and customer-owned ticket; new keys are ticket-scoped; duplicate key registration is rejected; attachment downloads are authorized against saved ticket/attachment ownership; duplicate ownership rows fail closed; signed download URLs must be safe absolute HTTPS URLs; signed upload/download responses are non-cacheable; customer and admin ticket threads now list attachment links.
- **Sound mapping:** failed/rejected/error transaction-console events use the configured failure sound while respecting local customer opt-in and the global administrator sound policy; existing event-ID deduplication is retained.
- **Six-theme browser coverage:** the Chromium acceptance matrix now includes Gold Luxe and its final preview selection. The workflow name remains historical (“Stage 3 five-theme validation”), but the script matrix covers all six configured themes.
- **Exact-head CI:** [Stage 3/browser/theme validation 39638356989](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39638356989), [installer validation 39638357162](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39638357162), and [mining database regression 39638356966](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39638356966) all passed on the PR head.
- **Release-package qualification:** the published `v2.0.4-stage4-full` ZIP predates PR #97. Do not claim that ZIP contains these follow-up changes. Build and validate a new full-application release only after the remaining owner-held acceptance/release gates are resolved.
- **Remaining gates:** manual sound autoplay/resume/reconnect behavior, exhaustive event-source coverage, full authenticated announcement/ticket/concurrency journeys, manual accessibility checks, and hosted-production acceptance remain open. No production deployment or migration was performed.

## Corrected full-application package release (2026-10-21)

- **Release:** [Arbitrade Stage 4 — Full Application (Six Themes, Corrected)](https://github.com/stannmoye/Arbitrade_platform/releases/tag/v2.0.4-stage4-full).
- **ZIP asset:** [`arbitrade-stage4-full-application.zip`](https://github.com/stannmoye/Arbitrade_platform/releases/download/v2.0.4-stage4-full/arbitrade-stage4-full-application.zip).
- **Tag/source commit:** `v2.0.4-stage4-full` points to `13c8fb48b5a4d0b599edd0a23fa99df2029980aa`.
- **Size/checksum:** 147,221,972 bytes; SHA-256 `b295b4634decad1618718efb9090c60461a72fbb76b776266dc10d4ffa3abd49`; 54,550 entries; ZIP integrity passed.
- **Validation:** [release workflow 39607099022](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39607099022), [installer validation 39607099227](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39607099227), [mining DB regression 39607098952](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39607098952), and [mining regression 39607099007](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39607099007) all passed.
- **Verified package contents:** six themes including Gold Luxe in compiled JS and CSS; Stage 4 notification/support features, migrations 0054–0058, five notification sounds, deployment guide, and matching installer version/build/provenance files.
- **Baseline comparison:** Stage 3 baseline 177,853,153 bytes/49,863 entries; corrected release 147,221,972 bytes/54,550 entries. The ZIP is smaller but contains 4,687 more entries; required feature inventory and compiled assets were checked directly.
- **Remaining gates:** historical browser evidence covered five themes, not Gold Luxe. Manual keyboard/screen-reader/reduced-motion acceptance, Gold Luxe-specific browser acceptance, broader Stage 4 event/source and sound/reconnect verification, and hosted production acceptance remain open. No production deployment or migration was performed by this release workflow.

## Latest completed CI checkpoint (historical implementation checkpoint; 2026-10-21)

- **Verified PR head:** `37ce349b052c0c513b9130c89d9a17c27287dfa3`. PR #95 is open, draft, unmerged, and mergeable.
- **Exact-head CI:** [Mining database regression, run 39561522280](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39561522280), [Installer validation, run 39561522328](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39561522328), and [Stage 3 five-theme validation, run 39561522424](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39561522424) all completed successfully on this exact head.
- These workflows passed on `37ce349`; because this checkpoint is being added in a documentation-only commit, verify the resulting head's CI separately before describing it as exact-head green.
- **Checklist count independently recounted:** 37 checked; 11 unchecked. Do not close remaining gates merely because CI is green.
- **Important evidence qualification:** the downloaded 848-check browser report with 848 passed and zero failures came from the prior documentation-only head; the Stage 3 Chromium workflow also succeeded on the exact head above. The installer generated its validation package on the exact head. CI artifacts are not production deployment or owner sign-off.
- **Remaining gates:** provider-backed deposit/withdrawal success is blocked pending an authoritative persisted provider/custody lifecycle; persistent push is missing pending an owner/platform release decision; dedicated sound, exhaustive event-source, authenticated announcement/ticket/attachment authorization and concurrency journeys remain unverified; comprehensive manual accessibility and owner-level production verification remain open.
- **Safety boundary:** no production deployment, production migration, or financial operation was performed. Keep this PR draft and unmerged until required acceptance and owner release gates are resolved.

## Historical consolidated batches

The dated checkpoints below are retained as historical evidence; the latest-head checkpoint above governs current status.

## Latest consolidated batch (2026-10-20)

- **New live-cursor visibility regression coverage:** commit `bfa3aaff18924848bd441181e24b56c76c99d26b` adds executable tests proving the live event cursor uses the same category filter as the inbox, keeps NULL/unknown categories visible by default, and restores records when a category is re-enabled.
- **Exact-head validation for `bfa3aaff`:** [Stage 3 five-theme validation run 39501532090](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39501532090) passed application/theme-policy tests, TypeScript, production build, and Chromium viewport/five-theme smoke matrix. The browser workflow uploaded `stage-3-browser-acceptance` from this exact head.
- [Installer validation run 39501532095](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39501532095) passed all jobs, including MySQL 8 compatibility/recovery, fresh MariaDB, application tests, TypeScript, production build/server smoke, migration regression, deployment packages, and Stage 1 validation dashboard. [Mining database regression run 39501532263](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39501532263) passed.
- These results validate the application code at `bfa3aaff`; they do not close Stage 4 as a whole. The category-visibility helper is covered by unit tests, while end-to-end live reconnect, actual sound preference mapping/timing, and remaining real-event lifecycle coverage remain open.


- Fixed the TypeScript failure in `listNotificationEventCursor` by guarding Drizzle's possibly-undefined `or()` result before adding it to the SQL predicate. This preserves visibility for legacy `NULL` categories while respecting disabled-category filtering.
- Stake & Earn reward and maturity-release notifications carry recipient-scoped stable event keys, explicit `ledger_credit` categories, and priorities; notification rows remain in the same database transaction as their ledger entries. Contract coverage checks idempotency/category metadata and transaction ordering.
- Added admin wallet-adjustment notification boundary contract coverage. CI exposed a brittle expected-title expression in that contract test; the assertion now matches the implementation's template-literal title.
- Added manual trade settlement notices for principal release and positive rewards. They use stable settlement-reference event keys, explicit `ledger_credit` / `trading_reward` categories, and best-effort delivery after settlement commit; zero/non-positive rewards do not generate reward notices. Contract tests cover commit ordering and notice failure handling.
- Expanded support notification contract coverage to assert ticket-created notices follow the committed ticket/opening-message transaction, and ticket-reopen notices follow a successful conditional status transition. Existing contract checks cover reply/reopen authorization, attachment ownership, and notification-failure visibility.
- Code validation commit: `d6486812a9a8324926c95b55afda89150cfaa41a` (tracker-only changes are excluded from the application code changes).
- **Successful validation on that commit:** Stage 3 five-theme workflow [39500828919](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39500828919) passed application tests (474 passed, 6 skipped), TypeScript, production build, and the real-browser viewport/five-theme smoke matrix (**1,182 checks passed, 0 failures**). Browser evidence was uploaded as workflow artifact `stage-3-browser-acceptance`.
- Installer validation [39500828928](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39500828928) passed, including fresh MariaDB 11.4, MySQL 8 compatibility/recovery, installer/migration regression tests, application unit tests, TypeScript, production build/server smoke, deployment packages, and the Stage 1 dashboard. Mining database regression [39500828982](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39500828982) also passed.
- These successful runs validate the application code at `d6486812a9a8324926c95b55afda89150cfaa41a`; they do not certify all Stage 4 requirements.
- **Verification state:** keep Stage 4 release acceptance open. These additions improve event-boundary coverage but do not close provider-gated deposit/withdrawal integration, broad real-event coverage, full browser sound preferences/reconnect acceptance, ticket assignment/runtime acceptance, transport, accessibility, or release sign-off.

## Product requirements

### A. Customer notification centre
- [x] Replace all hard-coded bell counts with the authenticated customer's unread, visible notification count.
- [x] Show recent notifications in an accessible, responsive popover and a full notification centre.
- [x] Show category badges and meaningful subjects/titles: Ticket, Announcement, Update (including platform upgrades), Promotion, Deposit, Withdrawal, Balance credit, Balance debit, Mining reward, Trading reward, Security, Transaction, Account.
- [x] Support read/unread status, mark one read, mark all read, timestamps, links to the relevant page, empty/loading/error/retry states and pagination/history.
- [x] Keep disabled categories out of the bell, unread count and customer inbox while retaining the underlying records; re-enabling a category makes eligible records visible again.
- [x] Poll or push updates safely with bounded retries/reconnection and no duplicate notifications or sound on reconnect.

### B. Central admin communications form
- [x] Provide one canonical customer communication workflow for announcements, platform updates/upgrades and promotions, with subject, message, category, priority, optional safe internal link and recipient selection.
- [x] Target exactly one selected customer or all customer accounts; reject invalid/non-customer recipients and enforce administrator authorization on the server.
- [x] Show the subject and correct category badge on the customer side.
- [x] Persist drafts/publishing history, scheduling/expiry where implemented, and delivery/read reporting; clearly distinguish published, delivered, read and failed states, including partial broadcast counts and safe retries.
- [x] Do not turn message publishing into a financial operation.
- [x] Ensure announcements submitted from the agreed support/communications workflow reach the same notification pipeline; avoid maintaining unrelated duplicate publishing implementations.

### C. Admin category visibility policy
- [x] Persist independent switches for account, transaction, deposit, withdrawal, ledger credit, ledger debit, trading activity, trading reward, mining activity, mining reward, support/ticket, announcement, promotion, platform update/upgrade and security.
- [x] Apply policy server-side as well as in the UI so disabled categories are consistently hidden in the customer bell, unread count and inbox.
- [x] Policy changes take effect promptly on connected customer sessions.
- [x] Visibility changes must never disable, cancel, delay or falsify the underlying transaction, reward, ticket, ledger write or security event.
- [x] Keep changes auditable and provide clear saved/error feedback.

### D. Two-way ticketing
- [x] Improve customer and administrator ticket forms with validation, subject, category, priority, reference and clear status.
- [x] Keep replies in one persisted conversation with author, role, timestamps and unread reply indicators.
- [x] Notify the other participant on ticket creation, reply, assignment/status change, resolution and reopening where applicable.
- [x] Validate attachments by type/size and authorize access to the owning ticket; do not trust client-supplied customer IDs.
- [x] Support queue filtering, assignment, lifecycle transitions, history and error/retry feedback.

### E. Five real sounds and preferences
- [x] Ship five actual audio files (not oscillator-generated tones) and preview them in admin settings.
- [x] Let an administrator choose the default sound for customer notifications and configure event-specific sounds/enablement for balance credit/debit, deposit, withdrawal, trading, mining, support, announcements, opportunities and failure/security where appropriate.
- [ ] Respect the customer's local opt-in/mute preference, browser gesture/autoplay limits and volume controls where supported.
- [ ] Play financial success sounds only after the authoritative operation has committed successfully; never on pending, failed, reversed or uncommitted activity.
- [ ] Deduplicate playback on polling, retries, reconnection and repeated event delivery.

### F. Real event integration
- [x] Deposit and withdrawal UI flows are currently provider-gated/mock or blocked; success/status notifications remain pending until a real persisted request lifecycle exists. Never invent successful deposits or payouts merely to make the bell look active.
- [ ] Connect notifications to verified, persisted event boundaries for deposits, withdrawals, ledger credit/debit, trading, mining rewards, swaps, upgrades, promotions, tickets, account and security lifecycle.
- [x] Use stable event identifiers, scoped by recipient, with database-enforced idempotency.
- [x] Do not fabricate a financial success event or present simulated estimates as withdrawable funds.
- [x] Keep the internal database ledger authoritative; no external payment provider or live-money execution should be added implicitly by notification work.

### G. Engineering quality and release
- [x] Use database-backed persistence and forward-only, tracked migrations compatible with MySQL 8 and MariaDB.
- [x] Preserve customer/admin authorization and cross-account isolation; validate inputs and safe internal links.
- [x] Add unit, router/authorization, migration, idempotency, and event-boundary tests.
- [x] Run exact-head type-check, unit tests, production build, installer validation, migration tests on disposable MySQL/MariaDB schemas, and review every workflow result.
- [ ] Perform responsive, keyboard, screen-reader, reduced-motion and theme/accessibility regression checks.
- [x] Verify the release ZIP is built from the verified source; do not deploy or apply migrations to the user's production host/database from this PR.
- [x] Record known limitations and honest evidence; CI passing alone is not hosted acceptance.

## Checklist reconciliation (2026-10-21)

The product-requirement checkboxes now distinguish implementation/evidence from remaining acceptance gates. Checked items are supported by current source inspection, focused contract/unit tests, disposable MySQL/MariaDB CI, the latest successful PR checks, or the fresh Chromium matrix (848/848). The remaining unchecked items intentionally cover provider-dependent financial lifecycle integration, exhaustive event-source proof, real browser sound preference/autoplay/post-commit timing, full runtime ticket/announcement E2E, persistent push transport, manual assistive-technology acceptance, and final release/build verification. No checkbox below is considered complete solely because a UI component exists.

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
5. **Live-update transport — OPEN:** the category-visibility parity unit tests passed on `bfa3aaff` (inbox/live cursor use identical filtering, NULL/unknown categories remain visible by default, and re-enabled categories reappear). Still verify end-to-end bounded polling/reconnect, duplicate prevention, and prompt policy propagation.
6. **Final acceptance and release — OPEN:** finish keyboard/screen-reader/reduced-motion/accessibility review, responsive/theme checks, verify the release ZIP corresponds to the validated source, and record limitations before release sign-off.

## Remaining before Stage 4 can be called complete
- [x] Run exact-head validation workflows on PR #101 head `b0141a8323afe72c167db435604ff4c0d3fb767b`: [Stage 3 six-theme/Chromium validation 39644490200](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39644490200), [installer validation 39644490192](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39644490192), and [mining database regression 39644490317](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39644490317) all passed. PR #101 is merged as `1a34927b1850f4269bb21c44620e52414d417fff`.
- [x] Exercise migration assertions/recovery with disposable MySQL 8 and MariaDB on that exact head via installer validation run 39644490192; no production database was used.
- [ ] Verify all real event sources for deposit, withdrawal, ledger credit/debit, mining, swap, trading and account/security lifecycle. Customer session-revocation and signup-credit notifications are implemented, but overall event coverage remains incomplete.
- [ ] Verify sound configuration end-to-end, including event mapping, actual browser playback, preferences, autoplay handling, post-commit timing and reconnect deduplication.
- [ ] Verify announcement persistence, scheduling/expiry and delivery/read reporting end-to-end against the exact head; campaign/delivery ledger, bounded retries, history counts and the due/expiry worker are implemented, but source-level coverage alone is not runtime acceptance.
- [ ] Finish ticket status/assignment/reopen/attachment authorization and customer/admin regression tests, including runtime concurrency.
- [x] Accept bounded polling/retry/backoff/reconnect as the supported delivery transport for this release, including shared/cPanel hosting. Persistent push is deferred until a supported deployment transport and lifecycle are agreed; it is not a Stage 4 release blocker.
- [ ] Finish manual keyboard/screen-reader/reduced-motion/zoom/reflow acceptance and rebuild/validate a new full release ZIP after follow-up fixes. The six-theme Chromium viewport smoke and production package CI passed on PR #101's exact head, but the published ZIP predates PRs #97–#101.
- [x] Reconcile PR state with GitHub: PR #95 is merged; remaining acceptance evidence and owner-held production gate stay open.

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

- 2026-10-20: Added live event-cursor category visibility parity and re-enable regressions. Exact-head CI on `bfa3aaff` passed application/theme tests, TypeScript, production build, browser viewport/five-theme checks, installer/migration/package validation, and mining database regression. End-to-end transport and Stage 4 release acceptance remain open.

- 2026-10-21: Exact-head validation for commit `84555c3a801f00cd8e4817e8f7a4598a6c433964` completed successfully: [five-theme/browser validation run 39515026164](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39515026164), [installer and release validation run 39515026461](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39515026461), and [mining database regression run 39515026424](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39515026424). This includes the new event-key payload-consistency regression cases in the validated head. These passing checks do not close Stage 4 acceptance areas that still require browser-level sound/reconnect behavior, broader event-source proof, ticket assignment/concurrency acceptance, accessibility, or final release sign-off.

- 2026-10-21: Hardened browser sound deduplication so duplicate notification IDs in a single live-cursor batch can trigger at most one sound, malformed/non-positive IDs are ignored, and missing categories consistently use the `account` visibility preference. Added focused regression cases for duplicate rows, malformed IDs, and account-category fallback. These are code-level changes; wait for exact-head CI before marking sound/reconnect acceptance complete.

- 2026-10-21 combined support-lifecycle regression batch: expanded `server/support-ticket-notification.contract.test.ts` to check that admin reply notifications are sent only to the ticket customer after the message/status transaction commits, use the committed message ID for idempotency, and remain best-effort. Added coverage that customer replies fan out to admins with the same message-specific key and preserve urgent/high ticket priority. This strengthens contract coverage; ticket assignment and runtime/browser lifecycle acceptance remain open.

- 2026-10-21 combined live-cursor reliability batch: the notification event cursor now orders by descending creation timestamp and then descending notification ID, giving deterministic ordering when timestamps tie. Added a contract regression assertion for the exact ordering. This reduces unstable cursor windows during frequent polling; it does not by itself prove browser reconnect acceptance or close the live-transport work area.

- 2026-10-21 combined attachment-safety batch: support attachment metadata validation now rejects executable and active-content filename suffixes (including compound names such as `payload.exe.png` and `report.pdf.html`) even if the client declares an allowed image MIME type. Added regression cases for executable, script, HTML, SVG, and compound-extension names. This is defense-in-depth for untrusted support uploads; exact-head CI and storage-serving behavior still need verification.

- 2026-10-21 event-source audit: inspected the active database notification call sites for ticket lifecycle, signup credit, wallet adjustment, and manually settled trade flows. This pass did not find deposit/withdrawal lifecycle notification hooks in `server/db.ts`; provider-backed deposit/withdrawal status notifications therefore remain an explicit integration gap and must not be simulated as successful financial events. Follow up by locating the authoritative provider/admin transition handlers and wiring notifications only after persisted state changes.
- 2026-10-21 combined CI observation for code head `e7ee2d8f9f6a8ede8e5bb5fcb62cf66dd359dfb9`: mining database regression passed; five-theme workflow's application tests, TypeScript, and production build passed while browser smoke was still running; installer validation was still running. These results apply to that code head only.

- 2026-10-21 browser sound batch: when polling returns multiple new notifications, choose the highest-priority event for the single sound (urgent, then high, normal, low; newest ID breaks ties). Added unit coverage for mixed priorities and empty batches. This does not by itself establish full browser autoplay or reconnect acceptance.


## Consolidated follow-up audit (2026-10-21)

- **Current code head reviewed:** `ad6ec28eef027f849b7c018883f2ab6db3d2c741`. Its installer workflow [39516144881](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39516144881) completed successfully, including TypeScript, application unit tests, production build/server smoke, installer/migration regression, fresh MariaDB, MySQL 8 compatibility/recovery, deployment packages, and the Stage 1 validation dashboard. Mining database regression [39516144877](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39516144877) also completed successfully.
- The exact-head five-theme workflow [39516144885](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39516144885) passed TypeScript, application/theme-policy regression tests, and production build. Its Chromium viewport/five-theme smoke matrix was still running at the time of this update, so browser acceptance remains pending until that job concludes.
- Reviewed notification sound selection and tests: new unread events are filtered by category visibility and deduplicated across polling/reconnect history; one sound is selected by priority (urgent, high, normal, low) and then newest ID. This is unit/contract coverage, not proof of browser autoplay, customer preference behavior, or every event's post-commit timing.
- **Confirmed ticket assignment implementation gap:** the current `support_tickets` schema has no assignment-owner column, and the reviewed customer/admin support router exposes create/reply/reopen but no assignment mutation. Do not mark assignment complete or add an assignment notice until the schema migration, authorized admin mutation, queue UI, audit behavior, and post-commit notification are implemented and tested together.
- **Deposit/withdrawal remains gated:** the audit still has not identified an authoritative persisted provider/admin status-transition boundary. No financial success notifications should be synthesized to fill the gap.
- **Stage 4 remains open.** Database migration verification is the only fully completed one of the six tracked work areas. Ticket assignment, provider-backed financial lifecycle, browser sound acceptance, reconnect transport, accessibility, and release sign-off remain outstanding.

- 2026-10-21 exact-head combined CI refresh for `cba78871b7da52dd74c2a59f7ac465f970901fa7`: the five-theme workflow [39516374917](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39516374917) completed successfully across TypeScript validation, application/theme-policy regression tests, Chromium viewport/five-theme smoke matrix, and production build. The mining database regression [39516374896](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39516374896) also completed successfully. Installer validation [39516374907](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39516374907) remained pending with no jobs exposed when checked; it is not counted as passing. These CI results validate the tested code paths, but do not close the remaining Stage 4 runtime and product acceptance gates.

- 2026-10-21 refresh for current PR head `891f9351583b29bcc4add0e838b1f037e63ff6ca`: [Mining database regression checks](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39516726354) completed successfully. In [Stage 3 five-theme validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39516726264), TypeScript validation, application/theme-policy regression tests, and production build succeeded; the Chromium viewport/five-theme smoke matrix was still in progress at the latest job poll. [Installer validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39516726344) remained pending with no jobs exposed. These are status snapshots, not final workflow conclusions; no pending job is counted as a pass.
- Support-assignment audit reconfirmed that `support_tickets` has no assignee field and the admin router exposes list, message, reply, and reopen operations but no assignment mutation. That earlier audit note predates the subsequent assignment implementation; see the implementation entry below. Do not count the area complete until fresh validation passes.
- Financial-event audit remains gated: the reviewed DB/router surface did not reveal the authoritative persisted deposit/withdrawal lifecycle transition. Notifications must attach to the actual committed transition, not to a request attempt or speculative status.


- 2026-10-21 implementation batch: support-ticket assignment is now wired through the ticket schema, a nullable assignee migration, an admin-only tRPC mutation and assignee query, the live admin ticket desk selector, transactional audit entries, post-commit assignee notification, and a focused source-contract test. The portal migration runner's explicit allowlist now includes `0056_support_ticket_assignment.sql`, with a regression assertion in its safety test. This is implementation progress, not a verified area completion: the latest commit's TypeScript, application tests, migration/database CI and browser smoke results must be reviewed before acceptance.
- The funding-flow audit also confirms that the customer UI describes deposits as a mock provider flow and withdrawals as blocked pending provider/custody approval. No authoritative completed deposit/withdrawal transition was found in the inspected application code, so those event notifications remain correctly unimplemented rather than being triggered by a simulated/request-only action.


- 2026-10-21 exact-head validation refresh for PR head `4c02db9005889a857941543d8506dcdeb11d9d87`: the [Stage 3 five-theme validation workflow](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39518956798) completed successfully. Its Chromium viewport/five-theme matrix reported **1,182 checks passed, 0 failed**, and uploaded the [browser evidence artifact](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39518956798/artifacts/12310381110) (SHA-256 `246dbd95f5a1b1609aed695ffcf3bc9a48057157c722b42ce0284177fb9f3401`). The [installer validation workflow](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39518956800) also completed successfully: application unit tests, fresh MariaDB installation, MySQL 8 compatibility/recovery, syntax, TypeScript, installer/migration regressions, production build/bundle budgets/server smoke, and universal deployment ZIP assembly/upload all passed. The [universal deployment artifact](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39518956800/artifacts/12310171819) was uploaded (SHA-256 `562391fbf7756813722d4a461456f23384162ea442c452bd44a5b6ee29385555`). The [mining database regression workflow](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39518956767) also passed. These results are CI evidence for the tested PR revision, not production deployment evidence.

- Remaining Stage 4 release gates are still open despite this green CI batch: prove notification sound behavior during real browser polling/reconnect and preference changes; complete end-to-end event-source and post-commit timing coverage; validate support assignment and concurrent ticket lifecycle behavior beyond source-contract tests; complete accessibility/release review; and integrate deposit/withdrawal notifications only after an authoritative provider-backed persisted transition exists. The funding-flow audit still finds no such completed provider transition, so no simulated financial-success notifications are permitted. PR #95 remains draft/unmerged; no production migration or deployment was performed.


## Notification history pagination follow-on (2026-10-21 — validation pending)

- Added keyset pagination for the authenticated customer notification history, ordered by `createdAt DESC, id DESC`, with validated opaque cursors and a hard maximum page size of 100 (UI requests 50).
- Kept the global unread badge independent of the current page; category visibility and expired-campaign suppression apply to both history pages and unread counts.
- Added a composite `customer_notifications(userId, createdAt, id)` index through tracked portal migration `0057_notification_history_pagination.sql`. The disposable MySQL/MariaDB assertion script now checks the migration tracker checksum and exact index column order.
- The inbox now supports loading older records while merging fresh first-page data by notification ID. The existing sound event cursor remains separate.
- **Validation on code SHA `f2712bf1bd615fd6ba076be783fdb9555c310886`:** focused pagination tests passed as part of the application suite; TypeScript, production build, all installer/migration jobs (including disposable MySQL 8 and MariaDB verification of migration 0057), mining database regression, and the five-theme browser smoke matrix (848 checks, 0 failures) passed. See [five-theme run](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39524335792), [installer run](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39524335807), and [mining DB run](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39524335894). This is not full authenticated end-to-end acceptance; all other Stage 4 release gates remain open.


## Cross-feature notification source audit (2026-10-21 — source review, not runtime acceptance)

The following source inspection helps scope final acceptance. It is **not** a claim that every browser path, database failure mode, or production event has passed end-to-end testing.

| Event family | Current source boundary | Current assessment |
|---|---|---|
| Customer support ticket creation | `server/db.ts` creates the ticket before emitting customer/admin notices; keyed recipient-specific events are used. | Implemented at source level; ticket ownership, notification delivery and full customer/admin browser lifecycle still require authenticated E2E acceptance. |
| Support replies, reopen and assignment | `server/db.ts` uses committed ticket/message results before best-effort notification delivery; assignment has an audit transaction. | Source and contract coverage exist; concurrency, recipient visibility and unread/reply parity still require runtime verification. |
| Administrator wallet credit/debit | `server/db.ts` commits balance and ledger changes in a transaction, then attempts the notification best-effort. | Post-commit boundary is visible in source; test failures must not misreport a committed adjustment. |
| Signup credit | `server/db.ts` persists the balance/ledger before a stable `signup-credit:<userId>` notice and retries the notice safely on repeated provisioning. | Idempotent notice path is present; full provisioning/retry acceptance remains open. |
| Trade settlement/manual settlement | `server/db.ts` and `server/routers.ts` emit keyed notices after the settlement function returns; optional notification failures are logged without reversing the result. | Source contract tests exist; broader coverage across all supported trade/ledger transitions is not yet exhaustive. |
| Mining package/boost | `server/mining.ts` uses `createMiningNotification(conn, ...)` at transaction-scoped paths. | Notice is coupled to the database transaction; validate rollback/commit behavior through disposable database tests. |
| Mining swap/conversion and rewards | `server/mining.ts` emits swap notices after the committed conversion result and reward notices after reward posting; keyed events are used. | Focused contract tests exist; all worker retry and conversion failure paths are not proven by browser acceptance. |
| Session revocation/security | `server/routers.ts` emits a security notice around the session-revocation procedure; a focused contract test exists. | Verify the exact persisted revocation boundary and authenticated customer visibility in the final acceptance pass. |
| Announcement campaigns | `server/db.ts` records campaign/recipient delivery state and creates keyed in-app notification rows. | Persistence and retry contracts exist; “delivered” means persisted in-app notification row, not email/push or human viewing. Scheduling, expiry and read parity still need browser E2E checks. |
| Deposit/withdrawal success | No authoritative persisted provider/custody completion transition was established in the audited implementation. | **Blocked.** Do not create financial-success notifications from request submission, mock status, or unverified callbacks. |
| Realtime push/reconnect | Current client behavior uses polling and a bounded event cursor; no persistent push transport is established. | **Incomplete.** Test polling/reconnect/deduplication and document push as an outstanding requirement. |

Acceptance rule: each financial-success notification must be tied to the authoritative persisted business result and must not fire for a pending, failed, reversed or rolled-back operation. Best-effort notification delivery must not turn a committed business operation into an apparent failure.


## Follow-on exact-head verification (2026-10-21)

Latest verified application code: `5b7db5abef6c6bc7fce17a47ebbec8d730092849`.

- [Stage 3 five-theme validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39528023849) passed TypeScript, application/theme regression tests, production build, and the Chromium viewport/five-theme smoke matrix.
- [Installer validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39528023868) passed installer/migration safety, disposable MariaDB and MySQL 8 compatibility/recovery, authenticated database integration, production server smoke, and deployment packaging. The database integration step exercised ticket creation/ownership, cross-account denial, admin-only assignment, idempotent assignment/audit, resolution, reopening and customer reply against a disposable MariaDB schema.
- [Mining database regression](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39528023846) passed.
- Added a race guard so a concurrent in-flight campaign delivery cannot restore a withdrawn/expired recipient status; a created notification remains linked for campaign suppression even when withdrawal wins.
- The opt-in database integration test now tracks and removes all temporary users and support-ticket fixtures, correcting a cleanup leak in the prior test suite.
- This is exact-head CI and disposable database evidence, not hosted production acceptance.

**Still open:** no authoritative persisted provider/custody deposit or withdrawal completion flow exists, so those financial-success notifications cannot be implemented safely from the current repository. Persistent server push is not present; bounded polling with backoff/reconnect is the current fallback. Full browser sound/autoplay preference behavior, assistive-technology accessibility, broader attachment/concurrency acceptance, and final release sign-off remain open. Keep all relevant checkboxes above open until the corresponding evidence is complete. PR #95 remains draft and unmerged.



### 2026-10-21 customer notification accessibility semantics checkpoint

- Added labelled notification-history region semantics, heading/description associations, `aria-busy` during first/older-page loading, polite loading/empty status announcements, and contextual names for individual and bulk read controls in `client/src/App.tsx`.
- Added `server/customer-notifications-accessibility.contract.test.ts`.
- Focused verification passed: 6 Vitest files / 42 tests covering notification polling, sound deduplication/policy/volume, pagination, and the accessibility contract; `pnpm check` passed; `git diff --check` passed after `pnpm install --frozen-lockfile` restored the declared dependencies.
- This closes the concrete source-level semantics gap for the customer notification centre, but the broader accessibility criterion remains open for keyboard-only, screen-reader, reduced-motion, hosted browser, and manual assistive-technology evidence. No full Stage 4 completion claim is made.


- Implementation/test commit: `83583cac8bfe92279f6f9ee9fe866ac8d52e4f12`; documentation preservation commit: `d19e6b18daabfa438a8a4978146fcec39270dc19`. The checklist remains in progress; no full Stage 4 acceptance or completion claim is made.

### 2026-10-21 source browser acceptance checkpoint

- At source head `126f3fb38829453e44d46c5f009b8200c3792fab`, the existing Chromium `scripts/stage2-browser-acceptance.cjs` matrix passed **848/848 checks, 0 failures** against the source dev server. This provides fresh responsive/theme/focus/navigation and browser audio-asset evidence.
- The existing axe audit was attempted but could not start because `axe-core` is not declared or installed; it is not counted as a pass. Manual screen-reader, keyboard-only, reduced-motion, and assistive-technology acceptance remains open.
- No production build, deployment, provider configuration, or production data operation was performed. Stage 4 remains open pending the documented blockers and final owner/build verification.

### 2026-10-21 mining-admin event-key fix

- Fixed five administrative mining notification paths that previously omitted stable event keys, preventing retry-induced duplicate customer notifications.
- Added `server/mining-admin-notification-idempotency.contract.test.ts`; focused notification/sound/idempotency validation passed **69/69 tests**, and `pnpm check` passed.
- The exhaustive event-source checklist item remains open because this fix improves source coverage but does not replace full authenticated runtime acceptance across every event family.

### 2026-10-21 exact-head CI completion and package provenance

- Exact current head `055eb0750d8aca2576f4f46753828e844f5cb9da` completed all required PR workflows: **12 successful, 2 skipped, 0 failed, 0 pending**. This includes TypeScript, application regression, production build/server smoke, installer/migration regression, fresh MariaDB, MySQL 8 compatibility/recovery, mining database regression, Chromium viewport/five-theme smoke, and deployment packaging.
- Installer workflow [39532015607](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39532015607) published the exact-head artifacts `arbitrade-universal-installer` (artifact `12315442491`, 2,816,168 bytes) and `validated-production-dist` (artifact `12315837199`, 1,078,584 bytes). These are CI provenance artifacts, not a production deployment.
- This closes release-package provenance at the CI level. Manual accessibility review, authenticated runtime acceptance, persistent push decision, provider-backed deposit/withdrawal lifecycle, and final owner-level release verification remain open.

### 2026-10-21 audio unlock fix

- Fixed the no-op `unlockNotificationAudio()` path used before asynchronous wallet/trade sound playback. The implementation now performs a best-effort gesture-triggered unlock using a shipped muted WAV asset, immediately stops it, and deduplicates in-flight attempts.
- Added `client/src/notification-audio-unlock.contract.test.ts`; focused sound/notification validation passed **87/87 tests**, and `pnpm check` passed.
- This is an implementation improvement, not full browser acceptance. Preference persistence, autoplay behavior across browsers, post-commit timing, reconnect deduplication, and authenticated runtime evidence remain open.


## Mandatory completeness audit refresh — 2026-10-21

- Live PR branch head at audit start was `e5086dde4b7fc829908b1d2305b7623b2b80e987`, newer than the previously recorded work-unit-14 starting checkpoint. PR #95 is still open/draft on the expected feature/base branches.
- Added [`docs/stage-4/REQUIREMENT_EVIDENCE_MATRIX.md`](stage-4/REQUIREMENT_EVIDENCE_MATRIX.md), reconciling the checked/unchecked product checklist, support inbox specification, combined verification batch, progress log, handoff and all 77 PR-changed paths against implementation, tests, migration/security evidence and exact-head CI.
- Latest pre-fix CI was not wholly green: Stage 2 run `39532989387` passed typecheck, application/theme tests, production build and Chromium viewport/five-theme smoke (artifact `stage-3-browser-acceptance`, 10,008,466 bytes); Mining DB run `39532989642` passed. Installer run `39532989435` failed only its strict bundle budget: JS entry `409,826` raw bytes vs `409,600`, gzip `92,785` vs `225,280` (within limit). Installer migration regression, syntax, fresh MariaDB, MySQL 8 compatibility/recovery and Stage 1 dashboard passed. Duplicate installer app-test and typecheck jobs and deployment-package job were skipped; equivalent test/typecheck passed in Stage 2, but no current-head package artifact was produced.
- Safe fix: `client/src/App.tsx` now lazy-loads admin-only `AdminAppearance` instead of eagerly importing it for all users. The budget thresholds are unchanged. Local Vite production-client build measured entry JS `402,892` raw / `91,279` gzip (limits `409,600` / `225,280`); entry CSS measured `521.20 kB` raw / `90.77 kB` gzip (limits `620 KiB` / `110 KiB`). This is local build evidence only; new exact-head Actions is required before closure.
- Local validation after the fix: `pnpm check` passed; full `pnpm test` passed **63 files / 519 tests**, with **2 files / 8 tests skipped**; focused Stage 4 regression passed **9 files / 108 tests**; `pnpm build:static` and explicit bundle checks passed; `git diff --check` passed.
- No production host/database, provider transaction, balance, merge, or deployment was touched. The final production release build and owner-level verification remain open. No remaining product/runtime item has been closed based solely on this local run.

At this audit checkpoint the checklist has **37 checked and 11 unchecked boxes**. The unchecked count includes repeated acceptance gates (for example, event integration appears in both the product and release sections); it is not a count of 11 independent defects. The matrix explains every open criterion.


### Bundle fix exact-head CI and browser follow-up

- Code/matrix commit `547a47ff6ceb466cd55dc794f3397b4ca9bc8275` fixes the strict 400 KiB entry-JS budget with a narrow admin-only `AdminAppearance` lazy load; no limits were changed. Installer run [39534877107](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39534877107) passed production build, budget, server smoke, migration tests, MySQL 8/MariaDB validation and package creation; artifacts `arbitrade-universal-installer` (2,829,572 bytes) and `validated-production-dist` (1,079,233 bytes) were uploaded. Mining regression [39534877108](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39534877108) passed.
- Stage 3 run [39534877300](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39534877300) passed build, TypeScript and app/theme tests but failed the Chromium job on a synchronous browser-harness assertion immediately after navigating to the newly asynchronous lazy-loaded admin appearance screen. Its uploaded browser artifact was inspected; it reported this one failure. This run is not being counted as a pass.
- Updated `scripts/stage2-browser-acceptance.cjs` to wait for that screen, observe focused table regions, and still require real keyboard horizontal scrolling. Local full Chromium acceptance then passed **848/848**. The updated harness still needs exact-head Actions. Checklist stays open until that run is green.


### Final exact-head validation for the implementation/test changes

On code/test SHA `2e0da5f05285965ebcc462b98dc20d6f7e544a11`, all three workflows completed successfully: [Stage 3 validation 39535858819](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39535858819) (TypeScript, application/theme regression, production build, Chromium); [Installer validation 39535858830](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39535858830) (build/budgets/server smoke, migration regression, MySQL 8/MariaDB, deployment package); and [Mining DB regression 39535858804](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39535858804). The downloaded Chromium report confirms **848/848 checks passed** with zero failures. Installer artifacts from that exact SHA: `arbitrade-universal-installer` (`12316929705`, 2,832,466 bytes) and `validated-production-dist` (`12317560231`, 1,079,233 bytes); browser artifact `stage-3-browser-acceptance` (`12317955268`, 10,008,686 bytes). Two duplicate installer unit/type jobs were skipped; equivalent Stage 3 jobs passed. This closes the code-level strict bundle budget and CI provenance repair, not product-runtime acceptance or owner release sign-off. At this checkpoint, acceptance has **37 checked / 11 open** boxes; see the matrix for each remaining blocker and next action. The final production release build and owner-level verification remain open.
### Latest documentation-reconciliation head CI (1cd3e5d)

The evidence-matrix refresh changed documentation only; application, test, and workflow source are unchanged from the validated implementation. All three workflows also passed on documentation head `1cd3e5d146236316b899b6d505c904a5c32338b6`: [Stage 3 39559895940](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39559895940), [Installer 39559895902](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39559895902), and [Mining DB 39559895891](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39559895891). Stage 3's browser artifact `12326639360` reported the successful 848-check viewport/theme matrix. Installer artifacts `12326932861` (`validated-production-dist`) and `12326619333` (`arbitrade-universal-installer`) are tied to the workflow's exact head. Checklist tally remains **37 checked / 11 unchecked**; this CI refresh does not close the remaining product/runtime or owner-level gates.


### Notification audio rejection handling follow-up (PR #98 merged; browser acceptance open)

- PR #98 is merged. The client reports rejected `HTMLAudioElement.play()` attempts through an internal browser event consumed by the administrator Sound settings screen. The screen presents an accessible status message instructing the operator to interact with the page and retry with Preview; it does not bypass browser autoplay restrictions or replay a stale notification automatically.
- A rejected playback attempt stops the repeating opportunity-sound timer so a blocked browser does not produce repeated errors every 1.5 seconds. Customer/admin sound preferences and selected sound policy remain the gates for normal event playback.
- PR #99 adds the corresponding customer-facing recovery status near the sound preference control. It explains how to allow future playback and states that blocked historical sounds are not replayed automatically.
- Automated exact-head CI for PR #100 passed: Stage 3 validation (TypeScript, production build, app/theme regression and Chromium viewport/theme matrix), installer validation, and mining database regression. See [Stage 3 run 39643751539](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39643751539), [Installer run 39643751573](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39643751573), and [Mining DB run 39643751513](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39643751513). PR #100 was merged as `313ba1272235712056efda4243f5cd29c5beb0be`.
- These CI results do **not** constitute real-browser acceptance of autoplay denial/retry, preference behavior, reconnect deduplication, or post-commit event timing. Keep the sound acceptance checklist open until those behaviors are exercised in a real browser.


### Customer-facing blocked-audio recovery and mobile dismissal

- PR #99 is merged. The customer portal listens for rejected notification playback and displays an accessible status message near the sound preference control.
- PR #100 is merged. It adds regression contracts for the rejection event, loop cleanup limited to failed opportunity sounds, accessible customer/admin recovery statuses, and no automatic replay of blocked historical sounds. It also constrains the customer warning to the viewport and overrides mobile header CSS that had hidden the Dismiss button.
- Exact-head CI passed for PR #100; see the validation runs listed above. Automated contract checks do not replace manual browser verification of audio policy and reconnect timing.
- Manual acceptance remains open for muted preferences, autoplay rejection and user-initiated retry, dismissal on mobile, reconnect deduplication, and post-commit timing. No production deployment, production migration, or full release ZIP rebuild was performed.


## Latest Stage 4 notification-audio hardening — PR #101 (2026-10-21)

- **PR #101 merged:** [Stop audio loops on synchronous playback errors](https://github.com/stannmoye/Arbitrade_platform/pull/101).
- **Merged commit:** `1a34927b1850f4269bb21c44620e52414d417fff`; tested PR head: `b0141a8323afe72c167db435604ff4c0d3fb767b`.
- **Fix:** centralized opportunity-loop cleanup so it runs for both rejected `audio.play()` promises and synchronous audio setup/start exceptions; added a regression contract for both failure paths.
- **Exact-head workflows passed:** [Stage 3 six-theme/Chromium validation run 39644490200](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39644490200), [Installer validation run 39644490192](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39644490192), and [Mining database regression run 39644490317](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39644490317). TypeScript, production build, application/theme-policy tests, Chromium viewport/theme smoke, installer syntax, disposable MariaDB and MySQL 8 migration/recovery, package validation, and mining idempotency checks passed.
- **Acceptance boundary:** CI confirms this narrow fix and its regression coverage; it does not close real-browser sound preference/autoplay/retry/reconnect/post-commit acceptance, exhaustive event-source coverage, authenticated announcement/ticket/attachment/concurrency journeys, or manual accessibility acceptance.
- **Release/safety:** the previously published `v2.0.4-stage4-full` ZIP predates PR #101 and does not contain this fix. No release ZIP rebuild, production deployment, or production database migration occurred in this follow-up. Rebuild and verify a new package when release gates permit; do not represent the older ZIP as containing this change.


## Customer sound-toggle browser acceptance — PR #102 (2026-10-21)

- **Merged:** [PR #102](https://github.com/stannmoye/Arbitrade_platform/pull/102), merge commit `59f5f7209187b8a06651402afe49cb4d5e374046`; tested head `b1b8957ac3288eecab3f221e6f5f96e6d2d85cf7`.
- **Root cause/fix:** `client/src/customer-reference.css` hid every direct child button in `.portal-session` except the notification bell. The selector now explicitly exempts `.customer-header-sound-toggle`, preserving the control without exposing unrelated header buttons.
- **Exact-head CI passed:** [Stage 3 validation 39651054660](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39651054660), including real Chromium viewport/theme smoke, application tests, TypeScript and production build; [Installer validation 39651054582](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39651054582), including disposable MariaDB/MySQL 8 fresh-install and migration-recovery, production build/package checks; and [Mining DB regression 39651054575](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39651054575).
- The Chromium smoke also exercises the customer sound toggle's on/off preference persistence and the accessible blocked-audio warning and dismissal. This is a successful browser smoke test, not full owner-held acceptance of autoplay denial/user gesture retry, reconnect deduplication, or post-commit event timing.
- **Acceptance boundary:** exhaustive source-to-event mapping, announcement and authenticated support lifecycle end-to-end acceptance, manual keyboard/screen-reader/reduced-motion/accessibility and hosted acceptance, provider-authoritative deposit/withdrawal success events, and rebuilding the published ZIP remain open. Persistent push remains deferred under the accepted bounded-polling release scope.
- **Safety:** no production deployment, production database migration, or published release ZIP replacement occurred. The published `v2.0.4-stage4-full` ZIP predates PR #102 and does not include this fix.
