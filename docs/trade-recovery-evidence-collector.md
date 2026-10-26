# Read-only trade recovery evidence collection

Stage 43 adds a database-backed collector that prepares evidence for the existing trade recovery planner. It is diagnostic tooling only.

## Commands

Run from the project root with a private `.env` containing `DATABASE_URL`:

```sh
pnpm db:collect-trade-recovery-evidence -- --limit 100 --output ./trade-recovery-evidence.json
pnpm db:plan-trade-recovery ./trade-recovery-evidence.json
```

The collector examines up to 1,000 most-recent trades (100 by default), and gathers the matching wallet snapshot, settlement principal/reward ledger entries, reward reservation, lifecycle events, and popup-event references when that table is available. It checks schema requirements first and fails closed if required evidence columns are missing. The collector starts a read-only database transaction, executes SELECT queries only, and refuses to overwrite an existing output file. Omit `--output` to print JSON to stdout.

The output includes a `context` object alongside the planner's `evidence`. It records total trade count and scan coverage; a capped scan is marked incomplete and the planner escalates it to manual review. The context also includes wallet and reservation snapshots with their user/trade identity, currency, and status, plus any ledger rows with a matching settlement reference but a different user/currency. The planner escalates missing/multiple wallet rows, missing reservation snapshots or reservation rows, duplicate reservations, invalid snapshot values, wallet-user or reservation-trade identity mismatches, reservation status/currency mismatches, and inconsistent coverage metadata. The planner also validates persisted gross-profit, platform-fee, net-profit and fee-policy arithmetic, including ledger counts, signs, and amounts. Monetary reconciliation uses exact integer arithmetic and escalates if derived values exceed JavaScript's safe-integer range. Legacy settlements marked `legacy_unrecorded` are not interpreted as zero-profit results merely because migration defaults are zero.

## Important limits

- The default collection is limited to the newest 100 trades; it is not a whole-database audit. Increase `--limit` up to 1,000 or run the existing lifecycle audit for its separately capped diagnostic queries.
- Wallet amounts are snapshots, not a full reconstruction of the wallet from every ledger entry. This tool does not claim to prove the entire wallet ledger balances.
- Evidence can include sensitive financial account details. Keep the output file private and do not commit it to Git.
- No trade, wallet, ledger, reservation, or lifecycle record is changed. The planner never proposes mutations. Any financial discrepancy requires human reconciliation.
- CI can validate code and tests, but a real database run still requires a valid database connection and appropriate read permissions.
