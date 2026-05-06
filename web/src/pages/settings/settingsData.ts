// ─────────────────────────────────────────────────────────
// Settings Page — Mock Data
// ─────────────────────────────────────────────────────────

export type UserStatus   = 'active' | 'locked' | 'pending'
export type AuthProvider = 'Local' | 'LDAP' | 'OAuth2' | 'SAML'
export type AuditSev     = 'info' | 'warn' | 'error'

// ── Users ─────────────────────────────────────────────────
export interface SettingUser {
  id:         string
  username:   string
  fullName:   string
  email:      string
  role:       string
  lastLogin:  string
  status:     UserStatus
  twoFactor:  boolean
  authMethod: AuthProvider
}

export const USERS: SettingUser[] = [
  { id: 'u1', username: 'admin',        fullName: 'Administrator',  email: 'admin@example.com',        role: 'Super Admin', lastLogin: '2026-05-03 10:30', status: 'active',  twoFactor: true,  authMethod: 'Local' },
  { id: 'u2', username: 'johndoe',      fullName: 'John Doe',       email: 'john@example.com',         role: 'Operator',    lastLogin: '2026-05-02 15:20', status: 'active',  twoFactor: true,  authMethod: 'LDAP'  },
  { id: 'u3', username: 'janedoe',      fullName: 'Jane Doe',       email: 'jane@example.com',         role: 'Auditor',     lastLogin: '2026-05-01 09:15', status: 'active',  twoFactor: false, authMethod: 'LDAP'  },
  { id: 'u4', username: 'deploy-bot',   fullName: 'Deployment Bot', email: 'bot@example.com',          role: 'API Only',    lastLogin: '2026-05-03 14:30', status: 'active',  twoFactor: false, authMethod: 'Local' },
  { id: 'u5', username: 'mark.ops',     fullName: 'Mark Wilson',    email: 'mark@example.com',         role: 'Operator',    lastLogin: '2026-04-30 11:00', status: 'active',  twoFactor: true,  authMethod: 'OAuth2'},
  { id: 'u6', username: 'inactive-usr', fullName: 'Inactive User',  email: 'inactive@example.com',     role: 'Viewer',      lastLogin: '2026-04-15 08:00', status: 'locked',  twoFactor: false, authMethod: 'Local' },
  { id: 'u7', username: 'pending@ex',   fullName: 'Pending User',   email: 'pending@example.com',      role: '-',           lastLogin: 'Never',            status: 'pending', twoFactor: false, authMethod: 'Local' },
  { id: 'u8', username: 'sarah.audit',  fullName: 'Sarah Chen',     email: 'sarah@example.com',        role: 'Auditor',     lastLogin: '2026-05-03 08:50', status: 'active',  twoFactor: true,  authMethod: 'OAuth2'},
]

export const ROLES = [
  { name: 'Super Admin', color: '#ff4d4d', desc: 'Full access to all settings and servers', users: 1 },
  { name: 'Admin',       color: '#ff8c00', desc: 'Manage users, settings; limited system access', users: 0 },
  { name: 'Operator',    color: '#4a9eff', desc: 'Day-to-day operations, no user/security changes', users: 3 },
  { name: 'Auditor',     color: '#a78bfa', desc: 'Read-only + export logs', users: 2 },
  { name: 'Viewer',      color: '#68d391', desc: 'Read-only dashboard', users: 1 },
  { name: 'API Only',    color: '#9ca3af', desc: 'No web UI access; API tokens only', users: 1 },
]

// ── Auth Methods ───────────────────────────────────────────
export interface AuthMethod {
  id:       string
  priority: number
  method:   AuthProvider
  status:   'active' | 'disabled'
  config:   string
}

export const AUTH_METHODS: AuthMethod[] = [
  { id: 'am1', priority: 1, method: 'Local',  status: 'active',   config: 'Password policy, 2FA' },
  { id: 'am2', priority: 2, method: 'LDAP',   status: 'active',   config: 'ldap.example.com (port 389)' },
  { id: 'am3', priority: 3, method: 'OAuth2', status: 'disabled', config: 'Not configured' },
  { id: 'am4', priority: 4, method: 'SAML',   status: 'disabled', config: 'Not configured' },
]

// ── API Tokens ─────────────────────────────────────────────
export interface APIToken {
  id:          string
  name:        string
  createdBy:   string
  created:     string
  lastUsed:    string
  expires:     string
  permissions: string[]
  ipRestrict:  string
  active:      boolean
  color:       string
}

