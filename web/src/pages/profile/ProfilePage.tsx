import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import {
  fetchProfile, updateProfile, changeProfileUsername, changeProfilePassword,
  fetchProfileSessions, revokeProfileSession, fetchProfileActivity,
  fetchTOTPStatus, setupTOTP, verifyTOTP, disableTOTP, regenerateBackupCodes,
  type ProfileRecord, type ProfileSession, type ProfileActivity, type TOTPSetupData,
} from '@/lib/api'
import styles from './ProfilePage.module.css'

// ── ProfileError ──────────────────────────────────────────────────────────────
function ProfileError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const navigate  = useNavigate()
  const logout    = useAuthStore(s => s.logout)

  const msg    = error instanceof Error ? error.message : String(error ?? 'Unknown error')
  const is401  = /unauthorized|session revoked|invalid username/i.test(msg)

  function handleLogin() {
    logout()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 24px' }}>
      <div className={styles.error} style={{ maxWidth: 460, width: '100%' }}>
        {is401
          ? 'Your session has expired or was revoked. Please log in again.'
          : `Failed to load profile: ${msg}`}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {is401 ? (
          <button
            onClick={handleLogin}
            style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer', background: 'var(--color-accent)', color: '#fff', border: 'none' }}
          >
            Go to Login
          </button>
        ) : (
          <button
            onClick={onRetry}
            style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer', background: 'var(--color-surface2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  )
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const IcoUser     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="7" r="3.5"/><path d="M3 18c0-4 3.1-6 7-6s7 2 7 6"/></svg>
const IcoShield   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2L4 5v5c0 4 3 7 6 8 3-1 6-4 6-8V5z"/></svg>
const IcoKey      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="11" r="4"/><path d="M15 5l-4 4M17 3l-2 2M15 5l2-2"/></svg>
const IcoSession  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="16" height="13" rx="1.5"/><path d="M7 4V2M13 4V2"/><circle cx="10" cy="11" r="2.5"/></svg>
const IcoActivity = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,12 6,7 9,10 13,4 18,8"/></svg>
const IcoDanger   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l8 16H2z"/><line x1="10" y1="9" x2="10" y2="13"/><circle cx="10" cy="15.5" r="0.6" fill="currentColor" stroke="none"/></svg>
const IcoEdit     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3l3 3L7 16H4v-3z"/></svg>
const IcoCheck    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,10 8,14 16,6"/></svg>
const IcoX        = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
const IcoRefresh  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 10a7 7 0 0 1-7 7 7 7 0 0 1-5-2"/><polyline points="2,10 3,15 8,14"/></svg>
const IcoPhone    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="1" width="10" height="18" rx="2"/><line x1="10" y1="16" x2="10" y2="16" strokeWidth="2.5" strokeLinecap="round"/></svg>
const IcoHardware = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="14" height="10" rx="1.5"/><path d="M7 18h6M10 15v3"/></svg>
const IcoTrash    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="5,5 5,17 15,17 15,5"/><path d="M3 5h14M8 5V3h4v2"/></svg>
const IcoLock     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="9" width="12" height="9" rx="1.5"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/><circle cx="10" cy="13.5" r="1" fill="currentColor" stroke="none"/></svg>
const IcoMail     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="16" height="13" rx="1.5"/><polyline points="2,4 10,11 18,4"/></svg>
const IcoAt       = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="3.5"/><path d="M13.5 10a6 6 0 1 0-1.5 4"/></svg>
const IcoCopy     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="9" height="9" rx="1.5"/><path d="M3 12V4a1 1 0 0 1 1-1h8"/></svg>
const IcoDownload = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3v10M6 9l4 4 4-4"/><path d="M3 16h14"/></svg>
const IcoBell     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2a6 6 0 0 1 6 6v3l1.5 2.5h-15L4 11V8a6 6 0 0 1 6-6z"/><path d="M8 15.5a2 2 0 0 0 4 0"/></svg>
const IcoInfo     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="10" cy="10" r="8"/><line x1="10" y1="9" x2="10" y2="14"/><circle cx="10" cy="6.5" r="0.6" fill="currentColor" stroke="none"/></svg>

// ── Color palette for avatars ─────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#3b82f6','#8b5cf6','#ec4899','#ef4444','#f97316',
  '#eab308','#22c55e','#14b8a6','#06b6d4','#6366f1',
]

// ── Password strength helper ──────────────────────────────────────────────────
function pwStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: 'Weak',      color: '#f44336' }
  if (score <= 2) return { score, label: 'Fair',      color: '#ff9800' }
  if (score <= 3) return { score, label: 'Good',      color: '#fbbf24' }
  if (score <= 4) return { score, label: 'Strong',    color: '#4caf50' }
  return               { score, label: 'Very Strong', color: '#22d3ee' }
}

function fmt(ts: number) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString()
}
function fmtRel(ts: number) {
  if (!ts) return '—'
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  return `${Math.floor(diff/86400)}d ago`
}

type Tab = 'overview' | 'identity' | 'security' | 'sessions' | 'activity' | 'danger'

