# Trading Package, Company Pop-up and Admin Editing Manual

**Status:** Canonical companion to `docs/TRADING_SYSTEM_SPECIFICATION.md`.  
**Scope:** Trade/Trading only. This document defines the intended administrator controls, what each control means, the customer pop-up contract, company rotation, and worker durability. It is a requirements manual, not proof that every listed control is already implemented.

## Admin navigation and unique configuration ownership

All Trading pages must appear under one top-level administrator group: **Trade Settings**. The submenu names are **Trading Overview**, **Package Configuration**, **Tiers & Eligibility**, **Per-tier Daily Delivery Caps**, **Per-tier Offer Rules & Capital Limits**, **Publish & Manage Opportunities**, **Per-tier Delivery Schedule**, **Global Trade Timing & Settlement**, **Per-tier Pop-up Display**, **Per-tier Company Rotation Rules**, **Company Catalogue**, **Capital & Wallet Funding Rules**, **Fees & Earnings Limits**, **Retries & Carry-Forward**, **Active & Pending Opportunities**, **Manual Payouts**, **Settlement & Reconciliation**, **Trading History**, **Worker Health & Recovery**, **Audit & Policy History**, and **Trade Settings Guide**.

**Trading History** is a separate admin-only, read-only destination for bounded scans of persisted trade lifecycle and result-evidence fields. It never confirms an actual result or reconciles/changes wallet-ledger records; those responsibilities remain with **Settlement & Reconciliation** and **Finance → Wallet & Ledger / Database Entries**, respectively.

The **Trade Settings Guide** provides a navigation-only shortcut to **Finance → Wallet & Ledger / Database Entries**. Finance remains the sole owner of read-only customer wallet activity; the shortcut does not create a second Trading ledger view, settlement action or write path. For the explicit resolution of the user-provided blueprint's route-map differences, see [`TRADE_SETTINGS_ADMIN_BLUEPRINT_RECONCILIATION.md`](trading/TRADE_SETTINGS_ADMIN_BLUEPRINT_RECONCILIATION.md).

**Fees & Earnings Limits** is a read-only destination for legacy global fee information and configured earnings ceilings. The only active package-specific, versioned fee editor is embedded under **Tiers & Eligibility**. Do not create a second fee editor or imply that configured returns are realized earnings.

The dedicated **Package Configuration** route is the single UI owner for canonical global eligibility, informational pop-up delivery, company rotation, randomized timing, burst delivery, the locked previous-settlement prerequisite, and the new-allocation safety gate. Migration 0100 seeds one global settings row using restrictive precedence and records legacy disabled package rows for review. Legacy package columns remain during the compatibility window, but strict per-tier APIs reject these master fields and new tier rows use inert OFF placeholders. Per-tier company country filters and repeat policy remain on Company Rotation Rules; Company Catalogue contains reference records and approval metadata.

The daily opportunity entitlement is configured once in **Tiers & Eligibility** as the number of additional opportunities contributed by each tier. Active qualifying tier entitlements are cumulative. **Per-tier Daily Delivery Caps** is a separate operational limiter: its hard daily pop-up ceiling and optional daily target may reduce delivery but never increase a customer's tier entitlement. To allow an entitlement of 600 opportunities/day, the hard daily ceiling must be at least 600 and the optional target must be 0. Existing customer entitlements keep their saved terms snapshot; editing tier terms applies to future automatic assignments and must not silently rewrite existing subscriptions.

Tier and policy saves must show an in-progress state, a visible error when rejected, and a success confirmation only after a fresh database read verifies the changed values/version. Background polling must preserve dirty drafts. An unconfirmed read-back is an error state, not a successful save.

## 1. Non-negotiable rules

