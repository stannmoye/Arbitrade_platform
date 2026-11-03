# Trade Settings Administration Blueprint — Decision Log

**Source:** User-provided `Trade_Settings_Administration_Blueprint.pdf`, prepared 2 November 2026.
**Repository:** `stannmoye/Arbitrade_platform`.
**Base:** `main` at `59c425414b981bc2fd8720119f2d4b650b97ab15`.
**Branch:** `feat/trade-settings-admin-blueprint`.
**Implementation checkpoint:** `72a4b372` — canonical global master controls, migration 0100, strict admin API and owner UI.
**PR:** Not opened; no PR number assigned.

## Checkpoint 0 — decisions

1. Keep the blueprint checkpoint order: owner routes and navigation first, then canonical settings/persistence, APIs/audit, UI, runtime effects, and operational acceptance. Do not combine the redesign with unreviewed financial behavior.
2. Preserve the source-of-truth boundary: customer informational pop-ups require administrator-published, open opportunity records; market-data refresh does not synthesize offers. A pop-up is not a trade, execution, profit, debit, credit, payout, or settlement.
3. Keep automatic financial execution hard-disabled. No UI switch, database value, migration, or recovery route may bypass the server lock. Informational delivery remains independent of that lock.
4. Keep per-tier terms separate from global policy. A global setting must not be copied into every package row. Checkpoint 4 below adds canonical global master controls and a restrictive, diagnostic migration; per-tier terms and the separate `packages.enabled` lifecycle state remain tier-scoped.
5. Existing entitlements, delivered opportunities, and open-trade snapshots remain unchanged by policy edits. Package-term edits should affect future assignments unless a separately reviewed rule specifies otherwise.
6. Do not invent fee selection, fee ranges, rounding semantics, or financial terms. Existing evidence-backed settlement behavior and integer/minor-unit accounting remain authoritative. Do not describe configured/expected returns as realized profit.
7. Carry-forward stays Off / unavailable until its state machine, expiry, idempotency, and integration behavior exist.
8. High-impact settlement, wallet, payout, funding, deployment, and production database actions are outside this code checkpoint. No production database migration was applied.
9. Record validation against exact branch commits. Local success does not establish GitHub CI, staging acceptance, or production certification.

## Checkpoint 1 — owner routes and Guide (implemented)

- Added the dedicated **Package Configuration** owner route for the current policy and allocation-safety controls; removed the persistent control panel from unrelated views.
- Added the read-only **Trade Settings Guide** with owner navigation, explanatory copy, and no editor/action behavior.
- Added a typed ownership registry and updated navigation/contract tests to enforce isolation and unique ownership.
- The Settings/Overview/Guide route test contracts pass. This does not mean every destination in the blueprint has been implemented or audited.

## Checkpoint 2/3 — shared timing policy version and audited save path (partial)

- Added the forward-only `0099_trading_global_timing_policy_version` migration to seed the timing-policy version without overwriting an existing value, and registered it in the Drizzle journal, portal migration runner, and installer recovery list.
- Global timing settings continue to use the existing canonical `app_settings` keys; the save path locks the version and setting rows, validates bounds, increments the version, writes the settings and immutable actor/reason/old/new audit event in one transaction, then performs a fresh read-back.
- The API requires a 5–500 character reason and expected version, rejects mixed Trade-timing updates with other settings sections, and returns an explicit conflict for stale versions. The UI surfaces the required reason/version and verifies saved values plus the incremented version.
- This is **not** completion of the blueprint’s global settings migration. Tier/delivery master switches and timing fields are not yet consolidated into a typed global policy record, and no conservative migration/conflict report from old package flags has been implemented.
- Migration code is registered but was not applied to any live database. Use disposable database upgrade tests before considering application.

## Checkpoint 4 — canonical global master controls (implemented in code; database acceptance pending)

- Added `server/trading-global-policy.ts` with typed master keys, strict parsing, and fail-closed values. Missing, malformed, or unavailable global settings disable future qualification/delivery; they never create defaults in application code.
- Added forward-only migration `0100_global_trade_master_controls.sql`. It seeds one `app_settings` record from legacy policy rows using restrictive precedence: a global master starts ON only when every source row is ON. Existing disabled-row names are recorded in a diagnostic setting; the previous-settlement requirement is forced ON and legacy exceptions are reported. `packages.enabled` is unchanged. Existing legacy policy rows are retained during the compatibility window; the removed master fields are no longer accepted by the per-tier API.
- Registered migration 0100 in the Drizzle journal, portal runner, and installer recovery list. The admin query is role-protected; updates require an administrator reason and expected version, lock the current setting, append an immutable actor/reason/old/new audit event, increment the version, and verify the saved value by a fresh read. Stale versions return a conflict. The per-tier patch schema is strict and rejects the removed global masters.
- Replaced the per-package master switch panel with a single canonical editor on **Package Configuration**. It stays unavailable until migration data is present and valid, exposes the migration diagnostic, and keeps previous settlement locked ON. Automatic financial execution remains hard-disabled in the backend and is shown locked OFF.
- Wired the global gates into future tier qualification, new informational delivery, company rotation, randomized timing, burst delivery, and settlement checks. Existing opportunities, entitlement snapshots, open trades, and wallet records are not rewritten.
- Added parser/migration/runtime and ownership contract tests. Verification passed: `pnpm test` (119 files passed, 3 skipped; 939 tests passed, 17 skipped), `pnpm check`, and `pnpm build`. The migration non-overwrite rule has a static contract check; a real disposable-database upgrade/rollback review, browser accessibility pass, and exact-head CI remain outstanding. Migration 0100 was **not** applied to a live database.

## Known gaps / next safe work

1. Complete checkpoint 2/3 acceptance: test migration 0100 against disposable legacy fixtures (all on, mixed values, no rows, existing global row, malformed data); verify non-overwrite, safe conflict diagnostic, role boundaries, atomic audit/version behavior, stale-version conflicts, read-back failures, and recovery behavior. Do not apply migration to production without authorization.
2. Complete checkpoint 4/5 for remaining settings: validate timing/runtime bounds and ensure per-tier editor payloads cannot reintroduce removed global fields. Test global OFF and missing/malformed DB states end-to-end with a disposable database.
3. Implement the remaining blueprint forms and runtime owners, keeping fee policy, customer pop-up prerequisites, and financial execution semantics unchanged unless separately approved.
4. Continue the operational route gaps identified in the read-only branch audit: split settlement, capital/funding and payouts into distinct owners; add Trading History and a dedicated per-customer/day Trading entries view. The existing read-only wallet activity panel now has an admin-only customer-ID/UTC-day filter, a half-open UTC date range, and a fixed 150-row cap; it does not yet replace those dedicated views. Strengthen opportunity publishing evidence/close lifecycle; complete worker recovery and filterable audit history.
5. Complete disposable-database upgrade/integration tests, accessible browser/keyboard/responsive checks, CI on the exact pushed head, and release acceptance only after authorized approval.
6. No PR has been opened. Open one only after the intended review scope is coherent; the current branch is a checkpoint, not a completed implementation of all 20 PDF pages.
