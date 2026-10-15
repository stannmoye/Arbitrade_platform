# Database source of truth

**The only canonical application database artifact is `database.sql` at the repository root.**

All database-backed application state belongs in that file: users, accounts, wallets, balances, ledger entries, mining packages, mining contracts, package versions, CKI economics, settings, KYC records, support records, reports, and application activity.

## Rules for every coding session

1. Read and use the repository-root `database.sql` when preparing a new host or sandbox.
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

5. The repository is private and `database.sql` is stored with Git LFS because the complete application state can exceed GitHub’s normal 100 MB file limit. A normal Git LFS-enabled clone materializes the same `database.sql` file.
6. Do not overwrite the canonical file with a newly empty schema. Merge or restore the existing database state first.

`database.sql` is the persistent database handoff between sandboxes, servers, chats, and coding sessions. GitHub history may contain older commits, but only the current root `database.sql` is the active source of truth.
