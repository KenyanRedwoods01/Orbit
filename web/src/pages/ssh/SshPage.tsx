import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  SNIPPET_CATEGORIES, TERMINAL_THEMES,
  type SshSession, type SshKey, type SavedConnection, type CommandSnippet,
  type PortForward, type SessionRecording,
} from './sshData'
import {
  fetchSSHSessions, fetchSSHKeys, fetchSSHSaved, fetchSSHSnippets,
  fetchSSHPortForwards, fetchSSHRecordings, fetchFSList,
  fetchCollabSessions, createCollabSession, deleteCollabSession,
  fetchCollabParticipants, addCollabParticipant, removeCollabParticipant, updateCollabParticipant,
  type ApiSshSession, type ApiSshKey, type ApiSshSaved,
  type ApiSshSnippet, type ApiSshPortForward, type ApiSshRecording,
  type CollabSession,
} from '../../lib/api'
import { XtermTerminal } from '../../components/XtermTerminal'
import styles from './SshPage.module.css'

// ── API → UI transform helpers ────────────────────────────────────────────────
function tsToDate(ts: number): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toISOString().split('T')[0]
}
function tsToRelative(ts?: number): string {
  if (!ts) return '—'
  const diff = Math.floor(Date.now() / 1000 - ts)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
function fmtDuration(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}
function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}
function apiSessionToUi(s: ApiSshSession): SshSession {
  const elapsed = s.started_at ? Math.floor(Date.now() / 1000 - s.started_at) : 0
  return {
    id: String(s.id), server: s.server, user: s.user, host: s.server,
    port: s.port || 22,
    status: s.status === 'active' ? 'active' : s.status === 'idle' ? 'idle' : 'dead',
    uptime: elapsed > 0 ? fmtDuration(elapsed) : '—',
    encoding: 'UTF-8', cols: 120, rows: 30, theme: 'dark',
  }
}
function apiKeyToUi(k: ApiSshKey): SshKey {
  const typeMap: Record<string, string> = {
    'ssh-rsa': 'RSA', 'ssh-ed25519': 'Ed25519', 'ecdsa-sha2-nistp256': 'ECDSA',
  }
  return {
    id: String(k.id), name: k.name,
    type: typeMap[k.type] || k.type,
    fingerprint: k.fingerprint, created: tsToDate(k.created_at), lastUsed: '—', bits: 0,
  }
}
function apiSavedToUi(c: ApiSshSaved): SavedConnection {
  return {
    id: String(c.id), name: c.name, host: c.host, port: c.port || 22, user: c.user,
    authType: c.auth_type === 'key' ? 'key' : c.auth_type === 'agent' ? 'agent' : 'password',
    keyId: c.key_id ? String(c.key_id) : undefined,
    tags: c.tags ? c.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    lastConnected: tsToRelative(c.last_used ?? undefined),
    group: '',
  }
}
function apiSnippetToUi(s: ApiSshSnippet): CommandSnippet {
  return {
    id: String(s.id), name: s.name, command: s.command,
    category: s.category || 'System', description: s.description || '',
    tags: s.tags ? s.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
  }
}
function apiPortForwardToUi(pf: ApiSshPortForward): PortForward {
  return {
    id: String(pf.id),
    type: (['local','remote','dynamic'].includes(pf.type) ? pf.type : 'local') as PortForward['type'],
    localPort: pf.local_port, remoteHost: pf.remote_host, remotePort: pf.remote_port,
    session: String(pf.session_id ?? ''),
    status: pf.status === 'active' ? 'active' : 'inactive',
  }
}
function apiRecordingToUi(r: ApiSshRecording): SessionRecording {
  return {
    id: String(r.id), server: r.server, user: '—',
    started: tsToDate(r.created_at), duration: fmtDuration(r.duration_s),
    commands: 0, outputLines: 0, size: fmtBytes(r.size_bytes),
  }
}

