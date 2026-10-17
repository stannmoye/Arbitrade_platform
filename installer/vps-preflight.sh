#!/usr/bin/env bash
# Shared path predicate for VPS preflight checks.
# -e follows symlinks and misses dangling links, so also check -L.
arbitrade_path_is_available() {
  local destination="${1:?destination path is required}"
  [[ ! -e "$destination" && ! -L "$destination" ]]
}

# Accept an absent directory or a real directory, but never follow a symlink
# for the directory that will contain private environment secrets.
arbitrade_directory_is_safe() {
  local destination="${1:?destination path is required}"
  [[ ! -L "$destination" && ( ! -e "$destination" || -d "$destination" ) ]]
}
