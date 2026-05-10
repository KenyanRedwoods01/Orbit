import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, fetchCSRFToken } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { Spinner } from '@/components/ui'
import styles from './LoginPage.module.css'

const APP_VERSION = '0.1.0'

const VERSION_FEATURES = [
  { label: 'Real-time metrics (CPU, RAM, disk, network)', has: true },
  { label: 'Systemd service management', has: true },
  { label: 'Live log streaming (journal + files)', has: true },
  { label: 'UFW firewall rule management', has: true },
  { label: 'Nginx site configuration editor', has: true },
  { label: 'CI/CD deploy hooks & webhook triggers', has: true },
  { label: 'Docker container & image management', has: true },
  { label: 'Uptime monitors & incident tracking', has: true },
  { label: 'Security audit (SSH, ports, updates, perms)', has: true },
  { label: 'Multi-server fleet overview', has: true },
  { label: 'Process explorer with signal sending', has: true },
  { label: 'File manager (FTP-style)', has: true },
  { label: 'Web SSH terminal (xterm.js)', has: true },
  { label: 'MCP token management', has: true },
  { label: 'Cron job scheduler', has: true },
  { label: 'Backup configuration & runs', has: true },
  { label: 'Alert rules & event log', has: true },
  { label: 'Email / Slack notifications (SMTP)', has: false },
  { label: 'Two-factor authentication (TOTP)', has: false },
  { label: 'Plugin marketplace & extensions', has: false },
  { label: 'Granular RBAC (role-based access control)', has: false },
  { label: 'Audit log for all admin actions', has: false },
  { label: 'Mobile app / PWA support', has: false },
]

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

function TagIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
    >
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

function VersionCard() {
  const [open, setOpen] = useState(false)

  return (
    <div className={styles.versionWrap}>
      <button
        className={styles.versionCard}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span className={styles.versionDot} />
        <span className={styles.versionIcon}><TagIcon /></span>
        <span className={styles.versionText}>v{APP_VERSION}</span>
        <span className={styles.versionSep}>·</span>
        <span className={styles.versionEnv}>dev</span>
        <span className={styles.versionChevron}><ChevronIcon open={open} /></span>
      </button>

      {open && (
        <div className={styles.versionDropdown}>
          <div className={styles.versionDropdownHeader}>
            <div className={styles.versionDropdownTitle}>Orbit VPS v{APP_VERSION}</div>
            <div className={styles.versionDropdownSub}>Development build · Open source · AGPL-3</div>
          </div>

          <div className={styles.versionDropdownSection}>
            <div className={styles.versionDropdownSectionLabel}>What's included</div>
            {VERSION_FEATURES.filter(f => f.has).map(f => (
              <div key={f.label} className={styles.versionDropdownRow}>
                <span className={styles.versionFeatureIcon} data-has="true"><CheckIcon /></span>
                <span>{f.label}</span>
              </div>
            ))}
          </div>

          <div className={styles.versionDropdownDivider} />

          <div className={styles.versionDropdownSection}>
            <div className={styles.versionDropdownSectionLabel}>Coming soon</div>
            {VERSION_FEATURES.filter(f => !f.has).map(f => (
              <div key={f.label} className={styles.versionDropdownRow}>
                <span className={styles.versionFeatureIcon} data-has="false"><XIcon /></span>
                <span>{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const setUser = useAuthStore(s => s.setUser)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return
    setError(null)
    setLoading(true)
    try {
      const user = await login(username, password)
      setUser({ username: user.username, scope: user.scope })
      // Fetch CSRF token bound to the new session
      await fetchCSRFToken()
      navigate('/metrics', { replace: true })
    } catch {
      setError('Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.root}>
      <VersionCard />

      <div className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.brandLogo}>
            Orbit <span>VPS</span>
          </div>
          <div className={styles.brandSub}>Server management — sign in to continue</div>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error && (
            <div className={styles.error}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="username">Username</label>
            <input
              id="username"
              className={styles.input}
              type="text"
              placeholder="admin"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              disabled={loading}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="password">Password</label>
            <div className={styles.passwordWrap}>
              <input
                id="password"
                className={styles.input}
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPassword(v => !v)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading || !username || !password}
          >
            {loading ? <><Spinner size="sm" /> Signing in…</> : 'Sign in'}
          </button>
        </form>

        <div className={styles.footer}>
          Orbit VPS · Open source · AGPL-3
        </div>
      </div>
    </div>
  )
}
