# Stage 4 scope map — self-hosted architecture

**Repository:** `stannmoye/Arbitrade_platform`  
**Feature branch:** `feat/stage-4-live-notifications-support`  
**Base branch:** `integration/auth-installer-vps-safety`  
**Purpose:** Identify Stage 4-owned changes, shared files requiring narrow edits, and protected unrelated areas. This map is a scope guide, not approval to merge or deploy.

## Stage 4-owned surfaces

- **Notification creation and visibility:** `server/modules/notification-events.ts`, its tests, and the notification functions in `server/db.ts`.
- **Customer history and sound:** `server/modules/notification-pagination.ts` and its tests; notification queries and UI in `client/src/App.tsx`; sound policy, deduplication, volume helpers and their tests under `client/src/`; five bundled WAV files under `public/sounds/`.
- **Notification/campaign API:** customer notification procedures and admin campaign procedures in `server/routers.ts`; campaign delivery persistence in `server/db.ts`; migrations `0054_notification_event_idempotency.sql`, `0055_notification_campaign_delivery_tracking.sql`, and `0057_notification_history_pagination.sql`.
- **Support lifecycle:** ticket/message/assignment functions in `server/db.ts`, their admin/customer procedures in `server/routers.ts`, migration `0056_support_ticket_assignment.sql`, and support-specific contract/security tests.
- **Migration and acceptance evidence:** `scripts/apply-portal-migrations.mjs`, `installer/migration-recovery-status.mjs`, `scripts/notification-migration-db-assertions.mjs`, their focused safety tests, the Stage 4 acceptance checklist, support inbox specification, the acceptance checklist, support inbox specification, and this map.

## Shared files — edit narrowly and justify each change

- `client/src/App.tsx`, `client/src/customer-reference.css`, `client/src/index.css`, and `client/src/main.tsx`: shared customer/admin shell and styling; avoid unrelated navigation, auth or layout rewrites.
- `server/db.ts` and `server/routers.ts`: shared business and API boundaries. Notification side effects must remain recipient-scoped, idempotent and post-commit/best-effort unless a notification is intentionally inserted in the same authoritative transaction.
- `drizzle/schema.ts` and portal migration/recovery scripts: schema declarations and tracked migration list must remain synchronized; validate migrations on disposable MySQL 8 and MariaDB.
- `.github/workflows/installer-validation.yml`, `.github/workflows/mining-database-regression.yml`, and `scripts/stage2-browser-acceptance.cjs`: change only when required to exercise the relevant Stage 4 regression or acceptance path.

## Protected unrelated areas

- Do not redesign or rewrite wallet/ledger accounting, trade settlement, mining reward calculations, swaps, custody/provider adapters, deposit/withdrawal execution, authentication/session architecture, or unrelated business workflows merely to add notifications.
- Do not add simulated provider success, fabricate financial events, weaken ownership/role checks, change unrelated migrations, expose secrets, or touch production databases.
- Do not merge, deploy, retarget the PR, force-push, or claim hosted acceptance from CI alone.
- For a shared-file change, keep the diff localized to the Stage 4 callsite or acceptance boundary and add a focused regression test when behavior changes.

## Validation boundary

Use the current branch's exact-head CI results for build, type-check, automated tests, installer/migration validation, and mining/database regressions. Browser smoke checks do not replace authenticated acceptance for ticket, announcement, sound, and authorization flows. Deposit/withdrawal success notifications remain blocked until an authoritative persisted provider/custody transition exists. Do not claim production acceptance from source checks alone.
