#!/usr/bin/env bash
set -Eeuo pipefail

# Build a clean, root-level deployment ZIP for either supported target.
# Run from a complete Git checkout with Node.js 22 and pnpm 10.18.x installed.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TARGET="${1:-}"
case "$TARGET" in
  cpanel|vps) ;;
  *) echo "Usage: $0 {cpanel|vps}" >&2; exit 2 ;;
esac

command -v git >/dev/null 2>&1 || { echo "git is required." >&2; exit 2; }
command -v pnpm >/dev/null 2>&1 || { echo "pnpm is required." >&2; exit 2; }
command -v zip >/dev/null 2>&1 || { echo "zip is required." >&2; exit 2; }
git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "Run this script from a Git checkout; tracked source files are used to avoid packaging local secrets." >&2
  exit 2
}

cd "$ROOT"
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build

[[ -s "$ROOT/dist/index.js" ]] || { echo "Build did not produce dist/index.js." >&2; exit 1; }
[[ -s "$ROOT/dist/public/index.html" ]] || { echo "Build did not produce dist/public/index.html." >&2; exit 1; }

OUT="$ROOT/artifacts"
mkdir -p "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
STAGE="$TMP/package"
mkdir -p "$STAGE"

# Copy tracked project files, not the working tree. This excludes untracked local
# files and makes the archive reproducible from the checked-out commit.
while IFS= read -r -d '' path; do
  case "$path" in
    .env|.env.*|database.sql|*.zip|*.sql.gz|*.dump|*.bak|*.log|*.pem|*.key|*.p12|*.pfx|.git/*|*/.git/*|*/node_modules/*|node_modules/*|.pnpm-store/*|coverage/*|.manus-logs/*|logs/*|tmp/*|temp/*|artifacts/*)
      continue ;;
  esac
  # Never package installer-created credentials or state, even if accidentally tracked.
  case "$path" in
    installer/.installed|.configured|.installer-bootstrap.json|.installer-bootstrap.tmp.*|.env.installing.*|.admin-bootstrap.json|.sandbox-credentials)
      continue ;;
  esac
  mkdir -p "$STAGE/$(dirname "$path")"
  cp -p -- "$ROOT/$path" "$STAGE/$path"
done < <(git -C "$ROOT" ls-files -z)

# dist/ is intentionally gitignored; include only the verified production build.
mkdir -p "$STAGE/dist"
cp -a "$ROOT/dist/." "$STAGE/dist/"

# Explicitly assert critical root entries so we cannot accidentally ship a
# nested project ZIP or an archive whose application files are one directory down.
for required in package.json pnpm-lock.yaml dist/index.js dist/public/index.html installer; do
  [[ -e "$STAGE/$required" ]] || { echo "Missing required package entry: $required" >&2; exit 1; }
done
if find "$STAGE" -type f \( -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' -o -name '*.p12' -o -name '*.pfx' -o -name '*.zip' \) -print -quit | grep -q .; then
  echo "Refusing to package secrets or nested archives." >&2
  exit 1
fi

NAME="arbitrade-${TARGET}-fresh-install.zip"
rm -f -- "$OUT/$NAME"
(
  cd "$STAGE"
  zip -X -qr "$OUT/$NAME" .
)
# Validate CRC/integrity and verify entries are at archive root, not under a
# wrapper directory. Python is available in the supported build environment.
python3 - "$OUT/$NAME" <<'PY'
import sys, zipfile
archive = sys.argv[1]
with zipfile.ZipFile(archive) as z:
    bad = z.testzip()
    if bad:
        raise SystemExit(f"ZIP integrity check failed at: {bad}")
    names = set(z.namelist())
    required = {"package.json", "pnpm-lock.yaml", "dist/index.js", "dist/public/index.html"}
    missing = sorted(required - names)
    if missing:
        raise SystemExit("Missing root-level package entries: " + ", ".join(missing))
    if any(name.startswith("package/") for name in names):
        raise SystemExit("Unexpected wrapper directory in archive.")
    forbidden = [n for n in names if n == ".env" or n.startswith(".env.") or n.endswith(".pem") or n.endswith(".key") or n.endswith(".zip")]
    if forbidden:
        raise SystemExit("Forbidden archive entries: " + ", ".join(forbidden))
print(f"Validated {archive}: {len(names)} entries; CRC and root layout OK.")
PY

echo "Package ready: $OUT/$NAME"
echo "This creates a package only; it does not connect to a host or modify any database."
