# Orbit VPS — Project Scope

## Vision

Orbit is a **single-binary VPS management layer** that runs on any Linux server and provides real OS visibility, deploy pipelines, web-server configuration, firewall management, log streaming, uptime monitoring, and an MCP socket for AI agents — all from one tool, with no external accounts or databases required.

---

## In Scope

### Core Monitoring
- Real-time CPU, memory, disk I/O, and network metrics (1-second resolution)
- Per-process breakdown with signal controls
- Load average tracking with 1m / 5m / 15m views
- 24-hour metric history via BoltDB ring buffer

### System Management
- systemd service management: start, stop, restart, enable, disable, view logs
- Interactive web terminal (WebSocket-backed, full xterm.js)
- Collaborative terminal sessions with role-based access (owner/write/read-only)
- Log file streaming with real-time search (journald + arbitrary files)

### Security
- UFW firewall rule management with a visual rule editor
- Fail2ban integration: jail management, ban/unban IPs
- SSH hardening audit with actionable recommendations
- Security score dashboard with CVE-aware checks
- MCP token management with scope enforcement and audit logging

### Network
- Advanced port management: listening ports, active connections, process-port mapping
- Port access rules (allow/block via iptables + UFW)
- Port scanning via nmap integration
- NAT/port-forwarding rule management

### Web Server
- Nginx virtual-host configuration editor (Monaco-powered)
- Config validation before save
- SSL certificate status and expiry tracking

### Deploy & Automation
- Webhook-triggered deploy hooks with script execution
- Deploy run history with full output capture
- Cron job management with execution history
- Configurable backup jobs (rsync or tar.gz) with run history

### Containers & Applications
- Docker container and image management
- Real-time container stats and logs
- Curated application catalog for one-click installs

### Uptime & Alerting
- HTTP/S, TCP, ICMP, DNS, WebSocket, and gRPC uptime monitors
- Incident tracking with MTTD/MTTR metrics
- Alert rules with configurable thresholds and notification routing
- Notification channels: Email (SMTP), Slack, Discord, Telegram, PagerDuty, Webhook

### Multi-Server Fleet
- Multi-server dashboard with health overview
- Per-server resource comparison and security scores
- SSH key vault and saved connection management
- Command snippets library
- Session recordings

### MCP (AI Agent Integration)
- Scoped MCP token management
- Audit log of all tool calls
- Read-only and deploy-level scopes
- Compatible with Claude Desktop, VS Code extension, and other MCP clients

### Data & Files
- File manager: browse, read, write, upload, download, archive
- FTP server management (vsftpd/ProFTPD)
- Database connection monitor (MySQL, PostgreSQL, Redis)

---

## Out of Scope (v0.1)

- Kubernetes orchestration (containers only, not pods/deployments)
- Managed database hosting (monitoring only, not provisioning)
- DNS management (planned for v0.3)
- Public status page generation (planned for v0.3)
- OIDC/SSO (planned for v0.4)
- Mobile native app (web-responsive only)
- Windows server support (Linux only)

---

## Architecture Constraints

- **Single binary**: the frontend (React + Vite) is embedded via `go:embed`
- **No external dependencies at runtime**: SQLite is embedded, no external DB or web server needed
- **CGO minimal**: only SQLite requires CGO; everything else is pure Go
- **Binary footprint**: target < 20 MB stripped, < 50 MB RAM idle
- **Startup time**: target < 200 ms

---

## Roadmap Summary

| Version | Focus |
|---------|-------|
| v0.1 | Core binary — metrics, services, logs, firewall, SSH, terminal |
| v0.2 | Deploy & monitoring — hooks, uptime, Docker, notifications |
| v0.3 | Multi-server & MCP — fleet dashboard, AI agent socket |
| v0.4 | Security & AI — hardening audit, 2FA/OIDC, DB monitor |

---

## Repository

**GitHub:** [https://github.com/KenyanRedwoods01/Orbit](https://github.com/KenyanRedwoods01/Orbit)
