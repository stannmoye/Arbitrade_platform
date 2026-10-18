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
# The service uses ProtectHome=true, so deployments under /root or /home are
# unsuitable. Match path components rather than the broader "/root*" prefix.
arbitrade_root_path_is_allowed() {
  local root="${1:?deployment root is required}"
  [[ "$root" != "/root" && "$root" != /root/* && "$root" != "/home" && "$root" != /home/* ]]
}

# Match a file only when it is still the same regular filesystem object
# recorded by the publishing process. Refuse symlinks and missing paths.
arbitrade_published_file_identity_matches() {
  local path="${1:?published path is required}"
  local expected_identity="${2:?published identity is required}"
  [[ -n "$expected_identity" && ! -L "$path" && -f "$path" ]] || return 1
  [[ "$(stat -c '%d:%i' -- "$path" 2>/dev/null || true)" == "$expected_identity" ]]
}
