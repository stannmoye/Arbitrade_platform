# Arbitrade Trade/Trading — Canonical Implementation Guide

**Status:** The single authoritative product and implementation guide for all Trade/Trading work. It defines intended behavior; implementation claims must still be verified against source, tests, and the target environment. The internal ledger is the authoritative source for all customer trading capital and accounting.  
**Applies to:** Customer Trade menu and trading pages, opportunity engine, packages and entitlements, wallet allocation, execution workflow, trade lifecycle, fees, settlement, company catalogue and rotation, notifications, admin Trade Settings, recovery, reconciliation, migrations, jobs, and acceptance testing.  
**Mandatory rule:** Developers, engineers, and AI coding agents must read this guide before changing any trading-related source, data, workflow, tests, or documentation. This document supersedes trading requirements in all older/general documents. Keep only this guide as the detailed trading requirement source; general engineering, security, deployment, legal, and historical audit records may remain but must not define competing trading behavior.

## 1. Core operating rules

1. Package eligibility, trade capital, execution, realized profit, platform fees, and wallet accounting are separate concepts.
2. A customer without a valid active trading package must not receive an automatic trade allocation. A customer with eligible active package entitlements is evaluated automatically when opportunities occur.
3. Customer sign-in status must not determine server-side opportunity processing, countdowns, retries, or settlement.
4. Do not add customer-facing Trading On/Off, Opportunity On/Off, or Auto Trade On/Off switches to this automatic model.
5. Do not silently fall back to a default package when a customer has no valid active package.
6. All trade-related money movements must be recorded in the customer's internal ledger. When capital is committed, returned, or adjusted, and when realized profit, fees, or losses are due, apply the appropriate debit or credit to the correct customer wallet as part of a durable, auditable, transactional, idempotent database operation. The UI must reflect committed ledger records; it must never be the only place a financial change exists.
7. The internal ledger is the mandatory system of record for customer trading capital, allocations, reservations, realized results, fees, and settlement. Once a package is activated and eligible, the server must automatically process trading according to that package's saved settings and the configured opportunity schedule. Do not add a separate provider-availability gate that silently prevents package-driven processing. Never fabricate external fills, market results, or profit: record the actual execution source and result evidence for any external-market trade, and distinguish internal trading workflow states from verified external execution.

## 1B. Non-negotiable automatic customer trade execution contract

This section makes the intended customer experience unambiguous and takes precedence over any older wording or implementation that implies customer-initiated execution.

1. **Customers do not manually execute individual trades.** The customer-facing product is automatic trading. A customer must not be required to press a Trade/Execute/Buy/Sell button, approve each opportunity, stay signed in, or keep the page open for an eligible trade to be processed.
2. **Eligibility starts the automatic workflow.** When a customer has a valid active package entitlement, meets the package and account eligibility rules, and an eligible opportunity occurs within the configured schedule, the server-side worker must evaluate and process it automatically. Package activation is not a one-time manual trade and does not itself mean a trade has executed.
3. **The server makes each allocation decision.** For every eligible opportunity, server-side code must check current package entitlements, account and jurisdiction controls, risk limits, quotas, daily ceilings, opportunity validity, and the customer's persisted spendable ledger balance. If every required check passes, the system automatically reserves/allocates the permitted capital and advances the execution workflow. If a check fails, it must record and show the correct non-execution reason without debiting or fabricating a trade.
4. **No customer-facing per-trade approval gate.** Do not add a customer action or hidden confirmation state that blocks otherwise eligible opportunities from being processed. Customer package activation and any legally required account-level consent are separate from approving each individual trade.
5. **Automatic does not mean fabricated.** The worker must run without customer interaction, but may only claim an external trade was executed when the configured execution adapter returns verifiable order/fill/result evidence. If the required adapter or market/execution service is unavailable, report an actionable technical failure or pending state, preserve funds safely, retry according to policy, and alert operations as appropriate. Do not silently ignore eligible work, simulate successful execution, invent market outcomes, or credit estimated profit.
6. **No opportunity is not an execution failure.** The worker processes only real, eligible opportunities according to the configured schedule. It must not create artificial opportunities or transactions just to make activity appear continuous. A package may be active while awaiting the next eligible opportunity.
7. **Customer UI reports status; it does not drive execution.** Pages, refreshes, browser timers, notifications, and customer sign-in may display persisted status but must not be required to trigger the worker, allocate capital, submit orders, or settle trades. Refreshing the page must never create a second allocation or execution.
8. **Manual administrative review is not customer execution.** Any explicitly supported administrator verification or exceptional settlement workflow is a controlled exception with authorization, evidence, audit records, and idempotency. It must not turn ordinary customer trades into a manual customer workflow or be represented as automatic provider verification when no provider evidence was checked.
9. **Required proof before declaring this implemented.** Tests must demonstrate that an eligible customer is processed by a server-side worker while logged out and with no browser open; an ineligible customer is not allocated; sufficient funds are reserved exactly once; insufficient funds do not debit; retries and duplicate jobs do not duplicate orders or ledger entries; adapter outages remain visibly pending/failed without synthetic success; and verified execution results reconcile exactly once to the ledger and settlement records.

If any source code, UI, test, comment, older specification, AI-generated change, or implementation proposal conflicts with this contract, update the implementation to comply with this canonical guide. Do not create a second guide to explain the same rule.

## 1A. Non-negotiable internal-ledger execution and evidence rules

These rules apply to every customer-facing Trade/Trading path, server worker, API, administrator action, scheduled job, retry, and settlement path. They override older examples, UI copy, comments, or implementation shortcuts that conflict with them.

1. **The internal ledger is authoritative.** Before allocating a trade, read the customer's persisted wallet/ledger state in the same database transaction that reserves or debits capital. Use only spendable balance after existing reservations and holds. Lock the relevant customer and wallet rows, revalidate eligibility and available funds inside the transaction, and fail closed if the ledger cannot be read or locked.
2. **No off-ledger trading money.** Every allocation, reservation, committed debit, principal return, realized profit or loss, fee, reversal, and settlement must have durable, balanced, auditable ledger entries linked to a stable trade/opportunity ID. Wallet balance projections and ledger entries must be updated atomically and idempotently. Never treat a frontend value, cached balance, opportunity card, countdown, generated activity line, or trade row alone as a financial posting.
3. **No synthetic activity or fabricated results.** Do not generate pseudo-random outcomes, fake transaction logs, placeholder success/failure events, mock balances, fabricated prices, or estimated rewards and then represent them as completed trading. A transaction console may show only persisted events with a verified source; a financial-success state requires committed ledger evidence and the associated trade/settlement record. If no confirmed event exists, show no event rather than filling the screen with generated activity.
4. **Estimates are not ledger entries.** Configured reward rates, expected reward fields, countdown expiry, and modelled values are not realized results. They must never be credited as profit. Credit positive or negative realized results only from the actual, auditable result of the trade lifecycle, with the required evidence and settlement controls. Store principal, gross result, fee, net result, and total returned as distinct amounts.
5. **Execution status must be represented honestly.** The internal ledger is the mandatory source of customer capital and accounting. Package activation starts automatic processing according to saved package settings. Track each trade's real state and outcome; do not fabricate external orders, fills, or market profit. Where an external venue is used, retain its order/result references and reconcile them against ledger postings.
6. **No fallback to pretend trading.** If market data, execution, ledger access, reservation, or settlement evidence is missing or inconsistent, stop or retain the trade in an explicit pending/failed state, preserve the funds safely, and log an actionable error. Never replace the missing dependency with a simulation, generated result, default profit, or UI-only balance change.
7. **Tests must prove ledger invariants.** Cover insufficient funds, competing allocations, idempotent retries, duplicate settlement, missing provider evidence, failed execution, losses and zero-profit outcomes, fee calculations, and reconciliation. Verify ledger rows, wallet available/locked balances, trade state, and settlement references together. Do not claim production readiness from a source-only inspection.
8. **Package-driven processing must not be disabled by an undocumented provider gate.** After activation, the automatic worker must process eligible opportunities according to saved package settings, enforce wallet and risk controls, and preserve retries for temporary failures. Execution adapters must report truthful order states and actual results; unavailable integrations must be surfaced as technical failures rather than fabricated successful trades or silently ignored package activation.
9. **Manual settlement must preserve the evidence trail.** An administrator must provide a unique settlement reference and meaningful verification notes describing the source checked and the actual result; the server records the administrator identity, reference, notes, signed gross result, fee policy, and ledger postings in one transaction. A free-text note is an audit attestation, not independent proof by itself. Never describe a result as provider-verified unless the relevant authorized-provider evidence was actually checked and retained.

## 2. Free package activation and qualifying balance

Package subscription is free under this proposal. A customer must meet the package's minimum qualifying wallet balance to activate it. Do not debit and immediately credit the same amount merely to create the appearance of a subscription transaction.

- Qualifying balance is an eligibility threshold, not the subscription price and not an automatic per-trade capital amount.
- At activation, check the configured eligible wallet balance. Admin policy must define whether multiple eligible wallets can be combined.
- Recommended default: check at activation, then apply an admin-configurable maintenance rule and grace period if the balance later falls below the threshold.
- Do not lock the entire qualifying balance by default. Reserve only capital actually committed to a trade unless a separate, disclosed reserve rule is approved.
- If the customer cannot qualify, show: “Your available balance is not sufficient to activate this package. Minimum qualifying balance: [amount].”
- Existing entitlements should retain a snapshot of their package terms when defaults change, unless an authorized, logged migration explicitly changes them.

## 3. Proposed package defaults

Amounts are USD minimum qualifying balances, not subscription fees, guaranteed returns, or automatic trade amounts. All fields are editable by an authorized administrator.