1. The admin portal is the source of truth for package policy and customer pop-up behaviour. Customer UI must consume saved server configuration; it must not hardcode amounts, percentages, package names, durations, company lists, quotas, or financial results.
2. Customers never browse, choose, purchase, subscribe to, or activate packages. An authorized admin configures packages; the server assigns eligibility from qualifying manual admin wallet credits only, and package quotas accumulate according to the canonical Trading specification.
3. The company catalogue is the existing 1,811-record local image/name reference pool, keyed by stable Logo ID and mapped to local assets. Keep each company name, logo, country metadata and reference ID together. Do not recreate company names/logos in frontend constants or substitute a small hardcoded array.
4. Company rotation may choose only records whose stable Logo IDs are currently in the persisted `verifiedIds` set in `trade.companyCatalogue.adminState` and are absent from both `archivedIds` and `disabledIds`. Archived and Disabled take precedence if an ID appears in a conflicting state set. Missing or malformed admin state fails closed. Unverified, Disabled and Archived records are excluded before country-folder filters. If no verified record matches, the opportunity may still be delivered but must have no company identity; never fall back to an unverified or otherwise unapproved record. The customer preview must use this same approved pool. Recheck current status when returning active customer pop-ups so a later unverify, disable or archive action hides that company immediately. Avoid repeats for a customer/package until the eligible pool has been traversed when enough eligible records exist. Persist rotation state so a restart does not reset everyone to the first company. Concurrent worker instances must not allocate the same rotation slot to the same customer/opportunity.
5. Catalogue membership, a company logo, country folder, supplied ticker or rotating card does not prove that a company is publicly listed, that a market trade occurred, or that a profit was earned. The current catalogue is reference data; the current ticker candidates are not verified trade-eligible instruments. Do not use rotation itself as execution evidence.
6. **Per-pop-up capital, rate and duration are server-calculated from the saved package policy.** An eligible pop-up snapshots required capital, a profit-rate bound and a duration bound. The server selects one permitted rate and one permitted duration exactly once for that opportunity, persists them before processing continues, and calculates the configured payout from committed capital using integer minor-unit arithmetic. This is a platform-defined contractual payout rule, not evidence of a market-derived return; customer-facing wording and terms must say so clearly. Never present it as an exchange/broker-earned market profit unless supported by actual trade execution and settlement evidence. Do not invent quotes, execution records or third-party settlement. The payout rule and its financial/legal approval must be explicit before real-money rollout.
7. All settings that affect a future allocation must follow a documented version/effective-time rule. Snapshot package, fee rate/version, rounding and effective time on each new allocation if separately authorized. Editing a package never rewrites historical trades, settlements, ledger entries, or prior snapshots.
8. **Tier lifecycle is separate from global delivery masters.** The package record may be created enabled for future eligibility, but the policy row’s legacy master columns are inert OFF compatibility placeholders; they are not copies of global values. Global eligibility, pop-up delivery, company rotation, timing randomization and burst delivery are controlled once on Package Configuration. Migration 0100 initializes existing globals with restrictive all-ON precedence and records disabled legacy rows for administrator review. Automatic trading/execution, result determination and automatic customer-fund allocation remain hard-disabled. The existing administrator-confirmed credit/debit posting worker remains active.
9. Policy reads are read-only. Missing policy rows, missing/invalid payout bounds, or invalid duration bounds block new delivery. Global tier eligibility and pop-up delivery additionally require the canonical global settings row to be present and valid; a missing or malformed row fails closed and does not create defaults. Tier lifecycle and the global masters are independent gates.
10. The popup and trade persist the same immutable company reference metadata snapshot alongside stable Logo ID, name, logo URL, configured rate, configured trade duration, popup display duration and policy version. Snapshot metadata includes country-folder/country code, supplied ticker/symbol/exchange, ticker classification/research status, listing-status and source-confidence/verification markers. Every company reference is marked reference-only; catalogue metadata does not prove listing, price, execution or profit.

**Customer catalogue and pop-up rule:** any customer-facing company search, count, summary, lookup, preview, or pop-up response must be restricted server-side to IDs in the current administrator `verifiedIds` allowlist and excluded from `archivedIds` and `disabledIds`. The customer portal must not browse or retrieve the full 1,811-record source catalogue. Full catalogue search and direct lookup are administrator-only. Admins can verify, reject/unverify, enable, disable, archive and restore catalogue records through audited bulk actions; enabling does not grant verification. Disabled, unverified and archived IDs remain excluded from customer responses. Customer search filters the approved set before pagination; unverify/disable/archive changes take effect on the next customer read, including previously persisted active popup snapshots. Missing or malformed administrator state returns no customer company records. Pop-up assignment and customer preview use the same approved, enabled, non-archived pool; when that pool is empty, show no company identity.

## 2. Admin portal: package list and package editor

Each package row should show its badge, name, enabled/disabled status, qualifying USD threshold, duration, daily quota contribution, capital rule, configured profit percentage range, and active customer count where available. Admins must be able to search, filter, sort, preview, edit, enable/disable, and inspect audit history. Customer accounts must never receive a package-browse or activation screen.

### Package editor controls

