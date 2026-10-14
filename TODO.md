# Current task outcomes

## Completed in the repository

- [x] Customer Mining Engine shows current package hash rate and currently purchasable offer capacity beside the fullscreen control.
- [x] The administrator's account plan is Starter and the account remains an administrator.
- [x] The Sandbox database previously contained five catalog packages: Genesis ($100/1 TH/s), Velocity ($300/3 TH/s), Quantum ($600/7 TH/s), Titan ($1,200/16 TH/s), Infinity ($2,500/40 TH/s); all have 24-month terms. The internal CKI reference (1 CKI = $1.27 USD) is versioned and database-backed.
- [x] Customer Mining conversion targets the canonical main-wallet balance, swaps the full available CKI amount, and uses the saved swap currency/recorded rates with auditable ledger references; CKI itself remains ineligible for payout. Manual and automatic conversion workflows are present.
- [x] Package checkout creates an active entitlement starting at purchase time, revalidates the quote and wallet debit, and is idempotent. Immediate accrual is attempted only when reward processing is configured and a positive package reward input exists.
- [x] Boost capacity is now calculated as 20% of a customer's total active purchased TH/s, rounded down to 12 decimal places. A boost lasts 120 seconds, then has a customer-specific 600-second cooldown beginning at expiry. Boost hash is attributed proportionally across active packages during reward calculations.
- [x] Added migration `0044_mining_boost_capacity_cycle.sql` to append boost settings as a new economics version, and included it in the consolidated schema bundle. No database migration was applied in this source-only update.
- [x] Added `deployment/cpanel_merged.sql` for importing numbered SQL migrations into a new, empty MySQL 8+/MariaDB database through phpMyAdmin. The bundle contains no credentials or demo customer accounts.
- [x] TypeScript check, all 62 tests, and production build pass. No production database or wallet balance was modified.

## Still required before CKI credit posting can be enabled

- [ ] **Define the internal reward schedule:** The user requested formula-based CKI credits without a third-party pool. The current package-daily formula requires `expectedDailyRewardCki`, which is `NULL` for the published packages; the legacy `rewardTokensPerThsHour` is `0` and is not used for current credits. Supply the intended positive CKI-per-package-per-day values (or explicitly choose a different reward model and rate) before non-zero credits can be posted. If based only on internal issuance, disclose that those amounts are platform-calculated and are not verified mining output or guaranteed returns. No formula amount will be invented.
- [ ] **Production install:** The merged SQL bundle is for a new, empty database only. Back up an existing database and apply forward migrations instead. No cPanel deployment, production data change, or import was performed in this update.
- [ ] **Payout tickets:** Customers may request manual payout only from canonical USD/EUR/GBP/BTC/ETH/USDT balances, after any CKI is swapped. Durable ticket status, admin processing, external reference, audit, and the reservation/locking choice remain unimplemented. No external transfer is automated.
- [ ] **Data cleanup:** No unspecified users, balances, transactions, contracts, investment data, or other records have been deleted. Provide exact cleanup scope before deletion.

## Status and safety

- Internal CKI/USD remains an administrator-configured reference, not a market price. Internal CKI-to-wallet conversion uses recorded rates and does not itself constitute an external payout.
- The current production/source configuration has no positive configured reward input and global customer reward posting remains gated. The 0044 boost migration does not enable CKI rewards.
- Package activation and the periodic worker are implemented, but an active package alone cannot produce a non-zero CKI amount without a defined positive reward input.
