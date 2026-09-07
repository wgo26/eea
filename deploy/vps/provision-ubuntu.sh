#!/usr/bin/env bash
set -Eeuo pipefail

# Run once on a fresh Hostinger Ubuntu 24.04 VPS as root.
# Example:
#   SSH_PUBLIC_KEY='ssh-ed25519 AAAA... deploy-key' \
#   SSH_PORT=22 \
#   DOMAIN=eagleeyeafrica.org \
#   bash provision-ubuntu.sh

if [[ -z "${SSH_PUBLIC_KEY:-}" ]]; then
  echo "Set SSH_PUBLIC_KEY to the deployment user's public SSH key." >&2
  exit 1
fi
DEPLOY_USER="${DEPLOY_USER:-eea-deploy}"
DOMAIN="${DOMAIN:-eagleeyeafrica.org}"
SSH_PORT="${SSH_PORT:-22}"
APP_ROOT="${APP_ROOT:-/var/www/eea}"
TIMEZONE="${TIMEZONE:-Africa/Douala}"
NODE_MAJOR="22"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root on the VPS." >&2
  exit 1
fi

if [[ ! -f /etc/os-release ]] || ! grep -q '^ID=ubuntu' /etc/os-release; then
  echo "This script supports Ubuntu only." >&2
  exit 1
fi

if [[ "$SSH_PUBLIC_KEY" != ssh-* ]]; then
  echo "SSH_PUBLIC_KEY must be an OpenSSH public key." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get upgrade -y
apt-get install -y \
  ca-certificates \
  curl \
  git \
  nginx \
  certbot \
  python3-certbot-nginx \
  ufw \
  unattended-upgrades \
  logrotate \
  build-essential

# NodeSource provides the supported Node.js 22 LTS line.
curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -
apt-get install -y nodejs

if ! node --version | grep -q '^v22\.'; then
  echo "Installed Node.js is not version 22." >&2
  exit 1
fi

id -u "$DEPLOY_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$DEPLOY_USER"
usermod --append --groups www-data "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
printf '%s\n' "$SSH_PUBLIC_KEY" > "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

# Permit the deployment key before disabling password and root access.
ufw allow "$SSH_PORT/tcp" comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

install -d -m 755 -o "$DEPLOY_USER" -g www-data \
  "$APP_ROOT/releases" \
  "$APP_ROOT/current" \
  "$APP_ROOT/shared" \
  "$APP_ROOT/shared/logs"
install -d -m 750 -o "$DEPLOY_USER" -g www-data "$APP_ROOT/shared/.env"
touch "$APP_ROOT/shared/.env/production.env"
chown "$DEPLOY_USER:www-data" "$APP_ROOT/shared/.env/production.env"
chmod 640 "$APP_ROOT/shared/.env/production.env"

# Keep SSH available through the configured port, then disable weaker access.
sshd_config=/etc/ssh/sshd_config
sed -i -E 's/^#?PermitRootLogin .*/PermitRootLogin no/' "$sshd_config"
sed -i -E 's/^#?PasswordAuthentication .*/PasswordAuthentication no/' "$sshd_config"
sed -i -E 's/^#?KbdInteractiveAuthentication .*/KbdInteractiveAuthentication no/' "$sshd_config"
if ! grep -q '^AllowUsers ' "$sshd_config"; then
  printf '\nAllowUsers %s\n' "$DEPLOY_USER" >> "$sshd_config"
fi
sshd -t
systemctl reload ssh

# Use the application region's timezone for logs and scheduled maintenance.
timedatectl set-timezone "$TIMEZONE"

# Automatically install security updates without automatically rebooting the VPS.
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades

# Keep application logs bounded. Nginx has its own distro logrotate policy.
cat > /etc/logrotate.d/eea <<EOF
$APP_ROOT/shared/logs/*.log {
  daily
  rotate 14
  size 50M
  missingok
  notifempty
  compress
  delaycompress
  copytruncate
}
EOF

systemctl enable nginx
systemctl restart nginx

cat <<EOF
VPS preparation complete.

Deployment user: $DEPLOY_USER
Application root: $APP_ROOT
Domain: $DOMAIN
SSH port: $SSH_PORT
Timezone: $TIMEZONE
Node: $(node --version)

Next actions:
1. Test a new SSH session as $DEPLOY_USER before closing this session.
2. Point DNS A records for $DOMAIN and www.$DOMAIN to this VPS IP.
3. Copy production variables to $APP_ROOT/shared/.env/production.env.
4. Install the systemd unit and Nginx site template from deploy/vps/.
5. Run Certbot only after both DNS names resolve to this VPS.
EOF
