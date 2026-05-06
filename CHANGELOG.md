# Changelog

All notable changes to Orbit are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [v0.1.0] — 2026-05-06

### First developer release — Linux (amd64 · arm64 · armv7)

#### Added
- **Real-time metrics** — CPU, RAM, disk, and per-interface network stats streamed via WebSocket; auto-reconnect on disconnect
- **Firewall manager** — visual rule editor for nftables/iptables; add, remove, and reorder rules through the UI
- **GitOps deployments** — webhook-triggered pipelines with live log streaming; per-project deploy scripts
- **Docker container management** — list, start, stop, restart, and remove containers; live log tailing
- **Web server manager** — Nginx/Apache virtual host editor with Let's Encrypt SSL via ACME
- **Security plugins** — management UIs for Wazuh, Suricata, CrowdSec, and Fail2ban
- **Uptime monitors** — HTTP/TCP checks with incident timelines and alerting
- **Multi-server fleet** — add remote servers over SSH; switch context from the nav bar
- **MCP server** — Unix-socket (default) or TCP; lets Claude, GPT-4o, or any MCP-compatible assistant control the server via structured tools
- **Single binary** — Go binary with React frontend embedded; zero runtime dependencies beyond the OS
- **Security model** — runs as dedicated `orbit` user; only `CAP_NET_ADMIN` + `CAP_SYS_PTRACE` retained; all other capabilities dropped
- **One-line installer** — `curl … | sudo bash` installs binary, systemd service, and config on Ubuntu, Debian, CentOS/RHEL, and Rocky Linux
- **Packages** — `.deb` and `.rpm` produced by GoReleaser for amd64, arm64, and armv7
- **Docker image** — multi-arch image published to `ghcr.io/kenyanredwoods01/orbit`

#### Notes
- Default port **5000**; all Orbit ports must be in range 5000–6000
- MCP server listens on `/run/orbit/mcp.sock` by default; TCP optional on port 5001
- SQLite database stored at `/var/lib/orbit/orbit.db`
- Config file at `/etc/orbit/orbit.toml` (see `orbit.example.toml`)

#### Known limitations (to be addressed in v0.2.0)
- ARM builds require cross-compiler toolchain on the CI runner (`aarch64-linux-gnu-gcc`, `arm-linux-gnueabihf-gcc`)
- No built-in user management UI yet — admin credentials set in config
- Suricata and Wazuh plugins require those agents to be installed separately

---

[v0.1.0]: https://github.com/KenyanRedwoods01/Orbit/releases/tag/v0.1.0
