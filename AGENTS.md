# Agent instructions for Arbitrade Platform

Before starting work, read root `progress.md` as a handoff index and verify its branch and commit SHA against GitHub. It is a status aid, not the source of truth: current code, canonical requirements, and exact-SHA CI evidence take precedence. Update it after each substantive development increment with changes, checks, and next steps.

Read these files before changing the application:

1. `BUILD_SOURCE.json` — canonical branch/build requirements and acceptance boundary.
2. `BUILD_AND_RELEASE.md` — build and release process.
3. `docs/REPOSITORY_GUIDE.md` — repository layout and source ownership.
4. **`docs/TRADING_SYSTEM_SPECIFICATION.md` — mandatory canonical trading requirements.**
5. The acceptance or implementation document relevant to the files being changed.

## Mandatory trading-system rule

Before modifying the Trading page, opportunity engine, package entitlements, wallet allocation, trade lifecycle, settlement, fees, company catalogue, pop-up rotation, or related admin controls, read `docs/TRADING_SYSTEM_SPECIFICATION.md` in full and `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md`. Treat the specification as the canonical product contract and the manual as its detailed admin-control companion. It covers administrator-managed tiers, automatic qualification exclusively from cumulative qualifying credits manually issued by an authorized administrator through the admin portal's Credit Customer / wallet-credit flow, cumulative opportunity quotas, combined customer earnings ceiling, insufficient-balance opportunity pop-ups, server-side automatic processing, 15% fee on realized positive profit, retries/carry-forward, company rotation, wallet notifications, and admin controls.

Do not introduce behaviour that conflicts with the specification. If a codebase constraint or later user instruction appears to conflict, stop and document the conflict before implementing. Update the canonical specification and its companion PDF together when requirements are formally revised. If the PDF is absent from the repository, record that gap rather than claiming it was updated. Never claim a requirement is implemented without inspecting the code and validating it.

## Canonical source

- The application source of truth is `stannmoye/Arbitrade_platform` on `main`.
- Resolve the latest `main` SHA before starting work; pin builds and acceptance evidence to the full SHA.
- Do not treat an old branch, cached clone, generated ZIP, or stage-only release tag as newer than current `main`.
- Do not create a standalone stage-only application package. Keep release artifacts integrated with the full application.
- Keep the root `Dockerfile`, `pnpm-lock.yaml`, and `BUILD_SOURCE.json` aligned.

## Development and validation

Use Node.js 22 and pnpm 10.18.0. Before submitting source changes, run:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

Never commit `node_modules/`, generated `dist/` output, release archives, actual `.env` files, credentials, private keys, customer data, or production database dumps.

Database changes should use ordered forward migrations and retry-safe server-side behaviour. Do not run a fresh install against a populated database.

## Financial safety and release discipline

### Approved trading-model decision — Option B (authoritative)

- Use the documented internal-ledger trading model. Do **not** make an external broker/exchange execution provider a prerequisite for implementing or operating this internal-ledger model.
- This decision does **not** permit simulated, fabricated, or estimated financial outcomes to be presented or credited as real. Every trade result and settlement must be genuine, recorded in durable internal trade/settlement records, supported by auditable evidence, and reconciled to the customer's ledger.
- Opportunity estimates, countdowns, animations, ticker search results, and UI state are never evidence of execution or realized profit and must never trigger a financial credit.
- Do not describe internal-ledger processing as execution on an external market. If a feature explicitly claims external-market execution, it must separately use an appropriate authorized integration and independently verifiable result references before making that claim.
- This is the approved resolution of the prior provider-prerequisite conflict and aligns with Section 1 of `docs/TRADING_SYSTEM_SPECIFICATION.md`. If another repository document contradicts this decision, do not silently reintroduce the provider prerequisite; report the exact conflicting text and request clarification before changing the approved model.
- Admin changes to financial policy must be permissioned and auditable. Passing build checks, source inclusion, hosted acceptance, deployment, and production certification are separate gates.


## Ticker candidate data safeguards

- The imported candidate snapshot is `server/data/company-trading-symbol-candidates-1811.json.gz.b64`; the service validates its 1,811 rows and 814 public candidates at startup.
- Join candidate ticker data to the image catalogue using the stable sequential logo ID, never fuzzy name matching.
- The source workbook includes 637 invented placeholder codes, 265 parent-brand ticker references, and 95 historical tickers. Those values must not be exposed as active candidates.
- The 814 rows marked Public are still unverified research candidates. Keep all entries ineligible for verified trade rotation until independent authoritative verification, source URL, provider instrument ID, and verification timestamp are recorded.
- Do not use ticker search results to authorize live orders, market quotes, or settlement.


