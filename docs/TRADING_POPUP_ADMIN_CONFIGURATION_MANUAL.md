# Trading Pop-up & Admin Configuration Manual

**Status:** Canonical product and implementation requirements; not a statement that every control or worker is already implemented.  
**Repository:** `stannmoye/Arbitrade_platform`  
**Related specification:** [Trading System Specification](TRADING_SYSTEM_SPECIFICATION.md)  
**Implementation tracking:** [Issue #228](https://github.com/stannmoye/Arbitrade_platform/issues/228)  
**Documentation baseline PR:** [PR #227](https://github.com/stannmoye/Arbitrade_platform/pull/227)

## 1. Authority and non-negotiable rules

- Authorized administrators configure package policy. Customers cannot browse, select, subscribe to, purchase, or activate packages.
- Eligibility is assigned automatically from cumulative qualifying credits entered manually by an authorized administrator through the admin portal's Credit Customer / wallet-credit form, explicitly classified as qualifying, and recorded as `admin_manual_deposit_credit`. All other credit/deposit sources and normal transfers are excluded.
- The server owns opportunity creation, capital allocation, rate/duration selection, lifecycle, countdown deadlines, retries, recovery, and settlement. Customer sessions and browser presentation never drive these transitions.
- The existing local company catalogue has 1,811 records. Use stable Logo IDs and the exact associated company name, logo, and country metadata. Do not create hardcoded company lists or treat catalogue membership as company verification.
- This manual describes required behavior. A control is not complete merely because it appears in the UI or documentation.

## 2. Administrator controls

All controls must be authorized, keyboard-accessible, responsive, consistently spaced, clearly labelled, server-validated, and backed by persisted state. Provide loading, validation, failure, and success feedback. Financially significant changes and destructive operations require a confirmation that explains the consequence. Every save/publish and state-changing operation must record actor, timestamp, reason where applicable, old/new values, and policy version.

| Control | Meaning and required behavior |
|---|---|
| Create package | Starts a validated new package draft; does not expose it to customers until published/enabled. |
| Edit package | Loads the persisted values; saving must not silently rewrite open or historical opportunities. |
| Package name | Customer/admin display name, subject to the customer display contract. |
| Badge | Approved badge text and appearance; presentation only, not entitlement or financial authority. |
| Qualifying threshold | Cumulative USD-minor-unit total from qualifying manual admin credits only. |
| Package duration | Entitlement validity and explicit unit; separate from each trade's lifetime. |
| Daily opportunity quota | Number of opportunities contributed per eligible tier; eligible quotas accumulate under global/customer limits. |
| Capital amount or min/max | Capital required/reserved for each opportunity; validate supported units and limits. |
| Percentage min/max | Inclusive permitted rate range, represented as integer basis points (2.00%–5.00% = 200–500 bps). |
| Trade duration min/max | Inclusive permitted lifetime range with explicit seconds/minutes units; server stores the selected duration and absolute deadline. |
| Pop-up display duration | How long the expanded card is shown; never changes the trade's deadline or settlement. |
| Company filters/pool | Selects eligible records from the existing catalogue without hardcoded arrays. |
| Rotation scope/repeat avoidance | Defines the customer/package scope and prevents repeats until the eligible pool is traversed where possible. |
| Preview next company | Read-only preview; must not advance or reserve the live rotation cursor. |
| Schedule/cadence | Defines when eligible opportunities may be created; server schedule is authoritative. |
| Concurrency/display limits | Bounds simultaneous work/display without violating customer isolation or database uniqueness. |
| Fees and earnings ceiling | Applies approved fee rules and the combined daily customer earnings ceiling; never charges a fee on an unrealized estimate. |
| Retry/backoff/carry-forward | Controls bounded retries and overdue recovery; must be backed by real persisted worker behavior. |
| Save / Publish | Validates all fields, persists a new policy version, audits the change, and returns the reloaded saved values. |
| Enable / Pause | Stops or permits new eligible allocations; pausing must not discard or corrupt outstanding work. |
| Delete / Archive | Prefer archive when history references the package. Confirm, authorize, preserve historical references, and reject unsafe deletion. |
| Audit history | Shows actor, timestamp, reason, old/new values, version, and result of the action. |
| Worker health/recovery | Shows last heartbeat/success/failure, queue depth, stale leases, overdue work and dead letters without leaking secrets. |

Any behavior-affecting field not listed above must also be exposed or explicitly identified as system-owned with a reason. Never leave hidden hardcoded policy defaults in active code.

## 3. Customer pop-up content and behavior

A card must be rendered from the saved server policy and durable opportunity/trade record. It should show:

- Correct company name, matching logo, stable Logo ID and country metadata.
- Package badge/name only where permitted by the customer display contract.
- Stable opportunity/trade reference, lifecycle status, required capital and committed amount.
- Funding wallet(s), native amounts, currency, FX rate, provider and source timestamp.
- Configured percentage bounds and the persisted selected rate; label a formulaic return as configured/contractual, not market-earned profit.
- Authoritative server start time, deadline, and countdown derived from that deadline.
- Clear pending/insufficient-balance/unavailable states when allocation cannot proceed.

Minimize, maximize, scrolling, refresh, sign-out, animation, and display timeout must not alter capital, rate, duration, deadline, lifecycle, or settlement. A customer must not be able to trigger a financial transition by opening or viewing a card.

## 4. Company rotation

Rotation uses the existing 1,811-record local catalogue, with stable Logo ID as the identity key. Name, image and country must come from the same catalogue record. Persist the chosen company and rotation state with the opportunity. Avoid repeating a company for the same customer/package until the eligible pool has been traversed where possible. Concurrency, retries, and restart recovery must not double-advance the cursor. Previewing the next company must not mutate live state.

## 5. Financial calculation and funding invariants

- Store money in integer minor units and rates in integer basis points. Define deterministic rounding and test boundaries.
- A selected rate must be within the admin-configured inclusive bounds. For a 2.00%–5.00% range, values such as 2.70%, 3.20%, or 4.90% are valid; 1.90% and 5.10% are invalid. Select and persist once, before processing, then reuse the exact saved value after retries/restarts.
- Trade duration is similarly selected within configured inclusive bounds and persisted once. Store an absolute server deadline; never recalculate it after restart.
- A percentage formula alone is not evidence of market-earned profit. Disclose configured/contractual returns accurately. Any claim of market-earned profit requires auditable execution/result evidence and settlement records; never fabricate or estimate a realized result.
- Cross-wallet funding uses a fresh, valid, timestamped FX quote with provider/source evidence. Lock wallets consistently and atomically debit/reserve all required funds or none. Insufficient funds or invalid/unavailable FX means no partial debit and no guessed rate. Normal transfers remain unchanged.
- Every debit, reservation, release, fee and credit is transactional, idempotent, auditable, and reconciled to the correct customer. Customer and package scope must be enforced in all worker claims and queries.

## 6. Worker, restart, and scale requirements

Use the existing managed server worker runtime and durable indexed database queues. Do not start one process per customer or spin in tight idle loops. Use bounded batches, database claims/leases, fencing, unique job/source keys, idempotency, bounded exponential backoff, dead-letter visibility, and structured safe logs.

Workers must run independently of customer sessions. At startup/restart they recover expired leases and due/overdue jobs in bounded indexed batches. They must resume saved values and deadlines, not reroll rates/capital/duration, reset clocks, advance rotation twice, or duplicate debits/credits. Define overdue behavior explicitly; passing a deadline is not proof of a successful result. Graceful shutdown stops new ticks and drains active cycles within a bound. Keep worker heartbeat, last success/failure, duration, queue counts, stale leases, and terminal errors visible to authorized operators.

## 7. Roadmap and acceptance checklist

1. Audit current `main`, active routes/services, admin/customer UI, schema/migrations, settings, company catalogue, worker registry, ledger and tests.
2. Find and remove active hardcoded package/pop-up/rate/capital/duration/company defaults and conflicting customer package-selection behavior. Preserve historical migrations and audit evidence.
3. Implement versioned policy fields, server-side validation, admin controls, confirmations, audit history and reload-persistence checks.
4. Implement opportunity snapshots, customer card contract and stable-ID company rotation with read-only preview.
5. Implement exact arithmetic, timestamped FX evidence, atomic multi-wallet funding and ledger reconciliation.
6. Implement durable workers, idempotency, isolation, restart/overdue recovery, bounded processing and graceful shutdown.
7. Add unit, contract, concurrency, UI persistence, disposable database and recovery tests. Run `pnpm check`, `pnpm test`, `pnpm build`, migration/installer checks and exact-head GitHub CI.
8. Record commit SHA and actual test results in `progress.md`. Do not claim implementation or production readiness based on documentation alone.

Known outstanding audit targets at the 2026-10-29 handoff include hardcoded opportunity-setting defaults reported in `server/db.ts` and an admin navigation description saying carry-forward controls are not implemented. Track these and related work in Issue #228. No production deployment or production database change is authorized or implied by this document.