// ── Icons ──────────────────────────────────────────────────────────────────
function IcTerminal()  { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="2" width="14" height="12" rx="2"/><polyline points="4,6 7,9 4,12"/><line x1="9" y1="12" x2="13" y2="12"/></svg> }
function IcPlus()      { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/></svg> }
function IcClose()     { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg> }
function IcGrid()      { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="1" y="1" width="6" height="6" rx="1.2"/><rect x="9" y="1" width="6" height="6" rx="1.2"/><rect x="1" y="9" width="6" height="6" rx="1.2"/><rect x="9" y="9" width="6" height="6" rx="1.2"/></svg> }
function IcList()      { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="1" y1="4" x2="15" y2="4"/><line x1="1" y1="8" x2="15" y2="8"/><line x1="1" y1="12" x2="15" y2="12"/></svg> }
function IcSearch()    { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="6.5" cy="6.5" r="4.5"/><line x1="10" y1="10" x2="14" y2="14"/></svg> }
function IcDrag()      { return <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="4" cy="3" r="1"/><circle cx="8" cy="3" r="1"/><circle cx="4" cy="6" r="1"/><circle cx="8" cy="6" r="1"/><circle cx="4" cy="9" r="1"/><circle cx="8" cy="9" r="1"/></svg> }
function IcRecord()    { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="none"/></svg> }
function IcUsers()     { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="5" r="2.5"/><path d="M1 13a5 5 0 0 1 10 0"/><circle cx="12" cy="5" r="2" strokeWidth="1.4"/><path d="M14 13a4 4 0 0 0-3-3.87"/></svg> }
function IcFolder()    { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4a1 1 0 0 1 1-1h4l1.5 1.5H14a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4z"/></svg> }
function IcSnippets()  { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="12" height="12" rx="1.5"/><line x1="5" y1="6" x2="11" y2="6"/><line x1="5" y1="9" x2="9" y2="9"/></svg> }
function IcSettings2() { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/></svg> }
function IcPlay()      { return <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><polygon points="3,2 10,6 3,10"/></svg> }
function IcPause()     { return <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="3" height="8" rx="1"/><rect x="7" y="2" width="3" height="8" rx="1"/></svg> }
function IcStop()      { return <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="8" height="8" rx="1"/></svg> }
function IcDownload()  { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v6M3 6l3 3 3-3"/><path d="M2 10h8"/></svg> }
function IcUpload()    { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8V2M3 4l3-3 3 3"/><path d="M2 10h8"/></svg> }
function IcRefresh()   { return <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 7A5 5 0 1 1 7 2a5 5 0 0 1 3.5 1.4L12 5"/><path d="M12 1v4H8"/></svg> }
function IcTrash()     { return <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="1,3 13,3"/><path d="M4 3V2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M5 6v4M9 6v4"/><path d="M2 3l1 9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-9"/></svg> }
function IcEdit()      { return <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2l3 3L5 12H2v-3L9 2z"/></svg> }
function IcCopy()      { return <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="8" height="9" rx="1"/><path d="M2 9V2a1 1 0 0 1 1-1h7"/></svg> }
function IcSplit()     { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="1" y="2" width="14" height="12" rx="1.5"/><line x1="8" y1="2" x2="8" y2="14"/></svg> }
function IcFullscreen(){ return <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9"/></svg> }

// ── Helpers ─────────────────────────────────────────────────────────────────
function statusBadge(s: SshSession['status']) {
  if (s === 'active')     return <span className={`${styles.badge} ${styles.badgeGreen}`}><span className={styles.dot} style={{ background:'var(--color-success)' }} />Active</span>
  if (s === 'idle')       return <span className={`${styles.badge} ${styles.badgeYellow}`}><span className={styles.dot} style={{ background:'var(--color-warning)' }} />Idle</span>
  if (s === 'dead')       return <span className={`${styles.badge} ${styles.badgeRed}`}><span className={styles.dot} style={{ background:'var(--color-danger)' }} />Dead</span>
  return <span className={`${styles.badge} ${styles.badgeBlue}`}>Connecting</span>
}

// ── New Connection Modal ─────────────────────────────────────────────────────
function NewConnectionModal({ onClose }: { onClose: () => void }) {
  const [auth, setAuth] = useState<'key'|'password'|'agent'>('key')
  const [advanced, setAdvanced] = useState(false)
  const [tab, setTab] = useState(0)
  const tabs = ['Connection', 'Advanced', 'Environment']
  void advanced; void setAdvanced
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalLg}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>New SSH Connection</div>
            <div className={styles.modalSub}>Configure a new SSH session</div>
          </div>
          <button className={styles.modalClose} onClick={onClose}><IcClose /></button>
        </div>

        <div style={{ display:'flex', gap:2, padding:'8px 16px 0', borderBottom:'1px solid var(--color-border)' }}>
          {tabs.map((t,i) => (
            <button key={t} className={`${styles.tab} ${tab===i ? styles.activeTab : ''}`} style={{fontSize:12,padding:'6px 14px'}} onClick={()=>setTab(i)}>{t}</button>
          ))}
        </div>

        <div className={styles.modalBody}>
          {tab === 0 && <>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <div className={styles.formLabel}>Host / Server</div>
                <input className={styles.formInput} placeholder="web-01.prod or 10.0.1.10" autoFocus />
              </div>
              <div className={styles.formGroup}>
                <div className={styles.formLabel}>Port</div>
                <input className={styles.formInput} defaultValue="22" type="number" />
              </div>
            </div>

            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Username</div>
              <input className={styles.formInput} defaultValue="root" />
            </div>

            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Authentication</div>
              <div className={styles.radioGroup}>
                {(['key','password','agent'] as const).map(v => (
                  <label key={v} className={`${styles.radioRow} ${auth===v ? styles.radioSelected : ''}`}>
                    <input type="radio" name="auth" value={v} checked={auth===v} onChange={() => setAuth(v)} />
                    {v === 'key' ? 'SSH Key' : v === 'password' ? 'Password' : 'System SSH Agent'}
                  </label>
                ))}
              </div>
            </div>

            {auth === 'key' && (
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <div className={styles.formLabel}>SSH Key</div>
                  <select className={styles.formSelect}>
                    <option>my-server-key (RSA 4096)</option>
                    <option>deploy-key (Ed25519)</option>
                    <option>backup-key (RSA 2048)</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <div className={styles.formLabel}>Passphrase (if any)</div>
                  <input className={styles.formInput} type="password" placeholder="Leave blank if none" />
                </div>
              </div>
            )}

            {auth === 'password' && (
              <div className={styles.formGroup}>
                <div className={styles.formLabel}>Password</div>
                <input className={styles.formInput} type="password" placeholder="SSH password" />
              </div>
            )}

            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Save as (optional)</div>
              <input className={styles.formInput} placeholder="e.g. Web Server 01 - Production" />
            </div>

            <div style={{ display:'flex', gap:12 }}>
              <label className={styles.checkRow}>
                <input type="checkbox" defaultChecked />
                <span>Open in new tab</span>
              </label>
              <label className={styles.checkRow}>
                <input type="checkbox" />
                <span>Record session</span>
              </label>
            </div>
          </>}

          {tab === 1 && <>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Jump Host / Bastion Proxy</div>
              <input className={styles.formInput} placeholder="bastion.example.com:22 (leave blank to skip)" />
            </div>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Custom SSH Options</div>
              <input className={styles.formInput} placeholder="-o ServerAliveInterval=60 -o ConnectTimeout=10" />
            </div>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Execute command on connect</div>
              <input className={styles.formInput} placeholder="cd /var/www && ls -la" />
            </div>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Local Port Forwarding</div>
              <input className={styles.formInput} placeholder="8080:localhost:80 (local_port:remote_host:remote_port)" />
            </div>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Remote Port Forwarding</div>
              <input className={styles.formInput} placeholder="22000:localhost:22" />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <label className={styles.checkRow}><input type="checkbox" defaultChecked /> <span>Use PTY (pseudo-terminal)</span></label>
              <label className={styles.checkRow}><input type="checkbox" defaultChecked /> <span>Enable X11 forwarding</span></label>
              <label className={styles.checkRow}><input type="checkbox" /> <span>Compress connection</span></label>
              <label className={styles.checkRow}><input type="checkbox" defaultChecked /> <span>Keep-alive (ServerAliveInterval=60)</span></label>
            </div>
          </>}

          {tab === 2 && <>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Terminal Type</div>
              <select className={styles.formSelect} defaultValue="xterm-256color">
                <option>xterm-256color</option>
                <option>xterm</option>
                <option>vt100</option>
                <option>screen</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Locale / Language</div>
              <input className={styles.formInput} defaultValue="en_US.UTF-8" />
            </div>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Extra Environment Variables</div>
              <textarea className={styles.formTextarea} placeholder="KEY=value (one per line)" style={{ minHeight:80 }} />
            </div>
          </>}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.btn} onClick={onClose}>Cancel</button>
          <button className={styles.btn} onClick={onClose}>Test Connection</button>
          <button className={styles.btnPrimary} onClick={onClose}>Connect</button>
        </div>
      </div>
    </div>
  )
}

// ── New SSH Key Modal ────────────────────────────────────────────────────────
function NewKeyModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'generate'|'import'>('generate')
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalMd}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div><div className={styles.modalTitle}>Add SSH Key</div></div>
          <button className={styles.modalClose} onClick={onClose}><IcClose /></button>
        </div>
        <div className={styles.modalBody}>
          <div style={{ display:'flex', gap:8 }}>
            <button className={mode==='generate' ? styles.btnPrimary : styles.btn} onClick={() => setMode('generate')}>Generate New Key</button>
            <button className={mode==='import' ? styles.btnPrimary : styles.btn} onClick={() => setMode('import')}>Import Existing Key</button>
          </div>

          {mode === 'generate' && <>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Key Name</div>
              <input className={styles.formInput} placeholder="my-server-key" autoFocus />
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <div className={styles.formLabel}>Key Type</div>
                <select className={styles.formSelect}>
                  <option>Ed25519 (recommended)</option>
                  <option>RSA 4096</option>
                  <option>RSA 2048</option>
                  <option>ECDSA 521</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <div className={styles.formLabel}>Passphrase</div>
                <input className={styles.formInput} type="password" placeholder="Optional passphrase" />
              </div>
            </div>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Comment</div>
              <input className={styles.formInput} placeholder="user@host" />
            </div>
          </>}

          {mode === 'import' && <>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Key Name</div>
              <input className={styles.formInput} placeholder="imported-key" autoFocus />
            </div>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Private Key (PEM format)</div>
              <textarea className={styles.formTextarea} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..." style={{ minHeight:120, fontFamily:'monospace', fontSize:11 }} />
            </div>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Passphrase (if encrypted)</div>
              <input className={styles.formInput} type="password" placeholder="Leave blank if not encrypted" />
            </div>
          </>}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btn} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} onClick={onClose}>{mode === 'generate' ? 'Generate Key' : 'Import Key'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Snippet Modal ───────────────────────────────────────────────────────
function SnippetModal({ snippet, onClose }: { snippet?: CommandSnippet; onClose: () => void }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalMd}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div><div className={styles.modalTitle}>{snippet ? 'Edit Snippet' : 'New Command Snippet'}</div></div>
          <button className={styles.modalClose} onClick={onClose}><IcClose /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <div className={styles.formLabel}>Snippet Name</div>
            <input className={styles.formInput} defaultValue={snippet?.name} placeholder="e.g. Check nginx config" autoFocus />
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Category</div>
              <select className={styles.formSelect} defaultValue={snippet?.category}>
                {SNIPPET_CATEGORIES.slice(1).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Tags (comma separated)</div>
              <input className={styles.formInput} defaultValue={snippet?.tags?.join(', ')} placeholder="nginx, logs" />
            </div>
          </div>
          <div className={styles.formGroup}>
            <div className={styles.formLabel}>Command</div>
            <textarea className={styles.formTextarea} defaultValue={snippet?.command} placeholder="Enter shell command..." style={{ minHeight:100 }} />
          </div>
          <div className={styles.formGroup}>
            <div className={styles.formLabel}>Description</div>
            <input className={styles.formInput} defaultValue={snippet?.description} placeholder="What does this command do?" />
          </div>
        </div>
        <div className={styles.modalFooter}>
          {snippet && <button className={styles.btnDanger} style={{ marginRight:'auto' }} onClick={onClose}>Delete</button>}
          <button className={styles.btn} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} onClick={onClose}>{snippet ? 'Save Changes' : 'Create Snippet'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Port Forward Modal ───────────────────────────────────────────────────────
function PortForwardModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<'local'|'remote'|'dynamic'>('local')
  const { data: sessRaw = [] } = useQuery({ queryKey: ['ssh-sessions'], queryFn: fetchSSHSessions })
  const pfSessions = sessRaw.map(apiSessionToUi).filter(s => s.status === 'active' || s.status === 'idle')
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalMd}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div><div className={styles.modalTitle}>New Port Forward</div></div>
          <button className={styles.modalClose} onClick={onClose}><IcClose /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <div className={styles.formLabel}>Forwarding Type</div>
            <div className={styles.radioGroup}>
              {(['local','remote','dynamic'] as const).map(v => (
                <label key={v} className={`${styles.radioRow} ${type===v ? styles.radioSelected : ''}`}>
                  <input type="radio" name="fwtype" checked={type===v} onChange={() => setType(v)} />
                  {v === 'local' ? 'Local (-L): Forward local port to remote host' : v === 'remote' ? 'Remote (-R): Expose local port on remote server' : 'Dynamic (-D): SOCKS5 proxy via SSH'}
                </label>
              ))}
            </div>
          </div>
          <div className={styles.formGroup}>
            <div className={styles.formLabel}>Session</div>
            <select className={styles.formSelect}>
              {pfSessions.map(s => (
                <option key={s.id}>{s.server} ({s.user})</option>
              ))}
            </select>
          </div>
          {type !== 'dynamic' ? (
            <div className={styles.formRow3}>
              <div className={styles.formGroup}>
                <div className={styles.formLabel}>Local Port</div>
                <input className={styles.formInput} type="number" placeholder="8080" />
              </div>
              <div className={styles.formGroup}>
                <div className={styles.formLabel}>Remote Host</div>
                <input className={styles.formInput} placeholder="localhost" />
              </div>
              <div className={styles.formGroup}>
                <div className={styles.formLabel}>Remote Port</div>
                <input className={styles.formInput} type="number" placeholder="80" />
              </div>
            </div>
          ) : (
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Local SOCKS Port</div>
              <input className={styles.formInput} type="number" placeholder="1080" />
            </div>
          )}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btn} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} onClick={onClose}>Add Forward</button>
        </div>
      </div>
    </div>
  )
}

