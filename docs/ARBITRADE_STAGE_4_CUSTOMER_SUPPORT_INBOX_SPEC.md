# Stage 4 Add-on — Customer Support Inbox Experience

**Status:** Approved scope proposal for implementation on `feat/stage-4-live-notifications-support`  
**Parent work:** [PR #95 — Stage 4: live notifications, two-way support and real sound controls](https://github.com/stannmoye/Arbitrade_platform/pull/95)  
**Purpose:** Upgrade the customer ticket area from a chat-like thread into a clear, email-inspired two-way support inbox. Preserve existing ticket records, message history, authentication and admin workflows.

## Product principles

- **Inbox, not chat:** conversations are durable, threaded records with a subject, reference number, timestamps, status, ownership and a full history. No presence dots or typing indicators are required for the core experience.
- **Always explain the next action:** the customer can tell whether support or the customer owes the next reply.
- **Time and context are visible:** received, last reply, last updated, response timeline and attachment details are easy to find.
- **No false promises:** response-time estimates are labelled as estimates; do not show a fake SLA countdown or claim an agent is online unless the backend can prove it.
- **Safe and accessible:** keyboard navigation, responsive layouts, readable status labels, accessible icons, reduced motion, validated uploads and server-side authorization.
- **Authoritative state:** status, timestamps, unread state and message ownership come from persisted server records, not browser-only guesses.

## Customer information architecture

### 1. Support inbox

Use a responsive two-pane layout on wide screens and a list/detail navigation on small screens.

- Page heading: **Support inbox**, short explanation and a prominent **New ticket** action.
- Summary tiles: **Needs your reply**, **Waiting for support**, **Unread updates**, **Resolved**. Counts must be derived from the signed-in customer's tickets/messages.
- Search by ticket reference or subject; filters for status, category and unread; sort by most recently updated or oldest waiting.
- Ticket rows show subject, reference, category/priority, latest-message preview, last activity timestamp, unread marker, status badge, and a clear “Your reply needed” / “Support team replying” indicator.
- Useful empty states: no tickets yet, no search results, and no tickets matching a filter, each with a relevant next action.
- Preserve filters while opening/returning from a ticket where feasible.

### 2. Ticket detail / email-style thread

Header:
- Subject and ticket reference (copy reference action).
- Status badge with plain-language explanation.
- Category, priority and created/received date.
- Last activity and “Awaiting your reply” or “Awaiting support reply”.
- Actions appropriate to the state: reply, mark resolved/confirm resolution, reopen if permitted, or return to inbox.

Timeline:
- Render each message as a clearly separated email-like entry, not alternating chat bubbles.
- Show sender identity and role (You / Support team / named admin only if approved for customer display), sent timestamp, and attachment list.
- Distinguish the original request from later replies.
- Include system events in a separate, visually quieter activity history: ticket created, status changed, assigned (if assignment exists), reopened, and resolved. Never present system events as human replies.
- Make unread/new replies obvious and provide a “new reply” marker when loading older history.
- Display delivery/read state only if the server actually records it; do not infer that an admin read a message from a successful API response.
- Keep message history ordered consistently and use server timestamps/time-zone-aware formatting.

### 3. New ticket form

Use a guided, calm form with labels and short tips:
- **Subject** — required, concise, with sensible length limit and inline validation.
- **What do you need help with?** — required category (e.g. Account & sign-in, Deposit, Withdrawal, Transaction or ledger, Trading, Earn/mining, Verification, Security, Other); options must match supported backend categories.
- **Priority** — default to Normal; only offer higher priorities if policy supports them. Explain that priority is for triage, not a guaranteed response time.
- **Message** — required, multi-line description with prompts to include what happened, when, and the expected outcome. Warn users not to include passwords, authentication codes, seed phrases or private keys.
- **Attachments** — optional; show allowed file types, maximum size/count and upload progress based on server policy. Validate type, size and authorization on the server; do not trust file extensions or browser MIME alone.
- Clear **Submit ticket** and **Save draft** only if draft persistence is implemented. Do not display a save-draft affordance that silently loses data.
- Review screen or confirmation panel showing subject/category and a concise reminder before submission.
- Disable duplicate submission while in flight; preserve form content on recoverable errors; show an unambiguous success state with reference number and a link to the ticket.
- Confirm before navigating away if unsaved text would be lost.

### 4. Reply composer

- A dedicated reply area at the end of the thread with clear “Reply to support” context.
- Multi-line editor, attachment picker governed by the same upload policy, remaining/maximum length hint, submit progress, retryable error state and duplicate-submit prevention.
- Keep replies as separate immutable message records; editing/deleting sent messages is out of scope unless an audited policy is added.
- On submit, show the server-confirmed timestamp and update status/unread counts from the response or a refetch.
- If a ticket is resolved/closed, explain whether replies are disabled or whether the user must reopen it. Never silently accept a reply that the backend discards.
- Provide a clear reopen action when allowed, with confirmation if it changes workflow state.

## Status model and plain-language guidance

Map existing backend statuses to a small, consistent customer vocabulary. Confirm the canonical values before implementing; do not introduce mismatched UI-only statuses.

| Customer-facing state | Meaning | Primary guidance |
| --- | --- | --- |
| Open / Received | Ticket was created and is in the support queue | “Your request is in the support inbox.” |
| Waiting for support | Customer has replied or the request is awaiting staff action | “No action is needed from you right now.” |
| Awaiting your reply | Support has responded and needs more information | “Read the latest reply and respond when you can.” |
| Resolved | Support marked the issue resolved | “If this did not solve the issue, reopen the ticket if available.” |
| Closed | Conversation is closed under the current policy | Explain whether reopening or creating a follow-up ticket is allowed. |

If the current backend uses values such as `answered`, `resolved` and `closed`, add a tested mapping layer instead of assuming new values exist. The “who acts next” label must be derived from persisted message sender/last-action state and current status, with a documented rule for edge cases.

## Notifications and inbox signals

- Notify the customer when support replies, the ticket status changes, a ticket is reopened, or support requests more information.
- Notify the relevant support/admin audience when a customer creates a ticket or replies.
- Notifications link directly to the authorised ticket detail page and use the existing internal-path safety validation.
- Use recipient-scoped idempotency keys; retrying a notification must not create duplicates.
- Keep unread counts consistent with the actual message/notification records and provide a mark-read action where supported.
- Optional sound must respect the customer's sound preference, browser playback restrictions and reduced-distraction expectations. Never make sound the only signal.
- Do not notify a customer that a ticket was answered until the reply/status change has been persisted successfully.
- Add retry/partial-failure observability for notification delivery; a notification failure must not erase a successfully persisted ticket reply.

## Guidance and trust features

- Inline tips for writing a useful request: steps tried, approximate time, reference/transaction ID where safe, and expected outcome.
- Security reminder: never send passwords, one-time codes, recovery phrases or private keys.
- “What happens next?” panel explains the current state and who should reply.
- Attachment policy and upload progress shown before upload.
- Copy-ticket-reference control and an accessible activity timeline.
- Optional related-help links only where the destination exists and is maintained.
- Response-time text must be based on a real, maintained policy; otherwise say support will respond in the inbox when available.

## Admin-side two-way workflow

This is a customer-facing add-on, but its success depends on consistent admin behavior:
- Admin inbox row exposes ticket reference, customer identity per existing permission rules, category, priority, created time, last customer reply, last activity, unread/new-message indicator, current status and who acts next.
- Admin can filter by new/unread, awaiting admin, awaiting customer, priority, status and age.
- Admin replies and status transitions use the same canonical persisted ticket/message records as the customer view.
- Validate ticket ownership for customers and admin role for admin actions on every server endpoint.
- Ticket status changes, reopen events and staff replies should have an auditable event trail where the schema supports it.
- Avoid exposing internal-only notes to customers. If internal notes are added, use a distinct data model/flag and tests proving they never appear in customer APIs or notification previews.

## Backend and data integrity requirements

- Inspect and reuse the current ticket and ticket-message schema before adding tables or migrations.
- Confirm timestamps are server-generated and persisted for ticket creation, each message and each status transition.
- Derive latest reply and “waiting for” from canonical records; avoid duplicated status fields unless transactionally maintained.
- Ensure customer list/detail/message queries are scoped to the authenticated customer; never trust a client-supplied customer ID.
- Admin ticket/message endpoints must enforce admin authorization.
- Reply insert and status update should be transactionally consistent where the database supports it.
- Notifications are emitted only after the relevant ticket/message/status operation commits, with idempotent retry behavior.
- Attachment access must be authenticated/authorized and should not rely on guessable public paths. Enforce size/type/count limits server-side and prevent unsafe path traversal.
- Add pagination for long inboxes and threads, bounded list responses, loading/error/retry states and reconnect-safe refresh/polling.
- Preserve existing API compatibility or provide a migration plan and regression tests.

## Accessibility and visual quality

- Use a consistent icon system with visible text labels for important states; icons must not be the only status cue.
- Clear heading hierarchy, keyboard-operable filters/actions, visible focus rings, proper form labels and inline error associations.
- Announce asynchronous submit/error/new-reply changes to screen readers without repeatedly announcing every poll.
- Maintain contrast in all five supported themes, mobile viewport testing, zoom/reflow, and reduced-motion support.
- On mobile, the inbox list and ticket detail should be easy to navigate without horizontal scrolling; composer actions remain visible and usable above the on-screen keyboard.
- Avoid excessive badges, animation, sound and visual noise; emphasize the one action the customer needs next.

## Acceptance checklist

- [ ] Inbox, ticket detail and new-ticket form match the current design system and all supported themes.
- [ ] Received/created time, latest reply time, last activity and “who acts next” are correct for customer and admin views.
- [ ] Status labels and allowed transitions match canonical backend status values.
- [ ] Customer can create a ticket, read the full history, reply, see confirmation and understand the next action.
- [ ] Admin can reply and change permitted status; customer sees the committed result and a notification.
- [ ] Unread markers and counts update without duplicate notifications or noisy repeat announcements.
- [ ] Ownership, role authorization, attachment access and server-side upload limits have automated tests.
- [ ] Empty/loading/error/offline/retry states and long-thread pagination are tested.
- [ ] No fake read receipts, response promises, typing indicators or unpersisted success messages.
- [ ] Responsive and keyboard/screen-reader/reduced-motion checks pass across all five themes.
- [ ] Unit tests, TypeScript, production build, installer validation and release ZIP checks pass on the exact final commit.
- [ ] No production host/database is touched during development validation.

## Implementation sequence

1. Audit existing ticket tables, statuses, customer/admin components and API contracts; document the canonical status/next-actor rules.
2. Implement inbox summary/list and ticket detail presentation using current APIs first.
3. Upgrade the new-ticket form and reply composer with validation, helpful tips, attachment policy and reliable submission states.
4. Close backend gaps: timestamps, ownership/role checks, status transitions, notification idempotency and attachment access.
5. Add admin inbox parity, filters and auditable status/activity behavior.
6. Add automated tests for authorization, state transitions, notification timing, unread state and attachment constraints.
7. Run visual/accessibility checks and full exact-head CI; verify the release ZIP before declaring acceptance.

**Release gate:** This scope is not complete until the customer and admin flows are tested end-to-end. A polished UI alone is insufficient if the underlying ticket state, authorization or notification behavior is inconsistent.
