#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_MISSING=0
MODE=""
CONFIRM_EXISTING=0

usage() {
  cat <<'HELP'
Usage:
  ./installer/install.sh --fresh-install [--install-missing]
  ./installer/install.sh --existing-database --confirm-existing-migrations [--install-missing]

Options:
  --fresh-install                  Install into a database verified empty by the protected wizard.
  --existing-database              Apply forward migrations to an imported existing database.
  --confirm-existing-migrations    Explicit confirmation for existing-database migrations.
  --install-missing                Install Node.js 22 and pnpm 10.18.x on Debian/Ubuntu as root.
  --help, -h                       Show this help.

Run the protected installer wizard first. The canonical Node installer verifies the
saved database inventory, environment, lock state, migrations, build, and (for a
fresh install) administrator creation. Existing-database mode requires a restorable
backup and explicit confirmation. Do not use --install-missing on cPanel/shared hosting.
HELP
}

say() { printf '\n[arbitrade installer] %s\n' "$*"; }
fail() { say "ERROR: $*"; exit 2; }

for arg in "$@"; do
  case "$arg" in
    --fresh-install)
      [[ -z "$MODE" ]] || fail "Choose exactly one install mode."
      MODE="fresh"
      ;;
    --existing-database)
      [[ -z "$MODE" ]] || fail "Choose exactly one install mode."
      MODE="existing"
      ;;
    --confirm-existing-migrations) CONFIRM_EXISTING=1 ;;
    --install-missing) INSTALL_MISSING=1 ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown option: $arg" ;;
  esac
done

[[ -n "$MODE" ]] || { usage >&2; fail "An install mode is required."; }
if [[ "$MODE" == "fresh" && "$CONFIRM_EXISTING" == 1 ]]; then
  fail "--confirm-existing-migrations is only valid with --existing-database."
fi
if [[ "$MODE" == "existing" && "$CONFIRM_EXISTING" != 1 ]]; then
  fail "Existing-database mode requires --confirm-existing-migrations."
fi
[[ -f "$ROOT/package.json" && -f "$ROOT/pnpm-lock.yaml" ]] || fail "Run this script from a complete Arbitrade repository checkout."

missing=()
for bin in node pnpm; do command -v "$bin" >/dev/null 2>&1 || missing+=("$bin"); done
if (("${#missing[@]}")); then
  say "Missing dependencies: ${missing[*]}"
  if [[ "$INSTALL_MISSING" == 1 && "${EUID}" == 0 && -x "$(command -v apt-get || true)" ]]; then
    . /etc/os-release
    case "${ID:-}" in ubuntu|debian) ;; *) fail "--install-missing supports Debian/Ubuntu only." ;; esac
    say "Installing Node.js 22 from the NodeSource APT repository"
    apt-get update
    apt-get install -y ca-certificates curl gnupg
    install -d -m 0755 /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
    chmod 0644 /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update
    apt-get install -y nodejs
    corepack enable
    corepack prepare pnpm@10.18.0 --activate || npm install --global pnpm@10.18.0
  else
    fail "Install Node.js 20+ and pnpm 10.18.x, or use --install-missing on a supported Debian/Ubuntu root shell."
  fi
fi

node -e 'if (Number(process.versions.node.split(".")[0]) < 20) process.exit(1)' || fail "Node.js 20+ is required."
pnpm --version | grep -Eq '^10\.18\.' || fail "pnpm 10.18.x is required."
[[ -f "$ROOT/.env" ]] || fail "Missing private .env. Complete the protected installer wizard first."
[[ -f "$ROOT/.installer-bootstrap.json" ]] || fail "Missing private bootstrap state. Reopen the protected installer wizard and verify the database."

cd "$ROOT"
say "Delegating to the canonical staged installer; database safety checks remain enabled."
if [[ "$MODE" == "fresh" ]]; then
  exec env NODE_ENV=production node "$ROOT/installer/run-install.mjs" --fresh-install
else
  exec env NODE_ENV=production node "$ROOT/installer/run-install.mjs" --existing-database --confirm-existing-migrations
fi
