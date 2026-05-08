export interface DashServer {
  id: string
  name: string
  status: 'online' | 'offline' | 'warning'
  ip: string
  location: string
  provider: string
  os: string
  cpu: number
  ram: number
  disk: number
  network: 'normal' | 'high' | 'critical'
  securityIssues: number
  uptimeDays: number
  services: number
  lastSeen: string
  tags: string[]
  sparkCpu: number[]
  sparkRam: number[]
}

export interface DashAlert {
  id: string
  severity: 'critical' | 'warning' | 'info'
  server: string
  message: string
  time: string
  status: 'active' | 'acknowledged' | 'resolved'
  category: string
}

export interface TimelineEvent {
  id: string
  time: string
  type: 'security' | 'deploy' | 'login' | 'restart' | 'update' | 'incident' | 'scan'
  server: string
  details: string
  user: string
  _rawTs?: number
  _method?: string
  _path?: string
  _status?: number
  _ip?: string
}

export interface ContainerStat {
  id: string
  name: string
  image: string
  status: 'running' | 'unhealthy' | 'stopped'
  cpu: number
  ram: number
  uptime: string
  vuln?: string
}

export interface SecurityCheck {
  label: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
}

function sp(base: number): number[] {
  return Array.from({ length: 20 }, (_, i) => Math.max(0, Math.min(100, base + Math.sin(i * 0.7) * 12 + Math.random() * 8)))
}

export const MOCK_SERVERS: DashServer[] = [
  { id: 's1', name: 'web-01', status: 'online', ip: '10.0.1.10', location: 'Frankfurt', provider: 'Hetzner', os: 'Ubuntu 24.04', cpu: 22, ram: 48, disk: 61, network: 'normal', securityIssues: 0, uptimeDays: 42, services: 18, lastSeen: '2s ago', tags: ['web', 'prod'], sparkCpu: sp(22), sparkRam: sp(48) },
  { id: 's2', name: 'web-02', status: 'online', ip: '10.0.1.11', location: 'Frankfurt', provider: 'Hetzner', os: 'Ubuntu 24.04', cpu: 31, ram: 52, disk: 58, network: 'normal', securityIssues: 0, uptimeDays: 38, services: 18, lastSeen: '3s ago', tags: ['web', 'prod'], sparkCpu: sp(31), sparkRam: sp(52) },
  { id: 's3', name: 'db-prod', status: 'warning', ip: '10.0.2.10', location: 'Frankfurt', provider: 'Hetzner', os: 'Debian 12', cpu: 67, ram: 81, disk: 95, network: 'high', securityIssues: 2, uptimeDays: 91, services: 6, lastSeen: '1s ago', tags: ['db', 'prod', 'critical'], sparkCpu: sp(67), sparkRam: sp(81) },
  { id: 's4', name: 'cache-01', status: 'online', ip: '10.0.3.10', location: 'Amsterdam', provider: 'Vultr', os: 'Ubuntu 22.04', cpu: 14, ram: 36, disk: 22, network: 'normal', securityIssues: 0, uptimeDays: 201, services: 4, lastSeen: '2s ago', tags: ['cache'], sparkCpu: sp(14), sparkRam: sp(36) },
  { id: 's5', name: 'cache-02', status: 'offline', ip: '10.0.3.11', location: 'Amsterdam', provider: 'Vultr', os: 'Ubuntu 22.04', cpu: 0, ram: 0, disk: 22, network: 'normal', securityIssues: 0, uptimeDays: 0, services: 0, lastSeen: '14m ago', tags: ['cache'], sparkCpu: sp(0), sparkRam: sp(0) },
  { id: 's6', name: 'monitor', status: 'online', ip: '10.0.4.10', location: 'Nuremberg', provider: 'Hetzner', os: 'Ubuntu 24.04', cpu: 8, ram: 29, disk: 44, network: 'normal', securityIssues: 0, uptimeDays: 156, services: 12, lastSeen: '1s ago', tags: ['infra'], sparkCpu: sp(8), sparkRam: sp(29) },
  { id: 's7', name: 'backup-01', status: 'offline', ip: '10.0.5.10', location: 'Helsinki', provider: 'Hetzner', os: 'Debian 12', cpu: 0, ram: 0, disk: 88, network: 'normal', securityIssues: 0, uptimeDays: 0, services: 0, lastSeen: '2h ago', tags: ['backup'], sparkCpu: sp(0), sparkRam: sp(0) },
  { id: 's8', name: 'mail-01', status: 'online', ip: '10.0.6.10', location: 'London', provider: 'AWS', os: 'Ubuntu 22.04', cpu: 19, ram: 41, disk: 33, network: 'normal', securityIssues: 1, uptimeDays: 77, services: 8, lastSeen: '4s ago', tags: ['mail'], sparkCpu: sp(19), sparkRam: sp(41) },
  { id: 's9', name: 'vpn-gw', status: 'online', ip: '10.0.7.10', location: 'Zurich', provider: 'Vultr', os: 'Alpine 3.19', cpu: 5, ram: 18, disk: 11, network: 'normal', securityIssues: 0, uptimeDays: 312, services: 3, lastSeen: '2s ago', tags: ['net', 'infra'], sparkCpu: sp(5), sparkRam: sp(18) },
  { id: 's10', name: 'dev-01', status: 'online', ip: '10.0.8.10', location: 'Frankfurt', provider: 'Hetzner', os: 'Ubuntu 24.04', cpu: 44, ram: 63, disk: 52, network: 'normal', securityIssues: 3, uptimeDays: 5, services: 22, lastSeen: '5s ago', tags: ['dev'], sparkCpu: sp(44), sparkRam: sp(63) },
]

