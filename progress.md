# Current Trading Handoff — 2026-10-28

**Repository:** [stannmoye/Arbitrade_platform](https://github.com/stannmoye/Arbitrade_platform)  
**Canonical base:** `main` at `bf940d02baeb39c92fed66eeea7ed44b1843119f` (re-check before further changes)  
**Active branch:** `feature/automatic-trading-tier-qualification-20261028`  
**Pull request:** [#205 — automatic deposit-based tier qualification](https://github.com/stannmoye/Arbitrade_platform/pull/205)  
**Baseline PR head inspected before the 2026-10-28 policy clarification:** `e5b4e34513e776cd3cbc0398ee1697a9f9a9da71`. This clarification adds subsequent commits; re-fetch the live PR head before validation or further writes.  
**PR state at last inspection:** open, unmerged; GitHub reported mergeable. Exact-head checks and full diff review are still required. No merge, deployment, or production database migration has occurred.

## Authoritative Trading tier policy

This policy is final and must be followed throughout the application:

- Customers must not browse, select, subscribe to, purchase, or activate Trading packages/tiers.
- Only authorized administrators configure tiers and their thresholds, duration, quota, schedule, allocation limits, risk controls and display settings.
- Tier entitlement is assigned automatically by the server only when cumulative, persisted qualifying credits manually submitted by an authorized administrator through the admin portal's **Credit Customer / wallet-credit form** meet an enabled tier's threshold.
- The admin portal's **Credit Customer / wallet-credit form is the sole qualifying source**. Only a positive customer credit manually submitted by an authorized administrator, explicitly classified as qualifying, and committed as `admin_manual_deposit_credit` qualifies. Customer/provider deposits, signup credits, imports, generic adjustments, profits, rewards, returned principal, bonuses, transfers, swaps, conversions and all other credit paths are excluded.
- Preserve the USD-minor-unit attribution and the currency rate, provider/source and timestamp used at credit time. Stale or unverifiable rates fail closed. A separately audited reversal linked to the original credit reverses that qualifying attribution; an ordinary debit does not.
- All active qualifying tiers contribute their configured daily opportunity quotas cumulatively. Never assign a fallback tier or quota.
- Customer-facing Trading UI/API may expose only a read-only eligibility result and total daily opportunity allowance. Do not expose tier names, thresholds, catalogue, subscription history, internal entitlement identifiers, or activation/management actions.
- Customer reads, login, refresh, popup views and client actions must not create entitlements, allocate capital, run worker lifecycle transitions or settle trades. The scheduled server worker owns automatic processing.
- Internal-ledger records, actual supported trade outcomes, transactional idempotency, auditability and reconciliation remain mandatory. Estimates are never realized results or ledger credits.

## Changes present in PR #205 at last inspection

- Replaced the customer package catalogue/activation experience with a read-only eligibility and combined allowance summary.
- Removed customer package listing/activation routes and legacy activation service references from the changed application code.
- Added explicit administrator classification of manual credits, qualifying USD attribution and conversion evidence, and audited deposit reversals. Policy clarification: only the admin portal's Credit Customer flow may create a qualifying Trading tier credit; all other deposit/credit paths are excluded.
- Added forward migration `0080_qualifying_admin_deposit_attribution.sql`; it preserves legacy subscription rows for audit but expires legacy customer-created entitlements. Migration history is retained and must not be deleted or rewritten to pretend old migrations never existed.
- Added/reconciled automatic tier entitlement creation, cumulative quota evaluation, worker-only lifecycle operations, API sanitization and policy contract tests.
- Updated `docs/TRADING_SYSTEM_SPECIFICATION.md` and `AGENTS.md`, removed the duplicate `docs/implementation-matrix.md`, and updated this handoff and the administrator menu guide to the authoritative policy.

## Admin-portal-only qualifying-credit clarification (2026-10-28)

- Reaffirmed the sole qualifying source: a positive credit manually submitted by an authorized administrator through the admin portal's **Credit Customer / wallet-credit form**, explicitly classified as `qualifying_deposit`, and committed to the customer's ledger as `admin_manual_deposit_credit`.
- Explicitly excluded customer/provider/payment-gateway deposits, signup credits, imported/opening balances, generic adjustments, profits, rewards, returned principal, bonuses, transfers, swaps, conversions and all other credit/deposit paths.
- Updated the canonical Trading specification, `AGENTS.md`, README, admin menu guide, master roadmap and this handoff. Updated the Credit Customer form copy to state the sole source and strengthened the Trading qualification contract tests to check admin-only route protection and signup-credit exclusion.
- The server-side implementation already gates qualifying attribution on the admin-only `adjustCustomerBalance` route, an explicit qualifying classification, a customer account, and the `admin_manual_deposit_credit` ledger type; tier reconciliation sums only that ledger type and linked audited reversals. The regression suite still needs to run on the exact final branch head.

## Required remaining work

1. Continue repository-wide searching on the PR branch for old customer Trading package selection, activation, manual assignment, wallet-balance qualification, repeat-purchase and cooldown flows. Distinguish obsolete Trading policy from unrelated Mining packages and immutable migration history.
2. Review all active Trading guides, admin menu documentation, roadmap, test contracts, router/API exports, components, service modules, settings, schema, migration journal and installer migration lists. Rewrite conflicting active docs; preserve historical audit records only when clearly historical and not presented as current instructions.
3. Verify migration `0079` against canonical `main` and ensure the settlement-timing repair and migration `0080`/ `0081` apply in the correct order. Do not merge the conflicting migration from PR #200 without explicit reconciliation.
4. Inspect the full PR #205 diff, especially the treatment of legacy entitlements and qualifying-credit/reversal attribution.
5. Run exact-final-SHA validation: `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, `pnpm build`, migration/installer validation, browser acceptance, Trading recovery checks and Mining regression checks. Report only results verified on the exact SHA.
6. Do not merge or deploy without authorization and successful validation.

## Latest documentation consistency increment

- Updated `docs/admin-portal-menu-guide.md` to remove manual customer package assignment from account creation/editing and Opportunity Engine guidance, and to document automatic tier qualification.
- The documentation-only commit created by that update is `52bfa0cf2d230883ef581edf14242ad921a7cedc`. The branch head moved; re-fetch the current PR head before any further write or validation.

## Credit-time USD conversion clarification (2026-10-28)

- Only qualifying credits submitted through the authorized admin portal Credit Customer form count toward Trading tier thresholds.
- For each qualifying credit, the server must fetch a live USD rate for the selected enabled wallet currency at credit time, persist the exact rate/provider/source timestamp and FX snapshot, and attribute the resulting USD minor units to that ledger credit. USD is 1:1; supported fiat uses Frankfurter/ECB with Open ExchangeRate API fallback and configured crypto/token IDs use CoinGecko. Do not fall back to editable registry rates; fail closed when a valid fresh API rate is unavailable.
- Admin customer views must show automatically assigned active Trading tiers and cumulative qualifying USD totals. Normal transfers are explicitly out of scope and must remain unchanged.
- Code changes for this clarification: `server/marketProviders.ts` adds `fetchCurrencyUsdRate`; `server/db.ts` calls it before the qualifying credit transaction, validates the currency configuration again inside the transaction, and records rate evidence in `fxRateSnapshots` and the qualifying ledger row. These changes are not yet validated by CI or a local test run.

## Durable automatic Trading tier qualification worker (2026-10-28)

- Added schema and migration `drizzle/0082_trading_tier_qualification_jobs.sql` for an indexed durable queue with unique source ledger IDs, processing leases, attempt counts, retry availability and dead-letter error storage; registered it in `drizzle/meta/_journal.json`.
- Qualifying administrator credits and qualifying-deposit reversals now enqueue a job atomically inside the same database transaction as the ledger entry. Non-qualifying credits and normal transfers are excluded.
- Added `runTradingTierQualificationWorkerCycle` in `server/db.ts`. It claims a bounded batch under row locks, reconciles each customer's cumulative USD eligibility, marks success, retries failures with exponential backoff, reclaims stale leases, and dead-letters after eight attempts.
- Registered the worker in `server/_core/index.ts` on a five-second unreferenced timer with an overlap guard. Idle processing uses indexed queue queries instead of scanning the full customer list.
- Added contract assertions for queue schema/migration, atomic enqueue, worker registration, bounded processing and retry behavior.
- Validation status: implementation changes are committed to the existing feature branch, but typecheck/build/tests and GitHub CI for the exact resulting head have not yet been verified. Do not claim production readiness until those checks pass and migration deployment is confirmed.
