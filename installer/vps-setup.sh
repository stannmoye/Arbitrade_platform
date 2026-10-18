#!/usr/bin/env bash
set -Eeuo pipefail

# Safe VPS bootstrap for an already checked-out Arbitrade repository.
# This script never overwrites existing nginx or systemd configuration.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
DOMAIN=""
EMAIL=""
INSTALL_RUNTIME=0
ENABLE_HTTPS=0
for arg in "$@"; do
  case "$arg" in
    --domain=*) DOMAIN="${arg#*=}" ;;
    --email=*) EMAIL="${arg#*=}" ;;
    --install-runtime) INSTALL_RUNTIME=1 ;;
    --enable-https) ENABLE_HTTPS=1 ;;
    --help|-h)
      cat <<'HELP'
Usage: sudo bash installer/vps-setup.sh --domain=example.com [--email=admin@example.com] [--install-runtime] [--enable-https]
Requires an existing application checkout, .env, and built dist/index.js.
--install-runtime installs Node.js 22 and pnpm 10.18 on supported Debian/Ubuntu systems.
--enable-https requests a Let's Encrypt certificate after nginx is configured.
Existing nginx/systemd configuration is never overwritten.
HELP
      exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

say(){ printf '\n[arbitrade-vps] %s\n' "$*"; }
fail(){ say "ERROR: $*"; exit 1; }
# Share path-existence semantics with isolated regression tests.
. "$ROOT/installer/vps-preflight.sh"
[[ "${EUID}" -eq 0 ]] || fail "Run with sudo/root privileges."
[[ -f "$ROOT/package.json" && -f "$ROOT/pnpm-lock.yaml" ]] || fail "Run this script from a complete Arbitrade repository checkout."
arbitrade_root_path_is_allowed "$ROOT" || fail "Deploy the application under /var/www or another system path, not /root or /home; the systemd service uses ProtectHome=true."
[[ "$ROOT" =~ ^/[A-Za-z0-9_./-]+$ ]] || fail "The deployment path must contain only letters, numbers, dots, underscores, slashes, or hyphens so it can be represented safely in the systemd unit. Move the checkout to a simple path such as /var/www/arbitrade-platform."
[[ -f "$ROOT/.env" ]] || fail "Missing $ROOT/.env. Configure production secrets before provisioning."
[[ -f "$ROOT/dist/index.js" ]] || fail "Missing dist/index.js. Build the app with pnpm build before provisioning."
[[ "$DOMAIN" =~ ^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$ ]] || fail "Provide a valid --domain=example.com."
if [[ "$ENABLE_HTTPS" == 1 && ! "$EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
  fail "--enable-https requires a valid --email= address for Let's Encrypt."
fi
if [[ ! -r "$ROOT/dist/index.js" || ! -x "$(dirname "$ROOT")" ]]; then
  fail "Application path is not traversable/readable. Deploy under /var/www (not /root) and check directory permissions."
fi

. /etc/os-release
case "${ID:-}" in ubuntu|debian) ;; *) fail "Only Debian/Ubuntu are supported by this script; detected ${ID:-unknown}." ;; esac

# Check every destination collision before installing packages, creating users,
# copying secrets, or writing any service/proxy configuration. This keeps a
# rerun from leaving a half-provisioned host when a later path already exists.
UNIT="/etc/systemd/system/arbitrade.service"
NGINX="/etc/nginx/sites-available/arbitrade-$DOMAIN"
NGINX_ENABLED="/etc/nginx/sites-enabled/arbitrade-$DOMAIN"
ENV_DIR="/etc/arbitrade"
ENV_FILE="$ENV_DIR/arbitrade.env"
arbitrade_directory_is_safe "$ENV_DIR" || fail "$ENV_DIR must be a real directory, not a symlink or non-directory path."
if [[ -e "$ENV_DIR" ]]; then
  env_dir_metadata="$(stat -c '%U:%G:%a' -- "$ENV_DIR")"
  [[ "$env_dir_metadata" == "root:$APP_USER:750" ]] || fail "$ENV_DIR already exists with unexpected ownership or permissions ($env_dir_metadata). Expected root:$APP_USER:750; review it manually instead of changing existing directory metadata."
