# Orbit VPS — Feature Status Report

> Generated: 2026-05-03  
> Stack: React 18 + TypeScript 5, Vite 5, Go backend (port 5000)  
> Total frontend lines of code surveyed: ~18 500 across 17 page areas

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented and solid |
| 🟡 | Basic / partially implemented |
| ❌ | Missing (not built yet) |
| 🔧 | Needs improvement / polish |

---

## 1. Authentication & Session Management

| Feature | Status | Notes |
|---------|--------|-------|
| Username + password login form | ✅ | `LoginPage.tsx`, with password reveal toggle |
| Dev-mode auth bypass (localStorage) | ✅ | `orbit-auth` key, admin scope |
| Zustand persist session | ✅ | `useAuth` store |
| Role-based scope (admin / viewer) | 🟡 | Scope stored but no UI enforcement |
| Logout | 🟡 | Button exists; no token invalidation |
| Two-factor authentication (TOTP) | ❌ | Not implemented |
| OAuth / SSO login | ❌ | Not implemented |
| Session timeout / auto-logout | ❌ | Not implemented |
| API key management | ❌ | No UI or backend |
| Audit log of logins | ❌ | Not implemented |

---

## 2. Dashboard / Overview

| Feature | Status | Notes |
|---------|--------|-------|
| Score / grade card | ✅ | Security page |
| Per-metric stat cards | ✅ | Metrics, Firewall, Security pages |
| Global overview / home dashboard | ❌ | No dedicated `/dashboard` page; app routes directly to metrics |
| Server health summary across fleet | 🟡 | Multiserver stats row exists |
| Recent alerts widget | ❌ | Not implemented |
| Quick-actions bar | ❌ | Not implemented |
| Customisable widget layout | ❌ | Not implemented |

---

## 3. Servers (Multi-Server Management)

| Feature | Status | Notes |
|---------|--------|-------|
| Server list (grid + list toggle) | ✅ | `MultiServerPage.tsx` — full rebuild |
| Search / filter / sort toolbar | ✅ | By name, provider, OS, status, tags |
| Drag-to-reorder servers | ✅ | Mouse drag, live re-index |
| Server detail modal (4 tabs) | ✅ | Overview, Resources, Network, Actions |
| Add server wizard (3 steps) | ✅ | SSH / API / agent connection types |
| Run command modal + command library | ✅ | History, per-server runner |
| Bulk operations modal (5 ops) | ✅ | Reboot, update, backup, deploy, audit |
| Provider tags (Hetzner, DigitalOcean, etc.) | ✅ | 9 mock servers |
| Real SSH / agent connection | ❌ | All mock data; Go backend not wired |
| Per-server terminal tab | 🟡 | xterm dependency present, not integrated in server modal |
| Server grouping / labels | 🟡 | Tags exist but no group management UI |
| Server cost tracking | ❌ | Not implemented |
| Alerts per server | ❌ | Not implemented |

---

## 4. Metrics & Monitoring

| Feature | Status | Notes |
|---------|--------|-------|
| CPU usage chart (recharts) | ✅ | Real-time stream via `useMetricsStream` |
| Memory usage chart | ✅ | |
| Network I/O chart | ✅ | |
| Disk usage table | ✅ | |
| Process table (live) | ✅ | Top-N by CPU |
| Gauge cards (CPU / RAM / Disk %) | ✅ | Colour-coded thresholds |
| Historical range picker (1h/6h/24h/7d) | 🟡 | UI exists; backend replay not wired |
| GPU metrics | ❌ | Not implemented |
| Custom metric widgets | ❌ | Not implemented |
| Threshold-based alerting | ❌ | Not implemented |
| Export metrics (CSV / JSON) | ❌ | Not implemented |
| Prometheus / Grafana integration | ❌ | Not implemented |

---

## 5. Processes