### Company catalogue UI integration
- The company catalogue contains 1,811 logo-ID-aligned records and is searchable from the customer Trading Opportunities page.
- Keep company ID, local logo, country folder, supplied ticker, exchange, and dataset status associated on the same result.
- Search endpoint may return up to 1,811 records, but the customer UI should request and render at most 100 results at a time.
- Display supplied ticker values as supplied; do not imply they are verified or guaranteed to resolve with a market-data provider.

- Import every row and every column from `company_trading_symbols.xlsx` aligned by its 1-based `#` field to Logo ID; preserve supplied ticker, exchange, status, parent ticker, and reason fields even for placeholder, parent, and historical rows.
- Placeholder codes are display-only and must not be passed to market-data or order APIs. Historical and parent-company ticker references must remain visibly classified; do not silently convert them into direct listings.

### Trade Settings admin navigation and removal of customer trade switches

- The admin portal must use **Trade Settings** as the top-level navigation group for trading configuration and operations. Follow the submenu structure in Section 12 of `docs/TRADING_SYSTEM_SPECIFICATION.md`, including packages/eligibility, quotas, opportunity schedules, duration/closing rules, wallet allocation, fees/earnings limits, retries/carry-forward, company rotation, pop-up/customer display, notifications, active/pending trades, settlement/reconciliation, system health/pause, and audit/policy versions.
- Remove customer-side manual trade-engine controls such as Trading On/Off, Opportunity On/Off, Auto Trade On/Off, package catalogues, package selection, package subscriptions, package activation, and equivalent start/stop switches. Trades are automatic and server-controlled under tiers assigned from qualifying manual administrator deposit credits and admin-configured opportunity quotas, schedules, balances, and limits.
- Automatically assigned tier entitlements and admin-configured tier opportunity counts govern eligible opportunity presentation; do not hard-code one global pop-up count for all customers. The customer portal must never show the full tier catalogue or activation controls. It may show the highest active assigned tier and only the next enabled tier, with the qualifying USD-equivalent amount needed, duration, and added daily opportunity allowance; without an active tier, show the first qualifying milestone and its benefits. Only distinct, auditable credits manually issued by an authorized administrator through the admin portal's Credit Customer / wallet-credit flow, explicitly classified as qualifying and persisted as `admin_manual_deposit_credit`, qualify. Customer/provider deposits, signup credits, imports, profits, rewards, principal returns, bonuses, transfers, swaps, conversions, generic adjustments and all other credit paths do not. Display an insufficient-balance opportunity only when an eligible opportunity actually occurs and the funds check fails.
- Customer-side Minimize/Maximize controls are display-only and must not change trade execution, countdown, or settlement. Keep all financial and policy-changing actions server-side, authorized, validated, idempotent, and auditable.

### Admin authority and trade closing time

- The admin portal is the source of truth for all admin-configurable customer-side trading behaviour. Customer UI must reflect authorized admin settings and server-persisted state; it must not independently override or hard-code policy values.
- Trade close time and countdown target are based on the admin-configured duration/schedule plus the server-recorded trade opening/start timestamp. The browser only renders the countdown; it cannot determine or change the authoritative close time.
- Customer sign-out, refresh, local clock drift, scrolling, minimizing, or maximizing must not alter trade timing or settlement.
- Admin configuration changes must be authorized, validated, audited, and versioned where they affect existing trades. Follow the documented effective-time policy; never silently rewrite a trade's historical timestamps.
- If the configured close time is missing or invalid, show a pending/unavailable state rather than inventing a duration or timestamp.

### Trade pop-up and minimized dock requirements

- The canonical UI requirements are in Section 10 of `docs/TRADING_SYSTEM_SPECIFICATION.md`; read and follow that section before changing the trade pop-up.
- Show company name, local logo, country name and country flag together with the supplied symbol/code and exchange classification. Derive the flag from country metadata; never guess a flag for an unverified country.
- Include invested/allocated amount, gross profit, net profit, platform-fee percentage and amount, profit percentage, total amount credited/returned, trade opening and closing times, countdown, status, and available trade references. Keep principal, gross profit, fee, net profit, and total return distinct.
- Never invent financial values or timestamps. Label estimates clearly and replace them with persisted, ledger-supported actual values after settlement.
- The expanded pop-up must have Minimize; its fixed bottom-of-viewport dock must remain visible during scrolling and show the countdown/status plus Maximize. Minimize/maximize must not alter server-owned trade timing or accounting.
- Do not dismiss a card solely because its expanded timeout expires or countdown reaches zero. Dismiss only after countdown completion and an authoritative terminal status; keep pending/retrying/unsettled items accessible.
- Update the canonical specification and acceptance checklist alongside relevant implementation changes. Test country/flag fallback, scrolling persistence, minimize/maximize, multiple concurrent cards, countdown expiry, terminal dismissal, and unavailable/estimated/settled financial fields.

