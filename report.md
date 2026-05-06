# Orbit VPS — Project Status Report

Generated: May 3, 2026

---

## Project Overview

Orbit VPS is a self-hosted server management dashboard. The architecture is a **Go 1.22 backend** serving a single binary (API + embedded SPA) and a **React 18 / TypeScript 5 / Vite 5 frontend**. The frontend runs on port 5000 (dev) via `cd web && npm run dev`. In production the Go binary serves the embedded build over HTTPS/2.

**Stack at a glance**

| Layer | Technology |
|---|---|
| Backend language | Go 1.22 |
| Frontend framework | React 18 + TypeScript 5 (strict) |
| Build tool | Vite 5 |
| State management | Zustand |
| Routing | React Router 6 |
| Charts | Recharts 2 |
| Styling | CSS Modules + global CSS variables |
| OS metrics | gopsutil v3 (collector package) |
| Database | BoltDB (ring buffer, planned) |
| WebSocket hub | Custom transport/hub.go |
| Auth | Cookie session (planned JWT) |

**Design rules enforced throughout**
- No emojis anywhere — all icons are inline SVGs
- `border-radius: 7px` on every card, panel, and modal
- CSS variable system: `--color-surface`, `--color-surface-raised`, `--color-surface-overlay`, `--color-border`, `--color-border-strong`, `--color-text`, `--color-text-muted`, `--color-text-dim`, `--color-accent`, `--color-success`, `--color-danger`, `--color-warning`

---

## Frontend Pages — Detailed Status

### `/metrics` — Dashboard  ✅ COMPREHENSIVE
**File:** `web/src/pages/metrics/MetricsPage.tsx` (~1 200 lines) + `MetricsPage.module.css` (~730 lines) + `dashData.ts`

What is built:
- **Greeting card** — time-aware greeting (Good morning/afternoon/evening), live date, security score ring, fleet health stats, threat count, last-login row
- **DateTime card** — live HH:MM:SS clock (1 s interval), weekday + full date, week number, UTC offset, animated day-progress bar, session-start row
- **Region & Timezone card** — server location (Helsinki FI / Hetzner), server timezone, UTC offset, DST badge, 5-zone live clock table (UTC / Server / Browser / New York / London)
- **6 Global stat cards** — Total Servers, Online Servers, Security Score (84/100 grade ring), Resource Usage (CPU/RAM/Disk bars), Active Services, Active Incidents; clickable to filter server list
- **Server Health Panel** — list view (sortable columns: Name, CPU, RAM, Disk, Uptime, Status; drag-to-reorder rows; sparkline; security badge; per-row SSH/Metrics actions) + grid view (compact draggable cards); filter pills; live search; sort dropdown + direction toggle; grid/list toggle
- **4 Live resource charts** — CPU (per-core pills), Memory (swap meta), Network I/O, Disk partitions (Recharts, fed from WebSocket stream; Demo badge when offline)
- **Security Overview panel** — 4 threat stat cards, 10 health checks (Firewall / Fail2Ban / SSH / AppArmor / CrowdSec / CVE / etc.), security score badge, Run Scan button, collapsible
- **Alerts & Incidents panel** — per-severity filter pills, Acknowledge All, Archive, per-row acknowledge/dismiss/detail actions, critical-row tint
- **Activity Timeline** — 10 event types, type filter pills, time-range dropdown, connecting line
- **Container Summary** — 6 containers, status/CPU/RAM/uptime/vuln notes
- **Top Processes table** — live from metrics stream
- **Quick Actions bar** — Add Server, Run Scan, Terminal, Deploy Agent, Backup Now, Update All
- **Quick Terminal widget** — toggle panel, interactive input, simulated responses
- **4 Modals** — Server Detail, Add Server (3-tab: Manual/SSH Config/API), Alert Detail, Run Scan (5 scan type checkboxes + simulated result)

What is still mock/basic:
- All server data, alert data, timeline, containers are static mock data in `dashData.ts`
- Security score is hardcoded (84)
- Live data only comes from the WebSocket metrics stream (CPU/RAM/Network/Disk/Processes); all other panels are mock

