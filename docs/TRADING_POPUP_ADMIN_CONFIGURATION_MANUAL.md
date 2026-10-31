# Trading Package, Company Pop-up and Admin Editing Manual

**Status:** Canonical companion to `docs/TRADING_SYSTEM_SPECIFICATION.md`.  
**Scope:** Trade/Trading only. This document defines the intended administrator controls, what each control means, the customer pop-up contract, company rotation, and worker durability. It is a requirements manual, not proof that every listed control is already implemented.

## 1. Non-negotiable rules

1. The admin portal is the source of truth for package policy and customer pop-up behaviour. Customer UI must consume saved server configuration; it must not hardcode amounts, percentages, package names, durations, company lists, quotas, or financial results.
2. Customers never browse, choose, purchase, subscribe to, or activate packages. An authorized admin configures packages; the server assigns eligibility from qualifying manual admin wallet credits only, and package quotas accumulate according to the canonical Trading specification.
3. The company catalogue is the existing 1,811-record local image/name reference pool, keyed by stable Logo ID and mapped to local assets. Keep each company name, logo, country metadata and reference ID together. Do not recreate company names/logos in frontend constants or substitute a small hardcoded array.
4. Company rotation may choose only records whose stable Logo IDs are currently in the persisted `verifiedIds` set in `trade.companyCatalogue.adminState` and are not in `archivedIds`. Archived takes precedence if an ID appears in both sets. Missing or malformed admin state fails closed. Unverified and Archived records are excluded before country-folder filters. If no verified record matches, the opportunity may still be delivered but must have no company identity; never fall back to an unverified or otherwise unapproved record. The customer preview must use this same approved pool. Recheck current status when returning active customer pop-ups so a later unverify/archive action hides that company immediately. Avoid repeats for a customer/package until the eligible pool has been traversed when enough eligible records exist. Persist rotation state so a restart does not reset everyone to the first company. Concurrent worker instances must not allocate the same rotation slot to the same customer/opportunity.
5. Catalogue membership, a company logo, country folder, supplied ticker or rotating card does not prove that a company is publicly listed, that a market trade occurred, or that a profit was earned. The current catalogue is reference data; the current ticker candidates are not verified trade-eligible instruments. Do not use rotation itself as execution evidence.
6. **Per-pop-up capital, rate and duration are server-calculated from the saved package policy.** An eligible pop-up snapshots required capital, a profit-rate bound and a duration bound. The server selects one permitted rate and one permitted duration exactly once for that opportunity, persists them before processing continues, and calculates the configured payout from committed capital using integer minor-unit arithmetic. This is a platform-defined contractual payout rule, not evidence of a market-derived return; customer-facing wording and terms must say so clearly. Never present it as an exchange/broker-earned market profit unless supported by actual trade execution and settlement evidence. Do not invent quotes, execution records or third-party settlement. The payout rule and its financial/legal approval must be explicit before real-money rollout.
7. All settings that affect an existing trade must follow a documented version/effective-time rule. Snapshot the relevant configuration on each opportunity/trade. Editing a package must not silently rewrite terms, countdowns, fees, or financial history of an already opened trade.
8. **New tiers start disabled and unconfigured.** The admin must explicitly enter the qualifying threshold, entitlement duration, and daily opportunity quota. The server creates a new tier disabled and initializes its delivery/trading policy to an explicitly disabled sentinel state; it must not inherit a UI example threshold, quota, display duration, payout rate or trade duration. Enabling a tier requires an authorized administrator to save a valid policy with explicit policy-enabled, automatic-delivery and automatic-trading switches plus valid positive rate and duration ranges.
9. Policy reads are read-only. Missing policy rows, missing/invalid payout bounds, invalid duration bounds or disabled automation fail closed: no new popup is delivered and no new automatic allocation is made. A read must never repair missing settings by inserting defaults. An administrator save or a reviewed forward-only migration is the explicit reconciliation path.
10. The popup and trade persist the same immutable company reference metadata snapshot alongside stable Logo ID, name, logo URL, configured rate, configured trade duration, popup display duration and policy version. Snapshot metadata includes country-folder/country code, supplied ticker/symbol/exchange, ticker classification/research status, listing-status and source-confidence/verification markers. Every company reference is marked reference-only; catalogue metadata does not prove listing, price, execution or profit.