| # | Package name | Minimum balance | Duration | Opportunities/day |
|---:|---|---:|---:|---:|
| 1 | Aureate Capital | $100 | 1 month | 6 |
| 2 | Sterling Reserve | $250 | 2 months | 8 |
| 3 | Sovereign Crest | $500 | 3 months | 10 |
| 4 | Meridian Equity | $1,000 | 3 months | 12 |
| 5 | Crownstone Capital | $2,000 | 6 months | 14 |
| 6 | Imperial Ledger | $3,500 | 6 months | 16 |
| 7 | Pinnacle Treasury | $5,000 | 6 months | 18 |
| 8 | Obsidian Reserve | $7,500 | 9 months | 20 |
| 9 | Sovereign Meridian | $10,000 | 9 months | 22 |
| 10 | Regalia Capital | $15,000 | 12 months | 24 |
| 11 | Apex Treasury | $20,000 | 12 months | 25 |
| 12 | Monarch Equity | $30,000 | 12 months | 26 |
| 13 | Grand Meridian | $50,000 | 18 months | 27 |
| 14 | Crown Imperial Reserve | $75,000 | 18 months | 28 |
| 15 | Sovereign Apex | $100,000 | 24 months | 29 |
| 16 | Paramount Capital Reserve | $150,000 | 24 months | 30 |

Each package needs a stable internal ID. Package duration is in calendar months. Active eligible package quotas add together; for example, quotas of 6 + 10 + 30 give a baseline allowance of 46 opportunities/day, subject to system controls and the combined customer earnings ceiling.

## 4. Multiple packages, repeat purchases, cooldown

- Customers may own different packages at the same time.
- Admin setting controls whether a customer may purchase multiple copies of the same package.
- If repeat purchases are disabled, block another copy while the configured ownership restriction applies. Admin can define whether the restriction ends at expiry or also includes expired/cancelled copies.
- If enabled, each copy is a separate entitlement with its own activation, expiry, quota, and terms snapshot; enforce an optional maximum copies setting.
- Proposed default: six-hour cooldown between successful package activations, configurable by admin. Start after successful activation/payment confirmation. The cooldown must not pause existing trades or settlement.
- Prevent customers from bypassing daily earnings ceilings by stacking packages, switching wallets, or duplicating activity.

## 5. Opportunity generation and insufficient-balance opportunities

**Mandatory behaviour:** customers continue to see opportunities permitted by their active package eligibility even if their available balance is insufficient. An insufficient-balance opportunity must be displayed only when an eligible opportunity actually occurs and the funds check fails. Do not show continuous low-balance warnings when there is no opportunity.

For each generated eligible opportunity:
1. Evaluate active package entitlements, remaining quotas, account status, schedule, risk limits, and the combined daily earnings ceiling.
2. Check spendable balances in eligible wallets, excluding capital reserved for other trades.
3. If enough capital exists and all controls pass, automatically allocate the trade; reserve/debit the actual capital and record it.
4. If capital is insufficient, show a persistent opportunity card marked **“Missed — insufficient balance”** or **“Insufficient balance — not allocated.”** It must not execute or debit any funds.
5. The card shows required trade capital, eligible available balance, shortfall, company identity, timestamp, and the reason it was not allocated.
6. Log a missed-opportunity event with opportunity ID, timestamp, eligibility, required capital, available balance, and reason. A missed opportunity is not a completed trade, realized profit, or proof that the customer was owed a profit.
7. Recheck current funds for later opportunities. Never create a negative balance or automatically debit funds just to fill a shortfall.

Suggested card fields for insufficient balance:
- Company name, ticker, logo, headquarters country, and flag.
- Status: “Missed — insufficient balance.”
- Required trade capital, eligible available balance, and shortfall.
- Expected duration/completion only if applicable and accurately labelled as estimated.
- Estimates may be shown only when based on a valid pricing model, clearly labelled as estimates—not earnings.
- Clear explanation that the opportunity was not executed because funds were insufficient.

## 6. Automatic processing and trade lifecycle

Server-side worker must operate independently of customer sessions and recover safely after restarts. Use explicit statuses such as Scheduled, Presented, Insufficient Balance, Pending, Retrying, Successful, Failed, Carried Forward, and Settled. Use database transactions and idempotency keys so the same opportunity cannot allocate or settle twice.

Admin may pause new allocations or a faulty integration for safety; this is not a customer trading toggle. The global pause must be persisted in the application database, enforced inside the trade-allocation transaction, fail closed if its safety setting is missing or malformed, and record the administrator, timestamp, old/new values, and reason in the audit log. Pausing new allocations must not delete pending work or block required settlement/reconciliation. Do not add customer-facing Trading On/Off, Opportunity On/Off, or Auto Trade On/Off controls.

A countdown is a display of expected timing, not proof of execution. Only confirmed execution/settlement may trigger final success status and wallet credit.

## 7. Failed execution, retries, carry-forward

- Temporary technical/execution failure: retry later the same day if the opportunity remains valid, provider rules permit it, and configured retry limits are not exceeded.
- If no valid retry remains, the unfulfilled opportunity may be carried to the next day as a quota/make-good event under a transparent, capped admin policy.
- Insufficient customer balance: show and log as missed. Do not allocate or debit. Any carry-forward must be a separate policy and must not imply guaranteed profit.
- Genuine market loss: record the actual result accurately. Do not relabel it as a technical failure or manufacture a compensating profit.
- Failed execution, zero-profit outcomes, and losses incur no profit-based platform fee.
- Retries must not count as multiple completed trades, create duplicate credits, or bypass the daily earnings ceiling.
- A missed opportunity quota is not the same as a financial guarantee. Any promise to compensate financially for missed opportunities requires explicit funding, disclosure, and appropriate review.

## 8. Platform fee, profit, and wallet accounting

Default platform fee is **15% of realized positive gross profit on each successful trade**. It is not 15% of the trade capital.

Example: capital $200; realized gross profit $20; fee $3 (15% of $20); net profit $17; total customer credit, if capital is returned under the trade terms, $217.

- Fee applies only to realized positive profit from a successful trade.
- No profit fee for failed execution, zero-profit outcome, or loss.
- Record returned capital, gross profit, platform fee, net profit, and losses separately in the ledger.
- Store the fee policy/version used for settlement.
- Apply trade-related debits and credits to the customer's internal ledger when required by the actual trade lifecycle, using the recorded trade result and settlement state. Ledger changes must be committed transactionally and idempotently; UI animations are not accounting.
- The combined daily earnings ceiling is one customer-level limit across all packages and wallets. Default measurement should be net realized profit, excluding returned principal. Admin must define daily reset timezone/period.
- Wallet reservations must be distinguished from completed debits. Prevent the same funds from backing multiple concurrent trades.
- Wallet ledger and displayed balances must reconcile. Use idempotent, transactional operations.

## 9. Company image catalogue, country folders, and source verification

The customer Trading Opportunities page includes a searchable company catalogue backed by `companyCatalogueReference.search`. It searches the 1,811 logo-ID records by company name, domain, supplied ticker, and exchange; returns up to 100 matches per query; and displays the local country-folder logo path, logo ID, country folder, supplied ticker/code, exchange, exact workbook status, parent ticker, and reason fields. All 1,811 rows from `company_trading_symbols.xlsx` are preserved by the workbook row number matching the stable Logo ID. Placeholder codes are display-only and must not be sent to market-data or order APIs. Parent-company and historical references must retain their classifications. These values are shown as supplied, not as independently verified active listings.


The current company-image reference collection contains **1,811 indexed company/logo records**, replacing earlier planning references to 950 or 1,000 as the size of the image catalogue. The 950-record US-only SEC dataset and the separate 1,000-record reference catalogue are legacy/separate datasets; they must not be confused with or used to cap the 1,811-image collection.

### Canonical image catalogue structure

- Stable image catalogue IDs are `logoId` values **1–1811**, aligned with `catalogue_number` in `logo-mapping.csv`. Do not renumber existing IDs or treat them as stock tickers or exchange trading numbers.
- Company display names, IDs, filenames, domains, and country assignment metadata are indexed in `client/public/assets/company-logo-source/company-logo-index.json`.
- Country-grouped records are indexed in `client/public/assets/company-logo-source/company-logo-country-groups.json`.
- The physical image files are stored below `client/public/assets/company-logo-source/by-country/{Country}/`. Use the country folder and the index's relative `logoFile` path to locate an image; do not reconstruct paths from company names.
- `client/public/assets/company-logo-source/logo-mapping.csv` is preserved as a mapping/reference artifact. Duplicate company names may exist and must retain their separate IDs and file mappings unless an explicit reviewed deduplication task is approved.
- The current country assignment audit records **1,799** images assigned to researched country folders and **12** records under `Unverified`. Therefore the image collection has 1,811 records, but it is not accurate to claim that all 1,811 headquarters countries have been verified. Keep the unresolved 12 visibly marked as unverified until researched; never infer a country merely to remove an item from that folder.

### Intended use in the Trading page

The 1,811-record collection is the available company-image/name reference pool for the informational company pop-up/spotlight. The UI may display a company's indexed ID, company name, local image, and assigned country label. Use local assets; do not introduce a runtime third-party logo CDN or network dependency for these images.

The image catalogue is **not** a verified tradable-securities list. Many image records may represent private companies, brands, subsidiaries, products, institutions, or companies without a confirmed public listing. A country folder indicates the current country classification for organizing the image library; it does not by itself prove legal headquarters or listing eligibility. Do not present the pop-up as a live market quote, investment recommendation, verified listing, or executed trade. Do not let a random/rotating company image itself trigger trade execution, alter customer balances, or create a profit/loss record.

### Separate company-symbol and trading-number work

Ticker/symbol, exchange, security identifier, listing status, and any platform-specific trading number are a separate data-enrichment phase and are **not implied by logo IDs**.

#### Imported trading-symbol workbook

