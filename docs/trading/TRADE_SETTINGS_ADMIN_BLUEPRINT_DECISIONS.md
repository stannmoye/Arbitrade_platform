
## Checkpoint 5 — per-tier timing bounds and payload ownership (implemented; local validation passed)

- The per-tier editor now uses an explicit allowlist for patch fields. Removed global masters, lifecycle switches, and unknown fields cannot be submitted by the client patch builder; the server repeats the allowlist check before starting the transactional, versioned, audited write.
- Server automation validation now enforces inclusive bounds for delivery intervals, popup/completion display durations, pending/attempt/concurrency limits, retry delay, reward caps, and settlement delay. Settlement delay is constrained to 900–604800 seconds and every min/max range is ordered.
- Added focused client and server regression coverage and included the client patch test in the standard Vitest collection.
- Local validation: `pnpm test` — 122 files passed, 5 skipped; 955 tests passed, 27 skipped. `pnpm check`, `pnpm build`, and `git diff --check` passed. No production database, migration, wallet, ledger, trade, settlement, payout, or deployment operation was performed.
- Exact-head GitHub CI, browser accessibility/keyboard/responsive checks, and release acceptance remain open. Automatic financial execution remains hard-disabled.


## Checkpoint 6 — Trade Settings ownership and display-policy bounds (implemented; local validation passed)

- Added a field-level ownership registry for Trade Settings and contract tests tying each editable tier-policy field to one stable navigation owner and its read/write contract. The mounted Guide and static administrator handbook now reflect the canonical global-control ownership and preserve the locked-OFF automatic financial execution state.
- Corrected field explanations for delivery-counting windows and for the stored `maxPendingDeliveries` / `maxDeliveryAttempts` settings. Both are validated/persisted, but neither is currently enforced by a delivery-worker consumer; this remains an open blueprint implementation gap.
- Aligned `popupDisplayTargetSeconds` bounds across the editor, client save validation, administrator API and shared server validator to 1–86,400 seconds, matching the existing delivery runtime. Existing values above one day are not silently migrated; administrators must lower and save them. No schema or data migration was added.
- Local validation: `pnpm install --frozen-lockfile`; focused suite — 10 files, 105 tests passed; full `pnpm test` with database URLs unset — 125 files passed, 5 skipped; 999 tests passed, 27 skipped; `pnpm check`, `pnpm build` and `git diff --check` passed.
- Safety/status: two independent read-only reviews found no blockers after their warnings were corrected. No application database, wallet, ledger, trade, settlement or payout operation was used. Automatic financial execution remains hard-disabled. The branch checkpoint has not yet received exact-head GitHub Actions evidence; browser accessibility/keyboard/responsive checks and hosted/release acceptance remain open. This checkpoint does **not** complete the full blueprint.
- **Implementation commit:** `38d97e2fba5deaf0a302d51ba03257143d85ae18` (`feat(trading): document settings ownership and align display bounds`).
- **Next safe action:** Push the source and handoff commits, then continue in parallel worker waves with the remaining blueprint audit and the missing runtime consumers, keeping each source/test integration checkpoint isolated and validated.
