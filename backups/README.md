# Database backup

## Retained snapshot

- File: `sandbox-db-20261015T055439Z.sql.gz.gpg`
- Captured: 2026-10-15 05:54:39 UTC
- Coverage: all application tables and their data at capture time (104 tables)
- Encrypted size: 32,491,209 bytes
- SHA-256: `27760496d521bbfaf2b634172b2fc258003d395d0f638542e45d5450b6dc6629`
- Format: GPG symmetric encryption (AES256) of a gzip-compressed SQL dump

This is a point-in-time **sandbox** backup, not a live or automatically refreshed production database. It contains account records, wallet/ledger data, mining records, and admin settings from the capture time. Do not import it into a database that contains tables: the dump drops and recreates its tables. It does not create or select a database; select the intended empty database first.

The application does not read this archive at runtime. It connects to the database named in its private `DATABASE_URL`. To move the app to cPanel, create the MySQL/MariaDB database and user, import the selected SQL snapshot into that database, then configure the Node.js app's environment and `DATABASE_URL` accordingly.

## Decrypt for cPanel import

Keep the passphrase file outside GitHub and protect it. On a trusted private machine, decrypt and decompress the archive directly to a protected SQL file:

```sh
umask 077
gpg --batch --pinentry-mode loopback --passphrase-file /path/to/secure-backup-key.txt \
  --decrypt backups/sandbox-db-20261015T055439Z.sql.gz.gpg \
  | gzip -dc > /path/to/private/arbitrade_snapshot.sql
chmod 600 /path/to/private/arbitrade_snapshot.sql
```

The plain SQL dump contains the snapshot's captured data. Do not commit or place it in a public web root. Import it only after confirming the destination database is empty. For a large dump, use the cPanel terminal if available:

```sh
mysql -h localhost -u CPANEL_DB_USER -p CPANEL_DB_NAME < /path/to/private/arbitrade_snapshot.sql
```

The program prompts for the database user's password; do not put the password in shell history. If importing through phpMyAdmin, its upload limit may be smaller than the uncompressed dump.

## Runtime secrets and account continuity

The database dump does not contain `.env`. Configure `SESSION_SECRET`, `PASSWORD_PEPPER`, host URLs, and provider credentials separately in cPanel's private Node.js environment. Retain the original `SESSION_SECRET` when database-backed SMTP credentials or queued email payloads encrypted with it must remain readable. Do not commit runtime secrets, the decryption key, or a plaintext dump.

## Backup policy

Only the newest encrypted database snapshot is retained in the current repository tree. Historical encrypted snapshots and the encrypted runtime-environment archive were removed from the current tree by request; they may still exist in earlier Git commits and are not erased by removing their current file paths. Keep an independent, protected backup outside GitHub before any production cutover or data-changing migration. Test restores against an empty disposable database before relying on a backup.
