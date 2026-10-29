# Canonical Trading System Specification

**Status:** Product requirements baseline; implementation must be verified against tests and the actual repository.  
**Applies to:** Customer Trading page, opportunity engine, package entitlements, wallet allocation, settlement, notifications, admin operations, and related database jobs.  
**Read this before changing trading behaviour.** This document is the canonical implementation reference for developers, engineers, and AI coding agents. If a proposed code change conflicts with this document, stop and reconcile the difference before implementation. Keep this file and the companion PDF aligned when requirements are formally revised.

## 1. Core operating rules

1. Package eligibility, trade capital, execution, realized profit, platform fees, and wallet accounting are separate concepts.
2. The server automatically qualifies customer tiers only from cumulative, ledger-attributed qualifying credits manually submitted by an authorized administrator through the admin portal's Credit Customer / wallet-credit form. A customer without an active automatically assigned tier must not receive an automatic trade allocation; eligible tier quotas add together.
3. Customer sign-in status must not determine server-side opportunity processing, countdowns, retries, or settlement.
4. Do not add customer-facing Trading On/Off, Opportunity On/Off, or Auto Trade On/Off switches to this automatic model.
5. Do not silently fall back to a default tier or quota when no automatically assigned tier qualifies.
6. All trade-related money movements must be recorded in the customer's internal ledger. When capital is committed, returned, or adjusted, and when realized profit, fees, or losses are due, apply the appropriate debit or credit to the correct customer wallet as part of a durable, auditable, transactional, idempotent database operation. The UI must reflect committed ledger records; it must never be the only place a financial change exists.
7. Trading is a real-money operation using Arbitrade's internal ledger as the system of record for trading allocations, capital movements, realized results, fees, and settlement. Do not label trading as Practice, Simulation, or Research, and do not impose a requirement for an external broker/exchange execution provider as a prerequisite in this trading specification. Record the actual result and its supporting internal trade/settlement records; never fabricate a result or credit an estimate as a realized result.

## 2. Automatic package-tier qualification from qualifying deposits

Customers never browse, select, subscribe to, purchase, or activate a package. Package tiers are administrator-managed configuration only. The server automatically determines each customer's eligible tiers from cumulative qualifying credits originating exclusively from the admin portal's Credit Customer / wallet-credit form and recorded in authoritative ledger entries. No customer action is required.

- **The sole qualifying source is a positive credit that an authorized administrator manually submits for a customer through the admin portal's Credit Customer / wallet-credit form**, explicitly classifies as `qualifying_deposit`, and successfully commits to that customer's ledger as `admin_manual_deposit_credit`. No other deposit or credit pathway qualifies, regardless of its label or where its funds originated.
- Customer-initiated deposits, payment-provider deposits, bank/card/crypto gateway deposits, signup credits, imported/opening balances, generic wallet adjustments, credits entered outside the admin portal's Credit Customer flow, profits, trading rewards, returned principal, bonuses, swaps, transfers, conversions, and every other credit/deposit pathway do not qualify. A credit is not qualifying merely because an administrator reviewed it or because it appears in the wallet. Never infer qualifying deposits from current wallet balance, transaction descriptions, external references, or source-of-funds.
- For every enabled wallet currency, calculate the qualifying USD equivalent at the time an authorized administrator submits a qualifying Credit Customer entry. USD is exactly 1:1; every other currency must use a live, currency-appropriate exchange-rate API (Frankfurter/ECB for supported fiat currencies, with Open ExchangeRate API as a broader fiat-code fallback; CoinGecko for registered crypto/token assets using the configured external asset ID). Never use the editable currency-registry USD rate as the qualifying-credit rate or silently fall back to a stale/manual value. Validate the provider response, positive finite rate, source timestamp and freshness (fiat source date no older than four days; crypto/token observation no older than five minutes). If the selected wallet's currency cannot be priced by its configured provider, fail closed for a qualifying credit and show the administrator a clear error; do not guess a rate. Persist native amount/currency, USD-minor equivalent, exact rate, provider, provider source timestamp and credit-time FX evidence with the ledger record. Record the FX evidence in the rate-snapshot store as well. The ledger's committed creation time records when the credit was applied.
- Sum only persisted positive qualifying-deposit attribution amounts. A later profit, reward, transfer, or withdrawal must not be counted as a deposit or silently change the historical qualifying-deposit total. A proven correction/reversal must be separately auditable and reverse the qualifying amount; do not treat an ordinary debit as proof that a prior deposit was reversed.
- Thresholds are measured in USD minor units using the recorded qualifying-deposit USD value. Do not double-apply currency scale. Keep native currency amount and conversion evidence intact.
- Package qualification uses only this recorded USD value. This rule is confined to classifying an explicitly qualifying administrator credit; ordinary wallet transfers between customers or between wallets retain their existing native-currency transfer and ledger semantics and must not be reclassified, repriced, blocked, or otherwise changed by Trading tier qualification.
- When a cumulative qualifying-deposit threshold is reached, the server automatically creates the applicable tier entitlement using the configured package duration, quota and terms version. The entitlement is server-owned; it must not be created by a customer route or browser interaction.
- Every qualifying administrator credit and qualifying-deposit reversal must enqueue a durable `trading_tier_qualification_jobs` record in the same database transaction as its ledger entry. The unique source-ledger key prevents duplicate jobs and the atomic enqueue prevents a committed qualifying credit from losing its worker trigger.
- A server-side Trading tier qualification worker runs independently of customer sessions and polls the indexed queue every five seconds with a bounded batch. Idle cycles perform an indexed queue lookup only; they must not scan every customer or run tight loops. The worker claims jobs under database row locks, reconciles cumulative USD qualification, assigns/upgrades or revokes entitlements as appropriate, and records completed status.
- Worker failures are retried with bounded exponential backoff; stale processing leases are recoverable after process restarts. Completion and retry/dead-letter writes must be fenced by the claimed lease timestamp so a worker whose lease expired cannot overwrite a newer worker's state; lease timestamps must use the database column's precision. After eight failed attempts a job becomes terminal `dead`, with a bounded error message and structured log for operator investigation. Jobs must be idempotent so multiple server instances cannot assign the same tier twice. A dead job must remain visible in durable storage for manual recovery, not be silently deleted.
- Normal wallet transfers do not create qualification jobs and remain unchanged. The worker only processes ledger IDs explicitly classified as qualifying administrator credits or their auditable reversals.
- Every qualifying tier contributes its configured daily opportunity quota. Quotas are cumulative: if multiple tiers qualify, add each applicable tier's quota and enforce the global/customer limits. Opportunity counts are allowances, not guaranteed trades or profits.
- A missing or invalid catalogue, conversion rate, ledger attribution or database dependency must fail closed for new eligibility/allocations. Never silently assign a fallback tier.

