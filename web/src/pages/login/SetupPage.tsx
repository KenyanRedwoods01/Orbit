import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { Spinner } from '@/components/ui'
import styles from './SetupPage.module.css'

const TOTAL_STEPS = 5

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function ServerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  )
}

function ImportIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

const STEP_META = [
  { label: 'Admin Account', icon: <UserIcon /> },
  { label: 'Server Config', icon: <ServerIcon /> },
  { label: 'Security', icon: <ShieldIcon /> },
  { label: 'Email', icon: <MailIcon /> },
  { label: 'Import', icon: <ImportIcon /> },
]

function StrengthBar({ password }: { password: string }) {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  const label = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'][score]
  const cls = [styles.strengthNone, styles.strengthWeak, styles.strengthFair, styles.strengthGood, styles.strengthStrong, styles.strengthStrong][score]

  if (!password) return null

  return (
    <div className={styles.strengthWrap}>
      <div className={styles.strengthBars}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className={`${styles.strengthSegment} ${i <= score ? cls : ''}`} />
        ))}
      </div>
      <span className={`${styles.strengthLabel} ${cls}`}>{label}</span>
    </div>
  )
}

export default function SetupPage({ onComplete }: { onComplete?: () => void }) {
  const navigate = useNavigate()
  const setUser = useAuthStore(s => s.setUser)

  const [step, setStep] = useState(1)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [adminUsername, setAdminUsername] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminConfirm, setAdminConfirm] = useState('')

  const [serverName, setServerName] = useState('Orbit VPS')
  const [serverUrl, setServerUrl] = useState('')
  const [hostname, setHostname] = useState('')
  const [timezone, setTimezone] = useState('UTC')

  const [pwMinLen, setPwMinLen] = useState(12)
  const [requireUpper, setRequireUpper] = useState(true)
  const [requireNumber, setRequireNumber] = useState(true)
  const [requireSpecial, setRequireSpecial] = useState(true)
  const [sessionTimeout, setSessionTimeout] = useState(480)
  const [enableTwoFactor, setEnableTwoFactor] = useState(false)

  const [enableEmail, setEnableEmail] = useState(false)
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [smtpFrom, setSmtpFrom] = useState('')

  const [importServers, setImportServers] = useState(false)
  const [importFormat, setImportFormat] = useState<'csv' | 'ansible' | 'none'>('none')
  const [runInitialScan, setRunInitialScan] = useState(true)

  const validateStep1 = () => {
    if (!adminUsername.trim()) return 'Username is required'
    if (adminUsername.length < 3) return 'Username must be at least 3 characters'
    if (!/^[a-zA-Z0-9_-]+$/.test(adminUsername)) return 'Username may only contain letters, numbers, _ and -'
    if (!adminPassword) return 'Password is required'
    if (adminPassword.length < 8) return 'Password must be at least 8 characters'
    if (adminPassword !== adminConfirm) return 'Passwords do not match'
    return null
  }

  const nextStep = () => {
    setError(null)
    if (step === 1) {
      const err = validateStep1()
      if (err) { setError(err); return }
    }
    if (step < TOTAL_STEPS) setStep(s => s + 1)
  }

  const prevStep = () => {
    setError(null)
    if (step > 1) setStep(s => s - 1)
  }

  const handleComplete = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin: { username: adminUsername, email: adminEmail, password: adminPassword },
          server: { name: serverName, url: serverUrl, hostname, timezone },
          security: { pw_min_len: pwMinLen, require_upper: requireUpper, require_number: requireNumber, require_special: requireSpecial, session_timeout_min: sessionTimeout, two_factor: enableTwoFactor },
          email: enableEmail ? { host: smtpHost, port: parseInt(smtpPort), user: smtpUser, password: smtpPass, from: smtpFrom } : null,
          import: importServers ? { format: importFormat } : null,
          run_initial_scan: runInitialScan,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Setup failed')
      }
      setDone(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  const handleEnterDashboard = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUsername, password: adminPassword }),
      })
      if (res.ok) {
        const data = await res.json()
        setUser({ username: data.username, scope: data.scope })
      } else {
        setUser({ username: adminUsername, scope: 'admin' })
      }
    } catch {
      setUser({ username: adminUsername, scope: 'admin' })
    } finally {
      setLoading(false)
      onComplete?.()
      navigate('/metrics', { replace: true })
    }
  }

  if (done) {
    return (
      <div className={styles.root}>
        <div className={`${styles.card} ${styles.cardWide}`}>
          <div className={styles.doneWrap}>
            <div className={styles.doneIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className={styles.doneTitle}>Setup Complete</h2>
            <p className={styles.doneSub}>Your admin account has been created and Orbit VPS is ready to use.</p>
            <div className={styles.doneSummary}>
              <div className={styles.doneSummaryRow}>
                <span className={styles.doneSummaryLabel}>Username</span>
                <span className={styles.doneSummaryValue}>{adminUsername}</span>
              </div>
              {adminEmail && (
                <div className={styles.doneSummaryRow}>
                  <span className={styles.doneSummaryLabel}>Email</span>
                  <span className={styles.doneSummaryValue}>{adminEmail}</span>
                </div>
              )}
              <div className={styles.doneSummaryRow}>
                <span className={styles.doneSummaryLabel}>Server</span>
                <span className={styles.doneSummaryValue}>{serverName}</span>
              </div>
            </div>
            <button className={styles.submitBtn} onClick={handleEnterDashboard} disabled={loading}>
              {loading ? <><Spinner size="sm" /> Loading…</> : 'Enter Dashboard'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div className={`${styles.card} ${styles.cardWide}`}>
        <div className={styles.header}>
          <div className={styles.brand}>Orbit <span>VPS</span></div>
          <div className={styles.headerSub}>First-time setup — let's get you started</div>
        </div>

        <div className={styles.stepper}>
          {STEP_META.map((s, i) => {
            const n = i + 1
            const isActive = n === step
            const isDone = n < step
            return (
              <div key={n} className={`${styles.stepItem} ${isActive ? styles.stepActive : ''} ${isDone ? styles.stepDone : ''}`}>
                <div className={styles.stepCircle}>
                  {isDone ? <CheckIcon /> : n}
                </div>
                <span className={styles.stepLabel}>{s.label}</span>
                {n < TOTAL_STEPS && <div className={styles.stepLine} />}
              </div>
            )
          })}
        </div>

        <div className={styles.stepContent}>
          {error && (
            <div className={styles.error}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          {step === 1 && (
            <div className={styles.stepBody}>
              <div className={styles.stepTitleRow}>
                <div className={styles.stepIcon}><UserIcon /></div>
                <div>
                  <div className={styles.stepTitle}>Create Admin Account</div>
                  <div className={styles.stepDesc}>This will be the primary administrator account for Orbit VPS.</div>
                </div>
              </div>
              <div className={styles.fields}>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Username <span className={styles.required}>*</span></label>
                  <input className={styles.input} type="text" placeholder="admin" value={adminUsername} onChange={e => setAdminUsername(e.target.value)} autoFocus autoComplete="username" />
                  <span className={styles.hint}>Only letters, numbers, _ and - allowed</span>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Email <span className={styles.optional}>(optional)</span></label>
                  <input className={styles.input} type="email" placeholder="admin@example.com" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} autoComplete="email" />
                  <span className={styles.hint}>Used for password reset and alert notifications</span>
                </div>
                <div className={styles.row2}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>Password <span className={styles.required}>*</span></label>
                    <div className={styles.passwordWrap}>
                      <input className={styles.input} type={showPw ? 'text' : 'password'} placeholder="••••••••••••" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} autoComplete="new-password" />
                      <button type="button" className={styles.eyeBtn} onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                        <EyeIcon open={showPw} />
                      </button>
                    </div>
                    <StrengthBar password={adminPassword} />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>Confirm Password <span className={styles.required}>*</span></label>
                    <div className={styles.passwordWrap}>
                      <input
                        className={`${styles.input} ${adminConfirm && adminConfirm !== adminPassword ? styles.inputError : ''}`}
                        type={showConfirm ? 'text' : 'password'}
                        placeholder="••••••••••••"
                        value={adminConfirm}
                        onChange={e => setAdminConfirm(e.target.value)}
                        autoComplete="new-password"
                      />
                      <button type="button" className={styles.eyeBtn} onClick={() => setShowConfirm(v => !v)} tabIndex={-1}>
                        <EyeIcon open={showConfirm} />
                      </button>
                    </div>
                    {adminConfirm && adminConfirm !== adminPassword && (
                      <span className={styles.hintError}>Passwords do not match</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className={styles.stepBody}>
              <div className={styles.stepTitleRow}>
                <div className={styles.stepIcon}><ServerIcon /></div>
                <div>
                  <div className={styles.stepTitle}>Server Configuration</div>
                  <div className={styles.stepDesc}>Basic settings for your Orbit VPS instance.</div>
                </div>
              </div>
              <div className={styles.fields}>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Server Name</label>
                  <input className={styles.input} type="text" placeholder="My Server Management UI" value={serverName} onChange={e => setServerName(e.target.value)} />
                  <span className={styles.hint}>Appears in the browser title and notification emails</span>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Server URL <span className={styles.optional}>(optional)</span></label>
                  <input className={styles.input} type="url" placeholder="https://manage.example.com" value={serverUrl} onChange={e => setServerUrl(e.target.value)} />
                  <span className={styles.hint}>Full URL where Orbit VPS is accessible</span>
                </div>
                <div className={styles.row2}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>Hostname <span className={styles.optional}>(optional)</span></label>
                    <input className={styles.input} type="text" placeholder="server-01.example.com" value={hostname} onChange={e => setHostname(e.target.value)} />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>Timezone</label>
                    <select className={styles.select} value={timezone} onChange={e => setTimezone(e.target.value)}>
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">America/New_York</option>
                      <option value="America/Chicago">America/Chicago</option>
                      <option value="America/Denver">America/Denver</option>
                      <option value="America/Los_Angeles">America/Los_Angeles</option>
                      <option value="Europe/London">Europe/London</option>
                      <option value="Europe/Paris">Europe/Paris</option>
                      <option value="Europe/Berlin">Europe/Berlin</option>
                      <option value="Asia/Tokyo">Asia/Tokyo</option>
                      <option value="Asia/Shanghai">Asia/Shanghai</option>
                      <option value="Asia/Kolkata">Asia/Kolkata</option>
                      <option value="Australia/Sydney">Australia/Sydney</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className={styles.stepBody}>
              <div className={styles.stepTitleRow}>
                <div className={styles.stepIcon}><ShieldIcon /></div>
                <div>
                  <div className={styles.stepTitle}>Security & Authentication</div>
                  <div className={styles.stepDesc}>Configure password requirements and session security policies.</div>
                </div>
              </div>
              <div className={styles.fields}>
                <div className={styles.sectionLabel}>Password Policy</div>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Minimum length</label>
                  <div className={styles.rangeWrap}>
                    <input className={styles.rangeInput} type="range" min={8} max={20} value={pwMinLen} onChange={e => setPwMinLen(+e.target.value)} />
                    <span className={styles.rangeValue}>{pwMinLen} characters</span>
                  </div>
                </div>
                <div className={styles.checkboxGroup}>
                  <label className={styles.checkboxLabel}>
                    <input type="checkbox" className={styles.checkbox} checked={requireUpper} onChange={e => setRequireUpper(e.target.checked)} />
                    Require at least one uppercase letter
                  </label>
                  <label className={styles.checkboxLabel}>
                    <input type="checkbox" className={styles.checkbox} checked={requireNumber} onChange={e => setRequireNumber(e.target.checked)} />
                    Require at least one number
                  </label>
                  <label className={styles.checkboxLabel}>
                    <input type="checkbox" className={styles.checkbox} checked={requireSpecial} onChange={e => setRequireSpecial(e.target.checked)} />
                    Require at least one special character
                  </label>
                </div>
                <div className={styles.divider} />
                <div className={styles.sectionLabel}>Session Settings</div>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Session timeout</label>
                  <select className={styles.select} value={sessionTimeout} onChange={e => setSessionTimeout(+e.target.value)}>
                    <option value={60}>1 hour</option>
                    <option value={240}>4 hours</option>
                    <option value={480}>8 hours</option>
                    <option value={1440}>24 hours</option>
                    <option value={10080}>7 days</option>
                  </select>
                </div>
                <div className={styles.divider} />
                <div className={styles.sectionLabel}>Two-Factor Authentication</div>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" className={styles.checkbox} checked={enableTwoFactor} onChange={e => setEnableTwoFactor(e.target.checked)} />
                  Require 2FA for admin login (TOTP)
                  <span className={styles.badge}>Recommended</span>
                </label>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className={styles.stepBody}>
              <div className={styles.stepTitleRow}>
                <div className={styles.stepIcon}><MailIcon /></div>
                <div>
                  <div className={styles.stepTitle}>Email & Notifications</div>
                  <div className={styles.stepDesc}>Optional SMTP configuration for alerts and password reset.</div>
                </div>
              </div>
              <div className={styles.fields}>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" className={styles.checkbox} checked={enableEmail} onChange={e => setEnableEmail(e.target.checked)} />
                  Configure email for alerts and password reset
                  <span className={styles.badgeMuted}>Recommended for production</span>
                </label>
                {enableEmail && (
                  <>
                    <div className={styles.divider} />
                    <div className={styles.sectionLabel}>SMTP Configuration</div>
                    <div className={styles.row2}>
                      <div className={styles.fieldGroup} style={{ flex: 3 }}>
                        <label className={styles.label}>SMTP Server</label>
                        <input className={styles.input} type="text" placeholder="smtp.gmail.com" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} />
                      </div>
                      <div className={styles.fieldGroup} style={{ flex: 1 }}>
                        <label className={styles.label}>Port</label>
                        <input className={styles.input} type="number" placeholder="587" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} />
                      </div>
                    </div>
                    <div className={styles.row2}>
                      <div className={styles.fieldGroup}>
                        <label className={styles.label}>SMTP Username</label>
                        <input className={styles.input} type="text" placeholder="alerts@example.com" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} />
                      </div>
                      <div className={styles.fieldGroup}>
                        <label className={styles.label}>SMTP Password</label>
                        <input className={styles.input} type="password" placeholder="••••••••" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} />
                      </div>
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>From Address</label>
                      <input className={styles.input} type="email" placeholder="Orbit VPS <alerts@example.com>" value={smtpFrom} onChange={e => setSmtpFrom(e.target.value)} />
                    </div>
                  </>
                )}
                {!enableEmail && (
                  <div className={styles.skipNote}>
                    You can configure email settings later in Settings.
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className={styles.stepBody}>
              <div className={styles.stepTitleRow}>
                <div className={styles.stepIcon}><ImportIcon /></div>
                <div>
                  <div className={styles.stepTitle}>Import & Agent Setup</div>
                  <div className={styles.stepDesc}>Optionally import existing servers or run an initial security scan.</div>
                </div>
              </div>
              <div className={styles.fields}>
                <div className={styles.sectionLabel}>Import Existing Servers</div>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" className={styles.checkbox} checked={importServers} onChange={e => setImportServers(e.target.checked)} />
                  Import servers from an existing list
                </label>
                {importServers && (
                  <div className={styles.radioGroup}>
                    {(['csv', 'ansible', 'none'] as const).map(f => (
                      <label key={f} className={styles.radioLabel}>
                        <input type="radio" name="importFormat" className={styles.radio} value={f} checked={importFormat === f} onChange={() => setImportFormat(f)} />
                        {f === 'csv' && 'CSV file (host, user, port, key)'}
                        {f === 'ansible' && 'Ansible inventory'}
                        {f === 'none' && 'Manual entry later'}
                      </label>
                    ))}
                  </div>
                )}
                <div className={styles.divider} />
                <div className={styles.sectionLabel}>Initial Security Scan</div>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" className={styles.checkbox} checked={runInitialScan} onChange={e => setRunInitialScan(e.target.checked)} />
                  Run a security audit after setup completes
                  <span className={styles.badge}>Recommended</span>
                </label>
                <span className={styles.hint} style={{ marginLeft: 24 }}>Checks SSH config, open ports, and failed login attempts</span>
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {step > 1 && (
              <button className={styles.backBtn} onClick={prevStep} disabled={loading}>
                Back
              </button>
            )}
          </div>
          <div className={styles.footerRight}>
            <span className={styles.stepCounter}>Step {step} of {TOTAL_STEPS}</span>
            {step < TOTAL_STEPS ? (
              <button className={styles.submitBtn} onClick={nextStep} disabled={loading}>
                Continue
              </button>
            ) : (
              <button className={styles.submitBtn} onClick={handleComplete} disabled={loading}>
                {loading ? <><Spinner size="sm" /> Finishing…</> : 'Complete Setup'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
