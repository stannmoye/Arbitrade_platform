#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALLER="$ROOT/installer/install.sh"
VPS_SETUP="$ROOT/installer/vps-setup.sh"

pass() {
  printf '[PASS] %s\n' "$1"
}

assert_contains() {
  local output="$1"
  local expected="$2"
  local description="$3"
  if [[ "$output" != *"$expected"* ]]; then
    printf '[FAIL] %s\nExpected output to contain: %s\nActual output:\n%s\n' "$description" "$expected" "$output" >&2
    exit 1
  fi
  pass "$description"
}

assert_file_contains() {
  local file="$1"
  local expected="$2"
  local description="$3"
  if ! grep -Fq -- "$expected" "$file"; then
    printf '[FAIL] %s\nExpected %s to contain: %s\n' "$description" "$file" "$expected" >&2
    exit 1
  fi
  pass "$description"
}

assert_file_not_contains() {
  local file="$1"
  local unexpected="$2"
  local description="$3"
  if grep -Fq -- "$unexpected" "$file"; then
    printf '[FAIL] %s\nUnexpected content in %s: %s\n' "$description" "$file" "$unexpected" >&2
    exit 1
  fi
  pass "$description"
}

assert_success() {
  local description="$1"
  shift
  local output
  if ! output="$(bash "$INSTALLER" "$@" 2>&1)"; then
    printf '[FAIL] %s\nUnexpected non-zero exit. Output:\n%s\n' "$description" "$output" >&2
    exit 1
  fi
  printf '%s\n' "$output"
}

assert_failure() {
  local description="$1"
  local expected="$2"
  shift 2
  local output
  if output="$(bash "$INSTALLER" "$@" 2>&1)"; then
    printf '[FAIL] %s\nExpected the installer to reject arguments, but it exited successfully.\nOutput:\n%s\n' "$description" "$output" >&2
    exit 1
  fi
  assert_contains "$output" "$expected" "$description"
}

help_output="$(assert_success "Installer help is available" --help)"
assert_contains "$help_output" "--fresh-install" "Help documents fresh installation"
assert_contains "$help_output" "--existing-database --confirm-existing-migrations" "Help documents guarded existing-database migration"

assert_failure "Missing installation mode is rejected" "An install mode is required."
assert_failure "Unknown options are rejected" "Unknown option: --definitely-not-an-installer-option" --definitely-not-an-installer-option
assert_failure "Conflicting installation modes are rejected" "Choose exactly one install mode." --fresh-install --existing-database
assert_failure "Fresh mode rejects existing-migration confirmation" "--confirm-existing-migrations is only valid with --existing-database." --fresh-install --confirm-existing-migrations
assert_failure "Existing mode requires explicit migration confirmation" "Existing-database mode requires --confirm-existing-migrations." --existing-database

# Runtime provisioning is an opt-in, system-changing operation. Keep the shell
# installer and VPS provisioner aligned on the supported Node.js source/version.
for file in "$INSTALLER" "$VPS_SETUP"; do
  assert_file_contains "$file" "https://deb.nodesource.com/node_22.x" "Runtime provisioning uses the NodeSource Node.js 22 repository ($(basename "$file"))"
  assert_file_contains "$file" "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" "Runtime provisioning installs the NodeSource signing key ($(basename "$file"))"
  assert_file_contains "$file" "apt-get install -y nodejs" "Runtime provisioning installs Node.js after configuring its repository ($(basename "$file"))"
  assert_file_not_contains "$file" "apt-get install -y ca-certificates curl nodejs npm" "Runtime provisioning does not rely on an unspecified distro Node.js package ($(basename "$file"))"
done

assert_file_contains "$INSTALLER" 'if [[ "$INSTALL_MISSING" == 1 && "${EUID}" == 0' "Shell installer only provisions runtime when explicitly requested by root"
assert_file_contains "$VPS_SETUP" 'if [[ "$INSTALL_RUNTIME" == 1 ]]; then' "VPS runtime provisioning requires the explicit --install-runtime option"
assert_file_contains "$VPS_SETUP" '[[ ! -e "$UNIT" ]] || fail' "VPS setup refuses to overwrite an existing systemd service"
assert_file_contains "$VPS_SETUP" '[[ ! -e "$NGINX" ]] || fail' "VPS setup refuses to overwrite an existing nginx site"

printf '\nInstaller CLI and runtime-provisioning regression checks passed. No database connection, package installation, or migration was attempted.\n'
