# Database source of truth

**The only canonical application database artifact is `database.sql` at the repository root.**

All database-backed application state belongs in that file: users, accounts, wallets, balances, ledger entries, mining packages, mining contracts, package versions, CKI economics, settings, KYC records, support records, reports, and application activity.

## Rules for every coding session

1. After cloning on a new host, install Git LFS and materialize the file:

   ```bash
   git lfs install
   git lfs pull --include="database.sql"
   ```

   Then read and use the repository-root `database.sql` when preparing the host or sandbox.
2. Do not create a second active database dump, dated restore point, or alternate database file.
> The historical command name `db:backup:github` is retained for compatibility, but this workflow does not create a backup or snapshot: it overwrites the one canonical root `database.sql`, commits it, and pushes that same file to GitHub.

3. Before moving hosts or finishing database changes, run:

   ```bash
   set -a
   . ./.env
   set +a
   pnpm db:backup:github
   ```

4. On a new empty MySQL/MariaDB database, run:

   ```bash
   set -a
   . ./.env
   set +a
   pnpm db:restore:github
   ```

   If application code is upgraded against an older database, align the mining tables before starting the reward worker:

   ```bash
   pnpm db:mining-schema
   ```

5. The repository is private and `database.sql` is stored with Git LFS because the complete application state can exceed GitHub’s normal 100 MB file limit. A normal Git LFS-enabled clone materializes the same `database.sql` file.
6. Do not overwrite the canonical file with a newly empty schema. Merge or restore the existing database state first.

`database.sql` is the persistent database handoff between sandboxes, servers, chats, and coding sessions. GitHub history may contain older commits, but only the current root `database.sql` is the active source of truth.

## Mining controls

The current schema stores the administrator-editable mining controls in `mining_economics_versions`, including boost cooldown, active duration, the one-time CKI activation bonus, and the prorated CKI-per-24-hours active boost reward. Package records store each package's name, price, duration, TH/s, boost capacity, and package daily CKI rate. Customer package rows snapshot those terms per customer, so package edits never change another customer's purchased capacity or rate.

When upgrading an older database, `pnpm db:mining-schema` also assigns a configured current package rate to legacy active contracts whose old snapshot was null. This is a one-time schema alignment, not a cross-customer balance merge.

## Global Hash Power and trading eligibility

- `mining_economics_versions.globalHashPowerThs` is the canonical, versioned administrator-controlled **Global Hash Power** readout shown to every customer.
- Customer-owned mining power remains account-specific and is calculated only from that customer's active purchased packages; a customer with no active package has Mining Status Inactive and earns no mining rewards.
- Trading is fail-closed: customers with no positive available balance in any wallet receive no opportunities and cannot create trades.
- The UI labels the engine state **Mining Status Active** or **Mining Status Inactive**. The bright green engine indicator flashes only while the customer has active mining power.

## Daily CKI reward settlement

- `mining_reward_events.tokenAmount` is the authoritative **CKI Credited Today** total and includes the prorated boost reward.
- The boost portion is stored in `mining_pending_boost_rewards` during the UTC day; it is not added to the customer's spendable/main CKI wallet immediately.
- The mining worker settles pending rows from prior UTC days exactly once into the customer's CKI wallet and writes a `mining_boost_daily_settlement` ledger entry.
- Automatic CKI conversion only uses the immediately wallet-creditable amount; pending boost earnings cannot be converted before daily settlement.