// ── Session Settings Modal ───────────────────────────────────────────────────
function SessionSettingsModal({ session, onClose }: { session: SshSession; onClose: () => void }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalMd}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>Session Settings — {session.server}</div>
            <div className={styles.modalSub}>{session.user}@{session.host}:{session.port}</div>
          </div>
          <button className={styles.modalClose} onClick={onClose}><IcClose /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Font Size</div>
              <input className={styles.formInput} type="number" defaultValue={13} />
            </div>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Font Family</div>
              <select className={styles.formSelect}>
                <option>JetBrains Mono</option>
                <option>Fira Mono</option>
                <option>Cascadia Code</option>
                <option>Consolas</option>
                <option>Menlo</option>
              </select>
            </div>
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Columns</div>
              <input className={styles.formInput} type="number" defaultValue={session.cols} />
            </div>
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>Rows</div>
              <input className={styles.formInput} type="number" defaultValue={session.rows} />
            </div>
          </div>
          <div className={styles.formGroup}>
            <div className={styles.formLabel}>Theme</div>
            <select className={styles.formSelect} defaultValue={session.theme}>
              {TERMINAL_THEMES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className={styles.formGroup}>
            <div className={styles.formLabel}>Scrollback Buffer (lines)</div>
            <input className={styles.formInput} type="number" defaultValue={10000} />
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <label className={styles.checkRow}><input type="checkbox" defaultChecked /> <span>Audible bell</span></label>
            <label className={styles.checkRow}><input type="checkbox" defaultChecked /> <span>Smooth scrolling</span></label>
            <label className={styles.checkRow}><input type="checkbox" /> <span>Blink cursor</span></label>
            <label className={styles.checkRow}><input type="checkbox" defaultChecked /> <span>Ctrl+Shift+C / Ctrl+Shift+V for copy/paste</span></label>
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btn} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} onClick={onClose}>Apply Settings</button>
        </div>
      </div>
    </div>
  )
}

// ── Collab Share Modal ───────────────────────────────────────────────────────
function ShareModal({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalSm}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div><div className={styles.modalTitle}>Share Session</div></div>
          <button className={styles.modalClose} onClick={onClose}><IcClose /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <div className={styles.formLabel}>Share Link</div>
            <input className={styles.formInput} readOnly value="https://orbit.local/ssh/share/abc123xyz" />
            <div className={styles.formHint}>Anyone with this link can join. Set permissions below.</div>
          </div>
          <div className={styles.formGroup}>
            <div className={styles.formLabel}>Default Permission</div>
            <select className={styles.formSelect}>
              <option>Read-only (view only)</option>
              <option>Read + Write (can type)</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <div className={styles.formLabel}>Invite by Email</div>
            <input className={styles.formInput} type="email" placeholder="colleague@example.com" />
          </div>
          <label className={styles.checkRow}><input type="checkbox" defaultChecked /> <span>Require approval before joining</span></label>
          <label className={styles.checkRow}><input type="checkbox" /> <span>Record shared session</span></label>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btn} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} onClick={onClose}>Copy Link &amp; Share</button>
        </div>
      </div>
    </div>
  )
}

