# Trade recovery planning (read-only)

The recovery planner turns already-collected trade evidence into a conservative review queue. It does **not** connect to MySQL, read customer records, update wallet balances, create ledger entries, change trade status, or release/credit reward reservations.

## Run it

Prepare a private JSON file containing an array of records with a trade identifier and the evidence fields below, then run:

```sh
pnpm db:plan-trade-recovery ./private-trade-evidence.json
```

Do not commit files containing customer identifiers or production data. Keep evidence files private and remove them according to your data-handling policy.

Example shape (illustrative values only):

```json
[
  {
    "tradeId": 42,
    "evidence": {
      "tradeStatus": "settled",
      "settlementStatus": "completed",
      "principalMinor": 10000,
      "rewardCreditedMinor": 500,
      "settlementReference": "settlement-example",
      "principalLedgerCount": 1,
      "principalLedgerAmountMinor": 10000,
      "rewardLedgerCount": 1,
      "rewardLedgerAmountMinor": 500,
      "rewardReservationStatus": "credited",
      "lifecycleEventCount": 2,
      "walletUpdatedAtPresent": true
    }
  }
]
```

Amounts must be in the same integer minor units used by the source ledger. Counts must reflect a complete query for the relevant trade/reference, not a capped audit sample. A missing amount is represented as `null`, not zero.

## Plan outcomes

- `NO_ACTION`: the supplied fields are internally consistent; verify that the evidence collection was complete before closing the review.
- `STATUS_REVIEW_ONLY`: review lifecycle/timestamp metadata only. Do not infer or repair money movement from metadata alone.
- `MANUAL_FINANCIAL_REVIEW`: stop and reconcile the wallet, all relevant ledger entries, settlement reference, and reservation state before considering any correction.

Every output sets `automatedMutationAllowed: false`, has an empty `plannedMutations` list, and requires human review. The planner's classification is only as reliable as the supplied evidence. It is not a live database audit, proof of wallet balance correctness, or an authorization to repair customer data.