The workbook `company_trading_symbols.xlsx` is the current source for the symbol/code fields shown in the company catalogue. Its 1,811 rows are aligned by the workbook's 1-based `#` value to Logo IDs 1–1811. The existing compressed base snapshot retains the 814 `Public` rows; the supplemental Brotli-compressed records in `server/data/company-trading-symbols-1811.parts/part-01.b64`, `part-02.b64`, and `part-03.b64` preserve the remaining 997 rows, including ticker/code, exchange, exact status, parent ticker, and explanatory reason. The server joins these data at startup and rejects missing IDs, mismatched row counts, or changed status totals.

The current workbook contains 814 rows marked `Public`, 637 marked `PLACEHOLDER - invented code, not a real ticker`, 265 marked `Uses listed parent's ticker`, and 95 marked `Historic ticker (no longer trading / delisted)`. The customer catalogue displays the supplied values without a separate verification phase, and keeps each row's original status visible. Invented placeholders are internal display codes only and must never be sent to market-data lookup or order APIs. Parent-company and historical ticker references are not direct listings for the brand row. Symbol lookup for public candidates remains informational and must never authorize orders or trade execution.

This import is a reference-data integration, not a live market-data provider connection. All records remain `referenceOnly` and `eligibleForVerifiedTradeRotation: false`; the UI must not imply that the workbook guarantees an active listing, live price, or executable instrument. A future market-data integration must use a provider-supported instrument identifier and explicitly exclude placeholder, parent-only, and historical rows from direct execution until a separate approved policy allows them.

### Validation and maintenance requirements

Before changing the image collection or its consumers, validate all of the following:
1. Exactly 1,811 indexed records and IDs covering the expected range 1–1811, with no accidental ID reuse or missing index entries.
2. Every indexed image path resolves to the corresponding checked-in file under the country-grouped source directory; no broken paths.
3. Country-group JSON and index agree on IDs, names, relative paths, and country values.
4. The country grouping totals account for all 1,811 records, including the 12 explicitly unverified records; never hide or discard unresolved entries.
5. Duplicate names and repeated brands remain distinguishable by stable ID and path.
6. The pop-up reads the local catalogue as reference data only and remains separate from security-symbol lookup, live market data, trade allocation, execution, and settlement.
7. Updates preserve the source archive and mapping files and include tests/documentation changes where applicable.

The catalogue is version-controlled static reference data and must not be bulk-seeded into the customer/account database. A catalogue entry, local image, company name, or country folder does not establish security ownership, a trade execution, or a financial result. Financial and trading claims must be based on the application's independently recorded trade lifecycle and settlement evidence.

**Status (2026-10-26):** the image catalogue is indexed from 1 through 1811 and country-grouped on disk; 1,799 records have country assignments and 12 remain in `Unverified`. This status supersedes the older 950/1,000 image-count wording only for the image-reference collection. It does not certify all companies as publicly listed, all country assignments as headquarters-verified, or any ticker/trading-number mapping.

## 10. Opportunity pop-up, country flags, trade details, and minimized dock

When an opportunity/trade card opens, it must associate the company identity and all financial/timing fields with the same stable trade and company IDs. The expanded pop-up is controlled by the configured display duration. When minimized, it becomes a fixed bottom-of-viewport dock: it stays visible while the page scrolls up or down and does not scroll away with the page.

### Admin portal is the source of truth for customer-side behaviour

The admin portal is the authoritative control plane for the customer Trading experience. Customer-side displays and actions must reflect persisted, authorized admin configuration and server-side trade state; the frontend must not independently invent, override, or hard-code admin-controlled policy.

- **Trade closing time and duration:** the scheduled close timestamp and countdown must be calculated from the active admin-configured trade duration/schedule and the server-recorded trade start/opening timestamp. If an authorized admin policy changes the duration or schedule, apply it according to the policy/version and effective-time rules recorded by the backend. Do not substitute a frontend default or let the browser decide the authoritative close time.
- Admin controls the opportunity schedule, trade duration/closing rules, allocation eligibility, package rules, quotas, fees, daily earnings ceiling, retries/carry-forward, pause/resume, company selection/filters, and customer-facing display settings wherever those controls are provided by the specification.
- Customer-side UI is a presentation and interaction layer: it reads the active configuration and persisted trade status from authorized server APIs. It must not offer customers controls that override admin policy, including changing trade duration, closing time, fee rate, opportunity schedule, or allocation rules.
- Countdown rendering may update locally for smooth display, but its target timestamp and final status come from the server. Client clock drift, page refresh, sign-out, scrolling, minimizing, or maximizing must not change the scheduled close or settlement state.
- Admin configuration changes must be permissioned, validated, timestamped, versioned where policy affects an existing trade, and audited with administrator, old/new values, and reason. Existing trades must follow a documented policy for whether their opening-time configuration snapshot remains fixed or an authorized change applies; never silently rewrite historical timing.
- If the admin-configured close time is missing or invalid, do not invent one. Show an appropriate pending/unavailable state and record/report the configuration issue.

### Company identity

Show these together in the expanded pop-up and minimized card where space allows:
- Company name.
- The correct local company logo/image resolved through the stable Logo ID and country-grouped index.
- Country name and its country flag.
- Supplied ticker/symbol/code and exchange, with the workbook classification/status visible wherever a non-public or placeholder code is shown.
- Company Logo ID and trade/opportunity reference where useful for support and audit.

Country flags must be derived from the company's country metadata using a maintained country-to-flag mapping/component. Do not infer a country from the company name, ticker, logo, or exchange. For records assigned to Unverified or with missing/unsupported country metadata, show an explicit “Country unverified” label and a neutral unknown-country indicator rather than a guessed flag. Country/flag is descriptive metadata and does not establish listing or execution eligibility.

### Trade and financial information

The expanded pop-up must display, when the relevant values exist:
- Amount invested/allocated and the source wallet.
- Gross profit, platform fee amount, net profit, and total amount returned/credited (principal plus net profit), each as separate values.
- Profit percentage and platform-fee percentage, with their calculation bases stated clearly (profit percentage is not the fee percentage).
- Platform fee amount and the fee policy/version used.
- Trade opening/start timestamp and expected/actual closing timestamp as separately labelled fields.
- Live countdown to the scheduled/estimated close, plus current trade status.
- Opportunity/trade ID and any other available, relevant audit/timing details.

Never invent missing trade details, timestamps, returns, fees, percentages, or results to fill the UI. Before settlement, label modelled or configured values as estimates and do not present them as earned profit or confirmed credits. After settlement, replace estimates with the actual values supported by the persisted trade result and ledger. Returned principal, gross profit, platform fee, net profit, and total credited amount must not be conflated. Calculate the default platform fee as 15% of realized positive gross profit only; failed, zero-profit, and loss outcomes do not incur a profit-based fee. If a value is not available, show a clear pending/unavailable label rather than fabricating a number.

### Minimize, maximize, and dismissal lifecycle

- Provide a **Minimize** control on the expanded pop-up. It collapses the card into a fixed bottom dock that remains visible during vertical page scrolling.
- The minimized dock must keep the company name and flag/logo where practical, current status, countdown, and a **Maximize** control that reopens the expanded pop-up.
- Minimize/maximize changes presentation only. They must not pause, restart, extend, or otherwise change the server-owned countdown, trade lifecycle, allocation, settlement, or ledger.
- Keep each card tied to its own trade/opportunity ID. Multiple active cards must not overwrite one another; use a bounded, responsive stack/list when more than one is active.
- The card must not disappear merely because the user scrolls, minimizes it, changes views, or the expanded-display timeout expires.
- At countdown zero, refresh/show the authoritative server-side trade status. Dismiss the card completely only when the countdown has finished and the trade/opportunity is in an appropriate terminal state. If it is still pending, retrying, or awaiting settlement, keep it accessible and show that state; a timer reaching zero is not proof of execution, success, or settlement.
- An insufficient-balance opportunity remains explicitly marked “Missed — insufficient balance” / “Insufficient balance — not allocated” and shows required capital, eligible available balance, shortfall, and reason. It must never be styled as an executed trade or show fictional invested capital/profit.

The expanded-card display duration is configurable in seconds. The minimized dock remains fixed and accessible until the dismissal conditions above are satisfied.

## 11. Credit/debit animations and notifications

- Green for confirmed credits; red for confirmed debits.
- Show temporary +amount near the main balance after a confirmed credit and -amount near the affected wallet after a confirmed debit; then fade the indicator away.
- Show a small viewport-fixed toast centered or near the bottom so it remains visible while scrolling.
- Each wallet's transaction should have its own accurate amount/reason notification.
- Trigger notifications only after database transaction success. Label reserved funds as “Reserved,” not as a completed debit.
- Never show a fake credit/debit animation or a balance change that has not been committed.

## 12. Admin portal controls

### Admin navigation: Trade Settings

The admin portal's main navigation must contain one clear top-level menu named **Trade Settings**. All admin pages and submenus that configure, monitor, or operate trading belong beneath this menu, rather than being scattered as unrelated top-level menu items. Respect existing admin roles and permissions for each submenu; a menu grouping must not grant access by itself.

Required Trade Settings submenu structure (reuse existing working screens where they already provide the relevant function; do not create duplicate or placeholder screens):

