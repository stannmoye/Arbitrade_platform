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
assert_file_contains "$VPS_SETUP" 'if [[ ! -e "$ENV_DIR" ]]; then' "VPS setup creates the protected environment directory only when absent"
assert_file_not_contains "$VPS_SETUP" 'install -d -o root -g "$APP_USER" -m 0750 "$ENV_DIR"\n# Track only destinations' "VPS setup does not silently reset metadata on a pre-existing protected environment directory"
assert_file_contains "$VPS_SETUP" 'ENV_TMP="$(mktemp "$ENV_DIR/.arbitrade.env.XXXXXX")"' "VPS setup prepares a private temporary environment file"
assert_file_contains "$VPS_SETUP" 'if ! ln -T -- "$ENV_TMP" "$ENV_FILE"; then' "VPS setup publishes the environment file without replacing a raced destination or writing into a raced directory"
assert_file_contains "$VPS_SETUP" 'Existing environment secrets were not overwritten' "VPS setup gives a safe diagnostic when the environment destination appears during provisioning"
assert_file_contains "$VPS_SETUP" 'chmod 0640 "$ENV_TMP"' "VPS setup keeps temporary environment secrets owner-only/service-group readable"
assert_file_contains "$VPS_SETUP" 'UNIT_TMP="$(mktemp /etc/systemd/system/.arbitrade.service.XXXXXX)"' "VPS setup builds the systemd unit in a temporary file"
assert_file_contains "$VPS_SETUP" 'if ! ln -T -- "$UNIT_TMP" "$UNIT"; then' "VPS setup refuses to overwrite a service unit that appears during provisioning or write inside a raced directory"
assert_file_contains "$VPS_SETUP" 'NGINX_TMP="$(mktemp "/etc/nginx/sites-available/.arbitrade-$DOMAIN.XXXXXX")"' "VPS setup builds nginx configuration in a temporary file"
assert_file_contains "$VPS_SETUP" 'if ! ln -T -- "$NGINX_TMP" "$NGINX"; then' "VPS setup refuses to overwrite nginx configuration that appears during provisioning or write inside a raced directory"
assert_file_contains "$VPS_SETUP" 'if ! ln -s "$NGINX" "$NGINX_ENABLED"; then' "VPS setup refuses to overwrite an enabled-site path that appears during provisioning"
assert_file_contains "$VPS_SETUP" 'trap cleanup_vps_setup EXIT' "VPS setup registers failure cleanup"
assert_file_contains "$VPS_SETUP" '[[ -z "${ENV_TMP:-}" ]] || rm -f -- "$ENV_TMP"' "VPS cleanup safely skips an unset environment temporary path"
assert_file_contains "$VPS_SETUP" '[[ -z "${UNIT_TMP:-}" ]] || rm -f -- "$UNIT_TMP"' "VPS cleanup safely skips an unset systemd temporary path"
assert_file_contains "$VPS_SETUP" '[[ -z "${NGINX_TMP:-}" ]] || rm -f -- "$NGINX_TMP"' "VPS cleanup safely skips an unset nginx temporary path"
assert_file_contains "$VPS_SETUP" 'if [[ "$status" -ne 0 && "$HTTPS_ATTEMPTED" == 0 ]]; then' "VPS setup rolls back its own partial files on pre-HTTPS failures"
assert_file_contains "$VPS_SETUP" 'elif [[ "$status" -ne 0 && "$HTTPS_ATTEMPTED" == 1 ]]; then' "VPS setup reports manual recovery steps when HTTPS provisioning fails after Certbot may have changed nginx configuration"
assert_file_contains "$VPS_SETUP" 'inspect systemctl status arbitrade.service, nginx -t, and Certbot output before retrying.' "VPS setup provides safe diagnostics without deleting potentially Certbot-modified configuration"
assert_file_contains "$VPS_SETUP" 'if [[ "$ENV_PUBLISHED" == 1 ]]; then rm -f -- "$ENV_FILE"; fi' "VPS setup rolls back only an environment file published by this attempt"
assert_file_contains "$VPS_SETUP" 'if [[ "$UNIT_PUBLISHED" == 1 ]]; then rm -f -- "$UNIT"; fi' "VPS setup rolls back only a systemd unit published by this attempt"
assert_file_contains "$VPS_SETUP" 'if [[ "$NGINX_PUBLISHED" == 1 ]]; then rm -f -- "$NGINX"; fi' "VPS setup rolls back only an nginx site published by this attempt"
assert_file_contains "$VPS_SETUP" 'if [[ "$NGINX_ENABLED_PUBLISHED" == 1 ]]; then rm -f -- "$NGINX_ENABLED"; fi' "VPS setup rolls back only an enabled-site link published by this attempt"
assert_file_contains "$VPS_SETUP" 'SERVICE_ATTEMPTED=1' "VPS setup tracks whether service activation needs cleanup after failure"
assert_file_contains "$VPS_SETUP" 'HTTPS_ATTEMPTED=1' "VPS setup avoids deleting nginx configuration after certbot may have modified it"
assert_file_contains "$VPS_SETUP" 'arbitrade_directory_is_safe "$ENV_DIR" || fail' "VPS setup refuses symlinked or non-directory environment parent paths"
assert_file_contains "$VPS_SETUP" '[[ "$ROOT" =~ ^/[A-Za-z0-9_./-]+$ ]] || fail' "VPS setup rejects paths that cannot be represented safely in systemd configuration"
assert_file_contains "$VPS_SETUP" 'arbitrade_root_path_is_allowed "$ROOT" || fail' "VPS setup uses the tested deployment root path predicate"
assert_file_contains "$VPS_SETUP" '&& pwd -P)' "VPS setup resolves symlinked checkout paths before applying ProtectHome path restrictions"
assert_file_contains "$INSTALLER" '&& pwd -P)' "Shell installer resolves symlinked checkout paths before applying filesystem guards"
assert_file_contains "$VPS_SETUP" 'getent group "$APP_USER"' "VPS setup verifies the service group exists before writing the systemd unit"
assert_file_contains "$VPS_SETUP" 'useradd --system --gid "$APP_USER"' "VPS setup creates the service user with its explicit matching group"

