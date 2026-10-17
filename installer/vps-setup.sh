#!/usr/bin/env bash
set -Eeuo pipefail

# Safe VPS bootstrap for an already checked-out Arbitrade repository.
# This script never overwrites existing nginx or systemd configuration.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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
[[ "${EUID}" -eq 0 ]] || fail "Run with sudo/root privileges."
[[ -f "$ROOT/package.json" && -f "$ROOT/pnpm-lock.yaml" ]] || fail "Run this script from a complete Arbitrade repository checkout."
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
PNPM="$(command -v pnpm || true)"
if [[ -z "$PNPM" ]]; then PNPM="$(command -v corepack)"; PNPM_ARGS=(pnpm); else PNPM_ARGS=(); fi
"$PNPM" "${PNPM_ARGS[@]}" --version | grep -q '^10\.18\.' || fail "pnpm 10.18.x is required."

APP_USER="arbitrade"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$ROOT" --no-create-home --shell /usr/sbin/nologin "$APP_USER"
fi
# Ensure the service user can read the application without taking ownership of source files.
runuser -u "$APP_USER" -- test -r "$ROOT/dist/index.js" || fail "The arbitrade service user cannot read dist/index.js. Use a readable deployment path and grant directory traversal/read access."
runuser -u "$APP_USER" -- test -r "$ROOT/.env" || true

say "Preparing protected runtime environment"
install -d -o root -g "$APP_USER" -m 0750 /etc/arbitrade
install -o root -g "$APP_USER" -m 0640 "$ROOT/.env" /etc/arbitrade/arbitrade.env
if grep -q '^PORT=' /etc/arbitrade/arbitrade.env; then
  sed -i 's/^PORT=.*/PORT=3000/' /etc/arbitrade/arbitrade.env
else
  printf '\nPORT=3000\n' >> /etc/arbitrade/arbitrade.env
fi

UNIT="/etc/systemd/system/arbitrade.service"
[[ ! -e "$UNIT" ]] || fail "$UNIT already exists. Review it manually; this script will not overwrite it."
cat > "$UNIT" <<UNITFILE
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
chmod 0644 "$UNIT"

NGINX="/etc/nginx/sites-available/arbitrade-$DOMAIN"
[[ ! -e "$NGINX" ]] || fail "$NGINX already exists. Review it manually; this script will not overwrite it."
cat > "$NGINX" <<NGINXFILE
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
ln -s "$NGINX" "/etc/nginx/sites-enabled/arbitrade-$DOMAIN"
nginx -t
systemctl daemon-reload
systemctl enable --now arbitrade.service
systemctl reload nginx

if [[ "$ENABLE_HTTPS" == 1 ]]; then
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