1. **Overview** — trading system status, today's allocations/opportunities, active and pending trades, settlements, exceptions, and key health indicators.
2. **Packages & Eligibility** — package names, minimum qualifying balances, activation rules, terms, status, and eligibility.
3. **Package Quotas & Customer Limits** — opportunities per package/day, combined quotas, account limits, and customer-level controls.
4. **Opportunity Schedule** — opportunity generation windows, schedule/time zone, company selection/filters, and cadence.
5. **Trade Duration & Closing Rules** — admin-configured duration, scheduled close calculation, timing policy, effective-time rules, and countdown target policy.
6. **Capital Allocation & Wallet Rules** — eligible internal wallets, allocation amounts, reservations, spendable-balance checks, and capital return routing.
7. **Profit, Fees & Earnings Limits** — gross/net profit handling, platform fee rate and calculation base, rounding, daily net earnings ceiling, and reset timezone.
8. **Retries & Carry-Forward** — retry limits, failure classification, next-day carry-forward caps, and make-good policy.
9. **Company Catalogue & Rotation** — company/logo/country/flag metadata, supplied symbol classifications, company eligibility/filters, and rotation policy.
10. **Trade Pop-up & Customer Display** — identity and financial fields, expanded display duration, minimize/maximize dock, countdown presentation, and dismissal rules.
11. **Notifications** — customer trade notices, confirmed credit/debit notifications, toast placement, and display duration.
12. **Active Trades & Pending Work** — current lifecycle status, scheduled closes, pending/retrying items, and safe operational actions.
13. **Settlement & Reconciliation** — ledger reconciliation, settlement exceptions, idempotency status, and traceable settlement records.
14. **System Health & Pause Controls** — worker/integration health, emergency pause of new allocations, and recovery controls. Pausing new allocations must not discard or silently abandon pending trades or required settlement.
15. **Audit Log & Policy Versions** — administrator, timestamp, reason, old/new values, approvals, and configuration versions.

Only show a submenu when the corresponding capability exists or is being implemented as a real, permission-protected feature. If a feature is not yet implemented, record it as pending in development documentation rather than presenting a fake working control. Every consequential setting must be validated server-side and audited. Financial ledger history is immutable through normal admin settings; corrections must use an auditable adjustment/reconciliation workflow.

### Customer-side trade controls must be removed

The customer portal must not expose buttons or switches that let a customer manually control the automatic trade engine. Remove existing customer-side controls such as Trading On/Off, Opportunity On/Off, Auto Trade On/Off, manual start/stop, or any equivalent toggle that conflicts with this specification. Do not replace them with another customer-side switch that changes allocation, schedules, duration, trade closing time, fees, package quotas, or settlement policy.

The customer portal is for viewing package eligibility, opportunities, trade cards, countdowns, status, and ledger-backed financial information. Trades are allocated automatically by the server when the customer has an eligible active package and an eligible opportunity occurs, subject to admin-configured quotas, schedule, balance, account status, risk controls, and earnings limits. Customer sign-in state must not control server-side opportunity processing or settlement.

Customer-side presentation controls such as **Minimize** and **Maximize** are permitted because they change only how the trade card is displayed; they must never pause or modify a trade. Any customer action that affects money or trade execution must be explicitly supported by the canonical specification and implemented server-side with authorization, validation, idempotency, and ledger audit.

### Package-driven opportunity presentation

Opportunity generation and trade-card presentation must follow the customer's active package entitlements and the opportunity counts/quotas configured for those packages in the admin portal. Do not use one hard-coded global number of pop-ups for every customer. Sum eligible quotas across active entitlements according to the package policy, enforce the combined customer limits and daily earnings ceiling, and ensure retries do not count as additional completed opportunities. Only present an eligible opportunity when it actually occurs; an insufficient-balance card is shown only when a real eligible opportunity occurs and the funds check fails. A pop-up is not itself proof that a trade was allocated or executed.


Provide configurable sections for:
- Packages: names, amounts, durations, quotas, qualification, activation, status, and terms-change policy.
- Repurchases: same-package repeat toggle, maximum copies, and cooldown.
- Opportunities: schedules, quotas, admin-configured trade duration/closing-time rules, company filters, retry rules, carry-forward caps, and eligibility.
- Earnings/fees: combined daily net earnings ceiling, fee rate, calculation/rounding rules, and reset timezone.
- Company catalogue: import, search, verify, logo/flag, ticker, headquarters, exchange, sector, and listing status.
- Trading operations: pause new allocations, provider health, pending work, failures, retries, settlement, and reconciliation.
- Wallets: eligible wallet types, reservation rules, allocation and settlement routing.
- Customer experience: pop-up display duration, minimized dock, notification position/duration, visible fields, locale/currency formatting, and other customer-side presentation settings.
- Audit/security: role permissions, change history, policy versioning, approval for sensitive settings, and immutable ledger history.

Every consequential admin change should record administrator, timestamp, old/new values, and reason. Emergency pause stops new allocations but does not erase pending work or prevent required settlement/reconciliation. Admins must not silently edit/delete historical financial ledger records.

## 13. Company and financial integrity boundaries

Trading operates as a real-money workflow recorded in the customer's internal ledger. Each allocation and financial result must be grounded in the actual recorded trade lifecycle and supporting result data. Do not fabricate company activity, trade execution, profit, or settlement results. Record capital debits/returns, realized profit, platform fees, and losses accurately in the internal ledger, with traceable references, reconciliation, and idempotent posting.

## 14. Acceptance checklist

- Customer portal has no manual Trading On/Off, Opportunity On/Off, Auto Trade On/Off, or equivalent trade-engine switches; automatic server-side processing follows the admin-controlled rules.
- Admin portal has a top-level **Trade Settings** menu grouping all trading controls into permission-protected, functional submenus; no fake placeholder controls are presented as working features.
- Trade Settings includes package/eligibility, package quotas, opportunity schedule, duration/closing rules, wallet allocation, fees/earnings limits, retries/carry-forward, company rotation, customer pop-up/display, notifications, active/pending trades, settlement/reconciliation, system health/pause, and audit/policy versions.
- Opportunity/pop-up cadence respects each customer's active package entitlements and admin-configured package quotas, plus combined limits; no hard-coded global popup count overrides admin policy.

- No active package => no automatic trade allocation; no fallback package.
- Active eligible package => server evaluates opportunities even when customer is signed out.
- Package quotas sum correctly across entitlements and respect admin limits.
- Same-package repeat purchase obeys admin toggle and maximum copies.
- Package activation checks qualifying balance and creates no artificial debit/credit.
- An eligible opportunity with insufficient funds is displayed only when it occurs, with required amount, available balance, shortfall, and timestamp.
- Insufficient-balance opportunity never debits or allocates capital.
- Trade lifecycle applies the correct capital debit/return, realized profit, fee, or loss to the customer's internal ledger exactly once, supported by recorded trade/settlement state.
- Default 15% fee is calculated from realized positive gross profit only.
- Failed trades follow retry/carry-forward policy and do not incur a profit fee.
- Combined daily net earnings ceiling applies across all packages and wallets.
- Pop-up has a minimize control; minimized dock remains fixed at the viewport bottom while scrolling and exposes the live countdown and maximize control.
- Pop-up displays company name, local logo, country and correctly mapped flag, supplied symbol/exchange classification, invested amount, profit/total return, opening/closing times, countdown, profit percentage, platform-fee percentage/amount, and relevant trade references without inventing unavailable values.
- Trade closing time and countdown target come from the active admin configuration and server-recorded trade timestamps; the browser cannot override them. Pop-up dismissal requires countdown completion and an authoritative terminal trade/opportunity status; a zero countdown alone never proves execution or settlement.
- All customer-side trade behaviour and configurable displays are driven by authorized admin settings and persisted server state; no frontend hard-coded defaults may override admin policy.
- Green/red notifications correspond to confirmed credits/debits only.
- The company-image reference collection has 1,811 stable indexed IDs (1–1811), matching index/mapping/country-group data and valid local file paths; 1,799 country assignments are recorded and 12 remain explicitly Unverified.
- The company pop-up/spotlight uses the 1,811-image reference pool only for informational display; it does not imply a verified listing or trigger trade execution/accounting.
- Ticker, exchange, security identifier, listing status, and trading number are separately verified and never inferred from a logo ID or country folder.
- Admin changes are permissioned, versioned, and audited.
- Catalogue tests cover ID completeness, index/group agreement, every local image path, preservation of duplicates under distinct IDs, and visibility of unresolved country assignments. Trading and settlement tests cover concurrency, insufficient balance, retries, worker restarts, fees, ceiling enforcement, and duplicate settlement.

## 15. Implementation workflow requirement

Before changing trading code, read this specification and inspect the current repository state. Identify relevant frontend, API, database, worker, and migration paths. Implement in small stages with forward migrations and tests. Run project checks/tests/build where possible and report exactly what passed. Do not claim implementation, live execution, or production acceptance unless verified.

When a trading requirement changes, update this canonical guide. There is no tracked companion PDF, and no second trading or company-catalogue guide is required. README.md, AGENTS.md, and .github/copilot-instructions.md must point to this guide as the one source of trading requirements.


## Wallet, ledger, and settlement reconciliation

- Treat balance-ledger amounts as signed changes to the wallet's available balance. Trade and payout reservations shift funds between available and locked balances; do not compare the signed ledger sum to available plus locked.
- Reconcile wallet, ledger, open-trade and pending-payout aggregates separately by customer and currency. Duplicate wallet rows and known open obligations exceeding recorded locked balance are definite structural inconsistencies. Excess locked funds may have legacy or unclassified reservations and remain a review item.
- A difference between current available balance and the signed ledger sum is not proof of a loss unless a trusted opening-balance snapshot or complete historical evidence establishes the starting point. Label it inconclusive when that evidence is absent.
- Compare recorded settlement postings against the saved trade result, exact settlement reference, owner, currency, signed amount, entry type, and fee rate/rounding/policy version stored on the settlement. Never recompute historic settlements using today's fee settings.
- Audit endpoints are read-only, paginated, and disclose groups/rows examined, whether additional pages remain, and whether matching-ledger evidence was truncated. A returned page or zero flags in one page never implies that the whole database was examined.
- Never infer execution or realized result from a countdown, expected reward, reserved estimate, or a legacy default field. Missing historical results/references are inconclusive and require evidence collection.
- Financial recovery is a separate, permissioned workflow. It must record source evidence, independent approval, reason, and an idempotency key; preserve original ledger entries; and use a uniquely referenced compensating ledger entry where a correction is proven. Ambiguous historical cases remain unresolved rather than automatically crediting estimated rewards.
- Reconciliation indexes must remain non-unique on wallet customer/currency until duplicate wallet records have been investigated. The audit detects duplicates instead of arbitrarily selecting an authoritative row.


