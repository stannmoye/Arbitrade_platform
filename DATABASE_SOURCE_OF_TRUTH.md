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
