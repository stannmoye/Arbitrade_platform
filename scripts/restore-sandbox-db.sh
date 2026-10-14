#!/usr/bin/env bash
set -euo pipefail

# Restore an encrypted sandbox database snapshot into an empty MySQL/MariaDB database.
# Usage:
#   set -a; . ./.env; set +a
#   scripts/restore-sandbox-db.sh <input.sql.gz.gpg> <passphrase-file>
# Keep DATABASE_URL and the passphrase file private and outside GitHub.

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <input.sql.gz.gpg> <passphrase-file>" >&2
  exit 2
fi
: "${DATABASE_URL:?Set DATABASE_URL to the empty target database before restoring}"
backup=$1
key_file=$2
[[ -s "$backup" ]] || { echo "Encrypted backup is missing or empty." >&2; exit 2; }
[[ -s "$key_file" ]] || { echo "Passphrase file is missing or empty." >&2; exit 2; }
command -v node >/dev/null || { echo "Node.js is required." >&2; exit 2; }
command -v gpg >/dev/null || { echo "gpg is required." >&2; exit 2; }
command -v gzip >/dev/null || { echo "gzip is required." >&2; exit 2; }
client=$(command -v mariadb || command -v mysql || true)
[[ -n "$client" ]] || { echo "A MariaDB/MySQL client is required." >&2; exit 2; }

umask 077
workdir=$(mktemp -d "${TMPDIR:-/tmp}/arbitrade-db-restore.XXXXXX")
chmod 700 "$workdir"
cnf="$workdir/client.cnf"
dbfile="$workdir/database-name"
cleanup() { rm -rf -- "$workdir"; }
trap cleanup EXIT

# Parse DATABASE_URL without printing credentials; use a short-lived private client file.
node --input-type=module - "$cnf" "$dbfile" <<'NODE'
import fs from 'node:fs';
const [cnfPath, dbPath] = process.argv.slice(2);
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
fs.writeFileSync(cnfPath, contents, { mode: 0o600 });
fs.writeFileSync(dbPath, database, { mode: 0o600 });
NODE

database=$(cat "$dbfile")
rm -f -- "$dbfile"

table_count=$("$client" --defaults-extra-file="$cnf" --batch --skip-column-names --database="$database" \
  -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()")
[[ "$table_count" =~ ^[0-9]+$ ]] || { echo "Could not verify target database emptiness." >&2; exit 1; }
if (( table_count != 0 )); then
  echo "Target database must be empty; found $table_count existing tables/views. No import was performed." >&2
  exit 1
fi

# Validate GPG integrity and gzip contents before allowing SQL to reach the target.
echo "Verifying encrypted archive and compressed payload..."
gpg --batch --pinentry-mode loopback --passphrase-file "$key_file" --decrypt "$backup" 2>/dev/null | gzip -t

echo "Restoring into the empty target database..."
gpg --batch --pinentry-mode loopback --passphrase-file "$key_file" --decrypt "$backup" 2>/dev/null \
  | gzip -dc \
  | "$client" --defaults-extra-file="$cnf" --default-character-set=utf8mb4 "$database"

restored_tables=$("$client" --defaults-extra-file="$cnf" --batch --skip-column-names --database="$database" \
  -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()")
printf 'Restore complete: %s tables/views are present in the target database.\n' "$restored_tables"