## 16. One-guide authority and conflict resolution

This file is the only detailed implementation contract for Trade/Trading. The following rules apply to future work:

1. Read this guide in full before implementing, testing, reviewing, or changing trading behavior.
2. When a trading requirement in a generic platform specification, admin-menu description, README, roadmap, implementation matrix, old prompt, code comment, or historical note differs from this guide, this guide controls the intended product behavior.
3. General documentation may describe where a page is found, how to build or deploy the application, or what has been tested. It must not reproduce a separate set of trading rules or override this guide.
4. Update this guide first when the owner changes a requirement, then change the code and tests, and finally simplify any other documents to link here. Do not create a new trading guide, company-catalogue guide, package guide, settlement guide, or recovery guide.
5. Keep historical audit/evidence records and generic platform documentation when they serve other purposes. Label historical trading statements as historical/non-authoritative or replace the trading subsection with a pointer to this guide. Do not delete database migrations, source code, tests, or financial audit evidence as a side effect of documentation consolidation.
6. A written requirement is not proof that code implements it. State implementation and production status separately, with the exact tested commit and the evidence available.

## 17. Customer portal: Trade menu information architecture

The customer-facing navigation label must be Trade or Trading consistently with the currently established product navigation. It must lead to a server-backed experience and must not be a decorative page whose values exist only in local React state.

### 17.1 Customer Trade landing page

The landing page must present the following logically distinct regions, adapting layout to mobile and desktop without changing server behavior:

- **Package eligibility and activation:** the package catalogue, active package(s), qualifying-balance requirement, saved package terms, activation state, expiry, remaining opportunity quota, and next eligible processing window when known.
- **Trading overview:** current active/pending trade count, today’s eligible opportunities, completed opportunities, missed opportunities, items awaiting execution or settlement, and any actionable errors. Counts must be derived from persisted server data and clearly scoped by time and account.
- **Opportunities:** currently eligible opportunity cards, including company identity, classification, schedule/expiry, package eligibility, available capital, costs and risks when supported, and the current authoritative state.
- **Active and pending trades:** records that are allocated, executing, open, retrying, awaiting confirmation, awaiting settlement, or otherwise non-terminal. The page must not hide unsettled or failed/retrying records simply because a timer reached zero.
- **Trade history and settlements:** terminal trades, actual realized results, fees, principal returned, settlement reference, execution/result evidence status, and timestamps. Pending estimates must not be presented as realized profit.
- **Wallet impact:** available and locked/reserved amounts, committed capital, principal returned, signed realized result, fee, net result, and total returned. The system must distinguish these values instead of showing a single ambiguous “earnings” figure.
- **Notifications and help:** authoritative package/trade state changes, funding or balance insufficiency, retry/technical errors, settlement decisions, and links to relevant disclosures and support.

Show a useful empty state when no active package or eligible opportunity exists. Do not generate sample trades, simulated account activity, fake order rows, or made-up transaction-console entries to fill an empty screen. Loading, empty, unavailable, error, pending, and confirmed states must be visually distinct and accessible.

### 17.2 Package selection and activation journey

1. Load enabled package offers from the server. Each offer shows its minimum qualifying balance, duration, daily opportunity entitlement, applicable limits, and material terms.
2. Explain that activation is free under the current product policy. The minimum qualifying balance is an eligibility threshold, not a subscription fee, not money to transfer, and not the default size of each trade.
3. On activation, validate the authenticated customer, package state, configured eligibility currency or currencies, spendable balance, package availability, repeat-purchase/cooldown rules, and all applicable risk, customer, country, and administrator controls on the server.
4. Write the entitlement and immutable terms snapshot transactionally and idempotently. A repeated network request must not create duplicate entitlements or duplicate financial postings.
5. Return the persisted activation result. The customer UI must not display an active package before the server confirms it.
6. Once an eligible package is active, it enters the automatic server-controlled workflow under its saved terms and the configured opportunity schedule. Customer sign-in, browser tab visibility, refresh, or local clock does not start, pause, or settle trading.
7. If qualification fails, show the exact requirement, the authoritative available balance, the shortfall, and the reason. Do not activate the package or allocate capital.
8. If a technical dependency prevents the next step, retain an explicit diagnosable pending/failed state and an actionable server log. Never silently ignore activation and never invent a successful trade as a fallback.

Existing active entitlements retain their saved terms snapshot when administrators change package defaults. An authorized migration may modify existing entitlements only under an explicit versioned and audited policy.

### 17.3 Opportunity card and insufficient-balance behavior

Every displayed opportunity must correspond to a persisted opportunity/delivery record and a server-calculated eligibility decision. A card is not a trade and is not proof of execution.

An eligible opportunity that occurs while the customer lacks sufficient spendable funds must remain visible as the configured insufficient-balance opportunity. It must state the amount required, current authoritative available amount, shortfall, currency, expiry or schedule when known, and why allocation did not proceed. This state must not create a capital debit, trade allocation, profit, fee, reservation, or completed-trade record. The missed opportunity and its reason should be recorded once with an idempotent identity.

A successful funds check is not the same as a committed allocation. Recheck spendable funds inside the allocation transaction, after locking and validating the authoritative wallet and policy records. If funds are no longer sufficient, roll back all allocation postings and record the appropriate missed/blocked reason without a partial debit.

### 17.4 Opportunity pop-up and minimized dock

Follow Section 10 for the complete trade-card field contract. In summary, the expanded pop-up shows the company name, local image, country and supported country flag, supplied symbol/security/exchange classification, opportunity and trade status, allocation amount, result amounts, platform-fee rate and amount, profit percentage when mathematically meaningful, open and close times, countdown, total returned, and stable references when those values exist. Unknown values must be shown as unavailable, not inferred.

Minimize and maximize only change presentation. The minimized dock stays fixed to the viewport bottom while scrolling and exposes the active countdown and status plus a way to reopen the card. Browser visibility, display timeout, minimizing, maximizing, refresh, or local-clock changes must not update a trade state or affect settlement. Dismissal requires both countdown completion and a persisted authoritative terminal state. An expired timer alone never proves that a market execution or settlement happened.

## 18. Trade lifecycle and automatic processing

### 18.1 Server-controlled workflow

The worker must evaluate eligible customers and package entitlements according to the saved package settings, configured schedule, daily/hourly quotas, active-allocation limits, and authorized admin controls. It must work independently of whether the customer is signed in.

Each processing cycle must:

1. Load due schedules and eligible package entitlements using bounded database queries.
2. Apply customer, package, account, jurisdiction, currency, risk, global-pause, and quota rules.
3. Create or reuse a stable idempotency key for the relevant customer, entitlement, schedule window, and opportunity.
4. Validate any opportunity and its delivery state. The configured policy determines whether presentation/receipt acknowledgement is required before allocation; this must be consistent and tested, not an accidental frontend race.
5. Lock and re-read the customer entitlement, spendable wallet, relevant reservations, administrator pause state, and applicable limits within the transaction that allocates capital.
6. Record a missed opportunity with a specific reason when an eligible opportunity occurs but a deterministic eligibility or funds check prevents allocation. Do not debit money or create a trade on this path.
7. Reserve/commit only the capital actually allocated. Write the trade/opportunity linkage, wallet updates, ledger entries, reservation, lifecycle event, and idempotency claim in a transaction, rolling all of them back if a required write fails.
8. Enqueue notifications only from committed business events, with stable event keys to prevent duplicate customer messages.
9. Submit authorized execution work to the execution adapter or internal trading engine configured for this product mode. Track truthful execution states and actual result evidence.
10. Retry only retryable failures under a bounded, persisted backoff policy. Exceeding the retry budget must leave a visible terminal or reviewable state with an actionable reason, not an endlessly spinning card.
11. Run due settlement and reconciliation as separate idempotent operations. Neither an elapsed timer nor a worker restart is proof of execution or profit.

An external-market order may be reported as executed only when authoritative order/fill/result evidence is recorded. Internal workflow states must be named and displayed distinctly from external exchange/broker execution. If the selected product mode or required execution adapter is unavailable, the package worker still records and surfaces the processing failure; it must not silently do nothing, pretend an external order was sent, or create a simulated success.

### 18.2 Required semantic states

Persisted enum names may differ, but the application behavior must distinguish these semantic states:

- **Package:** offered, disabled, eligible, activation pending, active, expired, suspended/restricted, or activation failed.
- **Opportunity/delivery:** scheduled, created, eligible, delivered, viewed/acknowledged where required, missed for a recorded reason, allocated, expired, cancelled, or unavailable.
- **Trade:** allocation pending, reserved/allocated, execution pending, submitted, partially filled where supported, open, execution failed, retry scheduled, awaiting result/settlement, settled, cancelled, reversed under an audited correction, or manual review required.
- **Settlement:** not due, due for verification, evidence checked, settlement pending, settled, reconciliation mismatch, or manual review required.

Only transitions allowed by the server-side lifecycle may be applied. Terminal records cannot be silently reopened or rewritten. Corrections must be represented by explicit linked events or compensating ledger entries with audit history. Keep exact timestamps, source references, failure reasons, and actor identity where relevant.

### 18.3 Schedule, quotas, and concurrency

Schedules are defined and saved by authorized administrators. A package daily opportunity limit is an entitlement ceiling, not a promise that every scheduled slot results in a trade. Enforce daily and hourly quotas, burst controls, maximum active allocations, amount bounds, customer limits, and the combined earnings ceiling on the server using a stable definition of the customer/business day and timezone. Do not hard-code a single global count for every package or customer.