| Feature | Status | Notes |
|---------|--------|-------|
| Process list with search | ✅ | `ProcessesPage.tsx` — 809 lines |
| Sort by CPU / memory / PID / name | ✅ | |
| Kill / signal send | ✅ | UI buttons wired to mock actions |
| Process detail page (exec, env, fds) | ✅ | `ProcessDetailPage.tsx` with tabs |
| Process tree (parent/child) | ❌ | Flat list only |
| `strace` / `lsof` integration | ❌ | Not implemented |
| Auto-restart crashed processes | ❌ | No supervisor integration |

---

## 6. Services (systemd)

| Feature | Status | Notes |
|---------|--------|-------|
| Service list (grid + list) | ✅ | `ServicesPage.tsx` — 739 lines |
| Start / stop / restart / reload | ✅ | Mock actions with confirmation |
| Service detail modal | ✅ | `ServiceDetailModal.tsx` |
| Enable / disable on boot | ✅ | Toggle in detail modal |
| Journal log viewer per service | 🟡 | Tab exists in detail modal; mock data |
| Create / edit unit file | ❌ | Not implemented |
| Service dependency graph | ❌ | Not implemented |
| Failed service alerts | ❌ | Not implemented |

---

## 7. Containers (Docker)

| Feature | Status | Notes |
|---------|--------|-------|
| Container list with status | ✅ | `ContainersPage.tsx` — 604 lines |
| Start / stop / restart / remove | ✅ | Mock actions |
| Container detail modal | ✅ | `ContainerDetailModal.tsx` — 442 lines |
| Container create wizard | ✅ | `ContainerCreateWizard.tsx` — 356 lines |
| Container logs viewer | ✅ | `ContainerLogs.tsx` |
| Port mapping display | ✅ | |
| Volume mounts display | ✅ | |
| Network list | 🟡 | Shown in detail; no dedicated Network tab |
| Image management | ❌ | Pull / tag / delete images not built |
| Docker Compose support | ❌ | Not implemented |
| Resource limits (CPU / RAM per container) | 🟡 | Shown read-only; no edit UI |
| Registry integration | ❌ | Not implemented |
| Real Docker API wiring | ❌ | All mock data |

---

## 8. Security

| Feature | Status | Notes |
|---------|--------|-------|
| Security score + grade gauge | ✅ | Computed from check results |
| SSH hardening checks list + grid | ✅ | 20+ checks, sort/filter/search |
| SSH check detail modal (3 tabs) | ✅ | Overview, Remediation, Details |
| Open ports scan table | ✅ | Risk-ranked, firewall status |
| CVE scan table (CVSS bars) | ✅ | Package-level, with fix modal |
| Compliance tab | ✅ | CIS, GDPR, PCI-DSS, HIPAA, SOC2 |
| Re-scan button | 🟡 | Simulated 2.8 s spinner; no real scan |
| SSH action icon sizing (list view) | ✅ | **Fixed — icons now 10×10 px, inline-flex** |
| Real `sshd_config` read / apply | ❌ | All mock data |
| CVE database integration (NVD/OSV) | ❌ | Not implemented |
| 2FA enforcement per user | ❌ | Not implemented |
| WAF / intrusion detection | ❌ | Not implemented |
| Certificate expiry monitoring | ❌ | Not implemented |

---

## 9. Firewall

| Feature | Status | Notes |
|---------|--------|-------|
| Rule list (grid + list toggle) | ✅ | `FirewallPage.tsx` — 890 lines |
| Add / edit rule modal | ✅ | Full form with UFW command preview |
| Rule detail modal | ✅ | Includes hit counter bar |
| Delete confirm dialog | ✅ | |
| Drag / arrow reorder rules | ✅ | Up/down buttons, order recalculates |
| App profiles tab | ✅ | Enable / disable per profile |
| NAT / port-forwarding tab | ✅ | List with enable/disable |
| Fail2ban jails status | ✅ | Active/inactive, banned/failed counts |
| Banned IPs table | ✅ | Country, jail, attempts, since |
| Banned IP detail popup (eye icon) | ✅ | **Fixed — opens modal with logs + unban** |
| Unban IP action | ✅ | Removes from state; updates counter |
| Live firewall log tab | ✅ | Filterable by BLOCK/ALLOW/LIMIT |
| Real UFW / nftables apply | ❌ | All mock data |
| GeoIP ban / allow-list | ❌ | Not implemented |
| Dynamic IP blacklist feeds | ❌ | Not implemented |