# Exercise the same path predicate used by VPS provisioning using temporary
# filesystem entries. These tests need neither root nor host configuration.
source "$ROOT/installer/vps-preflight.sh"
# ProtectHome=true makes both /root and /home roots unsuitable for the service.
arbitrade_root_path_is_allowed "/var/www/arbitrade" || { printf '[FAIL] Standard deployment path should be allowed.\\n' >&2; exit 1; }
arbitrade_root_path_is_allowed "/rooted/arbitrade" || { printf '[FAIL] Similar prefix /rooted should not be rejected.\\n' >&2; exit 1; }
if arbitrade_root_path_is_allowed "/root"; then printf '[FAIL] /root must be rejected.\\n' >&2; exit 1; fi
if arbitrade_root_path_is_allowed "/root/arbitrade"; then printf '[FAIL] Paths under /root must be rejected.\\n' >&2; exit 1; fi
if arbitrade_root_path_is_allowed "/home"; then printf '[FAIL] /home itself must be rejected.\\n' >&2; exit 1; fi
if arbitrade_root_path_is_allowed "/home/deploy/arbitrade"; then printf '[FAIL] Paths under /home must be rejected.\\n' >&2; exit 1; fi
pass "Deployment root path guard rejects protected homes without overmatching similar prefixes"
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
printf 'safe payload\\n' > "$tmpdir/payload"
if ln -T -- "$tmpdir/payload" "$tmpdir/directory" 2>/dev/null; then
  printf '[FAIL] Atomic publication must reject a destination that is a directory.\\n' >&2
  exit 1
fi
[[ -z "$(find "$tmpdir/directory" -mindepth 1 -maxdepth 1 -print -quit)" ]] || { printf '[FAIL] Publication unexpectedly wrote inside the destination directory.\\n' >&2; exit 1; }
pass "Atomic no-clobber publication refuses directories instead of writing inside them"
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
env_write_line="$(line_of 'install -d -o root -g "$APP_USER" -m 0750 "$ENV_DIR"')"
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

# Validate user-supplied domain and HTTPS contact information before any
# system-changing operation can run, including optional runtime installation.
domain_line="$(line_of '[[ "$DOMAIN" =~ ^([A-Za-z0-9]')"
https_email_line="$(line_of 'if [[ "$ENABLE_HTTPS" == 1 && ! "$EMAIL" =~')"
runtime_line="$(line_of 'if [[ "$INSTALL_RUNTIME" == 1 ]]; then')"
group_line="$(line_of 'groupadd --system "$APP_USER"')"
[[ -n "$domain_line" && "$domain_line" -lt "$runtime_line" && "$domain_line" -lt "$group_line" ]] || {
  printf '[FAIL] Domain validation must precede runtime installation and account creation.\\n' >&2
  exit 1
}
[[ -n "$https_email_line" && "$https_email_line" -lt "$runtime_line" && "$https_email_line" -lt "$group_line" ]] || {
  printf '[FAIL] HTTPS email validation must precede runtime installation and account creation.\\n' >&2
  exit 1
}
pass "VPS domain and HTTPS contact inputs are validated before system-changing operations"

printf '\nInstaller CLI and runtime-provisioning regression checks passed. No database connection, package installation, or migration was attempted.\n'
