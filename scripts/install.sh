#!/usr/bin/env bash
# Orbit VPS — one-line installer
# Usage: curl -fsSL https://get.orbit.sh | bash
#
# What this script does:
#   1. Detects CPU architecture (amd64 / arm64 / armv7)
#   2. Downloads the latest orbit binary from GitHub Releases
#   3. Creates the orbit system user (no login shell)
#   4. Installs the systemd unit file
#   5. Creates /etc/orbit/orbit.toml from the example config
#   6. Prints next steps

set -euo pipefail

REPO="orbit-sh/orbit"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/orbit"
DATA_DIR="/var/lib/orbit"
UNIT_FILE="/etc/systemd/system/orbit.service"

# ── Helpers ───────────────────────────────────────────────────────────────────

info()  { echo -e "\033[0;34m[orbit]\033[0m $*"; }
ok()    { echo -e "\033[0;32m[orbit]\033[0m $*"; }
err()   { echo -e "\033[0;31m[orbit]\033[0m $*" >&2; exit 1; }

require() { command -v "$1" >/dev/null 2>&1 || err "Required command not found: $1"; }

# ── Checks ────────────────────────────────────────────────────────────────────

[ "$EUID" -eq 0 ] || err "Please run as root (sudo bash)"

require curl
require systemctl

# ── Architecture detection ────────────────────────────────────────────────────

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)           ARCH_SUFFIX="linux_amd64"    ;;
  aarch64|arm64)    ARCH_SUFFIX="linux_arm64"    ;;
  armv7l)           ARCH_SUFFIX="linux_armv7"    ;;
  *)                err "Unsupported architecture: $ARCH" ;;
esac

# ── Download ──────────────────────────────────────────────────────────────────

VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)"
[ -n "$VERSION" ] || err "Could not determine latest version"

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/orbit_${ARCH_SUFFIX}.tar.gz"

info "Downloading orbit ${VERSION} for ${ARCH_SUFFIX}..."
TMP="$(mktemp -d)"
curl -fsSL "$DOWNLOAD_URL" | tar -xz -C "$TMP"
install -m 0755 "$TMP/orbit" "$INSTALL_DIR/orbit"
rm -rf "$TMP"
ok "Binary installed to $INSTALL_DIR/orbit"

# ── System user ───────────────────────────────────────────────────────────────

if ! id -u orbit >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin orbit
  ok "Created system user: orbit"
fi

# ── Directories ───────────────────────────────────────────────────────────────

mkdir -p "$CONFIG_DIR" "$DATA_DIR"
chown orbit:orbit "$DATA_DIR"

if [ ! -f "$CONFIG_DIR/orbit.toml" ]; then
  curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/orbit.example.toml" \
    -o "$CONFIG_DIR/orbit.toml"
  ok "Config written to $CONFIG_DIR/orbit.toml"
fi

# ── systemd unit ──────────────────────────────────────────────────────────────

cat > "$UNIT_FILE" << 'UNIT'
[Unit]
Description=Orbit VPS management panel
After=network.target

[Service]
Type=simple
User=orbit
ExecStart=/usr/local/bin/orbit --config /etc/orbit/orbit.toml
Restart=on-failure
RestartSec=5s
# Allow CAP_NET_ADMIN for firewall operations
AmbientCapabilities=CAP_NET_ADMIN CAP_SYS_PTRACE
CapabilityBoundingSet=CAP_NET_ADMIN CAP_SYS_PTRACE

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
ok "systemd unit installed"

# ── Done ──────────────────────────────────────────────────────────────────────

ok "Orbit ${VERSION} installed successfully!"
echo ""
echo "  Start Orbit:   systemctl enable --now orbit"
echo "  Open UI:       https://$(hostname -I | awk '{print $1}'):3900"
echo "  Config:        $CONFIG_DIR/orbit.toml"
echo "  Logs:          journalctl -fu orbit"
echo ""
