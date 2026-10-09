# Sandbox-local database

The sandbox development workspace uses a local MySQL 8 database named `arbitrade`. The app connects through a private, ignored `.env` file; do not commit `.env`, database passwords, session secrets, or account passwords.

## Initialize or refresh the schema

From the repository root, load the private `.env` values into the shell and sync the current Drizzle schema:

```sh
set -a
. ./.env
set +a
pnpm exec drizzle-kit push --force
```

This setup uses a sandbox-only database. The exported SQL snapshot is the portable backup; the source migrations and schema definitions are under `drizzle/`.

This snapshot follows the current `main` branch. The separate `feature/kyc-v2` branch has additional KYC code/schema that has not been integrated into this sandbox build.

## Test accounts and portals

The sandbox snapshot contains the two explicitly provisioned portal test accounts. Their password hashes are in the database; plaintext passwords are not stored in this document or the SQL export. Use the test credentials supplied for the sandbox by the project owner.

The portal routes are `/customer` and `/ops-console-7f3a`. Local development runs on port `3000`; the public sandbox URL is temporary and is not a production deployment.

## Scope and safety

This database is isolated from production. Demo activity written to it does not update production data. Treat the SQL export as test data because it contains account records and hashed credentials. Never use this snapshot to overwrite a production database.
