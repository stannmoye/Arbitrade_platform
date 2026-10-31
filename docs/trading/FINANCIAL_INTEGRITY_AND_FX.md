# Financial Integrity and FX Funding Contract

**Owner:** PART 2 — FINANCIAL INTEGRITY & FX FUNDING  
**Scope:** Trading qualification FX evidence and financial safeguards. This contract does not replace the existing wallet/ledger infrastructure.

## Qualifying administrator credits

- The only qualifying source is an authorized administrator's explicit qualifying manual credit to a customer through the admin portal.
- Persist qualification attribution only on the committed `admin_manual_deposit_credit` ledger entry. Ordinary deposits, customer deposits, transfers, signup credits, rewards, swaps and generic wallet adjustments remain non-qualifying.
- Store the source amount in native minor units, currency, converted USD minor units, FX rate, provider, source timestamp and rate-snapshot evidence. A reversal must link to its original qualifying ledger row and reuse its historical USD attribution rather than reprice the original credit.
- The qualification job is an outbox record inserted in the same transaction as the qualifying ledger row; its source-ledger uniqueness prevents duplicate queue entries for one committed ledger record.

## FX and conversion rules

- USD is product-defined 1:1. Other currencies require a currency-appropriate API quote. The editable currency registry rate is not an acceptable qualifying-credit fallback.
- Validate the currency registry record and scale, quote pair, positive finite rate, provider identity, source timestamp and provider-specific freshness before the credit commits. Missing, malformed, stale or unavailable quotes fail closed.
- Convert native minor units to USD minor units through `nativeMinorToUsdMinorExact` in `shared/money.ts`. It uses `decimal.js` and rounds once, half-up, at the USD-cent boundary. Do not use binary floating-point multiplication for qualification or round the result again.
- Store the exact returned provider-rate string where available. Keep provider source time distinct from the local fetch time; a fetch timestamp is not a substitute for provider provenance.
- Once a transaction commits, any retry must replay its persisted FX and ledger evidence, never fetch a new rate and reapply the transaction.

## Multi-wallet funding

Multi-wallet funding is covered by overlapping PR #230 and must be reviewed as part of integration, not duplicated in this branch. Acceptance requires stable-order row locks, a fresh quote per required currency pair, persisted native/USD snapshots, documented rounding and fees, and a single database transaction that commits every debit/reservation and ledger posting or none. Normal wallet transfers must retain their existing behavior and must not create Trading qualification attribution.

## Administrator wallet-adjustment idempotency boundary

The administrator wallet-adjustment path (`adminOperations.adjustCustomerBalance` → `adjustCustomerBalance`) requires a caller-supplied idempotency key. The server validates and normalizes the request, then binds the key to a SHA-256 fingerprint covering the administrator, customer, currency, amount, credit/debit mode, explicit classification, reversal target and audit reason. The key is unique in `admin_wallet_adjustment_idempotency`.

The reservation is rechecked under a database row lock. The wallet balance change, ledger entry, qualifying-credit FX snapshot, audit record, qualifying-tier outbox record (when applicable), and committed response snapshot are written in the same transaction. A matching retry returns the original committed response and ledger ID without applying another balance change or fetching a replacement FX quote. Reusing the same key with a different request is rejected. Post-commit notifications and email enqueueing are skipped for idempotent replays.

This enforcement is specific to the administrator wallet-adjustment service. It must not be generalized to payout, external funding, refund or settlement entry points without separate inspection and tests for those flows.

The regression coverage is split across:
- `scripts/trading-wallet-adjustment-idempotency.integration.ts`: concurrent duplicates, matching replay, key/payload mismatch, FX failure/staleness and transaction rollback.
- `scripts/trading-wallet-authenticated-api.integration.ts`: real HTTP requests through the production tRPC router and context, signed database-backed customer/admin sessions, role and ownership checks, qualifying/non-qualifying credits, administrator self-credit exclusion, customer ledger-history access, credit-time FX evidence and replay behaviour.

The authenticated integration uses a deterministic response at the external FX-provider boundary while retaining the actual conversion service, API router, session validation, database transactions and persisted evidence. It does not claim live-provider availability.

## Required verification

- Decimal rounding: half-up boundaries, high precision rates, non-two-decimal source currencies, overflow and amounts below one USD cent.
- FX: invalid/zero/negative rates, mismatched currency pair, stale/future timestamps, provider outage and timeout.
- Concurrency and failure: duplicate requests, simultaneous wallet updates, insufficient aggregate funding, mid-transaction failure and process retry.
- Provenance: qualifying versus non-qualifying credit, reversal and worker event uniqueness. Non-qualifying administrator credits and administrator self-credits must not create tier-qualification attribution or jobs.
- Authenticated API: anonymous and stale sessions are rejected; customer roles cannot call administrator credit or admin wallet routes; an administrator can credit a customer; one customer cannot read another customer's balances or wallet-ledger history.
- Regression: inspect and test ordinary wallet transfers separately. No customer-to-customer wallet-transfer route or service was found during this Stage 1 branch review, so ordinary-transfer behaviour has not been independently verified here; do not report it as tested.

A successful typecheck or build alone is not evidence of financial correctness. Require disposable-database integration tests and exact-head CI before accepting this contract.

