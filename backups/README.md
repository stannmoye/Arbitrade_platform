# Sandbox backups

The private repository contains encrypted backups of the Sandbox's full MariaDB database and its runtime `.env` file. Both use GPG symmetric encryption (`AES256`); plaintext database rows and runtime secrets are not committed. The matching passphrase file is deliberately kept outside GitHub and must be stored separately.

## Captured snapshots

- Current database archive: `sandbox-db-20261014T050310Z.sql.gz.gpg`
- Current database captured: 2026-10-14 05:03:10 UTC
- Previous database archive: `sandbox-db-20261013T195950Z.sql.gz.gpg` (retained as a historical snapshot)
- Runtime configuration archive: `sandbox-runtime-env-20261013T200228Z.env.gpg`
- Runtime configuration captured: 2026-10-13 20:02:28 UTC
- Database coverage: all 103 InnoDB tables and their data
- Current database archive size: 24,976,402 bytes
- Current database archive SHA-256: `c6f3455cdd7e85be67cb0881edbb78d383552e4a573ffd1698d7e4876d023b84`
- Verification: the current archive decrypts and passes gzip integrity; its SQL stream contains 103 table definitions and 180 insert statements, including the independent package-purchase setting and migration marker. The encrypted `.env` was previously verified against the source file without displaying values.

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
     --decrypt backups/sandbox-db-20261014T050310Z.sql.gz.gpg | gzip -t
   ```
4. Restore the DB into the intended target using its connection settings. Review the destination first; importing into a non-empty database may replace objects or fail on existing tables:

   ```bash
   gpg --batch --pinentry-mode loopback --passphrase-file /path/to/secure-backup-key.txt \
     --decrypt backups/sandbox-db-20261014T050310Z.sql.gz.gpg | gzip -dc | mariadb --defaults-extra-file=/path/to/target-client.cnf <target_database>
   ```

`target-client.cnf` must be protected (mode `0600`) and contain the target database connection. Never use the old Sandbox database URL when restoring into a different environment. `node_modules/` and `dist/` are excluded generated artifacts; they can be recreated from the committed manifests and source.
