#!/usr/bin/env bash
set -euo pipefail

# Create an encrypted, transaction-consistent MariaDB/MySQL backup.
# Usage:
#   DATABASE_URL=... scripts/backup-sandbox-db.sh <output.sql.gz.gpg> <passphrase-file>
# The passphrase file must be kept outside the repository and protected.

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <output.sql.gz.gpg> <passphrase-file>" >&2
  exit 2
fi
: "${DATABASE_URL:?Set DATABASE_URL before running this script}"
out=$1
key_file=$2
[[ -s "$key_file" ]] || { echo "Passphrase file is missing or empty." >&2; exit 2; }
command -v mariadb-dump >/dev/null || { echo "mariadb-dump is required." >&2; exit 2; }
command -v gzip >/dev/null || { echo "gzip is required." >&2; exit 2; }
command -v gpg >/dev/null || { echo "gpg is required." >&2; exit 2; }

umask 077
mkdir -p "$(dirname "$out")"
cnf=$(mktemp "${TMPDIR:-/tmp}/arbitrade-db-client.XXXXXX.cnf")
chmod 600 "$cnf"
cleanup() { rm -f "$cnf" "$cnf.dbname"; }
trap cleanup EXIT

# Parse the DB URL without printing credentials; write a short-lived client file.
node --input-type=module - "$cnf" <<'NODE'
import fs from 'node:fs';
const out = process.argv[2];
const url = new URL(process.env.DATABASE_URL);
if (!['mysql:', 'mariadb:'].includes(url.protocol)) throw new Error('DATABASE_URL must use mysql:// or mariadb://');
const decode = value => decodeURIComponent(value || '');
const quote = value => '"' + String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n') + '"';
const database = decode(url.pathname.replace(/^\//, ''));
if (!database) throw new Error('DATABASE_URL does not specify a database name');
const contents = [
  '[client]',
  `host=${quote(url.hostname)}`,
  `port=${Number(url.port || 3306)}`,
  `user=${quote(decode(url.username))}`,
  `password=${quote(decode(url.password))}`,
  'protocol=tcp',
  ''
].join('\n');
fs.writeFileSync(out, contents, { mode: 0o600 });
fs.writeFileSync(out + '.dbname', database, { mode: 0o600 });
NODE
database=$(cat "$cnf.dbname")
rm -f "$cnf.dbname"

# InnoDB's single-transaction snapshot avoids locking tables and does not
# materialize a plaintext SQL dump on disk.
set -o pipefail
mariadb-dump \
  --defaults-extra-file="$cnf" \
  --single-transaction --quick --routines --triggers --events \
  --hex-blob --default-character-set=utf8mb4 --skip-comments \
  "$database" \
  | gzip -9 \
  | gpg --batch --yes --pinentry-mode loopback \
      --passphrase-file "$key_file" --symmetric --cipher-algo AES256 \
      --s2k-digest-algo SHA512 --output "$out"

# Verify that the encrypted stream decrypts and the gzip payload is intact.
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$key_file" \
  --decrypt "$out" 2>/dev/null | gzip -t
printf 'Encrypted backup written: %s (%s bytes)\n' "$out" "$(stat -c %s "$out")"
sha256sum "$out"
