# Current task outcomes

## Completed in the repository

- [x] Successful package purchases create active entitlements starting at purchase time. The recurring server worker accrues independently of an open customer browser; worker checkpoints and idempotency keys protect recovery from restarts and duplicate cycles.
- [x] Formula-based CKI credits are persisted to the CKI wallet ledger, `mining_reward_events`, and `mining_reward_package_allocations` within an atomic transaction. CKI uses the database wallet's full 18-decimal precision.
- [x] Implemented the exact reward formula: `package daily CKI limit × eligible active seconds ÷ 86,400`. Accrual is split at UTC midnight, bounded by package start/end, and capped per package per UTC day. The boost does not increase a package's daily reward cap.
- [x] The six 24-month package terms are versioned in the SQL activation migration: Genesis ($100, 1 TH/s, 0.10 CKI/day), Velocity ($300, 3 TH/s, 0.30 CKI/day), Quantum ($600, 7 TH/s, 0.70 CKI/day), Titan ($1,200, 16 TH/s, 1.60 CKI/day), Infinity ($2,500, 40 TH/s, 4.00 CKI/day), and Singularity ($5,000, 80 TH/s, 8.00 CKI/day).
- [x] Boost capacity is 20% of active purchased TH/s; each activation lasts 120 seconds and is followed by a customer-specific 600-second cooldown beginning at expiry.
- [x] Manual and automatic CKI conversion remain internal: conversions debit CKI and credit the customer's selected main-wallet asset through the existing auditable ledger flow. No external payout is submitted.
- [x] Added migration `0045_cki_reward_schedule_activation.sql`; it publishes the six package schedules, enables formula accrual and package checkout, sets the boost cycle, and preserves prior non-null package snapshots and historic ledger entries. The migration is idempotent.
- [x] Updated `deployment/cpanel_merged.sql` for one-time import into a **new, empty** MySQL/MariaDB database through phpMyAdmin. No production database was accessed or changed by this work.

## Deployment / operational requirements

- [ ] Import the full SQL bundle only into a new, empty database; for an existing installation, take a backup and apply only pending forward migration `0045` (after confirming migrations `0036`–`0044` are present).
- [ ] Deploy and keep the Node application process running. The in-process reward worker resumes from its database checkpoint after restarts.
- [ ] Verify package rows, economics version, and a sample CKI ledger credit in the target production database after deployment. No real customer purchase or wallet credit was performed in this task.

## Unchanged scope

- Manual payout-ticket workflows and external transfers are not part of this update; the requested CKI conversion remains internal.
- Existing historic wallet and reward records were not edited or deleted. Existing active package snapshots with a `NULL` daily limit are populated from the supplied schedule by migration `0045`; non-null snapshots are preserved.

## Disclosures

- The configured reward is a platform-calculated package schedule, not mining-pool-measured output or a guaranteed return. CKI is not directly withdrawable; it may be converted internally under the configured swap terms.
- The $1.27-per-CKI internal reference is an administrator-configured conversion reference, not a market price.
