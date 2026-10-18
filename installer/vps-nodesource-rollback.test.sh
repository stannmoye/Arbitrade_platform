#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TMP_ROOT"' EXIT

# Redirect the fixed production destinations into a disposable fixture by
# substituting the path literals only in a local copy of the helper.
HELPER="$TMP_ROOT/vps-nodesource-rollback.sh"
sed \
  -e "s|/etc/apt/keyrings/nodesource.gpg|$TMP_ROOT/keyrings/nodesource.gpg|g" \
  -e "s|/etc/apt/sources.list.d/nodesource.list|$TMP_ROOT/sources.list.d/nodesource.list|g" \
  "$ROOT/installer/vps-nodesource-rollback.sh" > "$HELPER"
# The helper contains shell expansions with literal paths; only destination
# path strings are rewritten. Staged temporary files remain fixture-local.
. "$HELPER"
mkdir -p "$TMP_ROOT/keyrings" "$TMP_ROOT/sources.list.d"

new_case() {
  CASE_DIR="$(mktemp -d "$TMP_ROOT/case.XXXXXX")"
  NODE_KEY_TMP="$CASE_DIR/key.tmp"
  NODE_SOURCE_TMP="$CASE_DIR/source.tmp"
  printf 'key fixture\n' > "$NODE_KEY_TMP"
  printf 'source fixture\n' > "$NODE_SOURCE_TMP"
  NODE_KEY_ID="$(stat -c '%d:%i' -- "$NODE_KEY_TMP")"
  NODE_SOURCE_ID="$(stat -c '%d:%i' -- "$NODE_SOURCE_TMP")"
  NODE_RUNTIME_COMMITTED=0
  rm -f "$TMP_ROOT/keyrings/nodesource.gpg" "$TMP_ROOT/sources.list.d/nodesource.list"
}

new_case
ln -T -- "$NODE_KEY_TMP" "$TMP_ROOT/keyrings/nodesource.gpg"
ln -T -- "$NODE_SOURCE_TMP" "$TMP_ROOT/sources.list.d/nodesource.list"
cleanup_nodesource_runtime
[[ ! -e "$TMP_ROOT/keyrings/nodesource.gpg" && ! -e "$TMP_ROOT/sources.list.d/nodesource.list" ]] || { echo "FAIL: owned APT files were not removed" >&2; exit 1; }
[[ ! -e "$NODE_KEY_TMP" && ! -e "$NODE_SOURCE_TMP" ]] || { echo "FAIL: staging files were not removed" >&2; exit 1; }
printf '[PASS] failed setup removes only this attempt\047s NodeSource files\n'

new_case
ln -T -- "$NODE_KEY_TMP" "$TMP_ROOT/keyrings/nodesource.gpg"
ln -T -- "$NODE_SOURCE_TMP" "$TMP_ROOT/sources.list.d/nodesource.list"
printf 'administrator replacement\n' > "$CASE_DIR/replacement"
mv -f -- "$CASE_DIR/replacement" "$TMP_ROOT/keyrings/nodesource.gpg"
cleanup_nodesource_runtime
grep -Fq 'administrator replacement' "$TMP_ROOT/keyrings/nodesource.gpg" || { echo "FAIL: replacement key file was deleted" >&2; exit 1; }
[[ ! -e "$TMP_ROOT/sources.list.d/nodesource.list" ]] || { echo "FAIL: still-owned source file was not removed" >&2; exit 1; }
printf '[PASS] replacement APT file is preserved while still-owned file is removed\n'

new_case
ln -T -- "$NODE_KEY_TMP" "$TMP_ROOT/keyrings/nodesource.gpg"
ln -T -- "$NODE_SOURCE_TMP" "$TMP_ROOT/sources.list.d/nodesource.list"
NODE_RUNTIME_COMMITTED=1
cleanup_nodesource_runtime
[[ -e "$TMP_ROOT/keyrings/nodesource.gpg" && -e "$TMP_ROOT/sources.list.d/nodesource.list" ]] || { echo "FAIL: committed APT configuration was removed" >&2; exit 1; }
printf '[PASS] committed NodeSource configuration is preserved\n'
printf '\nNodeSource rollback tests passed using temporary fixtures only.\n'