// ── Active Sessions Panel ─────────────────────────────────────────────────────
function ActiveSessionsPanel({
  sessions, view, setView, sortBy, setSortBy, search, setSearch,
  onAttach, onNewConn,
}: {
  sessions: SshSession[]
  view: 'grid'|'list'
  setView: (v:'grid'|'list') => void
  sortBy: string
  setSortBy: (s:string) => void
  search: string
  setSearch: (s:string) => void
  onAttach: (s: SshSession) => void
  onNewConn: () => void
}) {
  const [dragOver, setDragOver] = useState<string|null>(null)
  const [order, setOrder] = useState(sessions.map(s => s.id))
  const dragId = useRef<string|null>(null)

  const sorted = [...sessions].sort((a,b) => {
    if (sortBy === 'status') return a.status.localeCompare(b.status)
    if (sortBy === 'server') return a.server.localeCompare(b.server)
    if (sortBy === 'user')   return a.user.localeCompare(b.user)
    if (sortBy === 'uptime') return a.uptime.localeCompare(b.uptime)
    return order.indexOf(a.id) - order.indexOf(b.id)
  }).filter(s =>
    !search || s.server.toLowerCase().includes(search.toLowerCase()) ||
    s.user.toLowerCase().includes(search.toLowerCase()) ||
    s.host.toLowerCase().includes(search.toLowerCase())
  )

  const handleDragStart = (id: string) => { dragId.current = id }
  const handleDrop = (targetId: string) => {
    if (!dragId.current || dragId.current === targetId) return
    setOrder(prev => {
      const next = [...prev]
      const from = next.indexOf(dragId.current!)
      const to   = next.indexOf(targetId)
      next.splice(from, 1)
      next.splice(to, 0, dragId.current!)
      return next
    })
    setDragOver(null)
    dragId.current = null
  }

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span className={styles.panelTitle}>Active Sessions</span>
        <span className={styles.muted}>{sessions.filter(s=>s.status==='active').length} active / {sessions.length} total</span>
        <div style={{ flex:1 }} />
        <div className={styles.searchWrap}>
          <IcSearch />
          <input className={styles.searchInput} placeholder="Search sessions..." value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <select className={styles.sortSelect} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
          <option value="manual">Manual order</option>
          <option value="status">Sort by status</option>
          <option value="server">Sort by server</option>
          <option value="user">Sort by user</option>
          <option value="uptime">Sort by uptime</option>
        </select>
        <div className={styles.viewToggle}>
          <button className={`${styles.viewBtn} ${view==='list' ? styles.viewActive : ''}`} onClick={()=>setView('list')} title="List view"><IcList /></button>
          <button className={`${styles.viewBtn} ${view==='grid' ? styles.viewActive : ''}`} onClick={()=>setView('grid')} title="Grid view"><IcGrid /></button>
        </div>
        <button className={styles.btnPrimary} onClick={onNewConn}><IcPlus /> New Connection</button>
        <button className={styles.btn}>Reconnect All</button>
        <button className={styles.btn}>Close Dead</button>
      </div>

      {sorted.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}><IcTerminal /></div>
          <div className={styles.emptyTitle}>No sessions</div>
          <div className={styles.emptySub}>Start a new connection to get going</div>
        </div>
      )}

      {view === 'list' && sorted.length > 0 && (
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th style={{width:24}} />
              <th><span className={styles.thInner}>Server</span></th>
              <th><span className={styles.thInner}>User</span></th>
              <th><span className={styles.thInner}>Connection</span></th>
              <th><span className={styles.thInner}>Status</span></th>
              <th><span className={styles.thInner}>Uptime</span></th>
              <th><span className={styles.thInner}>Cols × Rows</span></th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => (
              <tr
                key={s.id}
                draggable
                onDragStart={() => handleDragStart(s.id)}
                onDragOver={e => { e.preventDefault(); setDragOver(s.id) }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => handleDrop(s.id)}
                style={{ background: dragOver === s.id ? 'rgba(74,158,255,.06)' : undefined }}
              >
                <td><span className={styles.dragHandle}><IcDrag /></span></td>
                <td style={{ fontWeight:600 }}>{s.server}</td>
                <td style={{ fontFamily:'monospace', fontSize:11 }}>{s.user}</td>
                <td style={{ fontFamily:'monospace', fontSize:11, color:'var(--color-text-muted)' }}>{s.host}:{s.port}</td>
                <td>{statusBadge(s.status)}</td>
                <td style={{ fontSize:11, color:'var(--color-text-muted)' }}>{s.uptime}</td>
                <td style={{ fontSize:11, color:'var(--color-text-dim)' }}>{s.cols}×{s.rows}</td>
                <td>
                  <div className={styles.rowActions}>
                    {s.status !== 'dead' && (
                      <button className={styles.actBtn} onClick={() => onAttach(s)}>Attach</button>
                    )}
                    {s.status === 'dead' && (
                      <button className={styles.actBtn} style={{ color:'var(--color-accent)' }}>Reconnect</button>
                    )}
                    {s.status !== 'dead' && (
                      <button className={styles.actBtn}>Ctrl+C</button>
                    )}
                    <button className={`${styles.actBtn} ${styles.danger}`}>{s.status === 'dead' ? 'Remove' : 'Kill'}</button>
                    <button className={styles.actBtn}><IcRecord /> Logs</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {view === 'grid' && sorted.length > 0 && (
        <div className={styles.gridView}>
          {sorted.map(s => (
            <div
              key={s.id}
              className={`${styles.gridCard} ${dragOver===s.id ? styles.dragOver : ''}`}
              draggable
              onDragStart={() => handleDragStart(s.id)}
              onDragOver={e => { e.preventDefault(); setDragOver(s.id) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => handleDrop(s.id)}
            >
              <div className={styles.gridCardTop}>
                <div>
                  <div className={styles.gridCardTitle}>{s.server}</div>
                  <div className={styles.gridCardSub}>{s.user}@{s.host}:{s.port}</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  {statusBadge(s.status)}
                  <span className={styles.dragHandle}><IcDrag /></span>
                </div>
              </div>
              <div className={styles.gridCardMeta}>
                <span className={styles.chip}>Uptime: {s.uptime}</span>
                <span className={styles.chip}>{s.cols}×{s.rows}</span>
                <span className={styles.chip}>{s.encoding}</span>
              </div>
              <div className={styles.gridCardActions}>
                {s.status !== 'dead' && <button className={styles.btn} style={{fontSize:10}} onClick={() => onAttach(s)}>Attach</button>}
                {s.status === 'dead' && <button className={styles.btn} style={{fontSize:10, color:'var(--color-accent)'}}>Reconnect</button>}
                {s.status !== 'dead' && <button className={styles.btn} style={{fontSize:10}}>Ctrl+C</button>}
                <button className={styles.btn} style={{fontSize:10}}><IcRecord /> Logs</button>
                <button className={styles.btnDanger} style={{fontSize:10, padding:'3px 8px'}}>{s.status==='dead' ? 'Remove' : 'Kill'}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display:'flex', gap:6, padding:'8px 12px', borderTop:'1px solid var(--color-border)', flexWrap:'wrap' }}>
        <button className={styles.btn}><IcPlus /> New Tab</button>
        <button className={styles.btn}>New Window</button>
        <button className={styles.btn}>Reconnect All</button>
        <button className={styles.btnDanger} style={{fontSize:11,padding:'4px 10px'}}>Close Dead</button>
      </div>
    </div>
  )
}

// ── Terminal Panel ────────────────────────────────────────────────────────────
function TerminalPanel({ sessions, activeId, setActiveId }: {
  sessions: SshSession[]
  activeId: string
  setActiveId: (id:string) => void
}) {
  const [splitView, setSplitView] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const active = sessions.find(s => s.id === activeId) ?? sessions[0]
  const liveSessions = sessions.filter(s => s.status !== 'dead')

  return (
    <div className={styles.terminalWrap}>
      {/* Session tabs */}
      <div className={styles.sessionTabBar}>
        {liveSessions.map(s => (
          <button
            key={s.id}
            className={`${styles.sessionTab} ${s.id===activeId ? styles.sessionTabActive : ''}`}
            onClick={() => setActiveId(s.id)}
          >
            <span className={`${styles.dot} ${s.status==='active' ? styles.dotGreen : s.status==='idle' ? styles.dotYellow : styles.dotBlue}`} />
            {s.server}
            <button className={styles.sessionTabClose} onClick={e => { e.stopPropagation() }}><IcClose /></button>
          </button>
        ))}
        <button className={styles.btn} style={{ fontSize:10, padding:'3px 8px', marginLeft:4 }}><IcPlus /></button>
      </div>

      {/* Main terminal card */}
      <div className={styles.terminalCard}>
        <div className={styles.terminalHeader}>
          <IcTerminal />
          <span className={styles.terminalTitle}>Active Terminal: {active?.server} ({active?.user})</span>
          <div style={{ flex:1 }} />
          <div style={{ display:'flex', gap:4 }}>
            <button className={styles.btnIconOnly} title="Split view" onClick={() => setSplitView(v=>!v)}><IcSplit /></button>
            <button className={styles.btnIconOnly} title="Settings" onClick={() => setShowSettings(true)}><IcSettings2 /></button>
            <button className={styles.btnIconOnly} title="Share session" onClick={() => setShowShare(true)}><IcUsers /></button>
            <button className={styles.btnIconOnly} title="Fullscreen"><IcFullscreen /></button>
            <button className={styles.btnIconOnly} title="Record"><IcRecord /></button>
            <button className={styles.btnIconOnly} title="Close"><IcClose /></button>
          </div>
        </div>

        {!splitView ? (
          <div className={styles.terminalBody} style={{ padding:0, overflow:'hidden' }}>
            <XtermTerminal height={360} />
          </div>
        ) : (
          <div className={styles.splitGrid}>
            {liveSessions.slice(0,2).map(s => (
              <div key={s.id} style={{ display:'flex', flexDirection:'column' }}>
                <div style={{ padding:'6px 10px', background:'var(--color-surface-raised)', borderBottom:'1px solid var(--color-border)', fontSize:11, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
                  <span className={`${styles.dot} ${s.status==='active' ? styles.dotGreen : styles.dotYellow}`} />{s.server}:{s.port} ({s.user})
                  <span style={{flex:1}}/>
                  <button className={styles.actBtn} style={{fontSize:10}} onClick={() => { setActiveId(s.id); setSplitView(false) }}>Focus</button>
                  <button className={`${styles.actBtn} ${styles.danger}`} style={{fontSize:10}}>Close</button>
                </div>
                <div className={styles.terminalBody} style={{ minHeight:180, padding:0, overflow:'hidden' }}>
                  <XtermTerminal height={180} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.terminalInfoBar}>
          <span className={styles.termInfoItem}>{active?.host}:{active?.port}</span>
          <span className={styles.termInfoItem}>User: {active?.user}</span>
          <span className={styles.termInfoItem}>Cols: {active?.cols}</span>
          <span className={styles.termInfoItem}>Rows: {active?.rows}</span>
          <span className={styles.termInfoItem}>Encoding: {active?.encoding}</span>
          <span className={styles.termInfoItem}>Backend: xterm-256color</span>
        </div>

        <div className={styles.termActions}>
          <button className={styles.btn} style={{fontSize:10}}>Send Ctrl+C</button>
          <button className={styles.btn} style={{fontSize:10}}>Send Ctrl+D</button>
          <button className={styles.btn} style={{fontSize:10}}>Send Ctrl+Z</button>
          <button className={styles.btn} style={{fontSize:10}}>Clear Screen</button>
          <button className={styles.btn} style={{fontSize:10}}>Reset Terminal</button>
          <button className={styles.btn} style={{fontSize:10}}>Capture Output</button>
          <button className={styles.btn} style={{fontSize:10}} onClick={() => setShowShare(true)}>Share Session</button>
        </div>
      </div>

      {showSettings && active && <SessionSettingsModal session={active} onClose={() => setShowSettings(false)} />}
      {showShare && <ShareModal onClose={() => setShowShare(false)} />}
    </div>
  )
}

// ── Saved Connections Tab ────────────────────────────────────────────────────
function SavedConnectionsTab({ onConnect }: { onConnect: () => void }) {
  const [view, setView] = useState<'grid'|'list'>('list')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [dragOver, setDragOver] = useState<string|null>(null)
  const dragId = useRef<string|null>(null)
  const { data: savedRaw = [] } = useQuery({ queryKey: ['ssh-saved'], queryFn: fetchSSHSaved })
  const savedData: SavedConnection[] = savedRaw.map(apiSavedToUi)
  const [order, setOrder] = useState<string[]>([])

  const sorted = [...savedData]
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.host.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => {
      if (sortBy==='name') return a.name.localeCompare(b.name)
      if (sortBy==='group') return a.group.localeCompare(b.group)
      if (sortBy==='user') return a.user.localeCompare(b.user)
      if (sortBy==='last') return a.lastConnected.localeCompare(b.lastConnected)
      const oi = order.indexOf(a.id), oj = order.indexOf(b.id)
      if (oi === -1 && oj === -1) return 0
      if (oi === -1) return 1
      if (oj === -1) return -1
      return oi - oj
    })

  const handleDrop = (targetId: string) => {
    if (!dragId.current || dragId.current === targetId) return
    setOrder(prev => {
      const next = [...prev]
      const from = next.indexOf(dragId.current!)
      const to   = next.indexOf(targetId)
      next.splice(from, 1)
      next.splice(to, 0, dragId.current!)
      return next
    })
    setDragOver(null)
    dragId.current = null
  }

  const groupColors: Record<string, string> = {
    Production: 'var(--color-danger)',
    Staging:    'var(--color-warning)',
    Infrastructure: '#4a9eff',
    Development: 'var(--color-success)',
  }

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span className={styles.panelTitle}>Saved Connections</span>
        <span className={styles.muted}>{savedData.length} connections</span>
        <div style={{ flex:1 }} />
        <div className={styles.searchWrap}>
          <IcSearch />
          <input className={styles.searchInput} placeholder="Search connections..." value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <select className={styles.sortSelect} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
          <option value="manual">Manual order</option>
          <option value="name">Sort by name</option>
          <option value="group">Sort by group</option>
          <option value="user">Sort by user</option>
          <option value="last">Sort by last used</option>
        </select>
        <div className={styles.viewToggle}>
          <button className={`${styles.viewBtn} ${view==='list' ? styles.viewActive : ''}`} onClick={()=>setView('list')}><IcList /></button>
          <button className={`${styles.viewBtn} ${view==='grid' ? styles.viewActive : ''}`} onClick={()=>setView('grid')}><IcGrid /></button>
        </div>
        <button className={styles.btnPrimary} onClick={onConnect}><IcPlus /> New Connection</button>
        <button className={styles.btn}>Import</button>
        <button className={styles.btn}>Export</button>
      </div>

      {view === 'list' && (
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th style={{width:24}} />
              <th>Name</th>
              <th>Host</th>
              <th>User</th>
              <th>Auth</th>
              <th>Group</th>
              <th>Tags</th>
              <th>Last Connected</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(c => (
              <tr
                key={c.id}
                draggable
                onDragStart={() => { dragId.current = c.id }}
                onDragOver={e => { e.preventDefault(); setDragOver(c.id) }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => handleDrop(c.id)}
                style={{ background: dragOver===c.id ? 'rgba(74,158,255,.06)' : undefined }}
              >
                <td><span className={styles.dragHandle}><IcDrag /></span></td>
                <td style={{ fontWeight:600 }}>{c.name}</td>
                <td style={{ fontFamily:'monospace', fontSize:11 }}>{c.host}:{c.port}</td>
                <td style={{ fontFamily:'monospace', fontSize:11 }}>{c.user}</td>
                <td>
                  <span className={`${styles.badge} ${c.authType==='key' ? styles.badgeBlue : c.authType==='agent' ? styles.badgeGray : styles.badgeYellow}`}>
                    {c.authType === 'key' ? 'Key' : c.authType === 'agent' ? 'Agent' : 'Password'}
                  </span>
                </td>
                <td>
                  <span className={styles.badge} style={{ background:`rgba(${groupColors[c.group]||'128,128,128'},.1)`, color: groupColors[c.group] }}>{c.group}</span>
                </td>
                <td>
                  <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
                    {c.tags.map(t => <span key={t} className={styles.chip}>{t}</span>)}
                  </div>
                </td>
                <td style={{ fontSize:11, color:'var(--color-text-muted)' }}>{c.lastConnected}</td>
                <td>
                  <div className={styles.rowActions}>
                    <button className={styles.actBtn} style={{ color:'var(--color-accent)' }} onClick={onConnect}>Connect</button>
                    <button className={styles.actBtn}><IcEdit /></button>
                    <button className={`${styles.actBtn} ${styles.danger}`}><IcTrash /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {view === 'grid' && (
        <div className={styles.gridView}>
          {sorted.map(c => (
            <div
              key={c.id}
              className={`${styles.gridCard} ${dragOver===c.id ? styles.dragOver : ''}`}
              draggable
              onDragStart={() => { dragId.current = c.id }}
              onDragOver={e => { e.preventDefault(); setDragOver(c.id) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => handleDrop(c.id)}
            >
              <div className={styles.gridCardTop}>
                <div>
                  <div className={styles.gridCardTitle}>{c.name}</div>
                  <div className={styles.gridCardSub}>{c.user}@{c.host}:{c.port}</div>
                </div>
                <span className={styles.dragHandle}><IcDrag /></span>
              </div>
              <div className={styles.gridCardMeta}>
                <span className={`${styles.badge} ${c.authType==='key' ? styles.badgeBlue : c.authType==='agent' ? styles.badgeGray : styles.badgeYellow}`}>
                  {c.authType === 'key' ? 'Key' : c.authType === 'agent' ? 'Agent' : 'Password'}
                </span>
                <span className={styles.chip}>{c.group}</span>
                {c.tags.slice(0,2).map(t => <span key={t} className={styles.chip}>{t}</span>)}
              </div>
              <div style={{ fontSize:10, color:'var(--color-text-dim)' }}>Last: {c.lastConnected}</div>
              <div className={styles.gridCardActions}>
                <button className={styles.btnPrimary} style={{fontSize:10}} onClick={onConnect}>Connect</button>
                <button className={styles.btn} style={{fontSize:10}}><IcEdit /></button>
                <button className={styles.btnDanger} style={{fontSize:10, padding:'3px 8px'}}><IcTrash /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── SSH Keys Tab ──────────────────────────────────────────────────────────────
function SshKeysTab() {
  const [showNew, setShowNew] = useState(false)
  const [view, setView] = useState<'grid'|'list'>('list')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name')

  const { data: keysRaw = [] } = useQuery({ queryKey: ['ssh-keys'], queryFn: fetchSSHKeys })
  const keysData: ReturnType<typeof apiKeyToUi>[] = keysRaw.map(apiKeyToUi)

  const sorted = [...keysData]
    .filter(k => !search || k.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => sortBy==='name' ? a.name.localeCompare(b.name) : sortBy==='type' ? a.type.localeCompare(b.type) : a.lastUsed.localeCompare(b.lastUsed))

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span className={styles.panelTitle}>SSH Key Manager</span>
        <span className={styles.muted}>{keysData.length} keys</span>
        <div style={{ flex:1 }} />
        <div className={styles.searchWrap} style={{minWidth:160}}>
          <IcSearch />
          <input className={styles.searchInput} placeholder="Search keys..." value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <select className={styles.sortSelect} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
          <option value="name">Sort by name</option>
          <option value="type">Sort by type</option>
          <option value="lastUsed">Sort by last used</option>
        </select>
        <div className={styles.viewToggle}>
          <button className={`${styles.viewBtn} ${view==='list' ? styles.viewActive : ''}`} onClick={()=>setView('list')}><IcList /></button>
          <button className={`${styles.viewBtn} ${view==='grid' ? styles.viewActive : ''}`} onClick={()=>setView('grid')}><IcGrid /></button>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowNew(true)}><IcPlus /> Add Key</button>
      </div>

      {view === 'list' && (
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Bits</th>
              <th>Fingerprint</th>
              <th>Created</th>
              <th>Last Used</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(k => (
              <tr key={k.id}>
                <td style={{ fontWeight:600 }}>{k.name}</td>
                <td><span className={`${styles.badge} ${styles.badgeBlue}`}>{k.type}</span></td>
                <td style={{ fontSize:11, color:'var(--color-text-muted)' }}>{k.bits}</td>
                <td><code style={{ fontSize:10, color:'var(--color-text-muted)' }}>{k.fingerprint}</code></td>
                <td style={{ fontSize:11, color:'var(--color-text-dim)' }}>{k.created}</td>
                <td style={{ fontSize:11, color:'var(--color-text-muted)' }}>{k.lastUsed}</td>
                <td>
                  <div className={styles.rowActions}>
                    <button className={styles.actBtn}>Use</button>
                    <button className={styles.actBtn}><IcCopy /> Copy Public</button>
                    <button className={styles.actBtn}><IcEdit /></button>
                    <button className={`${styles.actBtn} ${styles.danger}`}><IcTrash /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {view === 'grid' && (
        <div className={styles.gridView}>
          {sorted.map(k => (
            <div key={k.id} className={styles.gridCard}>
              <div className={styles.gridCardTop}>
                <div>
                  <div className={styles.gridCardTitle}>{k.name}</div>
                  <div className={styles.gridCardSub}>{k.type} {k.bits}-bit</div>
                </div>
                <span className={`${styles.badge} ${styles.badgeBlue}`}>{k.type}</span>
              </div>
              <code style={{ fontSize:10, color:'var(--color-text-dim)', background:'var(--color-surface-overlay)', padding:'4px 7px', borderRadius:5 }}>{k.fingerprint}</code>
              <div className={styles.gridCardMeta}>
                <span className={styles.chip}>Created: {k.created}</span>
                <span className={styles.chip}>Used: {k.lastUsed}</span>
              </div>
              <div className={styles.gridCardActions}>
                <button className={styles.btn} style={{fontSize:10}}>Use</button>
                <button className={styles.btn} style={{fontSize:10}}><IcCopy /></button>
                <button className={styles.btn} style={{fontSize:10}}><IcEdit /></button>
                <button className={styles.btnDanger} style={{fontSize:10,padding:'3px 8px'}}><IcTrash /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && <NewKeyModal onClose={() => setShowNew(false)} />}
    </div>
  )
}

// ── Command Snippets Tab ─────────────────────────────────────────────────────
function SnippetsTab() {
  const [view, setView] = useState<'grid'|'list'>('list')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [modal, setModal] = useState(false)
  const [editSnippet, setEditSnippet] = useState<CommandSnippet|undefined>()
  const [sortBy, setSortBy] = useState('name')

  const { data: snippetsRaw = [] } = useQuery({ queryKey: ['ssh-snippets'], queryFn: () => fetchSSHSnippets() })
  const snippetsData: CommandSnippet[] = snippetsRaw.map(apiSnippetToUi)

  const filtered = snippetsData
    .filter(s => (category==='All' || s.category===category) &&
      (!search || s.name.toLowerCase().includes(search.toLowerCase()) || s.command.toLowerCase().includes(search.toLowerCase())))
    .sort((a,b) => sortBy==='name' ? a.name.localeCompare(b.name) : sortBy==='category' ? a.category.localeCompare(b.category) : 0)

  const grouped = SNIPPET_CATEGORIES.slice(1)
    .map(cat => ({ cat, items: filtered.filter(s => s.category === cat) }))
    .filter(g => g.items.length > 0)

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span className={styles.panelTitle}>Command Snippets</span>
        <span className={styles.muted}>{snippetsData.length} snippets</span>
        <div style={{ flex:1 }} />
        <div className={styles.searchWrap}>
          <IcSearch />
          <input className={styles.searchInput} placeholder="Search snippets..." value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <select className={styles.sortSelect} value={category} onChange={e=>setCategory(e.target.value)}>
          {SNIPPET_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className={styles.sortSelect} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
          <option value="name">Sort by name</option>
          <option value="category">Sort by category</option>
        </select>
        <div className={styles.viewToggle}>
          <button className={`${styles.viewBtn} ${view==='list' ? styles.viewActive : ''}`} onClick={()=>setView('list')}><IcList /></button>
          <button className={`${styles.viewBtn} ${view==='grid' ? styles.viewActive : ''}`} onClick={()=>setView('grid')}><IcGrid /></button>
        </div>
        <button className={styles.btnPrimary} onClick={() => { setEditSnippet(undefined); setModal(true) }}><IcPlus /> New Snippet</button>
      </div>

      {view === 'list' && (
        <div className={styles.snippetList}>
          {grouped.map(g => (
            <div key={g.cat}>
              <div className={styles.snippetCategory}>{g.cat}</div>
              {g.items.map(s => (
                <div key={s.id} className={styles.snippetRow}>
                  <IcSnippets />
                  <span className={styles.snippetName}>{s.name}</span>
                  <code className={styles.snippetCmd}>{s.command}</code>
                  <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                    <button className={styles.actBtn} style={{fontSize:10}}>Run</button>
                    <button className={styles.actBtn} style={{fontSize:10}}><IcCopy /></button>
                    <button className={styles.actBtn} style={{fontSize:10}} onClick={() => { setEditSnippet(s); setModal(true) }}><IcEdit /></button>
                    <button className={`${styles.actBtn} ${styles.danger}`} style={{fontSize:10}}><IcTrash /></button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {view === 'grid' && (
        <div className={styles.snippetGridView}>
          {filtered.map(s => (
            <div key={s.id} className={styles.snippetCard}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <span className={styles.snippetCardName}>{s.name}</span>
                <span className={`${styles.badge} ${styles.badgeGray}`}>{s.category}</span>
              </div>
              <div className={styles.snippetCardDesc}>{s.description}</div>
              <div className={styles.snippetCardCmd}>{s.command}</div>
              <div className={styles.snippetCardActions}>
                <button className={styles.btnPrimary} style={{fontSize:10}}>Run</button>
                <button className={styles.btn} style={{fontSize:10}}><IcCopy /></button>
                <button className={styles.btn} style={{fontSize:10}} onClick={() => { setEditSnippet(s); setModal(true) }}><IcEdit /></button>
                <button className={styles.btnDanger} style={{fontSize:10,padding:'3px 8px'}}><IcTrash /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <SnippetModal snippet={editSnippet} onClose={() => setModal(false)} />}
    </div>
  )
}

// ── Port Forwards Tab ────────────────────────────────────────────────────────
function PortForwardsTab() {
  const [showModal, setShowModal] = useState(false)
  const { data: pfRaw = [] } = useQuery({ queryKey: ['ssh-port-forwards'], queryFn: fetchSSHPortForwards })
  const portForwards: PortForward[] = pfRaw.map(apiPortForwardToUi)

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span className={styles.panelTitle}>Port Forwards</span>
        <span className={styles.muted}>{portForwards.length} rules</span>
        <div style={{ flex:1 }} />
        <button className={styles.btnPrimary} onClick={() => setShowModal(true)}><IcPlus /> Add Forward</button>
      </div>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th>Type</th>
            <th>Local Port</th>
            <th>Remote Host</th>
            <th>Remote Port</th>
            <th>Session</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {portForwards.map(pf => (
            <tr key={pf.id}>
              <td>
                <span className={`${styles.badge} ${pf.type==='local' ? styles.badgeBlue : pf.type==='remote' ? styles.badgeYellow : styles.badgeGray}`}>
                  -{pf.type === 'local' ? 'L' : pf.type === 'remote' ? 'R' : 'D'} {pf.type}
                </span>
              </td>
              <td style={{ fontFamily:'monospace', fontSize:12 }}>{pf.localPort}</td>
              <td style={{ fontFamily:'monospace', fontSize:11 }}>{pf.remoteHost}</td>
              <td style={{ fontFamily:'monospace', fontSize:12 }}>{pf.remotePort || '—'}</td>
              <td style={{ fontSize:11, color:'var(--color-text-muted)' }}>{pf.session}</td>
              <td>
                {pf.status === 'active'
                  ? <span className={`${styles.badge} ${styles.badgeGreen}`}>Active</span>
                  : <span className={`${styles.badge} ${styles.badgeGray}`}>Inactive</span>}
              </td>
              <td>
                <div className={styles.rowActions}>
                  {pf.status === 'inactive' && <button className={styles.actBtn} style={{color:'var(--color-success)'}}>Start</button>}
                  {pf.status === 'active'   && <button className={styles.actBtn} style={{color:'var(--color-warning)'}}>Stop</button>}
                  <button className={`${styles.actBtn} ${styles.danger}`}><IcTrash /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {showModal && <PortForwardModal onClose={() => setShowModal(false)} />}
    </div>
  )
}

// ── SFTP File Transfer Tab ───────────────────────────────────────────────────
function SftpTab() {
  const [selectedLocal, setSelectedLocal] = useState<string|null>(null)
  const [selectedRemote, setSelectedRemote] = useState<string|null>(null)
  const [localPath, setLocalPath] = useState('/home/user/')
  const [remotePath, setRemotePath] = useState('/root/')

  const { data: localData } = useQuery({ queryKey: ['fs-list', localPath], queryFn: () => fetchFSList(localPath) })
  const LOCAL_FILES = [
    { name: '..', type: 'dir', size: '—', date: '' },
    ...(localData?.files ?? []).map(f => ({
      name: f.name,
      type: f.is_dir ? 'dir' : 'file',
      size: f.is_dir ? '—' : f.size < 1024 ? `${f.size} B` : f.size < 1048576 ? `${(f.size/1024).toFixed(1)} KB` : `${(f.size/1048576).toFixed(1)} MB`,
      date: new Date(f.mod_time * 1000).toLocaleDateString('en-US', { month:'short', day:'numeric' }),
    })),
  ]
  const { data: remoteData } = useQuery({ queryKey: ['fs-list', remotePath], queryFn: () => fetchFSList(remotePath) })
  const REMOTE_FILES = [
    { name: '..', type: 'dir', size: '—', date: '' },
    ...(remoteData?.files ?? []).map(f => ({
      name: f.name,
      type: f.is_dir ? 'dir' : 'file',
      size: f.is_dir ? '—' : f.size < 1024 ? `${f.size} B` : f.size < 1048576 ? `${(f.size/1024).toFixed(1)} KB` : `${(f.size/1048576).toFixed(1)} MB`,
      date: new Date(f.mod_time * 1000).toLocaleDateString('en-US', { month:'short', day:'numeric' }),
    })),
  ]

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span className={styles.panelTitle}>SFTP File Transfer</span>
        <div style={{ flex:1 }} />
        <button className={styles.btn}><IcUpload /> Upload</button>
        <button className={styles.btn}><IcDownload /> Download</button>
        <button className={styles.btn}>Sync</button>
      </div>

      <div className={styles.sftpLayout}>
        {/* Local pane */}
        <div className={styles.sftpPane}>
          <div className={styles.sftpPaneHeader}>
            <IcFolder />
            <span>Local</span>
            <input className={styles.sftpPath} value={localPath} onChange={e=>setLocalPath(e.target.value)} />
          </div>
          <div className={styles.sftpFileList}>
            {LOCAL_FILES.map(f => (
              <div
                key={f.name}
                className={`${styles.sftpRow} ${selectedLocal===f.name ? styles.sftpRowSelected : ''}`}
                onClick={() => setSelectedLocal(f.name)}
              >
                <span style={{ color: f.type==='dir' ? '#4a9eff' : 'var(--color-text-dim)', fontSize:12 }}>{f.type==='dir' ? '/' : '~'}</span>
                <span className={styles.sftpName}>{f.name}</span>
                <span className={styles.sftpSize}>{f.size}</span>
                <span className={styles.sftpDate}>{f.date}</span>
              </div>
            ))}
          </div>
          <div className={styles.sftpPaneActions}>
            <button className={styles.btn} style={{fontSize:10}}><IcRefresh /></button>
            <button className={styles.btn} style={{fontSize:10}}><IcUpload /></button>
            <button className={styles.btn} style={{fontSize:10}}><IcDownload /></button>
            <button className={styles.btn} style={{fontSize:10}}><IcPlus /> Dir</button>
            <button className={`${styles.btnIconOnly}`} style={{padding:'3px 6px'}}><IcTrash /></button>
            <button className={`${styles.btnIconOnly}`} style={{padding:'3px 6px'}}><IcEdit /></button>
          </div>
        </div>

        {/* Remote pane */}
        <div className={styles.sftpPane}>
          <div className={styles.sftpPaneHeader}>
            <IcFolder />
            <span>Remote: web-01.prod</span>
            <input className={styles.sftpPath} value={remotePath} onChange={e=>setRemotePath(e.target.value)} />
          </div>
          <div className={styles.sftpFileList}>
            {REMOTE_FILES.map(f => (
              <div
                key={f.name}
                className={`${styles.sftpRow} ${selectedRemote===f.name ? styles.sftpRowSelected : ''}`}
                onClick={() => setSelectedRemote(f.name)}
              >
                <span style={{ color: f.type==='dir' ? '#4a9eff' : 'var(--color-text-dim)', fontSize:12 }}>{f.type==='dir' ? '/' : '~'}</span>
                <span className={styles.sftpName}>{f.name}</span>
                <span className={styles.sftpSize}>{f.size}</span>
                <span className={styles.sftpDate}>{f.date}</span>
              </div>
            ))}
          </div>
          <div className={styles.sftpPaneActions}>
            <button className={styles.btn} style={{fontSize:10}}><IcRefresh /></button>
            <button className={styles.btn} style={{fontSize:10}}><IcUpload /></button>
            <button className={styles.btn} style={{fontSize:10}}><IcDownload /></button>
            <button className={styles.btn} style={{fontSize:10}}><IcPlus /> Dir</button>
            <button className={`${styles.btnIconOnly}`} style={{padding:'3px 6px'}}><IcTrash /></button>
            <button className={`${styles.btnIconOnly}`} style={{padding:'3px 6px'}}><IcEdit /></button>
          </div>
        </div>
      </div>

      {/* Active transfers */}
      <div className={styles.transferProgress}>
        <div style={{ fontSize:11, fontWeight:600, color:'var(--color-text-muted)', marginBottom:2 }}>Active Transfers</div>
        {([] as {id:string;filename:string;direction:'upload'|'download';size:string;speed:string;status:string;transferred:number}[]).map(t => (
          <div key={t.id}>
            <div className={styles.progressRow}>
              <span style={{ color: t.direction==='upload' ? '#4a9eff' : 'var(--color-success)', fontSize:11 }}>
                {t.direction === 'upload' ? '↑' : '↓'}
              </span>
              <span className={styles.progressLabel}>{t.filename}</span>
              <span className={styles.progressMeta}>{t.speed}</span>
              <span className={styles.progressMeta}>{t.size}</span>
              <span className={`${styles.badge} ${t.status==='active' ? styles.badgeBlue : t.status==='done' ? styles.badgeGreen : t.status==='queued' ? styles.badgeGray : styles.badgeRed}`}>{t.status}</span>
            </div>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width:`${t.transferred}%`, background: t.status==='error' ? 'var(--color-danger)' : t.status==='done' ? 'var(--color-success)' : 'var(--color-accent)' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Session Recordings Tab ───────────────────────────────────────────────────
function RecordingsTab() {
  const [playing, setPlaying] = useState<SessionRecording|null>(null)
  const [playPos, setPlayPos] = useState(50)
  const [isPlaying, setIsPlaying] = useState(false)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('started')

  const { data: recRaw = [] } = useQuery({ queryKey: ['ssh-recordings'], queryFn: fetchSSHRecordings })
  const recordings: SessionRecording[] = recRaw.map(apiRecordingToUi)

  const sorted = [...recordings]
    .filter(r => !search || r.server.toLowerCase().includes(search.toLowerCase()) || r.user.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => sortBy==='started' ? b.started.localeCompare(a.started) : sortBy==='duration' ? b.duration.localeCompare(a.duration) : sortBy==='size' ? b.size.localeCompare(a.size) : 0)

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span className={styles.panelTitle}>Session Recordings</span>
        <span className={styles.muted}>{recordings.length} recordings</span>
        <div style={{ flex:1 }} />
        <div className={styles.searchWrap} style={{minWidth:160}}>
          <IcSearch />
          <input className={styles.searchInput} placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <select className={styles.sortSelect} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
          <option value="started">Sort by date</option>
          <option value="duration">Sort by duration</option>
          <option value="size">Sort by size</option>
        </select>
        <button className={styles.btn}><IcRecord /> Start Recording</button>
      </div>

      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th>Server</th>
            <th>User</th>
            <th>Started</th>
            <th>Duration</th>
            <th>Commands</th>
            <th>Output Lines</th>
            <th>Size</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={r.id}>
              <td style={{ fontWeight:600 }}>{r.server}</td>
              <td style={{ fontFamily:'monospace', fontSize:11 }}>{r.user}</td>
              <td style={{ fontSize:11, color:'var(--color-text-muted)' }}>{r.started}</td>
              <td style={{ fontSize:11 }}>{r.duration}</td>
              <td style={{ fontSize:12 }}>{r.commands}</td>
              <td style={{ fontSize:12 }}>{r.outputLines}</td>
              <td style={{ fontSize:11, color:'var(--color-text-muted)' }}>{r.size}</td>
              <td>
                <div className={styles.rowActions}>
                  <button className={styles.actBtn} onClick={() => { setPlaying(r); setPlayPos(0); setIsPlaying(false) }}>
                    <IcPlay /> Play
                  </button>
                  <button className={styles.actBtn}><IcDownload /></button>
                  <button className={`${styles.actBtn} ${styles.danger}`}><IcTrash /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {playing && (
        <div style={{ padding:12, borderTop:'1px solid var(--color-border)' }}>
          <div style={{ marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, fontWeight:600 }}>Playback: {playing.server} — {playing.started}</span>
            <span style={{ marginLeft:'auto', fontSize:11, color:'var(--color-text-muted)' }}>
              {playing.user} | {playing.commands} commands | {playing.duration}
            </span>
            <button className={styles.btnIconOnly} onClick={() => setPlaying(null)}><IcClose /></button>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <button className={styles.btn} style={{fontSize:10}} onClick={() => setPlayPos(0)}>|&lt;</button>
            <button className={styles.btn} style={{fontSize:10}} onClick={() => setIsPlaying(v=>!v)}>
              {isPlaying ? <IcPause /> : <IcPlay />}
            </button>
            <button className={styles.btn} style={{fontSize:10}} onClick={() => setIsPlaying(false)}><IcStop /></button>
            <input
              type="range" min={0} max={100} value={playPos}
              onChange={e => setPlayPos(Number(e.target.value))}
              className={styles.playbackSlider}
              style={{ flex:1 }}
            />
            <select className={styles.sortSelect} style={{width:60,fontSize:11}}>
              <option>1x</option><option>2x</option><option>0.5x</option>
            </select>
          </div>
          <div className={styles.recPlayback}>
{`10:15:00 | $ whoami
10:15:01 | root
10:15:05 | $ cd /etc/nginx
10:15:06 | $ ls -la
10:15:06 | total 72
10:15:06 | drwxr-xr-x 8 root root 4096 May  3 08:00 .
10:15:06 | -rw-r--r-- 1 root root 2345 Apr 20 08:00 nginx.conf
10:15:15 | $ sudo systemctl reload nginx
10:15:16 | [sudo] password for root:`}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Collaborative Tab ─────────────────────────────────────────────────────────
function CollabTab() {
  const qc = useQueryClient()
  const [showShare, setShowShare] = useState(false)
  const [activeSession, setActiveSession] = useState<CollabSession | null>(null)
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('write')
  const [inviting, setInviting] = useState(false)

  const { data: sessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: ['collab-sessions'],
    queryFn: fetchCollabSessions,
    refetchInterval: 10000,
  })

  const sessionId = activeSession?.id ?? sessions[0]?.id ?? null
  const { data: participants = [] } = useQuery({
    queryKey: ['collab-participants', sessionId],
    queryFn: () => fetchCollabParticipants(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 5000,
  })

  const currentSession = activeSession ?? sessions[0] ?? null

  async function createSession() {
    const s = await createCollabSession('New Session', 'admin').catch(() => null)
    if (s) { qc.invalidateQueries({ queryKey: ['collab-sessions'] }); setActiveSession(s) }
  }

  async function endSession(id: number) {
    await deleteCollabSession(id).catch(() => {})
    qc.invalidateQueries({ queryKey: ['collab-sessions'] })
    setActiveSession(null)
  }

  async function invite() {
    if (!sessionId || !inviteUsername.trim()) return
    setInviting(true)
    await addCollabParticipant(sessionId, { username: inviteUsername.trim(), email: inviteEmail.trim(), role: inviteRole }).catch(() => {})
    qc.invalidateQueries({ queryKey: ['collab-participants', sessionId] })
    setInviteUsername(''); setInviteEmail(''); setInviting(false); setShowShare(false)
  }

  async function kick(pid: number) {
    if (!sessionId) return
    await removeCollabParticipant(sessionId, pid).catch(() => {})
    qc.invalidateQueries({ queryKey: ['collab-participants', sessionId] })
  }

  async function toggleRole(pid: number, currentRole: string) {
    if (!sessionId) return
    const newRole = currentRole === 'write' ? 'read-only' : 'write'
    await updateCollabParticipant(sessionId, pid, newRole).catch(() => {})
    qc.invalidateQueries({ queryKey: ['collab-participants', sessionId] })
  }

  const AVATAR_COLORS = ['#4a9eff','#4caf50','#ff9800','#7c3aed','#ec4899','#06b6d4']

  if (loadingSessions) return <div style={{padding:32, color:'var(--color-text-muted)', textAlign:'center'}}>Loading sessions...</div>

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div className={styles.panel}>
        <div className={styles.toolbar}>
          <span className={styles.panelTitle}>
            {currentSession ? `Collaborative Session — ${currentSession.name}` : 'No Active Session'}
          </span>
          {currentSession && <span className={`${styles.badge} ${styles.badgeGreen}`}>Live</span>}
          <div style={{ flex:1 }} />
          {!currentSession
            ? <button className={styles.btnPrimary} onClick={createSession}>Start Session</button>
            : <>
                <button className={styles.btnPrimary} onClick={() => setShowShare(true)}><IcUsers /> Invite</button>
                <button className={styles.btn} onClick={() => endSession(currentSession.id)}>End Session</button>
              </>
          }
          {sessions.length > 1 && (
            <select style={{fontSize:12,padding:'2px 6px',borderRadius:6,border:'1px solid var(--color-border)',background:'var(--color-surface)',color:'var(--color-text)'}}
              value={currentSession?.id ?? ''}
              onChange={e => setActiveSession(sessions.find(s => s.id === Number(e.target.value)) ?? null)}>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>

        {currentSession && (
          <div className={styles.collabParticipants}>
            {participants.length === 0
              ? <div style={{padding:'12px 16px',fontSize:12,color:'var(--color-text-muted)'}}>No participants yet. Invite someone to collaborate.</div>
              : participants.map((p, idx) => (
                <div key={p.id} className={styles.participantRow}>
                  <div className={styles.participantAvatar} style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}>
                    {p.username.slice(0,1).toUpperCase()}
                  </div>
                  <div>
                    <div className={styles.participantName}>{p.username}</div>
                    <div style={{ fontSize:10, color:'var(--color-text-dim)' }}>{p.email}</div>
                  </div>
                  <span className={`${styles.badge} ${p.role==='owner' ? styles.badgeBlue : p.role==='write' ? styles.badgeGreen : styles.badgeGray}`}>
                    {p.role}
                  </span>
                  {p.role !== 'owner' && (
                    <div style={{ display:'flex', gap:4, marginLeft:'auto' }}>
                      <button className={styles.btn} style={{fontSize:10}} onClick={() => toggleRole(p.id, p.role)}>
                        {p.role==='write' ? 'Make Read-Only' : 'Give Write Access'}
                      </button>
                      <button className={`${styles.actBtn} ${styles.danger}`} style={{fontSize:10}} onClick={() => kick(p.id)}>Kick</button>
                    </div>
                  )}
                </div>
              ))
            }
          </div>
        )}
      </div>

      {currentSession && (
        <div className={styles.terminalCard}>
          <div className={styles.terminalHeader}>
            <IcUsers />
            <span className={styles.terminalTitle}>Shared Terminal — {currentSession.name}</span>
            <div style={{ flex:1 }} />
            <span className={`${styles.badge} ${styles.badgeGreen}`}>{participants.length} watching</span>
          </div>
          <div className={styles.terminalBody} style={{ minHeight:200, padding:16, fontSize:12, fontFamily:'monospace', color:'var(--color-text-muted)' }}>
            Connect to this session via the web terminal tab to begin collaborating.
            <span className={styles.terminalCursor} />
          </div>
        </div>
      )}

      {showShare && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}
          onMouseDown={e => { if (e.target === e.currentTarget) setShowShare(false) }}>
          <div style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:10,padding:24,width:380,display:'flex',flexDirection:'column',gap:12}}>
            <div style={{fontWeight:600,fontSize:14}}>Invite Participant</div>
            <input className={styles.formInput} placeholder="Username *" value={inviteUsername} onChange={e => setInviteUsername(e.target.value)} />
            <input className={styles.formInput} placeholder="Email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
            <select className={styles.formSelect} value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
              <option value="write">Write</option>
              <option value="read-only">Read-Only</option>
            </select>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className={styles.btn} onClick={() => setShowShare(false)}>Cancel</button>
              <button className={styles.btnPrimary} onClick={invite} disabled={inviting || !inviteUsername.trim()}>
                {inviting ? 'Inviting...' : 'Invite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Terminal Settings Tab ─────────────────────────────────────────────────────
function SettingsTab() {
  return (
    <div className={styles.settingsGrid}>
      <div className={styles.settingsCard}>
        <div className={styles.settingsCardTitle}>Terminal Appearance</div>
        {[
          ['Font Family', 'JetBrains Mono'],
          ['Font Size', '13px'],
          ['Line Height', '1.6'],
          ['Cursor Style', 'Block'],
        ].map(([label, val]) => (
          <div key={label} className={styles.settingsRow}>
            <span className={styles.settingsLabel}>{label}</span>
            <input className={styles.formInput} defaultValue={val} style={{ width:140 }} />
          </div>
        ))}
        <div className={styles.settingsRow}>
          <span className={styles.settingsLabel}>Theme</span>
          <select className={styles.formSelect} style={{ width:140 }}>
            {TERMINAL_THEMES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className={styles.settingsRow}>
          <span className={styles.settingsLabel}>Scrollback (lines)</span>
          <input className={styles.formInput} defaultValue={10000} type="number" style={{ width:140 }} />
        </div>
      </div>

      <div className={styles.settingsCard}>
        <div className={styles.settingsCardTitle}>Connection Defaults</div>
        {[
          ['Default Port', '22'],
          ['Connect Timeout (s)', '10'],
          ['Server Alive Interval (s)', '60'],
          ['Server Alive Max Count', '3'],
        ].map(([label, val]) => (
          <div key={label} className={styles.settingsRow}>
            <span className={styles.settingsLabel}>{label}</span>
            <input className={styles.formInput} defaultValue={val} style={{ width:80 }} />
          </div>
        ))}
      </div>

      <div className={styles.settingsCard}>
        <div className={styles.settingsCardTitle}>Behaviour</div>
        {[
          ['Audible bell', true],
          ['Visual bell', false],
          ['Smooth scrolling', true],
          ['Blink cursor', false],
          ['Auto-reconnect on disconnect', true],
          ['Record sessions by default', false],
          ['Ctrl+C copies in terminal', true],
        ].map(([label, val]) => (
          <div key={String(label)} className={styles.settingsRow}>
            <span className={styles.settingsLabel}>{label}</span>
            <label className={styles.toggle}><input type="checkbox" defaultChecked={Boolean(val)} /><span className={styles.toggleSlider} /></label>
          </div>
        ))}
      </div>

      <div className={styles.settingsCard}>
        <div className={styles.settingsCardTitle}>Security &amp; Audit</div>
        {[
          ['Log all sessions', true],
          ['Log keystrokes', false],
          ['Enforce key-only auth', false],
          ['Session timeout (min)', '30'],
          ['Max concurrent sessions', '10'],
        ].map(([label, val]) => (
          <div key={String(label)} className={styles.settingsRow}>
            <span className={styles.settingsLabel}>{label}</span>
            {typeof val === 'boolean'
              ? <label className={styles.toggle}><input type="checkbox" defaultChecked={val} /><span className={styles.toggleSlider} /></label>
              : <input className={styles.formInput} defaultValue={val} style={{ width:80 }} />
            }
          </div>
        ))}
        <button className={styles.btnPrimary} style={{ marginTop:4 }}>Save Settings</button>
      </div>
    </div>
  )
}

// ── Page root ─────────────────────────────────────────────────────────────────
export default function SshPage() {
  const [mainTab, setMainTab] = useState(0)
  const [sessionsView, setSessionsView]   = useState<'grid'|'list'>('list')
  const [sessionsSort, setSessionsSort]   = useState('manual')
  const [sessionsSearch, setSessionsSearch] = useState('')
  const [showNewConn, setShowNewConn]     = useState(false)
  const [activeSessId, setActiveSessId]   = useState('')
  const { data: sessionsRaw = [] } = useQuery({ queryKey: ['ssh-sessions'], queryFn: fetchSSHSessions })
  const sessions: SshSession[] = sessionsRaw.map(apiSessionToUi)

  const MAIN_TABS = ['Sessions', 'Terminal', 'Saved', 'SSH Keys', 'SFTP', 'Snippets', 'Port Forwards', 'Recordings', 'Collab', 'Settings']

  const activeSessions = sessions.filter(s => s.status !== 'dead')
  const deadSessions   = sessions.filter(s => s.status === 'dead')
  const { data: savedStat = [] } = useQuery({ queryKey: ['ssh-saved'], queryFn: fetchSSHSaved })
  const { data: keysStat = [] } = useQuery({ queryKey: ['ssh-keys'], queryFn: fetchSSHKeys })
  const { data: pfStat = [] } = useQuery({ queryKey: ['ssh-port-forwards'], queryFn: fetchSSHPortForwards })
  const { data: recStat = [] } = useQuery({ queryKey: ['ssh-recordings'], queryFn: fetchSSHRecordings })

  return (
    <div className={styles.page}>
      {/* ── Stats row ── */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Active Sessions</div>
          <div className={styles.statValue} style={{ color:'var(--color-success)' }}>{activeSessions.length}</div>
          <div className={styles.statSub}>{deadSessions.length} dead</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Saved Connections</div>
          <div className={styles.statValue}>{savedStat.length}</div>
          <div className={styles.statSub}>&nbsp;</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>SSH Keys</div>
          <div className={styles.statValue}>{keysStat.length}</div>
          <div className={styles.statSub}>&nbsp;</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Port Forwards</div>
          <div className={styles.statValue}>{pfStat.filter((p: {status:string}) => p.status==='active').length}</div>
          <div className={styles.statSub}>of {pfStat.length} total</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Recordings</div>
          <div className={styles.statValue}>{recStat.length}</div>
          <div className={styles.statSub}>&nbsp;</div>
        </div>
      </div>

      {/* ── Main tab bar ── */}
      <div className={styles.tabBar}>
        {MAIN_TABS.map((t, i) => (
          <button key={t} className={`${styles.tab} ${mainTab===i ? styles.activeTab : ''}`} onClick={() => setMainTab(i)}>{t}</button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {mainTab === 0 && (
        <ActiveSessionsPanel
          sessions={sessions}
          view={sessionsView}
          setView={setSessionsView}
          sortBy={sessionsSort}
          setSortBy={setSessionsSort}
          search={sessionsSearch}
          setSearch={setSessionsSearch}
          onAttach={s => { setActiveSessId(s.id); setMainTab(1) }}
          onNewConn={() => setShowNewConn(true)}
        />
      )}

      {mainTab === 1 && (
        <TerminalPanel
          sessions={sessions}
          activeId={activeSessId}
          setActiveId={setActiveSessId}
        />
      )}

      {mainTab === 2 && <SavedConnectionsTab onConnect={() => setShowNewConn(true)} />}
      {mainTab === 3 && <SshKeysTab />}
      {mainTab === 4 && <SftpTab />}
      {mainTab === 5 && <SnippetsTab />}
      {mainTab === 6 && <PortForwardsTab />}
      {mainTab === 7 && <RecordingsTab />}
      {mainTab === 8 && <CollabTab />}
      {mainTab === 9 && <SettingsTab />}

      {showNewConn && <NewConnectionModal onClose={() => setShowNewConn(false)} />}
    </div>
  )
}
