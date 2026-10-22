# Current task outcomes

## Completed and verified in the Sandbox

- [x] Customer Mining Engine shows current package hash rate and currently purchasable offer capacity beside the fullscreen control.
- [x] The administrator's account plan is Starter and the account remains an administrator.
- [x] The Sandbox database contains five catalog packages: Genesis ($100/1 TH/s), Velocity ($300/3 TH/s), Quantum ($600/7 TH/s), Titan ($1,200/16 TH/s), Infinity ($2,500/40 TH/s); all have 24-month terms. The internal CKI reference (1 CKI = $1.27 USD) is versioned and database-backed.
- [x] Customer Mining conversion now targets the canonical main-wallet balance, swaps the full available CKI amount, and uses the saved swap currency/recorded rates with auditable ledger references; CKI itself remains ineligible for payout.
- [x] Package checkout is enabled independently from CKI reward posting. A single Buy click uses the saved main-wallet currency, obtains a fresh server-side FX quote, revalidates package/rates/balance, then atomically debits the canonical wallet and activates the package. The active entitlement starts immediately; an idempotent database claim enforces one lifetime purchase per customer/package. No purchase was executed during this update.
- [x] Active package hash-time is written as idempotent per-package interval records, including TH/s snapshots and eligible seconds. The customer engine/animation runs from an active entitlement and reports activity separately; CKI credits remain blocked until verified third-party farm settlements are ingested.
- [x] The current economics version is stored with a 120-second boost and a 14,400-second per-customer start-to-start cooldown. All five package boost amounts are currently 0 TH/s, so no extra capacity is invented.
- [x] The Mining walkthrough's dummy +1 CKI/RPM/replay flow was replaced by a slow continuous purchased-package status animation. Admin Mining now says settlement integration is not configured; the old reward-credit toggle is disabled in the UI and rejected by the server. Legacy estimates cannot be enabled as actual settlement credits.
- [x] Additive/idempotent Mining migrations were applied only to the Sandbox database; all builds/type checks/tests pass. No customer wallet balances were changed by this work.

## Stage 4 close-out — manual payout tickets and customer TOTP

- [x] **Implementation complete:** durable manual payout requests, transactional reservation/release, idempotency, cancellation, administrator resolution, required unique external references for marking paid, withdrawal/email/KYC gates, customer TOTP enrollment and confirmation, replay prevention, AES-256-GCM encrypted secrets, authenticator replacement, and one-time recovery codes/recovery-based replacement.
- [x] **Functional mismatch fixed:** when a customer has an enabled authenticator, payout submission now verifies and consumes a fresh TOTP code even when global/per-customer two-factor policy is optional. Missing/replayed codes fail without a second reservation.
- [x] **Automated acceptance complete:** code head `26e5538b7c961687903d12dc54307bdc0be17869` passed the production build, TypeScript, full application/theme-policy tests, installer/migration validation, and Mining database regression. The manual payout lifecycle suite passed **7/7 tests on disposable MariaDB and 7/7 on MySQL 8**; Chromium payout acceptance passed **10/10**; the browser viewport/five-theme matrix passed **1,004/1,004 with zero failures**. The current branch documentation tip `84b1ca50e0207b71121da90f3d5b8630337753c4` also passed all three tracked workflows.
- [x] **Migration inventory complete:** migrations `0059_manual_payout_requests.sql`, `0060_customer_totp_authenticators.sql`, and `0061_customer_totp_recovery_codes.sql` are registered in installer/recovery inventories.
- [ ] **External release gate — authenticated staging acceptance:** use separate customer/admin roles and actual staging policy/KYC settings to verify enrollment, current-device replacement, lost-device recovery, payout submission/history, cancellation, and administrator paid/rejected resolution.
- [ ] **External release gate — production TOTP key:** verify stable `TOTP_ENCRYPTION_KEY` configuration and a protected, tested backup before real customer enrollment.
- [ ] **Production payout enablement is out of scope until separately approved:** this is a manual ticket lifecycle only; no bank/blockchain transfer is initiated. An approved provider, settlement/allocation model, and reconciliation/reversal procedures are still required before enabling actual external transfers or CKI earnings.

**Stage 4 development and automated validation are complete.** The two items above require access to the actual staging/production environment and remain release gates; they are not additional code-development tasks. No production migration, deployment, customer balance mutation, or live financial operation was performed.

## Separate workstreams — not Stage 4 close-out

- [ ] **Third-party settlement ingestion and allocation:** decide the settlement source (manual statement upload or API), settlement period and amount/asset, FX/CKI valuation, net-versus-gross cost treatment, operator/customer shares, and allocation denominator. Ingest and credit only verified distributable earnings exactly once. No CKI reward is quoted or credited until this model exists.
- [ ] **Boost capacity:** package bonus power remains 0 TH/s. Define a non-zero TH/s or percentage per package before claiming that Boost adds power.
- [ ] **Production target and data cleanup:** the running site/database are temporary Sandbox only. Specify the production host/database before deployment, and provide an exact cleanup scope before deleting any users, balances, transactions, contracts, investment data, or other records.

## Safety status

- [x] Internal CKI/USD is an admin-configured reference, not a live-market quote; no third-party settlement is connected.
- [x] The legacy `expectedDailyRewardCki` package values remain `NULL`; global customer-credit posting is disabled. The service refuses to enable the legacy estimate engine as verified farm earnings.
- [ ] Provide the third-party settlement source/asset and allocation share/cost formula, non-zero boost capacity, approved transfer/custody provider, and production target before enabling real CKI credits, external payouts, or production deployment.
