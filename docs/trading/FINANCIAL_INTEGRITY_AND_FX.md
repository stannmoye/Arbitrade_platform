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

## Idempotency boundary and known gap

The current admin adjustment path generates a new random ledger reference per call and does not yet require a caller-supplied request idempotency key. Consequently, a client retry after an uncertain response can still create a second wallet adjustment even though each individual write is transactional. This remains a blocking integrity gap for release. A follow-up must add database-backed request idempotency, bind a key to a canonical request fingerprint, return the original committed result on a matching replay, reject key reuse with different parameters, and test concurrent duplicates. The same principle must be reviewed for funding, debit, refund and settlement entry points.

## Required verification

- Decimal rounding: half-up boundaries, high precision rates, non-two-decimal source currencies, overflow and amounts below one USD cent.
- FX: invalid/zero/negative rates, mismatched currency pair, stale/future timestamps, provider outage and timeout.
- Concurrency and failure: duplicate requests, simultaneous wallet updates, insufficient aggregate funding, mid-transaction failure and process retry.
- Provenance: qualifying versus non-qualifying credit, ordinary transfer, reversal, and worker event uniqueness.
- Regression: existing wallet transfers and non-Trading wallet adjustments behave as before.

A successful typecheck or build alone is not evidence of financial correctness. Require disposable-database integration tests and exact-head CI before accepting this contract.
