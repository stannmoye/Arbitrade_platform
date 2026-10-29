# Trading Implementation Coordination

**Updated:** 2026-10-29  
**Scope:** Trade/Trading only. Do not change Mining or unrelated application menus.

## Part 4 — Company Rotation & Opportunity Presentation

### Ownership

Part 4 owns:
- Existing company catalogue integrity and stable Logo ID mapping.
- Durable company rotation order/cursor semantics and per-opportunity company snapshots.
- Customer opportunity/company-reference presentation and display-only dismissal behavior.
- Rotation/presentation regression tests and the related contract documentation.

Part 4 does not own package administration forms, wallet transaction implementation, worker scheduling/lifecycle design, or global integrations. Changes in those areas require coordination with the corresponding owners.

### Catalogue contract

- Source of truth is the existing local 1,811-record catalogue mapped by stable Logo IDs `logo-brand-0001` through `logo-brand-1811`.
- The local logo mapping is joined to the base compressed ticker snapshot and three supplemental Brotli parts by numeric Logo ID, never fuzzy company-name matching.
- Source classifications currently total 814 Public-labelled candidates, 637 placeholders, 265 parent ticker references, and 95 historical ticker references. The 814 Public-labelled records remain unverified research candidates; none are eligible for verified trade rotation.
- Company name, local logo, country-folder metadata, supplied ticker/status and stable Logo ID must remain together. Catalogue membership is informational only and cannot establish a listing, execution, price, or profit.

### Rotation and opportunity snapshot contract

- The worker selects a company only while creating the durable opportunity. The customer/package cursor is row-locked and updated in the same database transaction as the opportunity row and its company metadata snapshot.
- The event key `userId:offerId:quotaDay` is the idempotency boundary. Creation rechecks for an existing event after acquiring the rotation lock; retries for an existing event must not advance the cursor a second time.
- The saved cursor stores the filtered-pool fingerprint, repeat policy, cycle, next index, request count and last Logo ID. A restart resumes from this database state. The persisted opportunity metadata records rotation-state version, assigned cycle, sequence, pool fingerprint and repeat policy alongside the company identity and source metadata.
- Under `avoid_until_exhausted`, a deterministic order avoids repeats for the configured customer/package scope until the filtered pool has been traversed. A changed filter or repeat policy changes the pool fingerprint and deliberately starts a new cursor scope for the new pool.
- Under `allow_repeats`, each assignment remains durable and sequenced, but repeats are permitted by policy.
- Any preview is read-only. It must not create a cursor, update a cursor, create an opportunity, allocate capital or write a ledger entry.
- Customer cards render the saved company reference from the opportunity/trade snapshot. They do not request a fresh random company to decorate an existing opportunity.

### Dismissal and presentation contract

- Dismiss/minimize/maximize/expanded-card timeout are presentation actions only.
- A dismissed event may be hidden from the expanded card, but successful delivery and non-terminal execution remain eligible for the server-owned automatic worker. Dismissal must not cancel execution, change the countdown, alter entitlements, debit/credit a wallet, or settle a trade.
- Display fields must come from persisted server data. Missing status, company metadata, or timestamps are shown as unavailable/pending rather than fabricated.
- A company reference is labelled as a reference-only catalogue entry. No ticker/logo/country folder is presented as proof of market execution or realized profit.

### Coordination dependencies

| Area | Owner | Required integration |
| --- | --- | --- |
| Package settings, filters, repeat policy and policy version | Part 1 / PR #233 | Rotation reads only saved admin policy. Changes apply to future opportunities; existing opportunity snapshots remain immutable. |
| Opportunity creation, durable scheduling, restart recovery and customer isolation | Part 3 | Worker creates one idempotent opportunity and invokes the rotation allocator inside that creation transaction. |
| Funding, FX evidence, wallet ledger and settlement | Part 2 | Company rotation never changes wallet/ledger state; dismissal must not gate server-owned execution or settlement. |
| Final integration and exact-head acceptance | Part 6 | Resolve migration ordering and shared-file conflicts, then run exact-head CI and integration suites before merge. |

### Active related changes reviewed

- PR #230 contains the durable popup creation/funding slice and overlaps lifecycle/schema files.
- PR #231 contains fail-closed package policy/runtime changes.
- PR #232 removes implicit defaults from new tier creation.
- PR #233 contains package policy controls, company-rotation settings, rotation implementation, and popup snapshot schema changes.
- PR #234 proposes this coordination document as a separate documentation change.

Because these changes overlap, Part 4 is layered on the PR #233 branch for review and must not be merged independently into `main`. The integrator should reconcile this branch with PR #230 and PR #234, preserve migration order, and verify the resulting combined head.

### Verification checklist

- [x] Catalogue loader and existing tests assert 1,811 records, unique stable IDs, local logo paths and unverified listing status.
- [x] Pure rotation tests cover full-pool traversal, repeat policy, filter changes and restart restoration from persisted JSON state.
- [x] Popup execution policy has regression tests proving that dismissal is not execution cancellation.
- [x] Contract tests check that the opportunity transaction snapshots rotation metadata and that customer preview does not write rotation state.
- [ ] Run `pnpm check`, `pnpm test`, `pnpm build`, database integration tests and installer/migration checks on the final integrated head.
- [ ] Confirm exact-head CI for the final Part 4 branch and for the combined integration head.
- [ ] Verify the behavior against a disposable MySQL 8.4/MariaDB database with two concurrent worker instances, restart recovery, duplicate event delivery, and pool exhaustion.

No merge into `main`, production migration, or deployment is authorized by this document.


## 2026-10-29 — CI-driven Part 4 correction and current integration disposition

- Refreshed live GitHub state before editing. `main` remains `07b17ca401d5f0582bf09fba8b6625f4a8af42e6`; PR #238 remains open/draft and stacked on PR #233. The previously reviewed Part 4 head had no workflow runs.
- PR #233 exact-head CI exposed a real schema defect in disposable MySQL 8.4 and MariaDB 11.4 settlement tests: Drizzle inserts `trade_positions.walletFundingPlanJson`, but migration 0088 only added this snapshot to `opportunity_popup_events`. A forward-only `0089_trading_trade_wallet_funding_plan_snapshot.sql` is being added, registered in the journal, portal migration runner, installer recovery registry and runtime-schema bridge, with a worker preflight contract. Historical migrations 0086–0088 must not be rewritten.
- Two migration-order regression tests had brittle hard-coded journal tail offsets; their assertions are changed to verify neighboring historical entries and the complete recent migration order.
- The correction is not validated until fresh exact-head CI passes, including MySQL 8.4/MariaDB 11.4 settlement integration and installer regression tests. Local `pnpm` checks were unavailable because repository checkout failed when GitHub DNS could not resolve.
- Live dependency state at review: PR #230 is open/non-draft and reports merge conflict; #231–#237 remain open/draft/unmerged. PR #235 migrations conflict numerically with #233's 0086–0088 and must be reconciled into one forward-only sequence before integration. PR #238 must not merge independently into `main`.
- PR #236 is aligned to current `main` at head `e9184988c9dbfde346278e697d8a9b64f47ec229`; seven generic workflows passed on that exact head. Dedicated authenticated UI and persisted-settings acceptance remain unverified and deferred by user decision. Generic browser-recovery CI is not evidence that the dedicated runner ran.
- Status: Part 4 implementation remains partially complete; integration and acceptance are not complete. Fresh exact-head CI and database concurrency/restart/idempotency/rollback/pool-exhaustion/snapshot coverage on the reconciled dependency branch remain required.