---

## 10. Uptime Monitoring

| Feature | Status | Notes |
|---------|--------|-------|
| Monitor list (cards + table toggle) | ✅ | `UptimePage.tsx` — 547 lines |
| Status (up / down / unknown) | ✅ | Colour-coded dots |
| Monitor detail modal | 🟡 | Exists but limited tabs |
| Add / edit monitor form | ✅ | `MonitorForm.tsx` — 952 lines |
| Incident log | ✅ | `IncidentPage.tsx` — 522 lines |
| Incident detail page | ✅ | Timeline, affected monitors |
| 30/60/90-day response time sparklines | 🟡 | Data exists, chart depth basic |
| Status page (public) | ❌ | Not implemented |
| Multi-region check | ❌ | Not implemented |
| Alert notifications (email/Slack/webhook) | ❌ | Not implemented |
| SSL cert expiry check | ❌ | Not implemented |
| Response body assertion | ❌ | Not implemented |

---

## 11. Logs

| Feature | Status | Notes |
|---------|--------|-------|
| Log source picker (systemd/app/custom) | ✅ | `LogSourcePicker.tsx` |
| Log terminal with ANSI colour | ✅ | `LogTerminal.tsx` using xterm |
| Search / filter by level | ✅ | BLOCK/ALLOW/LIMIT style filtering |
| Log export button | 🟡 | Button rendered; no download action |
| Journald (`journalctl`) integration | ❌ | Mock data only |
| Log rotation management | ❌ | Not implemented |
| Persistent log storage / retention policy | ❌ | Not implemented |
| Log forwarding (syslog / Loki) | ❌ | Not implemented |

---

## 12. Deploy / CI-CD

| Feature | Status | Notes |
|---------|--------|-------|
| Deployment list | ✅ | `AllDeploymentsPage.tsx` — 306 lines |
| Deployment detail page | ✅ | `DeploymentDetailPage.tsx` — 623 lines |
| Pipeline wizard | ✅ | `PipelineWizard.tsx` — 527 lines |
| Pipeline detail modal | ✅ | `PipelineDetailModal.tsx` |
| Webhook hooks form | ✅ | `HookForm.tsx` |
| Deploy log panel | ✅ | `DeployLogPanel.tsx` |
| Service icons | ✅ | `ServiceIcons.tsx` |
| Real Git / webhook integration | ❌ | All mock data |
| Rollback to previous deployment | 🟡 | Button exists in detail; not wired |
| Environment variable management | ❌ | Not implemented |
| Secrets injection at deploy time | ❌ | Not implemented |
| Blue/green or canary deployments | ❌ | Not implemented |

---

## 13. Web Server (Nginx/Apache)

