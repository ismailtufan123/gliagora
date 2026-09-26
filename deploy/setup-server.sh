#!/usr/bin/env bash
# One-time setup of the Gliagora production server: Ubuntu 24.04 LTS (PLAN §11, §18.2).
# Safe to run again; every step checks what is already there.
#
# What it does:
#   1. Installs updates and turns on automatic security updates (unattended-upgrades).
#   2. Creates a non-root admin user who logs in with an SSH key and uses sudo.
#   3. Turns off SSH login for root and SSH login with passwords.
#   4. Firewall (ufw): only SSH (22), HTTP (80) and HTTPS (443, TCP and UDP for HTTP/3) are open.
#   5. fail2ban: blocks addresses that keep failing to log in over SSH.
#   6. Installs Docker Engine and the Compose plugin from Docker's own apt repository.
#   7. Adds a 2 GB swap file (if the server has no swap) and creates /opt/gliagora for the stack.
#   8. Installs restic for the encrypted backups (set up afterwards; see deploy/README.md).
#   9. Prepares deploys from GitHub Actions: lets the admin user run update.sh --no-pull as root
#      without a password, and installs the deploy key if DEPLOY_PUBLIC_KEY is set.
#
# Usage, logged in as root on the new server:
#   ADMIN_USER=gliagora SSH_PUBLIC_KEY="ssh-ed25519 AAAA... name@laptop" bash setup-server.sh
# Without SSH_PUBLIC_KEY, the keys already in /root/.ssh/authorized_keys are copied.
# Optionally add DEPLOY_PUBLIC_KEY="ssh-ed25519 AAAA... gliagora-deploy" (the GitHub Actions key).
#
# IMPORTANT: keep this root session open until you have logged in as the new user from a second
# terminal (ssh ADMIN_USER@server) and `sudo -v` works. Otherwise a mistake can lock you out.
# The provider's web console still works for recovery; this script does not change it.

set -euo pipefail

ADMIN_USER="${ADMIN_USER:-gliagora}"
SSH_PUBLIC_KEY="${SSH_PUBLIC_KEY:-}"
DEPLOY_PUBLIC_KEY="${DEPLOY_PUBLIC_KEY:-}"
APP_DIR=/opt/gliagora
# Docker's apt signing key (https://docs.docker.com/engine/install/ubuntu/).
DOCKER_GPG_FINGERPRINT=9DC858229FC7DD38854AE2D88D81803C0EBFCD88

export DEBIAN_FRONTEND=noninteractive
# Restart services after library updates without asking.
export NEEDRESTART_MODE=a

log() { printf '\n==> %s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# --- Checks -------------------------------------------------------------------------------------

[[ $EUID -eq 0 ]] || fail "Run this script as root."
# shellcheck source=/dev/null
. /etc/os-release
[[ "${ID:-}" == ubuntu && "${VERSION_ID:-}" == 24.04 ]] || fail "This script is for Ubuntu 24.04 only."
[[ "$ADMIN_USER" =~ ^[a-z][a-z0-9-]{0,31}$ ]] || fail "ADMIN_USER must be lowercase letters, digits or '-'."

# --- 1. Updates -----------------------------------------------------------------------------------

log "Installing updates"
apt-get update
apt-get -y upgrade
apt-get -y install ca-certificates curl gnupg ufw fail2ban python3-systemd \
  unattended-upgrades apt-listchanges restic

log "Turning on automatic security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/52gliagora-unattended-upgrades <<'EOF'
// Managed by deploy/setup-server.sh
Unattended-Upgrade::Remove-Unused-Dependencies "true";
// Reboot when an update needs it (kernel, libc), at 01:30 UTC (04:30 in Istanbul).
// Docker restarts the containers after the reboot.
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "01:30";
EOF
systemctl enable --now unattended-upgrades

# --- 2. Admin user --------------------------------------------------------------------------------

log "Creating the admin user '$ADMIN_USER'"
if ! id "$ADMIN_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$ADMIN_USER"
fi
usermod -aG sudo "$ADMIN_USER"

user_home=$(getent passwd "$ADMIN_USER" | cut -d: -f6)
install -d -m 700 -o "$ADMIN_USER" -g "$ADMIN_USER" "$user_home/.ssh"
keys_file="$user_home/.ssh/authorized_keys"
touch "$keys_file"
if [[ -n "$SSH_PUBLIC_KEY" ]]; then
  grep -qxF "$SSH_PUBLIC_KEY" "$keys_file" || printf '%s\n' "$SSH_PUBLIC_KEY" >> "$keys_file"
elif [[ -s /root/.ssh/authorized_keys ]]; then
  while IFS= read -r key; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    grep -qxF "$key" "$keys_file" || printf '%s\n' "$key" >> "$keys_file"
  done < /root/.ssh/authorized_keys
fi
chown "$ADMIN_USER:$ADMIN_USER" "$keys_file"
chmod 600 "$keys_file"

# Never turn off password login unless the new user can log in with a key.
ssh-keygen -l -f "$keys_file" >/dev/null 2>&1 \
  || fail "No valid SSH public key for $ADMIN_USER. Set SSH_PUBLIC_KEY and run again."

# sudo asks for this password. SSH never accepts it (password login is turned off below).
if passwd -S "$ADMIN_USER" | awk '{exit ($2 == "P") ? 0 : 1}'; then
  echo "$ADMIN_USER already has a sudo password."
elif [[ -t 0 ]]; then
  echo "Choose a sudo password for $ADMIN_USER (store it in the password manager):"
  passwd "$ADMIN_USER"
else
  echo "WARNING: $ADMIN_USER has no password yet, so sudo will not work."
  echo "Set one as root with: passwd $ADMIN_USER"
fi

# --- 3. SSH ---------------------------------------------------------------------------------------

log "Hardening SSH (keys only, no root login)"
# Files in sshd_config.d are read in order and the first value wins, so 00- overrides the
# provider's defaults (for example 50-cloud-init.conf).
cat > /etc/ssh/sshd_config.d/00-gliagora.conf <<EOF
# Managed by deploy/setup-server.sh
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
PubkeyAuthentication yes
AuthenticationMethods publickey
AllowUsers $ADMIN_USER
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
EOF
# With socket activation (Ubuntu 24.04), /run/sshd may not exist yet; `sshd -t` needs it.
install -d -m 755 /run/sshd
sshd -t || fail "The SSH configuration is invalid; SSH was not reloaded."
systemctl reload ssh || systemctl restart ssh

# --- 4. Firewall ----------------------------------------------------------------------------------

log "Configuring the firewall (ufw)"
ufw default deny incoming
ufw default allow outgoing
ufw limit 22/tcp comment 'SSH (rate-limited)'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 443/udp comment 'HTTPS (HTTP/3)'
ufw --force enable
# Note: ports published by Docker containers bypass ufw. compose.prod.yml therefore publishes
# only Caddy's 80 and 443; PostgreSQL and the app are never published.

# --- 5. fail2ban ----------------------------------------------------------------------------------

log "Configuring fail2ban"
cat > /etc/fail2ban/jail.d/gliagora.local <<'EOF'
# Managed by deploy/setup-server.sh
[DEFAULT]
bantime = 1h
bantime.increment = true
findtime = 10m
maxretry = 5

[sshd]
enabled = true
backend = systemd
EOF
systemctl enable fail2ban
systemctl restart fail2ban

# --- 6. Docker ------------------------------------------------------------------------------------

log "Installing Docker Engine and the Compose plugin"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
gpg --show-keys --with-colons /etc/apt/keyrings/docker.asc | grep -q "^fpr:*${DOCKER_GPG_FINGERPRINT}:" \
  || fail "Docker's signing key does not have the expected fingerprint."
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

install -d -m 755 /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true
}
EOF
systemctl enable docker
systemctl restart docker
# Members of the docker group can control Docker without sudo, which is equivalent to root.
usermod -aG docker "$ADMIN_USER"

