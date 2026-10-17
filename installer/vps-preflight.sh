#!/usr/bin/env bash
# Shared path predicate for VPS preflight checks.
# -e follows symlinks and misses dangling links, so also check -L.
arbitrade_path_is_available() {
  local destination="${1:?destination path is required}"
  [[ ! -e "$destination" && ! -L "$destination" ]]
}
