#!/usr/bin/env bash
set -euo pipefail

# Export the current application database into the single canonical database.sql
# file in the private GitHub repository.
# Usage: set -a; . ./.env; set +a; scripts/backup-to-github.sh

: "${DATABASE_URL:?Set DATABASE_URL before running the database export}"
command -v git >/dev/null || { echo "git is required." >&2; exit 2; }
dumper=$(command -v mariadb-dump || command -v mysqldump || true)
[[ -n "$dumper" ]] || { echo "mariadb-dump or mysqldump is required." >&2; exit 2; }

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"
database_file="$repo_root/database.sql"
tmp_file="$repo_root/.database.sql.tmp"
umask 077

cnf=$(mktemp "${TMPDIR:-/tmp}/arbitrade-db-client.XXXXXX.cnf")
cleanup() { rm -f -- "$cnf" "$cnf.dbname" "$tmp_file"; }
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

echo "Exporting database '$database' to the canonical $database_file ..."
"$dumper" \
  --defaults-extra-file="$cnf" \
  --single-transaction --quick --routines --triggers --events \
  --no-tablespaces \
  --hex-blob --default-character-set=utf8mb4 --skip-comments \
  "$database" > "$tmp_file"

# Verify that the export is non-empty and contains SQL before replacing the file.
test -s "$tmp_file"
grep -qE '^(CREATE|INSERT|DROP|SET|USE|DELIMITER|--)' "$tmp_file" || {
  echo "The generated database.sql does not look like a SQL dump; refusing to replace it." >&2
  exit 1
}
mv -f -- "$tmp_file" "$database_file"
sha256sum "$database_file"

git add -- "$database_file"
if git diff --cached --quiet -- "$database_file"; then
  echo "No database changes detected; nothing to commit."
  exit 0
fi
commit_message="Update canonical database state $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git commit -m "$commit_message" -- "$database_file"
git push origin HEAD
printf 'Canonical database.sql pushed to GitHub: %s\n' "$database_file"
