# Single canonical database file

This project uses one canonical database file in the private GitHub repository:

```text
database.sql
```

The file is tracked with Git LFS when its complete application state exceeds GitHub's normal 100 MB file limit. It remains one file named `database.sql` and is materialized by normal Git LFS-enabled clones.

It contains the application database state, including users, wallet balances, ledger history, mining packages, mining contracts, economics versions, admin settings, and other database-backed records.

## Save the current database to GitHub

From the repository root on the running server or sandbox:

```bash
set -a
. ./.env
set +a
pnpm db:backup:github
```

The command exports the current MySQL/MariaDB database directly to `database.sql`, commits that same file, and pushes it to the current GitHub branch. It does not create dated snapshot files or a second database file.

Run it after database changes such as creating mining packages, changing wallet balances, editing admin settings, provisioning accounts, or changing mining contracts. Before replacing a server or sandbox, run it and confirm that the push succeeds.

## Use the same database file on a new host

Clone the repository, create an empty MySQL/MariaDB database, configure `.env` with its `DATABASE_URL`, and run:

```bash
set -a
. ./.env
set +a
pnpm db:restore:github
pnpm db:migrate
pnpm db:portal-migrate
pnpm build
pnpm start
```

The restore command always reads the repository's one `database.sql` file and refuses to import into a non-empty database.

## Operating model

The SQL file is the source of truth in GitHub. A running application still needs MySQL/MariaDB to execute queries; each new host imports the same `database.sql` into its local database. When the live database changes, export it back into the same file and push it before moving hosts. Do not create dated restore-point files or alternate active database dumps.

Use the same `SESSION_SECRET` and `PASSWORD_PEPPER` when existing sessions, encrypted settings, or account behavior must remain compatible. Keep the repository private because `database.sql` contains application data and password hashes.
