# Orbit VPS

> The server management layer every other tool skips.

Orbit is a **single binary** that gives you real OS visibility, deploy pipelines, web-server config, log streaming, firewall, uptime monitoring, and an MCP socket for AI agents — all in one tool, with no account required.

```
curl -fsSL https://get.orbit.sh | bash
systemctl enable --now orbit
# Open https://your-server-ip:3900
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
| 📊 Real-time metrics | CPU, memory, disk I/O, network — live graphs, per-process breakdown |
| ⚙️ Service manager | systemd + PM2 + Docker — start, stop, restart, edit unit files |
| 📄 Log streaming | Tail any file or journald unit with real-time search |
| 🔒 Firewall | UFW / nftables visual rule editor — no more `ufw allow` in the dark |
| 🌐 Nginx / Caddy config | Virtual-host editor, auto-SSL, config validation |
| 🚀 Deploy hooks | Webhook-triggered pipelines, zero-downtime blue/green, rollback |
| 🗄️ Database monitor | MySQL, Postgres, Redis — connection stats, slow queries |
| 📈 Uptime monitors | HTTP / TCP / ping checks with alert channels |
| 🛡️ Security audit | SSH hardening, CVE scan, Fail2ban, hardening score |
| 🤖 MCP for AI agents | Scoped MCP socket — let Claude query metrics and trigger deploys |
| 🖥️ Multi-server hub | Manage N servers from one Orbit instance |
| 📦 Containers | Docker status, logs, resource usage — not orchestration, just visibility |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  orbit binary                    │
│                                                  │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ React SPA │  │ Go HTTP/2│  │  MCP server  │  │
│  │ (embedded)│  │  server  │  │  (Unix sock) │  │
│  └───────────┘  └────┬─────┘  └──────────────┘  │
│                      │                           │
│  ┌────────────────────▼──────────────────────┐  │
│  │              Module registry               │  │
│  │  metrics · services · logs · firewall      │  │
│  │  webserver · deploy · uptime · security    │  │
│  │  containers · multiserver · database       │  │
│  └────────────────────┬──────────────────────┘  │
│                       │                          │
│  ┌────────────────────▼──────────────────────┐  │
│  │            OS integration layer            │  │
│  │  /proc · journald · systemd DBus           │  │
│  │  Docker socket · nftables · Nginx/Caddy    │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐             │
│  │  SQLite      │  │  BoltDB      │             │
│  │  (relational)│  │  (metric     │             │
│  │              │  │   ring 24h)  │             │
│  └──────────────┘  └──────────────┘             │
└─────────────────────────────────────────────────┘
```

**Build pipeline:**
```
React + Vite  →  dist/  →  go:embed  →  orbit binary
goreleaser    →  linux/amd64 + arm64 + armv7
GitHub Actions → tag push → goreleaser → GitHub Releases + apt/rpm repo
```

**Binary footprint:**
- Size: ~18 MB (stripped)
- RAM idle: ~30 MB
- RAM under load: ~80 MB
- Startup time: < 100 ms
- CGO: disabled (except SQLite)
- Runtime deps: none (SQLite embedded, no external DB, no web server)

---

## Tech stack

### Backend (Go 1.22)
- `net/http` + HTTP/2 — no framework
- `gorilla/websocket` — live metric/log streams
- `shirou/gopsutil/v3` — /proc abstraction
- `coreos/go-systemd` — systemd DBus bindings
- `moby/moby/client` — Docker socket API
- `mattn/go-sqlite3` — embedded relational store
- `etcd-io/bbolt` — BoltDB metric ring buffer
- `golang-jwt/jwt/v5` — session tokens (httpOnly cookies)
- `pquerna/otp` — TOTP 2FA
- `mark3labs/mcp-go` — MCP server implementation
- `google/nftables` + `hpcloud/tail` — firewall + log tail
- `goreleaser` + `nfpm` — packaging

### Frontend (React 18 + Vite 5 + TypeScript)
- `@tanstack/react-query` — data fetching + caching
- `recharts` — time-series charts
- `zustand` — global state
- `xterm.js` — terminal for log streaming
- `react-router-dom` v6 — client routing
- `@monaco-editor/react` — Nginx/unit file editing

---

## Installation

### Quick install (recommended)
```bash
curl -fsSL https://get.orbit.sh | bash
systemctl enable --now orbit
```