**Customer catalogue versus pop-up rule:** the customer may still browse/search the full catalogue as an informational reference library where that feature is available. That catalogue view must never supply or override the company identity on an opportunity pop-up. Pop-up assignment and customer preview are restricted to the current administrator-verified, non-archived ID pool described above.

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
| **Platform fee percentage** | Displays/configures the fee policy for eligible future trades where fee editing is authorized. Default specification is 15% of realized positive gross profit only. Save a policy version and apply it only according to the effective-time rule; no fee on failed, zero-profit or loss outcomes under the default policy. |
| **Pop-up display duration (seconds)** | Controls how long the expanded card remains expanded before it can be minimized/condensed. It must not close or erase a live/pending trade. The minimized bottom dock remains accessible until the authoritative terminal-state dismissal rules are met. |
| **Trade duration minimum / maximum** | Sets the inclusive allowed lifetime of each pop-up trade. Validate positive bounds, maximum ≥ minimum and system safety caps. The server selects one integer duration in seconds once using a cryptographically secure uniform selection within the inclusive configured bounds, persists `opened_at`, `due_at` and policy version, and uses UTC/database time. A restart resumes the same deadline; it must never restart the countdown or choose a new duration. |
| **Opportunity schedule / interval** | Sets the permitted server-side delivery windows or cadence. The worker, not the browser, decides when an opportunity is due. Validate timezone and interval boundaries. |
| **Maximum visible cards / concurrency** | Caps presentation density per customer without dropping durable work. Additional due items remain queued/available according to policy and quota. |
| **Company rotation rules** | Chooses only administrator-verified, non-archived catalogue IDs, then applies country filters and repeat-avoidance behaviour. Unverified/Archived records never appear in customer opportunity pop-ups. An empty approved pool has no company fallback. Rotation uses stable Logo IDs and persisted state; it never changes trade execution, capital or settlement. |
| **Country / category filters** | Optional filters applied to the administrator-verified, non-archived pool. A blank country filter includes all approved records, not all 1,811 source rows. Unknown/unverified country must remain explicitly unverified; do not infer flags or silently exclude records without documenting the active filter. |
| **Daily earnings ceiling** | Caps cumulative daily earnings under the saved policy. The server checks the combined ceiling transactionally before allocation/settlement as appropriate; a client display is not enforcement. |
| **Retry / carry-forward policy** | Sets bounded retry and next-cycle carry-forward behaviour for eligible failed/pending work. Must preserve idempotency and must not duplicate an allocation or settlement. |
| **Enabled / pause** | Enables a package for future automatic eligibility or pauses new allocations. Pausing must not delete queued work or block required settlement/reconciliation. |
| **Preview customer card** | Renders a preview from the selected saved settings and catalogue records. It must label sample/preview data and must not create a real opportunity, allocation, wallet entry or trade. |
| **Save changes / publish** | Validates and persists settings server-side, writes actor/time/reason plus previous/new values to the audit history, increments the policy version, and publishes changes under the effective-time rule. A success toast alone is not proof; reload must return the persisted values. |
| **Audit history** | Shows who changed each field, when, why, previous/new values, policy version and effective time. It is read-only for historic records. |

Controls may be grouped into tabs such as **Package & Badge**, **Capital & Profit Policy**, **Pop-up Display**, **Company Rotation**, **Schedule & Quotas**, **Limits & Recovery**, and **Audit History**. Grouping must not hide any required field or imply that an unimplemented control already works.

### Explicit configuration and activation gates

