#!/usr/bin/env bash
# Remove only NodeSource repository files created by the current VPS setup
# attempt. Inode identity checks prevent cleanup from deleting replacements.
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
