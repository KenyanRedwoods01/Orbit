# Orbit

> The server management layer every other tool skips.

Orbit is a **single binary** that gives you real OS visibility, deploy pipelines, web-server config, log streaming, firewall, uptime monitoring, and an MCP socket for AI agents — all in one tool, with no account required.

```bash
curl -fsSL https://raw.githubusercontent.com/KenyanRedwoods01/Orbit/main/scripts/install.sh | sudo bash
systemctl enable --now orbit
# Open https://your-server-ip:5000
```

---

## Why Orbit?

Every existing tool has a blind spot:

| Tool | Gap |
|---|---|
| Cockpit | No deploy hooks, no web-server config |
| Coolify / Dokploy | No OS layer, no monitoring |
| HestiaCP / ISPConfig | No containers, no real-time metrics |
| Webmin | Dated UI, no containers, no deploy |
| Dokku / Kamal | CLI only, no OS dashboard |
| All PaaS tools | No uptime monitoring, no error tracking |

Orbit fills every gap. One binary, one port, no agents.

---

## Feature modules

| Module | What it does |
|---|---|
| Real-time metrics | CPU, memory, disk I/O, network — live graphs, per-process breakdown |
| Service manager | systemd + PM2 + Docker — start, stop, restart, edit unit files |
| Log streaming | Tail any file or journald unit with real-time search |
| Firewall | UFW / nftables visual rule editor |
| Nginx / Caddy config | Virtual-host editor, auto-SSL, config validation |
| Deploy hooks | Webhook-triggered pipelines, zero-downtime blue/green, rollback |
| Database monitor | MySQL, Postgres, Redis — connection stats, slow queries |
| Uptime monitors | HTTP / TCP / ping checks with alert channels |
| Security audit | SSH hardening, CVE scan, Fail2ban, hardening score |
| MCP for AI agents | Scoped MCP socket — let Claude query metrics and trigger deploys |
| Multi-server hub | Manage N servers from one Orbit instance |
| Containers | Docker status, logs, resource usage |

---

## Architecture

```
+--------------------------------------------------+
|                  orbit binary                    |
|                                                  |
|  +-----------+  +----------+  +--------------+  |
|  | React SPA |  | Go HTTP/2|  |  MCP server  |  |
|  | (embedded)|  |  server  |  |  (Unix sock) |  |
|  +-----------+  +----+-----+  +--------------+  |
|                      |                           |
|  +-------------------------------------------+  |
|  |              Module registry              |  |
|  |  metrics . services . logs . firewall     |  |
|  |  webserver . deploy . uptime . security   |  |
|  |  containers . multiserver . database      |  |
|  +-------------------------------------------+  |
|                      |                           |
|  +-------------------------------------------+  |
|  |            OS integration layer           |  |
|  |  /proc . journald . systemd DBus          |  |
|  |  Docker socket . nftables . Nginx         |  |
|  +-------------------------------------------+  |
|                                                  |
|  +--------------+  +--------------+             |
|  |  SQLite      |  |  BoltDB      |             |
|  |  (relational)|  |  (metric     |             |
|  |              |  |   ring 24h)  |             |
|  +--------------+  +--------------+             |
+--------------------------------------------------+
```

**Build pipeline:**
```
React + Vite  ->  dist/  ->  go:embed  ->  orbit binary
goreleaser    ->  linux/amd64 + arm64 + armv7
GitHub Actions -> tag push -> goreleaser -> GitHub Releases + .deb/.rpm
```

**Binary footprint:**
- Size: ~18 MB (stripped)
- RAM idle: ~30 MB
- RAM under load: ~80 MB
- Startup time: < 100 ms
- CGO: enabled (SQLite only)
- Runtime deps: none

---

## Tech stack

### Backend (Go 1.22)
- `net/http` + HTTP/2
- `gorilla/websocket` — live metric/log streams
- `shirou/gopsutil/v3` — /proc abstraction
- `mattn/go-sqlite3` — embedded relational store (CGO)
- `etcd-io/bbolt` — BoltDB metric ring buffer
- `golang-jwt/jwt/v5` — session tokens
- `golang.org/x/crypto` — password hashing + bcrypt

### Frontend (React 18 + Vite 5 + TypeScript)
- `@tanstack/react-query` — data fetching
- `recharts` — time-series charts
- `zustand` — global state
- `xterm.js` — terminal / log streaming
- `react-router-dom` v6

---

## Installation

### Quick install (recommended)
```bash
curl -fsSL https://raw.githubusercontent.com/KenyanRedwoods01/Orbit/main/scripts/install.sh | sudo bash
```