- The create-tier form presents threshold, package duration, and daily opportunity quota as blank required fields. It does not preselect a tier threshold or quota and does not offer an enabled checkbox for a new tier.
- A newly created tier is disabled in both package configuration and its saved opportunity policy row. Sentinel values (policy version zero, disabled automation switches, no payout/duration bounds) make the unconfigured state explicit rather than relying on database defaults.
- To enable automatic delivery, the administrator must save both a valid inclusive positive payout-rate range and a valid inclusive trade-duration range. The server rejects incomplete, incompatible or implicitly defaulted settings.
- Policy saves include explicit enabled, automatic-delivery and automatic-trading booleans. Automatic trading cannot be enabled unless the policy and delivery are enabled; enabling a package is rejected until the saved policy is valid.
- Reads never create policy rows. A missing or invalid saved policy pauses delivery/allocation for that tier; reconcile it through an audited administrator save or a reviewed forward migration.
- The canonical Trading migration chain is `0086_trading_popup_policy_snapshots.sql`, `0087_trading_opportunity_execution_leases.sql`, `0088_trading_package_policy_schema_reconciliation.sql`, `0089_trading_popup_policy_ranges.sql`, `0090_trading_company_spotlight_rotation.sql`, `0091_trading_popup_trade_snapshots.sql`, `0092_trading_trade_wallet_funding_plan_snapshot.sql`, `0093_admin_wallet_adjustment_idempotency.sql`, `0094_trading_policy_duration_bounds_nullable.sql`, and `0095_fx_snapshot_source_timestamp_precision.sql`. Every step is registered in the Drizzle journal, portal runner, installer recovery and worker runtime schema bridge.
- The 0088 reconciliation sets new policy/delivery/trading defaults to disabled; 0089 disables legacy policies without complete valid bounds. 0091 stores configured rate, duration, display duration, policy version and company metadata on both popup and trade; 0092 adds nullable `trade_positions.walletFundingPlanJson`; 0093 creates durable, globally unique wallet-adjustment request keys; 0094 allows unconfigured trade-duration bounds to be SQL `NULL` while preserving existing configured values; 0095 widens FX evidence source-date storage so new snapshots retain the complete provider timestamp. Exact branch-specific histories are preserved and validated by hash as documented in the canonical specification; do not edit applied tracker rows or replace archived SQL.

## 3. Customer pop-up: required content

The same server-saved package settings govern the customer's actual display. The card must be bound to a stable opportunity/trade ID and a stable company Logo ID.

### Expanded pop-up

Show fields when applicable and available:

- Package badge and package display name (read-only, from the customer's automatically assigned entitlement/configuration snapshot).
- Company logo, company name, stable Logo ID, and country-folder/country-code metadata from the saved catalogue snapshot. Label these as company-reference metadata; do not describe a country folder as verified headquarters or listing information. Show unverified status when the source record is unverified.
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
- The expanded display timeout and Dismiss control only change presentation. They cannot discard the durable opportunity, cancel or suppress server-owned automatic execution, alter entitlement/quota, debit or credit a wallet, or settle an account. A dismissed event remains eligible for automatic processing when its persisted delivery and execution states permit it.
- Do not dismiss at countdown zero until the server reports an appropriate terminal status. Pending, retrying and awaiting-settlement items remain accessible.
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

The server owns scheduling, package entitlement, quota checks, company selection, capital selection, cross-wallet balance/conversion, one-time profit-rate and duration selection, trade lifecycle, retries, settlement reconciliation and card state. Customer login/browser uptime is irrelevant.

### Capital, wallet conversion and exact calculations

- Required capital is compared in a canonical configured currency (USD minor units unless the administrator explicitly configures another supported base currency). The worker may fund the requirement from one or more eligible customer wallets, including a different currency wallet, only when combined converted spendable balance covers the full amount.
- Obtain a fresh, currency-appropriate exchange-rate quote at allocation time. Persist rate, provider, source timestamp, base/quote currencies, native debit amount and canonical equivalent on the opportunity/ledger evidence. A quote that is missing, stale, invalid or unavailable fails closed: do not debit or allocate using a guessed/stale rate.
- Use a documented wallet selection order and atomic reservation/debit across chosen wallets. Lock all affected wallet/ledger rows in stable order, recheck available balances inside the transaction, and either commit every required debit/reservation and the opportunity or commit none. Never create a negative balance or partial capital allocation. Record any conversion fee/spread explicitly; do not hide it in rounding.
- Do not silently convert funds by editing wallet balances. Use auditable paired ledger entries or the existing supported conversion ledger flow, with stable idempotency keys. Preserve native-currency precision and round only at currency minor-unit boundaries using one documented rounding mode.
- Represent rates as integer basis points and money as integer minor units/decimal-safe integers. For capital `C` minor units and rate `r` basis points, calculate gross configured payout as `round(C × r / 10,000)` using the specified currency rounding mode. Example: capital 10,000 minor units at 270 bps (2.70%) produces 270 minor units before any separately configured fee. Validate intermediate multiplication for overflow and never use binary floating point for ledger amounts.
- If platform fee policy applies, calculate the fee from the documented base (default: 15% of positive gross payout only) using the same exact rounding rule, then calculate net payout separately. Principal return, gross payout, fee, net payout and total wallet credit must be distinct ledger amounts and reconcile exactly.
- Select rate and duration once, persist them with opportunity ID and configuration version before financial processing, and enforce a unique idempotency key. Retries and restarts reuse persisted rate, capital, wallet allocation plan, FX snapshots and due time; never reroll, reprice a committed debit, or extend duration. If a pre-commit check fails, no trade is created and no funds move.
- At persisted due time, the worker may finalize only according to the explicit configured payout contract and lifecycle rules. Expiry by itself is not evidence of market execution. Any product that calls the result market trading must use genuine, auditable execution/result evidence instead of treating the configured percentage formula as market profit.

- Use the existing managed worker runtime and durable database-backed jobs/state. Do not introduce a new process per customer or a tight polling loop.
- Persist due time, status, attempt count, lease owner/expiry, policy version, stable opportunity/trade ID, company Logo ID and rotation cursor/state needed to resume.
- On startup/restart, recover due jobs and expired leases, then resume normal bounded processing. Do not duplicate allocations, rotate twice for one idempotency key, or lose scheduled work because state existed only in process memory.
- Claim jobs with database locks/leases and fencing; use idempotency keys for creation, allocation and settlement. Use bounded batches, indexed lookups, overlap protection, backoff, terminal dead-letter visibility and audited recovery.
- Graceful shutdown stops new ticks, drains active cycles within a bound, and releases/lets leases expire safely. Startup health should distinguish not-started, healthy, stale, degraded and unavailable; heartbeat/last-success values must be persisted.
- Configuration changes are versioned and audited. Each scheduled item records the settings version that created it. Define whether edits apply only to future items or to open items before implementation; default to preserving the snapshot on already-open trades.
- A restart test must prove a due item is resumed after process restart with one opportunity, one rotation advance, no duplicate allocation and no duplicate settlement. Multi-worker tests must prove only one worker owns a claimed item at a time.

## 6. Administrator company catalogue and tier-list presentation

- **Trade Settings → Show offers → Company names shown** opens a dedicated administrator company-catalogue page, not the opportunity engine or package/tier editor.
- The page reads the existing 1,811 logo-ID-aligned records from `companyCatalogueReference`; it must not create a replacement catalogue or alter the source records.
- Display 10 company records per page with Previous/Next controls, total/matching counts, search by company name/domain/supplied ticker/exchange, and exact country-folder filtering.
- Each result keeps its local logo, stable Logo ID, company name, country folder, supplied ticker/code, exchange, workbook status/classification, parent ticker and reason together. Show reference-only/unverified status; do not imply that a supplied ticker is a verified active security.
- **Trade Settings → Set up trades → Customer tiers** displays 5 administrator-managed tiers per page with Previous/Next controls. Creating, editing, enabling, saving, and audit reasons remain unchanged by paging. Do not hide or discard tiers when moving between pages.
- Package/tier policy settings remain in their dedicated submenu; company-catalogue navigation must not render package controls.

## 6A. Administrator company catalogue bulk management

Open **Trade Settings → Show offers → Company names shown** to manage the existing 1,811 logo-ID-aligned reference records.

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

**Important status boundary:** admin verification is a manually assigned catalogue label that approves a company for customer opportunity pop-up display only. The server rotation worker uses only Verified IDs and excludes Archived IDs; Unverified/Archived companies never appear in pop-ups. If no approved company matches the package filters, the opportunity has no company identity rather than an unverified fallback. This label does not verify a company's legal identity, public listing, ticker, exchange, headquarters or country assignment. It does not change the static source record's `listingStatus`, `lastVerifiedAt`, `referenceOnly`, or `eligibleForVerifiedTradeRotation`; it cannot authorize market data, order execution, allocation or settlement.

## 7. Admin operational status and acceptance tests

Admin-only **Trade Settings → Company Rotation & Pop-ups** should show current policy version, package settings, worker status, last successful cycle, due/queued counts, stale leases, retry/dead-letter counts, catalogue pool size and rotation health. Health data must be truthful; missing health data is “Unavailable”, not “Healthy”.

Acceptance must cover:
- Every field persists, reloads and changes customer display/runtime behavior only at its documented effective time.
- Package name, duration, badge, quota, capital minimum/range, profit percentage range, trade duration range, display duration, filters, schedule and limits are not hardcoded in customer code.
- For configured rates such as 2%–5%, selected rates always stay inside inclusive bounds, are persisted once, and are reused unchanged after retries/restarts.
- Capital funding from multiple wallets is atomic; cross-currency debits use fresh timestamped rates and exact minor-unit calculations, with no partial debit or negative balance.
- Trade due times survive restarts; a late worker resumes/reconciles overdue items without resetting duration, rerolling rate or creating duplicate debits/payouts.
- Different assigned packages produce the configured differences and cumulative quota behavior.
- The correct company logo/name/country/Logo ID remain associated across rotation and card lifecycle.
- Only currently admin-verified, non-archived IDs are assigned to customer opportunity pop-ups; unverified/archived IDs are excluded, country filters apply to the approved pool, and an empty pool never falls back to an unverified company.
- Customer preview uses exactly the same current approved pool as live assignment; the full informational catalogue search is never an alternate source for popup identity.
- Missing or malformed `trade.companyCatalogue.adminState` fails closed, and active popup reads immediately hide identities whose approval has been removed or archived.
- Marking a previously approved company Unverified or Archived hides its identity from active customer pop-up responses without rewriting completed historical snapshots.
- Rotation avoids repeats as configured and resumes correctly after restart and concurrent worker claims.
- Insufficient capital produces an informational missed card and no debit/allocation.
- Pop-up timeout/minimize/maximize/scroll/countdown cannot change financial state.
- No synthetic/random profit, execution, quote or settlement is generated. Estimates stay estimates until supported by actual settlement evidence.
- Worker restarts, stale leases, transient failures, duplicate delivery and retry/dead-letter recovery are tested against disposable databases.
- All admin edits have role checks, validation, audit history and policy versions.
- No production deployment or database migration is implied by passing source CI.

## 8. Canonical references

- Main product contract: `docs/TRADING_SYSTEM_SPECIFICATION.md`
- Mandatory coding-agent instructions: `AGENTS.md`
- Admin navigation and menu guide: `docs/admin-portal-menu-guide.md`
- Worker health and recovery: `docs/trading-worker-health-and-recovery.md`
- Worker shutdown contract: `docs/server-worker-shutdown.md`

If this manual and the canonical specification conflict, stop and reconcile both before implementation. Update both in the same change when these requirements change.
