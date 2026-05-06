import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchUsers, createUser, updateUser, deleteUser,
  fetchAPITokens, createAPIToken, revokeAPIToken,
  fetchAuditLog, fetchPlugins,
  fetchSettingsAppearance, saveSettingsAppearance,
  fetchSettingsAuthPolicy, saveSettingsAuthPolicy,
  fetchSettingsAuthMethods, saveSettingsAuthMethods,
  fetchSettingsNotifConfig, saveSettingsNotifConfig,
  fetchSettingsNotifMatrix, saveSettingsNotifMatrix,
  fetchSettingsBackupConfig, saveSettingsBackupConfig,
  fetchSettingsBackupFiles, fetchSettingsSystemInfo,
  settingsBackupNow, exportSettingsConfig, restoreSettingsDefaults,
  fetchSettingsSecurityConfig, saveSettingsSecurityConfig,
  fetchSettingsAPIConfig, saveSettingsAPIConfig,
  fetchSettingsAuditConfig, saveSettingsAuditConfig,
  fetchMetrics,
  testSettingsNotification, checkSettingsUpdates,
  deleteSettingsBackupFile, restoreSettingsBackupFile, downloadSettingsBackupFileURL,
  type BackendUser, type BackendToken, type AuditEntry as BackendAuditEntry, type ApiPlugin,
  type AppearanceSettings, type NotifConfig,
  type BackupConfigSettings, type BackupFileInfo,
  type SecurityConfig, type APIConfig, type AuditConfig,
  type UpdateCheckResult,
} from '@/lib/api'
import styles from './SettingsPage.module.css'

// ─────────────────────────────────────────────────────────
// Types (moved inline — no longer from settingsData)
// ─────────────────────────────────────────────────────────
type UserStatus   = 'active' | 'locked' | 'pending'
type AuthProvider = 'Local' | 'LDAP' | 'OAuth2' | 'SAML'
type AuditSev     = 'info' | 'warn' | 'error'

interface SettingUser {
  id:         string
  username:   string
  fullName:   string
  email:      string
  role:       string
  lastLogin:  string
  status:     UserStatus
  twoFactor:  boolean
  authMethod: AuthProvider
  _rawId?:    number
}

interface APIToken {
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
  _rawId?:     number
}

interface BackupFile {
  id:       string
  filename: string
  date:     string
  size:     string
  auto:     boolean
}

interface AuditEntry {
  id:      string
  ts:      string
  user:    string
  action:  string
  details: string
  ip:      string
  sev:     AuditSev
}