| Control / button | Meaning and expected effect |
| --- | --- |
| **Edit package** | Opens the selected package's complete editable settings. Loads persisted values, not UI defaults. |
| **Package name** | Changes the administrator-defined display name. Existing customer entitlements keep their package/version snapshot; future qualification follows the approved effective-time rule. |
| **Package badge** | Sets badge label and approved icon/style (for example, “Starter”, “Plus”, or “Premium”). Use an allowlist for icon/color choices; do not accept arbitrary executable markup. The badge is visual and never changes eligibility or financial policy. |
| **Qualifying threshold (USD)** | The cumulative USD-equivalent qualifying manual-admin-credit amount required for automatic eligibility. Only the admin portal's qualifying Credit Customer flow counts. |
| **Package duration** | Sets the duration of a newly assigned entitlement (days/months as supported by the schema). The server calculates expiry; the browser does not. |
| **Daily pop-up/opportunity quota** | Sets this package's daily contribution. Active eligible package quotas add cumulatively, subject to global/customer caps and the combined daily earnings ceiling. Never hardcode one quota for all customers. |
| **Minimum capital per opportunity** | Sets the minimum eligible capital required for the opportunity. The worker checks the authoritative wallet balance before allocation. If insufficient, show an “Insufficient balance — not allocated” card with required capital, eligible available balance and shortfall; do not debit or pretend a trade occurred. |
| **Capital amount / capital range** | Sets fixed required capital or permitted lower/upper bounds. The server snapshots the selected capital amount before allocation and validates `min ≤ selected ≤ max`. Store money as integer minor units per currency. The customer browser cannot choose or alter it. |
| **Profit percentage minimum / maximum** | Defines the inclusive permitted rate range per eligible pop-up (for example, 2.00%–5.00%). Support decimal values such as 2.7%, 3.2% and 4.9%; store rates as integer basis points (2.70% = 270 bps), not binary floating point. Validate `0 ≤ min ≤ max ≤ configured system cap`. The server chooses a rate once using a cryptographically secure, uniform selection of an integer basis-point value from the inclusive minimum through maximum (1 bp = 0.01 percentage point, if that precision is enabled), snapshots it on the opportunity, and never rerolls it after retry/restart. If the range is a platform-defined contractual payout, label it clearly as such rather than as market-generated profit. |
| **Package platform-fee policy/version** | Maintains append-only per-package versions with an integer-basis-point rate, rounding rule, effective time, actor, reason and provenance. Each administrator save appends a new version; it never edits an earlier version. When a future version is scheduled, show the currently effective policy separately from the latest policy and require optimistic updates to target the latest version. Legacy global settings are read-only. Migration 0101 copies the validated legacy global rate and rounding exactly into version 1 only for packages that already exist; if the source is missing, invalid or unsupported, fail closed without guessing a default or creating a partial baseline. A newly created package receives no implicit fee; it remains blocked from allocation until an administrator explicitly sets its initial version. Allocations snapshot the package, rate, version, rounding rule and effective time. Historical trades, settlements and ledger entries are never rewritten; missing or invalid immutable trade snapshots block manual reconciliation rather than falling back to a mutable global setting. Fees apply only to confirmed positive gross profit; zero-profit and loss outcomes incur no profit fee. This setting cannot enable automatic execution. |
| **Pop-up display duration (seconds)** | Controls how long the expanded card remains expanded before it can be minimized/condensed. It must not close or erase a live/pending trade. The minimized bottom dock remains accessible until the authoritative terminal-state dismissal rules are met. |
| **Trade duration minimum / maximum** | Sets the inclusive allowed lifetime of each pop-up trade. Validate positive bounds, maximum ≥ minimum and system safety caps. The server selects one integer duration in seconds once using a cryptographically secure uniform selection within the inclusive configured bounds, persists `opened_at`, `due_at` and policy version, and uses UTC/database time. A restart resumes the same deadline; it must never restart the countdown or choose a new duration. |
| **Opportunity schedule / interval** | Sets the server-side delivery cadence. The daily target contributes to the daily quota cap; maximum visible offers is a separate concurrency limit. After a delivery, the worker derives a stable interval within the saved minimum/maximum bounds from the durable delivery-event ID, customer ID and policy version. The same deadline is reproduced after restart; disabling randomization uses the minimum interval. The separate post-completion interval is measured from the latest settled trade completion/wallet-posting timestamp, not from popup delivery. The next delivery waits until both deadlines have passed. |
| **Maximum visible cards / concurrency** | Caps presentation density per customer without dropping durable work. Additional due items remain queued/available according to policy and quota. |
| **Company rotation rules** | Chooses only currently administrator-verified, enabled, non-archived catalogue IDs, then applies country filters and repeat-avoidance behaviour. Unverified, Disabled and Archived records never appear in customer-facing company search or opportunity pop-ups. An empty approved pool has no company fallback. Rotation uses stable Logo IDs and persisted state; it never changes trade execution, capital or settlement. |
| **Country / category filters** | Optional filters applied to the administrator-verified, enabled, non-archived pool. A blank country filter includes all approved records, not all 1,811 source rows. Unknown/unverified country must remain explicitly unverified; do not infer flags or silently exclude records without documenting the active filter. |
| **Daily earnings ceiling** | Caps cumulative daily earnings under the saved policy. The server checks the combined ceiling transactionally before allocation/settlement as appropriate; a client display is not enforcement. |
| **Retry / carry-forward policy** | The single shared **Retries & Carry-Forward** owner sets delivery retry policy, total delivery attempts, and delivery-specific retry intervals. It does not control or enable trade-execution retries. Missing/invalid intervals mean no-retry/fail-closed; do not guess intervals. Delivery retry must never cause financial activity. |
| **Enabled / pause** | Enables a package for future automatic eligibility or pauses new allocations. Pausing must not delete queued work or block required settlement/reconciliation. |
| **Preview customer card** | Renders a preview from the selected saved settings and catalogue records. It must label sample/preview data and must not create a real opportunity, allocation, wallet entry or trade. |
| **Save changes / publish** | Validates and persists settings server-side, writes actor/time/reason plus previous/new values to the audit history, increments the policy version, and publishes changes under the effective-time rule. A success toast alone is not proof; reload must return the persisted values. |
| **Audit history** | Shows who changed each field, when, why, previous/new values, policy version and effective time. It is read-only for historic records. |

