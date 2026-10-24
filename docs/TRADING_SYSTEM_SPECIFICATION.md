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
6. Financial transactions must be durable, auditable, transactional, and idempotent. Never credit or debit only in the UI.
7. Real-money trading must use verified execution and settlement from a named, authorized provider. Until that exists, label activity as Practice/Simulation/Research and never present estimates or simulated profit as real, withdrawable earnings.

## 2. Free package activation and qualifying balance

Package subscription is free under this proposal. A customer must meet the package's minimum qualifying wallet balance to activate it. Do not debit and immediately credit the same amount merely to create the appearance of a subscription transaction.

- Qualifying balance is an eligibility threshold, not the subscription price and not an automatic per-trade capital amount.
- At activation, check the configured eligible wallet balance. Admin policy must define whether multiple eligible wallets can be combined.
- Recommended default: check at activation, then apply an admin-configurable maintenance rule and grace period if the balance later falls below the threshold.
- Do not lock the entire qualifying balance by default. Reserve only capital actually committed to a trade unless a separate, disclosed reserve rule is approved.
- If the customer cannot qualify, show: “Your available balance is not sufficient to activate this package. Please credit an eligible wallet. Minimum qualifying balance: [amount].”
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

Admin may pause new allocations or a faulty integration for safety; this is not a customer trading toggle. Do not delete or lose pending trades when pausing new allocations.

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
- Only credit after verified settlement. UI animations are not accounting.
- The combined daily earnings ceiling is one customer-level limit across all packages and wallets. Default measurement should be net realized profit, excluding returned principal. Admin must define daily reset timezone/period.
- Wallet reservations must be distinguished from completed debits. Prevent the same funds from backing multiple concurrent trades.
- Wallet ledger and displayed balances must reconcile. Use idempotent, transactional operations.

## 9. Company catalogue and rotation

Target 3,000 verified publicly listed companies; prioritize large and liquid listings across the US, UK, Germany, Canada, Australia, Norway, Switzerland, Belgium, India, Russia, Sweden, Denmark, China, Hong Kong, Singapore, Netherlands, New Zealand, Austria, Poland, Lithuania, Slovakia, Belarus, Kuwait, South Africa, Saudi Arabia, Turkey, Spain, Italy, France, Egypt, Japan, Iceland, Slovenia, Czechia, South Korea, and other supported markets.

Store stable internal ID, legal/display name, ticker/symbol, exchange, instrument type, listing status, logo/source, headquarters city/country, country code/flag, sector, provider identifier, data source, and last verification timestamp. Use licensed/appropriate data sources; do not invent missing details to reach 3,000. Handle ticker changes, mergers, suspensions, and delistings without corrupting historical trades.

Rotate eligible companies with server-side randomized scheduling and configurable market/sector filters. Avoid a fixed predictable sequence, but keep an audit trail. A catalogue entry alone does not prove a trade happened or that the customer owns shares.

## 10. Opportunity pop-up and minimized dock

The expanded card appears when an opportunity is generated. Admin controls how many seconds it remains expanded. After that it minimizes into a bottom-attached dock rather than disappearing; countdown/status continues updating and the card remains accessible until terminal status. Handle multiple simultaneous cards without hiding or overwriting trades.

Normal card should show:
- Company name, ticker/abbreviation, logo, flag, headquarters city/country, and exchange where relevant.
- Trade amount requested and source wallet.
- Start time, estimated completion time, countdown, and expected payout/settlement time.
- Estimated gross profit, fee percentage, estimated fee, estimated net profit, and estimated total return (capital + net profit), when supportable.
- Clear distinction between estimates and confirmed values; final realized values replace estimates after settlement.
- Current status.

For an insufficient-balance card, show the explicit missed status, required capital, available eligible balance, shortfall, and reason. The expanded-card timeout is configurable in seconds; the minimized dock stays accessible until the opportunity/trade reaches a terminal status.

## 11. Credit/debit animations and notifications

- Green for confirmed credits; red for confirmed debits.
- Show temporary +amount near the main balance after a confirmed credit and -amount near the affected wallet after a confirmed debit; then fade the indicator away.
- Show a small viewport-fixed toast centered or near the bottom so it remains visible while scrolling.
- Each wallet's transaction should have its own accurate amount/reason notification.
- Trigger notifications only after database transaction success. Label reserved funds as “Reserved,” not as a completed debit.
- Never show a fake credit/debit animation or a balance change that has not been committed.

## 12. Admin portal controls

Provide configurable sections for:
- Packages: names, amounts, durations, quotas, qualification, activation, status, and terms-change policy.
- Repurchases: same-package repeat toggle, maximum copies, and cooldown.
- Opportunities: schedules, quotas, timing, company filters, retry rules, carry-forward caps, and eligibility.
- Earnings/fees: combined daily net earnings ceiling, fee rate, calculation/rounding rules, and reset timezone.
- Company catalogue: import, search, verify, logo/flag, ticker, headquarters, exchange, sector, and listing status.
- Trading operations: pause new allocations, provider health, pending work, failures, retries, settlement, and reconciliation.
- Wallets: eligible wallet types, reservation rules, allocation and settlement routing.
- Customer experience: pop-up duration, minimized dock, notification position/duration, visible fields, locale/currency formatting.
- Audit/security: role permissions, change history, policy versioning, approval for sensitive settings, and immutable ledger history.

Every consequential admin change should record administrator, timestamp, old/new values, and reason. Emergency pause stops new allocations but does not erase pending work or prevent required settlement/reconciliation. Admins must not silently edit/delete historical financial ledger records.

## 13. Company and financial integrity boundaries

Do not present randomly generated returns as real stock-market profit. If the first release is simulation-only, identify it as Practice/Simulation/Research and do not present simulated balances as withdrawable. Real-money execution requires a named, authorized execution provider, verified market data, execution references, settlement result retrieval, reconciliation, and jurisdiction-appropriate legal/compliance review.

## 14. Acceptance checklist

- No active package => no automatic trade allocation; no fallback package.
- Active eligible package => server evaluates opportunities even when customer is signed out.
- Package quotas sum correctly across entitlements and respect admin limits.
- Same-package repeat purchase obeys admin toggle and maximum copies.
- Package activation checks qualifying balance and creates no artificial debit/credit.
- An eligible opportunity with insufficient funds is displayed only when it occurs, with required amount, available balance, shortfall, and timestamp.
- Insufficient-balance opportunity never debits or allocates capital.
- Settlement credits the correct capital/profit once only after confirmation.
- Default 15% fee is calculated from realized positive gross profit only.
- Failed trades follow retry/carry-forward policy and do not incur a profit fee.
- Combined daily net earnings ceiling applies across all packages and wallets.
- Pop-up minimizes after configured seconds and stays accessible in dock until terminal status.
- Green/red notifications correspond to confirmed credits/debits only.
- Company data is sourced and verified; no invented records to reach target.
- Admin changes are permissioned, versioned, and audited.
- Tests cover concurrent allocations, insufficient balance, retries, worker restarts, fees, ceiling enforcement, and duplicate settlement.

## 15. Implementation workflow requirement

Before changing trading code, read this specification and inspect the current repository state. Identify relevant frontend, API, database, worker, and migration paths. Implement in small stages with forward migrations and tests. Run project checks/tests/build where possible and report exactly what passed. Do not claim implementation, live execution, or production acceptance unless verified.

When a requirement changes, update this canonical file and the PDF together in the same reviewed change. The repository instructions and README must continue linking to this document.