export const MOCK_ALERTS: DashAlert[] = [
  { id: 'a1', severity: 'critical', server: 'db-prod', message: 'Disk usage exceeded 95% — only 2.3 GB free', time: '2 min ago', status: 'active', category: 'Disk' },
  { id: 'a2', severity: 'critical', server: 'db-prod', message: 'CPU sustained above 80% for 15 min', time: '18 min ago', status: 'active', category: 'CPU' },
  { id: 'a3', severity: 'warning', server: 'web-01', message: 'SSL certificate expires in 7 days', time: '1h ago', status: 'acknowledged', category: 'TLS' },
  { id: 'a4', severity: 'warning', server: 'mail-01', message: 'Failed login attempts: 47 in last hour', time: '2h ago', status: 'active', category: 'Security' },
  { id: 'a5', severity: 'warning', server: 'cache-02', message: 'Server unreachable — ping timeout', time: '14m ago', status: 'active', category: 'Availability' },
  { id: 'a6', severity: 'info', server: 'monitor', message: 'Scheduled backup completed successfully', time: '3h ago', status: 'resolved', category: 'Backup' },
  { id: 'a7', severity: 'info', server: 'web-02', message: 'New deployment triggered via webhook', time: '4h ago', status: 'resolved', category: 'Deploy' },
  { id: 'a8', severity: 'warning', server: 'dev-01', message: '3 critical CVEs found in installed packages', time: '6h ago', status: 'active', category: 'CVE' },
]