# --- 7. Swap and app directory --------------------------------------------------------------------

if [[ -z "$(swapon --show --noheadings)" ]]; then
  log "Adding a 2 GB swap file"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness = 10' > /etc/sysctl.d/60-gliagora.conf
sysctl --quiet --system

log "Creating $APP_DIR"
install -d -m 750 -o "$ADMIN_USER" -g "$ADMIN_USER" "$APP_DIR"

# --- 8. Deploys from GitHub Actions -----------------------------------------------------------------

log "Preparing deploys from GitHub Actions"
# deploy-remote.sh runs update.sh as root for the backup. This adds no new power: members of the
# docker group can already act as root.
sudoers=/etc/sudoers.d/gliagora-deploy
printf '%s ALL=(root) NOPASSWD: %s/update.sh --no-pull\n' "$ADMIN_USER" "$APP_DIR" > "$sudoers.tmp"
chmod 440 "$sudoers.tmp"
visudo -cf "$sudoers.tmp" >/dev/null || fail "Invalid sudoers rule; nothing was changed."
mv "$sudoers.tmp" "$sudoers"

if [[ -n "$DEPLOY_PUBLIC_KEY" ]]; then
  # Exactly one ed25519 key, on one line, without options (so the restriction below covers it all).
  [[ "$DEPLOY_PUBLIC_KEY" == ssh-ed25519\ * && "$DEPLOY_PUBLIC_KEY" != *$'\n'* ]] \
    || fail "DEPLOY_PUBLIC_KEY must be one ssh-ed25519 public key on a single line, without options."
  ssh-keygen -l -f /dev/stdin <<<"$DEPLOY_PUBLIC_KEY" >/dev/null 2>&1 \
    || fail "DEPLOY_PUBLIC_KEY is not a valid SSH public key."
  # The key may run nothing but deploy-remote.sh: no shell, no forwarding.
  deploy_line="restrict,command=\"$APP_DIR/deploy-remote.sh\" $DEPLOY_PUBLIC_KEY"
  grep -qxF "$deploy_line" "$keys_file" || printf '%s\n' "$deploy_line" >> "$keys_file"
fi

# --- Done -----------------------------------------------------------------------------------------

log "Done"
cat <<EOF
Next steps (see deploy/README.md):
  1. In a SECOND terminal, check that you can log in:  ssh $ADMIN_USER@<server-ip>
     and that sudo works:                             sudo -v
     Only then close this root session.
  2. Log out and in again as $ADMIN_USER so the docker group applies.
  3. Continue with "2. Prepare the stack (once)" in deploy/README.md (do not start the stack by
     hand: the first deploy starts it).
EOF
