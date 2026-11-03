# Trade Settings Administration Blueprint — Decision Log

**Source:** User-provided `Trade_Settings_Administration_Blueprint.pdf`, prepared 2 November 2026.
**Repository:** `stannmoye/Arbitrade_platform`.
**Base:** `main` at `59c425414b981bc2fd8720119f2d4b650b97ab15`.
**Branch:** `feat/trade-settings-admin-blueprint`.
**Implementation checkpoint:** `91d1174e6405fb7639d203a2e15052a2478facee`.
**PR:** Not opened; no PR number assigned.

## Checkpoint 0 — decisions

1. Keep the blueprint checkpoint order: owner routes and navigation first, then canonical settings/persistence, APIs/audit, UI, runtime effects, and operational acceptance. Do not combine the redesign with unreviewed financial behavior.
2. Preserve the source-of-truth boundary: customer informational pop-ups require administrator-published, open opportunity records; market-data refresh does not synthesize offers. A pop-up is not a trade, execution, profit, debit, credit, payout, or settlement.
3. Keep automatic financial execution hard-disabled. No UI switch, database value, migration, or recovery route may bypass the server lock. Informational delivery remains independent of that lock.
4. Keep per-tier terms separate from global policy. A global setting must not be copied into every package row. The canonical global master controls for eligibility and delivery, and any migration from per-package flags, remain unimplemented; do not present current per-package values as global settings.
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

## Known gaps / next safe work

1. Complete checkpoint 2: finalize the global-vs-package setting registry and field ownership; design a conservative, auditable migration for existing per-package gate/delivery values; add upgrade/conflict tests. Do not silently choose a permissive value or overwrite a saved pause.
2. Complete checkpoint 3: test role boundaries, validation failures, atomic audit/version behavior, stale-version conflicts, read-back failures, and draft retention using a disposable database.
3. Complete checkpoint 4/5: implement remaining blueprint forms and wire only persisted settings to documented runtime consumers; keep fee policy, customer pop-up prerequisites, and financial execution semantics unchanged unless separately approved.
4. Continue the operational route gaps (Catalogue, Publish & Manage Opportunities, Trading History, payouts/funding, per-customer/day Database Entries, worker health/recovery, audit history) and their ownership/ACL/pagination tests.
5. Complete disposable-database upgrade/integration tests, accessible browser/keyboard/responsive checks, CI on the exact pushed head, and release acceptance only after authorized approval.
6. No PR has been opened. Open one only after the intended review scope is coherent; the current branch is a checkpoint, not a completed implementation of all 20 PDF pages.
