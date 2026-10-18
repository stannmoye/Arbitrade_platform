#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TMP_ROOT"' EXIT
MOCK_BIN="$TMP_ROOT/bin"
mkdir -p "$MOCK_BIN"
SYSTEMCTL_LOG="$TMP_ROOT/systemctl.log"
export SYSTEMCTL_LOG
cat > "$MOCK_BIN/systemctl" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$SYSTEMCTL_LOG"
MOCK
chmod +x "$MOCK_BIN/systemctl"
PATH="$MOCK_BIN:$PATH"
export PATH

say() { printf '[rollback-test] %s\n' "$*"; }
. "$ROOT/installer/vps-preflight.sh"
. "$ROOT/installer/vps-rollback.sh"

pass() { printf '[PASS] %s\n' "$1"; }
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

new_case() {
  CASE_DIR="$(mktemp -d "$TMP_ROOT/case.XXXXXX")"
  ENV_DIR="$CASE_DIR/env"
  mkdir -p "$ENV_DIR"
  ENV_FILE="$ENV_DIR/arbitrade.env"
  UNIT="$CASE_DIR/arbitrade.service"
  NGINX="$CASE_DIR/arbitrade-site"
  NGINX_ENABLED="$CASE_DIR/enabled-site"
  printf 'secret=fixture\n' > "$ENV_FILE"
  printf 'unit=fixture\n' > "$UNIT"
  printf 'nginx=fixture\n' > "$NGINX"
  ln -s "$NGINX" "$NGINX_ENABLED"
  ENV_TMP=""
  UNIT_TMP=""
  NGINX_TMP=""
  ENV_PUBLISHED=1
  UNIT_PUBLISHED=1
  NGINX_PUBLISHED=1
  NGINX_ENABLED_PUBLISHED=1
  ENV_PUBLISHED_ID="$(stat -c '%d:%i' -- "$ENV_FILE")"
  UNIT_PUBLISHED_ID="$(stat -c '%d:%i' -- "$UNIT")"
  NGINX_PUBLISHED_ID="$(stat -c '%d:%i' -- "$NGINX")"
  NGINX_ENABLED_PUBLISHED_ID="$(stat -c '%d:%i' -- "$NGINX_ENABLED")"
  SERVICE_ATTEMPTED=1
  HTTPS_ATTEMPTED=0
  : > "$SYSTEMCTL_LOG"
}

new_case
false || cleanup_vps_setup 1
[[ ! -e "$ENV_FILE" && ! -e "$UNIT" && ! -e "$NGINX" && ! -L "$NGINX_ENABLED" ]] || fail "owned files were not rolled back"
grep -Fq 'disable --now arbitrade.service' "$SYSTEMCTL_LOG" || fail "service rollback was not attempted for the original unit"
pass "pre-HTTPS failure rolls back owned files and service state"

new_case
printf 'replacement unit\n' > "$CASE_DIR/replacement"
mv -f -- "$CASE_DIR/replacement" "$UNIT"
false || cleanup_vps_setup 1
grep -Fq 'replacement unit' "$UNIT" || fail "replacement unit was deleted"
if grep -Fq 'disable --now arbitrade.service' "$SYSTEMCTL_LOG"; then fail "service was disabled after unit replacement"; fi
[[ ! -e "$ENV_FILE" && ! -e "$NGINX" && ! -L "$NGINX_ENABLED" ]] || fail "other owned files were not rolled back"
pass "unit replacement is preserved and service state is not changed"

# A failure before service activation (for example, nginx -t) must clean up
# this attempt's published files without emitting service rollback operations.
new_case
SERVICE_ATTEMPTED=0
false || cleanup_vps_setup 1
[[ ! -e "$ENV_FILE" && ! -e "$UNIT" && ! -e "$NGINX" && ! -L "$NGINX_ENABLED" ]] || fail "pre-activation failure left owned files behind"
[[ ! -s "$SYSTEMCTL_LOG" ]] || fail "service state was changed although activation was never attempted"
pass "pre-activation failure rolls back owned files without touching service state"

new_case
HTTPS_ATTEMPTED=1
false || cleanup_vps_setup 1
[[ -e "$ENV_FILE" && -e "$UNIT" && -e "$NGINX" && -L "$NGINX_ENABLED" ]] || fail "configuration was removed after HTTPS attempt"
[[ ! -s "$SYSTEMCTL_LOG" ]] || fail "service state changed after HTTPS attempt"
pass "HTTPS failure preserves published configuration for manual recovery"

printf '\nVPS rollback failure-path tests passed. Only temporary fixture files and mocked systemctl were used.\n'
