
## Checkpoint 5 — per-tier timing bounds and payload ownership (implemented; local validation passed)

- The per-tier editor now uses an explicit allowlist for patch fields. Removed global masters, lifecycle switches, and unknown fields cannot be submitted by the client patch builder; the server repeats the allowlist check before starting the transactional, versioned, audited write.
- Server automation validation now enforces inclusive bounds for delivery intervals, popup/completion display durations, pending/attempt/concurrency limits, retry delay, reward caps, and settlement delay. Settlement delay is constrained to 900–604800 seconds and every min/max range is ordered.
- Added focused client and server regression coverage and included the client patch test in the standard Vitest collection.
- Local validation: `pnpm test` — 122 files passed, 5 skipped; 955 tests passed, 27 skipped. `pnpm check`, `pnpm build`, and `git diff --check` passed. No production database, migration, wallet, ledger, trade, settlement, payout, or deployment operation was performed.
- Exact-head GitHub CI, browser accessibility/keyboard/responsive checks, and release acceptance remain open. Automatic financial execution remains hard-disabled.