export const API_TOKENS: APIToken[] = [
  { id: 't1', name: 'deploy-token',      createdBy: 'admin',   created: '2026-05-01', lastUsed: '2 min ago',  expires: 'Never',      permissions: ['read:servers','write:deploy'],          ipRestrict: 'Any',            active: true,  color: '#4a9eff' },
  { id: 't2', name: 'monitoring-agent',  createdBy: 'ops',     created: '2026-04-15', lastUsed: '5 min ago',  expires: '2026-07-15', permissions: ['read:metrics','read:servers'],          ipRestrict: '10.0.0.0/8',     active: true,  color: '#22c55e' },
  { id: 't3', name: 'ci-cd-integration', createdBy: 'jenkins', created: '2026-03-01', lastUsed: '1 hour ago', expires: '2026-06-01', permissions: ['read:servers','write:deploy','exec:cmd'], ipRestrict: '192.168.1.0/24', active: true,  color: '#f6ad55' },
  { id: 't4', name: 'backup-service',    createdBy: 'backup',  created: '2026-04-20', lastUsed: '3 hours ago',expires: '2026-10-20', permissions: ['read:servers','read:metrics'],          ipRestrict: 'Any',            active: true,  color: '#a78bfa' },
  { id: 't5', name: 'testing-token',     createdBy: 'johndoe', created: '2026-05-02', lastUsed: 'Never',      expires: '2026-05-09', permissions: ['read:servers'],                        ipRestrict: 'Any',            active: false, color: '#9ca3af' },
  { id: 't6', name: 'grafana-readonly',  createdBy: 'admin',   created: '2026-05-03', lastUsed: '20 min ago', expires: '2026-08-03', permissions: ['read:metrics','read:uptime'],           ipRestrict: 'Any',            active: true,  color: '#38bdf8' },
]

// ── Backup Files ───────────────────────────────────────────
export interface BackupFile {
  id:       string
  filename: string
  date:     string
  size:     string
  auto:     boolean
}

export const BACKUP_FILES: BackupFile[] = [
  { id: 'b1', filename: 'ui-config-20260503-020000.tar.gz', date: 'Today 02:00:00',      size: '2.3 MB', auto: true  },
  { id: 'b2', filename: 'ui-config-20260502-020000.tar.gz', date: 'Yesterday 02:00:00',  size: '2.2 MB', auto: true  },
  { id: 'b3', filename: 'ui-config-20260501-020000.tar.gz', date: '2026-05-01 02:00:00', size: '2.2 MB', auto: true  },
  { id: 'b4', filename: 'ui-config-20260430-020000.tar.gz', date: '2026-04-30 02:00:00', size: '2.1 MB', auto: true  },
  { id: 'b5', filename: 'manual-backup-20260429.tar.gz',    date: '2026-04-29 14:30:00', size: '2.0 MB', auto: false },
]

// ── Audit Log Entries ──────────────────────────────────────
export interface AuditEntry {
  id:      string
  ts:      string
  user:    string
  action:  string
  details: string
  ip:      string
  sev:     AuditSev
}

export const AUDIT_ENTRIES: AuditEntry[] = [
  { id: 'a1',  ts: '2026-05-03 14:32:15', user: 'admin',      action: 'Command executed', details: '"systemctl status nginx" on web-01',     ip: '192.168.1.100', sev: 'info'  },
  { id: 'a2',  ts: '2026-05-03 14:30:00', user: 'deploy-bot', action: 'API access',       details: 'GET /api/servers',                       ip: '10.0.0.5',      sev: 'info'  },
  { id: 'a3',  ts: '2026-05-03 13:15:22', user: 'johndoe',    action: 'Server added',     details: 'web-04.prod added to fleet',             ip: '192.168.1.102', sev: 'info'  },
  { id: 'a4',  ts: '2026-05-03 12:00:00', user: 'system',     action: 'Backup completed', details: '5 settings components backed up (2.3MB)',ip: 'localhost',     sev: 'info'  },
  { id: 'a5',  ts: '2026-05-03 10:45:10', user: 'admin',      action: 'Setting changed',  details: 'Email SMTP server updated',              ip: '192.168.1.100', sev: 'warn'  },
  { id: 'a6',  ts: '2026-05-03 09:30:05', user: 'johndoe',    action: 'Login success',    details: 'Local auth · 2FA verified',              ip: '192.168.1.102', sev: 'info'  },
  { id: 'a7',  ts: '2026-05-03 08:15:33', user: 'unknown',    action: 'Login failed',     details: 'Invalid password — 5 attempts (locked)', ip: '203.0.113.45',  sev: 'error' },
  { id: 'a8',  ts: '2026-05-03 07:30:00', user: 'sarah.audit',action: 'Data export',      details: 'Audit logs exported (CSV)',               ip: '192.168.1.104', sev: 'info'  },
  { id: 'a9',  ts: '2026-05-03 06:45:00', user: 'admin',      action: 'Token revoked',    details: 'API token "old-deploy" revoked',          ip: '192.168.1.100', sev: 'warn'  },
  { id: 'a10', ts: '2026-05-03 05:00:00', user: 'system',     action: 'Auto-update check',details: 'Version 2.6.0 available',                ip: 'localhost',     sev: 'info'  },
]

