# Sandbox database backups

Database snapshots committed in this directory are **GPG symmetric-encrypted** (`AES256`) gzip-compressed MariaDB dumps. They contain complete table schemas and data, including account and wallet records; do not treat the encrypted files as public artifacts. The matching passphrase is deliberately kept outside GitHub.

## Snapshot saved

- File: `sandbox-db-20261013T195950Z.sql.gz.gpg`
- Captured: 2026-10-13 19:59:50 UTC
- Database: 103 InnoDB tables
- Encrypted size: 18,970,456 bytes
- SHA-256: `3a50eafdb8d34130959d2a603d47d882918bc9519741d606792da73e2442bdc9`
- Verification: GPG decryption and gzip integrity passed; decrypted SQL contains 103 table definitions and data insert statements.

The decryption key file was delivered separately and is not committed. Save it outside GitHub (for example, in a password manager); without it the encrypted snapshot cannot be restored.

## Create a later snapshot

From the project root, load the current database connection and passphrase file, then run:

```bash
set -a
. ./.env
set +a
scripts/backup-sandbox-db.sh backups/<snapshot>.sql.gz.gpg /path/to/secure-backup-key.txt
```

Keep the passphrase file outside the repository and in a secure password manager or other separate backup location. Never commit it alongside the encrypted snapshot. The script streams the dump through gzip and GPG, avoiding a plaintext SQL file on disk.

## Restore a snapshot

1. Obtain the encrypted snapshot and the matching passphrase file.
2. Decrypt and validate the gzip stream:

   ```bash
   gpg --batch --pinentry-mode loopback --passphrase-file /path/to/secure-backup-key.txt \
     --decrypt backups/<snapshot>.sql.gz.gpg | gzip -t
   ```

3. Restore into the intended database using the target environment's connection settings. Review the destination carefully first; importing into a non-empty database may replace objects or fail on existing tables. The dump is for database schema and rows, not the application's `.env`, uploads, external object-storage files, or production secrets.

   ```bash
   gpg --batch --pinentry-mode loopback --passphrase-file /path/to/secure-backup-key.txt \
     --decrypt backups/<snapshot>.sql.gz.gpg | gzip -dc | mariadb --defaults-extra-file=/path/to/target-client.cnf <target_database>
   ```

The `target-client.cnf` file must be protected (mode `0600`) and contain the target database connection. Do not use the Sandbox database URL when restoring to a different environment.
