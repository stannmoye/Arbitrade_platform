#!/usr/bin/env bash
set -euo pipefail

# Restore the database snapshot tracked in the private GitHub repository.
# The target database must already exist and must be empty.
# Usage: set -a; . ./.env; set +a; scripts/restore-from-github.sh

: "${DATABASE_URL:?Set DATABASE_URL to the empty target database before restoring}"
command -v gzip >/dev/null || { echo "gzip is required." >&2; exit 2; }
client=$(command -v mariadb || command -v mysql || true)
[[ -n "$client" ]] || { echo "mariadb or mysql client is required." >&2; exit 2; }

repo_root=$(git rev-parse --show-toplevel)
backup="$repo_root/backups/live/latest.sql.gz"
[[ -s "$backup" ]] || { echo "Tracked GitHub database snapshot is missing: $backup" >&2; exit 2; }

umask 077
workdir=$(mktemp -d "${TMPDIR:-/tmp}/arbitrade-db-restore.XXXXXX")
chmod 700 "$workdir"
cnf="$workdir/client.cnf"
dbfile="$workdir/database-name"
cleanup() { rm -rf -- "$workdir"; }
trap cleanup EXIT

node --input-type=module - "$cnf" "$dbfile" <<'NODE'
import fs from 'node:fs';
const [cnfPath, dbPath] = process.argv.slice(2);
const url = new URL(process.env.DATABASE_URL);
if (!['mysql:', 'mariadb:'].includes(url.protocol)) throw new Error('DATABASE_URL must use mysql:// or mariadb://');
const decode = value => decodeURIComponent(value || '');
const quote = value => '"' + String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n') + '"';
const database = decode(url.pathname.replace(/^\//, ''));
if (!database) throw new Error('DATABASE_URL does not specify a database name');
fs.writeFileSync(cnfPath, [
  '[client]',
  `host=${quote(url.hostname)}`,
  `port=${Number(url.port || 3306)}`,
  `user=${quote(decode(url.username))}`,
  `password=${quote(decode(url.password))}`,
  'protocol=tcp',
  '',
].join('\n'), { mode: 0o600 });
fs.writeFileSync(dbPath, database, { mode: 0o600 });
NODE

database=$(cat "$dbfile")
table_count=$("$client" --defaults-extra-file="$cnf" --batch --skip-column-names --database="$database" \
  -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()")
[[ "$table_count" =~ ^[0-9]+$ ]] || { echo "Could not inspect target database." >&2; exit 1; }
if (( table_count != 0 )); then
  echo "Refusing to restore: target database '$database' contains $table_count tables. Use an empty database." >&2
  exit 1
fi

echo "Restoring GitHub database snapshot into '$database' ..."
gzip -t "$backup"
gzip -dc "$backup" | "$client" --defaults-extra-file="$cnf" --default-character-set=utf8mb4 "$database"
restored_tables=$("$client" --defaults-extra-file="$cnf" --batch --skip-column-names --database="$database" \
  -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()")
printf 'Restore complete: %s tables/views are present.\n' "$restored_tables"
