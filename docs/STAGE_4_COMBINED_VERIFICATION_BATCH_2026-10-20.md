# Stage 4 Combined Verification Batch — 2026-10-20

**Branch:** `feat/stage-4-live-notifications-support`  
**Pull request:** [#95](https://github.com/stannmoye/Arbitrade_platform/pull/95)  
**Status:** Review notes and verification plan; this document does not claim these checks have run.

## Code paths reviewed

- `server/routers.ts`: customer ticket creation, message retrieval/reply, reopening, attachment metadata submission, customer notifications, admin ticket reply and notification settings.
- `server/_core/index.ts`: authenticated local upload-preparation endpoint, ticket ownership checks, configured MIME/size policy, private filesystem writes and safe local-storage errors.
- `server/db.ts`: customer ownership lookup, message author-role check, closed-ticket reply guard, ticket status update, and notification creation/policy helpers.
- `docs/ARBITRADE_STAGE_4_ACCEPTANCE.md`: current release gates and known gaps.

## Positive controls confirmed in the inspected source

1. Customer ticket-message reads and replies first verify ticket ownership through `getCustomerTicket(userId, ticketId)`.
2. The shared message writer independently checks the actor role and prevents a non-admin from writing to another customer's ticket.
3. Customer replies to a closed ticket are rejected, and the customer-facing router does not accept a client-supplied customer ID.
4. Local upload preparation authenticates before handling the request, checks ticket ownership and applies the configured upload policy.
5. The local upload-preparation endpoint returns safe local-storage failure messages rather than raw exception details.
6. The acceptance document correctly keeps deposit/withdrawal success notifications gated on a verified persisted provider lifecycle and keeps production migrations/deployment out of this PR.

## Required combined regression matrix

### Ticket workflow and authorization
- Customer A cannot read, reply to, reopen, or attach a file to Customer B's ticket.
- An unauthenticated request cannot prepare, upload or register an attachment.
- Empty/whitespace-only replies are rejected.
- Closed-ticket customer replies fail; an authorized reopen permits a subsequent reply.
- Admin reply status transitions are restricted to the declared lifecycle values.
- Concurrent close/reply and reopen/reply requests cannot leave an inconsistent status or silently lose the last update.
- A ticket message persisted successfully must not be reported as failed solely because an email/notification side effect fails.
- Message history remains chronological and includes author role and timestamp.

### Attachment validation and storage failure
- Reject wildcard/bare malformed MIME values, MIME mismatches, zero/negative/oversized sizes, control characters in names, and unsafe storage keys.
- Verify configured size/type policy is applied consistently during local upload preparation, file upload and final attachment registration.
- Reject storage-provider responses with invalid JSON, missing URLs, non-success status, and unexpected URL schemes.
- Verify a failed upload is not shown as an attached file; retrying does not duplicate attachment records.
- Verify only the ticket owner and authorized administrators can access stored attachment references.

### Notification correctness
- Notification creation and event keys are recipient-scoped and database-enforced for idempotency.
- A repeated poll/retry/reconnect does not create duplicate notification rows or repeat a sound.
- Category visibility policy is enforced in server responses and in unread counts, not just in the browser.
- Read-one and read-all actions only mutate the authenticated recipient's notifications.
- A committed ticket state change remains committed even if optional notification/email delivery fails; delivery failures are observable and safely retryable.
- No financial success notification or sound is emitted before the authoritative ledger operation commits.

### Announcement lifecycle
- Validate single-customer targets against active customer accounts and reject administrator/unknown recipients.
- Retry a partially delivered broadcast with the same event identity without duplicating successful recipient deliveries.
- Keep draft, scheduled, published, delivered, read, expired, and failed states distinct where supported.
- Report recipient counts and partial failures accurately; do not represent attempted delivery as confirmed delivery.
- Scheduling and expiry use server time and are covered by deterministic tests.

### Release checks
- Run exact-head type-check, unit tests, production build, installer checks, and review every job result.
- Run migration 0054 on disposable MySQL 8 and MariaDB schemas, including a rerun/recovery test.
- Run responsive/theme/browser and keyboard/accessibility checks.
- Validate the release ZIP against the exact verified commit.
- Keep PR #95 draft/unmerged and do not apply migrations to production until these gates are reviewed.

## Important verification note

This document is a source-review checklist, not evidence that tests passed. Earlier successful CI runs only apply to the commit they tested. Re-run all required checks against the exact current pull-request head before marking the batch complete.
