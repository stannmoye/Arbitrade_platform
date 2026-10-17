# Interrupted trade recovery: Stage 41

## Purpose

Stage 41 introduces a pure, read-only classifier for interrupted trade processing. It classifies supplied trade, ledger, reward-reservation, lifecycle-event, and wallet-update evidence. It does not connect to a database and does not change trades, wallets, reservations, or ledger entries.

## Classifications

- `NO_ACTION`: the supplied evidence is internally consistent or there is no supplied indication of a settlement conflict.
- `STATUS_REVIEW_ONLY`: the evidence suggests a missing lifecycle event or wallet-update timestamp, but the supplied settlement ledger evidence is consistent. This is a review queue, not permission to patch status fields automatically.
- `MANUAL_FINANCIAL_REVIEW`: ledger movement conflicts with trade state, a ledger entry is missing or duplicated, amounts disagree, a reward reservation conflicts with settlement, a settlement reference is absent, or evidence is malformed.

## Safety rules

- The classifier always returns `automatedMutationAllowed: false`.
- It never infers that a missing ledger entry should be created.
- It never authorizes a principal release or reward credit based only on trade status.
- Financial inconsistencies must be reconciled against the complete wallet and ledger history before any correction.
- Automated tests use synthetic evidence only; they do not validate a production database.

## Scope limitation

This stage supplies the decision logic and automated unit tests. It does not yet run a database-backed recovery report or perform a recovery. A live audit requires a configured private `DATABASE_URL` and access to the target database.
