# Stage 4 Durable Progress

This file is the resumable work log for PR #95. GitHub branch history is authoritative; before resuming, fetch `feat/stage-4-live-notifications-support` and inspect its current head and CI. Do not assume the SHA below remains current.

## Recovered state — 2026-10-21

- Repository: `stannmoye/Arbitrade_platform`
- PR: [#95](https://github.com/stannmoye/Arbitrade_platform/pull/95), open and draft.
- Base: `integration/auth-installer-vps-safety`.
- Feature branch: `feat/stage-4-live-notifications-support`.
- Recovered remote/local head: `2bd4f034debb143273ea115e5e97bdc521cc65ed` (`Complete Stage 4 scope map and refresh validated handoff`). Local checkout was clean before this file was created and fast-forwarded without rewriting history.
- CI at recovered head: PR check rollup reported 12 successful, 2 skipped, 0 failing, 0 pending. The two skipped checks are duplicate application-test and TypeScript jobs; equivalent application/theme regression and type checks ran in the five-theme workflow. See live PR checks before interpreting future status.
- Environment boundary: this task uses only a clean PR repository checkout and disposable/local tests. No merge, deployment, live provider setting changes, or production data changes are permitted or have been performed.

## Work units and durable checkpoints

### Work unit 0 — recover and record the current ChatGPT branch progress

- Resulting checkpoint commit: pending (this file is being added on top of recovered head `2bd4f034debb143273ea115e5e97bdc521cc65ed`).
- Existing implementation recovered from GitHub: customer notification history keyset pagination and load-more UI; bounded notification list; global unread count; migration `0057_notification_history_pagination.sql` with `(userId, createdAt, id)` index; migration runner/recovery/DB assertion wiring; focused cursor/page-size tests. The implementation and detailed exact-SHA evidence are described in `docs/stage-4/MANUS_HANDOFF.md`, updated through implementation SHA `f2712bf1bd615fd6ba076be783fdb9555c310886`; subsequent commits add DB assertions/recovery wording/scope map. Do not duplicate this work.
- Tests run during this recovery: GitHub `gh pr checks 95` at fetched remote SHA `2bd4f034debb143273ea115e5e97bdc521cc65ed`: 12 successful, 2 skipped, no failing/pending checks. This is remote CI evidence; no tests were rerun locally during recovery.
- Files changed in this work unit: `docs/stage-4/MANUS_PROGRESS.md` only.
- Known remaining items from live docs/source inspection: authoritative provider-backed deposit/withdrawal transitions are absent (do not fabricate); persistent push transport is not present; fixed polling/reconnect/backoff and recovery need review; authenticated ticket/announcement end-to-end acceptance; audio autoplay/preferences/reconnect tests; accessibility beyond smoke matrix; final exact-head release/readiness checks.
- Next concrete task: map current client polling/sound behavior and existing transport/dependency architecture; implement a small safe polling/reconnect improvement with deterministic tests if the repository provides a viable existing design. In parallel, inspect authenticated ticket/announcement tests for missing coverage. First save and push this checkpoint before code edits.

### Work unit 1 — notification polling recovery (in progress)

- Starting code head: `903bff1e5780b31aef66f92e116263e4b297154f`.
- Inspection found that the existing app has no persistent push transport or WebSocket dependency; notifications use authenticated tRPC polling. TanStack Query v5 is the existing client cache. Customer header queries poll recent notifications, unread count and the sound event cursor every 5 seconds with background polling disabled; customer history and unread count also poll every 5 seconds. The existing event cursor and durable paginated history remain the source of truth.
- Planned slice: apply tested bounded backoff to active notification polling after repeated failures and explicitly refetch notification data on network reconnection/window focus, preserving no-background polling and existing deduplication/sound behavior. No provider or push infrastructure will be invented in this slice.
- Tests run for this work unit so far: source/test/architecture inspection only; no local tests yet.
- Next: implement a small pure polling-policy helper and focused tests, apply it only to recent-notification, event-cursor, unread-count, and first-history-page queries; run focused Vitest and TypeScript; checkpoint and push. Then continue to an independent ticket/announcement or accessibility gap.

## Update protocol

For each meaningful work unit, append a section with actual changed behavior/files, actual test commands/results, resulting Git SHA, unresolved risks, and next action. Commit and push each coherent slice to the existing feature branch. After pushing, confirm remote branch SHA through GitHub. If interrupted, resume from this file plus `git log`, source and live CI; do not trust old conversation state.