fi
arbitrade_path_is_available "$UNIT" || fail "$UNIT already exists. Review it manually; this script will not overwrite it."
arbitrade_path_is_available "$NGINX" || fail "$NGINX already exists. Review it manually; this script will not overwrite it."
arbitrade_path_is_available "$NGINX_ENABLED" || fail "The nginx enabled-site path already exists. Review it manually; this script will not overwrite it."
arbitrade_path_is_available "$ENV_FILE" || fail "$ENV_FILE already exists. Review it manually; this script will not overwrite existing environment secrets."

if [[ "$INSTALL_RUNTIME" == 1 ]]; then
  say "Installing OS prerequisites and Node.js 22"
  apt-get update
  apt-get install -y ca-certificates curl gnupg nginx
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  chmod 0644 /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
  corepack enable
  corepack prepare pnpm@10.18.0 --activate
else
  command -v node >/dev/null 2>&1 || fail "Node.js is missing. Rerun with --install-runtime or install Node.js 20+ first."
  command -v pnpm >/dev/null 2>&1 || command -v corepack >/dev/null 2>&1 || fail "pnpm/Corepack is missing. Install pnpm 10.18.0."
fi
node -e 'if(Number(process.versions.node.split(".")[0])<20) process.exit(1)' || fail "Node.js 20+ is required."
if ! command -v nginx >/dev/null 2>&1; then
  say "Installing nginx reverse proxy prerequisite"
  apt-get update
  apt-get install -y nginx
fi
PNPM="$(command -v pnpm || true)"
if [[ -z "$PNPM" ]]; then PNPM="$(command -v corepack)"; PNPM_ARGS=(pnpm); else PNPM_ARGS=(); fi
"$PNPM" "${PNPM_ARGS[@]}" --version | grep -q '^10\.18\.' || fail "pnpm 10.18.x is required."

APP_USER="arbitrade"
# The systemd unit explicitly uses Group=arbitrade. Ensure that group exists
# even on hosts with a pre-existing service account created without a matching group.
if ! getent group "$APP_USER" >/dev/null 2>&1; then
  groupadd --system "$APP_USER"
fi
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --gid "$APP_USER" --home-dir "$ROOT" --no-create-home --shell /usr/sbin/nologin "$APP_USER"
fi
# Ensure the service user can read the application without taking ownership of source files.
runuser -u "$APP_USER" -- test -r "$ROOT/dist/index.js" || fail "The arbitrade service user cannot read dist/index.js. Use a readable deployment path and grant directory traversal/read access."

say "Preparing protected runtime environment"
# Do not change ownership or permissions on a pre-existing protected directory.
# Only create it with the intended owner/mode when this installer owns its creation.
if [[ ! -e "$ENV_DIR" ]]; then
  install -d -o root -g "$APP_USER" -m 0750 "$ENV_DIR"
fi
# Track only destinations created by this invocation so a failed
# provisioning attempt can remove its own partial files without touching
# pre-existing host configuration.
ENV_TMP=""
UNIT_TMP=""
NGINX_TMP=""
ENV_PUBLISHED=0
UNIT_PUBLISHED=0
NGINX_PUBLISHED=0
NGINX_ENABLED_PUBLISHED=0
SERVICE_ATTEMPTED=0
HTTPS_ATTEMPTED=0
cleanup_vps_setup() {
  local status=$?
  [[ -z "${ENV_TMP:-}" ]] || rm -f -- "$ENV_TMP"
  [[ -z "${UNIT_TMP:-}" ]] || rm -f -- "$UNIT_TMP"
  [[ -z "${NGINX_TMP:-}" ]] || rm -f -- "$NGINX_TMP"
  if [[ "$status" -ne 0 && "$HTTPS_ATTEMPTED" == 0 ]]; then
    if [[ "$SERVICE_ATTEMPTED" == 1 ]]; then
      systemctl disable --now arbitrade.service >/dev/null 2>&1 || true
      systemctl daemon-reload >/dev/null 2>&1 || true
    fi
    if [[ "$NGINX_ENABLED_PUBLISHED" == 1 ]]; then rm -f -- "$NGINX_ENABLED"; fi
    if [[ "$NGINX_PUBLISHED" == 1 ]]; then rm -f -- "$NGINX"; fi
    if [[ "$UNIT_PUBLISHED" == 1 ]]; then rm -f -- "$UNIT"; fi
    if [[ "$ENV_PUBLISHED" == 1 ]]; then rm -f -- "$ENV_FILE"; fi
    if [[ "$ENV_PUBLISHED" == 1 || "$UNIT_PUBLISHED" == 1 || "$NGINX_PUBLISHED" == 1 || "$NGINX_ENABLED_PUBLISHED" == 1 ]]; then
      say "Provisioning failed; files created by this attempt were rolled back. Review the error above before retrying."
    fi
  elif [[ "$status" -ne 0 && "$HTTPS_ATTEMPTED" == 1 ]]; then
    say "HTTPS provisioning failed after Certbot may have changed nginx configuration. Existing service and nginx files were preserved; inspect systemctl status arbitrade.service, nginx -t, and Certbot output before retrying."
  fi
}
trap cleanup_vps_setup EXIT