---

### `/ssh` — SSH Terminal  ✅ COMPREHENSIVE
**File:** `web/src/pages/ssh/SshPage.tsx` (very large) + `SshPage.module.css` + `sshData.ts`

What is built:
- 10-tab layout: Terminal, SFTP, Port Forwards, SSH Keys, Snippets, Recordings, Collaboration, Config, Tunnels, Sessions
- **Terminal tab** — simulated terminal with ANSI-like output, command history, font/theme controls, reconnect button
- **SFTP tab** — dual-pane file manager, upload/download actions, breadcrumb nav, file type icons (30+ SVG icons in `assets/file-icons/`)
- **Port Forwards tab** — list view, add/remove tunnels, status indicators
- **SSH Keys tab** — key list, generate/import modals, fingerprint display
- **Snippets tab** — saved command snippets, search, insert-to-terminal
- **Recordings tab** — session replay list with duration/size
- **Collaboration tab** — shared session invite, participant list
- **Config tab** — SSH config editor (textarea)
- **Tunnels tab** — named tunnels with bind address/remote
- **Sessions tab** — recent connection history, reconnect actions
- **Modals** — Connect, New Key, Import Key, Run Snippet confirm
- Grid/List view toggle, drag-to-reorder sessions

What is still mock/basic:
- Terminal is fully simulated (no real SSH connection — no xterm.js or ssh2)
- SFTP is fully mock (no actual file transfer)
- All tab data is static from `sshData.ts`

---

### `/containers` — Docker Containers  ✅ SOLID
**File:** `web/src/pages/containers/ContainersPage.tsx` + `ContainerDetailModal.tsx` + `ContainerCreateWizard.tsx` + `ContainerLogs.tsx`

What is built:
- Container list with status, image, ports, CPU/RAM usage bars
- Grid/List toggle, search, filter by status
- **Container Detail modal** — full metadata, resource stats, logs tab, env vars tab, mounts tab, network tab
- **Container Logs** — virtual scrolling log viewer, filter input, auto-scroll
- **Create Wizard** — multi-step: image, ports, volumes, env, review
- Start/Stop/Restart/Remove actions with confirmation

What is still mock/basic:
- All container data from `containerMockData.ts`
- No Docker socket connection

---

### `/deploy` — Deployments & Pipelines  ✅ SOLID
**Files:** `DeployPage.tsx`, `DeploymentDetailPage.tsx`, `AllDeploymentsPage.tsx`, `PipelineWizard.tsx`, `PipelineDetailModal.tsx`, `HookForm.tsx`, `DeployLogPanel.tsx`

What is built:
- Pipeline list with status, branch, environment, duration, trigger
- **Pipeline Detail** — stages/steps view, real-time log panel (simulated), rerun/cancel
- **All Deployments page** — filterable table of all past deployments
- **Webhook form** — create/edit deploy hooks with secret generation
- **Pipeline Wizard** — multi-step wizard: repo, triggers, stages, env vars, review
- Service icons for common deploy targets (30+ SVGs in `assets/monitor-icons/`)

What is still mock/basic:
- All data from `deploymentData.ts`
- No real Git webhook receiver (backend stub)

---

### `/firewall` — Firewall Rules  ✅ SOLID
**Files:** `FirewallPage.tsx` + `FirewallPage.module.css` + `firewallData.ts`

What is built:
- Rule table (port, protocol, source, action, comment)
- Add/Edit/Delete rule modals
- Filter by action (Allow/Deny), protocol, port search
- Country-based rule groups
- Fail2Ban jails section with ban counts/unban action
- Port scanner panel (simulated)

What is still mock/basic:
- Data from `firewallData.ts`; no actual iptables/nftables integration

---

### `/ftp` — SFTP / File Manager  ✅ SOLID
**Files:** `FtpPage.tsx` + `FileExplorer.tsx` + `FtpPage.module.css` + `ftpData.ts`

