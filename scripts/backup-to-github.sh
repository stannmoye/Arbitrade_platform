#!/usr/bin/env bash
set -euo pipefail

# Export the current application database into the private GitHub repository.
# The dump contains application records, including users, balances, ledgers,
# mining packages, contracts, and settings. Use this only with a private repo.
# Usage: set -a; . ./.env; set +a; scripts/backup-to-github.sh

: "${DATABASE_URL:?Set DATABASE_URL before running the backup}"
command -v git >/dev/null || { echo "git is required." >&2; exit 2; }
command -v gzip >/dev/null || { echo "gzip is required." >&2; exit 2; }
dumper=$(command -v mariadb-dump || command -v mysqldump || true)
[[ -n "$dumper" ]] || { echo "mariadb-dump or mysqldump is required." >&2; exit 2; }

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"
backup_dir="$repo_root/backups/live"
backup="$backup_dir/latest.sql.gz"
tmp_backup="$backup_dir/.latest.sql.gz.tmp"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
umask 077

cnf=$(mktemp "${TMPDIR:-/tmp}/arbitrade-db-client.XXXXXX.cnf")
cleanup() { rm -f -- "$cnf" "$tmp_backup"; }
trap cleanup EXIT

node --input-type=module - "$cnf" <<'NODE'
import fs from 'node:fs';
const out = process.argv[2];
const url = new URL(process.env.DATABASE_URL);
if (!['mysql:', 'mariadb:'].includes(url.protocol)) throw new Error('DATABASE_URL must use mysql:// or mariadb://');
const decode = value => decodeURIComponent(value || '');
const quote = value => '"' + String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n') + '"';
const database = decode(url.pathname.replace(/^\//, ''));
if (!database) throw new Error('DATABASE_URL does not specify a database name');
fs.writeFileSync(out, [
  '[client]',
  `host=${quote(url.hostname)}`,
  `port=${Number(url.port || 3306)}`,
  `user=${quote(decode(url.username))}`,
  `password=${quote(decode(url.password))}`,
  'protocol=tcp',
  '',
].join('\n'), { mode: 0o600 });
fs.writeFileSync(`${out}.dbname`, database, { mode: 0o600 });
NODE

database=$(cat "$cnf.dbname")
rm -f -- "$cnf.dbname"

echo "Exporting database '$database' to $backup ..."
"$dumper" \
  --defaults-extra-file="$cnf" \
  --single-transaction --quick --routines --triggers --events \
  --hex-blob --default-character-set=utf8mb4 --skip-comments \
  "$database" \
  | gzip -9 > "$tmp_backup"

gzip -t "$tmp_backup"
mv -f -- "$tmp_backup" "$backup"
sha256sum "$backup"

git add -- "$backup"
if git diff --cached --quiet -- "$backup"; then
  echo "No database changes detected; nothing to commit."
  exit 0
fi
commit_message="Persist database state $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git commit -m "$commit_message" -- "$backup"
git push origin HEAD
printf 'Database snapshot pushed to GitHub: %s\n' "$backup"