### With options
```bash
# Custom port (must be in range 5000-6000)
sudo ORBIT_PORT=5100 bash install.sh

# Specific version
sudo bash install.sh --version v1.0.0 --port 5000

# Install without starting the service
sudo bash install.sh --no-start

# Uninstall
sudo bash install.sh --uninstall
```

### Docker (build from source)

> Docker images are built from source — no pre-built image on a registry yet.

```bash
git clone https://github.com/KenyanRedwoods01/Orbit.git
cd Orbit
cp .env.example .env          # set ORBIT_SECRET_KEY
docker compose up -d          # builds image then starts on port 5000
```

Or build and run manually:
```bash
docker build -t orbit .
docker run -d \
  --name orbit \
  --cap-add NET_ADMIN --cap-add SYS_PTRACE \
  -p 5000:5000 \
  -v orbit-data:/var/lib/orbit \
  orbit
```

### Clone and install
```bash
git clone https://github.com/KenyanRedwoods01/Orbit.git
cd Orbit
sudo bash scripts/install.sh
```

---

## Configuration

Config file: `/etc/orbit/orbit.toml`

```toml
# Port must be in range 5000-6000
listen_addr = "0.0.0.0:5000"
data_dir    = "/var/lib/orbit"

# TLS -- defaults to self-signed, or bring your own
# tls_cert_file = "/etc/orbit/tls.crt"
# tls_key_file  = "/etc/orbit/tls.key"

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

[mcp]
enabled     = false
socket_path = "/run/orbit/mcp.sock"
# tcp_addr  = "127.0.0.1:5001"   # Uncomment for remote MCP (port 5000-6000)
```

---

## Port reference

All Orbit services use ports in the range **5000–6000**:

| Port | Service | Notes |
|---|---|---|
| 5000 | Main panel (HTTPS) | Default, configurable |
| 5001 | MCP TCP listener | Optional, disabled by default |
| 5002 | Prometheus metrics | Optional, disabled by default |

---

## Development

### Prerequisites
- Go 1.22+
- Node 20+
- gcc (for CGO / sqlite3)
- `goreleaser` (optional, for releases)

### Run locally
```bash
# 1. Build the frontend
cd web && npm install && npm run build && cd ..

# 2. Run the Go daemon
go run ./cmd/orbit --config ./orbit.example.toml

# 3. (Optional) Run frontend in dev mode with hot-reload
cd web && npm run dev
```

### Makefile commands
```bash
make build             # build frontend + Go binary -> dist/orbit
make test              # run Go tests with race detection
make lint              # run golangci-lint
make web-dev           # Vite dev server
make docker-build      # build Docker image from source
make release-snapshot  # local GoReleaser snapshot
```

### Release process
```bash
# Tag a version -- triggers the release GitHub Actions workflow
git tag v1.0.0
git push origin v1.0.0

# GoReleaser produces:
#   orbit_linux_amd64.tar.gz
#   orbit_linux_arm64.tar.gz
#   orbit_1.0.0_amd64.deb
#   orbit_1.0.0_x86_64.rpm
#   ghcr.io/kenyanredwoods01/orbit:v1.0.0
#   checksums.txt
```

---

## Roadmap

### v0.1 — Core binary (Now)
- Real-time metrics (CPU/mem/disk/net)
- systemd service manager
- Log streaming (journald + files)
- UFW firewall rule editor
- Nginx vhost config editor
- SSH-key + password auth

### v0.2 — Deploy and monitor (Next)
- Webhook deploy hooks
- Zero-downtime blue/green swap
- Uptime monitors (HTTP/TCP/ping)
- Docker container management
- Email + Slack notifications

### v0.3 — Multi-server and MCP (Later)
- SSH jump-host multi-server
- MCP server socket
- Fleet metrics overview
- Agent audit log

### v0.4 — Security and AI (Later)
- SSH hardening audit
- CVE scoring for open ports
- Fail2ban integration
- MCP admin scope
- TOTP / 2FA, OIDC / SSO

---

## License

AGPL-3.0 — see [LICENSE](LICENSE)

---

## Contributing

PRs welcome. Please run `golangci-lint run` and `npm run lint` before opening a pull request.
See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contributor guide.

---

## Repository

Source code: **https://github.com/KenyanRedwoods01/Orbit**

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute, branch conventions, PR checklist
- [docs/](docs/) — full documentation and GitHub Pages showcase site
- [docs/installation.html](docs/installation.html) — step-by-step install guide
- [docs/configuration.html](docs/configuration.html) — full orbit.toml reference