### Behind Nginx (production)
```bash
orbit nginx-config | sudo tee /etc/nginx/sites-available/orbit
sudo nginx -s reload
```

### Enable MCP for AI agents
```bash
orbit mcp enable --scope read-only   # Read-only scope
orbit mcp enable --scope deploy      # Allow deploy triggers
orbit mcp enable --scope admin       # Full access (use carefully)
```

### Add remote servers
```bash
orbit server add user@192.168.1.10
```

---

## Configuration

Config file: `/etc/orbit/orbit.toml`

```toml
listen_addr = "0.0.0.0:3900"
data_dir    = "/var/lib/orbit"

# TLS — defaults to self-signed, or BYO
# tls_cert_file = "/etc/orbit/tls.crt"
# tls_key_file  = "/etc/orbit/tls.key"

[modules]
metrics     = true
services    = true
logs        = true
firewall    = true
web_server  = true
deploy      = true
database    = true
uptime      = true
security    = true
multi_server = true
containers  = true

[mcp]
enabled     = false
socket_path = "/run/orbit/mcp.sock"
# tcp_addr  = "127.0.0.1:3901"   # Uncomment for remote MCP
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
- Single-server only, embedded React UI

### v0.2 — Deploy & monitor (Next)
- Webhook deploy hooks
- Git-pull + script exec
- Zero-downtime blue/green swap
- Uptime monitors (HTTP/TCP/ping)
- SSL cert expiry alerts
- Docker container view
- Email + Slack notifications

### v0.3 — Multi-server & MCP (Later)
- SSH jump-host multi-server
- MCP server socket
- Fleet metrics overview
- Agent audit log
- Public status page generator

### v0.4 — Security & AI (Later)
- SSH hardening audit
- CVE scoring for open ports
- Fail2ban integration
- MCP admin scope
- DB slow-query monitor
- TOTP / 2FA, OIDC / SSO

---

## Development

### Prerequisites
- Go 1.22+
- Node 20+
- `goreleaser` (optional, for releases)

### Run locally
```bash
# 1. Build the frontend
cd web && npm install && npm run build && cd ..

# 2. Run the Go daemon
go run ./cmd/orbit --config ./dev.toml

# 3. (Optional) Run frontend in dev mode with hot-reload
cd web && npm run dev
```

### Project structure
```
orbit/
├── cmd/orbit/          # Entry point
├── internal/
│   ├── api/            # HTTP/2 server, routes, middleware
│   ├── auth/           # JWT, bcrypt, TOTP
│   ├── collector/      # OS metric collection
│   ├── config/         # orbit.toml loading
│   ├── db/             # SQLite + BoltDB init and schema
│   ├── mcp/            # MCP server
│   ├── modules/        # One package per feature module
│   │   ├── metrics/
│   │   ├── services/
│   │   ├── logs/
│   │   ├── firewall/
│   │   ├── webserver/
│   │   ├── deploy/
│   │   ├── database/
│   │   ├── uptime/
│   │   ├── security/
│   │   ├── multiserver/
│   │   └── containers/
│   ├── plugin/         # Plugin interface
│   └── transport/      # WebSocket hub
├── web/                # React + Vite frontend
│   └── src/
│       ├── components/ # Shared UI components
│       ├── hooks/      # Custom React hooks
│       ├── lib/        # API client
│       ├── pages/      # One directory per module
│       ├── store/      # Zustand stores
│       └── types/      # Shared TypeScript types
├── scripts/            # install.sh, nginx snippet
├── packaging/          # goreleaser + nfpm config
├── docs/               # Extended documentation
└── .github/workflows/  # CI / CD pipelines
```

---

## License

AGPL-3.0 — see [LICENSE](LICENSE)

---

## Contributing

PRs welcome. Please run `golangci-lint run` and `npm run lint` before opening a pull request.
See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contributor guide.

---

## Repository

Source code and issue tracker: **https://github.com/KenyanRedwoods01/Orbit**

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute, branch conventions, PR checklist
- [SECURITY.md](SECURITY.md) — responsible disclosure policy
- [PROJECT_SCOPE.md](PROJECT_SCOPE.md) — what Orbit will and will not do
- [ISSUES.md](ISSUES.md) — issue labels, triage process, and bug report templates
