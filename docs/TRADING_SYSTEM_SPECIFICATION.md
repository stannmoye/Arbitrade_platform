# Canonical Trading System Specification

**Status:** Product requirements baseline; implementation must be verified against tests and the actual repository.  
**Applies to:** Customer Trading page, opportunity engine, package entitlements, wallet allocation, settlement, notifications, admin operations, and related database jobs.  
**Read this before changing trading behaviour.** This document is the canonical implementation reference for developers, engineers, and AI coding agents. If a proposed code change conflicts with this document, stop and reconcile the difference before implementation. Keep this file and the companion PDF aligned when requirements are formally revised.

## 1. Core operating rules

1. Package eligibility, trade capital, execution, realized profit, platform fees, and wallet accounting are separate concepts.
2. A customer without a valid active trading package must not receive an automatic trade allocation. A customer with eligible active package entitlements is evaluated automatically when opportunities occur.
3. Customer sign-in status must not determine server-side opportunity processing, countdowns, retries, or settlement.
4. Do not add customer-facing Trading On/Off, Opportunity On/Off, or Auto Trade On/Off switches to this automatic model.
5. Do not silently fall back to a default package when a customer has no valid active package.
6. All trade-related money movements must be recorded in the customer's internal ledger. When capital is committed, returned, or adjusted, and when realized profit, fees, or losses are due, apply the appropriate debit or credit to the correct customer wallet as part of a durable, auditable, transactional, idempotent database operation. The UI must reflect committed ledger records; it must never be the only place a financial change exists.
7. Trading is a real-money operation using Arbitrade's internal ledger as the system of record for trading allocations, capital movements, realized results, fees, and settlement. Do not label trading as Practice, Simulation, or Research, and do not impose a requirement for an external broker/exchange execution provider as a prerequisite in this trading specification. Record the actual result and its supporting internal trade/settlement records; never fabricate a result or credit an estimate as a realized result.

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

When a requirement changes, update this canonical file and its companion PDF together if that PDF exists in the repository; the repository currently has no tracked docs/TRADING_SYSTEM_SPECIFICATION.pdf, so do not describe an absent PDF as updated. The README and root AGENTS.md must continue linking to this document and the source guide.


## Wallet, ledger, and settlement reconciliation

- Treat balance-ledger amounts as signed changes to the wallet's available balance. Trade and payout reservations shift funds between available and locked balances; do not compare the signed ledger sum to available plus locked.
- Reconcile wallet, ledger, open-trade and pending-payout aggregates separately by customer and currency. Duplicate wallet rows and known open obligations exceeding recorded locked balance are definite structural inconsistencies. Excess locked funds may have legacy or unclassified reservations and remain a review item.
- A difference between current available balance and the signed ledger sum is not proof of a loss unless a trusted opening-balance snapshot or complete historical evidence establishes the starting point. Label it inconclusive when that evidence is absent.
- Compare recorded settlement postings against the saved trade result, exact settlement reference, owner, currency, signed amount, entry type, and fee rate/rounding/policy version stored on the settlement. Never recompute historic settlements using today's fee settings.
- Audit endpoints are read-only, paginated, and disclose groups/rows examined, whether additional pages remain, and whether matching-ledger evidence was truncated. A returned page or zero flags in one page never implies that the whole database was examined.
- Never infer execution or realized result from a countdown, expected reward, reserved estimate, or a legacy default field. Missing historical results/references are inconclusive and require evidence collection.
- Financial recovery is a separate, permissioned workflow. It must record source evidence, independent approval, reason, and an idempotency key; preserve original ledger entries; and use a uniquely referenced compensating ledger entry where a correction is proven. Ambiguous historical cases remain unresolved rather than automatically crediting estimated rewards.
- Reconciliation indexes must remain non-unique on wallet customer/currency until duplicate wallet records have been investigated. The audit detects duplicates instead of arbitrarily selecting an authoritative row.
