# Sandbox backups

The private repository contains encrypted backups of the Sandbox's full MariaDB database and its runtime `.env` file. Both use GPG symmetric encryption (`AES256`); plaintext database rows and runtime secrets are not committed. The matching passphrase file is deliberately kept outside GitHub and must be stored separately.

## Captured snapshots

- Current database archive: `sandbox-db-20261015T055315Z.sql.gz.gpg`
- Current database captured: 2026-10-15 05:53:15 UTC
- Previous database archive: `sandbox-db-20261014T055749Z.sql.gz.gpg` (retained as a historical snapshot)
- Earlier database archive: `sandbox-db-20261014T050310Z.sql.gz.gpg` (retained as a historical snapshot)
- Previous database archive: `sandbox-db-20261013T195950Z.sql.gz.gpg` (retained as a historical snapshot)
- Runtime configuration archive: `sandbox-runtime-env-20261013T200228Z.env.gpg`
- Runtime configuration captured: 2026-10-13 20:02:28 UTC
- Database coverage: all application tables and their data at capture time
- Current database archive size: 32,490,112 bytes
- Current database archive SHA-256: `35a8c0e8d209275d3a3ccc78beef4a92796100d85ba50d5161d71e49b78f4004`
- Verification: the current archive decrypts and passes gzip integrity. Its captured database includes migration `0043_mining_engine_activity`, the activity table, and its persisted activity rows, as well as all other database tables/data. The encrypted `.env` was previously verified against the source file without displaying values.

**The decryption key is not stored in this repository.** Save the separately delivered key file outside GitHub (such as in a password manager). Without it, neither encrypted archive can be restored. Do not commit the key or decrypted `.env`.

## Create later backups

Load the DB connection for the database backup, and reuse the separately stored key:

```bash
set -a
. ./.env
set +a
scripts/backup-sandbox-db.sh backups/<snapshot>.sql.gz.gpg /path/to/secure-backup-key.txt
scripts/backup-sandbox-runtime.sh .env backups/<runtime-env-snapshot>.env.gpg /path/to/secure-backup-key.txt
```

The database script streams the dump through gzip and GPG, avoiding a plaintext SQL dump on disk. The runtime script verifies the encrypted copy against the source without printing the file contents.

## Restore

1. Obtain the encrypted file(s) and their matching passphrase file.
2. To restore runtime configuration into a new Sandbox, decrypt to `.env` **only in the intended private environment**, then restrict permissions:

   ```bash
   gpg --batch --pinentry-mode loopback --passphrase-file /path/to/secure-backup-key.txt \
     --decrypt --output .env backups/sandbox-runtime-env-20261013T200228Z.env.gpg
   chmod 600 .env
   ```

   Review and update any host-specific URLs or credentials before starting services.
3. Validate the DB archive:

   ```bash
   gpg --batch --pinentry-mode loopback --passphrase-file /path/to/secure-backup-key.txt \
     --decrypt backups/sandbox-db-20261015T055315Z.sql.gz.gpg | gzip -t
   ```
4. Restore the DB into the intended target using its connection settings. Review the destination first; importing into a non-empty database may replace objects or fail on existing tables:

   ```bash
   gpg --batch --pinentry-mode loopback --passphrase-file /path/to/secure-backup-key.txt \
     --decrypt backups/sandbox-db-20261015T055315Z.sql.gz.gpg | gzip -dc | mariadb --defaults-extra-file=/path/to/target-client.cnf <target_database>
   ```

`target-client.cnf` must be protected (mode `0600`) and contain the target database connection. Never use the old Sandbox database URL when restoring into a different environment. `node_modules/` and `dist/` are excluded generated artifacts; they can be recreated from the committed manifests and source.