What is built:
- Dual-pane SFTP file explorer (local + remote)
- Breadcrumb navigation, hidden files toggle
- File type icons (30+ SVG assets in `assets/file-icons/`)
- Upload/Download/Delete/Rename/New Folder actions
- Transfer queue panel with progress bars
- Bookmarks sidebar
- Connection manager (saved SFTP connections)

What is still mock/basic:
- No real SFTP implementation — all mock data

---

### `/logs` — Log Viewer  ✅ SOLID
**Files:** `LogsPage.tsx` + `LogTerminal.tsx` + `LogSourcePicker.tsx` + `logsData.ts`

What is built:
- Log source picker — system logs, journald units, nginx access/error, app logs
- Live log terminal with ANSI colour support (simulated stream)
- Search/filter bar, severity filter pills
- Follow mode (auto-scroll), pause/resume, clear
- Download log file action
- Log source management (add/remove sources)

What is still mock/basic:
- No real log streaming (backend WebSocket stub)

---

### `/uptime` — Uptime Monitors  ✅ SOLID
**Files:** `UptimePage.tsx` + `MonitorForm.tsx` + `MonitorRow.tsx` + `IncidentPage.tsx` + `incidentData.ts`

What is built:
- Monitor list with 90-day uptime bar, response time sparkline, status badge
- Add/Edit monitor form (HTTP/TCP/ICMP/DNS/Keyword)
- Incident detail page with timeline, duration, root-cause notes
- Alert channel config per monitor (Email/Slack/PagerDuty)
- Pause/Delete actions

What is still mock/basic:
- No real HTTP polling; data from `incidentData.ts`

---

### `/security` — Security Centre  ✅ SOLID
**Files:** `SecurityPage.tsx` + `SecuritySections.tsx` + `AuditItem.tsx` + `securityData.ts` + `securityToolsData.ts`

What is built:
- Overview: threat cards (blocked, failed logins, banned IPs, scans)
- Tabbed layout: Overview, Fail2Ban, CrowdSec, Wazuh, AppArmor, Audit Log, CVE Scanner, Tools
- Each tab has its own rich panel with data tables
- CVE scanner with mock results + severity badges
- Audit log with event types and source IPs
- Security tools directory (20+ tools)

What is still mock/basic:
- All data from `securityData.ts` and `securityToolsData.ts`; no live integration

---

### `/servers` — Multi-Server Management  ✅ SOLID
**Files:** `MultiServerPage.tsx` + `ServerDetailPage.tsx` + `ServerDetailModal.tsx` + `AddServerWizard.tsx` + `BulkOpsModal.tsx` + `RunCommandModal.tsx`

What is built:
- Server grid/list with per-server CPU/RAM/Disk bars, status, region, provider
- **Server Detail page** — full metadata, live-ish metrics, services, processes, logs, firewall tabs
- **Add Server Wizard** — multi-step: connection, auth (password/key), test, review
- **Bulk Operations modal** — run command on selected servers, restart, update
- **Run Command modal** — ad-hoc SSH command with output display

What is still mock/basic:
- Data from `serversData.ts`; no real multi-server SSH connections

---

### `/processes` — Process Manager  ✅ SOLID
**Files:** `ProcessesPage.tsx` + `ProcessDetailPage.tsx` + `useProcesses.ts`

What is built:
- Process table with PID, name, CPU%, MEM%, RSS, status, user
- Search, sort by any column
- Kill/nice/renice actions with confirmation
- **Process Detail page** — open files, threads, env vars, memory map tabs
- Live refresh (polls `useProcesses` hook)
- Process icons (SVGs per process name in `assets/process-icons/`)

What is still mock/basic:
- `useProcesses` falls back to demo data when API returns 501

---

### `/webserver` — Web Server Config  ✅ SOLID
**Files:** `WebServerPage.tsx` + `WebServerPage.module.css` + `webServerData.ts`

What is built:
- Virtual host list (nginx/apache/caddy) with status, domain, SSL expiry, request rate
- Tabs per site: Config Editor, SSL/TLS, Access Logs, Error Logs, Rewrites, Headers
- Config editor with syntax-highlighted textarea
- SSL certificate info panel with renewal action
- Enable/Disable/Reload actions

