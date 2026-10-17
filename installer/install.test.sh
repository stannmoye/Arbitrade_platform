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
assert_file_contains "$VPS_SETUP" 'arbitrade_path_is_available "$UNIT" || fail' "VPS setup refuses to overwrite an existing systemd service or dangling symlink"
assert_file_contains "$VPS_SETUP" 'arbitrade_path_is_available "$NGINX" || fail' "VPS setup refuses to overwrite an existing nginx site or dangling symlink"
assert_file_contains "$VPS_SETUP" 'arbitrade_path_is_available "$NGINX_ENABLED" || fail' "VPS setup refuses to overwrite an enabled-site path or dangling symlink"
assert_file_contains "$VPS_SETUP" 'arbitrade_path_is_available "$ENV_FILE" || fail' "VPS setup refuses to overwrite existing protected environment secrets"
assert_file_contains "$VPS_SETUP" 'arbitrade_directory_is_safe "$ENV_DIR" || fail' "VPS setup refuses symlinked or non-directory environment parent paths"

# Exercise the same path predicate used by VPS provisioning using temporary
# filesystem entries. These tests need neither root nor host configuration.
source "$ROOT/installer/vps-preflight.sh"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
arbitrade_path_is_available "$tmpdir/absent" || { printf '[FAIL] Missing path should be available.\\n' >&2; exit 1; }
pass "Preflight permits a nonexistent destination"
touch "$tmpdir/regular-file"
if arbitrade_path_is_available "$tmpdir/regular-file"; then
  printf '[FAIL] Existing file should be a collision.\\n' >&2; exit 1
fi
pass "Preflight rejects an existing regular file"
mkdir "$tmpdir/directory"
if arbitrade_path_is_available "$tmpdir/directory"; then
  printf '[FAIL] Existing directory should be a collision.\\n' >&2; exit 1
fi
pass "Preflight rejects an existing directory"
ln -s "$tmpdir/missing-target" "$tmpdir/dangling-link"
[[ ! -e "$tmpdir/dangling-link" && -L "$tmpdir/dangling-link" ]] || { printf '[FAIL] Test setup failed to create dangling symlink.\\n' >&2; exit 1; }
if arbitrade_path_is_available "$tmpdir/dangling-link"; then
  printf '[FAIL] Dangling symlink should be a collision.\\n' >&2; exit 1
fi
pass "Preflight rejects a dangling symbolic link"

arbitrade_directory_is_safe "$tmpdir/new-directory" || { printf '[FAIL] Missing environment directory should be safe.\\n' >&2; exit 1; }
pass "Directory preflight permits a nonexistent directory"
mkdir "$tmpdir/real-directory"
arbitrade_directory_is_safe "$tmpdir/real-directory" || { printf '[FAIL] Existing real directory should be safe.\\n' >&2; exit 1; }
pass "Directory preflight permits an existing real directory"
if arbitrade_directory_is_safe "$tmpdir/regular-file"; then
  printf '[FAIL] File used as directory should be rejected.\\n' >&2; exit 1
fi
pass "Directory preflight rejects a regular file"
ln -s "$tmpdir/real-directory" "$tmpdir/directory-link"
if arbitrade_directory_is_safe "$tmpdir/directory-link"; then
  printf '[FAIL] Symlinked environment directory should be rejected.\\n' >&2; exit 1
fi
pass "Directory preflight rejects a symlinked directory"

# Ensure all destination guards run before package installation, user creation,
# or writing the protected environment, so a rejected rerun cannot half-configure a host.
line_of() { grep -nF -- "$1" "$VPS_SETUP" | head -n 1 | cut -d: -f1; }
runtime_line="$(line_of 'if [[ "$INSTALL_RUNTIME" == 1 ]]; then')"
user_line="$(line_of 'useradd --system')"
env_write_line="$(line_of 'install -d -o root -g "$APP_USER" -m 0750 /etc/arbitrade')"
unit_guard_line="$(line_of 'arbitrade_path_is_available "$UNIT" || fail')"
nginx_guard_line="$(line_of 'arbitrade_path_is_available "$NGINX" || fail')"
enabled_guard_line="$(line_of 'arbitrade_path_is_available "$NGINX_ENABLED" || fail')"
env_dir_guard_line="$(line_of 'arbitrade_directory_is_safe "$ENV_DIR" || fail')"
env_guard_line="$(line_of 'arbitrade_path_is_available "$ENV_FILE" || fail')"
for guard_line in "$unit_guard_line" "$nginx_guard_line" "$enabled_guard_line" "$env_dir_guard_line" "$env_guard_line"; do
  [[ -n "$guard_line" && "$guard_line" -lt "$runtime_line" && "$guard_line" -lt "$user_line" && "$guard_line" -lt "$env_write_line" ]] || {
    printf '[FAIL] VPS destination guards must run before package installation, user creation, and secret/config writes.\n' >&2
    exit 1
  }
done
pass "VPS destination collisions are checked before system-changing operations"

printf '\nInstaller CLI and runtime-provisioning regression checks passed. No database connection, package installation, or migration was attempted.\n'