interface Plugin {
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

// ─────────────────────────────────────────────────────────
// Static local constants (no backend equivalent)
// ─────────────────────────────────────────────────────────
const ROLES = [
  { name: 'Super Admin', color: '#ff4d4d', desc: 'Full access to all settings and servers', users: 1 },
  { name: 'Admin',       color: '#ff8c00', desc: 'Manage users, settings; limited system access', users: 0 },
  { name: 'Operator',    color: '#4a9eff', desc: 'Day-to-day operations, no user/security changes', users: 3 },
  { name: 'Auditor',     color: '#a78bfa', desc: 'Read-only + export logs', users: 2 },
  { name: 'Viewer',      color: '#68d391', desc: 'Read-only dashboard', users: 1 },
  { name: 'API Only',    color: '#9ca3af', desc: 'No web UI access; API tokens only', users: 1 },
]

interface AuthMethod { id: string; priority: number; method: AuthProvider; status: 'active' | 'disabled'; config: string }

// ─────────────────────────────────────────────────────────
// Data mapping helpers
// ─────────────────────────────────────────────────────────
const ROLE_MAP: Record<string, string> = {
  admin: 'Super Admin', operator: 'Operator', viewer: 'Viewer', auditor: 'Auditor',
}
function mapUser(u: BackendUser): SettingUser {
  return {
    id: String(u.id),
    username: u.username,
    fullName: u.email ? u.email.split('@')[0] : u.username,
    email: u.email,
    role: ROLE_MAP[u.role] ?? u.role,
    lastLogin: u.created_at ? new Date(u.created_at * 1000).toISOString().replace('T', ' ').slice(0, 16) : 'Never',
    status: 'active',
    twoFactor: false,
    authMethod: 'Local',
    _rawId: u.id,
  }
}

const TOKEN_COLORS = ['#4a9eff', '#22c55e', '#f6ad55', '#a78bfa', '#fc8181', '#38bdf8']
function mapToken(t: BackendToken): APIToken {
  return {
    id: String(t.id),
    name: t.name,
    createdBy: 'system',
    created: new Date(t.created_at * 1000).toISOString().slice(0, 10),
    lastUsed: t.last_used ? new Date(t.last_used * 1000).toLocaleString() : 'Never',
    expires: t.expires_at ? new Date(t.expires_at * 1000).toISOString().slice(0, 10) : 'Never',
    permissions: t.scopes ? t.scopes.split(/[\s,]+/).filter(Boolean) : ['read:servers'],
    ipRestrict: t.ip_restrict || 'Any',
    active: true,
    color: TOKEN_COLORS[t.id % TOKEN_COLORS.length],
    _rawId: t.id,
  }
}

function mapAuditEntry(e: BackendAuditEntry): AuditEntry {
  const sev: AuditSev = e.status >= 500 ? 'error' : e.status >= 400 ? 'warn' : 'info'
  return {
    id: String(e.id),
    ts: new Date(e.ts * 1000).toISOString().replace('T', ' ').slice(0, 19),
    user: e.user || 'system',
    action: `${e.method} ${e.path}`,
    details: e.path,
    ip: e.ip || '—',
    sev,
  }
}

const PLUGIN_COLORS = ['#38bdf8', '#22c55e', '#f6ad55', '#a78bfa', '#fc8181', '#4a9eff', '#68d391', '#e879f9']
function mapPlugin(p: ApiPlugin): Plugin {
  return {
    id: String(p.id),
    name: p.name,
    version: p.version || '1.0.0',
    description: p.description,
    enabled: p.enabled,
    hasUpdate: false,
    updateVersion: '',
    color: p.enabled ? PLUGIN_COLORS[p.id % PLUGIN_COLORS.length] : '#9ca3af',
    category: p.category || 'Plugin',
  }
}

// ─────────────────────────────────────────────────────────
// SVG Icons
// ─────────────────────────────────────────────────────────
const IcoUsers    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="7" r="3"/><path d="M2 18v-1a6 6 0 0 1 12 0v1"/><circle cx="16" cy="7" r="2.5"/><path d="M18 18v-1a4.5 4.5 0 0 0-2-3.8"/></svg>
const IcoLock     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="9" width="12" height="9" rx="1.5"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/><circle cx="10" cy="13.5" r="1.2" fill="currentColor" stroke="none"/></svg>
const IcoPalette  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8"/><circle cx="7" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="13" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="10" cy="14" r="1.2" fill="currentColor" stroke="none"/><circle cx="7" cy="13" r="1.2" fill="currentColor" stroke="none"/><circle cx="13" cy="13" r="1.2" fill="currentColor" stroke="none"/></svg>
const IcoBell     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2a6 6 0 0 1 6 6v3l1.5 2.5h-15L4 11V8a6 6 0 0 1 6-6z"/><path d="M8 15.5a2 2 0 0 0 4 0"/></svg>
const IcoBackup   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 11A7 7 0 1 1 9 4.07"/><polyline points="13,4 17,4 17,8"/><path d="M17 4l-4 4"/><line x1="10" y1="10" x2="10" y2="14"/><polyline points="8,12 10,14 12,12"/></svg>
const IcoApi      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><polyline points="4,7 2,10 4,13"/><polyline points="16,7 18,10 16,13"/><line x1="9" y1="4" x2="11" y2="16"/></svg>
const IcoAudit    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="2" width="14" height="16" rx="2"/><line x1="7" y1="7" x2="13" y2="7"/><line x1="7" y1="10" x2="13" y2="10"/><line x1="7" y1="13" x2="10" y2="13"/></svg>
const IcoShield   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2L4 5v5c0 4 3 7 6 8 3-1 6-4 6-8V5z"/></svg>
const IcoGlobe    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="10" cy="10" r="8"/><line x1="2" y1="10" x2="18" y2="10"/><path d="M10 2a14 14 0 0 1 3.5 8A14 14 0 0 1 10 18A14 14 0 0 1 6.5 10A14 14 0 0 1 10 2z"/></svg>
const IcoPlugin   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><path d="M11 14.5h3m0 0v-3m0 3v3"/></svg>
const IcoRefresh  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 10a7 7 0 0 1-7 7 7 7 0 0 1-5-2"/><polyline points="2,10 3,15 8,14"/></svg>
const IcoUpdate   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l6 6-1.5 1.5L11 6v8H9V6L5.5 9.5 4 8z"/><path d="M4 15h12"/></svg>
const IcoPlus     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg>
const IcoEdit     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4l1 1-9 9-4 1 1-4z"/><line x1="13" y1="6" x2="14" y2="7"/></svg>
const IcoTrash    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 6h10l-1 11H6z"/><path d="M3 6h14M8 3h4"/></svg>
const IcoX        = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
const IcoCheck    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,10 8,14 16,6"/></svg>
const IcoSearch   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="17" y2="17"/></svg>
const IcoList     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></svg>
const IcoGrid     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/></svg>
const IcoChevDn   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5,8 10,13 15,8"/></svg>
const IcoArrowUp  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="15" x2="10" y2="5"/><polyline points="6,9 10,5 14,9"/></svg>
const IcoArrowDn  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="5" x2="10" y2="15"/><polyline points="6,11 10,15 14,11"/></svg>
const IcoSort     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><line x1="4" y1="6" x2="16" y2="6"/><line x1="4" y1="10" x2="12" y2="10"/><line x1="4" y1="14" x2="8" y2="14"/></svg>
const IcoDrag     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="6" r="0.8" fill="currentColor" stroke="none"/><circle cx="13" cy="6" r="0.8" fill="currentColor" stroke="none"/><circle cx="7" cy="10" r="0.8" fill="currentColor" stroke="none"/><circle cx="13" cy="10" r="0.8" fill="currentColor" stroke="none"/><circle cx="7" cy="14" r="0.8" fill="currentColor" stroke="none"/><circle cx="13" cy="14" r="0.8" fill="currentColor" stroke="none"/></svg>
const IcoKey      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="9" r="4"/><path d="M12 9h6M16 7v4"/></svg>
const IcoWarn     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l8 16H2z"/><line x1="10" y1="9" x2="10" y2="13"/><circle cx="10" cy="15.5" r="0.6" fill="currentColor" stroke="none"/></svg>
const IcoInfo     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="10" cy="10" r="8"/><line x1="10" y1="9" x2="10" y2="14"/><circle cx="10" cy="6.5" r="0.7" fill="currentColor" stroke="none"/></svg>
const IcoDownload = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3v10M6 9l4 4 4-4"/><path d="M4 16h12"/></svg>
const IcoUpload   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13V3M6 7l4-4 4 4"/><path d="M4 16h12"/></svg>
const IcoMail     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="16" height="12" rx="1.5"/><polyline points="2,5 10,12 18,5"/></svg>
const IcoSlack    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="2" y="7" width="4" height="4" rx="2"/><rect x="7" y="2" width="4" height="4" rx="2"/><rect x="14" y="7" width="4" height="4" rx="2"/><rect x="7" y="14" width="4" height="4" rx="2"/><path d="M6 9H9M11 9h3M9 6V9M9 11v3M11 9H14M6 11H9"/></svg>
const IcoWebhook  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2"/><path d="M10 12c0 3-2 5-4 5H4"/><path d="M10 12c0 3 2 5 4 5h2"/><path d="M10 8c0-3 2-5 4-5"/><path d="M10 8c0-3-2-5-4-5"/></svg>
const IcoGear     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2.8"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>
const IcoLink     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M11 3h6v6"/><path d="M17 3l-7 7"/><path d="M9 5H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-4"/></svg>
const IcoRevoke   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8"/><line x1="6" y1="6" x2="14" y2="14"/></svg>

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
type MainTab = 'overview' | 'users' | 'auth' | 'appearance' | 'notifications' | 'backup' | 'api' | 'audit' | 'security' | 'updates'
type ViewMode = 'list' | 'grid'

// ─────────────────────────────────────────────────────────
// User Modal
// ─────────────────────────────────────────────────────────
function UserModal({ user, onClose, onSave }: { user: SettingUser | null; onClose: () => void; onSave: (u: SettingUser, password?: string) => void }) {
  const [form, setForm] = useState({
    username:  user?.username  ?? '',
    fullName:  user?.fullName  ?? '',
    email:     user?.email     ?? '',
    role:      user?.role      ?? 'Viewer',
    twoFactor: user?.twoFactor ?? false,
    status:    user?.status    ?? 'active' as SettingUser['status'],
  })
  const [password, setPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) { setForm(f => ({ ...f, [k]: v })) }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <IcoUsers />
          <span className={styles.modalTitle}>{user ? 'Edit User' : 'Add New User'}</span>
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Account Information</div>
          <div className={styles.formGrid2}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Username</label>
              <input className={styles.fieldInput} value={form.username} onChange={e => set('username', e.target.value)} placeholder="johndoe" />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Full Name</label>
              <input className={styles.fieldInput} value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="John Doe" />
            </div>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Email</label>
            <input className={styles.fieldInput} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@example.com" />
          </div>
          <div className={styles.divider} />
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Role & Access</div>
          <div className={styles.formGrid2}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Role</label>
              <select className={styles.fieldSelect} value={form.role} onChange={e => set('role', e.target.value)}>
                {ROLES.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Status</label>
              <select className={styles.fieldSelect} value={form.status} onChange={e => set('status', e.target.value as SettingUser['status'])}>
                <option value="active">Active</option>
                <option value="locked">Locked</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
          <div className={styles.divider} />
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Security</div>
          <div className={styles.checkGroup}>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={form.twoFactor} onChange={e => set('twoFactor', e.target.checked)} />
              <span className={styles.checkLabel}>Require two-factor authentication (TOTP)</span>
            </label>
            {!user && (
              <label className={styles.checkRow}>
                <input type="checkbox" defaultChecked />
                <span className={styles.checkLabel}>Force password change on first login</span>
              </label>
            )}
            <label className={styles.checkRow}>
              <input type="checkbox" defaultChecked />
              <span className={styles.checkLabel}>Send welcome email with login instructions</span>
            </label>
          </div>
          {!user && (
            <>
              <div className={styles.divider} />
              <div className={styles.formGrid2}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Password</label>
                  <input className={styles.fieldInput} type="password" placeholder="min 8 characters" value={password} onChange={e => setPassword(e.target.value)} />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Confirm Password</label>
                  <input className={styles.fieldInput} type="password" placeholder="repeat password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
                </div>
              </div>
            </>
          )}
        </div>
        <div className={styles.modalFoot}>
          <button className={styles.formBtn} onClick={onClose}><IcoX />Cancel</button>
          <button className={`${styles.formBtn} ${styles.formBtnPrimary}`} onClick={() => {
            onSave(
              { id: user?.id ?? `u-${Date.now()}`, authMethod: user?.authMethod ?? 'Local', lastLogin: user?.lastLogin ?? 'Never', _rawId: user?._rawId, ...form },
              !user ? password : undefined,
            )
            onClose()
          }}><IcoCheck />{user ? 'Save Changes' : 'Create User'}</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Token Modal
// ─────────────────────────────────────────────────────────
function TokenModal({ token, onClose, onSave, onGenerate }: {
  token: APIToken | null
  onClose: () => void
  onSave: (t: APIToken) => void
  onGenerate?: (data: { name: string; expires: string; perms: string[]; ipRes: string }) => Promise<string>
}) {
  const [name, setName]       = useState(token?.name    ?? '')
  const [expires, setExp]     = useState('90d')
  const [ipRes, setIp]        = useState(token?.ipRestrict ?? '')
  const [perms, setPerms]     = useState<string[]>(token?.permissions ?? ['read:servers'])
  const [generated, setGen]   = useState(false)
  const [copied, setCopied]   = useState(false)
  const [generating, setGenerating] = useState(false)
  const [realToken, setRealToken]   = useState<string>('')
  const allPerms  = ['read:servers','write:servers','read:metrics','write:deploy','exec:cmd','read:logs','read:uptime','modify:config']
  function togglePerm(p: string) { setPerms(pp => pp.includes(p) ? pp.filter(x => x !== p) : [...pp, p]) }
  function copy() { navigator.clipboard.writeText(realToken).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1800) }
  async function handleGenerate() {
    if (onGenerate) {
      setGenerating(true)
      try {
        const t = await onGenerate({ name, expires, perms, ipRes })
        setRealToken(t)
        setGen(true)
      } catch { /* onGenerate handles its own errors */ }
      finally { setGenerating(false) }
    } else {
      setGen(true)
    }
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <IcoKey />
          <span className={styles.modalTitle}>{token ? 'Edit API Token' : 'Generate API Token'}</span>
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Token Name</label>
            <input className={styles.fieldInput} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. grafana-integration" />
          </div>
          <div className={styles.formGrid2}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Expiration</label>
              <select className={styles.fieldSelect} value={expires} onChange={e => setExp(e.target.value)}>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
                <option value="90d">90 days</option>
                <option value="1y">1 year</option>
                <option value="never">Never</option>
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>IP Restriction (optional)</label>
              <input className={styles.fieldInput} value={ipRes} onChange={e => setIp(e.target.value)} placeholder="10.0.0.0/8, 192.168.1.0/24" />
            </div>
          </div>
          <div>
            <div className={styles.fieldLabel} style={{ marginBottom: 8 }}>Permissions</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {allPerms.map(p => (
                <label key={p} className={styles.checkRow}>
                  <input type="checkbox" checked={perms.includes(p)} onChange={() => togglePerm(p)} />
                  <span className={styles.checkLabel} style={{ fontFamily: 'monospace', fontSize: 11 }}>{p}</span>
                </label>
              ))}
            </div>
          </div>
          {!token && generated && (
            <>
              <div className={styles.divider} />
              <div className={styles.warnBanner}><IcoWarn /><span>Copy this token now. It will not be shown again.</span></div>
              <div className={styles.tokenDisplay}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>{realToken || '—'}</span>
                <button className={styles.tokenDisplayBtn} onClick={copy} disabled={!realToken}>{copied ? 'Copied!' : 'Copy'}</button>
              </div>
            </>
          )}
        </div>
        <div className={styles.modalFoot}>
          <button className={styles.formBtn} onClick={onClose}><IcoX />Cancel</button>
          {!token && !generated ? (
            <button className={`${styles.formBtn} ${styles.formBtnPrimary}`} onClick={handleGenerate} disabled={!name.trim() || generating}>
              <IcoKey />{generating ? 'Generating…' : 'Generate Token'}
            </button>
          ) : (
            <button className={`${styles.formBtn} ${styles.formBtnPrimary}`} onClick={() => {
              if (token) {
                const expiryDays = expires === 'never' ? 0 : expires === '7d' ? 7 : expires === '30d' ? 30 : expires === '90d' ? 90 : 365
                onSave({ id: token.id, name, createdBy: 'admin', created: new Date().toISOString().slice(0,10), lastUsed: 'Never', expires: expires === 'never' ? 'Never' : expires, permissions: perms, ipRestrict: ipRes || 'Any', active: true, color: '#4a9eff', _expiryDays: expiryDays, _scopes: perms.join(' '), _ipRestrict: ipRes } as APIToken & { [k: string]: unknown })
              }
              onClose()
            }}><IcoCheck />{token ? 'Save Changes' : 'Done'}</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Backup Restore Modal
// ─────────────────────────────────────────────────────────
const RESTORE_COMPONENTS = ['Users and roles','Server inventory','Notification channels','API tokens','Custom scripts','Dashboard layouts'] as const

function RestoreModal({ backup, onClose, onConfirm }: { backup: BackupFile; onClose: () => void; onConfirm: (components: string[], conflict: string) => Promise<{ message: string }> }) {
  const [restoring, setRestoring] = useState(false)
  const [done, setDone] = useState(false)
  const [resultMsg, setResultMsg] = useState('')
  const [components, setComponents] = useState<Record<string, boolean>>(Object.fromEntries(RESTORE_COMPONENTS.map(c => [c, true])))
  const [conflict, setConflict] = useState<'overwrite'|'merge'|'skip'>('overwrite')

  async function doRestore() {
    setRestoring(true)
    try {
      const selected = RESTORE_COMPONENTS.filter(c => components[c])
      const result = await onConfirm(selected, conflict)
      setResultMsg(result.message || 'Restore completed successfully.')
      setDone(true)
    } catch (e: any) {
      setResultMsg('Restore failed: ' + e.message)
      setDone(true)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <IcoBackup />
          <span className={styles.modalTitle}>Restore Configuration</span>
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.infoBanner}>
            <IcoInfo />
            <span>Restoring <strong>{backup.filename}</strong> ({backup.date}, {backup.size}). A snapshot of current config will be created first.</span>
          </div>
          <div>
            <div className={styles.fieldLabel} style={{ marginBottom: 8 }}>Components to restore</div>
            <div className={styles.checkGroup}>
              {RESTORE_COMPONENTS.map(c => (
                <label key={c} className={styles.checkRow}>
                  <input type="checkbox" checked={components[c]} onChange={e => setComponents(p => ({ ...p, [c]: e.target.checked }))} />
                  <span className={styles.checkLabel}>{c}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className={styles.fieldLabel} style={{ marginBottom: 8 }}>Conflict resolution</div>
            <div className={styles.checkGroup}>
              {([['overwrite','Overwrite existing'],['merge','Merge (keep both)'],['skip','Skip (keep current)']] as const).map(([val, label]) => (
                <label key={val} className={styles.radioRow}>
                  <input type="radio" name="conflict" checked={conflict === val} onChange={() => setConflict(val)} />
                  <span className={styles.checkLabel}>{label}</span>
                </label>
              ))}
            </div>
          </div>
          {done && (
            <div className={styles.infoBanner} style={{ background: resultMsg.includes('failed') ? 'rgba(255,77,77,0.07)' : 'rgba(34,197,94,0.07)', borderColor: resultMsg.includes('failed') ? 'rgba(255,77,77,0.2)' : 'rgba(34,197,94,0.2)', color: resultMsg.includes('failed') ? '#ff4d4d' : '#22c55e' }}>
              <IcoCheck /><span>{resultMsg}</span>
            </div>
          )}
        </div>
        <div className={styles.modalFoot}>
          <button className={styles.formBtn} onClick={onClose}><IcoX />Cancel</button>
          {!done && <button className={`${styles.formBtn} ${styles.formBtnPrimary}`} onClick={doRestore} disabled={restoring}>
            {restoring ? <><IcoRefresh />Restoring…</> : <><IcoBackup />Confirm Restore</>}
          </button>}
          {done && <button className={styles.formBtn} onClick={onClose}><IcoCheck />Close</button>}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Audit Entry Detail Modal
// ─────────────────────────────────────────────────────────
function AuditDetailModal({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <IcoAudit />
          <span className={styles.modalTitle}>Audit Entry Detail</span>
          <span className={entry.sev === 'error' ? styles.sevError : entry.sev === 'warn' ? styles.sevWarn : styles.sevInfo}>{entry.sev.toUpperCase()}</span>
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          {[['Timestamp',entry.ts],['User',entry.user],['Action',entry.action],['Details',entry.details],['Source IP',entry.ip]].map(([k,v]) => (
            <div key={k} style={{ display: 'flex', gap: 12, fontSize: 12, paddingBottom: 8, borderBottom: '1px solid var(--color-border)', alignItems: 'flex-start' }}>
              <span style={{ minWidth: 100, color: 'var(--color-text-dim)', fontSize: 11, fontWeight: 600 }}>{k}</span>
              <span style={{ color: 'var(--color-text-muted)', fontFamily: k === 'Source IP' || k === 'Timestamp' ? 'monospace' : undefined, fontSize: k === 'Source IP' ? 11 : 12 }}>{v}</span>
            </div>
          ))}
        </div>
        <div className={styles.modalFoot}>
          <button className={styles.formBtn} onClick={onClose}><IcoX />Close</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Helper: sort icon
// ─────────────────────────────────────────────────────────
function SortIcon({ k, sortKey, sortDir }: { k: string; sortKey: string; sortDir: 'asc'|'desc' }) {
  if (sortKey !== k) return <span className={styles.thSortIcon}><IcoSort /></span>
  return <span className={styles.thSortIcon}>{sortDir === 'asc' ? <IcoArrowUp /> : <IcoArrowDn />}</span>
}

// ─────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────
export default function SettingsPage() {
  const qc = useQueryClient()
  const [tab,         setTab]        = useState<MainTab>('overview')
  const [userView,    setUserView]   = useState<ViewMode>('list')
  const [tokenView,   setTokenView]  = useState<ViewMode>('list')
  const [userSearch,  setUserSearch] = useState('')
  const [tokenSearch, setTokSearch]  = useState('')
  const [auditSearch, setAudSearch]  = useState('')
  const [auditSev,    setAudSev]     = useState<AuditSev | 'all'>('all')
  const [userSort,    setUserSort]   = useState('username')
  const [tokenSort,   setTokSort]    = useState('name')
  const [sortDir,     setSortDir]    = useState<'asc'|'desc'>('asc')

  // Local state (optimistic display) — initialized from API
  const [users,       setUsers]      = useState<SettingUser[]>([])
  const [tokens,      setTokens]     = useState<APIToken[]>([])
  const [plugins,     setPlugins]    = useState<Plugin[]>([])
  const [authMethods, setAuthMethods]= useState<AuthMethod[]>([])
  const [notifEvents, setNotifEvents]= useState<{ id:string; label:string; email:boolean; slack:boolean; webhook:boolean }[]>([])

  // Controlled form state for settings sections
  const [appearance, setAppearance] = useState<AppearanceSettings>({
    theme: 'dark', sidebar: 'expanded', density: 'comfortable', refreshInterval: '10', itemsPerPage: '25',
    language: 'en_US', timezone: 'UTC', dateFormat: 'ISO', weekStart: 'Mon',
    showResourceBars: true, animations: true, tooltips: true, compactNumbers: true,
  })
  const [notifConfig, setNotifConfig] = useState<NotifConfig>({
    smtpHost: '', smtpPort: '587', smtpFrom: '', smtpFromName: 'Orbit VPS',
    smtpUsername: '', smtpPassword: '', smtpTLS: true, smtpVerifySSL: true,
    slackWebhook: '', slackChannel: '#alerts', slackUsername: 'Orbit VPS Bot',
    webhookURL: '', webhookMethod: 'POST', webhookHeader: 'X-Orbit-Signature', webhookRetry: true,
  })
  const [backupConfig, setBackupConfig] = useState<BackupConfigSettings>({
    backupTime: '02:00', frequency: 'daily', keepDaily: 30, keepWeekly: 12,
    autoBackup: true, beforeChanges: true, encrypt: true,
    destination: 'local', localDir: '/var/backups/ui-config/', sftpUrl: '', s3Bucket: '',
  })
  const [ldapConfig, setLdapConfig] = useState({ ldapServer: '', ldapPort: '389', ldapBindDN: '', ldapBaseDN: '' })

  const DEFAULT_SECURITY: SecurityConfig = {
    allowedIPRanges: '', blockedIPRanges: '', bruteForceEnabled: true, bruteForceNotify: true,
    logFailedLogins: true, autoBanIP: true, minTLSVersion: '1.2', hstsMaxAge: '31536000',
    redirectHTTPS: true, hstsEnabled: true, hstsSubdomains: true, hstsPreload: false,
    cspHeader: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
    xFrameOptions: true, xContentTypeOptions: true, referrerPolicy: true,
  }
  const DEFAULT_API_CFG: APIConfig = { rateLimit: 100, burstLimit: 20, corsOrigins: '', apiEnabled: true, rateLimitEnabled: true, corsEnabled: false, legacyV0: false }
  const DEFAULT_AUDIT: AuditConfig = {
    logAuth: true, logConfigChange: true, logServerAction: true, logCmdExec: true, logAPIAccess: true,
    logExports: true, retentionDays: 90, maxSizeMB: 100, logLevel: 'info',
    forwardSyslog: true, immutableLog: false, hashChain: false, forwardRemote: false,
  }

  const [securityCfg, setSecurityCfg] = useState<SecurityConfig>(DEFAULT_SECURITY)
  const [apiCfg,      setApiCfg]      = useState<APIConfig>(DEFAULT_API_CFG)
  const [auditCfg,    setAuditCfg]    = useState<AuditConfig>(DEFAULT_AUDIT)

  // Real API queries (existing)
  const { data: rawUsers   = [] } = useQuery({ queryKey: ['settings-users'],   queryFn: fetchUsers,     staleTime: 30000 })
  const { data: rawTokens  = [] } = useQuery({ queryKey: ['settings-tokens'],  queryFn: fetchAPITokens, staleTime: 30000 })
  const { data: auditData       } = useQuery({ queryKey: ['settings-audit'],   queryFn: () => fetchAuditLog(200), staleTime: 15000 })
  const { data: rawPlugins = [] } = useQuery({ queryKey: ['settings-plugins'], queryFn: fetchPlugins,   staleTime: 60000 })

  // New structured settings API queries
  const { data: appearanceCfg  } = useQuery({ queryKey: ['settings-appearance'],   queryFn: fetchSettingsAppearance,  staleTime: 60000 })
  const { data: authPolicyCfg  } = useQuery({ queryKey: ['settings-auth-policy'],  queryFn: fetchSettingsAuthPolicy,  staleTime: 60000 })
  const { data: authMethodsData} = useQuery({ queryKey: ['settings-auth-methods'], queryFn: fetchSettingsAuthMethods, staleTime: 60000 })
  const { data: notifCfgData   } = useQuery({ queryKey: ['settings-notif-config'], queryFn: fetchSettingsNotifConfig, staleTime: 60000 })
  const { data: notifMatrixData} = useQuery({ queryKey: ['settings-notif-matrix'], queryFn: fetchSettingsNotifMatrix, staleTime: 60000 })
  const { data: backupCfgData  } = useQuery({ queryKey: ['settings-backup-config'],queryFn: fetchSettingsBackupConfig,staleTime: 60000 })
  const { data: backupFiles = [] as BackupFileInfo[] } = useQuery({ queryKey: ['settings-backup-files'], queryFn: fetchSettingsBackupFiles, staleTime: 30000, enabled: tab === 'backup' })
  const { data: systemInfo     } = useQuery({ queryKey: ['settings-system-info'],  queryFn: fetchSettingsSystemInfo,  staleTime: 300000 })
  const { data: securityCfgData} = useQuery({ queryKey: ['settings-security-cfg'], queryFn: fetchSettingsSecurityConfig, staleTime: 60000 })
  const { data: apiCfgData     } = useQuery({ queryKey: ['settings-api-cfg'],      queryFn: fetchSettingsAPIConfig,      staleTime: 60000 })
  const { data: auditCfgData   } = useQuery({ queryKey: ['settings-audit-cfg'],    queryFn: fetchSettingsAuditConfig,    staleTime: 60000 })
  const { data: metricsSnap    } = useQuery({ queryKey: ['settings-metrics'],       queryFn: fetchMetrics,                staleTime: 30000, enabled: tab === 'security' })

  // Sync local state from API data (existing)
  useEffect(() => { if (rawUsers.length  > 0) setUsers(rawUsers.map(mapUser))     }, [rawUsers.length])
  useEffect(() => { if (rawTokens.length > 0) setTokens(rawTokens.map(mapToken))  }, [rawTokens.length])
  useEffect(() => { if (rawPlugins.length> 0) setPlugins(rawPlugins.map(mapPlugin))}, [rawPlugins.length])

  // Sync controlled form state from structured settings API
  useEffect(() => { if (appearanceCfg)           setAppearance(p => ({ ...p, ...appearanceCfg }))       }, [appearanceCfg])
  useEffect(() => { if (notifCfgData)             setNotifConfig(p => ({ ...p, ...notifCfgData }))       }, [notifCfgData])
  useEffect(() => { if (backupCfgData)            setBackupConfig(p => ({ ...p, ...backupCfgData }))     }, [backupCfgData])
  useEffect(() => { if (notifMatrixData?.events)  setNotifEvents(notifMatrixData.events)                 }, [notifMatrixData])
  useEffect(() => { if (securityCfgData)          setSecurityCfg(p => ({ ...p, ...securityCfgData }))   }, [securityCfgData])
  useEffect(() => { if (apiCfgData)               setApiCfg(p => ({ ...p, ...apiCfgData }))             }, [apiCfgData])
  useEffect(() => { if (auditCfgData)             setAuditCfg(p => ({ ...p, ...auditCfgData }))         }, [auditCfgData])
  useEffect(() => {
    if (authMethodsData?.methods) {
      setAuthMethods(authMethodsData.methods.map(m => ({
        id: m.id, priority: m.priority, method: m.method as AuthProvider,
        status: m.status as 'active' | 'disabled', config: m.config,
      })))
    }
  }, [authMethodsData])
  useEffect(() => {
    if (authPolicyCfg) {
      setPwdPolicy({
        minLen: authPolicyCfg.minLen, maxAge: authPolicyCfg.maxAge, history: authPolicyCfg.history,
        lockAttempts: authPolicyCfg.lockAttempts, lockDuration: authPolicyCfg.lockDuration, sessionTimeout: authPolicyCfg.sessionTimeout,
      })
      setLdapConfig({ ldapServer: authPolicyCfg.ldapServer, ldapPort: authPolicyCfg.ldapPort, ldapBindDN: authPolicyCfg.ldapBindDN, ldapBaseDN: authPolicyCfg.ldapBaseDN })
    }
  }, [authPolicyCfg])

  const auditEntries: AuditEntry[] = useMemo(
    () => (auditData?.entries ?? []).map(mapAuditEntry),
    [auditData]
  )

  // ── Mutations (users/tokens existing) ──
  const mutCreateUser = useMutation({
    mutationFn: (d: { username: string; email: string; password: string; role: string }) => createUser(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-users'] }),
  })
  const mutUpdateUser = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { email: string; role: string } }) => updateUser(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-users'] }),
  })
  const mutDeleteUser = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-users'] }),
  })
  const mutCreateToken = useMutation({
    mutationFn: (d: { name: string; scopes: string; ip_restrict: string; expiry_days: number }) => createAPIToken(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-tokens'] }),
  })
  const mutRevokeToken = useMutation({
    mutationFn: (id: number) => revokeAPIToken(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-tokens'] }),
  })

  // ── Mutations (settings sections) ──
  const mutSaveAppearance = useMutation({
    mutationFn: () => saveSettingsAppearance(appearance),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-appearance'] }),
  })
  const mutSaveAuthPolicy = useMutation({
    mutationFn: () => saveSettingsAuthPolicy({ ...pwdPolicy, ...ldapConfig, ...(authPolicyCfg ?? {}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-auth-policy'] }),
  })
  const mutSaveAuthMethods = useMutation({
    mutationFn: () => saveSettingsAuthMethods({ methods: authMethods }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-auth-methods'] }),
  })
  const mutSaveNotifConfig = useMutation({
    mutationFn: () => saveSettingsNotifConfig(notifConfig),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-notif-config'] }),
  })
  const mutSaveNotifMatrix = useMutation({
    mutationFn: () => saveSettingsNotifMatrix({ events: notifEvents }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-notif-matrix'] }),
  })
  const mutSaveBackupConfig = useMutation({
    mutationFn: () => saveSettingsBackupConfig(backupConfig),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-backup-config'] }),
  })
  const mutBackupNow = useMutation({
    mutationFn: () => settingsBackupNow(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-backup-files'] }),
  })
  const mutExportConfig = useMutation({ mutationFn: () => exportSettingsConfig() })
  const mutSaveSecurityCfg = useMutation({
    mutationFn: () => saveSettingsSecurityConfig(securityCfg),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-security-cfg'] }),
  })
  const mutSaveApiCfg = useMutation({
    mutationFn: () => saveSettingsAPIConfig(apiCfg),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-api-cfg'] }),
  })
  const mutSaveAuditCfg = useMutation({
    mutationFn: () => saveSettingsAuditConfig(auditCfg),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-audit-cfg'] }),
  })

  // ── New: Notification test ──
  async function handleTestNotif(channel: 'email' | 'slack' | 'webhook') {
    setNotifTestStatus(p => ({ ...p, [channel]: 'pending' }))
    setNotifTestErr(p => ({ ...p, [channel]: '' }))
    try {
      await testSettingsNotification(channel)
      setNotifTestStatus(p => ({ ...p, [channel]: 'ok' }))
      setTimeout(() => setNotifTestStatus(p => ({ ...p, [channel]: 'idle' })), 3000)
    } catch (e: any) {
      setNotifTestStatus(p => ({ ...p, [channel]: 'error' }))
      setNotifTestErr(p => ({ ...p, [channel]: e.message }))
      setTimeout(() => setNotifTestStatus(p => ({ ...p, [channel]: 'idle' })), 5000)
    }
  }

  // ── New: Check updates ──
  async function handleCheckUpdates() {
    setCheckingUpdates(true)
    try {
      const r = await checkSettingsUpdates()
      setUpdateResult(r)
    } catch {}
    finally { setCheckingUpdates(false) }
  }

  // ── New: Backup file delete ──
  const mutDeleteBackupFile = useMutation({
    mutationFn: (id: string) => deleteSettingsBackupFile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-backup-files'] }),
  })

  // ── New: Backup file restore ──
  const mutRestoreBackupFile = useMutation({
    mutationFn: ({ id, components, conflict }: { id: string; components: string[]; conflict: string }) =>
      restoreSettingsBackupFile(id, { components, conflict }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-backup-files'] }),
  })

  // ── New: Import config ──
  async function handleImportConfig() {
    if (!importFile) return
    try {
      const text = await importFile.text()
      const parsed = JSON.parse(text)
      const settings = parsed.settings ?? parsed
      const resp = await fetch('/api/settings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ settings }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      qc.invalidateQueries({ queryKey: ['settings-appearance'] })
      qc.invalidateQueries({ queryKey: ['settings-notif-config'] })
      qc.invalidateQueries({ queryKey: ['settings-backup-config'] })
      setImportConfig(false)
      setImportFile(null)
    } catch (e: any) { alert('Import failed: ' + e.message) }
  }

  const mutRestoreDefaults = useMutation({
    mutationFn: () => restoreSettingsDefaults(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-appearance'] })
      qc.invalidateQueries({ queryKey: ['settings-auth-policy'] })
      qc.invalidateQueries({ queryKey: ['settings-notif-config'] })
      qc.invalidateQueries({ queryKey: ['settings-notif-matrix'] })
      qc.invalidateQueries({ queryKey: ['settings-backup-config'] })
      qc.invalidateQueries({ queryKey: ['settings-auth-methods'] })
      qc.invalidateQueries({ queryKey: ['settings-security-cfg'] })
      qc.invalidateQueries({ queryKey: ['settings-api-cfg'] })
      qc.invalidateQueries({ queryKey: ['settings-audit-cfg'] })
    },
  })

  // Modals
  const [editUser,        setEditUser]       = useState<SettingUser | null>(null)
  const [addUser,         setAddUser]        = useState(false)
  const [editToken,       setEditToken]      = useState<APIToken | null>(null)
  const [addToken,        setAddToken]       = useState(false)
  const [restoreBack,     setRestoreBack]    = useState<BackupFile | null>(null)
  const [auditDetail,     setAuditDetail]    = useState<AuditEntry | null>(null)
  const [deleteUserId,    setDelUser]        = useState<string | null>(null)
  const [importConfigOpen,setImportConfig]   = useState(false)
  const [importFile,      setImportFile]     = useState<File | null>(null)

  // Notification test status: channel -> 'idle'|'pending'|'ok'|'error'
  const [notifTestStatus, setNotifTestStatus] = useState<Record<string, 'idle'|'pending'|'ok'|'error'>>({})
  const [notifTestError,  setNotifTestErr]    = useState<Record<string, string>>({})

  // Update check state
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null)
  const [checkingUpdates, setCheckingUpdates] = useState(false)

  // Update channel + settings controlled state
  const [updateChannel, setUpdateChannel] = useState<'stable'|'beta'|'nightly'>('stable')
  const [updateSettings, setUpdateSettings] = useState({ autoCheck: true, downloadBg: true, securityPatch: false, notifyNew: false })

  // Backup contents controlled checkboxes
  const BACKUP_CONTENTS = ['User accounts and roles','Server inventory (list of managed servers)','Notification channels configuration','API tokens','Custom scripts and scheduled jobs','Dashboard layouts and preferences','Audit logs (last 90 days)'] as const
  const [backupContents, setBackupContents] = useState<Record<string, boolean>>(
    Object.fromEntries(BACKUP_CONTENTS.map(c => [c, true]))
  )

  // Auth form state
  const [pwdPolicy, setPwdPolicy] = useState({ minLen: 12, maxAge: 90, history: 5, lockAttempts: 5, lockDuration: 15, sessionTimeout: 30 })

  function toggleSort(key: string, setSort: (k: string) => void, currentKey: string) {
    if (currentKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setSortDir('asc') }
  }

  // ── Filtered / sorted users ──
  const filteredUsers = useMemo(() => {
    let r = [...users]
    if (userSearch) { const q = userSearch.toLowerCase(); r = r.filter(u => u.username.toLowerCase().includes(q) || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q)) }
    r.sort((a,b) => {
      let cmp = 0
      if (userSort === 'username') cmp = a.username.localeCompare(b.username)
      else if (userSort === 'role')   cmp = a.role.localeCompare(b.role)
      else if (userSort === 'status') cmp = a.status.localeCompare(b.status)
      else if (userSort === 'login')  cmp = a.lastLogin.localeCompare(b.lastLogin)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return r
  }, [users, userSearch, userSort, sortDir])

  // ── Filtered / sorted tokens ──
  const filteredTokens = useMemo(() => {
    let r = [...tokens]
    if (tokenSearch) { const q = tokenSearch.toLowerCase(); r = r.filter(t => t.name.toLowerCase().includes(q) || t.createdBy.toLowerCase().includes(q)) }
    r.sort((a,b) => {
      let cmp = 0
      if (tokenSort === 'name')    cmp = a.name.localeCompare(b.name)
      else if (tokenSort === 'created') cmp = a.created.localeCompare(b.created)
      else if (tokenSort === 'last')    cmp = a.lastUsed.localeCompare(b.lastUsed)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return r
  }, [tokens, tokenSearch, tokenSort, sortDir])

  // ── Filtered audit log ──
  const filteredAudit = useMemo(() => {
    let r = [...auditEntries]
    if (auditSearch) { const q = auditSearch.toLowerCase(); r = r.filter(a => a.user.includes(q) || a.action.toLowerCase().includes(q) || a.details.toLowerCase().includes(q) || a.ip.includes(q)) }
    if (auditSev !== 'all') r = r.filter(a => a.sev === auditSev)
    return r
  }, [auditEntries, auditSearch, auditSev])

  function moveAuthMethod(idx: number, dir: -1|1) {
    setAuthMethods(prev => {
      const next = [...prev]
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= next.length) return prev
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return next.map((m,i) => ({ ...m, priority: i + 1 }))
    })
  }

  function handleSaveUser(u: SettingUser, password?: string) {
    const isNew = !u._rawId
    if (isNew) {
      const roleKey = Object.entries(ROLE_MAP).find(([,v]) => v === u.role)?.[0] ?? u.role.toLowerCase()
      mutCreateUser.mutate({ username: u.username, email: u.email, password: password || 'ChangeMeNow1!', role: roleKey })
      setUsers(prev => [...prev, { ...u, id: `u-${Date.now()}` }])
    } else {
      const roleKey = Object.entries(ROLE_MAP).find(([,v]) => v === u.role)?.[0] ?? u.role.toLowerCase()
      mutUpdateUser.mutate({ id: u._rawId!, data: { email: u.email, role: roleKey } })
      setUsers(prev => prev.map(x => x.id === u.id ? u : x))
    }
  }

  function handleSaveToken(t: APIToken & Record<string, unknown>) {
    const isNew = !t._rawId
    if (isNew) {
      mutCreateToken.mutate({
        name: t.name,
        scopes: (t._scopes as string) || t.permissions.join(' '),
        ip_restrict: (t._ipRestrict as string) || '',
        expiry_days: (t._expiryDays as number) ?? 90,
      })
      setTokens(prev => [...prev, { ...t, id: `t-${Date.now()}` }])
    } else {
      setTokens(prev => prev.map(x => x.id === t.id ? t : x))
    }
  }

  const statusColor = (s: SettingUser['status']) => s === 'active' ? '#22c55e' : s === 'locked' ? '#ff4d4d' : '#f6ad55'

  // ─────────────────────────────────────────────────────────
  // Overview cards data
  // ─────────────────────────────────────────────────────────
  const overviewCards = [
    { id: 'users',   icon: <IcoUsers />,   color: '#4a9eff', title: 'User Management',    bullets: [`${users.filter(u=>u.status==='active').length} active users`, `${ROLES.length} roles configured`, `Total: ${users.length} accounts`],               tab: 'users' as MainTab },
    { id: 'auth',    icon: <IcoLock />,    color: '#a78bfa', title: 'Authentication',      bullets: [`${authMethods.filter(m=>m.status==='active').length} methods active`, '2FA: TOTP enabled', 'Session timeout: 30m'],                               tab: 'auth'  as MainTab },
    { id: 'appear',  icon: <IcoPalette />, color: '#38bdf8', title: 'Appearance',          bullets: [`Theme: ${appearance.theme}`, `Language: ${appearance.language}`, `Timezone: ${appearance.timezone}`],                                            tab: 'appearance' as MainTab },
    { id: 'notif',   icon: <IcoBell />,    color: '#22c55e', title: 'Notifications',       bullets: [notifConfig.smtpHost ? `Email: ${notifConfig.smtpHost}` : 'Email: not configured', notifConfig.slackChannel ? `Slack: ${notifConfig.slackChannel}` : 'Slack: not configured', notifConfig.webhookURL ? 'Webhook: enabled' : 'Webhook: not configured'],  tab: 'notifications' as MainTab },
    { id: 'backup',  icon: <IcoBackup />,  color: '#f6ad55', title: 'Backup & Restore',    bullets: [`Backup time: ${backupConfig.backupTime}`, `Frequency: ${backupConfig.frequency}`, `Retain ${backupConfig.keepDaily} daily backups`],               tab: 'backup' as MainTab },
    { id: 'api',     icon: <IcoApi />,     color: '#fc8181', title: 'API & Tokens',        bullets: [`${tokens.filter(t=>t.active).length} active tokens`, `Rate limit: ${apiCfg.rateLimit}/min`, apiCfg.corsEnabled ? 'CORS: enabled' : 'CORS: disabled'],                                                 tab: 'api'   as MainTab },
    { id: 'audit',   icon: <IcoAudit />,   color: '#9ca3af', title: 'Audit Logging',       bullets: [`Retention: ${auditCfg.retentionDays} days`, `Log level: ${auditCfg.logLevel}`, `${auditEntries.filter(a=>a.sev==='error').length} errors`],                                              tab: 'audit' as MainTab },
    { id: 'sec',     icon: <IcoShield />,  color: '#ff8c00', title: 'Security Policies',   bullets: [`Min password: ${pwdPolicy.minLen} chars`, `Lockout: ${pwdPolicy.lockAttempts} attempts`, `Session: ${pwdPolicy.sessionTimeout}m`],           tab: 'security' as MainTab },
    { id: 'locale',  icon: <IcoGlobe />,   color: '#68d391', title: 'Localization',        bullets: [`Timezone: ${appearance.timezone}`, `Date: ${appearance.dateFormat}`, `Language: ${appearance.language}`],                                          tab: 'appearance' as MainTab },
    { id: 'plugins', icon: <IcoPlugin />,  color: '#e879f9', title: 'Plugins',             bullets: [`${plugins.filter(p=>p.enabled).length} active`, `${plugins.filter(p=>p.hasUpdate).length} updates available`, `${plugins.filter(p=>!p.enabled).length} disabled`], tab: 'updates' as MainTab },
    { id: 'keys',    icon: <IcoKey />,     color: '#fb923c', title: 'API Keys',            bullets: [`${tokens.length} tokens total`, `Last used: recently`, 'Revocation: immediate'],                                                                  tab: 'api'   as MainTab },
    { id: 'updates', icon: <IcoUpdate />,  color: '#818cf8', title: 'Updates',             bullets: [systemInfo ? `Version: ${systemInfo.version}` : 'Version: loading…', systemInfo ? `Channel: ${systemInfo.updateChannel}` : 'Channel: —', systemInfo?.autoCheck ? 'Auto-check: on' : 'Auto-check: off'], tab: 'updates' as MainTab },
  ]

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* ── Quick Actions Bar ── */}
      <div className={styles.quickBar}>
        <span className={styles.quickLabel}>Quick Actions</span>
        <button className={styles.iconBtn} onClick={() => mutBackupNow.mutate()} disabled={mutBackupNow.isPending}>
          <IcoBackup />{mutBackupNow.isPending ? 'Backing up…' : 'Backup Now'}
        </button>
        <button className={styles.iconBtn} onClick={() => mutExportConfig.mutate()} disabled={mutExportConfig.isPending}>
          <IcoDownload />{mutExportConfig.isPending ? 'Exporting…' : 'Export Config'}
        </button>
        <button className={styles.iconBtn} onClick={() => setImportConfig(true)}><IcoUpload />Import Config</button>
        <button className={styles.iconBtn} onClick={() => mutRestoreDefaults.mutate()} disabled={mutRestoreDefaults.isPending}>
          <IcoRefresh />{mutRestoreDefaults.isPending ? 'Restoring…' : 'Restore Defaults'}
        </button>
        <button className={`${styles.iconBtn} ${styles.iconBtnPrimary}`} style={{ marginLeft: 'auto' }} onClick={handleCheckUpdates} disabled={checkingUpdates}>
          <IcoUpdate />{checkingUpdates ? 'Checking…' : 'Check Updates'}
        </button>
      </div>

      {/* ── Stats Row ── */}
      <div className={styles.statsRow}>
        {[
          { label: 'Active Users',   val: users.filter(u=>u.status==='active').length,  color: '#4a9eff', bg: 'rgba(74,158,255,0.1)',   icon: <IcoUsers /> },
          { label: 'API Tokens',     val: tokens.filter(t=>t.active).length,            color: '#22c55e', bg: 'rgba(34,197,94,0.1)',    icon: <IcoKey /> },
          { label: 'Active Plugins', val: plugins.filter(p=>p.enabled).length,          color: '#e879f9', bg: 'rgba(232,121,249,0.1)',  icon: <IcoPlugin /> },
          { label: 'Audit Events',   val: auditEntries.length,                          color: '#9ca3af', bg: 'rgba(156,163,175,0.1)',  icon: <IcoAudit /> },
          { label: 'Plugin Updates', val: plugins.filter(p=>p.hasUpdate).length,        color: '#f6ad55', bg: 'rgba(246,173,85,0.1)',   icon: <IcoRefresh />, warn: true },
        ].map(s => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: s.bg }}>
              <span style={{ color: s.color }}>{s.icon}</span>
            </div>
            <div>
              <div className={styles.statVal} style={{ color: s.color }}>{s.val}</div>
              <div className={styles.statLbl}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className={styles.tabBar}>
        {([
          { id: 'overview',       label: 'Overview',       icon: <IcoGear /> },
          { id: 'users',          label: 'Users',          icon: <IcoUsers />, badge: users.filter(u=>u.status==='locked').length, warn: true },
          { id: 'auth',           label: 'Authentication', icon: <IcoLock /> },
          { id: 'appearance',     label: 'Appearance',     icon: <IcoPalette /> },
          { id: 'notifications',  label: 'Notifications',  icon: <IcoBell /> },
          { id: 'backup',         label: 'Backup',         icon: <IcoBackup /> },
          { id: 'api',            label: 'API & Tokens',   icon: <IcoApi />,   badge: tokens.filter(t=>t.active).length },
          { id: 'audit',          label: 'Audit Log',      icon: <IcoAudit />, badge: auditEntries.filter(a=>a.sev==='error').length, danger: true },
          { id: 'security',       label: 'Security',       icon: <IcoShield /> },
          { id: 'updates',        label: 'Updates',        icon: <IcoUpdate />, badge: plugins.filter(p=>p.hasUpdate).length, warn: true },
        ] as { id: MainTab; label: string; icon: React.ReactNode; badge?: number; warn?: boolean; danger?: boolean }[]).map(t => (
          <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`} onClick={() => setTab(t.id)}>
            {t.icon}{t.label}
            {!!t.badge && t.badge > 0 && (
              <span className={`${styles.tabBadge} ${t.danger ? styles.tabBadgeDanger : t.warn ? styles.tabBadgeWarn : ''}`}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════ OVERVIEW ═══════════ */}
      {tab === 'overview' && (
        <div className={styles.overviewGrid}>
          {overviewCards.map(c => (
            <div key={c.id} className={styles.overviewCard} onClick={() => setTab(c.tab)}>
              <div className={styles.overviewCardAccent} style={{ background: c.color }} />
              <div className={styles.overviewCardHead}>
                <div className={styles.overviewCardIcon} style={{ background: c.color + '1a' }}>
                  <span style={{ color: c.color }}>{c.icon}</span>
                </div>
                <div className={styles.overviewCardTitle}>{c.title}</div>
              </div>
              <div className={styles.overviewCardBullets}>
                {c.bullets.map((b,i) => <div key={i} className={styles.overviewCardBullet}>{b}</div>)}
              </div>
              <button className={styles.overviewCardBtn}><IcoLink />Manage</button>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════ USERS ═══════════ */}
      {tab === 'users' && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}><IcoSearch /></span>
                <input className={styles.searchInput} placeholder="Search users, roles, email…" value={userSearch} onChange={e => setUserSearch(e.target.value)} />
              </div>
              <div className={styles.selectWrap}>
                <select className={styles.tbSelect} value={userSort} onChange={e => { setUserSort(e.target.value); setSortDir('asc') }}>
                  <option value="username">Sort: Name</option>
                  <option value="role">Sort: Role</option>
                  <option value="status">Sort: Status</option>
                  <option value="login">Sort: Last Login</option>
                </select>
                <IcoChevDn />
              </div>
              {(['active','locked','pending'] as const).map(s => (
                <button key={s} className={styles.pill} style={userSearch === s ? { borderColor: statusColor(s), color: statusColor(s), background: statusColor(s)+'1a' } : {}} onClick={() => setUserSearch(s === userSearch ? '' : s)}>
                  {s.charAt(0).toUpperCase()+s.slice(1)}
                </button>
              ))}
            </div>
            <div className={styles.toolbarRight}>
              <div className={styles.viewToggle}>
                <button className={`${styles.viewBtn} ${userView === 'list' ? styles.viewBtnActive : ''}`} onClick={() => setUserView('list')}><IcoList /></button>
                <button className={`${styles.viewBtn} ${userView === 'grid' ? styles.viewBtnActive : ''}`} onClick={() => setUserView('grid')}><IcoGrid /></button>
              </div>
              <button className={`${styles.iconBtn} ${styles.iconBtnPrimary}`} onClick={() => setAddUser(true)}><IcoPlus />Add User</button>
            </div>
          </div>

          {userView === 'list' ? (
            <div className={styles.sectionCard}>
              <div className={styles.sectionHead}>
                <div className={styles.sectionHeadLeft}>
                  <span className={styles.sectionTitle}>Users</span>
                  <span className={styles.resultCount}><strong>{filteredUsers.length}</strong> of {users.length}</span>
                </div>
                <div className={styles.sectionHeadRight}>
                  <button className={styles.iconBtn}><IcoDownload />Export</button>
                </div>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead className={styles.thead}>
                    <tr>
                      <th className={`${styles.th} ${styles.thSort}`} onClick={() => toggleSort('username', setUserSort, userSort)}>
                        Username<SortIcon k="username" sortKey={userSort} sortDir={sortDir} />
                      </th>
                      <th className={styles.th}>Full Name</th>
                      <th className={`${styles.th} ${styles.thSort}`} onClick={() => toggleSort('role', setUserSort, userSort)}>
                        Role<SortIcon k="role" sortKey={userSort} sortDir={sortDir} />
                      </th>
                      <th className={styles.th}>Auth</th>
                      <th className={`${styles.th} ${styles.thSort}`} onClick={() => toggleSort('login', setUserSort, userSort)}>
                        Last Login<SortIcon k="login" sortKey={userSort} sortDir={sortDir} />
                      </th>
                      <th className={`${styles.th} ${styles.thSort}`} onClick={() => toggleSort('status', setUserSort, userSort)}>
                        Status<SortIcon k="status" sortKey={userSort} sortDir={sortDir} />
                      </th>
                      <th className={styles.th}>2FA</th>
                      <th className={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(u => (
                      <tr key={u.id} className={styles.tr} onClick={() => setEditUser(u)}>
                        <td className={`${styles.td} ${styles.tdMono}`} style={{ fontWeight: 600 }}>{u.username}</td>
                        <td className={styles.td}>{u.fullName}</td>
                        <td className={styles.td}>
                          <span className={styles.roleChip} style={{ borderColor: (ROLES.find(r=>r.name===u.role)?.color ?? 'var(--color-border)')+'55', color: ROLES.find(r=>r.name===u.role)?.color ?? 'var(--color-text-dim)' }}>{u.role}</span>
                        </td>
                        <td className={styles.td}><span className={styles.tdMono} style={{ fontSize: 10 }}>{u.authMethod}</span></td>
                        <td className={`${styles.td} ${styles.tdMono}`} style={{ color: 'var(--color-text-dim)', fontSize: 11 }}>{u.lastLogin}</td>
                        <td className={styles.td}>
                          <span className={`${styles.statusBadge} ${u.status === 'active' ? styles.statusActive : u.status === 'locked' ? styles.statusLocked : styles.statusPending}`}>{u.status}</span>
                        </td>
                        <td className={styles.td}>
                          <span className={`${styles.twoFaBadge} ${u.twoFactor ? styles.twoFaOn : styles.twoFaOff}`}>{u.twoFactor ? '2FA' : 'Off'}</span>
                        </td>
                        <td className={styles.td} onClick={e => e.stopPropagation()}>
                          <div className={styles.rowBtns}>
                            <button className={styles.rowBtn} title="Edit" onClick={() => setEditUser(u)}><IcoEdit /></button>
                            <button className={`${styles.rowBtn} ${styles.rowBtnDanger}`} title="Delete" onClick={() => setDelUser(u.id)}><IcoTrash /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className={styles.gridWrap} style={{ padding: 0 }}>
              {filteredUsers.map(u => {
                const roleColor = ROLES.find(r=>r.name===u.role)?.color ?? '#9ca3af'
                return (
                  <div key={u.id} className={styles.gridCard} onClick={() => setEditUser(u)}>
                    <div className={styles.gridCardAccent} style={{ background: roleColor }} />
                    <div className={styles.gridCardBody}>
                      <div className={styles.gridCardTop}>
                        <div>
                          <div className={styles.gridCardTitle} style={{ fontFamily: 'monospace' }}>{u.username}</div>
                          <div className={styles.gridCardSub}>{u.fullName}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                          <span className={`${styles.statusBadge} ${u.status === 'active' ? styles.statusActive : u.status === 'locked' ? styles.statusLocked : styles.statusPending}`}>{u.status}</span>
                          <span className={`${styles.twoFaBadge} ${u.twoFactor ? styles.twoFaOn : styles.twoFaOff}`}>{u.twoFactor ? '2FA' : 'No 2FA'}</span>
                        </div>
                      </div>
                      <div className={styles.gridCardMeta}>
                        <span className={styles.roleChip} style={{ borderColor: roleColor+'55', color: roleColor }}>{u.role}</span>
                        <span style={{ fontSize: 10, color: 'var(--color-text-dim)', fontFamily: 'monospace' }}>{u.authMethod}</span>
                      </div>
                      <div className={styles.gridCardFoot}>
                        <span style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>{u.lastLogin}</span>
                        <div className={styles.gridCardActions} onClick={e => e.stopPropagation()}>
                          <button className={styles.rowBtn} onClick={() => setEditUser(u)}><IcoEdit /></button>
                          <button className={`${styles.rowBtn} ${styles.rowBtnDanger}`} onClick={() => setDelUser(u.id)}><IcoTrash /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Roles section */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionHeadLeft}>
                <span className={styles.sectionTitle}>Roles (RBAC)</span>
                <span className={styles.resultCount}><strong>{ROLES.length}</strong> roles</span>
              </div>
              <div className={styles.sectionHeadRight}>
                <button className={`${styles.iconBtn} ${styles.iconBtnPrimary}`}><IcoPlus />New Role</button>
              </div>
            </div>
            <div className={styles.rolesGrid}>
              {ROLES.map(r => (
                <div key={r.name} className={styles.roleCard} style={{ cursor: 'pointer' }}>
                  <div className={styles.roleCardAccent} style={{ background: r.color }} />
                  <div className={styles.roleCardBody}>
                    <div className={styles.roleCardName} style={{ color: r.color }}>{r.name}</div>
                    <div className={styles.roleCardDesc}>{r.desc}</div>
                    <div className={styles.roleCardFoot}>
                      <span className={styles.roleCardUsers}><strong>{r.users}</strong> user{r.users !== 1 ? 's' : ''}</span>
                      <div className={styles.rowBtns}>
                        <button className={styles.rowBtn}><IcoEdit /></button>
                        <button className={`${styles.rowBtn} ${styles.rowBtnDanger}`}><IcoTrash /></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ═══════════ AUTH ═══════════ */}
      {tab === 'auth' && (
        <>
          {/* Auth Methods priority list */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionHeadLeft}>
                <span className={styles.sectionTitle}>Authentication Methods</span>
                <span style={{ fontSize: 10.5, color: 'var(--color-text-dim)' }}>First match wins — drag to reorder</span>
              </div>
              <div className={styles.sectionHeadRight}>
                <button className={`${styles.iconBtn} ${styles.iconBtnPrimary}`}><IcoPlus />Add Method</button>
                <button className={`${styles.iconBtn} ${styles.iconBtnPrimary}`} onClick={() => mutSaveAuthMethods.mutate()} disabled={mutSaveAuthMethods.isPending}><IcoCheck />{mutSaveAuthMethods.isPending ? 'Saving…' : 'Save Order'}</button>
              </div>
            </div>
            {authMethods.map((m, idx) => (
              <div key={m.id} className={styles.authMethodRow}>
                <span className={styles.authMethodPriority}>{m.priority}</span>
                <span className={styles.dragHandle}><IcoDrag /></span>
                <span className={styles.authMethodName}>{m.method}</span>
                <span className={styles.authMethodConfig}>{m.config}</span>
                <span className={`${styles.statusBadge} ${m.status === 'active' ? styles.statusActive : styles.statusDisabled}`}>{m.status}</span>
                <div className={styles.rowBtns}>
                  <button className={styles.rowBtn} title="Move up" onClick={() => moveAuthMethod(idx, -1)} disabled={idx === 0}><IcoArrowUp /></button>
                  <button className={styles.rowBtn} title="Move down" onClick={() => moveAuthMethod(idx, 1)} disabled={idx === authMethods.length - 1}><IcoArrowDn /></button>
                  <button className={styles.rowBtn}><IcoEdit /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Password policy */}
          <div className={styles.formCard}>
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle}>Password Policy</div>
              <div className={styles.formGrid3}>
                {[
                  { label: 'Min length', key: 'minLen', unit: 'chars', min: 8, max: 32 },
                  { label: 'Max age',    key: 'maxAge', unit: 'days',  min: 0, max: 365 },
                  { label: 'History',    key: 'history', unit: 'passwords', min: 0, max: 24 },
                ].map(f => (
                  <div key={f.key} className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>{f.label}</label>
                    <div className={styles.numRow}>
                      <input className={styles.numInput} type="number" min={f.min} max={f.max}
                        value={(pwdPolicy as any)[f.key]}
                        onChange={e => setPwdPolicy(p => ({ ...p, [f.key]: +e.target.value }))} />
                      <span className={styles.numUnit}>{f.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className={styles.checkGroup} style={{ marginTop: 12 }}>
                {['Require uppercase (A-Z)','Require lowercase (a-z)','Require numbers (0-9)','Require special chars (!@#$%^&*)'].map(r => (
                  <label key={r} className={styles.checkRow}><input type="checkbox" defaultChecked /><span className={styles.checkLabel}>{r}</span></label>
                ))}
              </div>
            </div>
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle}>Session Management</div>
              <div className={styles.formGrid3}>
                {[
                  { label: 'Inactivity timeout', key: 'sessionTimeout', unit: 'min' },
                  { label: 'Lockout attempts',   key: 'lockAttempts',   unit: 'tries' },
                  { label: 'Lockout duration',   key: 'lockDuration',   unit: 'min' },
                ].map(f => (
                  <div key={f.key} className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>{f.label}</label>
                    <div className={styles.numRow}>
                      <input className={styles.numInput} type="number" min={1}
                        value={(pwdPolicy as any)[f.key]}
                        onChange={e => setPwdPolicy(p => ({ ...p, [f.key]: +e.target.value }))} />
                      <span className={styles.numUnit}>{f.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className={styles.checkGroup} style={{ marginTop: 12 }}>
                {['Bind session to IP address (prevents session hijacking)','Force logout on password change','Allow concurrent sessions (max 3)'].map(r => (
                  <label key={r} className={styles.checkRow}><input type="checkbox" defaultChecked={r.includes('logout')} /><span className={styles.checkLabel}>{r}</span></label>
                ))}
              </div>
            </div>
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle}>Two-Factor Authentication (2FA)</div>
              <div className={styles.checkGroup}>
                {['Require 2FA for all admin accounts','Allow users to opt-in to 2FA','Generate 10 recovery backup codes per user'].map((r,i) => (
                  <label key={r} className={styles.checkRow}><input type="checkbox" defaultChecked={i === 0} /><span className={styles.checkLabel}>{r}</span></label>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <div className={styles.fieldLabel} style={{ marginBottom: 8 }}>2FA Method</div>
                <div className={styles.checkGroup}>
                  {['TOTP (Google Authenticator, Authy)','SMS (requires Twilio integration)','WebAuthn (hardware keys — YubiKey)'].map((m,i) => (
                    <label key={m} className={styles.radioRow}><input type="radio" name="twofa" defaultChecked={i === 0} /><span className={styles.checkLabel}>{m}</span></label>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle}>LDAP / Active Directory</div>
              <div className={styles.formGrid2}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>LDAP Server</label>
                  <input className={styles.fieldInput} value={ldapConfig.ldapServer} onChange={e => setLdapConfig(p => ({ ...p, ldapServer: e.target.value }))} placeholder="ldap.example.com" />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Port</label>
                  <input className={styles.fieldInput} value={ldapConfig.ldapPort} onChange={e => setLdapConfig(p => ({ ...p, ldapPort: e.target.value }))} />
                </div>
              </div>
              <div className={styles.formGrid2} style={{ marginTop: 10 }}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Bind DN</label>
                  <input className={styles.fieldInput} value={ldapConfig.ldapBindDN} onChange={e => setLdapConfig(p => ({ ...p, ldapBindDN: e.target.value }))} placeholder="cn=admin,dc=example,dc=com" />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Base DN</label>
                  <input className={styles.fieldInput} value={ldapConfig.ldapBaseDN} onChange={e => setLdapConfig(p => ({ ...p, ldapBaseDN: e.target.value }))} placeholder="ou=users,dc=example,dc=com" />
                </div>
              </div>
              <div className={styles.checkGroup} style={{ marginTop: 10 }}>
                {['Use TLS/SSL (LDAPS)','Auto-create users on first login','Sync group membership on each login','Fallback to local auth if LDAP unavailable'].map(r => (
                  <label key={r} className={styles.checkRow}><input type="checkbox" defaultChecked={!r.includes('Fallback')} /><span className={styles.checkLabel}>{r}</span></label>
                ))}
              </div>
            </div>
            <div className={styles.formFoot}>
              <button className={styles.formBtn}><IcoRefresh />Test Policy</button>
              <button className={`${styles.formBtn} ${styles.formBtnPrimary}`} onClick={() => mutSaveAuthPolicy.mutate()} disabled={mutSaveAuthPolicy.isPending}><IcoCheck />{mutSaveAuthPolicy.isPending ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>
        </>
      )}

      {/* ═══════════ APPEARANCE ═══════════ */}
      {tab === 'appearance' && (
        <div className={styles.formCard}>
          <div className={styles.appearanceSection}>
            <div className={styles.appearanceSectionTitle}>Theme</div>
            <div className={styles.themeGrid}>
              {[
                { label: 'Dark',        key: 'dark',  active: true  },
                { label: 'Light',       key: 'light', active: false },
                { label: 'Deep Ocean',  key: 'ocean', active: false },
                { label: 'Solarized',   key: 'solar', active: false },
              ].map(t => (
                <div key={t.key} className={`${styles.themeCard} ${t.active ? styles.themeCardActive : ''}`}>
                  <div className={`${styles.themePreview} ${t.key === 'light' ? styles.themePreviewLight : ''}`}
                    style={t.key === 'ocean' ? { background: '#0d1b2a' } : t.key === 'solar' ? { background: '#fdf6e3' } : undefined}>
                    <div className={styles.themePreviewSidebar}
                      style={t.key === 'ocean' ? { background: '#0a1628' } : t.key === 'solar' ? { background: '#eee8d5' } : undefined} />
                    <div className={styles.themePreviewMain}
                      style={t.key === 'ocean' ? { background: '#0d1b2a' } : t.key === 'solar' ? { background: '#fdf6e3' } : undefined}>
                      <div className={styles.themePreviewBar} />
                      <div className={styles.themePreviewCard} />
                      <div className={styles.themePreviewCard} />
                    </div>
                  </div>
                  <div className={styles.themeLabel}>{t.label}{t.active && ' (active)'}</div>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.appearanceSection}>
            <div className={styles.appearanceSectionTitle}>Display Preferences</div>
            <div className={styles.formGrid2}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Sidebar default</label>
                <select className={styles.fieldSelect} value={appearance.sidebar} onChange={e => setAppearance(p => ({ ...p, sidebar: e.target.value }))}>
                  <option value="expanded">Expanded</option>
                  <option value="collapsed">Collapsed</option>
                  <option value="auto">Auto (save last state)</option>
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Table density</label>
                <select className={styles.fieldSelect} value={appearance.density} onChange={e => setAppearance(p => ({ ...p, density: e.target.value }))}>
                  <option value="compact">Compact</option>
                  <option value="comfortable">Comfortable</option>
                  <option value="spacious">Spacious</option>
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Auto-refresh interval</label>
                <select className={styles.fieldSelect} value={appearance.refreshInterval} onChange={e => setAppearance(p => ({ ...p, refreshInterval: e.target.value }))}>
                  <option value="5">5 seconds</option>
                  <option value="10">10 seconds</option>
                  <option value="30">30 seconds</option>
                  <option value="60">60 seconds</option>
                  <option value="0">Disabled</option>
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Items per page</label>
                <select className={styles.fieldSelect} value={appearance.itemsPerPage} onChange={e => setAppearance(p => ({ ...p, itemsPerPage: e.target.value }))}>
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
            </div>
            <div className={styles.checkGroup} style={{ marginTop: 12 }}>
              <label className={styles.checkRow}><input type="checkbox" checked={appearance.showResourceBars} onChange={e => setAppearance(p => ({ ...p, showResourceBars: e.target.checked }))} /><span className={styles.checkLabel}>Show server resource bars in sidebar</span></label>
              <label className={styles.checkRow}><input type="checkbox" checked={appearance.animations}      onChange={e => setAppearance(p => ({ ...p, animations: e.target.checked }))} /><span className={styles.checkLabel}>Enable animations and transitions</span></label>
              <label className={styles.checkRow}><input type="checkbox" checked={appearance.tooltips}        onChange={e => setAppearance(p => ({ ...p, tooltips: e.target.checked }))} /><span className={styles.checkLabel}>Show tooltips on hover</span></label>
              <label className={styles.checkRow}><input type="checkbox" checked={appearance.compactNumbers}  onChange={e => setAppearance(p => ({ ...p, compactNumbers: e.target.checked }))} /><span className={styles.checkLabel}>Compact number formatting (K, M)</span></label>
            </div>
          </div>
          <div className={styles.appearanceSection}>
            <div className={styles.appearanceSectionTitle}>Localization</div>
            <div className={styles.formGrid2}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Language</label>
                <select className={styles.fieldSelect} value={appearance.language} onChange={e => setAppearance(p => ({ ...p, language: e.target.value }))}>
                  <option value="en_US">English (US)</option>
                  <option value="en_GB">English (UK)</option>
                  <option value="de_DE">Deutsch</option>
                  <option value="fr_FR">Français</option>
                  <option value="ja_JP">日本語</option>
                  <option value="zh_CN">中文 (简体)</option>
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Timezone</label>
                <select className={styles.fieldSelect} value={appearance.timezone} onChange={e => setAppearance(p => ({ ...p, timezone: e.target.value }))}>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="America/Los_Angeles">America/Los_Angeles</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="Europe/Berlin">Europe/Berlin</option>
                  <option value="Asia/Tokyo">Asia/Tokyo</option>
                  <option value="Asia/Shanghai">Asia/Shanghai</option>
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Date format</label>
                <select className={styles.fieldSelect} value={appearance.dateFormat} onChange={e => setAppearance(p => ({ ...p, dateFormat: e.target.value }))}>
                  <option value="ISO">YYYY-MM-DD (ISO 8601)</option>
                  <option value="US">MM/DD/YYYY</option>
                  <option value="EU">DD/MM/YYYY</option>
                  <option value="long">May 3, 2026</option>
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>First day of week</label>
                <select className={styles.fieldSelect} value={appearance.weekStart} onChange={e => setAppearance(p => ({ ...p, weekStart: e.target.value }))}>
                  <option value="Mon">Monday</option>
                  <option value="Sun">Sunday</option>
                  <option value="Sat">Saturday</option>
                </select>
              </div>
            </div>
          </div>
          <div className={styles.formFoot}>
            <button className={styles.formBtn}><IcoRefresh />Reset to Defaults</button>
            <button className={`${styles.formBtn} ${styles.formBtnPrimary}`} onClick={() => mutSaveAppearance.mutate()} disabled={mutSaveAppearance.isPending}><IcoCheck />{mutSaveAppearance.isPending ? 'Saving…' : 'Save Preferences'}</button>
          </div>
        </div>
      )}

      {/* ═══════════ NOTIFICATIONS ═══════════ */}
      {tab === 'notifications' && (
        <>
          {/* SMTP Email */}
          <div className={styles.formCard}>
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IcoMail />Email (SMTP)</div>
              <div className={styles.formGrid2}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>SMTP Server</label>
                  <input className={styles.fieldInput} value={notifConfig.smtpHost} onChange={e => setNotifConfig(p => ({ ...p, smtpHost: e.target.value }))} placeholder="smtp.gmail.com" />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Port</label>
                  <input className={styles.fieldInput} value={notifConfig.smtpPort} onChange={e => setNotifConfig(p => ({ ...p, smtpPort: e.target.value }))} />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>From Address</label>
                  <input className={styles.fieldInput} value={notifConfig.smtpFrom} onChange={e => setNotifConfig(p => ({ ...p, smtpFrom: e.target.value }))} placeholder="admin@example.com" />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>From Name</label>
                  <input className={styles.fieldInput} value={notifConfig.smtpFromName} onChange={e => setNotifConfig(p => ({ ...p, smtpFromName: e.target.value }))} />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Username</label>
                  <input className={styles.fieldInput} value={notifConfig.smtpUsername} onChange={e => setNotifConfig(p => ({ ...p, smtpUsername: e.target.value }))} placeholder="admin@example.com" />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Password</label>
                  <input className={styles.fieldInput} type="password" value={notifConfig.smtpPassword} onChange={e => setNotifConfig(p => ({ ...p, smtpPassword: e.target.value }))} placeholder="••••••••••••" />
                </div>
              </div>
              <div className={styles.checkGroup} style={{ marginTop: 10 }}>
                <label className={styles.checkRow}><input type="checkbox" checked={notifConfig.smtpTLS}       onChange={e => setNotifConfig(p => ({ ...p, smtpTLS: e.target.checked }))} /><span className={styles.checkLabel}>Use TLS/STARTTLS encryption</span></label>
                <label className={styles.checkRow}><input type="checkbox" checked={notifConfig.smtpVerifySSL} onChange={e => setNotifConfig(p => ({ ...p, smtpVerifySSL: e.target.checked }))} /><span className={styles.checkLabel}>Verify SSL certificate</span></label>
              </div>
            </div>

            {/* Slack */}
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IcoSlack />Slack</div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Webhook URL</label>
                <input className={styles.fieldInput} value={notifConfig.slackWebhook} onChange={e => setNotifConfig(p => ({ ...p, slackWebhook: e.target.value }))} placeholder="https://hooks.slack.com/services/…" />
              </div>
              <div className={styles.formGrid2} style={{ marginTop: 10 }}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Channel</label>
                  <input className={styles.fieldInput} value={notifConfig.slackChannel} onChange={e => setNotifConfig(p => ({ ...p, slackChannel: e.target.value }))} />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Username</label>
                  <input className={styles.fieldInput} value={notifConfig.slackUsername} onChange={e => setNotifConfig(p => ({ ...p, slackUsername: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Webhook */}
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IcoWebhook />Generic Webhook</div>
              <div className={styles.formGrid2}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Endpoint URL</label>
                  <input className={styles.fieldInput} value={notifConfig.webhookURL} onChange={e => setNotifConfig(p => ({ ...p, webhookURL: e.target.value }))} placeholder="https://hooks.example.com/orbit" />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>HTTP Method</label>
                  <select className={styles.fieldSelect} value={notifConfig.webhookMethod} onChange={e => setNotifConfig(p => ({ ...p, webhookMethod: e.target.value }))}>
                    <option>POST</option><option>PUT</option><option>PATCH</option>
                  </select>
                </div>
              </div>
              <div className={styles.fieldGroup} style={{ marginTop: 10 }}>
                <label className={styles.fieldLabel}>Secret Header (HMAC-SHA256)</label>
                <input className={styles.fieldInput} value={notifConfig.webhookHeader} onChange={e => setNotifConfig(p => ({ ...p, webhookHeader: e.target.value }))} />
              </div>
              <div className={styles.checkGroup} style={{ marginTop: 10 }}>
                <label className={styles.checkRow}><input type="checkbox" checked={notifConfig.webhookRetry} onChange={e => setNotifConfig(p => ({ ...p, webhookRetry: e.target.checked }))} /><span className={styles.checkLabel}>Retry on failure — up to 3 times, 5s delay</span></label>
              </div>
            </div>
            <div className={styles.formFoot}>
              {(['email','slack','webhook'] as const).map(ch => {
                const st = notifTestStatus[ch] ?? 'idle'
                const label = ch === 'email' ? 'Send Test Email' : ch === 'slack' ? 'Test Slack' : 'Test Webhook'
                const Icon  = ch === 'email' ? IcoMail : ch === 'slack' ? IcoSlack : IcoWebhook
                const color = st === 'ok' ? '#22c55e' : st === 'error' ? '#ff4d4d' : undefined
                return (
                  <div key={ch} style={{ display:'flex', flexDirection:'column', gap:2 }}>
                    <button
                      className={styles.formBtn}
                      style={color ? { borderColor: color, color } : undefined}
                      disabled={st === 'pending'}
                      onClick={() => handleTestNotif(ch)}
                    >
                      <Icon />{st === 'pending' ? 'Testing…' : st === 'ok' ? 'Sent!' : st === 'error' ? 'Failed' : label}
                    </button>
                    {st === 'error' && notifTestError[ch] && (
                      <span style={{ fontSize:10, color:'#ff4d4d', maxWidth:180, lineHeight:1.3 }}>{notifTestError[ch]}</span>
                    )}
                  </div>
                )
              })}
              <button className={`${styles.formBtn} ${styles.formBtnPrimary}`} onClick={() => mutSaveNotifConfig.mutate()} disabled={mutSaveNotifConfig.isPending}><IcoCheck />{mutSaveNotifConfig.isPending ? 'Saving…' : 'Save All'}</button>
            </div>
          </div>

          {/* Event matrix */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionTitle}>Notification Events</span>
              <button className={`${styles.iconBtn} ${styles.iconBtnPrimary}`} onClick={() => mutSaveNotifMatrix.mutate()} disabled={mutSaveNotifMatrix.isPending}><IcoCheck />{mutSaveNotifMatrix.isPending ? 'Saving…' : 'Save Matrix'}</button>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.notifTable}>
                <thead>
                  <tr>
                    <th className={styles.notifTh}>Event</th>
                    <th className={`${styles.notifTh} ${styles.notifTdCenter}`}>Email</th>
                    <th className={`${styles.notifTh} ${styles.notifTdCenter}`}>Slack</th>
                    <th className={`${styles.notifTh} ${styles.notifTdCenter}`}>Webhook</th>
                  </tr>
                </thead>
                <tbody>
                  {notifEvents.map(ev => (
                    <tr key={ev.id} className={styles.tr}>
                      <td className={styles.notifTd} style={{ color: 'var(--color-text)', fontSize: 12 }}>{ev.label}</td>
                      {(['email','slack','webhook'] as const).map(ch => (
                        <td key={ch} className={`${styles.notifTd} ${styles.notifTdCenter}`}>
                          <input type="checkbox" checked={(ev as any)[ch]}
                            onChange={() => setNotifEvents(prev => prev.map(e => e.id === ev.id ? { ...e, [ch]: !(ev as any)[ch] } : e))}
                            style={{ cursor: 'pointer', accentColor: 'var(--color-accent)' }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══════════ BACKUP ═══════════ */}
      {tab === 'backup' && (
        <>
          <div className={styles.formCard}>
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle}>Backup Contents</div>
              <div className={styles.checkGroup}>
                {BACKUP_CONTENTS.map(c => (
                  <label key={c} className={styles.checkRow}>
                    <input type="checkbox" checked={backupContents[c]} onChange={e => setBackupContents(p => ({ ...p, [c]: e.target.checked }))} />
                    <span className={styles.checkLabel}>{c}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle}>Schedule & Retention</div>
              <div className={styles.formGrid2}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Backup Time</label>
                  <select className={styles.fieldSelect} value={backupConfig.backupTime} onChange={e => setBackupConfig(p => ({ ...p, backupTime: e.target.value }))}><option value="00:00">00:00</option><option value="02:00">02:00</option><option value="04:00">04:00</option><option value="06:00">06:00</option></select>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Frequency</label>
                  <select className={styles.fieldSelect} value={backupConfig.frequency} onChange={e => setBackupConfig(p => ({ ...p, frequency: e.target.value }))}><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Keep daily backups</label>
                  <div className={styles.numRow}><input className={styles.numInput} type="number" value={backupConfig.keepDaily} onChange={e => setBackupConfig(p => ({ ...p, keepDaily: +e.target.value }))} /><span className={styles.numUnit}>days</span></div>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Keep weekly backups</label>
                  <div className={styles.numRow}><input className={styles.numInput} type="number" value={backupConfig.keepWeekly} onChange={e => setBackupConfig(p => ({ ...p, keepWeekly: +e.target.value }))} /><span className={styles.numUnit}>weeks</span></div>
                </div>
              </div>
              <div className={styles.checkGroup} style={{ marginTop: 12 }}>
                <label className={styles.checkRow}><input type="checkbox" checked={backupConfig.autoBackup}    onChange={e => setBackupConfig(p => ({ ...p, autoBackup: e.target.checked }))} /><span className={styles.checkLabel}>Automatic daily backup</span></label>
                <label className={styles.checkRow}><input type="checkbox" checked={backupConfig.beforeChanges} onChange={e => setBackupConfig(p => ({ ...p, beforeChanges: e.target.checked }))} /><span className={styles.checkLabel}>Backup before configuration changes</span></label>
                <label className={styles.checkRow}><input type="checkbox" checked={backupConfig.encrypt}       onChange={e => setBackupConfig(p => ({ ...p, encrypt: e.target.checked }))} /><span className={styles.checkLabel}>Encrypt backups (AES-256)</span></label>
              </div>
            </div>
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle}>Backup Destination</div>
              <div className={styles.checkGroup}>
                <label className={styles.radioRow}><input type="radio" name="dest" checked={backupConfig.destination === 'local'} onChange={() => setBackupConfig(p => ({ ...p, destination: 'local' }))} /><span className={styles.checkLabel}>Local directory: <code style={{ fontFamily:'monospace', fontSize:11 }}>{backupConfig.localDir || '/var/backups/ui-config/'}</code></span></label>
                <label className={styles.radioRow}><input type="radio" name="dest" checked={backupConfig.destination === 'sftp'}  onChange={() => setBackupConfig(p => ({ ...p, destination: 'sftp' }))} /><span className={styles.checkLabel}>Remote SFTP: <code style={{ fontFamily:'monospace', fontSize:11 }}>{backupConfig.sftpUrl  || 'sftp://backup.example.com/backups/'}</code></span></label>
                <label className={styles.radioRow}><input type="radio" name="dest" checked={backupConfig.destination === 's3'}    onChange={() => setBackupConfig(p => ({ ...p, destination: 's3' }))} /><span className={styles.checkLabel}>S3 bucket: <code style={{ fontFamily:'monospace', fontSize:11 }}>{backupConfig.s3Bucket || 's3://my-backups/ui/'}</code></span></label>
              </div>
            </div>
            <div className={styles.formFoot}>
              <button className={`${styles.formBtn} ${styles.iconBtnPrimary}`} style={{ border: '1px solid var(--color-accent)', color: 'var(--color-accent)', background: 'rgba(74,158,255,0.06)' }} onClick={() => mutBackupNow.mutate()} disabled={mutBackupNow.isPending}><IcoBackup />{mutBackupNow.isPending ? 'Backing up…' : 'Backup Now'}</button>
              <a
                className={styles.formBtn}
                href={backupFiles.length > 0 ? downloadSettingsBackupFileURL(String(backupFiles[0].id)) : '#'}
                download
                onClick={e => { if (backupFiles.length === 0) e.preventDefault() }}
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <IcoDownload />Download Latest
              </a>
              <button className={`${styles.formBtn} ${styles.formBtnPrimary}`} onClick={() => mutSaveBackupConfig.mutate()} disabled={mutSaveBackupConfig.isPending}><IcoCheck />{mutSaveBackupConfig.isPending ? 'Saving…' : 'Save Settings'}</button>
            </div>
          </div>

          {/* Backup files list */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionHeadLeft}>
                <span className={styles.sectionTitle}>Available Backups</span>
                <span className={styles.resultCount}><strong>{backupFiles.length}</strong> files</span>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead className={styles.thead}>
                  <tr>
                    <th className={styles.th}>Filename</th>
                    <th className={styles.th}>Date</th>
                    <th className={styles.th}>Size</th>
                    <th className={styles.th}>Type</th>
                    <th className={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backupFiles.length === 0 ? (
                    <tr><td colSpan={5} className={styles.td} style={{ textAlign:'center', color:'var(--color-text-dim)', fontSize:12, padding:'20px 0' }}>No backups found.</td></tr>
                  ) : backupFiles.map(b => (
                    <tr key={b.id} className={styles.tr}>
                      <td className={`${styles.td} ${styles.tdMono}`} style={{ fontSize: 11 }}>{b.filename}</td>
                      <td className={`${styles.td} ${styles.tdMono}`} style={{ color: 'var(--color-text-dim)', fontSize: 11 }}>{b.date}</td>
                      <td className={styles.td}>{b.size}</td>
                      <td className={styles.td}><span className={b.auto ? styles.autoChip : styles.manualChip}>{b.auto ? 'Auto' : 'Manual'}</span></td>
                      <td className={styles.td} onClick={e => e.stopPropagation()}>
                        <div className={styles.rowBtns}>
                          <a
                            className={styles.rowBtn}
                            href={downloadSettingsBackupFileURL(String(b.id))}
                            download
                            title="Download"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          ><IcoDownload /></a>
                          <button className={`${styles.rowBtn}`} title="Restore" onClick={() => setRestoreBack(b as any)}><IcoBackup /></button>
                          <button
                            className={`${styles.rowBtn} ${styles.rowBtnDanger}`}
                            title="Delete"
                            disabled={mutDeleteBackupFile.isPending}
                            onClick={() => { if (confirm('Delete this backup?')) mutDeleteBackupFile.mutate(String(b.id)) }}
                          ><IcoTrash /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══════════ API & TOKENS ═══════════ */}
      {tab === 'api' && (
        <>
          {/* API Config */}
          <div className={styles.formCard}>
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle}>API Configuration</div>
              <div className={styles.infoBanner} style={{ marginBottom: 12 }}>
                <IcoInfo />
                <span>API endpoint: <code style={{ fontFamily:'monospace', fontSize:11 }}>https://your-server/api/v1</code> — Swagger docs available at <code style={{ fontFamily:'monospace', fontSize:11 }}>/api/docs</code></span>
              </div>
              <div className={styles.formGrid2}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Rate limit (per token / min)</label>
                  <div className={styles.numRow}>
                    <input className={styles.numInput} type="number" value={apiCfg.rateLimit}
                      onChange={e => setApiCfg(p => ({ ...p, rateLimit: +e.target.value }))} />
                    <span className={styles.numUnit}>req/min</span>
                  </div>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Burst limit</label>
                  <div className={styles.numRow}>
                    <input className={styles.numInput} type="number" value={apiCfg.burstLimit}
                      onChange={e => setApiCfg(p => ({ ...p, burstLimit: +e.target.value }))} />
                    <span className={styles.numUnit}>req</span>
                  </div>
                </div>
              </div>
              <div className={styles.fieldGroup} style={{ marginTop: 10 }}>
                <label className={styles.fieldLabel}>CORS Allowed Origins</label>
                <input className={styles.fieldInput} value={apiCfg.corsOrigins} placeholder="https://my-app.example.com, http://localhost:3000"
                  onChange={e => setApiCfg(p => ({ ...p, corsOrigins: e.target.value }))} />
              </div>
              <div className={styles.checkGroup} style={{ marginTop: 10 }}>
                {([
                  ['apiEnabled',        'Enable API (disabling blocks all token access)'],
                  ['rateLimitEnabled',  'Enable rate limiting'],
                  ['corsEnabled',       'Allow cross-origin requests (CORS)'],
                  ['legacyV0',          'Support legacy v0 API (deprecated)'],
                ] as [keyof APIConfig, string][]).map(([k, label]) => (
                  <label key={k} className={styles.checkRow}>
                    <input type="checkbox" checked={apiCfg[k] as boolean}
                      onChange={e => setApiCfg(p => ({ ...p, [k]: e.target.checked }))} />
                    <span className={styles.checkLabel}>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.formFoot}>
              <button className={styles.formBtn}><IcoLink />View API Docs</button>
              <button className={`${styles.formBtn} ${styles.formBtnPrimary}`}
                onClick={() => mutSaveApiCfg.mutate()} disabled={mutSaveApiCfg.isPending}>
                <IcoCheck />{mutSaveApiCfg.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          {/* Tokens toolbar */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}><IcoSearch /></span>
                <input className={styles.searchInput} placeholder="Search tokens, owners…" value={tokenSearch} onChange={e => setTokSearch(e.target.value)} />
              </div>
              <div className={styles.selectWrap}>
                <select className={styles.tbSelect} value={tokenSort} onChange={e => { setTokSort(e.target.value); setSortDir('asc') }}>
                  <option value="name">Sort: Name</option>
                  <option value="created">Sort: Created</option>
                  <option value="last">Sort: Last Used</option>
                </select>
                <IcoChevDn />
              </div>
            </div>
            <div className={styles.toolbarRight}>
              <div className={styles.viewToggle}>
                <button className={`${styles.viewBtn} ${tokenView === 'list' ? styles.viewBtnActive : ''}`} onClick={() => setTokenView('list')}><IcoList /></button>
                <button className={`${styles.viewBtn} ${tokenView === 'grid' ? styles.viewBtnActive : ''}`} onClick={() => setTokenView('grid')}><IcoGrid /></button>
              </div>
              <button className={`${styles.iconBtn} ${styles.iconBtnPrimary}`} onClick={() => setAddToken(true)}><IcoPlus />Generate Token</button>
              <button className={styles.iconBtn}><IcoRevoke />Revoke Expired</button>
            </div>
          </div>

          {tokenView === 'list' ? (
            <div className={styles.sectionCard}>
              <div className={styles.sectionHead}>
                <div className={styles.sectionHeadLeft}>
                  <span className={styles.sectionTitle}>API Tokens</span>
                  <span className={styles.resultCount}><strong>{filteredTokens.length}</strong> of {tokens.length}</span>
                </div>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead className={styles.thead}>
                    <tr>
                      <th className={`${styles.th} ${styles.thSort}`} onClick={() => toggleSort('name', setTokSort, tokenSort)}>Token Name<SortIcon k="name" sortKey={tokenSort} sortDir={sortDir} /></th>
                      <th className={styles.th}>Created By</th>
                      <th className={`${styles.th} ${styles.thSort}`} onClick={() => toggleSort('created', setTokSort, tokenSort)}>Created<SortIcon k="created" sortKey={tokenSort} sortDir={sortDir} /></th>
                      <th className={`${styles.th} ${styles.thSort}`} onClick={() => toggleSort('last', setTokSort, tokenSort)}>Last Used<SortIcon k="last" sortKey={tokenSort} sortDir={sortDir} /></th>
                      <th className={styles.th}>Expires</th>
                      <th className={styles.th}>Status</th>
                      <th className={styles.th}>IP Restrict</th>
                      <th className={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTokens.map(t => (
                      <tr key={t.id} className={styles.tr} onClick={() => setEditToken(t)}>
                        <td className={styles.td}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0, display: 'inline-block' }} />
                            <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{t.name}</span>
                          </span>
                        </td>
                        <td className={`${styles.td} ${styles.tdMono}`}>{t.createdBy}</td>
                        <td className={`${styles.td} ${styles.tdMono}`} style={{ color: 'var(--color-text-dim)', fontSize: 11 }}>{t.created}</td>
                        <td className={`${styles.td} ${styles.tdMono}`} style={{ color: 'var(--color-text-dim)', fontSize: 11 }}>{t.lastUsed}</td>
                        <td className={`${styles.td} ${styles.tdMono}`} style={{ fontSize: 11, color: t.expires === 'Never' ? 'var(--color-text-dim)' : '#f6ad55' }}>{t.expires}</td>
                        <td className={styles.td}>
                          <span className={`${styles.statusBadge} ${t.active ? styles.statusActive : styles.statusDisabled}`}>{t.active ? 'Active' : 'Revoked'}</span>
                        </td>
                        <td className={`${styles.td} ${styles.tdMono}`} style={{ fontSize: 10.5, color: 'var(--color-text-dim)' }}>{t.ipRestrict}</td>
                        <td className={styles.td} onClick={e => e.stopPropagation()}>
                          <div className={styles.rowBtns}>
                            <button className={styles.rowBtn} onClick={() => setEditToken(t)}><IcoEdit /></button>
                            <button className={`${styles.rowBtn} ${styles.rowBtnDanger}`} onClick={() => {
                              if (t._rawId) mutRevokeToken.mutate(t._rawId)
                              setTokens(prev => prev.filter(x => x.id !== t.id))
                            }}><IcoRevoke /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className={styles.gridWrap} style={{ padding: 0 }}>
              {filteredTokens.map(t => (
                <div key={t.id} className={styles.gridCard} onClick={() => setEditToken(t)}>
                  <div className={styles.gridCardAccent} style={{ background: t.color }} />
                  <div className={styles.gridCardBody}>
                    <div className={styles.gridCardTop}>
                      <div>
                        <div className={styles.gridCardTitle} style={{ fontFamily: 'monospace' }}>{t.name}</div>
                        <div className={styles.gridCardSub}>by {t.createdBy}</div>
                      </div>
                      <span className={`${styles.statusBadge} ${t.active ? styles.statusActive : styles.statusDisabled}`}>{t.active ? 'Active' : 'Revoked'}</span>
                    </div>
                    <div className={styles.tokenCardMeta}>
                      <span style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>Created {t.created}</span>
                      <span style={{ fontSize: 10, color: t.expires === 'Never' ? 'var(--color-text-dim)' : '#f6ad55' }}>Expires {t.expires}</span>
                    </div>
                    <div className={styles.tokenCardPerms}>
                      {t.permissions.map(p => <span key={p} className={styles.permChip}>{p}</span>)}
                    </div>
                    <div className={styles.tokenCardFoot}>
                      <span className={`${styles.statusBadge} ${t.active ? styles.statusActive : styles.statusDisabled}`}>{t.active ? 'Active' : 'Revoked'}</span>
                      <div className={styles.rowBtns} onClick={e => e.stopPropagation()}>
                        <button className={styles.rowBtn} onClick={() => setEditToken(t)}><IcoEdit /></button>
                        <button className={`${styles.rowBtn} ${styles.rowBtnDanger}`} onClick={() => {
                          if (t._rawId) mutRevokeToken.mutate(t._rawId)
                          setTokens(prev => prev.filter(x => x.id !== t.id))
                        }}><IcoRevoke /></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══════════ AUDIT LOG ═══════════ */}
      {tab === 'audit' && (
        <>
          {/* Config form */}
          <div className={styles.formCard}>
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle}>Log Events</div>
              <div className={styles.checkGroup}>
                {([
                  ['logAuth',         'User authentication (login, logout, failed attempts)'],
                  ['logConfigChange',  'Configuration changes (any setting modified)'],
                  ['logServerAction',  'Server actions (add, remove, modify)'],
                  ['logCmdExec',       'Command execution (run on servers)'],
                  ['logAPIAccess',     'API access (all API requests)'],
                  ['logExports',       'Data exports (CSV, JSON downloads)'],
                ] as [keyof AuditConfig, string][]).map(([k, label]) => (
                  <label key={k} className={styles.checkRow}>
                    <input type="checkbox" checked={auditCfg[k] as boolean}
                      onChange={e => setAuditCfg(p => ({ ...p, [k]: e.target.checked }))} />
                    <span className={styles.checkLabel}>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle}>Retention & Storage</div>
              <div className={styles.formGrid3}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Retention</label>
                  <div className={styles.numRow}>
                    <input className={styles.numInput} type="number" value={auditCfg.retentionDays}
                      onChange={e => setAuditCfg(p => ({ ...p, retentionDays: +e.target.value }))} />
                    <span className={styles.numUnit}>days</span>
                  </div>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Max file size</label>
                  <div className={styles.numRow}>
                    <input className={styles.numInput} type="number" value={auditCfg.maxSizeMB}
                      onChange={e => setAuditCfg(p => ({ ...p, maxSizeMB: +e.target.value }))} />
                    <span className={styles.numUnit}>MB</span>
                  </div>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Log level</label>
                  <select className={styles.fieldSelect} value={auditCfg.logLevel}
                    onChange={e => setAuditCfg(p => ({ ...p, logLevel: e.target.value }))}>
                    <option value="debug">Debug (verbose)</option>
                    <option value="info">Info (all events)</option>
                    <option value="warn">Warning and above</option>
                    <option value="error">Errors only</option>
                  </select>
                </div>
              </div>
              <div className={styles.checkGroup} style={{ marginTop: 10 }}>
                {([
                  ['forwardSyslog', 'Forward to syslog (/var/log/syslog)'],
                  ['immutableLog',  'Immutable audit log (append-only)'],
                  ['hashChain',     'Hash chain (tamper-evident)'],
                  ['forwardRemote', 'Forward to remote collector'],
                ] as [keyof AuditConfig, string][]).map(([k, label]) => (
                  <label key={k} className={styles.checkRow}>
                    <input type="checkbox" checked={auditCfg[k] as boolean}
                      onChange={e => setAuditCfg(p => ({ ...p, [k]: e.target.checked }))} />
                    <span className={styles.checkLabel}>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.formFoot}>
              <button className={styles.formBtn}><IcoDownload />Export CSV</button>
              <button className={styles.formBtn}><IcoDownload />Export JSON</button>
              <button className={`${styles.formBtn} ${styles.formBtnPrimary}`}
                onClick={() => mutSaveAuditCfg.mutate()} disabled={mutSaveAuditCfg.isPending}>
                <IcoCheck />{mutSaveAuditCfg.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          {/* Audit log viewer */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}><IcoSearch /></span>
                <input className={styles.searchInput} placeholder="Search user, action, IP…" value={auditSearch} onChange={e => setAudSearch(e.target.value)} />
              </div>
              {(['all','info','warn','error'] as const).map(s => (
                <button key={s} className={styles.pill}
                  style={auditSev === s ? { background: s === 'error' ? 'rgba(255,77,77,0.1)' : s === 'warn' ? 'rgba(246,173,85,0.1)' : s === 'info' ? 'rgba(99,179,237,0.1)' : 'rgba(74,158,255,0.1)', borderColor: s === 'error' ? '#ff4d4d' : s === 'warn' ? '#f6ad55' : s === 'info' ? '#63b3ed' : 'var(--color-accent)', color: s === 'error' ? '#ff4d4d' : s === 'warn' ? '#f6ad55' : s === 'info' ? '#63b3ed' : 'var(--color-accent)' } : {}}
                  onClick={() => setAudSev(s)}>
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
            <div className={styles.toolbarRight}>
              <button className={styles.iconBtn}><IcoDownload />Export</button>
            </div>
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionHeadLeft}>
                <span className={styles.sectionTitle}>Audit Log</span>
                <span className={styles.resultCount}><strong>{filteredAudit.length}</strong> entries</span>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead className={styles.thead}>
                  <tr>
                    <th className={styles.th}>Timestamp</th>
                    <th className={styles.th}>User</th>
                    <th className={styles.th}>Action</th>
                    <th className={styles.th}>Details</th>
                    <th className={styles.th}>Source IP</th>
                    <th className={styles.th}>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAudit.map(a => (
                    <tr key={a.id} className={styles.tr} onClick={() => setAuditDetail(a)}>
                      <td className={`${styles.td} ${styles.tdMono}`} style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{a.ts}</td>
                      <td className={`${styles.td} ${styles.tdMono}`} style={{ fontWeight: 600 }}>{a.user}</td>
                      <td className={styles.td}>{a.action}</td>
                      <td className={styles.td} style={{ maxWidth: 280 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--color-text-dim)' }}>{a.details}</span>
                      </td>
                      <td className={`${styles.td} ${styles.tdMono}`} style={{ fontSize: 11, color: a.sev === 'error' ? '#ff4d4d' : 'var(--color-text-dim)' }}>{a.ip}</td>
                      <td className={styles.td}>
                        <span className={a.sev === 'error' ? styles.sevError : a.sev === 'warn' ? styles.sevWarn : styles.sevInfo}>{a.sev.toUpperCase()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══════════ SECURITY POLICIES ═══════════ */}
      {tab === 'security' && (
        <>
          {/* System health row — wired to real metrics */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionTitle}>System Health</span>
              <button className={styles.iconBtn} onClick={() => qc.invalidateQueries({ queryKey: ['settings-metrics'] })}><IcoRefresh />Refresh</button>
            </div>
            {metricsSnap ? (() => {
              const cpuPct   = Math.round(metricsSnap.cpu?.total_pct ?? 0)
              const memUsed  = metricsSnap.memory?.used_bytes ?? 0
              const memTotal = metricsSnap.memory?.total_bytes ?? 1
              const memPct   = Math.round(metricsSnap.memory?.used_pct ?? 0)
              const disk0    = metricsSnap.disk?.[0]
              const diskUsed = disk0?.used_bytes ?? 0
              const diskTotal= disk0?.total_bytes ?? 1
              const diskPct  = Math.round(disk0?.used_pct ?? 0)
              const fmtGB    = (b: number) => b > 1073741824 ? (b/1073741824).toFixed(1)+' GB' : (b/1048576).toFixed(0)+' MB'
              const metricRows = [
                { label: 'CPU Usage',  val: `${cpuPct}%`,  pct: cpuPct,  color: cpuPct  > 80 ? '#ff4d4d' : cpuPct  > 60 ? '#f6ad55' : '#22c55e' },
                { label: 'Memory',     val: `${fmtGB(memUsed)} / ${fmtGB(memTotal)} (${memPct}%)`, pct: memPct, color: memPct > 85 ? '#ff4d4d' : memPct > 70 ? '#f6ad55' : '#4a9eff' },
                { label: 'Disk Usage', val: `${fmtGB(diskUsed)} / ${fmtGB(diskTotal)} (${diskPct}%)`, pct: diskPct, color: diskPct > 85 ? '#ff4d4d' : diskPct > 70 ? '#f6ad55' : '#22c55e' },
              ]
              return metricRows.map(r => (
                <div key={r.label} className={styles.healthRow}>
                  <span className={styles.healthLabel}>{r.label}</span>
                  <span className={styles.healthVal}>{r.val}</span>
                  <div className={styles.healthBar}><div className={styles.healthBarFill} style={{ width: r.pct + '%', background: r.color }} /></div>
                </div>
              ))
            })() : (
              <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--color-text-dim)' }}>Loading metrics…</div>
            )}
            {[
              { label: 'Database', val: 'Connected (sqlite3)', ok: true },
              { label: 'Metric collection', val: 'Running (every 30s)', ok: true },
            ].map(r => (
              <div key={r.label} className={styles.healthRow}>
                <span className={styles.healthLabel}>{r.label}</span>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.ok ? '#22c55e' : '#f6ad55', display: 'inline-block', flexShrink: 0 }} />
                <span className={styles.healthVal} style={{ color: r.ok ? 'var(--color-text-muted)' : '#f6ad55' }}>{r.val}</span>
              </div>
            ))}
          </div>

          <div className={styles.formCard}>
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle}>IP Access Control</div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Allowed IP ranges (whitelist — empty = allow all)</label>
                <input className={styles.fieldInput} placeholder="10.0.0.0/8, 192.168.0.0/16"
                  value={securityCfg.allowedIPRanges}
                  onChange={e => setSecurityCfg(p => ({ ...p, allowedIPRanges: e.target.value }))} />
                <span className={styles.fieldHint}>Separate multiple ranges with commas. Leave empty to allow all IPs.</span>
              </div>
              <div className={styles.fieldGroup} style={{ marginTop: 10 }}>
                <label className={styles.fieldLabel}>Blocked IP ranges (blacklist)</label>
                <input className={styles.fieldInput} placeholder="203.0.113.0/24"
                  value={securityCfg.blockedIPRanges}
                  onChange={e => setSecurityCfg(p => ({ ...p, blockedIPRanges: e.target.value }))} />
              </div>
            </div>
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle}>Brute Force Protection</div>
              <div className={styles.checkGroup}>
                {([
                  ['bruteForceEnabled', 'Enable brute force protection (auto-block on repeated failures)'],
                  ['bruteForceNotify',  'Notify admin when an account is locked'],
                  ['logFailedLogins',   'Log all failed login attempts'],
                  ['autoBanIP',         'Auto-ban IP after 20 failed attempts across any account'],
                ] as [keyof SecurityConfig, string][]).map(([k, label]) => (
                  <label key={k} className={styles.checkRow}>
                    <input type="checkbox" checked={securityCfg[k] as boolean}
                      onChange={e => setSecurityCfg(p => ({ ...p, [k]: e.target.checked }))} />
                    <span className={styles.checkLabel}>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle}>TLS / HTTPS Settings</div>
              <div className={styles.formGrid2}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Minimum TLS version</label>
                  <select className={styles.fieldSelect} value={securityCfg.minTLSVersion}
                    onChange={e => setSecurityCfg(p => ({ ...p, minTLSVersion: e.target.value }))}>
                    <option value="1.2">TLS 1.2</option>
                    <option value="1.3">TLS 1.3 only</option>
                  </select>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>HSTS max-age</label>
                  <select className={styles.fieldSelect} value={securityCfg.hstsMaxAge}
                    onChange={e => setSecurityCfg(p => ({ ...p, hstsMaxAge: e.target.value }))}>
                    <option value="86400">1 day</option>
                    <option value="2592000">30 days</option>
                    <option value="31536000">1 year</option>
                  </select>
                </div>
              </div>
              <div className={styles.checkGroup} style={{ marginTop: 10 }}>
                {([
                  ['redirectHTTPS',  'Redirect HTTP to HTTPS'],
                  ['hstsEnabled',    'HSTS (Strict-Transport-Security)'],
                  ['hstsSubdomains', 'Include subdomains in HSTS'],
                  ['hstsPreload',    'HSTS preload list submission'],
                ] as [keyof SecurityConfig, string][]).map(([k, label]) => (
                  <label key={k} className={styles.checkRow}>
                    <input type="checkbox" checked={securityCfg[k] as boolean}
                      onChange={e => setSecurityCfg(p => ({ ...p, [k]: e.target.checked }))} />
                    <span className={styles.checkLabel}>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle}>Content Security Policy (CSP)</div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>CSP Header Value</label>
                <input className={styles.fieldInput} value={securityCfg.cspHeader}
                  onChange={e => setSecurityCfg(p => ({ ...p, cspHeader: e.target.value }))} />
              </div>
              <div className={styles.checkGroup} style={{ marginTop: 10 }}>
                {([
                  ['xFrameOptions',      'Set X-Frame-Options: SAMEORIGIN'],
                  ['xContentTypeOptions','Set X-Content-Type-Options: nosniff'],
                  ['referrerPolicy',     'Set Referrer-Policy: strict-origin-when-cross-origin'],
                ] as [keyof SecurityConfig, string][]).map(([k, label]) => (
                  <label key={k} className={styles.checkRow}>
                    <input type="checkbox" checked={securityCfg[k] as boolean}
                      onChange={e => setSecurityCfg(p => ({ ...p, [k]: e.target.checked }))} />
                    <span className={styles.checkLabel}>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.formFoot}>
              <button className={styles.formBtn}><IcoRefresh />Test Security Headers</button>
              <button className={`${styles.formBtn} ${styles.formBtnPrimary}`}
                onClick={() => mutSaveSecurityCfg.mutate()} disabled={mutSaveSecurityCfg.isPending}>
                <IcoCheck />{mutSaveSecurityCfg.isPending ? 'Saving…' : 'Save Policies'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══════════ UPDATES ═══════════ */}
      {tab === 'updates' && (
        <>
          <div className={styles.updateBanner}>
            <div className={styles.updateBannerIcon}><IcoUpdate /></div>
            <div style={{ flex: 1 }}>
              <div className={styles.updateBannerTitle}>
                Orbit VPS{systemInfo ? ` · v${systemInfo.version}` : ''}
              </div>
              <div className={styles.updateBannerSub}>
                {systemInfo
                  ? `Built: ${systemInfo.buildDate || 'dev'} · Go ${systemInfo.goVersion} · ${systemInfo.os}/${systemInfo.arch} · Channel: ${systemInfo.updateChannel || 'stable'}`
                  : 'Loading version info…'}
              </div>
            </div>
            <button className={`${styles.formBtn}`} onClick={handleCheckUpdates} disabled={checkingUpdates}><IcoRefresh />{checkingUpdates ? 'Checking…' : 'Check for Updates'}</button>
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionHead}><span className={styles.sectionTitle}>System Information</span></div>
            <div style={{ padding: 14 }}>
              {systemInfo ? (
                <div className={styles.updateChangelog}>
                  {[
                    { type: 'Version',   cls: styles.changelogNew,   text: systemInfo.version },
                    { type: 'Runtime',   cls: styles.changelogImp,   text: systemInfo.goVersion },
                    { type: 'Platform',  cls: styles.changelogImp,   text: `${systemInfo.os} / ${systemInfo.arch}` },
                    { type: 'Channel',   cls: styles.changelogFixed,  text: systemInfo.updateChannel || 'stable' },
                    { type: 'Built',     cls: styles.changelogFixed,  text: systemInfo.buildDate || 'development build' },
                    { type: 'Auto-check',cls: styles.changelogSec,   text: systemInfo.autoCheck ? 'Enabled' : 'Disabled' },
                  ].map((c, i) => (
                    <div key={i} className={styles.changelogItem}>
                      <span className={`${styles.changelogLabel} ${c.cls}`}>{c.type}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>Loading system information…</div>
              )}
            </div>
          </div>

          {updateResult && (
            <div className={styles.sectionCard} style={{ marginBottom: 12 }}>
              <div className={styles.sectionHead}><span className={styles.sectionTitle}>Update Check Result</span></div>
              <div style={{ padding: 14 }}>
                {updateResult.up_to_date ? (
                  <div className={styles.infoBanner} style={{ background: 'rgba(34,197,94,0.07)', borderColor: 'rgba(34,197,94,0.2)', color: '#22c55e' }}>
                    <IcoCheck /><span>You are running the latest version: <strong>{updateResult.current_version}</strong></span>
                  </div>
                ) : (
                  <div className={styles.warnBanner}>
                    <IcoWarn /><span>New version available: <strong>{updateResult.latest_version}</strong> (current: {updateResult.current_version}){updateResult.release_url && <> — <a href={updateResult.release_url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-accent)' }}>Release notes</a></>}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className={styles.formCard}>
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle}>Update Channel</div>
              <div className={styles.checkGroup}>
                {([['stable','Stable (recommended)'],['beta','Beta (test features, may be unstable)'],['nightly','Nightly (development builds)']] as const).map(([val, label]) => (
                  <label key={val} className={styles.radioRow}>
                    <input type="radio" name="channel" checked={updateChannel === val} onChange={() => setUpdateChannel(val)} />
                    <span className={styles.checkLabel}>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle}>Update Settings</div>
              <div className={styles.checkGroup}>
                {([
                  ['autoCheck',    'Check for updates automatically (daily)'],
                  ['downloadBg',   'Download updates in background'],
                  ['securityPatch','Apply security patches automatically'],
                  ['notifyNew',    'Send notification on new version available'],
                ] as [keyof typeof updateSettings, string][]).map(([key, label]) => (
                  <label key={key} className={styles.checkRow}>
                    <input type="checkbox" checked={updateSettings[key]} onChange={e => setUpdateSettings(p => ({ ...p, [key]: e.target.checked }))} />
                    <span className={styles.checkLabel}>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.formFoot}>
              <button className={styles.formBtn} onClick={handleCheckUpdates} disabled={checkingUpdates}><IcoRefresh />{checkingUpdates ? 'Checking…' : 'Check Now'}</button>
              <button className={`${styles.formBtn} ${styles.formBtnPrimary}`}><IcoCheck />Save</button>
            </div>
          </div>

          {/* Plugins */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionHeadLeft}>
                <span className={styles.sectionTitle}>Plugins & Extensions</span>
                <span className={styles.resultCount}><strong>{plugins.filter(p=>p.enabled).length}</strong> active · <strong>{plugins.filter(p=>p.hasUpdate).length}</strong> updates</span>
              </div>
              <div className={styles.sectionHeadRight}>
                <button className={`${styles.iconBtn} ${styles.iconBtnPrimary}`}><IcoPlus />Browse Marketplace</button>
              </div>
            </div>
            <div className={styles.pluginsGrid}>
              {plugins.map(p => (
                <div key={p.id} className={styles.pluginCard}>
                  <div className={styles.pluginCardAccent} style={{ background: p.enabled ? p.color : '#4b5563' }} />
                  <div className={styles.pluginCardBody}>
                    <div className={styles.pluginCardTop}>
                      <div>
                        <div className={styles.pluginCardName}>{p.name}</div>
                        <div className={styles.pluginCardVersion}>v{p.version}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                        <span className={`${styles.statusBadge} ${p.enabled ? styles.statusEnabled : styles.statusDisabled}`}>{p.enabled ? 'Enabled' : 'Disabled'}</span>
                        {p.hasUpdate && <span className={styles.updateBadge}>v{p.updateVersion}</span>}
                      </div>
                    </div>
                    <div className={styles.pluginCardDesc}>{p.description}</div>
                    <div className={styles.pluginCardFoot}>
                      <span className={styles.categoryChip}>{p.category}</span>
                      <button className={`${styles.iconBtn} ${p.enabled ? styles.iconBtnDanger : styles.iconBtnPrimary}`}
                        style={{ padding: '3px 9px', fontSize: 10.5, marginLeft: 'auto' }}
                        onClick={() => setPlugins(prev => prev.map(x => x.id === p.id ? { ...x, enabled: !x.enabled } : x))}>
                        {p.enabled ? 'Disable' : 'Enable'}
                      </button>
                      {p.hasUpdate && <button className={styles.iconBtn} style={{ padding: '3px 9px', fontSize: 10.5 }}><IcoUpdate />Update</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ─── MODALS ─── */}
      {(addUser || editUser) && (
        <UserModal
          user={editUser}
          onClose={() => { setAddUser(false); setEditUser(null) }}
          onSave={handleSaveUser}
        />
      )}
      {(addToken || editToken) && (
        <TokenModal
          token={editToken}
          onClose={() => { setAddToken(false); setEditToken(null) }}
          onSave={handleSaveToken as any}
          onGenerate={editToken ? undefined : async (data) => {
            const expiryDays = data.expires === 'never' ? 0 : data.expires === '7d' ? 7 : data.expires === '30d' ? 30 : data.expires === '90d' ? 90 : 365
            const result = await mutCreateToken.mutateAsync({
              name: data.name,
              scopes: data.perms.join(' '),
              ip_restrict: data.ipRes,
              expiry_days: expiryDays,
            })
            return result.token
          }}
        />
      )}
      {restoreBack && (
        <RestoreModal
          backup={restoreBack}
          onClose={() => setRestoreBack(null)}
          onConfirm={async (components, conflict) => {
            const result = await mutRestoreBackupFile.mutateAsync({ id: String(restoreBack.id), components, conflict })
            return result
          }}
        />
      )}
      {auditDetail && (
        <AuditDetailModal entry={auditDetail} onClose={() => setAuditDetail(null)} />
      )}

      {/* Import Config Modal */}
      {importConfigOpen && (
        <div className={styles.overlay} onClick={e => e.target === e.currentTarget && setImportConfig(false)}>
          <div className={styles.modal} style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <IcoUpload />
              <span className={styles.modalTitle}>Import Configuration</span>
              <button className={styles.modalClose} onClick={() => setImportConfig(false)}><IcoX /></button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.infoBanner}>
                <IcoInfo />
                <span>Select an Orbit VPS config export file (<code style={{ fontFamily:'monospace', fontSize:11 }}>.json</code>). Existing settings will be overwritten by the imported values.</span>
              </div>
              <div className={styles.fieldGroup} style={{ marginTop: 12 }}>
                <label className={styles.fieldLabel}>Config File</label>
                <input
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'block', width: '100%', fontSize: 12, color: 'var(--color-text)', cursor: 'pointer', padding: '6px 0' }}
                  onChange={e => setImportFile(e.target.files?.[0] ?? null)}
                />
              </div>
              {importFile && (
                <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 6, fontFamily: 'monospace' }}>
                  Selected: {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>
            <div className={styles.modalFoot}>
              <button className={styles.formBtn} onClick={() => { setImportConfig(false); setImportFile(null) }}><IcoX />Cancel</button>
              <button className={`${styles.formBtn} ${styles.formBtnPrimary}`} onClick={handleImportConfig} disabled={!importFile}>
                <IcoUpload />Import Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete user confirm */}
      {deleteUserId && (
        <div className={styles.overlay} onClick={() => setDelUser(null)}>
          <div className={styles.modal} style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <span className={styles.modalTitle}>Delete User</span>
              <button className={styles.modalClose} onClick={() => setDelUser(null)}><IcoX /></button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.warnBanner}><IcoWarn /><span>This user will be permanently removed. Any associated API tokens will be revoked immediately.</span></div>
              <div style={{ fontSize: 13, color: 'var(--color-text)', fontFamily: 'monospace', background: 'var(--color-surface-raised)', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--color-border)' }}>
                {users.find(u => u.id === deleteUserId)?.username}
              </div>
            </div>
            <div className={styles.modalFoot}>
              <button className={styles.formBtn} onClick={() => setDelUser(null)}><IcoX />Cancel</button>
              <button className={`${styles.formBtn} ${styles.formBtnDanger}`} onClick={() => {
                const u = users.find(x => x.id === deleteUserId)
                if (u?._rawId) mutDeleteUser.mutate(u._rawId)
                setUsers(prev => prev.filter(u => u.id !== deleteUserId))
                setDelUser(null)
              }}>
                <IcoTrash />Delete User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
