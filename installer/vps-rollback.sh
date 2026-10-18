cleanup_vps_setup() {
  local status=$?
  local requested_status="${1:-}"
  [[ -z "$requested_status" ]] || status="$requested_status"
  [[ -z "${ENV_TMP:-}" ]] || rm -f -- "$ENV_TMP"
  [[ -z "${UNIT_TMP:-}" ]] || rm -f -- "$UNIT_TMP"
  [[ -z "${NGINX_TMP:-}" ]] || rm -f -- "$NGINX_TMP"
  # Roll back only the exact inodes published by this attempt. A path may
  # have been replaced by an administrator or another process after publish.
  if [[ "$status" -ne 0 && "$HTTPS_ATTEMPTED" == 0 ]]; then
    # Do not disable a service if an administrator or another process replaced
    # the unit after this attempt published it. Roll back service state only
    # while the unit path still points to our exact published inode.
    if [[ "$SERVICE_ATTEMPTED" == 1 ]]; then
      if [[ "$UNIT_PUBLISHED" == 1 ]] && arbitrade_published_file_identity_matches "$UNIT" "$UNIT_PUBLISHED_ID"; then
        systemctl disable --now arbitrade.service >/dev/null 2>&1 || true
        systemctl daemon-reload >/dev/null 2>&1 || true
      else
        say "Service rollback skipped because the published unit identity could not be verified; inspect arbitrade.service manually."
      fi
    fi
    if [[ "$NGINX_ENABLED_PUBLISHED" == 1 && -n "$NGINX_ENABLED_PUBLISHED_ID" && -L "$NGINX_ENABLED" && "$(stat -c '%d:%i' -- "$NGINX_ENABLED" 2>/dev/null || true)" == "$NGINX_ENABLED_PUBLISHED_ID" ]]; then rm -f -- "$NGINX_ENABLED"; fi
    if [[ "$NGINX_PUBLISHED" == 1 && -n "$NGINX_PUBLISHED_ID" && ! -L "$NGINX" && -e "$NGINX" && "$(stat -c '%d:%i' -- "$NGINX" 2>/dev/null || true)" == "$NGINX_PUBLISHED_ID" ]]; then rm -f -- "$NGINX"; fi
    if [[ "$UNIT_PUBLISHED" == 1 && -n "$UNIT_PUBLISHED_ID" && ! -L "$UNIT" && -e "$UNIT" && "$(stat -c '%d:%i' -- "$UNIT" 2>/dev/null || true)" == "$UNIT_PUBLISHED_ID" ]]; then rm -f -- "$UNIT"; fi
    if [[ "$ENV_PUBLISHED" == 1 && -n "$ENV_PUBLISHED_ID" && ! -L "$ENV_FILE" && -e "$ENV_FILE" && "$(stat -c '%d:%i' -- "$ENV_FILE" 2>/dev/null || true)" == "$ENV_PUBLISHED_ID" ]]; then rm -f -- "$ENV_FILE"; fi
    if [[ "$ENV_PUBLISHED" == 1 || "$UNIT_PUBLISHED" == 1 || "$NGINX_PUBLISHED" == 1 || "$NGINX_ENABLED_PUBLISHED" == 1 ]]; then
      say "Provisioning failed; files created by this attempt were rolled back. Review the error above before retrying."
    fi
  elif [[ "$status" -ne 0 && "$HTTPS_ATTEMPTED" == 1 ]]; then
    say "HTTPS provisioning failed after Certbot may have changed nginx configuration. Existing service and nginx files were preserved; inspect systemctl status arbitrade.service, nginx -t, and Certbot output before retrying."
  fi
}