export const MOCK_TIMELINE: TimelineEvent[] = [
  { id: 't1', time: '14:32:15', type: 'security', server: 'web-01', details: 'CrowdSec blocked attacker 203.0.113.45 — ssh-bf scenario triggered', user: 'system' },
  { id: 't2', time: '14:28:03', type: 'deploy', server: 'web-02', details: 'Deployment orbit-app:v2.4.1 completed in 43s', user: 'ci-bot' },
  { id: 't3', time: '14:21:50', type: 'incident', server: 'db-prod', details: 'Disk usage alert triggered at 95%', user: 'system' },
  { id: 't4', time: '13:55:41', type: 'login', server: 'web-01', details: 'SSH login from 192.168.1.100 — user admin', user: 'admin' },
  { id: 't5', time: '13:44:09', type: 'security', server: 'mail-01', details: 'Fail2Ban banned IP 45.33.32.156 — repeated auth failure', user: 'system' },
  { id: 't6', time: '13:30:00', type: 'scan', server: 'all', details: 'Scheduled security scan completed — 3 new CVEs found', user: 'system' },
  { id: 't7', time: '13:15:22', type: 'restart', server: 'cache-02', details: 'Service redis restarted after OOM condition', user: 'system' },
  { id: 't8', time: '12:50:00', type: 'update', server: 'monitor', details: 'System packages updated: 14 packages upgraded', user: 'admin' },
  { id: 't9', time: '12:30:11', type: 'login', server: 'dev-01', details: 'SSH login from 10.0.8.5 — user deploy', user: 'deploy' },
  { id: 't10', time: '11:45:00', type: 'deploy', server: 'web-01', details: 'Nginx config reloaded after certificate renewal', user: 'certbot' },
]

export const MOCK_CONTAINERS: ContainerStat[] = [
  { id: 'c1', name: 'nginx-proxy', image: 'nginx:alpine', status: 'running', cpu: 1.2, ram: 48, uptime: '42d 6h' },
  { id: 'c2', name: 'postgres-14', image: 'postgres:14', status: 'running', cpu: 18.4, ram: 512, uptime: '12d 3h' },
  { id: 'c3', name: 'redis-cache', image: 'redis:7-alpine', status: 'unhealthy', cpu: 2.1, ram: 128, uptime: '0d 14m', vuln: 'OOM restart loop' },
  { id: 'c4', name: 'orbit-app', image: 'orbit:v2.4.1', status: 'running', cpu: 4.7, ram: 256, uptime: '0d 2h' },
  { id: 'c5', name: 'grafana', image: 'grafana/grafana:11', status: 'running', cpu: 0.8, ram: 96, uptime: '15d 0h' },
  { id: 'c6', name: 'prometheus', image: 'prom/prometheus:v2', status: 'running', cpu: 1.1, ram: 88, uptime: '15d 0h' },
]

export const SECURITY_CHECKS: SecurityCheck[] = [
  { label: 'Firewall (UFW)', status: 'ok', detail: 'Enabled, 12 rules active' },
  { label: 'Fail2Ban', status: 'ok', detail: '3 jails active, 47 IPs banned' },
  { label: 'SSH root login', status: 'ok', detail: 'PermitRootLogin disabled' },
  { label: 'SSH key auth only', status: 'ok', detail: 'Password auth disabled' },
  { label: 'Unattended upgrades', status: 'warn', detail: 'Not configured on 2 servers' },
  { label: 'AppArmor / SELinux', status: 'ok', detail: 'Enforcing on 8/10 servers' },
  { label: 'Open ports audit', status: 'warn', detail: '3 unexpected open ports found' },
  { label: 'SSL certificates', status: 'warn', detail: '1 cert expiring in 7 days' },
  { label: 'CrowdSec', status: 'ok', detail: 'Running, 87 IPs blocked today' },
  { label: 'CVE scanning', status: 'fail', detail: '3 critical CVEs unpatched' },
]

export const QUICK_ACTIONS = [
  { id: 'qa1', label: 'Add Server',       icon: 'plus'     },
  { id: 'qa2', label: 'Run Security Scan',icon: 'scan'     },
  { id: 'qa3', label: 'Deploy Agent',     icon: 'rocket'   },
  { id: 'qa4', label: 'Install Security', icon: 'shield'   },
  { id: 'qa5', label: 'Backup Now',       icon: 'save'     },
  { id: 'qa6', label: 'Update All',       icon: 'refresh'  },
]
