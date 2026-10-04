#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_MISSING=0
for arg in "$@"; do
  case "$arg" in
    --install-missing) INSTALL_MISSING=1 ;;
    --help|-h) echo "Usage: ./installer/install.sh [--install-missing]"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done
say(){ printf '\n[arbitrade installer] %s\n' "$*"; }
missing=()
for bin in node pnpm mysql; do command -v "$bin" >/dev/null 2>&1 || missing+=("$bin"); done
if ((${#missing[@]})); then
  say "Missing dependencies: ${missing[*]}"
  if [[ "$INSTALL_MISSING" == 1 && "${EUID}" == 0 && -x "$(command -v apt-get || true)" ]]; then
    apt-get update
    apt-get install -y ca-certificates curl nodejs npm mysql-client
    corepack enable || true
    corepack prepare pnpm@10.18.0 --activate || npm install --global pnpm@10.18.0
  else
    say "Install Node.js 20+, pnpm 10.18, and a MySQL client, then rerun this script."
    exit 2
  fi
fi
[[ -f "$ROOT/.env" ]] || { say "Missing .env. Copy .env.example, fill production values, and protect it with chmod 600."; exit 2; }
cd "$ROOT"
say "Installing locked production dependencies"
pnpm install --frozen-lockfile
say "Applying checked-in database migrations"
pnpm db:migrate
say "Building production assets"
pnpm build
say "Installation complete. Provision an administrator privately with:"
say "ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='use-a-new-12-character-password' pnpm admin:create"
say "Start with: pnpm start"
