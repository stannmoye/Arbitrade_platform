#!/usr/bin/env bash
set -euo pipefail

# Encrypt a sensitive runtime file for backup; keep the key outside the repo.
# Usage: scripts/backup-sandbox-runtime.sh <source-file> <output.gpg> <passphrase-file>
if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <source-file> <output.gpg> <passphrase-file>" >&2
  exit 2
fi
source_file=$1
out=$2
key_file=$3
[[ -f "$source_file" ]] || { echo "Source file does not exist." >&2; exit 2; }
[[ -s "$key_file" ]] || { echo "Passphrase file is missing or empty." >&2; exit 2; }
command -v gpg >/dev/null || { echo "gpg is required." >&2; exit 2; }
umask 077
mkdir -p "$(dirname "$out")"
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$key_file" \
  --symmetric --cipher-algo AES256 --s2k-digest-algo SHA512 --output "$out" "$source_file"
source_sha=$(sha256sum "$source_file" | awk '{print $1}')
restored_sha=$(gpg --batch --yes --pinentry-mode loopback --passphrase-file "$key_file" \
  --decrypt "$out" 2>/dev/null | sha256sum | awk '{print $1}')
test "$source_sha" = "$restored_sha" || { echo "Encrypted-file verification failed." >&2; exit 1; }
printf 'Encrypted runtime file written: %s (%s bytes)\n' "$out" "$(stat -c %s "$out")"
sha256sum "$out"
