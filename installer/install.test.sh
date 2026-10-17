#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALLER="$ROOT/installer/install.sh"

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

printf '\nInstaller CLI safety checks passed. No database connection or migration was attempted.\n'