Concurrent cycles, duplicate messages, retries, browser refreshes, and repeated API calls must not exceed quota or allocate funds twice. Use database-backed uniqueness/idempotency and row-level locking where appropriate; browser disabled buttons are not concurrency controls. Worker health, last successful run, due backlog, attempts, failures, and stale records must be observable by administrators. Administrative pause should prevent new allocations while preserving safe management of existing open trades, returns, and settlement.

## 19. Admin portal: Trade Settings control plane

Trade configuration and operations belong in one role-protected **Trade Settings** area. The exact screen components can evolve, but the following capabilities must be addressable there and must use persisted, authorized server operations.

### 19.1 Trading overview and health

Show active package/entitlement counts, eligible customers, due opportunities, delivery failures, allocation success/failure, pending and open trades, due settlements, retry backlog, ledger/reconciliation exceptions, last worker run, integration health, global pause state, and recent high-severity events. Every metric must expose its scope and timestamp. An incomplete/paginated audit must not be represented as a complete healthy database scan.

### 19.2 Package catalogue and eligibility policy

Administrators need a searchable package table and editor with, where supported by the current schema:

- Stable package ID, display name, enabled/disabled state and version.
- Minimum qualifying balance, qualification currency policy and wallet combination rule.
- Calendar-based duration and expiry policy.
- Opportunities per day and relevant hourly delivery targets.
- Minimum/maximum allocation amount, maximum active allocations and burst controls.
- Same-package repurchase, simultaneous-copy, cooldown, and eligibility rules.
- Maintenance-balance/grace-period rule when explicitly enabled.
- Country/customer eligibility and restriction policy.
- Clear customer-facing description, risk disclosure, terms version and effective time.

Validation must reject invalid amounts, negative quotas, impossible min/max ranges, unsupported currencies, unknown policy values and conflicting schedule settings. Changes require appropriate permission, reason, version/effective time and audit log. New defaults must not silently rewrite already-active entitlement snapshots.

### 19.3 Schedule, duration and closing policy

Allow authorized administrators to configure schedule windows, delivery cadence, timezone/day boundary, opportunity quotas, trade duration, expected closing time, retry policy, and display timing within validated bounds. The authoritative close timestamp derives from persisted server timestamps and the versioned policy snapshot. The browser only renders a countdown and must not calculate or submit settlement time as authority. Missing/invalid policy must produce an unavailable/review state, not an invented time.

### 19.4 Wallet allocation, fees and earnings limits

Administrators can view and manage the versioned policy for supported wallet currencies, minimum/maximum allocation, reservation behavior, default fee rate, rounding convention, daily combined earnings cap, and risk limits. Customer capital and accounting remain internal-ledger-backed. Administrative changes to policy do not alter historical fee snapshots or settled results. An admin must never bypass spendable-balance checks with a frontend amount or an unlogged override.

The current default platform fee is 15% of realized positive gross profit only. It is not 15% of principal or total balance. No positive-profit fee is charged on zero or negative gross result. The precise fee and net result are calculated in integer minor units using the rounding convention saved with the trade. An authorized change to the default must be versioned and its effective scope explicit.

### 19.5 Market data, venues, instruments and company catalogue

Administrators need a single operational view for configured data sources and trading instruments as well as the company reference catalogue. As applicable to the configured product mode, controls include:

- Enabled/disabled venue or data-source connection, environment, permission scope, credential health (never the credential value), last successful request, latency, error rate and maintenance state.
- Allowed assets, networks, market pairs, exchanges, security/instrument IDs, supported transfer routes and customer/product restrictions.
- Quote freshness/staleness thresholds, minimum liquidity and depth, allowed slippage, minimum net spread after costs, maximum notional/capacity, exposure limits and route risk boundaries.
- Source/venue outage handling, circuit breakers, per-venue or per-instrument pause, global trading pause, controlled recovery/resume, and a record of who changed the policy and why.
- Opportunity calculation version, quote snapshot source, source timestamps, fee assumptions, publication/replay history and data-quality exceptions.
- Catalogue size, stable IDs, names, local image paths, country assignment, verification status, supplied symbol/exchange metadata and rotation policy.

Configuration must be persisted, validated, versioned and audited. Only authorized roles can change it. A disabled or unhealthy integration must cause an explicit technical state and alert, never a fabricated quote or successful order. Rotation controls may determine which informational company spotlight appears next; they must not create a trade, authorize a security, submit an order, or move money.

### 19.6 Active trades, pending work and settlement queue

The admin portal must support searching/filtering by customer, package/entitlement, opportunity, trade ID, status, currency, time range, and exception type. Show capital and reservation state, execution state, actual result evidence, settlement reference, fee-policy snapshot, principal return, profit/loss, fees, and linked ledger rows. Let authorized operators inspect and perform only lifecycle actions permitted by policy. Confirmation buttons must be disabled in the UI when clear prerequisites fail, and the server must independently revalidate every prerequisite in the transaction.

Manual settlement must require a unique settlement reference, signed actual gross result, source verification notes, applicable policy snapshot, authorized administrator identity, and all necessary reconciliation checks. A free-text note is an audit attestation, not independent evidence by itself. Never label a result provider-verified unless the supporting source was actually checked and retained. Duplicate references, a trade-owner mismatch, reservation mismatch, insufficient locked principal, invalid arithmetic, early settlement, and duplicate/ambiguous postings must fail closed.

### 19.7 Reconciliation, integrity scans and recovery

Provide read-only scans for duplicate or missing wallet rows, available-balance versus ledger differences, known locked-fund obligations, settlement reference uniqueness/claims, ledger entry count/sign/amount, reward reservation identity/status, fee/net arithmetic, lifecycle state, and source-evidence completeness. Display affected rows, number of rows examined, pagination/limit, truncation, and confidence. Never call a partial scan a complete audit.

Financial correction and release are separate, permissioned operations. Preserve the original entries and evidence. A confirmed correction uses a uniquely referenced, linked compensating entry and approval/audit trail. Ambiguous history remains unresolved for human review; no administrator or automated script may manufacture a missing ledger entry from a timer, expected reward, default zero, or the trade status alone.

### 19.8 Access control and audit

Use deny-by-default, role-specific permissions for package editing, allocation policy, global pause/resume, execution configuration, settlement, financial correction, risk overrides, data exports, and read-only review. High-impact financial actions should have reason capture, step-up authorization or dual approval where configured, before/after policy versions, actor ID, timestamp, affected IDs, correlation/idempotency ID and an immutable audit event. Mask customer information and restrict evidence downloads to authorized operators. Secrets, credentials and private customer evidence must never be returned in normal browser payloads or committed to the repository.

## 20. Company catalogue and identifier rules

The supplied informational company-image collection is 1,811 stable records with IDs 1–1811. The local company logo index, mapping, country-group data and country folders must remain aligned. The current recorded country audit has 1,799 assigned records and 12 explicitly Unverified; never label all countries or listings as verified.

- Use the stable logo ID to match an indexed image record. Do not fuzzy-match a company name when an exact ID exists.
- A logo ID, company name, folder name or country assignment does not establish a public listing, headquarters, ticker, exchange, security identifier or tradability.
- Keep supplied ticker/exchange/status/parent/historical fields attached to the same indexed record when they exist. Display placeholder codes as placeholders and never send them to quote/order APIs.
- Public candidate tickers are research candidates, not live instruments. Do not make a candidate tradable until an authoritative source URL, provider instrument ID, verification timestamp, security/exchange identity and the necessary eligibility checks are recorded.
- The customer pop-up may rotate informational company images without financial side effects. Rotation must not seed a trade, reserve/debit funds, increment an executed-trade count, calculate profit, or trigger settlement.
- Preserve the distinction among this 1,811-image pool and any separate legacy 950- or 1,000-company datasets. Do not rename or merge the datasets merely because their counts differ.
- Validate ID completeness, index-to-group agreement, local file paths, duplicate names under distinct IDs, unresolved country classification, and non-leakage of unverified candidates. Never guess a country flag; show a neutral fallback if country metadata is unverified.

The local assets and catalogue are content data, not market data or execution authorization. The system must not treat an image catalogue as evidence that a real order can be placed.

## 21. Ledger, result, fees and customer notifications

### 21.1 Financial invariant

Every monetary operation must be linked to the authenticated customer, currency, trade/opportunity/settlement identity and immutable ledger record. Reserve/commit, principal return, realized gross result, fee, net result, loss, reversal, and any other correction must be durable, balanced according to the accounting model, atomic, idempotent and auditable. Use integer minor units or another rigorously decimal-safe representation consistent with the database's currency precision. Never use binary floating point for authoritative money calculations.

The display should separately define:

- **Principal/allocation:** capital committed to a trade.
- **Gross realized result:** signed actual gain or loss, excluding principal.
- **Platform fee:** fee calculated according to the saved fee-policy version; under the current default it applies only to positive realized gross gain.
- **Net realized result:** gross realized result minus applicable fee, with losses retained as signed losses.
- **Principal returned:** principal actually returned in the settlement ledger entries.
- **Total returned:** principal returned plus the realized net result as supported by persisted postings.

Pending expected returns can be shown only with an explicit estimate label and must never be posted or summed as realized earnings. A countdown ending does not create a financial result. Failed, cancelled, zero-profit and loss trades must have truthful states and correct ledger treatment without a made-up reward or positive fee.

### 21.2 Notification semantics

Create transaction-console entries, in-app notices, sound events and email events only from real persisted business events after the transaction boundary is safely committed, or through a transactional outbox. Use stable recipient-scoped event keys. A debit/reservation notice requires a committed ledger debit/reservation; a credit/return notice requires the committed credit/return. Failure notifications must describe a real persisted failure. Do not generate random logs, placeholder “completed” rows, future events or fake transaction codes.

Sound or animation is presentation only. A green animation must not independently alter balances or signal financial success. Respect customer sound preference, mute and accessibility controls; never use a notification as a substitute for displaying an authoritative status in the Trade area.

