# Current task outcomes

## Completed and verified in the Sandbox

- [x] Customer Mining Engine shows current package hash rate and currently purchasable offer capacity beside the fullscreen control.
- [x] The administrator's account plan is Starter and the account remains an administrator.
- [x] The Sandbox database contains five catalog packages: Genesis ($100/1 TH/s), Velocity ($300/3 TH/s), Quantum ($600/7 TH/s), Titan ($1,200/16 TH/s), Infinity ($2,500/40 TH/s); all have 24-month terms. The internal CKI reference (1 CKI = $1.27 USD) is versioned and database-backed.
- [x] Customer Mining conversion now targets the canonical main-wallet balance, swaps the full available CKI amount, and uses the saved swap currency/recorded rates with auditable ledger references; CKI itself remains ineligible for payout.
- [x] Package checkout is enabled independently from CKI reward posting. A single Buy click charges the package's configured price currency from the main wallet, obtains a fresh server-side FX quote, revalidates package/rates/balance, then atomically debits that currency and activates the package. The active entitlement starts immediately; an idempotent database claim enforces one lifetime purchase per customer/package. No purchase was executed during this update.
- [x] Active package hash-time is written as idempotent per-package interval records, including TH/s snapshots and eligible seconds. The customer engine/animation runs from an active entitlement and reports activity separately; CKI credits remain blocked until verified third-party farm settlements are ingested.
- [x] The current economics version is stored with a 120-second boost and a 14,400-second per-customer start-to-start cooldown. All five package boost amounts are currently 0 TH/s, so no extra capacity is invented.
- [x] The Mining walkthrough's dummy +1 CKI/RPM/replay flow was replaced by a slow continuous purchased-package status animation. Admin Mining now says settlement integration is not configured; the old reward-credit toggle is disabled in the UI and rejected by the server. Legacy estimates cannot be enabled as actual settlement credits.
- [x] Additive/idempotent Mining migrations were applied only to the Sandbox database; all builds/type checks/tests pass. No customer wallet balances were changed by this work.

## Still required for real financial operation

- [ ] **Third-party settlement ingestion and allocation:** The farm sells hash to a third party without a pool. Persist actual settlement periods, amount/asset, source reference, FX/CKI valuation, costs and operator share; allocate actual distributable earnings to customer purchased hash power; credit CKI exactly once. Needed before reward posting: settlement source (manual statement upload or API), net-versus-gross cost treatment, customer share, and denominator/allocation basis. Package checkout is enabled, but no CKI reward is quoted or credited until this input exists; package hash rate alone does not establish earnings.
- [ ] **Payout tickets:** Customers may request manual payout only from canonical USD/EUR/GBP/BTC/ETH/USDT balances, after any CKI is swapped. Durable ticket status, admin processing, external reference and audit are not implemented yet. Confirm whether funds should be reserved/locked on request until approved, paid or rejected. No external transfer is automated.
- [ ] **Boost capacity:** The 120-second/four-hour policy is saved, but each package's bonus power is 0 TH/s. Supply the extra TH/s or percentage per package before claiming that Boost adds power.
- [ ] **Production and data cleanup:** The running site/database are temporary Sandbox only, not production. Specify the production host and production database before deployment. The Mining demo walk-through was removed, but no unspecified users, balances, transactions, contracts, investment data or other demo records have been deleted; provide an exact cleanup scope before any deletion.

## Safety status

- [x] Internal CKI/USD is an admin-configured reference, not a live-market quote; no third-party settlement is connected.
- [x] The legacy `expectedDailyRewardCki` package values remain `NULL`; global customer-credit posting is disabled. The service refuses to enable the legacy estimate engine as verified farm earnings.
- [ ] Provide the third-party settlement source/asset, allocation share/cost formula, boost capacity, payout reservation choice and production target before enabling real credits, creating payout workflows or deploying production.