What is still mock/basic:
- Data from `webServerData.ts`; no real nginx/apache config write

---

### `/services` — System Services  ✅ SOLID
**Files:** `ServicesPage.tsx` + `ServiceDetailModal.tsx` + `servicesData.tsx`

What is built:
- Service list with status badge, CPU/MEM, description, start type
- Start/Stop/Restart/Enable/Disable per service with confirmation
- **Service Detail modal** — journal log panel, dependencies, resource chart
- Filter by status, search by name

What is still mock/basic:
- Data from `servicesData.tsx`; no real systemctl integration

---

### `/settings` — Settings  ✅ SOLID
**Files:** `SettingsPage.tsx` + `settingsData.ts`

What is built:
- Tabbed: General, Security, Notifications, Integrations, API Keys, Appearance, Backup
- Each tab has a fully rendered form with inputs, toggles, selects
- API key management (generate/revoke)
- Notification channel config (email, Slack, Telegram, PagerDuty)
- Appearance (theme selector, density, accent colour)
- Backup schedule config

What is still mock/basic:
- No settings persistence; all form state resets on reload

---

### `/mcp` — MCP (Model Context Protocol) Tokens  ✅ SOLID
**Files:** `McpPage.tsx`

What is built:
- Token list with name, scope, last used, expiry
- Create/Revoke token modals
- Audit log tab showing MCP API calls
- Scope selector (read-only, read-write, admin)

What is still mock/basic:
- No real MCP server; backend stub

---

### `/notifications` — Notifications  ✅ SOLID
**Files:** `NotificationsPage.tsx`

What is built:
- Notification feed with type icons, severity, timestamp, mark-read/dismiss
- Filter by type (alert, deploy, security, system)
- Mark all read, clear all
- Notification preferences panel

What is still mock/basic:
- Static mock notifications; no real push delivery

---

### `/plugins` — Plugin Manager  ✅ SOLID
**Files:** `PluginsPage.tsx` + `PluginDetailPage.tsx` + `pluginsData.ts`

What is built:
- Plugin marketplace grid with install/uninstall
- Installed list with enable/disable toggle, version, author, description
- **Plugin Detail page** — README, changelog, config panel, permissions
- Category filter, search

What is still mock/basic:
- No real plugin loading; data from `pluginsData.ts`

---

### `/login` — Login  ✅ FUNCTIONAL (with fallback)
**File:** `LoginPage.tsx`

What is built:
- Username/password form, show/hide password toggle
- Calls `/api/auth/login` — falls back to local auth (any credentials) when API returns 501
- Stores user in Zustand auth store
- Version badge + dev indicator

---

## Backend — Go Modules Status

### API Server (`internal/api/server.go`)
Routes are fully declared and wired. All handlers currently return `501 Not Implemented`.

| Route | Method | Status |
|---|---|---|
| `/api/auth/login` | POST | Stub |
| `/api/auth/logout` | POST | Stub |
| `/api/metrics/snapshot` | GET | Stub |
| `/ws/metrics` | GET (WS) | Stub |
| `/api/services` | GET | Stub |
| `/api/services/{name}/start\|stop\|restart` | POST | Stub |
| `/api/logs` | GET | Stub |
| `/ws/logs` | GET (WS) | Stub |
| `/api/firewall/rules` | GET/POST/DELETE | Stub |
| `/api/webserver/sites` | GET/PUT | Stub |
| `/api/deploy/hooks` | GET/POST | Stub |
| `/api/deploy/hooks/{id}/trigger` | POST | Stub |
| `/webhook/{secret}` | POST | Stub |
| `/api/containers` | GET | Stub |
| `/api/containers/{id}/start\|stop` | POST | Stub |
| `/ws/containers/{id}/logs` | GET (WS) | Stub |
| `/api/uptime` | GET/POST/DELETE | Stub |
| `/api/security/audit` | GET | Stub |
| `/api/servers` | GET/POST | Stub |
| `/api/mcp/tokens` | GET/POST/DELETE | Stub |
| `/api/mcp/audit` | GET | Stub |

