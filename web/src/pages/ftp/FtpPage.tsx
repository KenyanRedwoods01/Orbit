import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatBytes } from '@/lib/utils'
import {
  fetchFtpUsers, createFtpUser, updateFtpUser, deleteFtpUser, toggleFtpUser,
  type FtpUserApi,
  fetchFtpQuotas, setFtpQuota, deleteFtpQuota,
  type FtpQuotaApi,
  fetchFtpServiceStatus, controlFtpService,
  fetchFtpMounts, controlFtpMount,
  fetchMetrics,
  fetchFtpConfig, saveFtpConfig,
} from '@/lib/api'
import styles from './FtpPage.module.css'
import FileExplorer from './FileExplorer'

// ── SVG Icons ─────────────────────────────────────────────────────────────────
function IcPlus()   { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/></svg> }
function IcEdit()   { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2l3 3L6 13H3v-3L11 2z"/></svg> }
function IcTrash()  { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,4 14,4"/><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M6 7v5M10 7v5"/><path d="M3 4l1 10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-10"/></svg> }
function IcLock()   { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="8" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg> }
function IcClose()  { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg> }
function IcRefresh(){ return <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 7A5 5 0 1 1 7 2a5 5 0 0 1 3.5 1.4L12 5"/><path d="M12 1v4H8"/></svg> }
function IcCheck()  { return <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,6 5,9 10,3"/></svg> }

// ── Modal: FTP User ───────────────────────────────────────────────────────────
function FtpUserModal({ user, onClose, onSaved }: {
  user?: FtpUserApi; onClose: () => void; onSaved: () => void
}) {
  const isEdit = !!user
  const [username, setUsername] = useState(user?.username ?? '')
  const [password, setPassword] = useState('')
  const [homeDir, setHomeDir] = useState(user?.home_dir ?? '')
  const [uploadLimit, setUploadLimit] = useState(user?.upload_limit ?? 0)
  const [downloadLimit, setDownloadLimit] = useState(user?.download_limit ?? 0)
  const [chroot, setChroot] = useState(user?.chroot ?? true)
  const [enabled, setEnabled] = useState(user?.enabled ?? true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    if (!isEdit && (!username || !password)) { setErr('Username and password are required'); return }
    setSaving(true); setErr('')
    try {
      if (isEdit) {
        await updateFtpUser(user!.id, {
          password: password || undefined,
          home_dir: homeDir || undefined,
          upload_limit: uploadLimit,
          download_limit: downloadLimit,
          chroot,
          enabled,
        })
      } else {
        await createFtpUser({ username, password, home_dir: homeDir || undefined, upload_limit: uploadLimit, download_limit: downloadLimit, chroot })
      }
      onSaved()
    } catch (e: any) {
      setErr(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalMd}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>{isEdit ? `Edit User — ${user!.username}` : 'Add FTP User'}</div>
          <button className={styles.modalClose} onClick={onClose}><IcClose /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Username</div>
              <input className={styles.formInput} value={username} onChange={e => setUsername(e.target.value)} placeholder="ftpuser" autoFocus disabled={isEdit} />
            </div>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>{isEdit ? 'New Password (optional)' : 'Password'}</div>
              <input className={styles.formInput} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
          </div>
          <div className={styles.formGroup}>
            <div className={styles.formLabel}>Home Directory</div>
            <input className={styles.formInput} value={homeDir} onChange={e => setHomeDir(e.target.value)} placeholder={`/home/ftp/${username || 'user'}`} />
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Upload Limit (KB/s)</div>
              <input className={styles.formInput} type="number" value={uploadLimit} onChange={e => setUploadLimit(Number(e.target.value))} />
              <div className={styles.formHint}>0 = unlimited</div>
            </div>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Download Limit (KB/s)</div>
              <input className={styles.formInput} type="number" value={downloadLimit} onChange={e => setDownloadLimit(Number(e.target.value))} />
              <div className={styles.formHint}>0 = unlimited</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className={styles.formCheckRow}><input type="checkbox" checked={chroot} onChange={e => setChroot(e.target.checked)} /> <span className={styles.formCheckLabel}>Chroot to home directory</span></label>
            {isEdit && <label className={styles.formCheckRow}><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> <span className={styles.formCheckLabel}>Account enabled</span></label>}
          </div>
          {err && <div style={{ color: 'var(--color-danger)', fontSize: 12, padding: '4px 0' }}>{err}</div>}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnSecondary} onClick={onClose} disabled={saving}>Cancel</button>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Disk Quota ─────────────────────────────────────────────────────────
function QuotaModal({ entry, onClose, onSaved }: {
  entry?: FtpQuotaApi; onClose: () => void; onSaved: () => void
}) {
  const [username, setUsername] = useState(entry?.username ?? '')
  const [softMb, setSoftMb] = useState(entry ? Math.round(entry.soft_bytes / 1048576) : 5120)
  const [hardMb, setHardMb] = useState(entry ? Math.round(entry.hard_bytes / 1048576) : 6144)
  const [graceDays, setGraceDays] = useState(entry?.grace_days ?? 7)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    const u = entry?.username || username
    if (!u) { setErr('Username is required'); return }
    setSaving(true); setErr('')
    try {
      await setFtpQuota({ username: u, soft_bytes: softMb * 1048576, hard_bytes: hardMb * 1048576, grace_days: graceDays })
      onSaved()
    } catch (e: any) {
      setErr(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!entry) return
    try { await deleteFtpQuota(entry.username); onSaved() } catch (e: any) { setErr(e.message) }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalSm}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>{entry ? `Edit Quota — ${entry.username}` : 'Set Quota'}</div>
          <button className={styles.modalClose} onClick={onClose}><IcClose /></button>
        </div>
        <div className={styles.modalBody}>
          {!entry && (
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Username</div>
              <input className={styles.formInput} value={username} onChange={e => setUsername(e.target.value)} placeholder="username" autoFocus />
            </div>
          )}
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Soft Limit (MB)</div>
              <input className={styles.formInput} type="number" value={softMb} onChange={e => setSoftMb(Number(e.target.value))} />
              <div className={styles.formHint}>Warning threshold</div>
            </div>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Hard Limit (MB)</div>
              <input className={styles.formInput} type="number" value={hardMb} onChange={e => setHardMb(Number(e.target.value))} />
              <div className={styles.formHint}>Absolute maximum</div>
            </div>
          </div>
          <div className={styles.formGroup}>
            <div className={styles.formLabel}>Grace Period (days)</div>
            <input className={styles.formInput} type="number" value={graceDays} onChange={e => setGraceDays(Number(e.target.value))} />
            <div className={styles.formHint}>Time allowed above soft limit</div>
          </div>
          {err && <div style={{ color: 'var(--color-danger)', fontSize: 12 }}>{err}</div>}
        </div>
        <div className={styles.modalFooter}>
          {entry && <button className={styles.btnDanger} onClick={handleDelete} style={{ marginRight: 'auto' }}>Remove Quota</button>}
          <button className={styles.btnSecondary} onClick={onClose} disabled={saving}>Cancel</button>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Apply Quota'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Cloud Mount ────────────────────────────────────────────────────────
function CloudMountModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [remote, setRemote] = useState('')
  const [mountPath, setMountPath] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleMount() {
    if (!remote || !mountPath) { setErr('Remote name and mount path are required'); return }
    setSaving(true); setErr('')
    try {
      const res = await controlFtpMount(remote, mountPath, 'mount')
      if (!res.ok) setErr(res.output || 'Mount failed')
      else onSaved()
    } catch (e: any) {
      setErr(e.message || 'Mount failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalSm}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Mount rclone Remote</div>
          <button className={styles.modalClose} onClick={onClose}><IcClose /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <div className={styles.formLabel}>Remote Name</div>
            <input className={styles.formInput} value={remote} onChange={e => setRemote(e.target.value)} placeholder="s3-backup" autoFocus />
            <div className={styles.formHint}>Must match a remote in your rclone config</div>
          </div>
          <div className={styles.formGroup}>
            <div className={styles.formLabel}>Mount Point</div>
            <input className={styles.formInput} value={mountPath} onChange={e => setMountPath(e.target.value)} placeholder="/mnt/remote" />
            <div className={styles.formHint}>Directory will be created if it doesn't exist</div>
          </div>
          {err && <div style={{ color: 'var(--color-danger)', fontSize: 12 }}>{err}</div>}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnSecondary} onClick={onClose} disabled={saving}>Cancel</button>
          <button className={styles.btnPrimary} onClick={handleMount} disabled={saving}>{saving ? 'Mounting…' : 'Mount Remote'}</button>
        </div>
      </div>
    </div>
  )
}

// ── FTP Server Tab ────────────────────────────────────────────────────────────
function FtpServerTab() {
  const qc = useQueryClient()
  const [subTab, setSubTab] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const SUB = ['General', 'SSL/TLS', 'Bandwidth', 'Passive Mode']

  const { data: svcStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['ftp-service'],
    queryFn: fetchFtpServiceStatus,
    refetchInterval: 10_000,
    retry: false,
  })
  const controlMut = useMutation({
    mutationFn: controlFtpService,
    onSuccess: () => setTimeout(() => refetchStatus(), 1200),
  })

  const { data: ftpCfg, isLoading: cfgLoading } = useQuery({
    queryKey: ['ftp-config'],
    queryFn: fetchFtpConfig,
    retry: false,
  })

  const p = ftpCfg?.parsed ?? {}

  const [cfg, setCfg] = useState<Record<string, string>>({})

  // Sync parsed config into local state when it loads
  const loaded = useRef(false)
  useEffect(() => {
    if (ftpCfg && !loaded.current) {
      setCfg(ftpCfg.parsed ?? {})
      loaded.current = true
    }
  }, [ftpCfg])

  const get = (key: string, fallback = '') => cfg[key] ?? p[key] ?? fallback
  const getB = (key: string, fallback: boolean) => {
    const v = cfg[key] ?? p[key]
    if (v === undefined) return fallback
    return v.toUpperCase() === 'YES'
  }
  const set = (key: string, val: string) => setCfg(prev => ({ ...prev, [key]: val }))
  const setB = (key: string, val: boolean) => set(key, val ? 'YES' : 'NO')

  const isActive = svcStatus?.active ?? false

  async function handleSave() {
    setSaving(true); setSaveOk(false); setSaveErr('')
    try {
      const merged = { ...p, ...cfg }
      await saveFtpConfig(merged)
      setSaveOk(true)
      qc.invalidateQueries({ queryKey: ['ftp-config'] })
      setTimeout(() => setSaveOk(false), 3000)
    } catch (e: any) {
      setSaveErr(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.ftpSection}>
        <div className={styles.ftpStatusRow}>
          <div className={`${styles.statusDot} ${isActive ? styles.statusDotGreen : styles.statusDotRed}`} />
          <div className={styles.ftpStatusLabel}>vsftpd — {svcStatus ? (isActive ? 'Running' : 'Stopped') : 'Checking…'}</div>
          <div className={styles.ftpStatusSub}>Port {get('listen_port', '21')} · Config: /etc/vsftpd.conf</div>
          {!isActive && (
            <button className={styles.fmBtnAccent} style={{ marginLeft: 'auto' }} onClick={() => controlMut.mutate('start')} disabled={controlMut.isPending}>
              Start
            </button>
          )}
          {isActive && <>
            <button className={styles.fmBtn} style={{ marginLeft: 'auto' }} onClick={() => controlMut.mutate('restart')} disabled={controlMut.isPending}>Restart</button>
            <button className={styles.fmBtn} onClick={() => controlMut.mutate('stop')} disabled={controlMut.isPending}>Stop</button>
          </>}
          <button className={styles.fmBtn} onClick={() => refetchStatus()} title="Refresh status"><IcRefresh /></button>
        </div>
        {controlMut.isError && (
          <div style={{ fontSize: 11, color: 'var(--color-danger)', padding: '4px 0' }}>
            {(controlMut.error as Error).message}
          </div>
        )}
      </div>
      {cfgLoading && <div className={styles.emptyState} style={{ padding: '12px 14px' }}>Loading configuration…</div>}
      <div className={styles.ftpSubTabs}>
        {SUB.map((s, i) => (
          <button key={s} className={`${styles.ftpSubTab} ${subTab === i ? styles.activeSubTab : ''}`} onClick={() => setSubTab(i)}>{s}</button>
        ))}
      </div>
      {subTab === 0 && (
        <div className={styles.configGrid}>
          <div className={styles.configCard}>
            <div className={styles.configCardTitle}>Basic Settings</div>
            {([
              ['Listen Address', 'listen_address', '0.0.0.0'],
              ['Listen Port', 'listen_port', '21'],
              ['Max Clients', 'max_clients', '150'],
              ['Max Connections per IP', 'max_per_ip', '10'],
              ['Idle Timeout (s)', 'idle_session_timeout', '300'],
              ['Data Timeout (s)', 'data_connection_timeout', '120'],
            ] as [string, string, string][]).map(([label, key, fallback]) => (
              <div key={key} className={styles.configRow}>
                <span className={styles.configLabel}>{label}</span>
                <input className={styles.configInput} value={get(key, fallback)} onChange={e => set(key, e.target.value)} />
              </div>
            ))}
          </div>
          <div className={styles.configCard}>
            <div className={styles.configCardTitle}>Access Control</div>
            {([
              ['Allow anonymous access', 'anonymous_enable', false],
              ['Enable local users', 'local_enable', true],
              ['Enable virtual users', 'virtual_use_local_privs', false],
              ['Allow upload', 'write_enable', true],
              ['Allow download', 'download_enable', true],
              ['Allow rename/delete', 'rename_enable', true],
              ['Allow overwrite', 'no_anon_overwrite', false],
              ['Chroot local users', 'chroot_local_user', true],
            ] as [string, string, boolean][]).map(([label, key, fallback]) => (
              <div key={key} className={styles.configRow}>
                <span className={styles.configLabel}>{label}</span>
                <label className={styles.toggle}><input type="checkbox" checked={getB(key, fallback)} onChange={e => setB(key, e.target.checked)} /><span className={styles.toggleSlider} /></label>
              </div>
            ))}
          </div>
        </div>
      )}
      {subTab === 1 && (
        <div className={styles.configGrid}>
          <div className={styles.configCard}>
            <div className={styles.configCardTitle}>SSL/TLS</div>
            {([
              ['Enable SSL', 'ssl_enable', true],
              ['Force TLS for logins', 'force_local_logins_ssl', true],
              ['Force SSL for data transfer', 'force_local_data_ssl', true],
              ['Force SSL for login', 'ssl_ciphers', false],
            ] as [string, string, boolean][]).map(([label, key, fallback]) => (
              <div key={key} className={styles.configRow}>
                <span className={styles.configLabel}>{label}</span>
                <label className={styles.toggle}><input type="checkbox" checked={getB(key, fallback)} onChange={e => setB(key, e.target.checked)} /><span className={styles.toggleSlider} /></label>
              </div>
            ))}
          </div>
          <div className={styles.configCard}>
            <div className={styles.configCardTitle}>Certificates</div>
            {([
              ['Certificate path', 'rsa_cert_file', '/etc/ssl/certs/vsftpd.pem'],
              ['Private key path', 'rsa_private_key_file', '/etc/ssl/private/vsftpd.key'],
              ['CA certificate', 'ca_certs_file', '/etc/ssl/certs/ca-bundle.crt'],
            ] as [string, string, string][]).map(([label, key, fallback]) => (
              <div key={key} className={styles.configRow}>
                <span className={styles.configLabel}>{label}</span>
                <input className={styles.configInput} value={get(key, fallback)} onChange={e => set(key, e.target.value)} style={{ width: 200 }} />
              </div>
            ))}
            <div className={styles.configRow}>
              <span className={styles.configLabel}>Min TLS version</span>
              <select className={styles.configInput} style={{ width: 90 }} value={get('ssl_tlsv1_2', 'YES') === 'YES' ? 'TLSv1.2' : 'TLSv1.3'} onChange={e => { set('ssl_tlsv1_2', e.target.value === 'TLSv1.2' ? 'YES' : 'NO'); set('ssl_tlsv1_3', e.target.value === 'TLSv1.3' ? 'YES' : 'NO') }}>
                <option>TLSv1.2</option><option>TLSv1.3</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={styles.fmBtn} style={{ fontSize: 11 }}>Generate Self-Signed</button>
              <button className={styles.fmBtn} style={{ fontSize: 11 }}>Use Let's Encrypt</button>
            </div>
          </div>
        </div>
      )}
      {subTab === 2 && (
        <div className={styles.configGrid}>
          <div className={styles.configCard}>
            <div className={styles.configCardTitle}>Global Bandwidth (KB/s)</div>
            {([
              ['Anon upload limit', 'anon_max_rate', '0'],
              ['Anon download limit', 'anon_max_rate', '0'],
              ['Local upload limit', 'local_max_rate', '0'],
              ['Local download limit', 'local_max_rate', '0'],
            ] as [string, string, string][]).map(([label, key, fallback], i) => (
              <div key={i} className={styles.configRow}>
                <span className={styles.configLabel}>{label}</span>
                <input className={styles.configInput} value={get(key, fallback)} onChange={e => set(key, e.target.value)} type="number" />
              </div>
            ))}
          </div>
          <div className={styles.configCard}>
            <div className={styles.configCardTitle}>Performance</div>
            {([
              ['Use sendfile', 'use_sendfile', true],
              ['Use mmap', 'trans_chunk_size', false],
              ['Async I/O', 'async_abor_enable', false],
              ['TCP keepalive', 'tcp_wrappers', true],
            ] as [string, string, boolean][]).map(([label, key, fallback]) => (
              <div key={key} className={styles.configRow}>
                <span className={styles.configLabel}>{label}</span>
                <label className={styles.toggle}><input type="checkbox" checked={getB(key, fallback)} onChange={e => setB(key, e.target.checked)} /><span className={styles.toggleSlider} /></label>
              </div>
            ))}
          </div>
        </div>
      )}
      {subTab === 3 && (
        <div className={styles.configCard}>
          <div className={styles.configCardTitle}>Passive Mode (PASV)</div>
          {([
            ['Passive min port', 'pasv_min_port', '30000'],
            ['Passive max port', 'pasv_max_port', '31000'],
            ['Passive address', 'pasv_address', ''],
            ['Connection limit (anon)', 'anon_max_rate', '0'],
          ] as [string, string, string][]).map(([label, key, fallback]) => (
            <div key={key} className={styles.configRow}>
              <span className={styles.configLabel}>{label}</span>
              <input className={styles.configInput} value={get(key, fallback)} onChange={e => set(key, e.target.value)} />
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, padding: '0 14px 14px', alignItems: 'center' }}>
        <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Configuration'}
        </button>
        <button className={styles.btnSecondary} onClick={() => { setCfg({}); loaded.current = false }}>Reset to Defaults</button>
        {saveOk && <span style={{ fontSize: 11, color: 'var(--color-success)' }}>Saved successfully</span>}
        {saveErr && <span style={{ fontSize: 11, color: 'var(--color-danger)' }}>{saveErr}</span>}
      </div>
    </div>
  )
}

// ── FTP Users Tab ─────────────────────────────────────────────────────────────
function FtpUsersTab() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [editUser, setEditUser] = useState<FtpUserApi | undefined>()

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['ftp-users'],
    queryFn: fetchFtpUsers,
    retry: false,
  })

  const deleteMut = useMutation({
    mutationFn: deleteFtpUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ftp-users'] }),
  })
  const toggleMut = useMutation({
    mutationFn: toggleFtpUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ftp-users'] }),
  })

  const activeCount = users.filter(u => u.enabled).length

  return (
    <div className={styles.panel}>
      <div className={styles.tableToolbar}>
        <span className={styles.tableTitle}>FTP Users</span>
        {!isLoading && !error && (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{activeCount} active / {users.length} total</div>
        )}
        <button className={styles.fmBtnAccent} style={{ marginLeft: 8 }} onClick={() => { setEditUser(undefined); setModal(true) }}>
          <IcPlus /> Add User
        </button>
      </div>
      {isLoading ? (
        <div className={styles.emptyState}>Loading users…</div>
      ) : error ? (
        <div className={styles.emptyState} style={{ color: 'var(--color-danger)' }}>Could not load FTP users — is vsftpd installed?</div>
      ) : users.length === 0 ? (
        <div className={styles.emptyState}>No FTP users yet. Click "Add User" to create one.</div>
      ) : (
        <table className={styles.dataTable}>
          <thead>
            <tr><th>Username</th><th>Home Directory</th><th>Chroot</th><th>Upload</th><th>Download</th><th>Last Login</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.username}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-muted)' }}>{u.home_dir}</td>
                <td>{u.chroot ? <span className={`${styles.badge} ${styles.badgeGreen}`}>Yes</span> : <span className={`${styles.badge} ${styles.badgeGray}`}>No</span>}</td>
                <td style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{u.upload_limit > 0 ? `${u.upload_limit} KB/s` : 'Unlimited'}</td>
                <td style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{u.download_limit > 0 ? `${u.download_limit} KB/s` : 'Unlimited'}</td>
                <td style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                  {u.last_login ? new Date(u.last_login * 1000).toLocaleString() : 'Never'}
                </td>
                <td>{u.enabled
                  ? <span className={`${styles.badge} ${styles.badgeGreen}`}>Active</span>
                  : <span className={`${styles.badge} ${styles.badgeRed}`}>Disabled</span>}
                </td>
                <td>
                  <div className={styles.rowActions} style={{ opacity: 1 }}>
                    <button className={styles.rowActBtn} title="Edit" onClick={() => { setEditUser(u); setModal(true) }}><IcEdit /></button>
                    <button className={styles.rowActBtn} title={u.enabled ? 'Disable' : 'Enable'} onClick={() => toggleMut.mutate(u.id)}><IcLock /></button>
                    <button className={`${styles.rowActBtn} ${styles.danger}`} title="Delete" onClick={() => { if (confirm(`Delete user "${u.username}"?`)) deleteMut.mutate(u.id) }}><IcTrash /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {modal && (
        <FtpUserModal
          user={editUser}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); qc.invalidateQueries({ queryKey: ['ftp-users'] }) }}
        />
      )}
    </div>
  )
}

// ── Disk Quotas Tab ───────────────────────────────────────────────────────────
function DiskQuotasTab() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [editEntry, setEditEntry] = useState<FtpQuotaApi | undefined>()

  const { data: quotas = [], isLoading, error } = useQuery({
    queryKey: ['ftp-quotas'],
    queryFn: fetchFtpQuotas,
    retry: false,
  })

  return (
    <div className={styles.panel}>
      <div className={styles.tableToolbar}>
        <span className={styles.tableTitle}>Disk Quotas</span>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>{quotas.length} quota{quotas.length !== 1 ? 's' : ''} configured</div>
        <button className={styles.fmBtnAccent} onClick={() => { setEditEntry(undefined); setModal(true) }}><IcPlus /> Set Quota</button>
      </div>
      {isLoading ? (
        <div className={styles.emptyState}>Loading quotas…</div>
      ) : error ? (
        <div className={styles.emptyState} style={{ color: 'var(--color-warning)' }}>Quota data unavailable — disk quotas may not be enabled on this system.</div>
      ) : quotas.length === 0 ? (
        <div className={styles.emptyState}>No quotas configured. Click "Set Quota" to add one.</div>
      ) : (
        <table className={styles.dataTable}>
          <thead>
            <tr><th>User</th><th>Soft Limit</th><th>Hard Limit</th><th>Grace Period</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {quotas.map(q => (
              <tr key={q.id}>
                <td style={{ fontWeight: 600 }}>{q.username}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{formatBytes(q.soft_bytes)}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{formatBytes(q.hard_bytes)}</td>
                <td style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{q.grace_days}d</td>
                <td>
                  <button className={styles.rowActBtn} style={{ opacity: 1 }} title="Edit quota" onClick={() => { setEditEntry(q); setModal(true) }}><IcEdit /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {modal && (
        <QuotaModal
          entry={editEntry}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); qc.invalidateQueries({ queryKey: ['ftp-quotas'] }) }}
        />
      )}
    </div>
  )
}

// ── Cloud Storage Tab ─────────────────────────────────────────────────────────
function CloudStorageTab() {
  const qc = useQueryClient()
  const [mountModal, setMountModal] = useState(false)
  const [unmountTarget, setUnmountTarget] = useState<string | null>(null)
  const [unmountPath, setUnmountPath] = useState('')
  const [unmounting, setUnmounting] = useState(false)
  const [actionErr, setActionErr] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['ftp-mounts'],
    queryFn: fetchFtpMounts,
    retry: false,
  })
  const remotes = data?.remotes ?? []

  async function handleUnmount(remote: string) {
    if (!unmountPath) { setActionErr('Enter the mount path to unmount'); return }
    setUnmounting(true); setActionErr('')
    try {
      const res = await controlFtpMount(remote, unmountPath, 'unmount')
      if (!res.ok) setActionErr(res.output || 'Unmount failed')
      else { setUnmountTarget(null); setUnmountPath(''); qc.invalidateQueries({ queryKey: ['ftp-mounts'] }) }
    } catch (e: any) {
      setActionErr(e.message || 'Unmount failed')
    } finally {
      setUnmounting(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.tableToolbar}>
        <span className={styles.tableTitle}>Cloud Storage</span>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          {remotes.length > 0 ? `${remotes.length} rclone remote${remotes.length !== 1 ? 's' : ''} configured` : 'No remotes configured'}
        </div>
        <button className={styles.fmBtnAccent} style={{ marginLeft: 'auto' }} onClick={() => setMountModal(true)}>
          <IcPlus /> Mount Remote
        </button>
      </div>

      {isLoading ? (
        <div className={styles.emptyState}>Checking rclone remotes…</div>
      ) : error ? (
        <div className={styles.emptyState} style={{ color: 'var(--color-warning)' }}>
          rclone is not available. Install rclone and configure remotes to use cloud storage.
        </div>
      ) : remotes.length === 0 ? (
        <div className={styles.emptyState}>
          No rclone remotes found. Run <code style={{ fontFamily: 'monospace', background: 'var(--color-surface-raised)', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>rclone config</code> on the server to add cloud providers.
        </div>
      ) : (
        <div className={styles.cloudsGrid}>
          {remotes.map(remote => (
            <div key={remote} className={styles.cloudCard}>
              <div className={styles.cloudCardHeader}>
                <div>
                  <div className={styles.cloudProvider}>{remote}</div>
                  <div className={styles.cloudBucket}>rclone remote</div>
                </div>
                <span className={`${styles.badge} ${styles.badgeGreen}`}><IcCheck /> Ready</span>
              </div>
              {unmountTarget === remote ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    className={styles.formInput}
                    placeholder="Mount point path (e.g. /mnt/remote)"
                    value={unmountPath}
                    onChange={e => setUnmountPath(e.target.value)}
                    autoFocus
                  />
                  {actionErr && <div style={{ fontSize: 11, color: 'var(--color-danger)' }}>{actionErr}</div>}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className={styles.fmBtnDanger} style={{ fontSize: 11, flex: 1 }} onClick={() => handleUnmount(remote)} disabled={unmounting}>
                      {unmounting ? 'Unmounting…' : 'Unmount'}
                    </button>
                    <button className={styles.fmBtn} style={{ fontSize: 11 }} onClick={() => { setUnmountTarget(null); setActionErr('') }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className={styles.fmBtnAccent} style={{ fontSize: 11, flex: 1 }} onClick={() => { setUnmountTarget(remote); setActionErr('') }}>
                    Unmount
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {mountModal && (
        <CloudMountModal
          onClose={() => setMountModal(false)}
          onSaved={() => { setMountModal(false); qc.invalidateQueries({ queryKey: ['ftp-mounts'] }) }}
        />
      )}
    </div>
  )
}

// ── SFTP Tab ──────────────────────────────────────────────────────────────────
function SftpTab() {
  return (
    <div className={styles.panel}>
      <div className={styles.ftpSection}>
        <div className={styles.ftpStatusRow}>
          <div className={`${styles.statusDot} ${styles.statusDotGreen}`} />
          <div className={styles.ftpStatusLabel}>SFTP — Available via SSH</div>
          <div className={styles.ftpStatusSub}>Port 22 — No extra daemon required</div>
        </div>
        <div className={styles.infoBox}>
          SFTP is automatically available through OpenSSH for all users with shell access. No additional configuration is needed beyond the SSH server settings. Use SFTP clients like FileZilla, WinSCP, or Cyberduck to connect using your SSH credentials.
        </div>
        <div className={styles.configGrid}>
          <div className={styles.configCard}>
            <div className={styles.configCardTitle}>SFTP Access Control</div>
            <div className={styles.configRow}><span className={styles.configLabel}>Enable SFTP subsystem</span><label className={styles.toggle}><input type="checkbox" defaultChecked /><span className={styles.toggleSlider} /></label></div>
            <div className={styles.configRow}><span className={styles.configLabel}>Chroot users to home directory</span><label className={styles.toggle}><input type="checkbox" /><span className={styles.toggleSlider} /></label></div>
            <div className={styles.configRow}><span className={styles.configLabel}>Require SFTP-only (no shell)</span><label className={styles.toggle}><input type="checkbox" /><span className={styles.toggleSlider} /></label></div>
          </div>
          <div className={styles.configCard}>
            <div className={styles.configCardTitle}>Chroot Jail Configuration</div>
            <div className={styles.configRow}><span className={styles.configLabel}>Group name</span><input className={styles.configInput} defaultValue="sftp" /></div>
            <div className={styles.configRow}><span className={styles.configLabel}>Chroot directory</span><input className={styles.configInput} defaultValue="/home/%u" /></div>
            <div className={styles.configRow}><span className={styles.configLabel}>Force command</span><input className={styles.configInput} defaultValue="internal-sftp" style={{ width: 140 }} /></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className={styles.btnPrimary} style={{ fontSize: 11 }}>Apply SSH Config</button>
              <button className={styles.btnSecondary} style={{ fontSize: 11 }}>Add SFTP-Only User</button>
            </div>
          </div>
        </div>
        <div className={styles.warnBox}>
          Modifying SSH configuration (/etc/ssh/sshd_config) will take effect after restarting the SSH daemon. A backup will be created automatically. Ensure you have an alternative access method before applying changes.
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type TabKey = 'files' | 'ftp' | 'users' | 'quotas' | 'cloud' | 'sftp'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'files',  label: 'File Manager' },
  { key: 'ftp',    label: 'FTP Server'   },
  { key: 'users',  label: 'FTP Users'    },
  { key: 'quotas', label: 'Disk Quotas'  },
  { key: 'cloud',  label: 'Cloud Storage'},
  { key: 'sftp',   label: 'SFTP'         },
]

export default function FtpPage() {
  const [tab, setTab] = useState<TabKey>('files')

  const { data: metricsSnap } = useQuery({
    queryKey: ['ftp-metrics-snap'],
    queryFn: fetchMetrics,
    refetchInterval: 30_000,
    retry: false,
  })
  const { data: ftpUsers = [] } = useQuery({
    queryKey: ['ftp-users'],
    queryFn: fetchFtpUsers,
    retry: false,
  })
  const { data: mountsData } = useQuery({
    queryKey: ['ftp-mounts'],
    queryFn: fetchFtpMounts,
    retry: false,
  })
  const { data: svcStatus } = useQuery({
    queryKey: ['ftp-service'],
    queryFn: fetchFtpServiceStatus,
    refetchInterval: 15_000,
    retry: false,
  })

  const primaryDisk = metricsSnap?.disk?.[0]
  const diskUsed = primaryDisk ? formatBytes(primaryDisk.used_bytes) : '—'
  const diskTotal = primaryDisk ? formatBytes(primaryDisk.total_bytes) : '—'
  const diskPct = primaryDisk ? primaryDisk.used_pct.toFixed(1) : null

  const activeUsers = ftpUsers.filter(u => u.enabled).length
  const totalUsers = ftpUsers.length
  const mountCount = mountsData?.remotes?.length ?? 0

  const stats = [
    {
      label: 'Disk Used',
      value: diskUsed,
      sub: diskTotal !== '—' ? `/ ${diskTotal}${diskPct ? ` — ${diskPct}%` : ''}` : 'loading…',
    },
    {
      label: 'FTP Users',
      value: totalUsers > 0 ? String(totalUsers) : '0',
      sub: `${activeUsers} active${totalUsers > activeUsers ? `, ${totalUsers - activeUsers} disabled` : ''}`,
    },
    {
      label: 'vsftpd',
      value: svcStatus ? (svcStatus.active ? 'Running' : 'Stopped') : '—',
      sub: svcStatus?.active ? 'Port 21' : 'Service inactive',
      valueColor: svcStatus ? (svcStatus.active ? 'var(--color-success)' : 'var(--color-danger)') : undefined,
    },
    {
      label: 'Cloud Remotes',
      value: String(mountCount),
      sub: mountCount === 0 ? 'rclone not configured' : `rclone remote${mountCount !== 1 ? 's' : ''}`,
    },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.statsRow}>
        {stats.map(s => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statLabel}>{s.label}</div>
            <div className={styles.statValue} style={{ color: s.valueColor }}>{s.value}</div>
            <div className={styles.statSub}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className={styles.tabBar}>
        {TABS.map(t => (
          <button
            key={t.key}
            className={`${styles.tab} ${tab === t.key ? styles.activeTab : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'files'  && <FileExplorer />}
      {tab === 'ftp'    && <FtpServerTab />}
      {tab === 'users'  && <FtpUsersTab />}
      {tab === 'quotas' && <DiskQuotasTab />}
      {tab === 'cloud'  && <CloudStorageTab />}
      {tab === 'sftp'   && <SftpTab />}
    </div>
  )
}