# Build the secret file privately in the same directory, then publish it with
# an atomic hard-link operation. Unlike install/cp to ENV_FILE, ln refuses to
# replace a destination that appeared after the preflight check.
ENV_TMP="$(mktemp "$ENV_DIR/.arbitrade.env.XXXXXX")"
install -o root -g "$APP_USER" -m 0640 "$ROOT/.env" "$ENV_TMP"
if grep -q '^PORT=' "$ENV_TMP"; then
  sed -i 's/^PORT=.*/PORT=3000/' "$ENV_TMP"
else
  printf '\nPORT=3000\n' >> "$ENV_TMP"
fi
chown root:"$APP_USER" "$ENV_TMP"
chmod 0640 "$ENV_TMP"
if ! ln -T -- "$ENV_TMP" "$ENV_FILE"; then
  fail "$ENV_FILE appeared during provisioning. Existing environment secrets were not overwritten; inspect the path and rerun only after review."
fi
ENV_PUBLISHED=1
rm -f -- "$ENV_TMP"
ENV_TMP=""

UNIT_TMP="$(mktemp /etc/systemd/system/.arbitrade.service.XXXXXX)"
cat > "$UNIT_TMP" <<UNITFILE
[Unit]
Description=Arbitrade Node.js application
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$ROOT
EnvironmentFile=/etc/arbitrade/arbitrade.env
ExecStart=/usr/bin/node $ROOT/dist/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadOnlyPaths=$ROOT
UMask=0077

[Install]
WantedBy=multi-user.target
UNITFILE
chmod 0644 "$UNIT_TMP"
if ! ln -T -- "$UNIT_TMP" "$UNIT"; then
  fail "$UNIT appeared during provisioning. Existing service configuration was not overwritten; inspect the path and rerun only after review."
fi
UNIT_PUBLISHED=1
rm -f -- "$UNIT_TMP"
UNIT_TMP=""

NGINX_TMP="$(mktemp "/etc/nginx/sites-available/.arbitrade-$DOMAIN.XXXXXX")"
cat > "$NGINX_TMP" <<NGINXFILE
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}
NGINXFILE
chmod 0644 "$NGINX_TMP"
if ! ln -T -- "$NGINX_TMP" "$NGINX"; then
  fail "$NGINX appeared during provisioning. Existing nginx configuration was not overwritten; inspect the path and rerun only after review."
fi
NGINX_PUBLISHED=1
rm -f -- "$NGINX_TMP"
NGINX_TMP=""

if ! ln -s "$NGINX" "$NGINX_ENABLED"; then
  fail "$NGINX_ENABLED appeared during provisioning. Existing enabled-site configuration was not overwritten; inspect the path and rerun only after review."
fi
NGINX_ENABLED_PUBLISHED=1
nginx -t
systemctl daemon-reload
SERVICE_ATTEMPTED=1
systemctl enable --now arbitrade.service
systemctl reload nginx

if [[ "$ENABLE_HTTPS" == 1 ]]; then
  HTTPS_ATTEMPTED=1
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx --non-interactive --agree-tos --email "$EMAIL" -d "$DOMAIN" --redirect
fi

say "VPS service configured. Check: systemctl status arbitrade.service"
say "Health check: curl -fsS http://127.0.0.1:3000/api/health"
if [[ "$ENABLE_HTTPS" == 1 ]]; then
  say "Public health check: https://$DOMAIN/api/health"
else
  say "HTTPS was not requested. Configure DNS and rerun with --enable-https --email=admin@example.com when the domain points to this VPS."
fi
say "Cron jobs are not auto-created: review docs/deployment-v5.md and configure only the authenticated scheduled tasks required by this release."