**Missing routes (no handler declared yet):**
- `/api/server/info` (used by `useServerInfo.ts`)
- `/api/processes` (used by `useProcesses.ts`)
- `/api/security/scan`
- `/api/firewall/fail2ban`
- `/api/webserver/sites/{name}/reload`
- `/api/plugins`
- `/api/notifications`
- `/api/settings`
- `/api/deploy/deployments`
- `/api/servers/{id}`
- `/api/uptime/incidents`

---

### Collector (`internal/collector/collector.go`)  PARTIALLY IMPLEMENTED
The `Collect()` function is **real** — it uses gopsutil to read CPU, memory, disk, network, and process data from the OS. However:
- Not wired to any HTTP handler (snapshot handler stubs with 501)
- Not wired to the WebSocket hub
- No delta/BPS calculation for Network I/O
- No ring buffer persistence (BoltDB schema exists in `internal/db/db.go` but unused)

---

### Auth (`internal/auth/auth.go`)
- Struct and interface defined; no real implementation (bcrypt comparison, session storage) wired in

### Database (`internal/db/db.go`)
- BoltDB opened; schema for sessions and metric ring buffer defined (~141 lines)
- Not used by any handler yet

### WebSocket Hub (`internal/transport/hub.go`)
- Hub struct with broadcast/subscribe defined (~67 lines)
- Not connected to the collector or any handler

### MCP (`internal/mcp/mcp.go`)
- MCP token struct and auth logic skeleton (~124 lines)
- Not wired into routes

### Modules (all in `internal/modules/`)
All 10 modules (`metrics`, `containers`, `database`, `deploy`, `firewall`, `logs`, `multiserver`, `security`, `services`, `uptime`, `webserver`) implement the `plugin.Module` interface with empty stubs: `Collect()` returns nil, `Routes()` is empty, `Stop()` returns nil.

---

## Agents / Automation

There are currently **no agents** implemented. The MCP page in the UI allows generating API tokens with scopes, implying future agent support, but no agent runner, job queue, or scheduled task system exists in the codebase.

Planned agent surface (UI exists, backend does not):
- Backup agent (Settings > Backup tab)
- Deploy agent (Dashboard Quick Actions)
- Security scan agent (Dashboard / Security page)
- Uptime monitor agent (Uptime page — HTTP polling)
- Log shipping agent (Logs page)

---

## Shared Frontend Infrastructure

| File | Purpose | Status |
|---|---|---|
| `web/src/lib/api.ts` | Typed REST wrappers for all endpoints | Complete (232 lines); all functions defined even for stub routes |
| `web/src/lib/useServerInfo.ts` | Hook for server metadata | Falls back to demo data |
| `web/src/lib/utils.ts` | `formatBytes`, `formatBps`, misc helpers | Complete |
| `web/src/hooks/useWebSocket.ts` | Generic WebSocket hook | Complete |
| `web/src/store/auth.ts` | Zustand auth store | Complete |
| `web/src/store/plugins.ts` | Zustand plugin store | Stub |
| `web/src/components/layout/Layout.tsx` | Sidebar nav + outlet | Complete (all 20 routes linked) |
| `web/src/components/ui/` | Modal, DataTable, StatCard, StatusBadge, PageHeader, Spinner, EmptyState, ConfirmDialog | Complete |
| `web/src/pages/metrics/useMetricsStream.ts` | WebSocket metrics consumer | Complete; graceful 501 fallback |

---

## What Is Done (Summary)

- **20 frontend pages** fully built with comprehensive UI — all data, all modals, all controls, no placeholder "coming soon" screens
- **Dashboard** has 3 advanced info cards (Greeting, DateTime, Region/Timezone), 6 stat cards, server health panel, security overview, alerts, timeline, containers, processes, quick terminal, 4 modals, quick actions
- **SSH page** has 10 tabs, all modals, simulated terminal
- All pages have grid/list toggles where applicable, sorting, drag-to-reorder, search/filter
- No emojis anywhere; all icons are custom inline SVGs
- All border-radius strictly 7px
- Live metrics stream infrastructure (WebSocket hook + gopsutil collector) is wired end-to-end in code, falls back gracefully to demo data when backend is offline
- 30+ SVG asset sets for file icons, process icons, monitor icons, incident icons
- Typed REST API client (`api.ts`) covering all planned endpoints
- Go module structure with plugin interface, collector, DB schema, WebSocket hub all scaffolded