| Feature | Status | Notes |
|---------|--------|-------|
| Virtual host list | ✅ | `WebServerPage.tsx` — 1 278 lines |
| Site detail modal (7 tabs) | ✅ | General, Locations, SSL, Performance, Security Headers, Rewrites, Error Pages, Logs |
| Add / edit site form | ✅ | Full form with proxy, docroot, aliases |
| SSL tab (Let's Encrypt / manual) | ✅ | Form fields present |
| Enable / disable site toggle | ✅ | |
| SSL tab | ✅ | |
| Security headers config | ✅ | HSTS, CSP, X-Frame-Options |
| Rewrite rules editor | ✅ | Monaco / textarea |
| Error page customisation | ✅ | |
| Nginx config apply / test | ❌ | All mock data; no `nginx -t` execution |
| Let's Encrypt auto-renew | ❌ | Not implemented |
| Access log viewer per site | 🟡 | Tab exists in modal; mock log lines |
| PHP-FPM / FastCGI config | ❌ | Not implemented |
| Load-balancer upstream config | ❌ | Not implemented |

---

## 14. Cron / Scheduled Tasks

| Feature | Status | Notes |
|---------|--------|-------|
| Cron job list | ❌ | **Page does not exist** |
| Add / edit / delete cron job | ❌ | Not implemented |
| Cron expression builder | ❌ | Not implemented |
| Last-run / next-run display | ❌ | Not implemented |
| Run-now button | ❌ | Not implemented |
| Cron job log viewer | ❌ | Not implemented |

---

## 15. Backups

| Feature | Status | Notes |
|---------|--------|-------|
| Backup job list | ❌ | **Page does not exist** |
| Schedule backup (cron-based) | ❌ | Not implemented |
| Destinations (S3, SFTP, local) | ❌ | Not implemented |
| Restore from backup | ❌ | Not implemented |
| Backup integrity check | ❌ | Not implemented |
| Retention policy UI | ❌ | Not implemented |

---

## 16. User / Team Management

| Feature | Status | Notes |
|---------|--------|-------|
| User list | ❌ | **Page does not exist** |
| Add / edit / delete users | ❌ | Not implemented |
| Role assignment (admin/viewer/operator) | ❌ | Role exists in auth store only |
| SSH key management per user | ❌ | Not implemented |
| Team / organisation support | ❌ | Not implemented |
| Activity audit log | ❌ | Not implemented |

---

## 17. Settings & System

| Feature | Status | Notes |
|---------|--------|-------|
| Settings page | ❌ | **Page does not exist** |
| Theme / appearance toggle | ❌ | CSS vars defined but no toggle UI |
| Notification preferences | ❌ | Not implemented |
| API key management | ❌ | Not implemented |
| Go backend status / health check | ❌ | Backend on port 5000 not yet wired to all frontend pages |
| Timezone / locale settings | ❌ | Not implemented |
| System update via UI | ❌ | Not implemented |

---

## Summary

| Area | ✅ Solid | 🟡 Basic | ❌ Missing |
|------|----------|----------|-----------|
| Auth | 3 | 2 | 5 |
| Dashboard | 2 | 1 | 4 |
| Servers | 7 | 3 | 3 |
| Metrics | 6 | 1 | 5 |
| Processes | 5 | 0 | 2 |
| Services | 5 | 1 | 2 |
| Containers | 8 | 2 | 4 |
| Security | 8 | 1 | 5 |
| Firewall | 12 | 0 | 3 |
| Uptime | 5 | 2 | 6 |
| Logs | 4 | 1 | 4 |
| Deploy | 7 | 1 | 5 |
| Web Server | 10 | 1 | 4 |
| Cron | 0 | 0 | 6 |
| Backups | 0 | 0 | 6 |
| Users | 0 | 0 | 6 |
| Settings | 0 | 0 | 6 |
| **Total** | **82** | **16** | **76** |

---

## Priority Recommendations

### High Impact / Low Effort
1. **Settings page** — theme toggle, timezone, basic preferences
2. **Go backend connectivity** — backend is on port 5000; frontend pages still fall back to mock data
3. **Global dashboard** — single overview page aggregating stats from all modules
4. **Log export** — download button is rendered but action is not wired

### High Impact / Medium Effort
5. **Cron job manager** — entirely missing; commonly expected in a VPS panel
6. **User management page** — roles exist in state but no UI to manage users
7. **Backup manager** — entirely missing
8. **Alert / notification system** — no alerting anywhere in the frontend

### Needs Polish
9. **Uptime response-time charts** — sparklines are functional but the time-axis labels and Y-axis ranges need work
10. **Multiserver per-server terminal** — xterm is installed but not surfaced in the server detail modal
11. **Deploy rollback** — button is present but the action is not wired
12. **Security re-scan** — spinner runs but no real SSH/CVE scan is triggered