// ── Plugins ────────────────────────────────────────────────
export interface Plugin {
  id:            string
  name:          string
  version:       string
  description:   string
  enabled:       boolean
  hasUpdate:     boolean
  updateVersion: string
  color:         string
  category:      string
}

export const PLUGINS: Plugin[] = [
  { id: 'p1', name: 'Docker Manager',    version: '2.1.0', description: 'Container lifecycle management with compose support', enabled: true,  hasUpdate: true,  updateVersion: '2.2.0', color: '#38bdf8', category: 'Infrastructure' },
  { id: 'p2', name: 'Caddy Integration', version: '1.5.2', description: 'Caddy web server configuration and reverse proxy',    enabled: true,  hasUpdate: false, updateVersion: '',      color: '#22c55e', category: 'Web Server' },
  { id: 'p3', name: 'Prometheus Export', version: '3.0.1', description: 'Export metrics in Prometheus scrape format',          enabled: true,  hasUpdate: true,  updateVersion: '3.1.0', color: '#f6ad55', category: 'Monitoring' },
  { id: 'p4', name: 'Slack Alerts',      version: '1.2.0', description: 'Real-time Slack notifications for critical events',   enabled: true,  hasUpdate: false, updateVersion: '',      color: '#a78bfa', category: 'Notifications' },
  { id: 'p5', name: 'GitLab CI Bridge',  version: '2.0.4', description: 'Trigger and monitor GitLab CI/CD pipelines',         enabled: true,  hasUpdate: false, updateVersion: '',      color: '#fc8181', category: 'Deploy' },
  { id: 'p6', name: 'Vault Secrets',     version: '1.0.2', description: 'HashiCorp Vault integration for secret management',   enabled: false, hasUpdate: false, updateVersion: '',      color: '#9ca3af', category: 'Security' },
  { id: 'p7', name: 'S3 Backup Driver',  version: '1.3.0', description: 'Backup configuration to S3-compatible storage',      enabled: false, hasUpdate: false, updateVersion: '',      color: '#9ca3af', category: 'Backup' },
  { id: 'p8', name: 'Telegram Alerts',   version: '1.0.0', description: 'Send alerts to Telegram channels and bots',          enabled: false, hasUpdate: false, updateVersion: '',      color: '#9ca3af', category: 'Notifications' },
]

// ── Notifications ──────────────────────────────────────────
export const NOTIF_EVENTS = [
  { id: 'n1', label: 'Server offline',        email: true,  slack: true,  webhook: true  },
  { id: 'n2', label: 'High CPU usage (>90%)', email: true,  slack: true,  webhook: false },
  { id: 'n3', label: 'Disk full (>95%)',       email: true,  slack: true,  webhook: true  },
  { id: 'n4', label: 'Login failure lockout',  email: true,  slack: false, webhook: false },
  { id: 'n5', label: 'Backup failed',          email: true,  slack: true,  webhook: true  },
  { id: 'n6', label: 'Security scan alert',    email: true,  slack: true,  webhook: false },
  { id: 'n7', label: 'New user registered',    email: false, slack: false, webhook: false },
  { id: 'n8', label: 'Deploy completed',       email: false, slack: true,  webhook: true  },
  { id: 'n9', label: 'SSL cert expiring',      email: true,  slack: true,  webhook: false },
]
