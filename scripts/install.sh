#!/usr/bin/env bash
# =============================================================================
#  Orbit — Security-First Server Management Platform
#  One-click installer
#
#  Usage:
#    curl -fsSL https://raw.githubusercontent.com/KenyanRedwoods01/Orbit/main/scripts/install.sh | sudo bash
#    sudo bash install.sh [OPTIONS]
# =============================================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Banner ────────────────────────────────────────────────────────────────────
print_banner() {
  echo -e "${BLUE}${BOLD}"
  echo '   ____       _     _ _   '
  echo '  / __ \     | |   (_) |  '
  echo ' | |  | |_ __| |__  _| |_ '
  echo ' | |  | |  __| |_ \| | __|'
  echo ' | |__| | |  | |_) | | |_ '
  echo '  \____/|_|  |_.__/|_|\__|'
  echo -e "${NC}"
  echo -e "${CYAN}  Security-First Server Management Platform${NC}"
  echo -e "  https://github.com/KenyanRedwoods01/Orbit"
  echo ""
  echo "  ═══════════════════════════════════════════"
  echo ""
}

# ── Port constants ─────────────────────────────────────────────────────────────
PORT_MIN=5000
PORT_MAX=6000

# ── Defaults ──────────────────────────────────────────────────────────────────
ORBIT_VERSION="${ORBIT_VERSION:-latest}"
ORBIT_PORT="${ORBIT_PORT:-5000}"
ORBIT_MCP_PORT="${ORBIT_MCP_PORT:-5001}"
ORBIT_METRICS_PORT="${ORBIT_METRICS_PORT:-5002}"

REPO="KenyanRedwoods01/Orbit"
BIN_DIR="/usr/local/bin"
CONFIG_DIR="/etc/orbit"
DATA_DIR="/var/lib/orbit"
LOG_DIR="/var/log/orbit"
RUN_DIR="/run/orbit"

ORBIT_USER="orbit"
ORBIT_GROUP="orbit"

NO_START=false
UNINSTALL=false

# ── Argument parsing ──────────────────────────────────────────────────────────
show_help() {
  print_banner
  echo "Usage: install.sh [OPTIONS]"
  echo ""
  echo "Options:"
  printf "  %-30s %s\n" "--version, -v VERSION"    "Release tag to install (default: latest)"
  printf "  %-30s %s\n" "--port, -p PORT"           "Main panel port [${PORT_MIN}-${PORT_MAX}]  (default: 5000)"
  printf "  %-30s %s\n" "--mcp-port PORT"           "MCP TCP port    [${PORT_MIN}-${PORT_MAX}]  (default: 5001)"
  printf "  %-30s %s\n" "--metrics-port PORT"       "Metrics port    [${PORT_MIN}-${PORT_MAX}]  (default: 5002)"
  printf "  %-30s %s\n" "--no-start"                "Install but don't start the service"
  printf "  %-30s %s\n" "--uninstall"               "Remove Orbit from this system"
  printf "  %-30s %s\n" "--help, -h"                "Show this help"
  echo ""
  echo "Environment variables:"
  printf "  %-30s %s\n" "ORBIT_VERSION"  "Same as --version"
  printf "  %-30s %s\n" "ORBIT_PORT"     "Same as --port"
  echo ""
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version|-v)      ORBIT_VERSION="$2"; shift 2 ;;
    --port|-p)         ORBIT_PORT="$2";    shift 2 ;;
    --mcp-port)        ORBIT_MCP_PORT="$2"; shift 2 ;;
    --metrics-port)    ORBIT_METRICS_PORT="$2"; shift 2 ;;
    --no-start)        NO_START=true; shift ;;
    --uninstall)       UNINSTALL=true; shift ;;
    --help|-h)         show_help ;;
    *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
  esac
done

# ── Helpers ────────────────────────────────────────────────────────────────────
info()  { echo -e "${BLUE}[orbit]${NC} $*"; }
ok()    { echo -e "${GREEN}[orbit]${NC} $*"; }
warn()  { echo -e "${YELLOW}[orbit]${NC} $*"; }
die()   { echo -e "${RED}[orbit] ERROR:${NC} $*" >&2; exit 1; }