## 3. Administrator-managed package tiers

Package records are configuration, not customer-facing products. Only authorized administrators can list, create, edit, enable/disable, order, or retire tiers. Every persisted behavior-affecting field must be exposed through the administrator editor and validated server-side, including threshold amount/currency, daily opportunity quota, duration and duration unit, start/expiry rules, schedule/cadence, allocation amount bounds, per-day/per-hour limits, popup timing, eligibility, allowed countries/currencies, risk/exposure limits, retries/carry-forward rules, display settings, status, version/effective time, and any future behavior-affecting field.

- No customer package catalogue, package cards, package detail/offer pages, subscription history, package activation or package-management journey may be exposed in the customer portal or customer API.
- The customer portal must never expose the full administrator-managed tier catalogue, a tier browser, subscription history, or selection/activation controls. It may show only the customer's highest active automatically assigned tier and, if one exists, the single next enabled tier above their cumulative qualifying-deposit total.
- When no active tier exists, show a clear not-yet-qualified state, the remaining USD-equivalent qualifying amount needed for the first available threshold, and that next tier's name, duration, and daily opportunity allowance.
- When an active tier exists, show that current tier's name, duration, and current combined daily opportunity allowance, plus only the next tier's name, the additional USD-equivalent qualifying amount needed to reach it, its duration, and its additional daily opportunity allowance. Do not reveal any further tiers in the same response or UI.
- The next-tier amount is the difference between its configured USD-minor threshold and the customer's net qualifying admin-credit attribution. It is not a fee or a trade amount. Thresholds, quotas, durations, and other settings come from persisted administrator-managed records; never hard-code tier terms or a fallback quota.
- This progressive read-only view is an explicit, limited exception to catalogue confidentiality; it does not permit customer browsing, selection, subscription, purchase, activation, or management.
- Customer presentation must be responsive and visually consistent with the selected portal theme. Use compact, clearly hierarchical labels and short explanations; do not hard-code a native currency symbol for the qualification threshold. Display the remaining threshold as a USD equivalent because qualification is stored in USD minor units, and explain that supported ledger-wallet credits are converted at credit time. The customer view is limited to the current package (if any), one next milestone, duration, opportunity allowance, and a clear qualification progress indicator; never show other tiers or package actions.
- Existing customer-created subscription rows must not grant new eligibility under this policy. Preserve historical rows for audit, but retire legacy customer-activated entitlements through a forward migration.
- Package duration starts when the server automatically assigns the tier after qualification. A later qualifying credit may cause an expired tier to be assigned again if its threshold remains satisfied; each entitlement is versioned and auditable.
- Admin changes to thresholds or quotas must be validated, audited and versioned. Follow the documented effective-time policy; never silently rewrite historical trade timestamps or settlements.