---

## What Remains (Priority Order)

### Critical / Backend
1. **Auth handler** — bcrypt login, session cookie creation/validation (`internal/auth/auth.go`)
2. **Metrics snapshot handler** — wire `collector.Collect()` → JSON response
3. **Metrics WebSocket** — wire collector loop → hub → `/ws/metrics`
4. **`/api/server/info` route** — hostname, IP, OS, uptime from gopsutil host package
5. **All remaining stub handlers** — implement each using appropriate gopsutil/exec calls

### Important / Backend
6. **Services handler** — exec `systemctl list-units --type=service --output=json`
7. **Logs handler + WebSocket** — tail journald / log files via `journalctl -f` subprocess
8. **Firewall handler** — read/write iptables or nftables rules via exec
9. **Containers handler** — Docker socket API (`/var/run/docker.sock`)
10. **Processes handler** — already collectible via gopsutil; expose as REST
11. **BoltDB ring buffer** — store metric snapshots for charting history
12. **Network BPS delta** — calculate bytes/sec between collector ticks

### Nice to Have
13. **SSH terminal** — integrate xterm.js frontend + `golang.org/x/crypto/ssh` backend
14. **SFTP** — integrate sftp library backend
15. **Deploy webhooks** — real GitHub/GitLab webhook receiver + script runner
16. **Uptime monitoring** — HTTP polling loop with incident creation
17. **Security scan** — Lynis / Trivy / fail2ban API integration
18. **Settings persistence** — write config to TOML/DB
19. **Plugin system** — dynamic module loading
20. **Agents** — job queue for backup, scan, deploy

---

## What Is Still Basic / Mock

| Area | What's mock | Path to real |
|---|---|---|
| Dashboard server list | `dashData.ts` MOCK_SERVERS | `/api/servers` handler returning real multi-server inventory |
| Dashboard alerts | `dashData.ts` MOCK_ALERTS | Alerting rule engine + persistence |
| Dashboard timeline | `dashData.ts` MOCK_TIMELINE | Event log in BoltDB |
| Dashboard containers | `dashData.ts` MOCK_CONTAINERS | Docker socket |
| Security score | Hardcoded 84 | Lynis/scoring engine |
| SSH terminal | Simulated output | xterm.js + Go SSH proxy |
| SFTP / FTP page | Simulated file tree | Go SFTP client |
| Logs streaming | Simulated | journald tail via subprocess |
| Deploy pipelines | `deploymentData.ts` | Git webhook + script runner |
| Firewall rules | `firewallData.ts` | iptables/nftables exec |
| Uptime monitors | `incidentData.ts` | HTTP polling agent |
| Services | `servicesData.tsx` | systemctl exec |
| Processes | Falls back to demo | Already collectible via gopsutil |
| Web server config | `webServerData.ts` | nginx/apache config file read/write |
| Settings | In-memory form state | TOML/DB persistence |
| Notifications | Static list | Event bus + push channels |
| Plugins | `pluginsData.ts` | Dynamic module loading |
| Auth | Local fallback (any creds) | bcrypt + session DB |
| Multi-server | `serversData.ts` | SSH connection pool |

---

## Line Count Reference

| Area | Approx. lines |
|---|---|
| Frontend TSX/TS (all pages + components) | ~25 700 |
| Frontend CSS Modules | ~3 500 |
| Go backend (all packages) | ~920 |
| Go collector (gopsutil, real) | ~150 |
| SVG assets | ~200 files |

The frontend is approximately **28× larger** than the backend by line count, which accurately reflects that the backend is scaffolded/stubbed while the frontend is comprehensively built.