validate_port() {
  local port="$1" name="$2"
  if ! [[ "$port" =~ ^[0-9]+$ ]] || (( port < PORT_MIN || port > PORT_MAX )); then
    die "$name must be between $PORT_MIN and $PORT_MAX (got: $port)"
  fi
}

# ── Uninstall ─────────────────────────────────────────────────────────────────
do_uninstall() {
  info "Removing Orbit from this system..."
  systemctl stop orbit 2>/dev/null || true
  systemctl disable orbit 2>/dev/null || true
  rm -f /etc/systemd/system/orbit.service
  systemctl daemon-reload 2>/dev/null || true
  rm -f "$BIN_DIR/orbit"
  rm -rf "$CONFIG_DIR" "$LOG_DIR"
  id "$ORBIT_USER" &>/dev/null && userdel "$ORBIT_USER" 2>/dev/null || true
  ok "Orbit removed."
  warn "Data directory $DATA_DIR was preserved. Remove manually if desired."
  exit 0
}

$UNINSTALL && do_uninstall

# ── Root check ────────────────────────────────────────────────────────────────
[[ "$EUID" -eq 0 ]] || die "Please run as root (sudo bash install.sh)"

print_banner

# ── Validate ports ────────────────────────────────────────────────────────────
validate_port "$ORBIT_PORT"         "ORBIT_PORT"
validate_port "$ORBIT_MCP_PORT"     "ORBIT_MCP_PORT"
validate_port "$ORBIT_METRICS_PORT" "ORBIT_METRICS_PORT"

if [[ "$ORBIT_PORT" == "$ORBIT_MCP_PORT" || \
      "$ORBIT_PORT" == "$ORBIT_METRICS_PORT" || \
      "$ORBIT_MCP_PORT" == "$ORBIT_METRICS_PORT" ]]; then
  die "All ports must be unique (panel=${ORBIT_PORT} mcp=${ORBIT_MCP_PORT} metrics=${ORBIT_METRICS_PORT})"
fi

# ── Detect platform ───────────────────────────────────────────────────────────
detect_platform() {
  info "[1/7] Detecting platform..."
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    OS_ID="${ID:-unknown}"
  else
    OS_ID="unknown"
  fi

  local raw_arch
  raw_arch="$(uname -m)"
  case "$raw_arch" in
    x86_64)          ARCH_LABEL="amd64"  ;;
    aarch64|arm64)   ARCH_LABEL="arm64"  ;;
    armv7*)          ARCH_LABEL="armv7"  ;;
    *) die "Unsupported architecture: $raw_arch" ;;
  esac
  ok "  OS: ${OS_ID}  Arch: ${ARCH_LABEL}"
}

# ── Dependencies ──────────────────────────────────────────────────────────────
install_deps() {
  info "[2/7] Checking dependencies..."
  local need=()
  command -v curl    &>/dev/null || need+=(curl)
  command -v openssl &>/dev/null || need+=(openssl)
  command -v tar     &>/dev/null || need+=(tar)
  command -v systemctl &>/dev/null || die "systemd is required to manage the orbit service."

  if [[ ${#need[@]} -gt 0 ]]; then
    info "  Installing: ${need[*]}"
    case "$OS_ID" in
      ubuntu|debian)
        apt-get update -qq
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${need[@]}"
        ;;
      centos|rhel|almalinux|rocky)
        yum install -y -q "${need[@]}"
        ;;
      fedora)
        dnf install -y -q "${need[@]}"
        ;;
      arch)
        pacman -Sy --noconfirm "${need[@]}"
        ;;
      *)
        die "Cannot auto-install on '$OS_ID'. Please install manually: ${need[*]}"
        ;;
    esac
  fi
  ok "  All dependencies present"
}

# ── System user ───────────────────────────────────────────────────────────────
create_user() {
  info "[3/7] Setting up system user..."
  if ! id "$ORBIT_USER" &>/dev/null; then
    useradd --system --no-create-home --shell /sbin/nologin \
            --comment "Orbit VPS panel" "$ORBIT_USER"
    ok "  Created user: $ORBIT_USER"
  else
    ok "  User '$ORBIT_USER' already exists"
  fi
}