## 4. Cumulative tiers and entitlement lifecycle

- Evaluate each enabled tier against the customer's cumulative qualifying deposit total, not the current wallet balance.
- On a qualifying manual admin credit, re-evaluate all enabled tiers in threshold order and create each newly qualified entitlement that is not already active. Use a transaction and row locks so concurrent credits cannot create duplicate entitlements.
- Entitlements have their own start time, expiry, quota and package-terms snapshot. Multiple eligible tiers contribute cumulative quotas while active.
- Customer eligibility is a read-only server query. Refreshing the page, viewing an opportunity, logging in/out, or opening a customer portal must never create an entitlement, allocate capital, or settle a trade.
- There is no customer package purchase/activation cooldown or repeat-purchase flow. Any repeat entitlement behavior is server-controlled by tier eligibility and the administrator-configured duration/limits.
- Do not let a customer's current wallet balance, realized profit, returned principal, rewards, bonus credits, swaps or transfers increase the qualifying-deposit total.

## 5. Opportunity generation and insufficient-balance opportunities

For each generated opportunity, the server evaluates the customer's automatically assigned, active tier entitlements, remaining cumulative quotas, account status, schedule, risk limits, and combined daily earnings ceiling. Customers never select a package or manually activate eligibility.

1. Evaluate all active server-assigned tier entitlements and cumulative quota allowance.
2. Check spendable balances in eligible wallets, excluding capital reserved for other trades.
3. If enough capital exists and all controls pass, automatically allocate the trade; reserve/debit the actual capital and record it.
4. If capital is insufficient, show a persistent opportunity card marked **“Missed — insufficient balance”** or **“Insufficient balance — not allocated.”** It must not execute or debit any funds.
5. The card shows required trade capital, eligible available balance, shortfall, company identity, timestamp, and the reason it was not allocated.
6. Log a missed-opportunity event with opportunity ID, timestamp, eligibility, required capital, available balance, and reason. A missed opportunity is not a completed trade, realized profit, or proof that the customer was owed a profit.
7. Recheck current funds for later opportunities. Never create a negative balance or automatically debit funds just to fill a shortfall.

Suggested insufficient-balance card fields:
- Company name, ticker, logo, headquarters country, and flag.
- Status: “Missed — insufficient balance.”
- Required trade capital, eligible available balance, and shortfall.
- Expected duration/completion only if applicable and accurately labelled as estimated.
- Estimates may be shown only when based on a valid pricing model, clearly labelled as estimates—not earnings.
- Clear explanation that the opportunity was not executed because funds were insufficient.

## 6. Automatic processing and trade lifecycle

Server-side worker must operate independently of customer sessions and recover safely after restarts. Use explicit statuses such as Scheduled, Presented, Insufficient Balance, Pending, Retrying, Successful, Failed, Carried Forward, and Settled. Use database transactions and idempotency keys so the same opportunity cannot allocate or settle twice.

The opportunity scheduler must use bounded, round-robin batches of customers with currently active, automatically assigned tier entitlements; it must not scan the entire customer table on every timer tick. Persist and lock the batch cursor so multiple server instances advance the work queue rather than repeatedly processing the same first page. Index the entitlement lookup, cap each batch, and guard each process against overlapping cycles. Settlement reconciliation must remain independently recoverable and must never treat elapsed time alone as proof of a realized trade result or permission to credit a wallet.

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

The admin portal is the only interface for managing tier configuration. Only authorized administrators may list, create, edit, enable/disable, order or retire tiers. All persisted behavior-affecting fields must be validated, audited and versioned.

- **Trading Tiers & Eligibility** — administrator-only tier thresholds, duration, daily opportunity quota, eligibility rules, status, effective time and terms version.
- **Tier Quotas & Customer Limits** — daily opportunity quota per qualifying tier, cumulative allowance, account limits, and customer-level controls.
- **Trade Settings** — opportunity schedule, duration/closing rules, wallet allocation, fees/earnings limits, retries/carry-forward, company rotation, customer opportunity display, notifications, active/pending trades, settlement/reconciliation, system health/pause, and audit/policy versions.
- **Wallet Credits** — only the admin portal's Credit Customer / wallet-credit flow may originate a qualifying credit. An authorized administrator must explicitly choose `qualifying_deposit`; the server must commit the customer ledger entry as `admin_manual_deposit_credit` with USD attribution and rate evidence. Every other credit path—including customer/provider deposits, signup credits, imports, bonuses, profits, rewards, returns, transfers, swaps, conversions and generic adjustments—must remain non-qualifying.
- Admin tier editing must persist to the database and the runtime must consume the same persisted values. Do not create UI-only settings or settings that have no defined runtime effect.
- Admins may pause new allocations or a faulty integration for safety. This must not delete pending work or block required settlement/reconciliation.
- Every tier/configuration change and manual qualifying credit must be auditable with actor, timestamp, reason, previous/new values, and associated ledger/configuration records.