## 22. Failure handling, retries, pause and observability

For database locks/timeouts, stale quotes, unavailable execution endpoints, malformed provider responses, rejected orders, partial fills, result-feed delays, settlement conflicts, and notification failures:

1. Persist the actual error class, operation/correlation ID, retryability, attempt count and next-attempt time without exposing secrets.
2. Roll back financial operations that did not commit fully. Do not leave a partial balance update or duplicated reservation.
3. Preserve committed funds in the appropriate available/locked/reserved state until the authorized lifecycle allows release. Never release or credit funds merely to clear a UI error.
4. Retry only idempotent, retryable operations with bounded backoff. Recheck eligibility and state under lock before retrying.
5. Expose pending, failed or manual-review states in customer/admin views. Distinguish a failure to display a notification from a failure of the financial operation.
6. Global pause blocks new allocations according to the configured rule but does not delete open trades or bypass safe settlement/withdrawal controls. Resume is an auditable administrator action.
7. Monitor stale pending states, repeated retries, queue lag, worker heartbeat, provider health, allocation failures, settlement delays and reconciliation warnings. Alerts must link to the affected persisted records.

## 23. Read-only trade recovery and evidence procedure

Recovery is an evidence-gathering and review process, not an automatic way to credit funds. The source scripts may remain in the repository, but this section replaces separate trading recovery guides.

### 23.1 Collect a bounded evidence sample

Run from the project root with a private environment containing a valid DATABASE_URL:

~~~sh
pnpm db:collect-trade-recovery-evidence -- --limit 100 --output ./trade-recovery-evidence.json
pnpm db:plan-trade-recovery ./trade-recovery-evidence.json
~~~

The collector uses a read-only transaction and SELECT queries. It gathers trade and settlement data with matching wallet snapshots, principal/reward ledger entries, reward reservations, lifecycle events, popup-event references when available, and relevant identity/settlement context. It checks for required columns and fails closed if required evidence is unavailable. It refuses to overwrite an existing output file; omit the output option to emit JSON to standard output if supported by the CLI. Evidence files may contain sensitive account details: keep them private, do not share broadly and never commit them.

The default limit is 100 newest trades and the supported capped maximum is 1,000. This is not a whole-database audit. Any capped/incomplete scan must be labelled incomplete and escalated; the absence of an issue in an incomplete sample is not evidence that all trades are healthy. The collector does not reconstruct every historical balance from the entire ledger.

### 23.2 Planner outcomes and mandatory interpretation

The planner must require the collector context, trade identity, wallet/reservation snapshots, exact source amounts, and scan-coverage metadata. It validates actual safe integer/numeric-string fields, counts, signs, amounts, owner/trade/currency identity, reservation status, gross-result/fee/net arithmetic, stored fee policy and rounding, settlement reference, and lifecycle evidence. Null or malformed amounts are not silently converted to zero. Unsafe derived values are rejected. A legacy record marked as having no recorded outcome must not be treated as a zero-profit result merely because a migration filled an amount field with zero.

The only recovery classifications are review decisions, not financial mutations:

- NO_ACTION means only that the supplied evidence shows no identified conflict within its scope; it is not a whole-database guarantee.
- STATUS_REVIEW_ONLY means lifecycle metadata or timestamps require review. It does not authorize an automatic status repair.
- MANUAL_FINANCIAL_REVIEW means amounts, ledger rows, references, reservation identity/state, wallet ownership, coverage or other financial evidence are missing, malformed, duplicated or inconsistent.

Every planner result must set automatedMutationAllowed to false and contain no planned financial mutations. The tooling does not authorize principal release, reward credit, fee reversal, status patch, or wallet update. Human reviewers must inspect complete relevant wallet and ledger history, opening-balance evidence, trade and reservation ownership, settlement reference claims, and result evidence before an independently authorized correction is considered.

### 23.3 Reconciliation rules

- Compare signed ledger changes to the available-balance model using the correct known opening balance. Do not compare a signed ledger sum with available plus locked funds; reservations transfer between balance states.
- Without a trusted opening-balance snapshot or complete historical evidence, available-versus-ledger differences are inconclusive rather than proof of missing earnings or losses.
- Reconcile known open-trade and pending-payout obligations separately against locked funds. Duplicate/missing wallet rows are structural exceptions; do not arbitrarily choose one duplicate row as authoritative.
- Verify settlement reference uniqueness and ownership, fee-policy version and rounding, gross/fee/net arithmetic, principal and result ledger entry signs/counts/amounts, reservation identity/status and terminal lifecycle evidence.
- Never recompute historical settlements with today's fee settings. Do not interpret missing historical outcomes as zero.
- Keep audit results paginated and disclose number of rows examined, total count where available, remaining pages, evidence truncation and scan limits.
- Corrections must preserve original entries and use separately permissioned, approved, uniquely referenced compensating entries. Ambiguous cases remain unresolved for manual financial review. Never rewrite ledger history or automatically invent the missing event.

## 24. Required automated and manual acceptance

A change is not complete merely because code or this guide exists. Add or update focused tests and run the required repository checks on the exact head commit.

### 24.1 Customer interface

- Trade menu navigation and direct-link access require authentication and respect account restrictions.
- Package list, terms, qualification currency, duration, quotas, activation loading/success/failure, duplicate requests and insufficient qualifying balance all reflect server-confirmed state.
- Activation is free and does not debit the qualifying balance merely for subscription.
- No customer Trading On/Off, Opportunity On/Off or Auto Trade On/Off controls exist.
- Opportunity cards reflect persisted delivery/eligibility states; insufficient balance shows required/available/shortfall and creates no financial movement.
- Active, retrying, failed, awaiting settlement and terminal records remain distinguishable.
- Every displayed financial amount is sourced from persisted records or explicitly labelled as an estimate/unavailable.
- Expanded pop-ups, minimized dock, countdown, terminal dismissal, scrolling, refresh, multiple active cards, mobile view, keyboard navigation and screen-reader labels behave correctly without affecting server timing.
- Empty/error/loading/retry states contain no fake trades or generated transactions.

### 24.2 Package and worker behavior

- A valid activation creates exactly one entitlement and triggers automatic server-side processing according to saved settings.
- Expired, disabled, suspended, ineligible, restricted, unqualified and over-quota package entitlements do not allocate new capital.
- A worker can process eligible work while the customer is signed out.
- Concurrent workers/API calls, repeated jobs, timeouts and restarts do not duplicate the opportunity, allocation, reservation, ledger movement, notification or settlement.
- Schedules, daily/hourly limits, burst sizes, maximum active allocations and combined earnings caps are enforced transactionally.
- Global pause prevents new allocations as designed while existing trades remain safely observable and settle only with valid evidence.
- Retry/backoff bounds and stale-work alerts behave as documented.

### 24.3 Accounting and settlement

- Insufficient funds, simultaneous allocation contention, lock conflict, transaction rollback and duplicate idempotency claims.
- Principal reservation/commit and principal return are recorded once with correct available/locked balances.
- Positive, zero, negative, rejected, cancelled and partially filled results are represented truthfully.
- Fifteen-percent default fee is applied only to realized positive gross profit under the saved fee policy and exact rounding rule.
- Fee, gross, net and principal-return arithmetic is tested with exact integer values.
- Duplicate/missing/foreign settlement references, owner/currency mismatch, inconsistent reservation, early confirmation, insufficient locked principal, missing result evidence and repeated settlement are rejected or routed to explicit review.
- Failed notification delivery does not turn a committed trade into a failure; notification success does not imply trade settlement.
- Reconciliation detects duplicate wallet rows, incomplete coverage, malformed values, inconsistent fee snapshots and legacy unrecorded outcomes without mutating records.
- Recovery tools remain read-only and cannot propose automated financial mutations.

### 24.4 Admin portal and audit

- Every Trade Settings area is reachable only with the correct role/permission.
- Package, schedule, fee, risk, quota, retry and pause policy validation rejects invalid values and writes an audit record.
- Policy version/effective-time and entitlement snapshots are honored.
- Admin queues show real persisted trade, settlement and reconciliation records with clear pending/failed/review states.
- Sensitive evidence and credentials are masked and unauthorized access is denied.
- Financial corrections require explicit evidence, reason, authorization, idempotency key, and linked compensating entries.

### 24.5 Company catalogue

- IDs 1–1811 remain stable; the index, mapping, country groups and local image paths agree.
- The 1,799 assigned and 12 Unverified country classifications remain accurately displayed.
- Duplicate display names under different IDs are preserved; no fuzzy joins replace exact ID joins.
- Unverified ticker/security data is not passed to live quote or order APIs.
- Rotation is presentation-only and cannot allocate a trade, post to the ledger, or create a profit event.

### 24.6 Repository checks and honest release evidence

Use the repository-prescribed Node.js and pnpm versions and run, where the environment permits:

~~~sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
~~~

Also run focused package, worker, trade lifecycle, settlement, reconciliation, and admin-policy tests. Review changed files and links. Report the exact commit SHA, commands executed and their real outcomes. Automated checks, source review, database reconciliation, browser acceptance, hosted acceptance, deployment and production certification are separate gates. Never report a test as passed when it was not run, a provider order as executed when evidence is absent, or a deployment as complete because a PR was updated.

## 25. Future implementation handoff checklist

Before each future Trade/Trading task, the developer or coding agent must:

1. Confirm the latest repository main SHA, the actual working branch and pull-request head, and current uncommitted changes.
2. Read this full guide and inspect the relevant source, schema, migrations, server procedures, worker/schedule path, UI, tests and current deployed configuration when available.
3. List the precise behavior gap and source evidence before changing code; do not repeat completed changes from earlier commits.
4. Make the smallest coherent implementation, using ordered forward migrations and preserving existing financial history.
5. Add tests for both the requested behavior and its security, concurrency, failure and accounting boundaries.
6. Update this guide when intended behavior changes. Update other general documents only to maintain accurate status or point readers here; do not copy trading rules into a second guide.
7. Run checks on the exact resulting commit, inspect the final diff, verify all links and search for conflicting trading instructions.
8. Report what changed, what was deleted, what tests actually passed, what remains blocked/unverified, and whether the PR is still open, merged, deployed or production-certified. Never infer these states from each other.