### Administrator-editable package and company pop-up policy
- Use `docs/TRADING_POPUP_ADMIN_CONFIGURATION_MANUAL.md` for the button-by-button meanings and required settings. Keep it aligned with Section 10 and Section 12 of the canonical specification.
- Admin-editable fields include package name, package badge label/style, threshold, package duration, quota contribution, minimum/allowed capital, configured profit percentage minimum/maximum, trade-duration minimum/maximum, pop-up expanded display duration, schedule, company rotation filters/repeat avoidance, visible-card limit, earnings ceiling, retry/carry-forward settings, and authorized fee policy/version. Every setting must be persisted, validated, audited, and consumed by the runtime; do not create decorative edit buttons with no defined effect.
- Package duration controls entitlement lifetime; trade duration controls the trade's server-owned close time; pop-up display duration controls expanded presentation only. Never conflate them.
- Profit percentage bounds govern a per-pop-up configured payout rate; rates and durations must be selected once inside admin bounds, persisted with the opportunity, and reused after retries/restarts. Label a policy-defined payout as contractual/configured return, not market-earned profit; market-profit claims require auditable execution/result evidence. Use integer basis points and minor-unit money math, fresh timestamped FX evidence for cross-wallet funding, atomic all-or-none wallet debits, and persisted capital/rate/duration snapshots. Workers must recover overdue jobs without resetting countdowns or duplicating debits/credits.
- Rotate the existing local 1,811-record company catalogue using stable Logo IDs and correct local image/name/country metadata. Persist rotation cursor/history and advance it transactionally with idempotent opportunity creation. Avoid repeats until the filtered pool is traversed where possible. Rotation is not proof of a listed instrument, execution, quote, or profit.
- A preview/next-company control must be read-only and must not advance live rotation, create an opportunity, allocate capital or write a ledger entry.
- Select configured payout rates using a cryptographically secure uniform integer basis-point value within admin bounds and durations as integer seconds within their inclusive bounds; persist all selections once. Workers must resume durable scheduled work after restarts, recover expired leases, and prevent duplicate opportunity creation, rotation advancement, allocation and settlement with database locks/fencing and idempotency. Do not depend on browser sessions or process-memory-only schedules.
- If the specification/manual appears to conflict with current code or a historical guide, reconcile the docs and implementation before changing behaviour.

## Trading tier qualification — credit-time wallet FX (authoritative)

- Only qualifying credits manually submitted by an authorized administrator through the admin portal's Credit Customer / wallet-credit form may count toward Trading tier thresholds.
- For a qualifying credit in any enabled non-USD wallet, fetch and validate a live USD conversion rate from the currency-appropriate API at credit time (Frankfurter/ECB with Open ExchangeRate API fallback for supported fiat; CoinGecko for registered crypto/tokens using their configured external asset ID). Store the exact rate, provider, source timestamp, USD-minor attribution and FX snapshot evidence with the committed ledger credit. USD uses a 1:1 rate.
- Never use a manually edited or stale currency-registry rate as a fallback. Fail closed for qualifying classification if the provider cannot price the wallet or the rate is invalid/stale. Do not silently turn a failed qualifying credit into a non-qualifying credit.
- The administrator customer directory must show automatically assigned active Trading tiers and the customer's cumulative qualifying USD amount.
- This qualification-only valuation must not alter ordinary wallet transfers, transfer balances, or transfer ledger semantics.

## Automatic Trading tier qualification worker (mandatory)

- Qualifying administrator credits and their auditable reversals must insert a durable `trading_tier_qualification_jobs` row in the same database transaction as the corresponding ledger entry. The unique `sourceLedgerId` is the idempotency key; never enqueue transfers or non-qualifying credits.
- Run `runTradingTierQualificationWorkerCycle` from the database-enabled server entrypoint on a five-second timer, with a bounded batch, an overlap guard, and an unreferenced timer. The worker must operate without customer sessions.
- Use indexed queue reads, database row locks, a recoverable processing lease, bounded exponential retry, and a terminal dead-letter status after eight attempts. Never spin continuously or scan all customers on an idle queue cycle. Do not claim 100% correctness without running tests and verifying migration/CI results.
- Preserve normal wallet transfer behavior. Test atomic enqueue, duplicate prevention, retry/restart recovery, tier assignment, reversals, and multi-instance locking.