## 13. Company and financial integrity boundaries

Trading operates as a real-money workflow recorded in the customer's internal ledger. Each allocation and financial result must be grounded in the actual recorded trade lifecycle and supporting result data. Do not fabricate company activity, trade execution, profit, or settlement results. Record capital debits/returns, realized profit, platform fees, and losses accurately in the internal ledger, with traceable references, reconciliation, and idempotent posting.

## 14. Acceptance checklist

- No full customer-facing tier catalogue, browsing, selection, subscription, purchase, activation or management controls exist in the portal or customer API. The read-only eligibility summary may show only the highest active tier and the single next enabled milestone, with the amount needed, duration and quota benefit; when no tier is active, show only the first milestone.
- Authorized admins can configure tier thresholds, durations, cumulative daily quotas, effective dates and enabled state; persisted values are consumed by runtime eligibility and allocation.
- Only explicitly classified, authorized administrator credits submitted through the admin portal's Credit Customer / wallet-credit form count toward cumulative qualifying deposits. Customer/provider deposits, signup credits, imports, opening balances, generic adjustments, profits, returned principal, rewards, bonuses, transfers, swaps, conversions and unclassified credits do not qualify.
- Qualifying USD-equivalent amount and its rate/provider/timestamp evidence are persisted on the ledger entry; invalid/stale crypto rate evidence fails closed.
- Cumulative qualifying deposits automatically assign each applicable enabled tier without customer action; eligible tier daily quotas add together.
- Customer reads, logins, page refreshes and opportunity viewing do not create entitlements, allocate capital or settle trades.
- Existing customer-created subscription rows are preserved for audit but cannot grant new eligibility; migration is forward-only and retry-safe.
- No active automatically assigned tier => no automatic trade allocation and no fallback tier.
- Eligible automatic tier => server evaluates opportunities even when customer is signed out.
- Cumulative tier quotas respect account/system limits and combined daily earnings ceiling.
- Insufficient-balance cards appear only for real eligible opportunities and never debit funds.
- All trade capital and realized outcomes are ledger-backed, idempotent, auditable, and based on actual persisted execution/settlement records.


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


## Fail-closed policy reconciliation and activation gate (2026-10-29)

This section is binding for Trading runtime behavior and supersedes any older example or default that implies a tier is active before an administrator has reviewed it.

- A saved `opportunity_package_policies.policyVersion` of `0` means the policy is unreviewed. A missing policy, version `0`, disabled policy, disabled automatic delivery, or disabled automatic execution must never qualify a tier, create a new customer popup, or allocate a trade.
- New Trading tiers and their policy rows are created disabled. Required threshold, quota, capital range, configured return range, duration range, retry settings, display timing, and company rotation settings must be reviewed and saved before an administrator can enable the tier.
- The forward-only migration `0087_trading_policy_fail_closed.sql` sets existing Trading tiers and policies inactive, marks their policy versions unreviewed, and creates missing policy rows in an inactive state. It preserves package identities, customer entitlement/subscription history, popup history, trade records, settlement records, audit events, and wallet ledger history. After this migration is deployed, an administrator must review/save and explicitly re-enable each tier that should resume; Trading remains paused for unreviewed tiers.
- Runtime code must not substitute hardcoded Trading fee, settlement, popup schedule, delivery cap, reward-rate, duration, capital, retry-count, or retry-delay values when saved policy is missing. Missing global timing/fee policy blocks the affected operation and returns a clear configuration error. UI setup suggestions are not active policy until saved.
- Every newly created popup and delivery event must persist the exact saved policy version, selected configured return rate, and selected trade duration. A retry/restart reuses the persisted event and must not reselect terms. Policy version defaults are not a substitute for explicitly recording the version.
- Carry-forward is unavailable. Missed opportunities do not roll over, and no UI or worker may imply that they do until a separately specified and tested durable carry-forward implementation exists.
- Manual offer creation or company-catalogue rotation is not evidence of an external market execution or realized profit. Financial results may be posted only through the authoritative, auditable settlement workflow; company identity, elapsed time, a configured percentage, or an expected return does not prove a market-earned result.