## 26. Market data, opportunity quality and risk disclosure

The opportunity engine must not equate a headline price difference with an executable net opportunity. Every opportunity intended for customer display or automatic allocation must be traceable to a reproducible route and a versioned calculation snapshot.

### 26.1 Required inputs and data-quality checks

Where the selected strategy uses market venues, the calculation should use, where available and relevant:

- Instrument identity, asset/network, source and destination venue, market/pair, and exact route.
- Actual executable bid/ask prices and order-book depth for the proposed side and amount, not unrelated last-traded prices alone.
- Quote source, provider instrument ID, observed-at timestamp, received-at timestamp, freshness limit, and quote expiry.
- Market/trading fees, withdrawal and transfer fees, network or gas costs, payment/conversion costs, currency conversion, expected slippage, minimum notional, precision/lot-size rules and supported networks.
- Liquidity/depth, capacity at the requested amount, venue status, network congestion, counterparty/bridge/stablecoin/network risks where relevant, and the likelihood of partial/no fill.
- Calculation algorithm version, applied assumptions, configured risk limits, and a unique immutable opportunity version.

A route must be blocked from automatic execution when critical data is missing, stale, malformed, internally inconsistent, below liquidity/capacity requirements, or outside authorized risk limits. Show a clear unavailable/error state and retain diagnostic evidence. Never silently substitute stale quotes, a default exchange rate, guessed ticker mappings, or fabricated market prices.

### 26.2 Net calculation and estimate labeling

Calculate the estimated net result using the actual supported route, the proposed size, executable prices and all configured applicable costs. The user-visible amount must distinguish estimated cost, estimated gross spread/result, estimated costs, estimated net result, quote age/expiry, capacity, and uncertainty. Store the inputs and algorithm version so a later reviewer can reproduce the estimate. Publish a new opportunity version when material source data or calculation assumptions change; do not mutate a prior snapshot without an audit trail.

An estimate is a decision-support value only. It is not a realized trade result, accounting entry, guaranteed return, or proof of market execution. Partial fills, slippage, latency, rejected orders, transfer delays, liquidity changes and negative results must remain possible and be reflected honestly.

### 26.3 Customer market-intelligence features

Where supported by approved data sources, the Trade menu may provide an opportunity feed, detail view with source venues/networks, timestamps and expiry, fee/cost breakdown, depth/capacity, confidence/data-quality indicators, risk flags, historical opportunity replay, watchlists, filters/search, price/volume charts, order-book/depth views, network/gas indicators and venue health. These are advisory presentation features unless an explicit persisted execution state proves an order was submitted or filled. Replays and charts must identify historical data and cannot emit financial postings.

Portfolio/history views should distinguish cost basis, realized and unrealized P&L, exposure by asset/network/venue/currency, concentration warnings, benchmark and performance history where the supporting data exists. Do not display unsupported metrics or infer unrecorded performance.

## 27. Execution modes and integration boundaries

The product's configured mode and permissions must be explicit, persisted, versioned and reviewed before an execution path is enabled. A marketing label, package activation, internal trade row, opportunity card, countdown or wallet movement cannot by itself authorize external orders or prove their execution.

- **Analytics:** display sourced market information and estimates without accepting trade capital or claiming an executed trade.
- **Assisted execution:** present complete order details and obtain the required customer instruction/confirmation before passing the order to the authorized external integration.
- **Managed automatic execution:** activate only when the product, jurisdiction, customer agreement, risk/compliance controls, custody/funding model and execution arrangement have the necessary authorization. Under this mode, an eligible active package initiates the configured automatic server workflow without a customer start/stop toggle.

These definitions are not a separate provider gate that can silently stop package workflow. The worker must evaluate due work, apply the chosen product mode and saved controls, and record what happened. If an external execution adapter, required market-data input, authorization, permission, or credential is unavailable, the worker must report an explicit actionable blocked/failed/pending state and preserve capital safely; it must not claim an order was submitted or fabricate a result. Ordinary internal workflow processing and actual external order execution are distinct states.

Every external order request must use a stable idempotency/client-order key where supported and retain the integration name, instrument/market identity, external order ID, submission timestamp, acknowledgements, fill IDs, fill amounts/prices, fees, status transitions, result event/reference and reconciliation status. Verify webhook signatures or equivalent authorization, enforce replay resistance and reconcile external results against internal trade and ledger entries. Never trust a client-submitted result, redirect URL, webhook body or administrator free-text note as sufficient independent market evidence.

Secrets and access tokens remain server-side. Connector health and execution permissions must be observable to authorized operators, with safe credential rotation, least privilege, bounded timeouts, retry limits and a documented emergency disable procedure.

## 28. Persistent data and service-boundary contract

Exact table and procedure names follow the existing repository schema, but the persisted model must support the following distinct concepts and stable relationships. Do not create shadow or duplicate stores if an authoritative existing table already provides the requirement.

- Package catalogue and versioned policy.
- Customer package entitlement with activation/expiry status and immutable terms/policy snapshot.
- Opportunity and immutable opportunity/calculation versions.
- Customer opportunity-delivery/lifecycle record, including idempotency identity and missed-opportunity reason.
- Trade/allocation record linked to the customer, entitlement, opportunity, currency, and committed amount.
- Reservation/locked-funds record with owner, trade identity, amount, currency, state and exactly-once transition.
- External execution request/order and fill/result evidence where external execution applies; keep external IDs separate from internal IDs.
- Trade lifecycle event history with timestamp, actor or worker identity, attempt, correlation ID and error classification.
- Settlement record with unique reference claim, actual signed gross result, fee/net calculation, fee-policy/rounding snapshot, principal-return amount and result-evidence reference.
- Ledger entries and wallet state projections linked transactionally to the relevant allocation, reservation, return, realized result, fee, loss, reversal or correction.
- Notification/outbox event, risk/authorization decision, policy audit record, and reconciliation finding.
- Company identity/catalogue record separated from tradable instrument/security identity and independent verification evidence.

Keep references and constraints that prevent duplicate active entitlements where prohibited, duplicate allocation within the same opportunity, duplicate external submissions when idempotency is supported, duplicate settlement references, duplicate terminal ledger postings, and duplicate notification events. Any constraint or index change must be delivered in an ordered forward migration and tested against existing data assumptions. Do not casually add a unique customer/currency wallet constraint before investigating historical duplicate wallet rows.

Keep the business logic in server-side modules/procedures and bounded workers. The customer/admin UI uses authenticated APIs and displays server-confirmed state; it must not own eligibility, scheduling, timing, allocation, quote validity, fee calculation, settlement, or balance authority. Use transactions for atomic database effects and an outbox or equivalent reliable boundary for post-commit external notifications. Avoid treating an in-memory queue or process-local lock as the only guarantee when multiple instances or restarts are possible.

## 29. Compliance, fair presentation and customer protections

Before accepting customer funds or enabling any product mode that executes or manages trades, the responsible business must confirm the legal and operational basis for the target jurisdictions, customer eligibility, custody/funding model, risk disclosures, complaints/reversal process, record-retention needs, sanctions/AML controls where applicable, and required licensed/authorized partners. This guide is an engineering contract, not legal, tax, accounting or investment advice.

The interface and communications must not promise fixed returns, guaranteed profit, risk-free arbitrage, insurance, instant withdrawal, certain execution or certainty of settlement unless the exact claim is demonstrably true and approved. Show meaningful downside/uncertainty, applicable fees and assumptions before a customer commits. Do not use resetting countdowns, false scarcity, fake popularity/other-investor counters, synthetic transaction histories, fake testimonials, or animations intended to substitute for evidence.

Customer-facing restrictions must be clear and reasoned without exposing sensitive risk rules or private review data. Keep required consents and disclosure versions attached to the relevant operation. Provide accessible, non-coercive handling of notifications and time-sensitive opportunities; sound must be opt-in and must never be the only way the customer can learn an important financial status.


## 30. Additional market-data and execution acceptance scenarios

Add focused automated tests and, where applicable, integration tests for each supported adapter and product mode:

- Stale, missing, malformed and divergent quote sources; provider clock skew and delayed quote delivery.
- Actual side-specific order-book depth and minimum order sizes at the customer-requested amount; fee, currency conversion, gas, withdrawal, network and expected slippage calculations.
- Quote changes between opportunity display and allocation; opportunity expiry before allocation; immutable version preservation when a new quote creates a new opportunity version.
- Venue outage, rate limit, credential expiry, API permission failure, high latency, timeout-after-submit, duplicate submit retry and external order-idempotency behavior.
- Duplicate, missing, invalidly signed, replayed or out-of-order webhook/result events.
- Partial fills, rejected orders, canceled orders, order status that disagrees with fill events, fee discrepancies and late fills after an initial timeout.
- Network congestion, chain reorganization or delayed transfer confirmation when relevant to the selected route.
- Disabled/paused venue, instrument or network; emergency pause and authorized resume; customer/jurisdiction/product restrictions.
- A company image or unverified ticker is presented in the informational catalogue but rejected as an unverified trading instrument.
- Execution adapter absence or outage after activation: worker produces an actionable technical status and preserves funds safely without silently ignoring the work or fabricating a trade.
- Result/settlement evidence arriving more than once or out of order; reconciliation must remain idempotent and never credit the same result twice.

Test fixtures may model these inputs, but production financial state must never be populated from simulated test outcomes. Each adapter must have a contract test that proves how successful submission, rejected submission, timeout, partial fill, final result, fee and cancellation are represented before the adapter is enabled in production.
