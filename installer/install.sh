#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
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
    # Refuse to replace host-managed APT configuration, including dangling symlinks.
    . "$ROOT/installer/vps-preflight.sh"
    arbitrade_directory_is_safe "/etc/apt/keyrings" || fail "/etc/apt/keyrings must be a real directory, not a symlink or non-directory path."
    arbitrade_path_is_available "/etc/apt/keyrings/nodesource.gpg" || fail "NodeSource signing key already exists; refusing to overwrite it."
    arbitrade_path_is_available "/etc/apt/sources.list.d/nodesource.list" || fail "NodeSource apt source already exists; refusing to overwrite it."

    say "Installing Node.js 22 from the NodeSource APT repository"
    apt-get update
    apt-get install -y ca-certificates curl gnupg
    if [[ ! -e /etc/apt/keyrings ]]; then install -d -m 0755 /etc/apt/keyrings; fi
    NODE_KEY_TMP="$(mktemp /etc/apt/keyrings/.nodesource.gpg.XXXXXX)"
    NODE_SOURCE_TMP="$(mktemp /etc/apt/sources.list.d/.nodesource.list.XXXXXX)"
    NODE_KEY_ID=""
    NODE_SOURCE_ID=""
    NODE_RUNTIME_COMMITTED=0
    cleanup_nodesource_runtime() {
      [[ -z "${NODE_KEY_TMP:-}" ]] || rm -f -- "$NODE_KEY_TMP"
      [[ -z "${NODE_SOURCE_TMP:-}" ]] || rm -f -- "$NODE_SOURCE_TMP"
      if [[ "${NODE_RUNTIME_COMMITTED:-0}" != 1 ]]; then
        if [[ -n "${NODE_KEY_ID:-}" && -e /etc/apt/keyrings/nodesource.gpg && ! -L /etc/apt/keyrings/nodesource.gpg && "$(stat -c '%d:%i' -- /etc/apt/keyrings/nodesource.gpg)" == "$NODE_KEY_ID" ]]; then
          rm -f -- /etc/apt/keyrings/nodesource.gpg
        fi
        if [[ -n "${NODE_SOURCE_ID:-}" && -e /etc/apt/sources.list.d/nodesource.list && ! -L /etc/apt/sources.list.d/nodesource.list && "$(stat -c '%d:%i' -- /etc/apt/sources.list.d/nodesource.list)" == "$NODE_SOURCE_ID" ]]; then
          rm -f -- /etc/apt/sources.list.d/nodesource.list
        fi
      fi
    }
    trap cleanup_nodesource_runtime EXIT
    if ! curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor > "$NODE_KEY_TMP"; then
      fail "Could not download or decode the NodeSource signing key."
    fi
    chmod 0644 "$NODE_KEY_TMP"
    printf '%s\\n' "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > "$NODE_SOURCE_TMP"
    chmod 0644 "$NODE_SOURCE_TMP"
    NODE_KEY_ID="$(stat -c '%d:%i' -- "$NODE_KEY_TMP")"
    NODE_SOURCE_ID="$(stat -c '%d:%i' -- "$NODE_SOURCE_TMP")"
    ln -T -- "$NODE_KEY_TMP" /etc/apt/keyrings/nodesource.gpg || fail "NodeSource signing key destination appeared during provisioning; existing files were not overwritten."
    ln -T -- "$NODE_SOURCE_TMP" /etc/apt/sources.list.d/nodesource.list || fail "NodeSource apt source destination appeared during provisioning; existing files were not overwritten."
    apt-get update
    apt-get install -y nodejs
    corepack enable
    corepack prepare pnpm@10.18.0 --activate || npm install --global pnpm@10.18.0
    NODE_RUNTIME_COMMITTED=1
    trap - EXIT
    rm -f -- "$NODE_KEY_TMP" "$NODE_SOURCE_TMP"
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