export default function ProfilePage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('overview')

  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
    retry: 3,
    retryDelay: 1500,
    staleTime: 30_000,
  })

  const { data: totpStatus } = useQuery({
    queryKey: ['totp-status'],
    queryFn: fetchTOTPStatus,
    retry: 2,
    retryDelay: 1500,
  })

  const { data: sessions } = useQuery({
    queryKey: ['profile-sessions'],
    queryFn: fetchProfileSessions,
    enabled: tab === 'sessions',
  })

  const { data: activity } = useQuery({
    queryKey: ['profile-activity'],
    queryFn: fetchProfileActivity,
    enabled: tab === 'activity',
  })

  if (profileLoading) return (
    <div className={styles.loading}><div className={styles.spinner} /> Loading profile…</div>
  )
  if (profileError || !profile) return (
    <ProfileError error={profileError} onRetry={() => qc.invalidateQueries({ queryKey: ['profile'] })} />
  )

  const initials = (profile.display_name || profile.username || '?')
    .split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className={styles.page}>
      <Hero profile={profile} initials={initials} onUpdate={() => qc.invalidateQueries({ queryKey: ['profile'] })} />
      <div className={styles.body}>
        <LeftNav tab={tab} setTab={setTab} totpEnabled={totpStatus?.enabled ?? false} backupLeft={totpStatus?.backup_codes_left ?? 0} />
        <div className={styles.main}>
          {tab === 'overview'  && <OverviewTab  profile={profile} totpStatus={totpStatus} sessions={sessions} />}
          {tab === 'identity'  && <IdentityTab  profile={profile} onSaved={() => qc.invalidateQueries({ queryKey: ['profile'] })} />}
          {tab === 'security'  && <SecurityTab  profile={profile} totpStatus={totpStatus} onRefresh={() => { qc.invalidateQueries({ queryKey: ['totp-status'] }); qc.invalidateQueries({ queryKey: ['profile'] }) }} />}
          {tab === 'sessions'  && <SessionsTab  sessions={sessions} onRevoke={() => qc.invalidateQueries({ queryKey: ['profile-sessions'] })} />}
          {tab === 'activity'  && <ActivityTab  activity={activity} />}
          {tab === 'danger'    && <DangerTab    profile={profile} />}
        </div>
      </div>
    </div>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero({ profile, initials, onUpdate }: { profile: ProfileRecord; initials: string; onUpdate: () => void }) {
  const [showColors, setShowColors] = useState(false)
  const mut = useMutation({
    mutationFn: (color: string) => updateProfile({ avatar_color: color }),
    onSuccess: onUpdate,
  })

  const createdDaysAgo = Math.floor((Date.now() / 1000 - profile.created_at) / 86400)

  return (
    <div className={styles.hero}>
      <div className={styles.avatarWrap}>
        <div className={styles.avatar} style={{ background: profile.avatar_color }}>
          {initials}
        </div>
        <button className={styles.avatarEditBtn} onClick={() => setShowColors(v => !v)} title="Change avatar color">
          <IcoEdit />
        </button>
        {showColors && (
          <div style={{ position:'absolute', top:'100%', left:0, zIndex:50, marginTop:8, background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:7, padding:8 }}>
            <div className={styles.colorPickerRow}>
              {AVATAR_COLORS.map(c => (
                <div
                  key={c}
                  className={`${styles.colorSwatch} ${profile.avatar_color === c ? styles.colorSwatchActive : ''}`}
                  style={{ background: c }}
                  onClick={() => { mut.mutate(c); setShowColors(false) }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={styles.heroInfo}>
        <div className={styles.heroName}>{profile.display_name || profile.username}</div>
        <div className={styles.heroMeta}>
          <span className={styles.heroUsername}>@{profile.username}</span>
          <span className={styles.heroRole}>{profile.role}</span>
        </div>
        {profile.bio && <div className={styles.heroBio}>{profile.bio}</div>}
      </div>

      <div className={styles.heroStats}>
        <div className={styles.heroStat}>
          <div className={styles.heroStatVal}>{createdDaysAgo}</div>
          <div className={styles.heroStatLabel}>Days Active</div>
        </div>
        <div className={styles.heroStat}>
          <div className={styles.heroStatVal} style={{ color: profile.totp_enabled ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {profile.totp_enabled ? 'ON' : 'OFF'}
          </div>
          <div className={styles.heroStatLabel}>2FA Status</div>
        </div>
        <div className={styles.heroStat}>
          <div className={styles.heroStatVal}>{profile.backup_codes_left}</div>
          <div className={styles.heroStatLabel}>Backup Codes</div>
        </div>
      </div>
    </div>
  )
}

// ── Left Nav ──────────────────────────────────────────────────────────────────
function LeftNav({ tab, setTab, totpEnabled, backupLeft }: { tab: Tab; setTab: (t: Tab) => void; totpEnabled: boolean; backupLeft: number }) {
  const items: { id: Tab; label: string; Icon: () => JSX.Element; badge?: string; badgeCls?: string; danger?: boolean }[] = [
    { id: 'overview',  label: 'Overview',    Icon: IcoInfo },
    { id: 'identity',  label: 'Identity',    Icon: IcoUser },
    { id: 'security',  label: 'Security & 2FA', Icon: IcoShield, badge: totpEnabled ? '2FA ON' : 'OFF', badgeCls: totpEnabled ? undefined : 'warn' },
    { id: 'sessions',  label: 'Sessions',    Icon: IcoSession },
    { id: 'activity',  label: 'Activity',    Icon: IcoActivity },
    { id: 'danger',    label: 'Danger Zone', Icon: IcoDanger, danger: true },
  ]

  return (
    <div className={styles.leftCol}>
      <div className={styles.tabList}>
        <div className={styles.tabSectionLabel}>Account</div>
        {items.slice(0, 2).map(item => (
          <button
            key={item.id}
            className={`${styles.tabBtn} ${tab === item.id ? styles.tabBtnActive : ''}`}
            onClick={() => setTab(item.id)}
          >
            <item.Icon />
            {item.label}
          </button>
        ))}

        <div className={styles.tabSep} />
        <div className={styles.tabSectionLabel}>Security</div>
        {items.slice(2, 5).map(item => (
          <button
            key={item.id}
            className={`${styles.tabBtn} ${tab === item.id ? styles.tabBtnActive : ''}`}
            onClick={() => setTab(item.id)}
          >
            <item.Icon />
            {item.label}
            {item.badge && (
              <span className={`${styles.tabBtnBadge} ${item.badgeCls === 'warn' ? styles.tabBtnBadgeWarn : ''}`}>
                {item.badge}
              </span>
            )}
          </button>
        ))}
        {backupLeft < 3 && backupLeft > 0 && tab !== 'security' && (
          <div style={{ fontSize: 10, color: 'var(--color-warning)', padding: '2px 10px' }}>
            ⚠ Only {backupLeft} backup codes left
          </div>
        )}

        <div className={styles.tabSep} />
        <button
          className={`${styles.tabBtn} ${styles.dangerTab} ${tab === 'danger' ? styles.dangerTabActive : ''}`}
          onClick={() => setTab('danger')}
        >
          <IcoDanger />
          Danger Zone
        </button>
      </div>
    </div>
  )
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ profile, totpStatus, sessions }: { profile: ProfileRecord; totpStatus: any; sessions: ProfileSession[] | undefined }) {
  const secScore = calcSecScore(profile, totpStatus)

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <div className={styles.sectionTitle}><IcoInfo /> Account Overview</div>
          <div className={styles.sectionSub}>Your profile summary and security health</div>
        </div>
      </div>

      {/* Security score */}
      <div className={styles.secureScore}>
        <div className={styles.secureScoreRing}>
          <svg viewBox="0 0 72 72">
            <circle cx="36" cy="36" r="28" fill="none" stroke="var(--color-border)" strokeWidth="6" />
            <circle cx="36" cy="36" r="28" fill="none"
              stroke={secScore >= 80 ? 'var(--color-success)' : secScore >= 60 ? 'var(--color-warning)' : 'var(--color-danger)'}
              strokeWidth="6"
              strokeDasharray={`${(secScore / 100) * 176} 176`}
              strokeLinecap="round"
            />
          </svg>
          <div className={styles.secureScoreVal}>{secScore}</div>
        </div>
        <div className={styles.secureScoreInfo}>
          <div className={styles.secureScoreTitle}>
            Security Score — {secScore >= 80 ? 'Strong' : secScore >= 60 ? 'Moderate' : 'Weak'}
          </div>
          <div className={styles.secureScoreDesc}>Based on 2FA status, backup codes, and profile completion.</div>
          <div className={styles.secureScoreItems}>
            {[
              { label: '2FA enabled',         ok: totpStatus?.enabled },
              { label: 'Backup codes set',    ok: (totpStatus?.backup_codes_left ?? 0) > 0 },
              { label: 'Email set',           ok: !!profile.email },
              { label: 'Display name set',    ok: !!profile.display_name },
              { label: 'Bio complete',        ok: !!profile.bio },
            ].map(item => (
              <div key={item.label} className={`${styles.secureScoreItem} ${item.ok ? styles.scoreItemPass : styles.scoreItemFail}`}>
                {item.ok ? <IcoCheck /> : <IcoX />}
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick info cards */}
      <div className={styles.overviewGrid}>
        <div className={styles.overviewCard}>
          <div className={styles.overviewCardIcon} style={{ background: 'rgba(74,158,255,0.12)' }}>
            <IcoAt />
          </div>
          <div className={styles.overviewCardLabel}>Username</div>
          <div className={styles.overviewCardVal} style={{ fontSize: 14 }}>{profile.username}</div>
        </div>
        <div className={styles.overviewCard}>
          <div className={styles.overviewCardIcon} style={{ background: 'rgba(156,39,176,0.12)' }}>
            <IcoMail/>
          </div>
          <div className={styles.overviewCardLabel}>Email</div>
          <div className={styles.overviewCardVal} style={{ fontSize: 13 }}>{profile.email || <span style={{ color: 'var(--color-text-dim)', fontWeight: 400, fontSize: 12 }}>Not set</span>}</div>
        </div>
        <div className={styles.overviewCard}>
          <div className={styles.overviewCardIcon} style={{ background: 'rgba(76,175,80,0.12)' }}>
            <IcoShield />
          </div>
          <div className={styles.overviewCardLabel}>2FA Method</div>
          <div className={styles.overviewCardVal} style={{ fontSize: 14, color: totpStatus?.enabled ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {totpStatus?.enabled ? 'TOTP' : 'None'}
          </div>
        </div>
        <div className={styles.overviewCard}>
          <div className={styles.overviewCardIcon} style={{ background: 'rgba(245,158,11,0.12)' }}>
            <IcoKey />
          </div>
          <div className={styles.overviewCardLabel}>Backup Codes</div>
          <div className={styles.overviewCardVal} style={{ color: (totpStatus?.backup_codes_left ?? 0) < 3 ? 'var(--color-warning)' : undefined }}>
            {totpStatus?.backup_codes_left ?? 0}
          </div>
        </div>
        <div className={styles.overviewCard}>
          <div className={styles.overviewCardIcon} style={{ background: 'rgba(6,182,212,0.12)' }}>
            <IcoSession />
          </div>
          <div className={styles.overviewCardLabel}>Active Sessions</div>
          <div className={styles.overviewCardVal}>{sessions?.length ?? '—'}</div>
        </div>
        <div className={styles.overviewCard}>
          <div className={styles.overviewCardIcon} style={{ background: 'rgba(239,68,68,0.12)' }}>
            <IcoLock />
          </div>
          <div className={styles.overviewCardLabel}>Role</div>
          <div className={styles.overviewCardVal} style={{ fontSize: 13, textTransform: 'capitalize' }}>{profile.role}</div>
        </div>
      </div>

      {/* MFA methods */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <div className={styles.cardTitle}><IcoShield /> Multi-Factor Authentication Methods</div>
        </div>
        <div className={styles.mfaGrid}>
          {[
            { name: 'TOTP (Authenticator)', Icon: IcoPhone, desc: 'Time-based one-time passwords via any authenticator app', active: totpStatus?.enabled },
            { name: 'Hardware Key', Icon: IcoHardware, desc: 'FIDO2 / WebAuthn security keys', active: false },
            { name: 'Backup Codes', Icon: IcoKey, desc: 'Single-use emergency recovery codes', active: (totpStatus?.backup_codes_left ?? 0) > 0 },
            { name: 'Push Notifications', Icon: IcoBell, desc: 'Approve logins from a trusted mobile app', active: false },
          ].map(m => (
            <div key={m.name} className={`${styles.mfaCard} ${m.active ? styles.mfaCardActive : ''}`}>
              <div className={styles.mfaCardIcon} style={{ background: m.active ? 'rgba(76,175,80,0.12)' : 'var(--color-surface-overlay)' }}>
                <m.Icon />
              </div>
              <div className={styles.mfaCardName}>{m.name}</div>
              <div className={styles.mfaCardDesc}>{m.desc}</div>
              <div className={`${styles.mfaCardStatus} ${m.active ? styles.mfaCardStatusOn : ''}`}>
                {m.active ? '● Enabled' : '○ Not configured'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Account info */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <div className={styles.cardTitle}><IcoUser /> Account Details</div>
        </div>
        {[
          { label: 'User ID',      val: `#${profile.id}`,                       icon: <IcoAt /> },
          { label: 'Role',         val: profile.role,                             icon: <IcoShield /> },
          { label: 'Created',      val: fmt(profile.created_at),                  icon: <IcoSession /> },
        ].map(row => (
          <div key={row.label} className={styles.infoRow} style={{ marginBottom: 6 }}>
            {row.icon}
            <span className={styles.infoRowLabel}>{row.label}</span>
            <span className={styles.infoRowVal}>{row.val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function calcSecScore(profile: ProfileRecord, totpStatus: any): number {
  let s = 20
  if (totpStatus?.enabled) s += 30
  if ((totpStatus?.backup_codes_left ?? 0) > 0) s += 20
  if (profile.email) s += 10
  if (profile.display_name) s += 10
  if (profile.bio) s += 10
  return Math.min(s, 100)
}

// ── Identity Tab ──────────────────────────────────────────────────────────────
function IdentityTab({ profile, onSaved }: { profile: ProfileRecord; onSaved: () => void }) {
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [email, setEmail]             = useState(profile.email)
  const [bio, setBio]                 = useState(profile.bio)
  const [saved, setSaved]             = useState(false)
  const [err, setErr]                 = useState('')

  const [showUsernameForm, setShowUsernameForm] = useState(false)
  const [newUsername, setNewUsername]           = useState('')
  const [unPwd, setUnPwd]                       = useState('')
  const [unErr, setUnErr]                       = useState('')
  const [unSaved, setUnSaved]                   = useState(false)

  const profileMut = useMutation({
    mutationFn: () => updateProfile({ display_name: displayName, email, bio }),
    onSuccess: () => { setSaved(true); onSaved(); setTimeout(() => setSaved(false), 2500) },
    onError: (e: Error) => setErr(e.message),
  })

  const usernameMut = useMutation({
    mutationFn: () => changeProfileUsername(newUsername, unPwd),
    onSuccess: () => { setUnSaved(true); setShowUsernameForm(false); setNewUsername(''); setUnPwd(''); onSaved(); setTimeout(() => setUnSaved(false), 2500) },
    onError: (e: Error) => setUnErr(e.message),
  })

  useEffect(() => {
    setDisplayName(profile.display_name)
    setEmail(profile.email)
    setBio(profile.bio)
  }, [profile])

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <div className={styles.sectionTitle}><IcoUser /> Identity & Profile</div>
          <div className={styles.sectionSub}>Manage your display information and contact details</div>
        </div>
      </div>

      {/* Avatar color */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <div className={styles.cardTitle}><IcoEdit /> Avatar Color</div>
        </div>
        <div className={styles.cardDesc}>Your avatar is shown across the platform as a colored initial badge.</div>
        <div className={styles.colorPickerRow}>
          {AVATAR_COLORS.map(c => (
            <div
              key={c}
              className={`${styles.colorSwatch} ${profile.avatar_color === c ? styles.colorSwatchActive : ''}`}
              style={{ background: c, width: 28, height: 28 }}
              onClick={() => updateProfile({ avatar_color: c }).then(onSaved).catch(() => {})}
            />
          ))}
        </div>
      </div>

      {/* Profile info */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <div className={styles.cardTitle}><IcoUser /> Profile Information</div>
        </div>

        {err && <div className={styles.error} style={{ marginBottom: 10 }}>{err}</div>}
        {saved && (
          <div className={styles.successMsg} style={{ marginBottom: 10 }}>
            <IcoCheck /> Profile saved successfully
          </div>
        )}

        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label className={styles.label}>Display Name</label>
            <input
              className={styles.input}
              value={displayName}
              onChange={e => { setDisplayName(e.target.value); setSaved(false); setErr('') }}
              placeholder="Your full name"
            />
            <div className={styles.fieldNote}>Shown in the top bar and dropdown instead of your username</div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Email Address</label>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setSaved(false); setErr('') }}
              placeholder="you@example.com"
            />
            <div className={styles.fieldNote}>Used for notifications and account recovery</div>
          </div>
        </div>

        <div className={styles.field} style={{ marginTop: 10 }}>
          <label className={styles.label}>Bio</label>
          <textarea
            className={`${styles.input} ${styles.textarea}`}
            value={bio}
            onChange={e => { setBio(e.target.value); setSaved(false); setErr('') }}
            placeholder="A short description about yourself…"
            maxLength={240}
          />
          <div className={styles.fieldNote}>{bio.length}/240 characters</div>
        </div>

        <div className={styles.btnRow} style={{ marginTop: 12 }}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => profileMut.mutate()}
            disabled={profileMut.isPending}
          >
            {profileMut.isPending ? <><div className={styles.spinner} style={{ width: 12, height: 12, borderWidth: 2 }} /> Saving…</> : <><IcoCheck /> Save Profile</>}
          </button>
        </div>
      </div>

      {/* Username change */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <div className={styles.cardTitle}><IcoAt /> Username</div>
          <button className={styles.btn} onClick={() => setShowUsernameForm(v => !v)}>
            <IcoEdit /> Change Username
          </button>
        </div>
        <div className={styles.infoRow}>
          <IcoAt />
          <span className={styles.infoRowLabel}>Current username</span>
          <span className={styles.infoRowVal}>@{profile.username}</span>
        </div>

        {unSaved && (
          <div className={styles.successMsg} style={{ marginTop: 10 }}>
            <IcoCheck /> Username changed successfully — please re-login if sessions are affected
          </div>
        )}

        {showUsernameForm && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {unErr && <div className={styles.error}>{unErr}</div>}
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.label}>New Username</label>
                <input
                  className={styles.input}
                  value={newUsername}
                  onChange={e => { setNewUsername(e.target.value); setUnErr('') }}
                  placeholder="new_username"
                  minLength={3}
                  maxLength={32}
                />
                <div className={styles.fieldNote}>3–32 characters, lowercase letters, numbers, underscores</div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Current Password (to confirm)</label>
                <input
                  className={styles.input}
                  type="password"
                  value={unPwd}
                  onChange={e => { setUnPwd(e.target.value); setUnErr('') }}
                  placeholder="Enter your current password"
                />
              </div>
            </div>
            <div className={styles.btnRow}>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => usernameMut.mutate()}
                disabled={!newUsername || !unPwd || usernameMut.isPending}
              >
                {usernameMut.isPending ? 'Changing…' : 'Change Username'}
              </button>
              <button className={styles.btn} onClick={() => { setShowUsernameForm(false); setUnErr('') }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Security Tab ──────────────────────────────────────────────────────────────
function SecurityTab({ profile, totpStatus, onRefresh }: { profile: ProfileRecord; totpStatus: any; onRefresh: () => void }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <div className={styles.sectionTitle}><IcoShield /> Security & 2FA</div>
          <div className={styles.sectionSub}>Manage your password, two-factor authentication, and MFA methods</div>
        </div>
      </div>
      <PasswordSection profile={profile} />
      <TOTPSection totpStatus={totpStatus} profile={profile} onRefresh={onRefresh} />
      <BackupCodesSection totpStatus={totpStatus} onRefresh={onRefresh} />
    </div>
  )
}

function PasswordSection(_props: { profile: ProfileRecord }) {
  const [current, setCurrent] = useState('')
  const [next, setNext]       = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr]         = useState('')
  const [ok, setOk]           = useState(false)
  const [show, setShow]       = useState(false)

  const str = pwStrength(next)

  const mut = useMutation({
    mutationFn: () => changeProfilePassword(current, next),
    onSuccess: () => {
      setOk(true); setCurrent(''); setNext(''); setConfirm('')
      setShow(false); setTimeout(() => setOk(false), 3000)
    },
    onError: (e: Error) => setErr(e.message),
  })

  const canSubmit = current && next.length >= 8 && next === confirm && !mut.isPending

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <div className={styles.cardTitle}><IcoKey /> Password</div>
        {!show && <button className={styles.btn} onClick={() => setShow(true)}><IcoEdit /> Change Password</button>}
      </div>

      {!show && (
        <div className={styles.infoRow}>
          <IcoKey />
          <span className={styles.infoRowLabel}>Password</span>
          <span className={styles.infoRowVal}>••••••••••••</span>
        </div>
      )}

      {ok && <div className={styles.successMsg}><IcoCheck /> Password changed successfully</div>}

      {show && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {err && <div className={styles.error}>{err}</div>}

          <div className={styles.field}>
            <label className={styles.label}>Current Password</label>
            <input className={styles.input} type="password" value={current}
              onChange={e => { setCurrent(e.target.value); setErr('') }} placeholder="Enter current password" />
          </div>

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.label}>New Password</label>
              <input className={styles.input} type="password" value={next}
                onChange={e => { setNext(e.target.value); setErr('') }} placeholder="Minimum 8 characters" />
              {next && (
                <div className={styles.pwStrength}>
                  <div className={styles.pwStrengthBar}>
                    <div className={styles.pwStrengthFill} style={{ width: `${(str.score / 5) * 100}%`, background: str.color }} />
                  </div>
                  <span className={styles.pwStrengthLabel} style={{ color: str.color }}>{str.label}</span>
                </div>
              )}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Confirm New Password</label>
              <input className={styles.input} type="password" value={confirm}
                onChange={e => { setConfirm(e.target.value); setErr('') }} placeholder="Repeat new password"
                style={{ borderColor: confirm && confirm !== next ? 'var(--color-danger)' : undefined }}
              />
              {confirm && confirm !== next && <div className={`${styles.fieldNote} ${styles.fieldNoteDanger}`}>Passwords do not match</div>}
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--color-text-dim)', lineHeight: 1.5 }}>
            Requirements: at least 8 characters, mix of uppercase, lowercase, numbers, and symbols recommended.
          </div>

          <div className={styles.btnRow}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => mut.mutate()} disabled={!canSubmit}>
              {mut.isPending ? 'Saving…' : <><IcoKey /> Update Password</>}
            </button>
            <button className={styles.btn} onClick={() => { setShow(false); setCurrent(''); setNext(''); setConfirm(''); setErr('') }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TOTPSection({ totpStatus, onRefresh }: { totpStatus: any; profile?: ProfileRecord; onRefresh: () => void }) {
  const [phase, setPhase] = useState<'idle' | 'setup' | 'verify' | 'disable'>('idle')
  const [setupData, setSetupData] = useState<TOTPSetupData | null>(null)
  const [code, setCode]           = useState('')
  const [disablePwd, setDisablePwd] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [err, setErr]             = useState('')
  const [copied, setCopied]       = useState(false)

  const setupMut = useMutation({
    mutationFn: setupTOTP,
    onSuccess: (d) => { setSetupData(d); setPhase('verify'); setErr('') },
    onError: (e: Error) => setErr(e.message),
  })

  const verifyMut = useMutation({
    mutationFn: () => verifyTOTP(code),
    onSuccess: (d) => { setBackupCodes(d.backup_codes); setPhase('idle'); onRefresh() },
    onError: (e: Error) => setErr(e.message),
  })

  const disableMut = useMutation({
    mutationFn: () => disableTOTP(disablePwd),
    onSuccess: () => { setPhase('idle'); setDisablePwd(''); onRefresh() },
    onError: (e: Error) => setErr(e.message),
  })

  const enabled = totpStatus?.enabled
  const qrUrl = setupData
    ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(setupData.qr_url)}&size=160x160&margin=4`
    : ''

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <div className={styles.cardTitle}><IcoPhone /> TOTP Authenticator (2FA)</div>
        <div className={`${styles.statusBadge} ${enabled ? styles.statusOn : styles.statusOff}`}>
          <div className={`${styles.dot} ${enabled ? styles.dotGreen : styles.dotGray}`} />
          {enabled ? 'Enabled' : 'Disabled'}
        </div>
      </div>

      {backupCodes.length > 0 && phase === 'idle' && (
        <div style={{ marginBottom: 12 }}>
          <div className={styles.successMsg} style={{ marginBottom: 8 }}>
            <IcoCheck /> 2FA enabled successfully! Save your backup codes below.
          </div>
          <div className={styles.cardDesc}>
            Store these codes somewhere safe. Each can be used once to recover access if you lose your authenticator.
          </div>
          <div className={styles.backupCodes} style={{ marginTop: 8, marginBottom: 10 }}>
            {backupCodes.map((c, i) => <div key={i} className={styles.backupCode}>{c}</div>)}
          </div>
          <div className={styles.btnRow}>
            <button className={styles.btn} onClick={() => { navigator.clipboard.writeText(backupCodes.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
              <IcoCopy /> {copied ? 'Copied!' : 'Copy All'}
            </button>
            <button className={styles.btn} onClick={() => {
              const a = document.createElement('a')
              a.href = `data:text/plain,${backupCodes.join('\n')}`
              a.download = 'orbit-backup-codes.txt'
              a.click()
            }}>
              <IcoDownload /> Download
            </button>
            <button className={styles.btn} onClick={() => setBackupCodes([])}>Dismiss</button>
          </div>
        </div>
      )}

      {err && <div className={styles.error} style={{ marginBottom: 10 }}>{err}</div>}

      {!enabled && phase === 'idle' && (
        <>
          <div className={styles.cardDesc}>
            Add an extra layer of security by requiring a time-based code from an authenticator app (Google Authenticator, Authy, 1Password, etc.) when signing in.
          </div>
          <div className={styles.mfaGrid} style={{ marginBottom: 12 }}>
            {['Google Authenticator', 'Authy', '1Password', 'Microsoft Authenticator'].map(app => (
              <div key={app} className={styles.mfaCard}>
                <div className={styles.mfaCardIcon} style={{ background: 'rgba(74,158,255,0.1)' }}><IcoPhone /></div>
                <div className={styles.mfaCardName} style={{ fontSize: 11 }}>{app}</div>
                <div className={styles.mfaCardStatus}>Compatible</div>
              </div>
            ))}
          </div>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => { setupMut.mutate(); setErr('') }} disabled={setupMut.isPending}>
            {setupMut.isPending ? 'Generating…' : <><IcoShield /> Enable 2FA</>}
          </button>
        </>
      )}

      {phase === 'verify' && setupData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className={styles.cardDesc}>
            Scan this QR code with your authenticator app, then enter the 6-digit code to activate.
          </div>
          <div className={styles.qrBox}>
            <div className={styles.qrImg}>
              <img src={qrUrl} alt="2FA QR code" />
            </div>
            <div className={styles.qrInfo}>
              <div className={styles.qrStepTitle}>Step 1 — Scan QR Code</div>
              <div className={styles.qrStepDesc}>Open your authenticator app and scan the QR code on the left.</div>
              <div className={styles.qrStepTitle} style={{ marginTop: 8 }}>Or enter the key manually:</div>
              <div className={styles.qrSecret}>{setupData.secret}</div>
              <button className={styles.btn} style={{ marginTop: 6, alignSelf: 'flex-start' }}
                onClick={() => { navigator.clipboard.writeText(setupData.secret); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
                <IcoCopy /> {copied ? 'Copied!' : 'Copy key'}
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Step 2 — Enter the 6-digit code from your app</label>
            <input
              className={styles.input}
              value={code}
              onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr('') }}
              placeholder="000000"
              maxLength={6}
              inputMode="numeric"
              style={{ fontFamily: 'monospace', fontSize: 22, letterSpacing: 8, textAlign: 'center', maxWidth: 220 }}
            />
          </div>

          <div className={styles.btnRow}>
            <button className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => verifyMut.mutate()}
              disabled={code.length !== 6 || verifyMut.isPending}
            >
              {verifyMut.isPending ? 'Verifying…' : <><IcoCheck /> Activate 2FA</>}
            </button>
            <button className={styles.btn} onClick={() => { setPhase('idle'); setSetupData(null); setCode(''); setErr('') }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {enabled && phase === 'idle' && (
        <>
          <div className={styles.cardDesc}>
            Two-factor authentication is active. Your account requires a TOTP code on every login.
          </div>
          <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => setPhase('disable')}>
            <IcoX /> Disable 2FA
          </button>
        </>
      )}

      {phase === 'disable' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className={styles.error} style={{ background: 'rgba(244,67,54,0.06)' }}>
            ⚠ Disabling 2FA reduces your account security. Enter your password to confirm.
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Current Password</label>
            <input className={styles.input} type="password" value={disablePwd}
              onChange={e => { setDisablePwd(e.target.value); setErr('') }} placeholder="Confirm your password" />
          </div>
          <div className={styles.btnRow}>
            <button className={`${styles.btn} ${styles.btnDanger}`}
              onClick={() => disableMut.mutate()}
              disabled={!disablePwd || disableMut.isPending}
            >
              {disableMut.isPending ? 'Disabling…' : 'Confirm — Disable 2FA'}
            </button>
            <button className={styles.btn} onClick={() => { setPhase('idle'); setDisablePwd(''); setErr('') }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function BackupCodesSection({ totpStatus, onRefresh }: { totpStatus: any; onRefresh: () => void }) {
  const [newCodes, setNewCodes] = useState<string[]>([])
  const [confirm, setConfirm]  = useState(false)
  const [err, setErr]          = useState('')
  const [copied, setCopied]    = useState(false)

  const mut = useMutation({
    mutationFn: regenerateBackupCodes,
    onSuccess: (d) => { setNewCodes(d.backup_codes); setConfirm(false); onRefresh() },
    onError: (e: Error) => setErr(e.message),
  })

  if (!totpStatus?.enabled) return null

  const left = totpStatus?.backup_codes_left ?? 0

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <div className={styles.cardTitle}><IcoKey /> Backup Codes</div>
        <div className={`${styles.codesBar}`}>
          <span className={`${styles.codesCount} ${left < 3 ? styles.codesCountDanger : left < 5 ? styles.codesCountWarn : ''}`}>{left}</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>remaining</span>
        </div>
      </div>

      <div className={styles.cardDesc}>
        Backup codes allow you to access your account if you lose access to your authenticator app. Each code can only be used once.
      </div>

      {left === 0 && <div className={`${styles.error}`} style={{ marginBottom: 10, background: 'rgba(244,67,54,0.06)' }}>⚠ You have no backup codes left. Regenerate them now.</div>}
      {left > 0 && left < 3 && <div style={{ marginBottom: 10, padding: '7px 12px', borderRadius: 7, background: 'rgba(255,152,0,0.08)', border: '1px solid rgba(255,152,0,0.2)', color: 'var(--color-warning)', fontSize: 12 }}>⚠ Only {left} code{left !== 1 ? 's' : ''} remaining — consider regenerating</div>}

      {err && <div className={styles.error} style={{ marginBottom: 10 }}>{err}</div>}

      {newCodes.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className={styles.successMsg} style={{ marginBottom: 8 }}><IcoCheck /> New backup codes generated — save them now!</div>
          <div className={styles.backupCodes}>
            {newCodes.map((c, i) => <div key={i} className={styles.backupCode}>{c}</div>)}
          </div>
          <div className={styles.btnRow} style={{ marginTop: 8 }}>
            <button className={styles.btn} onClick={() => { navigator.clipboard.writeText(newCodes.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
              <IcoCopy /> {copied ? 'Copied!' : 'Copy All'}
            </button>
            <button className={styles.btn} onClick={() => {
              const a = document.createElement('a')
              a.href = `data:text/plain,${newCodes.join('\n')}`
              a.download = 'orbit-backup-codes.txt'; a.click()
            }}>
              <IcoDownload /> Download
            </button>
            <button className={styles.btn} onClick={() => setNewCodes([])}>Dismiss</button>
          </div>
        </div>
      )}

      {!confirm ? (
        <button className={`${styles.btn} ${left === 0 ? styles.btnPrimary : ''}`} onClick={() => setConfirm(true)}>
          <IcoRefresh /> Regenerate Backup Codes
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--color-warning)' }}>⚠ Old codes will be invalidated. Continue?</div>
          <div className={styles.btnRow}>
            <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => mut.mutate()} disabled={mut.isPending}>
              {mut.isPending ? 'Generating…' : 'Yes, regenerate'}
            </button>
            <button className={styles.btn} onClick={() => setConfirm(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sessions Tab ──────────────────────────────────────────────────────────────
function SessionsTab({ sessions, onRevoke }: { sessions: ProfileSession[] | undefined; onRevoke: () => void }) {
  const revokeMut = useMutation({
    mutationFn: (id: number) => revokeProfileSession(id),
    onSuccess: onRevoke,
  })

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <div className={styles.sectionTitle}><IcoSession /> Active Sessions</div>
          <div className={styles.sectionSub}>Devices and browsers that are currently logged in to your account</div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{sessions?.length ?? 0} session{(sessions?.length ?? 0) !== 1 ? 's' : ''}</span>
      </div>

      {!sessions || sessions.length === 0 ? (
        <div className={styles.empty}>
          <IcoSession />
          <div className={styles.emptyText}>No active sessions found</div>
          <div className={styles.emptyNote}>Sessions appear here when you're logged in from another device</div>
        </div>
      ) : (
        <div className={styles.sessionList}>
          {sessions.map(sess => (
            <div key={sess.id} className={`${styles.sessionRow} ${sess.current ? styles.sessionRowCurrent : ''}`}>
              <div className={styles.sessionIcon}><IcoSession /></div>
              <div className={styles.sessionInfo}>
                <div className={styles.sessionLabel}>
                  Session #{sess.id}
                  {sess.current && <span className={styles.sessionTag} style={{ marginLeft: 6 }}>Current</span>}
                </div>
                <div className={styles.sessionMeta}>
                  Scope: {sess.scope} · Created: {fmtRel(sess.created_at)} · Expires: {fmt(sess.expires_at)}
                </div>
              </div>
              {!sess.current && (
                <button
                  className={`${styles.btn} ${styles.btnDanger}`}
                  onClick={() => revokeMut.mutate(sess.id)}
                  disabled={revokeMut.isPending}
                  style={{ padding: '5px 10px', fontSize: 11 }}
                >
                  <IcoTrash /> Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {sessions && sessions.length > 1 && (
        <div style={{ marginTop: 4 }}>
          <button className={`${styles.btn} ${styles.btnDanger}`} style={{ fontSize: 11 }}
            onClick={() => sessions.filter(s => !s.current).forEach(s => revokeMut.mutate(s.id))}
            disabled={revokeMut.isPending}
          >
            <IcoTrash /> Revoke All Other Sessions
          </button>
        </div>
      )}
    </div>
  )
}

// ── Activity Tab ──────────────────────────────────────────────────────────────
const ACTION_COLORS: Record<string, string> = {
  login: '#4caf50', logout: '#9c27b0', 'password-change': '#ff9800',
  'totp-enable': '#22d3ee', 'totp-disable': '#f44336', default: '#4a9eff',
}

function ActivityTab({ activity }: { activity: ProfileActivity[] | undefined }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <div className={styles.sectionTitle}><IcoActivity /> Recent Activity</div>
          <div className={styles.sectionSub}>The last 50 security events on your account</div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{activity?.length ?? 0} events</span>
      </div>

      {!activity || activity.length === 0 ? (
        <div className={styles.empty}>
          <IcoActivity />
          <div className={styles.emptyText}>No activity recorded yet</div>
          <div className={styles.emptyNote}>Login events, password changes, and 2FA actions will appear here</div>
        </div>
      ) : (
        <div className={styles.card}>
          <div className={styles.activityList}>
            {activity.map(e => {
              const color = ACTION_COLORS[e.action] ?? ACTION_COLORS.default
              return (
                <div key={e.id} className={styles.activityRow}>
                  <div className={styles.activityDot} style={{ background: color }} />
                  <div className={styles.activityInfo}>
                    <div className={styles.activityAction}>{e.action}</div>
                    {e.details && <div className={styles.activityMeta}>{e.details}</div>}
                    <div className={styles.activityMeta}>{fmtRel(e.ts)} · {fmt(e.ts)}</div>
                  </div>
                  {e.ip && <div className={styles.activityIP}>{e.ip}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Danger Zone Tab ───────────────────────────────────────────────────────────
function DangerTab({ profile }: { profile: ProfileRecord }) {
  const [confirmLogout, setConfirmLogout] = useState(false)

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <div className={styles.sectionTitle} style={{ color: 'var(--color-danger)' }}><IcoDanger /> Danger Zone</div>
          <div className={styles.sectionSub}>Irreversible or high-impact actions. Proceed with caution.</div>
        </div>
      </div>

      <div className={styles.dangerCard}>
        <div className={styles.dangerCardTitle}><IcoSession /> Sign Out All Devices</div>
        <div className={styles.dangerCardDesc}>
          Immediately invalidate all active sessions across every device and browser. You will be logged out of this session too.
        </div>
        {!confirmLogout ? (
          <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => setConfirmLogout(true)}>
            <IcoSession /> Sign Out Everywhere
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--color-danger)', fontWeight: 600 }}>Are you sure? You will be logged out immediately.</div>
            <div className={styles.btnRow}>
              <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(() => window.location.href = '/login')}>
                Confirm — Sign Out All
              </button>
              <button className={styles.btn} onClick={() => setConfirmLogout(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className={styles.dangerCard}>
        <div className={styles.dangerCardTitle}><IcoKey /> Reset 2FA Emergency</div>
        <div className={styles.dangerCardDesc}>
          If you have lost access to your authenticator app and all backup codes, contact an administrator to reset your 2FA configuration.
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-dim)', padding: '8px 12px', background: 'rgba(244,67,54,0.04)', border: '1px solid rgba(244,67,54,0.12)', borderRadius: 7 }}>
          Administrators can reset 2FA via the Settings → Users panel. Self-service emergency reset is not available for security reasons.
        </div>
      </div>

      <div className={styles.dangerCard}>
        <div className={styles.dangerCardTitle}><IcoTrash /> Export Account Data</div>
        <div className={styles.dangerCardDesc}>
          Download a copy of your account data including profile information and audit log entries.
        </div>
        <button className={`${styles.btn} ${styles.btnDanger}`}
          onClick={() => {
            const data = JSON.stringify({ profile, exportedAt: new Date().toISOString() }, null, 2)
            const a = document.createElement('a')
            a.href = `data:application/json,${encodeURIComponent(data)}`
            a.download = `orbit-profile-${profile.username}.json`
            a.click()
          }}
        >
          <IcoDownload /> Export My Data
        </button>
      </div>
    </div>
  )
}