# ── Directories ───────────────────────────────────────────────────────────────
create_dirs() {
  info "[4/7] Creating directories..."
  mkdir -p "$DATA_DIR" "$CONFIG_DIR" "$LOG_DIR" "$RUN_DIR"
  chown "$ORBIT_USER:$ORBIT_GROUP" "$DATA_DIR" "$LOG_DIR" "$RUN_DIR"
  chmod 750 "$DATA_DIR" "$LOG_DIR"
  ok "  Directories ready"
}

# ── Download binary ───────────────────────────────────────────────────────────
download_binary() {
  info "[5/7] Downloading Orbit ${ORBIT_VERSION}..."

  local dl_url
  if [[ "$ORBIT_VERSION" == "latest" ]]; then
    local latest_tag
    latest_tag="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
                  | grep '"tag_name"' | cut -d'"' -f4)"
    [[ -n "$latest_tag" ]] || die "Could not determine latest version from GitHub API."
    ORBIT_VERSION="$latest_tag"
    info "  Resolved latest -> ${ORBIT_VERSION}"
  fi

  dl_url="https://github.com/${REPO}/releases/download/${ORBIT_VERSION}/orbit_linux_${ARCH_LABEL}.tar.gz"
  info "  Downloading: $dl_url"

  local tmp_dir
  tmp_dir="$(mktemp -d)"
  trap "rm -rf $tmp_dir" EXIT

  curl -fsSL "$dl_url" -o "$tmp_dir/orbit.tar.gz"
  tar -xzf "$tmp_dir/orbit.tar.gz" -C "$tmp_dir" --strip-components=1
  install -o root -g root -m 0755 "$tmp_dir/orbit" "$BIN_DIR/orbit"
  ok "  Binary installed -> $BIN_DIR/orbit  (${ORBIT_VERSION})"
}

# ── Config ────────────────────────────────────────────────────────────────────
write_config() {
  info "[6/7] Writing configuration..."
  if [[ -f "$CONFIG_DIR/orbit.toml" ]]; then
    warn "  Existing config found at $CONFIG_DIR/orbit.toml -- skipping."
    warn "  Delete it and re-run to regenerate."
    return
  fi

  local secret_key
  secret_key="$(openssl rand -hex 32)"

  cat > "$CONFIG_DIR/orbit.toml" <<EOF
# orbit.toml -- generated by installer on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Reference: https://kenyanredwoods01.github.io/Orbit/docs/configuration

# Main panel listen address.
# Port must stay in the range ${PORT_MIN}-${PORT_MAX}.
listen_addr = "0.0.0.0:${ORBIT_PORT}"

# Where SQLite + BoltDB metric ring are stored.
data_dir = "${DATA_DIR}"

# JWT signing secret (auto-generated; keep private).
secret_key = "${secret_key}"

# TLS -- leave empty to use Orbit's built-in self-signed certificate.
# tls_cert_file = "/etc/orbit/tls.crt"
# tls_key_file  = "/etc/orbit/tls.key"

# ── Modules ────────────────────────────────────────────────────────────────
[modules]
metrics      = true
services     = true
logs         = true
firewall     = true
web_server   = true
deploy       = true
database     = true
uptime       = true
security     = true
multi_server = true
containers   = true

# ── MCP (Model Context Protocol) ────────────────────────────────────────────
[mcp]
enabled     = false
socket_path = "${RUN_DIR}/mcp.sock"
# Uncomment to expose MCP over TCP (port must be in ${PORT_MIN}-${PORT_MAX}):
# tcp_addr = "127.0.0.1:${ORBIT_MCP_PORT}"

# ── Remote servers ────────────────────────────────────────────────────────────
# [[server]]
# name     = "web-01"
# host     = "192.168.1.10"
# user     = "ubuntu"
# key_file = "/home/orbit/.ssh/id_ed25519"
EOF

  chown root:"$ORBIT_GROUP" "$CONFIG_DIR/orbit.toml"
  chmod 640 "$CONFIG_DIR/orbit.toml"
  ok "  Config written -> $CONFIG_DIR/orbit.toml"
}