Controls may be grouped into tabs such as **Package & Badge**, **Capital & Profit Policy**, **Pop-up Display**, **Company Rotation**, **Schedule & Quotas**, **Limits & Recovery**, and **Audit History**. Grouping must not hide any required field or imply that an unimplemented control already works.

### Explicit configuration and activation gates

- The create-tier form presents threshold, package duration, and daily opportunity entitlement as blank required fields. The package lifecycle status may start enabled; it does not override the canonical global eligibility/delivery masters.
- New policy rows have valid configured payout-rate and duration ranges for informational pop-up presentation. Legacy per-tier master columns are stored as inert OFF placeholders; global masters are not copied into each package row. The administrator must set global eligibility and delivery through Package Configuration. Automatic financial execution remains OFF.
- New tiers do not receive per-package copies of global policy state. Migration 0100 retains existing legacy rows, initializes each global master ON only if every legacy source row was ON, and saves disabled package names in an administrator diagnostic. Global master OFF states remain restrictive until an audited administrator update.
- Package lifecycle enablement is independent of the global master gates. On a disabled-to-enabled transition, the server requires valid saved informational display bounds; it does not require or edit copied per-tier global switch values. Customer qualification and new informational delivery still require the canonical global masters to be available and ON. Automatic trading/execution, result determination and automatic customer-fund allocation remain hard-disabled.
- Reads never create policy rows. A missing or invalid saved policy pauses delivery/allocation for that tier; reconcile it through an audited administrator save or a reviewed forward migration.
- The canonical Trading migration chain now continues through `0100_global_trade_master_controls.sql` after `0099_trading_global_timing_policy_version.sql`. Migration 0100 seeds the typed global master policy and a legacy conflict diagnostic using restrictive precedence; it does not drop or rewrite legacy policy rows or financial records. Package-fee migration/data acceptance remains pending: the rate and rounding values are not live-DB-verified until the disposable MySQL/MariaDB package-fee integration passes. See the blueprint decision log.
- The 0088 reconciliation sets new policy/delivery/trading defaults to disabled; 0089 disables legacy policies without complete valid bounds. 0091 stores configured rate, duration, display duration, policy version and company metadata on both popup and trade; 0092 adds nullable `trade_positions.walletFundingPlanJson`; 0093 creates durable, globally unique wallet-adjustment request keys; 0094 allows unconfigured trade-duration bounds to be SQL `NULL` while preserving existing configured values; 0095 widens FX evidence source-date storage so new snapshots retain the complete provider timestamp. Exact branch-specific histories are preserved and validated by hash as documented in the canonical specification; do not edit applied tracker rows or replace archived SQL.

### Opportunity publication source

- The database-backed opportunity worker distributes already-published, open opportunity rows. It does not currently create new opportunity offers automatically.
- Market-data refresh stores reference instrument and FX snapshots. The current `ensureMarketDrivenOpportunities` implementation expires stale offers and reports the count of remaining open offers; it explicitly returns `generationDisabled: true` and `created: 0`.
- An administrator must publish a validated opportunity in **Admin portal → Trade Settings → Publish & Manage Opportunities**, or import a reviewed CSV through **Import opportunity ledger**. The customer delivery worker can only deliver offers that are present, open, within their time window, and compatible with the customer's active tier policy and quota.
- The manual publishing form starts with blank symbol, venue, minimum amount, reward basis-point and duration fields; it does not prefill placeholder assets, venues or payout terms. Each single offer requires a source reference (1–160 characters) and operator review note (1–2,000 characters). CSV imports use `symbol,venueFrom,venueTo,currency,minimumMinor,expectedRewardBps,durationSeconds,sourceReference,reviewNotes`; every row is validated before the batch is accepted, and one invalid row rejects the whole import. Each published offer and its administrator-attributed source reference, review note and accepted terms are recorded in Trade Audit History in the same transaction. The platform does not independently verify the external evidence or the substance of the note.
- The open-offer list is limited to 100 visible rows. A currently open, unexpired offer can be manually closed only with a non-empty reason (up to 2,000 characters); the status change and actor/reason audit record are atomic, retries are idempotent, and the page reports success only after fresh persisted read-back. Closing stops future delivery consideration for that offer; existing delivered popup/trade snapshots are unchanged.
- If the open-offer count is zero, no customer pop-up can be produced, even when package eligibility and pop-up delivery are enabled. The Trade Settings opportunity-publishing page states this source requirement.
- If the block-until-settled setting pauses new delivery while a prior trade is outstanding, already-published offers remain open until their own expiry; they are not permanently closed by the pause. Once the prior trade is resolved, still-valid offers may be delivered if the customer remains eligible.
- Do not remove the generation-disabled guard by synthesizing a reward, venue, price, quote or execution result from reference market data. Any future automatic offer publisher must consume explicitly approved offer terms and verified source evidence; it must not invent financial terms.
- An empty verified-company rotation pool removes the company identity from the pop-up, not the opportunity itself. Company verification is not a prerequisite for the card to display.

## 3. Customer pop-up: required content

The same server-saved package settings govern the customer's actual display. The card must be bound to a stable opportunity/trade ID and a stable company Logo ID.

### Expanded pop-up

Show fields when applicable and available:

- Package badge and package display name (read-only, from the customer's automatically assigned entitlement/configuration snapshot).
- Company name and local logo from the saved catalogue snapshot. Customer pop-ups and Trade history must not display the internal “reference-only” label, catalogue-status labels, source-confidence notes, or internal Logo ID. Keep the stable Logo ID and full metadata in server-side snapshots and administrator controls. This presentation rule does not change the requirement that only currently Verified, enabled, non-archived companies enter the rotation pool; do not describe a country folder as verified headquarters or listing information.
- Supplied symbol/code and exchange/status classification only as reference data, without implying listing verification.
- Opportunity/trade reference and current authoritative status.
- Required capital, committed capital allocation, each wallet/currency used, the native amount debited from each wallet, the exchange-rate source and timestamp used for any cross-wallet conversion, available balance and shortfall when insufficient.
- The configured profit-rate range and, once the opportunity is committed, the exact snapshotted rate selected for that opportunity. If the opportunity uses a platform-defined contractual payout, label it as the configured return/payout and show the calculation basis. Do not describe it as market-earned profit without evidence-backed execution/settlement.
- Gross profit, platform fee percentage and amount, net profit, principal returned and total credited amount as distinct fields. Do not show uncommitted or estimated amounts as wallet credits.
- Server-recorded start/opening time, persisted due/expiry time, countdown, chosen duration, and actual terminal/settlement time when available.
- Status such as Scheduled, Available, Insufficient balance, Allocated, Pending, Retrying, Awaiting settlement, Settled, Failed or Carried forward, consistent with the actual persisted lifecycle.
- A concise reason/status note for missed opportunities or pending settlement.

If a field is not yet known, show “Pending” or “Unavailable”; never fill it with a hardcoded default. The countdown is a view of the server's timestamp, not proof of execution or settlement.

### Minimize, maximize and dismissal

- **Minimize** collapses the expanded card into a fixed bottom-of-viewport dock.
- **Maximize** reopens it without resetting countdowns or lifecycle state.
- The expanded display timeout and Minimize/Maximize controls change presentation only. Dismissed and expired delivery records are terminal and are not retried or delivered again. No delivery or card action may allocate funds, execute a trade, determine a result, debit/credit a wallet or settle an account.
- Expiry changes delivery status only; it is not evidence of execution or settlement. Financial settlement status is read separately from authoritative server records.
- Multiple cards must remain separately keyed; one card must not overwrite another.

## 4. Company rotation rules

- Source records from the existing local catalogue index and country-grouped metadata; resolve images through indexed relative paths, not names assembled into paths.
- Use the stable Logo ID as the primary catalogue key. Do not fuzzy-match or renumber duplicate names.
- Filter out a record only for a documented eligibility/filter rule; keep the current catalogue's unverified country and ticker statuses visible.
- Persist rotation cursor/history per relevant customer/package or other explicitly chosen rotation scope. Advance the cursor transactionally with opportunity creation so crashes/retries do not reset or double-advance it.
- Prefer not to repeat a company for the same customer/package until the filtered pool is exhausted; then start a new cycle with a recorded cycle/version. If the pool is too small, disclose the repeat behavior in the admin preview.
- Admin can inspect the active catalogue count, applied filters, last selected Logo ID, next candidate and rotation state. A **Preview next company** action is read-only and must not advance production rotation state.
- Never use a company name/logo as a substitute for independently verified trade evidence, price, instrument identifier, execution or settlement.

## 5. Persistent server worker and restart behaviour

The server owns package entitlement, informational delivery scheduling/quota checks, company selection, delivery retry state and card state independently of customer login/browser uptime. Automatic trading/execution, result determination and automatic customer-fund allocation remain hard-disabled. Capital funding and trade-lifecycle calculation rules below describe safeguards for any separately authorized future allocation; they are not permission to perform those actions now. The existing administrator-confirmed credit/debit posting worker remains active and operates only on confirmed settlement records.

### Capital, wallet conversion and exact calculations

- Required capital is compared in a canonical configured currency (USD minor units unless the administrator explicitly configures another supported base currency). The worker may fund the requirement from one or more eligible customer wallets, including a different currency wallet, only when combined converted spendable balance covers the full amount.
- Obtain a fresh, currency-appropriate exchange-rate quote at allocation time. Persist rate, provider, source timestamp, base/quote currencies, native debit amount and canonical equivalent on the opportunity/ledger evidence. A quote that is missing, stale, invalid or unavailable fails closed: do not debit or allocate using a guessed/stale rate.
- Use a documented wallet selection order and atomic reservation/debit across chosen wallets. Lock all affected wallet/ledger rows in stable order, recheck available balances inside the transaction, and either commit every required debit/reservation and the opportunity or commit none. Never create a negative balance or partial capital allocation. Record any conversion fee/spread explicitly; do not hide it in rounding.
- Do not silently convert funds by editing wallet balances. Use auditable paired ledger entries or the existing supported conversion ledger flow, with stable idempotency keys. Preserve native-currency precision and round only at currency minor-unit boundaries using one documented rounding mode.
- Represent rates as integer basis points and money as integer minor units/decimal-safe integers. For capital `C` minor units and rate `r` basis points, calculate gross configured payout as `round(C × r / 10,000)` using the specified currency rounding mode. Example: capital 10,000 minor units at 270 bps (2.70%) produces 270 minor units before any separately configured fee. Validate intermediate multiplication for overflow and never use binary floating point for ledger amounts.
- If a future allocation is separately authorized, calculate any fee using the package-specific saved fee version, rate and rounding rule captured on that allocation—not a mutable global default. Principal return, gross result, fee, net amount and wallet posting must remain distinct and reconcile exactly.
- A future allocation must snapshot package, selected rate, package fee version/rate/rounding/effective time, and related terms before processing. Retries/restarts must reuse the same snapshot. Policy edits apply to future allocations only and never rewrite existing trades, settlements or ledger entries.
- At any due time, a timer or delivery worker must never determine a result. The only currently active financial worker is the existing administrator-confirmed credit/debit posting worker, which posts a confirmed, evidence-backed result idempotently when eligible.

- Use the existing managed worker runtime and durable database-backed jobs/state. Do not introduce a new process per customer or a tight polling loop.
- Persist delivery due time/status, delivery attempt count, lease owner/expiry, delivery policy version, stable opportunity ID, company Logo ID and rotation cursor/state needed to resume.
- On startup/restart, recover due informational delivery work and expired leases in bounded cycles. Do not duplicate delivery or rotate twice for one idempotency key. Financial execution/allocation is not part of this worker.
- Claim delivery jobs with database locks/leases and fencing; use idempotency keys, bounded batches, indexed lookups and overlap protection. Apply retries only under the shared saved delivery policy below; do not import trade-execution retry intervals.
- Graceful shutdown stops new ticks, drains active cycles within a bound, and releases/lets leases expire safely. Startup health should distinguish not-started, healthy, stale, degraded and unavailable; heartbeat/last-success values must be persisted.
- Configuration changes are versioned and audited. Each scheduled delivery records the settings version that created it. Fee changes affect future allocations only; historical trades, settlements and ledger entries are immutable.
- A restart test must prove due delivery is resumed with one delivery/rotation advance and no financial activity. The separate settlement-credit-posting worker retains its own idempotency/recovery tests. Multi-worker tests must prove only one worker owns a claimed item at a time.

### Shared delivery retry and carry-forward policy

- **Retries & Carry-Forward** is the single shared administrator owner for delivery retry policy, `maxDeliveryAttempts`, and delivery-specific retry intervals across all tiers. Do not add a second per-tier retry owner or reuse trade-execution timing fields.
- Each tier's `maxPendingDeliveries` counts only rows whose delivery status is `queued`, `in_progress`, or `retry_wait`. `dismissed` and `expired` are terminal and excluded from the pending count.
- A maximum of 3 attempts means attempts 1, 2, and 3 total; it is not one initial attempt plus three retries.
- No retry interval is guessed. Until the administrator saves valid delivery-specific intervals and an explicit policy, delivery uses no-retry/fail-closed behavior. Missing/invalid policy or interval data does not trigger a retry.
- Delivery retries/carry-forward are not trade-execution retries. Automatic execution, result determination and automatic customer-fund allocation remain hard-disabled; no delivery retry, dismissal or expiry may create a financial effect or ledger entry.

### Settlement review and delayed wallet-credit timing

The settlement timing controls and manual settlement queue represent separate stages:

- Trade duration ends at the persisted `settlesAt`.
- The configured settlement delay produces `settlementReviewAt = settlesAt + settlementDelaySeconds`. Administrators can review and confirm the actual result only at or after this timestamp.
- The wallet-credit delay produces `creditAt = settlementReviewAt + creditDelaySeconds`. This is the earliest time the server may post the confirmed result to the wallet.
- A legacy trade without `settlementReviewAt` uses its prior `creditAt` as the review deadline when present, preserving the old review gate; if both are absent, it uses `settlesAt`. A legacy trade without `creditAt` uses its review deadline as the credit deadline. Historical rows are not rewritten to invent missing delays.

When an administrator confirms the actual gross result and evidence reference, the server saves the result and immutable package-specific fee-policy snapshot, claims the reference, and changes the settlement state to `confirmed_awaiting_credit`. This is not a wallet credit: principal remains locked, the reward reservation remains reserved, and no ledger row or balance update is made by the confirmation request. Historical snapshot values are not recomputed when a package fee version changes.

The existing monitored `settlement-credit-posting` worker remains active and posts only after both conditions are true: the result has been administrator-confirmed and `creditAt` has arrived. It verifies the saved reference, fee calculation/version/rounding, reservation and locked principal, then writes ledger entries, updates the wallet and marks the trade completed in one idempotent transaction. If confirmation occurs after `creditAt`, posting can occur on the next worker cycle. Notifications and terminal settlement status follow the committed wallet posting, not the administrator confirmation. This worker does not automatically execute trades, determine results, or allocate customer funds.

Never interpret a countdown, `settlesAt`, `settlementReviewAt` or `creditAt` as proof of an actual result. A timer alone cannot confirm a trade or release funds.

### Require previous settlement

The canonical global **Require previous settlement** prerequisite is locked ON. A new allocation is blocked for that customer while any earlier non-cancelled trade across their tiers remains unsettled. The previous trade must have completed administrator review, passed its saved credit deadline, and had its wallet-credit transaction committed (`status=settled`, `settlementStatus=completed`). An administrator confirmation by itself does not clear the gate. No per-tier API accepts this setting and the admin UI has no OFF action. The gate does not bypass other quotas, active-trade limits, wallet checks or the administrator’s global allocation pause. When the gate temporarily blocks an automatic worker, the opportunity is deferred and retried after the configured delay; the blocked claim is released from technical and daily attempt counters and is not marked missed.

The global allocation pause applies only to new allocations. It does not suspend the settlement-review queue, confirmed wallet-credit posting, reconciliation or safe idempotent replay of an already-created trade.

## 6. Administrator company catalogue and tier-list presentation

- **Trade Settings → Company Catalogue** opens a dedicated administrator company-catalogue page, not the opportunity engine or package/tier editor.
- The page reads the existing 1,811 logo-ID-aligned records from `companyCatalogueReference`; it must not create a replacement catalogue or alter the source records.
- Display 10 company records per page with Previous/Next controls, total/matching counts, search by company name/domain/supplied ticker/exchange, and exact country-folder filtering.
- Each result keeps its local logo, stable Logo ID, company name, country folder, supplied ticker/code, exchange, workbook status/classification, parent ticker and reason together. Show reference-only/unverified status; do not imply that a supplied ticker is a verified active security.
- **Trade Settings → Tiers & Eligibility** displays 5 administrator-managed tiers per page with Previous/Next controls. Creating, editing, enabling, saving, and audit reasons remain unchanged by paging. Do not hide or discard tiers when moving between pages.
- Package/tier policy settings remain in their dedicated submenu; company-catalogue navigation must not render package controls.

## 6A. Administrator company catalogue bulk management

Open **Trade Settings → Company Catalogue** to manage the existing 1,811 logo-ID-aligned reference records.

| Control | Behaviour |
| --- | --- |
| **View all companies** | Switches from the default 10-record page to one scrollable list of all matching active records. |
| **Show 10 per page** | Returns to Previous/Next pagination without changing the catalogue. |
| **Select visible** | Adds every record currently displayed to the selection. |
| **Select all matches** | Selects every record matching the current search, country and status filters, not only the current page. |
| **Individual checkbox** | Adds or removes that one stable Logo ID from the selection. |
| **Clear selection** | Clears the current selection. |
| **Mark selected verified** | Sets the internal **Admin marked verified** catalogue status for the selected records. Verified records become eligible for customer company pop-up display only. This is an administrative label, not independent listing verification or trade-execution eligibility. |
| **Mark selected unverified** | Removes the admin-verified label for the selected records. |
| **Delete selected** | Archives selected records from the active catalogue view. The static source catalogue is not physically deleted. |
| **Archived / deleted filter** | Displays archived records so they can be selected and restored. |
| **Restore selected** | Restores archived records to the active catalogue as unverified. |

Every bulk action requires a confirmation prompt. The server validates every Logo ID, requires administrator authorization, updates the status map inside a database transaction, and writes an audit event containing the action, reason, selected IDs, actor and timestamp. The default active view excludes archived records. Selection is explicit and the UI shows its count before any bulk action.

**Important status boundary:** admin verification is a manually assigned catalogue label that approves a company for customer opportunity pop-up display only. The server rotation worker uses only Verified IDs and excludes Disabled and Archived IDs; Unverified, Disabled and Archived companies never appear in customer-facing search or pop-ups. If no approved company matches the package filters, the opportunity has no company identity rather than an unverified fallback. This label does not verify a company's legal identity, public listing, ticker, exchange, headquarters or country assignment. It does not change the static source record's `listingStatus`, `lastVerifiedAt`, `referenceOnly`, or `eligibleForVerifiedTradeRotation`; it cannot authorize market data, order execution, allocation or settlement.

## 7. Admin operational status and acceptance tests

### Canonical global admin controls

- The canonical global master editor is mounted only on **Package Configuration**; unrelated pages do not show duplicate controls. The separate global new-allocation pause is available there as well. Home remains a read-only summary.
- The editor reads the single administrator-only `trade.globalControls` settings row. Missing, malformed or unavailable settings are reported as unavailable; the page does not create defaults or treat a missing global row as enabled.
- The global editor exposes tier-policy eligibility, informational pop-up delivery, company rotation, randomized timing and burst delivery. Global writes use a required administrator reason, expected policy version, transaction/row lock, immutable audit event, and fresh read-back. The strict per-tier patch API rejects these former master fields.
- The separate allocation pause blocks new financial allocations only; it does not suspend informational pop-up delivery or alter active records, settlement or reconciliation.
- Automatic trading/execution, result determination, and automatic customer-fund allocation are hard-disabled and shown as locked status only. A global informational-delivery switch cannot enable financial activity. The existing administrator-confirmed credit/debit posting worker remains active.
- The previous-settlement prerequisite is a canonical global value locked ON. The migration forces it ON and records packages that previously had it OFF for review. Settlement delay edits remain subject to their own global timing validation.
- A successful global save is shown only after a fresh read confirms the changed value and incremented policy version. Conflicts from stale versions must be refreshed before retrying.
- The panel must never present a pop-up, countdown, saved policy, or worker heartbeat as evidence that a financial trade executed or settled.


Admin-only **Trade Settings → Company Rotation & Pop-ups** should show current policy version, package settings, worker status, last successful cycle, due/queued counts, stale leases, retry/dead-letter counts, catalogue pool size and rotation health. Health data must be truthful; missing health data is “Unavailable”, not “Healthy”.

Acceptance must cover:
- Every field persists, reloads and changes customer display/runtime behavior only at its documented effective time.
- Package name, duration, badge, quota, capital minimum/range, profit percentage range, trade duration range, display duration, filters, schedule and limits are not hardcoded in customer code.
- For configured rates such as 2%–5%, selected rates always stay inside inclusive bounds, are persisted once, and are reused unchanged after retries/restarts.
- Capital funding from multiple wallets is atomic; cross-currency debits use fresh timestamped rates and exact minor-unit calculations, with no partial debit or negative balance.
- Trade due times survive restarts; a late worker resumes/reconciles overdue items without resetting duration, rerolling rate or creating duplicate debits/payouts.
- Different assigned packages produce the configured differences and cumulative quota behavior.
- The correct company logo/name/country/Logo ID remain associated across rotation and card lifecycle.
- Only currently admin-verified, enabled, non-archived IDs are assigned to customer opportunity pop-ups; unverified, disabled and archived IDs are excluded from all customer-facing company retrieval, country filters apply to the approved pool, and an empty pool never falls back to an unverified company.
- Customer preview uses exactly the same current approved pool as live assignment; the full informational catalogue search is never an alternate source for popup identity.
- Missing or malformed `trade.companyCatalogue.adminState` fails closed, and active popup reads immediately hide identities whose approval has been removed, disabled or archived.
- Marking a previously approved company Unverified, Disabled or Archived hides its identity from active customer pop-up responses without rewriting completed historical snapshots.
- Rotation avoids repeats as configured and resumes correctly after restart and concurrent worker claims.
- Insufficient capital produces an informational missed card and no debit/allocation.
- Pop-up timeout/minimize/maximize/scroll/countdown cannot change financial state.
- No synthetic/random profit, execution, quote or settlement is generated. Estimates stay estimates until supported by actual settlement evidence.
- Worker restarts, stale leases, transient failures, duplicate delivery and retry/dead-letter recovery are tested against disposable databases.
- Per-tier `maxPendingDeliveries` counts exactly `queued`, `in_progress`, and `retry_wait`, excluding terminal `dismissed` and `expired` deliveries.
- `maxDeliveryAttempts=3` means attempts 1–3 total. Delivery retry and retry intervals come from the single shared **Retries & Carry-Forward** owner, are not borrowed from execution policy, and are not guessed; absent/invalid saved intervals produce no-retry/fail-closed behavior.
- Dismissed and expired deliveries are terminal; neither is retried or re-delivered. Delivery, retry and carry-forward create no allocation, execution, result determination, wallet change or ledger entry.
- Package-fee baseline migration creates append-only version 1 for every existing package using the current valid legacy global rate and rounding exactly, with migration-baseline reason/provenance. Missing, invalid or unsupported source data fails closed without fallback, guessed defaults or a partial migration.
- Fee saves append package-specific versions. A new allocation snapshots package ID, fee rate, version, rounding rule and effective time; changes affect future allocations only; historical trades, settlements and ledger entries are never rewritten. The existing administrator-confirmed posting worker remains active and uses saved snapshots.
- The package-fee rate/rounding baseline is not live-DB-verified until the disposable integration passes against both MySQL and MariaDB after migrations. Do not treat this requirements manual, static tests, or a workflow command as database acceptance.
- Authenticated browser acceptance is a separate gate and must not be claimed from this documentation update or static CI checks.
- All admin edits have role checks, validation, audit history and policy versions.
- No production deployment, live database verification, browser acceptance, or application migration is implied by passing source CI.

## 8. Canonical references

- Main product contract: `docs/TRADING_SYSTEM_SPECIFICATION.md`
- Mandatory coding-agent instructions: `AGENTS.md`
- Admin navigation and menu guide: `docs/admin-portal-menu-guide.md`
- Worker health and recovery: `docs/trading-worker-health-and-recovery.md`
- Worker shutdown contract: `docs/server-worker-shutdown.md`

If this manual and the canonical specification conflict, stop and reconcile both before implementation. Update both in the same change when these requirements change.


**Maximum trade attempts per day:** A separate execution-domain limit, not a delivery-attempt setting. Automatic trading/execution and automatic customer-fund allocation are currently hard-disabled, so this setting does not authorize or cause an attempt. If an execution mode is separately authorized later, its daily cap remains distinct from the shared delivery retry policy and delivery-specific attempt counter.
