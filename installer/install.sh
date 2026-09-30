#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_MISSING=0
SEED=0
for arg in "$@"; do case "$arg" in --install-missing) INSTALL_MISSING=1;; --seed-demo) SEED=1;; --help|-h) echo "Usage: ./installer/install.sh [--install-missing] [--seed-demo]"; exit 0;; esac; done
say(){ printf '\n[arbitrade installer] %s\n' "$*"; }
missing=()
for bin in node pnpm php mysql; do command -v "$bin" >/dev/null 2>&1 || missing+=("$bin"); done
if ((${#missing[@]})); then
  say "Missing dependencies: ${missing[*]}"
  if [[ "$INSTALL_MISSING" == 1 ]]; then
    if [[ "${EUID}" != 0 || ! -x "$(command -v apt-get || true)" ]]; then
      say "Automatic installation requires a Debian/Ubuntu host and root privileges. Install manually, then rerun this script."
      exit 2
    fi
    apt-get update
    apt-get install -y ca-certificates curl nodejs npm php-cli php-mysql mysql-client
    corepack enable || true
    corepack prepare pnpm@10.18.0 --activate || npm install --global pnpm@10.18.0
  else
    say "Re-run with --install-missing on a Debian/Ubuntu VPS, or install them manually: Node.js 22+, pnpm 10.18, PHP CLI + PDO MySQL, and MySQL client."
    exit 2
  fi
fi
[[ -f "$ROOT/.env" ]] || { say "Missing .env. Run the visual installer at /installer/index.php or copy .env.example and fill it securely."; exit 2; }
cd "$ROOT"
say "Installing locked application dependencies"
pnpm install --frozen-lockfile
say "Applying checked-in database migrations"
pnpm db:migrate
if [[ "$SEED" == 1 ]]; then
  [[ -f "$ROOT/installer/demo.sql" ]] || { say "Demo SQL not found"; exit 2; }
  : "${DATABASE_URL:?DATABASE_URL must be present in .env}"
  python3 - "$DATABASE_URL" "$ROOT/installer/demo.sql" <<'PY'
import sys, urllib.parse, subprocess
u=urllib.parse.urlparse(sys.argv[1]); sql=open(sys.argv[2]).read()
if u.scheme not in ('mysql','mysql2'): raise SystemExit('DATABASE_URL must be a MySQL URL')
password=urllib.parse.unquote(u.password or '')
cmd=['mysql','--protocol=TCP','-h',u.hostname or '127.0.0.1','-P',str(u.port or 3306),'-u',urllib.parse.unquote(u.username or ''),u.path.lstrip('/')]
subprocess.run(cmd,input=sql,text=True,env={**__import__('os').environ,'MYSQL_PWD':password},check=True)
PY
  say "Demo users imported. Remove demo access before any public deployment."
fi
say "Installer checks complete. Start with: pnpm build && pnpm start"