# ── Systemd service ───────────────────────────────────────────────────────────
install_service() {
  info "[7/7] Installing systemd service..."
  cat > /etc/systemd/system/orbit.service <<EOF
[Unit]
Description=Orbit VPS Management Panel
Documentation=https://kenyanredwoods01.github.io/Orbit/docs
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${ORBIT_USER}
Group=${ORBIT_GROUP}
ExecStart=${BIN_DIR}/orbit --config ${CONFIG_DIR}/orbit.toml
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=orbit

# Capabilities required for firewall management and /proc inspection
AmbientCapabilities=CAP_NET_ADMIN CAP_SYS_PTRACE
CapabilityBoundingSet=CAP_NET_ADMIN CAP_SYS_PTRACE

# Hardening
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=${DATA_DIR} ${RUN_DIR} ${LOG_DIR}
ProtectHome=yes
RuntimeDirectory=orbit

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable orbit.service
  ok "  Service enabled (orbit.service)"
}

# ── Start ─────────────────────────────────────────────────────────────────────
start_service() {
  info "Starting Orbit..."
  systemctl restart orbit.service

  local retries=15
  while (( retries > 0 )); do
    systemctl is-active --quiet orbit.service && break
    sleep 1
    (( retries-- ))
  done

  systemctl is-active --quiet orbit.service \
    || { warn "Orbit did not start in time. Check: journalctl -u orbit -n 40 --no-pager"; exit 1; }
  ok "Orbit is running"
}

# ── Done ──────────────────────────────────────────────────────────────────────
print_success() {
  local public_ip
  public_ip="$(curl -s --max-time 5 ifconfig.me 2>/dev/null \
               || hostname -I 2>/dev/null | awk '{print $1}' \
               || echo "YOUR_SERVER_IP")"

  echo ""
  echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}${BOLD}║         Orbit Installation Complete!                    ║${NC}"
  echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${CYAN}  Panel URL:${NC}"
  echo -e "    ${BOLD}http://${public_ip}:${ORBIT_PORT}${NC}"
  echo -e "    (Add tls_cert_file / tls_key_file to orbit.toml to enable HTTPS)"
  echo ""
  echo -e "${CYAN}  First run:${NC}"
  echo -e "    A setup wizard will create your admin account on first visit."
  echo ""
  echo -e "${CYAN}  Port assignments  [range ${PORT_MIN}-${PORT_MAX}]:${NC}"
  printf "    %-24s %s\n" "Panel (HTTP):"   "${ORBIT_PORT}"
  printf "    %-24s %s\n" "MCP TCP:"        "${ORBIT_MCP_PORT}  (disabled -- edit orbit.toml to enable)"
  printf "    %-24s %s\n" "Metrics:"        "${ORBIT_METRICS_PORT}  (disabled -- edit orbit.toml to enable)"
  echo ""
  echo -e "${CYAN}  Service management:${NC}"
  printf "    %-26s %s\n" "Status:"    "systemctl status orbit"
  printf "    %-26s %s\n" "Live logs:" "journalctl -u orbit -f"
  printf "    %-26s %s\n" "Restart:"   "systemctl restart orbit"
  printf "    %-26s %s\n" "Stop:"      "systemctl stop orbit"
  printf "    %-26s %s\n" "Uninstall:" "bash install.sh --uninstall"
  echo ""
  echo -e "${CYAN}  Config:${NC}  ${CONFIG_DIR}/orbit.toml"
  echo -e "${CYAN}  Docs:${NC}    https://kenyanredwoods01.github.io/Orbit"
  echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  detect_platform
  install_deps
  create_user
  create_dirs
  download_binary
  write_config
  install_service

  if [[ "$NO_START" == false ]]; then
    start_service
    print_success
  else
    echo ""
    ok "${BOLD}Orbit installed (--no-start).${NC}"
    echo "  Run:  systemctl start orbit"
    echo "  URL:  https://YOUR_SERVER_IP:${ORBIT_PORT}"
    echo ""
  fi
}

main "$@"
