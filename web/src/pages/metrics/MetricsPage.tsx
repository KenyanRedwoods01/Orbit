import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatBytes, formatBps } from '@/lib/utils'
import { useMetricsStream } from './useMetricsStream'
import { useServerInfo, type ServerInfo } from '@/lib/useServerInfo'
import {
  fetchMetricsSummary, type MetricsSummary,
  fetchAlertEvents, type AlertEvent,
  fetchAuditLog, type AuditEntry,
  fetchContainers, type Container,
  fetchSecurityAudit, type SecurityAudit,
  fetchSecurityStats, type SecurityStats,
  fetchManagedServers, type ManagedServer,
  fetchServices, type Service,
} from '@/lib/api'
import { CPUChart } from './CPUChart'
import { MemoryChart } from './MemoryChart'
import { NetworkChart } from './NetworkChart'
import { DiskTable } from './DiskTable'
import { ProcessTable } from './ProcessTable'
import {
  type DashServer, type DashAlert, type TimelineEvent,
  type ContainerStat, type SecurityCheck,
} from './dashData'
import styles from './MetricsPage.module.css'

// ── Icons ────────────────────────────────────────────────────────────────────
function IcServer()   { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="2" width="14" height="5" rx="1.2"/><rect x="1" y="9" width="14" height="5" rx="1.2"/><circle cx="4" cy="4.5" r="0.8" fill="currentColor" stroke="none"/><circle cx="4" cy="11.5" r="0.8" fill="currentColor" stroke="none"/></svg> }
function IcShield()   { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2L2 5v4c0 3.31 2.69 5.41 6 6 3.31-.59 6-2.69 6-6V5L8 2z"/></svg> }
function IcCpu()      { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="8" height="8" rx="1"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="6" y1="12" x2="6" y2="15"/><line x1="10" y1="12" x2="10" y2="15"/><line x1="1" y1="6" x2="4" y2="6"/><line x1="1" y1="10" x2="4" y2="10"/><line x1="12" y1="6" x2="15" y2="6"/><line x1="12" y1="10" x2="15" y2="10"/></svg> }
function IcServices() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg> }
function IcAlert()    { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2L1 13h14L8 2z"/><line x1="8" y1="7" x2="8" y2="10"/><circle cx="8" cy="12" r="0.8" fill="currentColor" stroke="none"/></svg> }
function IcGrid()     { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg> }
function IcList()     { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="1" y1="4" x2="15" y2="4"/><line x1="1" y1="8" x2="15" y2="8"/><line x1="1" y1="12" x2="15" y2="12"/></svg> }
function IcSearch()   { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="6.5" cy="6.5" r="4.5"/><line x1="10" y1="10" x2="14" y2="14"/></svg> }
function IcDrag()     { return <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" opacity="0.35"><circle cx="4" cy="2.5" r="1"/><circle cx="8" cy="2.5" r="1"/><circle cx="4" cy="6" r="1"/><circle cx="8" cy="6" r="1"/><circle cx="4" cy="9.5" r="1"/><circle cx="8" cy="9.5" r="1"/></svg> }
function IcClose()    { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg> }
function IcPlus()     { return <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="7" y1="1" x2="7" y2="13"/><line x1="1" y1="7" x2="13" y2="7"/></svg> }
function IcTerminal() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="2" width="14" height="12" rx="2"/><polyline points="4,6 7,9 4,12"/><line x1="9" y1="12" x2="13" y2="12"/></svg> }
function IcRefresh()  { return <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 7A5 5 0 1 1 7 2a5 5 0 0 1 3.5 1.4L12 5"/><path d="M12 1v4H8"/></svg> }
function IcCheck()    { return <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,7 6,11 12,3"/></svg> }
function IcWarn()     { return <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 2L1 12h12L7 2z"/><line x1="7" y1="6" x2="7" y2="9"/></svg> }
function IcFail()     { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg> }
function IcDeploy()   { return <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 2l2.5 4.5H4.5L7 2z" fill="currentColor" stroke="none" opacity="0.7"/><path d="M2 13h10M7 7v6"/></svg> }
function IcLock()     { return <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="10" height="7" rx="1.5"/><path d="M4 6V4a3 3 0 0 1 6 0v2"/></svg> }
function IcSave()     { return <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12H2V2h8l2 2v8z"/><path d="M4 2v4h6V2"/><rect x="4" y="8" width="6" height="4"/></svg> }
function IcDocker()   { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="7" width="3" height="3" rx="0.5"/><rect x="5" y="7" width="3" height="3" rx="0.5"/><rect x="5" y="3" width="3" height="3" rx="0.5"/><rect x="9" y="7" width="3" height="3" rx="0.5"/><rect x="9" y="3" width="3" height="3" rx="0.5"/><path d="M14 9s0.5-1 0-2c-0.5-1-2-1-2-1H1s0 3 3 3"/></svg> }
function IcChevron()  { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,5 6,8 9,5"/></svg> }
function IcSort()     { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="1" y1="3" x2="11" y2="3"/><line x1="2" y1="6" x2="10" y2="6"/><line x1="3" y1="9" x2="9" y2="9"/></svg> }
function IcFilter()   { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polygon points="1,2 11,2 7,7 7,11 5,10 5,7"/></svg> }
function IcNetwork()  { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2l2 4H6l2-4z" fill="currentColor" stroke="none" opacity="0.7"/><path d="M8 14l-2-4h4l-2 4z" fill="currentColor" stroke="none" opacity="0.7"/><polyline points="2,6 8,9 14,6"/><polyline points="2,10 8,7 14,10"/></svg> }
function IcMemory()   { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="1" y="5" width="14" height="7" rx="1.5"/><line x1="5" y1="5" x2="5" y2="12"/><line x1="9" y1="5" x2="9" y2="12"/><line x1="13" y1="5" x2="13" y2="12"/><line x1="5" y1="2" x2="5" y2="5"/><line x1="9" y1="2" x2="9" y2="5"/><line x1="13" y1="2" x2="13" y2="5"/></svg> }
function IcDisk()     { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><ellipse cx="8" cy="6" rx="6" ry="2.5"/><path d="M2 6v5c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V6"/><path d="M2 8.5c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5"/></svg> }
function IcEye()      { return <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 7s2.5-4.5 6-4.5S13 7 13 7s-2.5 4.5-6 4.5S1 7 1 7z"/><circle cx="7" cy="7" r="1.8"/></svg> }
function IcActivity() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,11 5,7 8,9 11,5 14,7"/></svg> }

// ── Helpers ──────────────────────────────────────────────────────────────────
function pctColor(v: number) {
  if (v >= 90) return 'var(--color-danger)'
  if (v >= 70) return 'var(--color-warning)'
  return 'var(--color-success)'
}

function Bar({ value, color }: { value: number; color?: string }) {
  return (
    <div className={styles.miniBar}>
      <div className={styles.miniBarFill} style={{ width: `${value}%`, background: color ?? pctColor(value) }} />
    </div>
  )
}

function Sparkline({ data, color = 'var(--color-accent)' }: { data: number[]; color?: string }) {
  const w = 64, h = 22
  const max = Math.max(...data, 1)
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - (v / max) * h
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StatusDot({ status }: { status: 'online' | 'offline' | 'warning' }) {
  const c = status === 'online' ? 'var(--color-success)' : status === 'warning' ? 'var(--color-warning)' : 'var(--color-danger)'
  return <span className={styles.statusDot} style={{ background: c, boxShadow: `0 0 0 2px ${c}22` }} />
}

function SeverityBadge({ s }: { s: DashAlert['severity'] }) {
  const cls = s === 'critical' ? styles.badgeCrit : s === 'warning' ? styles.badgeWarn : styles.badgeInfo
  return <span className={`${styles.badge} ${cls}`}>{s}</span>
}

function timelineIcon(type: TimelineEvent['type']) {
  const icons: Record<string, JSX.Element> = {
    security: <IcShield />, deploy: <IcDeploy />, login: <IcLock />,
    restart: <IcRefresh />, update: <IcRefresh />, incident: <IcAlert />, scan: <IcSearch />
  }
  const colors: Record<string, string> = {
    security: 'var(--color-danger)', deploy: 'var(--color-accent)', login: 'var(--color-text-muted)',
    restart: 'var(--color-warning)', update: 'var(--color-accent)', incident: 'var(--color-danger)', scan: 'var(--color-warning)'
  }
  return <span style={{ color: colors[type] ?? 'var(--color-accent)' }}>{icons[type] ?? <IcActivity />}</span>
}

// ── Server Detail Modal ───────────────────────────────────────────────────────
function ServerModal({ server, onClose }: { server: DashServer; onClose: () => void }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalLg}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            <IcServer />
            <span>{server.name}</span>
            <StatusDot status={server.status} />
            <span className={styles.modalSub}>{server.ip}</span>
          </div>
          <button className={styles.modalClose} onClick={onClose}><IcClose /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.modalGrid3}>
            {[
              ['Location', server.location], ['Provider', server.provider],
              ['OS', server.os], ['Uptime', `${server.uptimeDays}d`],
              ['Services', String(server.services)], ['Security Issues', String(server.securityIssues)],
            ].map(([l, v]) => (
              <div key={l} className={styles.modalKV}>
                <div className={styles.modalKVLabel}>{l}</div>
                <div className={styles.modalKVValue}>{v}</div>
              </div>
            ))}
          </div>
          <div className={styles.modalSection}>Resource Usage</div>
          {[['CPU', server.cpu], ['RAM', server.ram], ['Disk', server.disk]].map(([l, v]) => (
            <div key={l} className={styles.modalMetricRow}>
              <span className={styles.modalMetricLabel}>{l}</span>
              <div className={styles.modalMetricBar}>
                <div className={styles.modalMetricFill} style={{ width: `${v}%`, background: pctColor(Number(v)) }} />
              </div>
              <span className={styles.modalMetricVal}>{v}%</span>
            </div>
          ))}
          <div className={styles.modalSection}>CPU Trend (20 samples)</div>
          <div style={{ padding: '4px 0 8px' }}>
            <Sparkline data={server.sparkCpu} color="var(--color-accent)" />
          </div>
          <div className={styles.modalTags}>
            {server.tags.map(t => <span key={t} className={styles.modalTag}>{t}</span>)}
          </div>
          <div className={styles.modalActions}>
            <button className={styles.btnPrimary}><IcTerminal /> Open SSH</button>
            <button className={styles.btnSecondary}><IcActivity /> View Metrics</button>
            <button className={styles.btnSecondary}><IcRefresh /> Restart Services</button>
            <button className={styles.btnDanger}><IcClose /> Power Off</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Add Server Modal ──────────────────────────────────────────────────────────
function AddServerModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState(0)
  const tabs = ['Manual', 'SSH Import', 'API']
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}><IcPlus /><span>Add Server</span></div>
          <button className={styles.modalClose} onClick={onClose}><IcClose /></button>
        </div>
        <div className={styles.tabBar}>
          {tabs.map((t, i) => (
            <button key={t} className={`${styles.tabBtn} ${tab === i ? styles.tabBtnActive : ''}`} onClick={() => setTab(i)}>{t}</button>
          ))}
        </div>
        <div className={styles.modalBody}>
          {tab === 0 && (
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Display Name</label>
                <input className={styles.input} placeholder="web-03" />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>IP Address / Hostname</label>
                <input className={styles.input} placeholder="192.168.1.100" />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>SSH Port</label>
                <input className={styles.input} placeholder="22" defaultValue="22" />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>SSH User</label>
                <input className={styles.input} placeholder="root" />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Auth Method</label>
                <select className={styles.select}>
                  <option>SSH Key</option>
                  <option>Password</option>
                  <option>Agent</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Provider</label>
                <select className={styles.select}>
                  <option>Hetzner</option><option>Vultr</option><option>AWS</option>
                  <option>DigitalOcean</option><option>Other</option>
                </select>
              </div>
              <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                <label className={styles.label}>Tags (comma separated)</label>
                <input className={styles.input} placeholder="web, prod, nginx" />
              </div>
            </div>
          )}
          {tab === 1 && (
            <div className={styles.formGroup}>
              <label className={styles.label}>SSH Config Entry (paste from ~/.ssh/config)</label>
              <textarea className={styles.textarea} rows={6} placeholder={"Host web-03\n  HostName 1.2.3.4\n  User root\n  IdentityFile ~/.ssh/id_rsa"} />
            </div>
          )}
          {tab === 2 && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Provider API Key</label>
              <input className={styles.input} placeholder="Enter your provider API key..." />
              <p className={styles.formHint}>Automatically import all servers from your cloud provider account.</p>
            </div>
          )}
          <div className={styles.modalActions}>
            <button className={styles.btnPrimary}><IcCheck /> Add Server</button>
            <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Alert Modal ───────────────────────────────────────────────────────────────
function AlertModal({ alert, onClose }: { alert: DashAlert; onClose: () => void }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}><IcAlert /><span>Alert Detail</span><SeverityBadge s={alert.severity} /></div>
          <button className={styles.modalClose} onClick={onClose}><IcClose /></button>
        </div>
        <div className={styles.modalBody}>
          {[['Server', alert.server], ['Category', alert.category], ['Time', alert.time], ['Status', alert.status]].map(([l, v]) => (
            <div key={l} className={styles.modalKV} style={{ marginBottom: 10 }}>
              <div className={styles.modalKVLabel}>{l}</div>
              <div className={styles.modalKVValue}>{v}</div>
            </div>
          ))}
          <div className={styles.modalSection}>Message</div>
          <div className={styles.alertMsg}>{alert.message}</div>
          <div className={styles.modalSection}>Suggested Actions</div>
          <ul className={styles.suggList}>
            {alert.category === 'Disk' && <>
              <li>Run <code>df -h</code> to identify large directories</li>
              <li>Clear old logs: <code>journalctl --vacuum-size=500M</code></li>
              <li>Consider expanding disk or archiving old data</li>
            </>}
            {alert.category === 'CPU' && <>
              <li>Check top processes: <code>top -b -n1 | head -20</code></li>
              <li>Inspect database slow queries</li>
              <li>Consider vertical scaling or load balancing</li>
            </>}
            {alert.category === 'Security' && <>
              <li>Review auth logs: <code>journalctl -u ssh --since "1h ago"</code></li>
              <li>Add offending IP to blocklist</li>
              <li>Enable Fail2Ban SSH jail if not active</li>
            </>}
            {!['Disk','CPU','Security'].includes(alert.category) && <>
              <li>Investigate logs on {alert.server}</li>
              <li>Check service status and recent config changes</li>
            </>}
          </ul>
          <div className={styles.modalActions}>
            <button className={styles.btnPrimary}><IcCheck /> Acknowledge</button>
            <button className={styles.btnSuccess}><IcCheck /> Resolve</button>
            <button className={styles.btnSecondary}>Mute 1h</button>
            <button className={styles.btnSecondary} onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Quick Terminal Widget ─────────────────────────────────────────────────────
function TerminalWidget({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState('')
  const [lines, setLines] = useState([
    'Connected to web-01 (10.0.1.10) as root',
    'Last login: Sat May 3 14:28:03 2026 from 10.0.0.1',
    'root@web-01:~#',
  ])
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && input.trim()) {
      setLines(l => [...l, `root@web-01:~# ${input}`, `bash: ${input}: command simulated`,'root@web-01:~#'])
      setInput('')
    }
  }
  return (
    <div className={styles.termWidget}>
      <div className={styles.termWidgetHeader}>
        <div className={styles.termWidgetTitle}>
          <IcTerminal /> Quick Terminal
          <span className={styles.termWidgetServer}>web-01</span>
          <span className={styles.termWidgetUser}>root</span>
        </div>
        <div className={styles.termWidgetControls}>
          <button className={styles.termBtn}>Connect</button>
          <button className={styles.iconBtn} onClick={onClose}><IcClose /></button>
        </div>
      </div>
      <div className={styles.termBody}>
        {lines.map((l, i) => <div key={i} className={styles.termLine}>{l}</div>)}
        <div className={styles.termInputRow}>
          <span className={styles.termPrompt}>root@web-01:~#</span>
          <input
            className={styles.termInput}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="type command..."
            autoFocus
          />
        </div>
      </div>
    </div>
  )
}

// ── Data mappers ─────────────────────────────────────────────────────────────

function mapServerEntry(s: ManagedServer, i: number): DashServer {
  const m = s.metrics
  const cpu = m?.cpu_pct ?? 0
  const ram = m?.mem_pct ?? 0
  const disk = m?.disk_pct ?? 0
  return {
    id: String(s.id) || s.name || s.host || String(i),
    name: s.name,
    status: s.status === 'connected' ? 'online' : 'offline',
    ip: s.host,
    location: '—',
    provider: '—',
    os: '—',
    cpu: Math.round(cpu),
    ram: Math.round(ram),
    disk: Math.round(disk),
    network: 'normal' as const,
    securityIssues: 0,
    uptimeDays: 0,
    services: 0,
    lastSeen: 'live',
    tags: [],
    sparkCpu: Array(20).fill(Math.round(cpu)) as number[],
    sparkRam: Array(20).fill(Math.round(ram)) as number[],
  }
}

function mapAlertEvent(e: AlertEvent): DashAlert {
  const excess = e.threshold > 0 ? e.value / e.threshold : 1
  const severity: DashAlert['severity'] = excess >= 2 ? 'critical' : excess >= 1.5 ? 'warning' : 'info'
  return {
    id: String(e.id),
    severity,
    server: 'localhost',
    message: `${e.rule_name}: ${e.metric} = ${e.value.toFixed(1)} (threshold ${e.threshold})`,
    time: new Date(e.ts * 1000).toLocaleString(),
    status: 'active' as const,
    category: e.metric,
  }
}

function mapAuditEntry(e: AuditEntry): TimelineEvent {
  let type: TimelineEvent['type'] = 'incident'
  const p = e.path.toLowerCase()
  if (p.includes('/auth/login')) type = 'login'
  else if (p.includes('/deploy')) type = 'deploy'
  else if (p.includes('/restart')) type = 'restart'
  else if (p.includes('/security')) type = 'security'
  else if (p.includes('/update') || p.includes('/upgrade')) type = 'update'
  else if (e.status >= 400) type = 'incident'
  return {
    id: String(e.id),
    time: new Date(e.ts * 1000).toLocaleTimeString(),
    type,
    server: 'localhost',
    details: `${e.method} ${e.path} → ${e.status}`,
    user: e.user || 'system',
    _rawTs: e.ts,
    _method: e.method,
    _path: e.path,
    _status: e.status,
    _ip: e.ip,
  }
}

// ── Timeline Detail Modal ─────────────────────────────────────────────────────
function TimelineDetailModal({ ev, onClose }: { ev: TimelineEvent; onClose: () => void }) {
  const statusColor = !ev._status ? 'var(--color-text-dim)'
    : ev._status >= 500 ? 'var(--color-danger)'
    : ev._status >= 400 ? '#f6ad55'
    : 'var(--color-success)'

  const typeColor: Record<string, string> = {
    security: 'var(--color-danger)', incident: 'var(--color-danger)',
    deploy: 'var(--color-accent)', login: 'var(--color-text-muted)',
    restart: 'var(--color-warning)', update: 'var(--color-accent)', scan: 'var(--color-warning)',
  }

  const fullTime = ev._rawTs
    ? new Date(ev._rawTs * 1000).toLocaleString()
    : ev.time

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle} style={{ gap: 8 }}>
            <span style={{ color: typeColor[ev.type] ?? 'var(--color-accent)' }}>{timelineIcon(ev.type)}</span>
            <span>Event Details</span>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, background: `${typeColor[ev.type] ?? 'var(--color-accent)'}22`, color: typeColor[ev.type] ?? 'var(--color-accent)', border: `1px solid ${typeColor[ev.type] ?? 'var(--color-accent)'}44`, padding: '2px 7px', borderRadius: 4 }}>{ev.type}</span>
          </div>
          <button className={styles.modalClose} onClick={onClose}><IcClose /></button>
        </div>
        <div className={styles.modalBody}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Timestamp', value: fullTime },
              { label: 'Server', value: ev.server },
              { label: 'User', value: ev.user || '—' },
              { label: 'IP Address', value: ev._ip || '—' },
            ].map(row => (
              <div key={row.label} style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, padding: '8px 12px' }}>
                <div style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{row.label}</div>
                <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text)' }}>{row.value}</div>
              </div>
            ))}
          </div>

          {(ev._method || ev._path) && (
            <div style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, padding: '10px 12px' }}>
              <div style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>HTTP Request</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {ev._method && <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', background: 'rgba(74,158,255,0.12)', color: 'var(--color-accent)', padding: '2px 8px', borderRadius: 4 }}>{ev._method}</span>}
                {ev._path && <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text)', flex: 1, wordBreak: 'break-all' }}>{ev._path}</span>}
                {ev._status !== undefined && (
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: statusColor, background: `${statusColor}18`, padding: '2px 8px', borderRadius: 4, border: `1px solid ${statusColor}33`, marginLeft: 'auto' }}>
                    {ev._status}
                  </span>
                )}
              </div>
            </div>
          )}

          <div style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, padding: '10px 12px' }}>
            <div style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Details</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text)', lineHeight: 1.5 }}>{ev.details}</div>
          </div>
        </div>
        <div className={styles.modalActions} style={{ padding: '10px 16px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className={styles.btnSecondary} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function mapContainer(c: Container): ContainerStat {
  return {
    id: c.id,
    name: c.name,
    image: c.image,
    status: c.state === 'running' ? 'running' : c.state === 'paused' ? 'stopped' : 'unhealthy' as ContainerStat['status'],
    cpu: c.cpu_pct,
    ram: Math.round(c.mem_bytes / (1024 * 1024)),
    uptime: '—',
  }
}

function mapSecurityAudit(audit: SecurityAudit): SecurityCheck[] {
  if (!audit.findings || audit.findings.length === 0) {
    return [{ label: 'Security Scan', status: 'ok', detail: `Score ${audit.score}/100 — No issues found` }]
  }
  return audit.findings.slice(0, 10).map(f => ({
    label: f.title,
    status: (f.severity === 'critical' || f.severity === 'high' ? 'fail' : f.severity === 'medium' ? 'warn' : 'ok') as SecurityCheck['status'],
    detail: f.description,
  }))
}

// ── Scan Modal ────────────────────────────────────────────────────────────────
function ScanModal({ onClose, servers }: { onClose: () => void; servers: DashServer[] }) {
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const start = () => { setRunning(true); setTimeout(() => { setRunning(false); setDone(true) }, 2000) }
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}><IcShield /><span>Security Scan</span></div>
          <button className={styles.modalClose} onClick={onClose}><IcClose /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Target Servers</label>
            <select className={styles.select}>
              <option>All Servers (10)</option>
              {servers.map(s => <option key={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Scan Type</label>
            <div className={styles.checkGroup}>
              {['CVE / Package Audit','Port Scan (nmap)','SSH Hardening Check','File Integrity (AIDE)','Rootkit Detection'].map(o => (
                <label key={o} className={styles.checkLabel}>
                  <input type="checkbox" defaultChecked className={styles.checkBox} /> {o}
                </label>
              ))}
            </div>
          </div>
          {done && <div className={styles.scanResult}>Scan complete — 3 issues found. View full report in Security page.</div>}
          <div className={styles.modalActions}>
            <button className={styles.btnPrimary} onClick={start} disabled={running}>
              {running ? 'Scanning…' : done ? 'Run Again' : 'Start Scan'}
            </button>
            <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── DateTime / Greeting helpers ───────────────────────────────────────────────
function pad2(n: number) { return String(n).padStart(2, '0') }
function fmtClock(d: Date) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}` }
function fmtDateLong(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}
function fmtDateShort(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}
function weekNumber(d: Date) {
  const jan1 = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
}
function dayPct(d: Date) { return ((d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400) * 100 }
function greeting(d: Date) {
  const h = d.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
function utcClock(d: Date) {
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`
}
function tzOffset(d: Date) {
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const h = Math.floor(Math.abs(off) / 60)
  const m = Math.abs(off) % 60
  return `UTC${sign}${pad2(h)}${m ? ':' + pad2(m) : ''}`
}

// ── Greeting Card ─────────────────────────────────────────────────────────────
function GreetingCard({ now, onlineCount, offlineCount, warnCount, critAlerts, secScore, secGrade, secGradeColor, lastLoginAgo, lastLoginIp, secStats }: {
  now: Date; onlineCount: number; offlineCount: number; warnCount: number; critAlerts: number
  secScore: number; secGrade: string; secGradeColor: string
  lastLoginAgo: string | null; lastLoginIp: string | null
  secStats: SecurityStats | undefined
}) {
  const circumference = 2 * Math.PI * 22
  const scored = secScore > 0
  const strokeDash = scored ? `${(secScore / 100) * circumference} ${circumference}` : `0 ${circumference}`
  const scoreColor = scored ? secGradeColor : 'var(--color-text-dim)'

  return (
    <div className={styles.greetCard}>
      <div className={styles.greetBg} aria-hidden />
      <div className={styles.greetContent}>
        <div className={styles.greetTop}>
          <div>
            <div className={styles.greetHello}>{greeting(now)}, Admin</div>
            <div className={styles.greetDate}>{fmtDateLong(now)}</div>
          </div>
          <div className={styles.greetScore}>
            <svg width="56" height="56" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(74,158,255,0.12)" strokeWidth="5"/>
              <circle cx="28" cy="28" r="22" fill="none" stroke={scoreColor} strokeWidth="5"
                strokeDasharray={strokeDash} strokeLinecap="round"
                transform="rotate(-90 28 28)"/>
              {scored
                ? <text x="28" y="32" textAnchor="middle" fill={scoreColor} fontSize="13" fontWeight="700">{secScore}</text>
                : <text x="28" y="32" textAnchor="middle" fill="var(--color-text-dim)" fontSize="9">—</text>
              }
            </svg>
            <div className={styles.greetScoreLabel} style={{ color: scoreColor }}>
              {scored ? `Grade ${secGrade}` : 'Security'}
            </div>
          </div>
        </div>

        <div className={styles.greetStats}>
          <div className={styles.greetStat}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--color-success)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="2" width="14" height="5" rx="1.2"/><rect x="1" y="9" width="14" height="5" rx="1.2"/></svg>
            <span><strong>{onlineCount}</strong> online</span>
          </div>
          {offlineCount > 0 && <div className={styles.greetStat}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--color-danger)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="2" width="14" height="5" rx="1.2"/><rect x="1" y="9" width="14" height="5" rx="1.2"/></svg>
            <span><strong>{offlineCount}</strong> offline</span>
          </div>}
          {warnCount > 0 && <div className={styles.greetStat}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--color-warning)" strokeWidth="1.7" strokeLinecap="round"><path d="M8 2L1 13h14L8 2z"/><line x1="8" y1="7" x2="8" y2="10"/></svg>
            <span><strong>{warnCount}</strong> warning</span>
          </div>}
          {critAlerts > 0 && <div className={styles.greetStat}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--color-danger)" strokeWidth="1.7" strokeLinecap="round"><path d="M8 2L1 13h14L8 2z"/><line x1="8" y1="7" x2="8" y2="10"/></svg>
            <span><strong>{critAlerts}</strong> critical alert{critAlerts > 1 ? 's' : ''}</span>
          </div>}
          {lastLoginAgo && (
            <div className={styles.greetStat}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="5.5"/><polyline points="7,4 7,7 9,9"/></svg>
              <span>Last login <strong>{lastLoginAgo}</strong>{lastLoginIp ? ` · ${lastLoginIp}` : ''}</span>
            </div>
          )}
          {secStats && secStats.blocked_attacks > 0 && (
            <div className={styles.greetStat}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2L2 5v4c0 3.31 2.69 5.41 6 6 3.31-.59 6-2.69 6-6V5L8 2z"/></svg>
              <span><strong>{secStats.blocked_attacks}</strong> attacks blocked</span>
            </div>
          )}
          {secStats && secStats.failed_logins > 0 && (
            <div className={styles.greetStat}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--color-warning)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>
              <span><strong>{secStats.failed_logins}</strong> failed logins</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── DateTime Card ─────────────────────────────────────────────────────────────
function DateTimeCard({ now }: { now: Date }) {
  const pct = dayPct(now)
  const wk = weekNumber(now)
  return (
    <div className={styles.dtCard}>
      <div className={styles.dtLabel}>Local Time</div>
      <div className={styles.dtClock}>{fmtClock(now)}</div>
      <div className={styles.dtDay}>{now.toLocaleDateString('en-US', { weekday: 'long' })}</div>
      <div className={styles.dtDate}>{now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
      <div className={styles.dtMeta}>
        <span>Week {wk}</span>
        <span>{tzOffset(now)}</span>
      </div>
      <div className={styles.dtProgressWrap}>
        <div className={styles.dtProgressBar}>
          <div className={styles.dtProgressFill} style={{ width: `${pct}%` }}/>
        </div>
        <div className={styles.dtProgressLabel}>
          <span>Day progress</span>
          <span>{pct.toFixed(1)}%</span>
        </div>
      </div>
      <div className={styles.dtSessionRow}>
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="5.5"/><polyline points="7,4 7,7 9,9"/></svg>
        Session started {fmtDateShort(new Date(now.getTime() - 7200000))}
      </div>
    </div>
  )
}

// ── Region & Timezone Card ────────────────────────────────────────────────────
function RegionCard({ now, serverInfo, summary }: { now: Date; serverInfo: ServerInfo; summary: MetricsSummary | undefined }) {
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone
  const serverTz = 'Europe/Helsinki'
  const serverTime = new Date(now.toLocaleString('en-US', { timeZone: serverTz }))
  const utcTime = utcClock(now)

  const isDST = (() => {
    const jan = new Date(now.getFullYear(), 0, 1).getTimezoneOffset()
    const jul = new Date(now.getFullYear(), 6, 1).getTimezoneOffset()
    return now.getTimezoneOffset() < Math.max(jan, jul)
  })()

  function zoneClock(tz: string) {
    return new Date(now.toLocaleString('en-US', { timeZone: tz }))
      .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  }

  const zones = [
    { label: 'UTC', value: utcTime },
    { label: 'Server', value: zoneClock(serverTz), accent: true },
    { label: 'Browser', value: fmtClock(now) },
    { label: 'New York', value: zoneClock('America/New_York') },
    { label: 'London', value: zoneClock('Europe/London') },
  ]

  const location = serverInfo.region || serverInfo.hostname || 'localhost'
  const provider = serverInfo.provider || serverInfo.os || '—'
  const uptime   = summary?.uptime_human || serverInfo.uptime || '—'
  const load     = summary
    ? `${summary.load_avg_1.toFixed(2)}  ${summary.load_avg_5.toFixed(2)}  ${summary.load_avg_15.toFixed(2)}`
    : serverInfo.load || '—'

  return (
    <div className={styles.regionCard}>
      <div className={styles.regionHeader}>
        <div>
          <div className={styles.regionLabel}>Server Region</div>
          <div className={styles.regionLocation}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2C5.8 2 4 3.8 4 6c0 3.5 4 8 4 8s4-4.5 4-8c0-2.2-1.8-4-4-4z"/><circle cx="8" cy="6" r="1.5"/></svg>
            {location}
          </div>
          <div className={styles.regionProvider}>{provider} · {serverTz}</div>
        </div>
        {isDST && <span className={styles.dstBadge}>DST</span>}
      </div>
      <div className={styles.regionOffset}>
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="5.5"/><polyline points="7,4 7,7 9,9"/></svg>
        {tzOffset(serverTime)} (server) · {tzName.split('/').pop()?.replace('_', ' ')} (browser)
      </div>
      <div className={styles.regionZones}>
        {zones.map(z => (
          <div key={z.label} className={`${styles.regionZoneRow} ${z.accent ? styles.regionZoneAccent : ''}`}>
            <span className={styles.regionZoneLabel}>{z.label}</span>
            <span className={styles.regionZoneVal}>{z.value}</span>
          </div>
        ))}
      </div>
      <div className={styles.regionMeta}>
        <div className={styles.regionMetaRow}>
          <span className={styles.regionMetaLabel}>Uptime</span>
          <span className={styles.regionMetaVal}>{uptime}</span>
        </div>
        <div className={styles.regionMetaRow}>
          <span className={styles.regionMetaLabel}>Load avg</span>
          <span className={styles.regionMetaVal}>{load}</span>
        </div>
        <div className={styles.regionMetaRow}>
          <span className={styles.regionMetaLabel}>Hostname</span>
          <span className={styles.regionMetaVal}>{serverInfo.hostname}</span>
        </div>
        <div className={styles.regionMetaRow}>
          <span className={styles.regionMetaLabel}>Kernel</span>
          <span className={styles.regionMetaVal}>{serverInfo.kernel || '—'}</span>
        </div>
      </div>
    </div>
  )
}

// ── Uptime Card ───────────────────────────────────────────────────────────────
function UptimeCard({ summary, snapshot }: {
  summary: MetricsSummary | undefined
  snapshot: ReturnType<typeof useMetricsStream>['snapshot']
}) {
  const uptimeHuman = summary?.uptime_human ?? (snapshot as any)?.host?.uptime_human ?? null
  const uptimeSec   = summary?.uptime_seconds ?? (snapshot as any)?.host?.uptime_seconds ?? 0
  const bootTimeRaw = (snapshot as any)?.host?.boot_time as number | undefined
  const load1  = summary?.load_avg_1  ?? (snapshot as any)?.load?.load1  ?? 0
  const load5  = summary?.load_avg_5  ?? (snapshot as any)?.load?.load5  ?? 0
  const load15 = summary?.load_avg_15 ?? (snapshot as any)?.load?.load15 ?? 0

  const isUp = !!uptimeHuman

  const uptimePct = uptimeSec > 0
    ? Math.min(100, (uptimeSec / (30 * 86400)) * 100)
    : 0

  const bootDate = bootTimeRaw
    ? new Date(bootTimeRaw * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  const loadColor = (v: number) =>
    v > 4 ? 'var(--color-danger)' : v > 2 ? 'var(--color-warning)' : 'var(--color-success)'

  return (
    <div className={styles.uptimeCard}>
      <div className={styles.uptimeHeader}>
        <div className={styles.uptimeLeft}>
          <div className={styles.uptimeSectionLabel}>Server Uptime</div>
          <div className={styles.uptimeDuration}>{uptimeHuman ?? '—'}</div>
          {bootDate && <div className={styles.uptimeBootDate}>Booted {bootDate}</div>}
        </div>
        <div className={styles.uptimeStatus}>
          <div className={`${styles.uptimeDot} ${isUp ? styles.uptimeDotUp : styles.uptimeDotUnk}`}>
            {isUp && <div className={styles.uptimeRing} />}
          </div>
          <span className={`${styles.uptimeBadge} ${isUp ? styles.uptimeBadgeUp : styles.uptimeBadgeUnk}`}>
            {isUp ? 'UP' : '—'}
          </span>
        </div>
      </div>

      <div className={styles.uptimeLoads}>
        <div className={styles.uptimeLoadLabel}>Load Average</div>
        <div className={styles.uptimeLoadRow}>
          {([['1m', load1], ['5m', load5], ['15m', load15]] as [string, number][]).map(([label, v]) => (
            <div key={label} className={styles.uptimeLoadItem}>
              <div className={styles.uptimeLoadVal} style={{ color: loadColor(v) }}>{v.toFixed(2)}</div>
              <div className={styles.uptimeLoadTime}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.uptimeBarWrap}>
        <div className={styles.uptimeBarLabel}>
          <span>30-day uptime</span>
          <span style={{ color: uptimePct >= 99 ? 'var(--color-success)' : 'var(--color-warning)', fontWeight: 600 }}>
            {uptimePct >= 100 ? '100%' : uptimePct > 0 ? uptimePct.toFixed(1) + '%' : '—'}
          </span>
        </div>
        <div className={styles.uptimeBarTrack}>
          <div className={styles.uptimeBarFill} style={{
            width: `${uptimePct}%`,
            background: uptimePct >= 99 ? 'var(--color-success)' : 'var(--color-warning)',
          }} />
        </div>
      </div>
    </div>
  )
}

// ── Storage / Hardware Card ───────────────────────────────────────────────────
function StorageHardwareCard({ serverInfo, snapshot }: {
  serverInfo: ServerInfo
  snapshot: ReturnType<typeof useMetricsStream>['snapshot']
}) {
  const mem = snapshot?.memory
  const totalRam = mem ? formatBytes(mem.total_bytes) : (serverInfo.total_ram || '—')
  const usedRam  = mem ? formatBytes(mem.used_bytes)  : '—'
  const ramPct   = mem ? mem.used_pct : 0

  const primaryDisk = snapshot?.disk?.[0]

  return (
    <div className={styles.hwCard}>
      <div className={styles.hwSectionLabel}>Server Hardware</div>

      <div className={styles.hwSection}>
        <div className={styles.hwCpuRow}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.hwSectionLabel}>CPU</div>
            <div className={styles.hwCpuModel}>{serverInfo.cpu_model || serverInfo.os || '—'}</div>
          </div>
          <div className={styles.hwCpuCores}>
            <span className={styles.hwCoresBig}>{serverInfo.cpu_cores || '—'}</span>
            <span className={styles.hwCoresLabel}>{serverInfo.cpu_cores ? 'cores' : ''}</span>
          </div>
        </div>
      </div>

      <div className={styles.hwSection}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
          <div className={styles.hwSectionLabel}>RAM</div>
          <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>
            {mem ? `${usedRam} / ${totalRam}` : totalRam}
          </span>
        </div>
        <div className={styles.hwBar}>
          <div className={styles.hwBarFill} style={{ width: `${ramPct}%`, background: pctColor(ramPct) }} />
        </div>
      </div>

      {primaryDisk && (
        <div className={styles.hwSection}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
            <div className={styles.hwSectionLabel}>Disk {primaryDisk.mount}</div>
            <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>
              {formatBytes(primaryDisk.used_bytes)} / {formatBytes(primaryDisk.total_bytes)}
            </span>
          </div>
          <div className={styles.hwBar}>
            <div className={styles.hwBarFill} style={{ width: `${primaryDisk.used_pct}%`, background: pctColor(primaryDisk.used_pct) }} />
          </div>
        </div>
      )}

      <div className={styles.hwMeta}>
        {serverInfo.arch && (
          <div className={styles.hwMetaRow}>
            <span className={styles.hwMetaKey}>Arch</span>
            <span className={styles.hwMetaVal}>{serverInfo.arch}</span>
          </div>
        )}
        {serverInfo.os && (
          <div className={styles.hwMetaRow}>
            <span className={styles.hwMetaKey}>OS</span>
            <span className={styles.hwMetaVal}>{serverInfo.os}</span>
          </div>
        )}
        {serverInfo.kernel && (
          <div className={styles.hwMetaRow}>
            <span className={styles.hwMetaKey}>Kernel</span>
            <span className={styles.hwMetaVal}>{serverInfo.kernel}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type SortKey = 'name' | 'cpu' | 'ram' | 'disk' | 'uptime' | 'status'
type SortDir = 'asc' | 'desc'

export default function MetricsPage() {
  const navigate = useNavigate()
  // chartRange must be declared before useMetricsStream so it can be passed in
  const [chartRange, setChartRange] = useState('15m')
  const { snapshot, buffer, wsLive } = useMetricsStream(chartRange)
  const qc = useQueryClient()
  const serverInfo = useServerInfo()
  const { data: summary } = useQuery({
    queryKey: ['metrics', 'summary'],
    queryFn: fetchMetricsSummary,
    refetchInterval: 60_000,
    retry: false,
  })

  const { data: serversApiData } = useQuery({
    queryKey: ['dashboard-servers'],
    queryFn: fetchManagedServers,
    refetchInterval: 30_000,
    retry: false,
  })

  const { data: alertEventsData } = useQuery({
    queryKey: ['dashboard-alert-events'],
    queryFn: fetchAlertEvents,
    refetchInterval: 30_000,
    retry: false,
  })

  const { data: auditData } = useQuery({
    queryKey: ['dashboard-audit-log'],
    queryFn: () => fetchAuditLog(100),
    refetchInterval: 60_000,
    retry: false,
  })

  const { data: containersApiData } = useQuery({
    queryKey: ['dashboard-containers'],
    queryFn: fetchContainers,
    refetchInterval: 15_000,
    retry: false,
  })

  const { data: securityApiData } = useQuery({
    queryKey: ['dashboard-security-audit'],
    queryFn: fetchSecurityAudit,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const { data: servicesData } = useQuery({
    queryKey: ['dashboard-services'],
    queryFn: fetchServices,
    refetchInterval: 30_000,
    retry: false,
  })

  const { data: securityStats } = useQuery({
    queryKey: ['dashboard-security-stats'],
    queryFn: fetchSecurityStats,
    refetchInterval: 60_000,
    retry: false,
  })

  // live clock
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // server panel state
  const [serverView, setServerView] = useState<'list'|'grid'>('list')
  const [serverSort, setServerSort] = useState<SortKey>('name')
  const [serverDir, setServerDir] = useState<SortDir>('asc')
  const [serverSearch, setServerSearch] = useState('')
  const [serverFilter, setServerFilter] = useState<'all'|'online'|'offline'|'warning'>('all')
  const [servers, setServers] = useState<DashServer[]>([])
  const [selectedServer, setSelectedServer] = useState<DashServer | null>(null)
  const [showAddServer, setShowAddServer] = useState(false)

  // alerts state
  const [alerts, setAlerts] = useState<DashAlert[]>([])
  const [alertFilter, setAlertFilter] = useState<'all'|'critical'|'warning'|'info'>('all')
  const [selectedAlert, setSelectedAlert] = useState<DashAlert | null>(null)

  // timeline state
  const [timelineFilter, setTimelineFilter] = useState<'all'|'security'|'deploy'|'login'|'incident'>('all')
  const [selectedTimelineEvent, setSelectedTimelineEvent] = useState<TimelineEvent | null>(null)

  // UI toggles
  const [showTerminal, setShowTerminal] = useState(false)
  const [showScan, setShowScan] = useState(false)
  const [secCollapsed, setSecCollapsed] = useState(false)

  // drag state
  const dragIdx = useRef<number | null>(null)
  const dragOverIdx = useRef<number | null>(null)

  // derived server list
  const totalNetSent = snapshot?.network?.reduce((s, n) => s + n.sent_bps, 0) ?? 0
  const totalNetRecv = snapshot?.network?.reduce((s, n) => s + n.recv_bps, 0) ?? 0
  const topDiskPct   = snapshot?.disk?.reduce((m, d) => Math.max(m, d.used_pct), 0) ?? 0
  const netTotal     = totalNetSent + totalNetRecv
  void Math.min(100, netTotal / (100 * 1024 * 1024) * 100)

  const filteredServers = servers
    .filter(s => serverFilter === 'all' || s.status === serverFilter)
    .filter(s => s.name.toLowerCase().includes(serverSearch.toLowerCase()) || s.ip.includes(serverSearch))
    .sort((a, b) => {
      const raw_a = (a as unknown as Record<string, unknown>)[serverSort]
      const raw_b = (b as unknown as Record<string, unknown>)[serverSort]
      const al = typeof raw_a === 'string' ? raw_a.toLowerCase() : (raw_a as number)
      const bl = typeof raw_b === 'string' ? raw_b.toLowerCase() : (raw_b as number)
      const cmp = al < bl ? -1 : al > bl ? 1 : 0
      return serverDir === 'asc' ? cmp : -cmp
    })

  function toggleSort(k: SortKey) {
    if (serverSort === k) setServerDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setServerSort(k); setServerDir('asc') }
  }

  function onDragStart(i: number) { dragIdx.current = i }
  function onDragOver(e: React.DragEvent, i: number) { e.preventDefault(); dragOverIdx.current = i }
  function onDrop() {
    const from = dragIdx.current; const to = dragOverIdx.current
    if (from === null || to === null || from === to) return
    const next = [...servers]
    const [item] = next.splice(from, 1); next.splice(to, 0, item)
    setServers(next); dragIdx.current = null; dragOverIdx.current = null
  }

  // Seed servers and alerts from API data
  useEffect(() => {
    if (serversApiData && serversApiData.length > 0) {
      setServers(serversApiData.map(mapServerEntry))
    }
  }, [serversApiData])

  useEffect(() => {
    if (alertEventsData) {
      setAlerts(alertEventsData.map(mapAlertEvent))
    }
  }, [alertEventsData])

  // Derived data from API responses
  const containers: ContainerStat[] = containersApiData ? containersApiData.map(mapContainer) : []
  const securityChecks: SecurityCheck[] = securityApiData ? mapSecurityAudit(securityApiData) : []
  const timelineData: TimelineEvent[] = auditData?.entries ? auditData.entries.map(mapAuditEntry) : []

  const filteredAlerts = alerts.filter(a => alertFilter === 'all' || a.severity === alertFilter)
  const filteredTimeline = timelineData.filter(e => timelineFilter === 'all' || e.type === timelineFilter)

  const onlineCount = servers.filter(s => s.status === 'online').length
  const offlineCount = servers.filter(s => s.status === 'offline').length
  const warnCount = servers.filter(s => s.status === 'warning').length
  const critAlerts = alerts.filter(a => a.severity === 'critical' && a.status === 'active').length

  const svcTotal    = servicesData?.length ?? 0
  const svcActive   = servicesData?.filter((s: Service) => s.status === 'active').length ?? 0
  const svcUnhealthy = svcTotal - svcActive
  const svcHealthPct = svcTotal > 0 ? ((svcActive / svcTotal) * 100).toFixed(1) : '—'

  const secScore = securityApiData?.score != null ? Math.round(securityApiData.score) : 0
  const secGrade = securityApiData?.grade ?? (secScore >= 90 ? 'A' : secScore >= 75 ? 'B' : secScore >= 60 ? 'C' : 'D')
  const secGradeColor = secScore >= 90 ? 'var(--color-success)' : secScore >= 75 ? 'var(--color-warning)' : 'var(--color-danger)'
  const secOk  = securityChecks.filter(c => c.status === 'ok').length
  const secFail = securityChecks.filter(c => c.status === 'fail').length

  const lastLoginEntry = auditData?.entries?.find(e => e.path.includes('/auth/login') && e.status === 200)
  const lastLoginAgo = lastLoginEntry
    ? (() => {
        const diff = Math.floor((Date.now() / 1000) - lastLoginEntry.ts)
        if (diff < 60) return `${diff}s ago`
        if (diff < 3600) return `${Math.floor(diff/60)}m ago`
        if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
        return `${Math.floor(diff/86400)}d ago`
      })()
    : null
  const lastLoginIp = lastLoginEntry?.ip ?? null

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <div className={styles.pageHeaderTitle}>
            <IcActivity />
            <span>Server Dashboard</span>
            {wsLive && <span className={styles.liveBadge}><span className={styles.liveDot}/>Live</span>}
            {!wsLive && <span className={styles.demoBadge}>Demo</span>}
          </div>
          <div className={styles.pageHeaderSub}>Fleet overview — {servers.length} servers, {onlineCount} online</div>
        </div>
        <div className={styles.pageHeaderRight}>
          <button className={styles.iconBtn} title="Refresh" onClick={() => qc.invalidateQueries({ queryKey: ['metrics'] })}><IcRefresh /></button>
          <button className={styles.btnSecondary} onClick={() => navigate('/ssh')}><IcTerminal /> Terminal</button>
          <button className={styles.btnPrimary} onClick={() => setShowAddServer(true)}><IcPlus /> Add Server</button>
        </div>
      </div>

      {/* ── Top Info Row: Greeting · DateTime · Region (row 1) + Uptime · Storage (row 2) ── */}
      <div className={styles.topInfoRow}>
        <GreetingCard
          now={now}
          onlineCount={onlineCount}
          offlineCount={offlineCount}
          warnCount={warnCount}
          critAlerts={critAlerts}
          secScore={secScore}
          secGrade={secGrade}
          secGradeColor={secGradeColor}
          lastLoginAgo={lastLoginAgo}
          lastLoginIp={lastLoginIp}
          secStats={securityStats}
        />
        <DateTimeCard now={now} />
        <div className={styles.topInfoRowRegion}>
          {serverInfo && <RegionCard now={now} serverInfo={serverInfo} summary={summary} />}
        </div>
        <UptimeCard summary={summary} snapshot={snapshot} />
        {serverInfo && <StorageHardwareCard serverInfo={serverInfo} snapshot={snapshot} />}
      </div>

      {/* ── Global Status Cards ── */}
      <div className={styles.statCards}>
        <div className={`${styles.statCard} ${styles.statCardClickable}`} onClick={() => setServerFilter('all')}>
          <div className={styles.statCardIcon} style={{ background: 'rgba(74,158,255,0.1)', color: 'var(--color-accent)' }}><IcServer /></div>
          <div className={styles.statCardBody}>
            <div className={styles.statCardVal}>{servers.length}</div>
            <div className={styles.statCardLabel}>Total Servers</div>
            <div className={styles.statCardSub}>{onlineCount} online · {offlineCount} offline</div>
          </div>
          <div className={styles.statCardTrend} style={{ color: 'var(--color-success)' }}>+8%</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardClickable}`} onClick={() => setServerFilter('online')}>
          <div className={styles.statCardIcon} style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--color-success)' }}><IcServer /></div>
          <div className={styles.statCardBody}>
            <div className={styles.statCardVal}>{onlineCount}</div>
            <div className={styles.statCardLabel}>Online Servers</div>
            <div className={styles.statCardSub}>{offlineCount} offline · {warnCount} warning</div>
          </div>
          {offlineCount > 0 && <div className={styles.statCardTrend} style={{ color: 'var(--color-danger)' }}>{offlineCount} down</div>}
        </div>
        <div className={`${styles.statCard} ${styles.statCardClickable}`}>
          <div className={styles.statCardIcon} style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-danger)' }}><IcShield /></div>
          <div className={styles.statCardBody}>
            <div className={styles.statCardVal}>{secScore}<span className={styles.statCardGrade}>/100</span></div>
            <div className={styles.statCardLabel}>Security Score</div>
            <div className={styles.statCardSub}>{secOk} checks passed · {secFail} critical</div>
          </div>
          <div className={styles.statCardTrend} style={{ color: secGradeColor }}>Grade {secGrade}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statCardIcon} style={{ background: 'rgba(74,158,255,0.1)', color: 'var(--color-accent)' }}><IcCpu /></div>
          <div className={styles.statCardBody}>
            <div className={styles.statCardLabel} style={{ marginBottom: 4 }}>Resource Usage</div>
            {[
              { l: 'CPU', v: snapshot?.cpu.total_pct ?? 0 },
              { l: 'RAM', v: snapshot?.memory.used_pct ?? 0 },
              { l: 'Disk', v: topDiskPct },
            ].map(({ l, v }) => (
              <div key={l} className={styles.miniMetricRow}>
                <span className={styles.miniMetricLabel}>{l}</span>
                <Bar value={v} />
                <span className={styles.miniMetricVal} style={{ color: pctColor(v) }}>{v.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardClickable}`}>
          <div className={styles.statCardIcon} style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--color-success)' }}><IcServices /></div>
          <div className={styles.statCardBody}>
            <div className={styles.statCardVal}>{svcTotal > 0 ? svcActive : '—'}</div>
            <div className={styles.statCardLabel}>Active Services</div>
            <div className={styles.statCardSub}>{svcTotal > 0 ? `${svcActive} healthy · ${svcUnhealthy} unhealthy` : 'Loading…'}</div>
          </div>
          <div className={styles.statCardTrend} style={{ color: 'var(--color-success)' }}>{svcTotal > 0 ? `${svcHealthPct}%` : ''}</div>
        </div>
        <div className={`${styles.statCard} ${critAlerts > 0 ? styles.statCardDanger : styles.statCardClickable}`} onClick={() => setAlertFilter('critical')}>
          <div className={styles.statCardIcon} style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-danger)' }}><IcAlert /></div>
          <div className={styles.statCardBody}>
            <div className={styles.statCardVal}>{critAlerts}</div>
            <div className={styles.statCardLabel}>Active Incidents</div>
            <div className={styles.statCardSub}>{alerts.filter(a=>a.status==='active').length} total active alerts</div>
          </div>
          {critAlerts > 0 && <div className={styles.statCardTrend} style={{ color: 'var(--color-danger)' }}>Critical</div>}
        </div>
      </div>

      {/* ── Server Health Panel ── */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}><IcServer />Servers — Health Status</div>
          <div className={styles.panelControls}>
            {/* filter pills */}
            <div className={styles.filterPills}>
              {(['all','online','offline','warning'] as const).map(f => (
                <button key={f} className={`${styles.pill} ${serverFilter===f ? styles.pillActive : ''}`} onClick={() => setServerFilter(f)}>
                  {f==='all' ? `All (${servers.length})` : f==='online' ? `Online (${onlineCount})` : f==='offline' ? `Offline (${offlineCount})` : `Warn (${warnCount})`}
                </button>
              ))}
            </div>
            {/* search */}
            <div className={styles.searchWrap}>
              <IcSearch />
              <input className={styles.searchInput} placeholder="Search servers…" value={serverSearch} onChange={e => setServerSearch(e.target.value)} />
            </div>
            {/* sort */}
            <div className={styles.sortWrap}>
              <IcSort />
              <select className={styles.sortSelect} value={serverSort} onChange={e => setServerSort(e.target.value as SortKey)}>
                <option value="name">Name</option>
                <option value="cpu">CPU</option>
                <option value="ram">RAM</option>
                <option value="disk">Disk</option>
                <option value="uptime">Uptime</option>
                <option value="status">Status</option>
              </select>
              <button className={styles.iconBtn} onClick={() => setServerDir(d => d==='asc'?'desc':'asc')} title={serverDir}>
                <IcChevron />
              </button>
            </div>
            {/* view toggle */}
            <div className={styles.viewToggle}>
              <button className={`${styles.viewBtn} ${serverView==='list'?styles.viewBtnActive:''}`} onClick={() => setServerView('list')}><IcList /></button>
              <button className={`${styles.viewBtn} ${serverView==='grid'?styles.viewBtnActive:''}`} onClick={() => setServerView('grid')}><IcGrid /></button>
            </div>
            <button className={styles.btnPrimary} style={{ fontSize: 12 }} onClick={() => setShowAddServer(true)}><IcPlus /></button>
          </div>
        </div>

        {/* LIST view */}
        {serverView === 'list' && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th} style={{ width: 20 }}></th>
                  <th className={styles.th} onClick={() => toggleSort('name')} style={{ cursor:'pointer' }}>Server <IcSort /></th>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th} onClick={() => toggleSort('cpu')} style={{ cursor:'pointer' }}>CPU <IcSort /></th>
                  <th className={styles.th} onClick={() => toggleSort('ram')} style={{ cursor:'pointer' }}>RAM <IcSort /></th>
                  <th className={styles.th} onClick={() => toggleSort('disk')} style={{ cursor:'pointer' }}>Disk <IcSort /></th>
                  <th className={styles.th}>Trend</th>
                  <th className={styles.th}>Uptime</th>
                  <th className={styles.th}>Security</th>
                  <th className={styles.th}>Location</th>
                  <th className={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredServers.map((s) => (
                  <tr
                    key={s.id}
                    className={styles.tr}
                    draggable
                    onDragStart={() => onDragStart(servers.indexOf(s))}
                    onDragOver={e => onDragOver(e, servers.indexOf(s))}
                    onDrop={onDrop}
                  >
                    <td className={styles.td} style={{ cursor:'grab', color:'var(--color-text-dim)' }}><IcDrag /></td>
                    <td className={styles.td}>
                      <div className={styles.serverNameCell}>
                        <StatusDot status={s.status} />
                        <div>
                          <div className={styles.serverName}>{s.name}</div>
                          <div className={styles.serverIp}>{s.ip}</div>
                        </div>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <span className={`${styles.statusBadge} ${s.status==='online'?styles.statusOnline:s.status==='warning'?styles.statusWarn:styles.statusOff}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <div className={styles.metricCell}>
                        <Bar value={s.cpu} />
                        <span style={{ color: pctColor(s.cpu), fontSize: 11 }}>{s.cpu}%</span>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div className={styles.metricCell}>
                        <Bar value={s.ram} />
                        <span style={{ color: pctColor(s.ram), fontSize: 11 }}>{s.ram}%</span>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div className={styles.metricCell}>
                        <Bar value={s.disk} />
                        <span style={{ color: pctColor(s.disk), fontSize: 11 }}>{s.disk}%</span>
                      </div>
                    </td>
                    <td className={styles.td}><Sparkline data={s.sparkCpu} /></td>
                    <td className={styles.td} style={{ fontSize:11, color:'var(--color-text-muted)' }}>{s.uptimeDays}d</td>
                    <td className={styles.td}>
                      <span className={s.securityIssues > 0 ? styles.secBad : styles.secGood}>
                        {s.securityIssues > 0 ? `${s.securityIssues} issues` : 'Clean'}
                      </span>
                    </td>
                    <td className={styles.td} style={{ fontSize:11, color:'var(--color-text-muted)' }}>{s.location}</td>
                    <td className={styles.td}>
                      <div className={styles.rowActions}>
                        <button className={styles.rowBtn} onClick={() => setSelectedServer(s)} title="Details"><IcEye /></button>
                        <button className={styles.rowBtn} title="SSH Terminal" onClick={() => navigate('/ssh')}><IcTerminal /></button>
                        <button className={styles.rowBtn} title="Server Metrics" onClick={() => navigate('/servers/' + s.id)}><IcActivity /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredServers.length === 0 && <div className={styles.empty}>No servers match your filter.</div>}
          </div>
        )}

        {/* GRID view */}
        {serverView === 'grid' && (
          <div className={styles.serverGrid}>
            {filteredServers.map((s) => (
              <div
                key={s.id}
                className={`${styles.serverCard} ${s.status==='offline'?styles.serverCardOff:s.status==='warning'?styles.serverCardWarn:''}`}
                draggable
                onDragStart={() => onDragStart(servers.indexOf(s))}
                onDragOver={e => onDragOver(e, servers.indexOf(s))}
                onDrop={onDrop}
                onClick={() => setSelectedServer(s)}
              >
                <div className={styles.serverCardHead}>
                  <div className={styles.serverCardName}><StatusDot status={s.status} />{s.name}</div>
                  <div className={styles.serverCardDrag}><IcDrag /></div>
                </div>
                <div className={styles.serverCardIp}>{s.ip} · {s.location}</div>
                <div className={styles.serverCardMetrics}>
                  {[['CPU', s.cpu],['RAM',s.ram],['Disk',s.disk]].map(([l,v]) => (
                    <div key={l} className={styles.serverCardMetric}>
                      <div className={styles.serverCardMetricLabel}>{l}</div>
                      <Bar value={Number(v)} />
                      <div className={styles.serverCardMetricVal} style={{ color: pctColor(Number(v)) }}>{v}%</div>
                    </div>
                  ))}
                </div>
                <div className={styles.serverCardFooter}>
                  <Sparkline data={s.sparkCpu} color={pctColor(s.cpu)} />
                  <div className={styles.serverCardTags}>
                    {s.tags.slice(0,2).map(t => <span key={t} className={styles.tag}>{t}</span>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Charts Row ── */}
      <div className={styles.sectionHead}>
        <div className={styles.sectionTitle}><IcActivity /> Live Resource Monitoring</div>
        <div className={styles.sectionControls}>
          {['5m','15m','1h','6h'].map(r => (
            <button key={r} className={`${styles.pill} ${chartRange===r?styles.pillActive:''}`} onClick={() => setChartRange(r)}>{r}</button>
          ))}
          {wsLive && <span className={styles.liveBadge}><span className={styles.liveDot}/>Live</span>}
        </div>
      </div>
      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div className={styles.chartTitleRow}>
              <span className={styles.chartTitle}><IcCpu /> CPU Usage</span>
              {snapshot?.cpu.per_core_pct && (
                <div className={styles.corePills}>
                  {snapshot.cpu.per_core_pct.map((p, i) => (
                    <span key={i} className={styles.corePill} style={{ color: pctColor(p) }}>c{i} {p.toFixed(0)}%</span>
                  ))}
                </div>
              )}
            </div>
            {snapshot && <span className={styles.chartVal} style={{ color:'var(--color-accent)' }}>{snapshot.cpu.total_pct.toFixed(1)}%</span>}
          </div>
          <CPUChart data={buffer} />
        </div>
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <span className={styles.chartTitle}><IcMemory /> Memory</span>
            {snapshot && <span className={styles.chartVal} style={{ color:'#22c55e' }}>{snapshot.memory.used_pct.toFixed(1)}%</span>}
          </div>
          {snapshot?.memory && (
            <div className={styles.memMeta}>
              <span><span className={styles.metaLabel}>Used</span> {formatBytes(snapshot.memory.used_bytes)}</span>
              <span><span className={styles.metaLabel}>Total</span> {formatBytes(snapshot.memory.total_bytes)}</span>
              {snapshot.memory.swap_total_bytes > 0 && (
                <span><span className={styles.metaLabel}>Swap</span> {formatBytes(snapshot.memory.swap_used_bytes)}/{formatBytes(snapshot.memory.swap_total_bytes)}</span>
              )}
            </div>
          )}
          <MemoryChart data={buffer} />
        </div>
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <span className={styles.chartTitle}><IcNetwork /> Network I/O</span>
            {snapshot && (
              <div className={styles.netMeta}>
                <span style={{ color:'#4a9eff' }}>↑ {formatBps(totalNetSent)}</span>
                <span style={{ color:'#a78bfa' }}>↓ {formatBps(totalNetRecv)}</span>
              </div>
            )}
          </div>
          <NetworkChart data={buffer} />
        </div>
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <span className={styles.chartTitle}><IcDisk /> Disk Partitions</span>
          </div>
          {snapshot?.disk ? <DiskTable disks={snapshot.disk} onRowClick={m => navigate(`/metrics/disk/${encodeURIComponent(m)}`)} /> : <p className={styles.emptyNote}>Waiting for data…</p>}
        </div>
      </div>

      {/* ── Security Overview ── */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <IcShield /> Security Overview
            {securityApiData && <>
              <span className={styles.secScore}>Score: {Math.round(securityApiData.score)}/100</span>
              <span className={styles.secGrade} style={{ color: secGradeColor }}>Grade {secGrade}</span>
            </>}
          </div>
          <div className={styles.panelControls}>
            <button className={styles.btnSecondary} onClick={() => setShowScan(true)}>Run Scan</button>
            <button className={styles.iconBtn} onClick={() => setSecCollapsed(v => !v)}><IcChevron /></button>
          </div>
        </div>
        {!secCollapsed && (
          <div className={styles.secGrid}>
            {/* Threat stats */}
            <div className={styles.secLeft}>
              <div className={styles.secSubTitle}>Threat Statistics — {securityStats?.period ?? '24h'}</div>
              <div className={styles.threatCards}>
                {[
                  {
                    label: 'Blocked Attacks',
                    val: securityStats != null ? String(securityStats.blocked_attacks) : '—',
                    sub: 'iptables DROP',
                    color: securityStats && securityStats.blocked_attacks > 0 ? 'var(--color-danger)' : 'var(--color-success)',
                  },
                  {
                    label: 'Failed Logins',
                    val: securityStats != null ? String(securityStats.failed_logins) : '—',
                    sub: 'auth log',
                    color: securityStats && securityStats.failed_logins > 50 ? 'var(--color-danger)' : securityStats && securityStats.failed_logins > 10 ? 'var(--color-warning)' : 'var(--color-success)',
                  },
                  {
                    label: 'Banned IPs',
                    val: securityStats != null ? String(securityStats.banned_ips) : '—',
                    sub: 'fail2ban',
                    color: securityStats && securityStats.banned_ips > 0 ? 'var(--color-warning)' : 'var(--color-success)',
                  },
                  {
                    label: 'Malware Found',
                    val: securityStats != null ? String(securityStats.malware_found) : '—',
                    sub: securityStats?.malware_found === 0 ? 'Clean' : 'ClamAV',
                    color: securityStats && securityStats.malware_found > 0 ? 'var(--color-danger)' : 'var(--color-success)',
                  },
                ].map(t => (
                  <div key={t.label} className={styles.threatCard}>
                    <div className={styles.threatVal} style={{ color: t.color }}>{t.val}</div>
                    <div className={styles.threatLabel}>{t.label}</div>
                    <div className={styles.threatSub}>{t.sub}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* Health checks */}
            <div className={styles.secRight}>
              <div className={styles.secSubTitle}>Security Health Checks</div>
              <div className={styles.checkList}>
                {securityChecks.map(c => (
                  <div key={c.label} className={styles.checkItem}>
                    <span className={c.status==='ok' ? styles.checkOk : c.status==='warn' ? styles.checkWarn : styles.checkFail}>
                      {c.status==='ok' ? <IcCheck /> : c.status==='warn' ? <IcWarn /> : <IcFail />}
                    </span>
                    <div className={styles.checkBody}>
                      <div className={styles.checkLabel}>{c.label}</div>
                      <div className={styles.checkDetail}>{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Alerts Panel ── */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}><IcAlert /> Alerts &amp; Incidents</div>
          <div className={styles.panelControls}>
            <div className={styles.filterPills}>
              {(['all','critical','warning','info'] as const).map(f => (
                <button key={f} className={`${styles.pill} ${alertFilter===f?styles.pillActive:''}`} onClick={() => setAlertFilter(f)}>{f}</button>
              ))}
            </div>
            <button className={styles.btnSecondary} onClick={() => setAlerts(a => a.map(x => ({ ...x, status: 'acknowledged' as const })))}>Ack All</button>
            <button className={styles.btnSecondary} onClick={() => setAlerts(a => a.filter(x => x.status !== 'resolved'))}>Archive Resolved</button>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Severity</th>
                <th className={styles.th}>Time</th>
                <th className={styles.th}>Server</th>
                <th className={styles.th}>Message</th>
                <th className={styles.th}>Category</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlerts.map(a => (
                <tr key={a.id} className={`${styles.tr} ${a.severity==='critical'&&a.status==='active'?styles.trCrit:''}`}>
                  <td className={styles.td}><SeverityBadge s={a.severity} /></td>
                  <td className={styles.td} style={{ fontSize:11, color:'var(--color-text-muted)', whiteSpace:'nowrap' }}>{a.time}</td>
                  <td className={styles.td}><span className={styles.monoText}>{a.server}</span></td>
                  <td className={styles.td} style={{ fontSize:12 }}>{a.message}</td>
                  <td className={styles.td}><span className={styles.catBadge}>{a.category}</span></td>
                  <td className={styles.td}>
                    <span className={a.status==='active'?styles.statusBadgeActive:a.status==='acknowledged'?styles.statusBadgeAck:styles.statusBadgeRes}>
                      {a.status}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <div className={styles.rowActions}>
                      <button className={styles.rowBtn} onClick={() => setSelectedAlert(a)} title="View"><IcEye /></button>
                      <button className={styles.rowBtn} onClick={() => setAlerts(al => al.map(x => x.id===a.id?{...x,status:'acknowledged'}:x))} title="Acknowledge"><IcCheck /></button>
                      <button className={styles.rowBtn} onClick={() => setAlerts(al => al.filter(x => x.id!==a.id))} title="Dismiss"><IcClose /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredAlerts.length === 0 && <div className={styles.empty}>No alerts match your filter.</div>}
        </div>
      </div>

      {/* ── Activity Timeline ── */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}><IcActivity /> Activity Timeline</div>
          <div className={styles.panelControls}>
            <div className={styles.filterPills}>
              {(['all','security','deploy','login','incident'] as const).map(f => (
                <button key={f} className={`${styles.pill} ${timelineFilter===f?styles.pillActive:''}`} onClick={() => setTimelineFilter(f)}>{f}</button>
              ))}
            </div>
            <div className={styles.sortWrap}>
              <IcFilter />
              <select className={styles.sortSelect}>
                <option>Last 24 hours</option>
                <option>Last 7 days</option>
                <option>Last 30 days</option>
              </select>
            </div>
          </div>
        </div>
        <div className={styles.timeline}>
          {filteredTimeline.length === 0 && (
            <div className={styles.empty}>No activity events recorded yet.</div>
          )}
          {filteredTimeline.map((e, i) => (
            <div key={e.id} className={styles.timelineItem} style={{ cursor: 'pointer' }} onClick={() => setSelectedTimelineEvent(e)}>
              <div className={styles.timelineIconWrap}>
                <div className={styles.timelineIcon}>{timelineIcon(e.type)}</div>
                {i < filteredTimeline.length - 1 && <div className={styles.timelineLine} />}
              </div>
              <div className={styles.timelineBody}>
                <div className={styles.timelineHeader}>
                  <span className={styles.timelineTime}>{e.time}</span>
                  <span className={styles.timelineServer}>{e.server}</span>
                  <span className={styles.timelineUser}>{e.user}</span>
                  <span className={styles.timelineTypeBadge}>{e.type}</span>
                  {e._ip && <span className={styles.timelineUser} style={{ marginLeft: 2 }}>{e._ip}</span>}
                </div>
                <div className={styles.timelineDetails}>{e.details}</div>
              </div>
              <div className={styles.timelineActions}>
                <button className={styles.rowBtn} title="View Details" onClick={ev => { ev.stopPropagation(); setSelectedTimelineEvent(e) }}><IcEye /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Container Summary ── */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}><IcDocker /> Container Summary</div>
          <div className={styles.panelControls}>
            <span className={styles.pill} style={{ cursor:'default' }}>
              {containers.filter(c=>c.status==='running').length} running · {containers.filter(c=>c.status==='unhealthy').length} unhealthy
            </span>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>Image</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>CPU</th>
                <th className={styles.th}>RAM (MB)</th>
                <th className={styles.th}>Uptime</th>
                <th className={styles.th}>Issue</th>
              </tr>
            </thead>
            <tbody>
              {containers.map(c => (
                <tr key={c.id} className={styles.tr}>
                  <td className={styles.td}><span className={styles.monoText}>{c.name}</span></td>
                  <td className={styles.td}><span className={styles.monoText} style={{ fontSize:11 }}>{c.image}</span></td>
                  <td className={styles.td}>
                    <span className={c.status==='running'?styles.statusOnline:c.status==='unhealthy'?styles.statusWarn:styles.statusOff}>
                      {c.status}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <div className={styles.metricCell}>
                      <Bar value={c.cpu * 5} color={pctColor(c.cpu * 5)} />
                      <span style={{ fontSize:11 }}>{c.cpu}%</span>
                    </div>
                  </td>
                  <td className={styles.td} style={{ fontSize:11 }}>{c.ram}</td>
                  <td className={styles.td} style={{ fontSize:11, color:'var(--color-text-muted)' }}>{c.uptime}</td>
                  <td className={styles.td}>{c.vuln ? <span className={`${styles.badge} ${styles.badgeWarn}`}>{c.vuln}</span> : <span style={{color:'var(--color-text-dim)',fontSize:11}}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Process Table ── */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}><IcCpu /> Top Processes</div>
          <span className={styles.panelSub}>{snapshot?.processes?.length ?? 0} processes</span>
        </div>
        <div style={{ padding:'0 14px 12px' }}>
          {snapshot?.processes
            ? <ProcessTable processes={snapshot.processes} />
            : <p className={styles.emptyNote} style={{ padding:'12px 0' }}>Waiting for data…</p>
          }
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className={styles.quickActions}>
        <div className={styles.quickActionsTitle}>Quick Actions</div>
        <div className={styles.quickActionBtns}>
          <button className={styles.qaBtn} onClick={() => setShowAddServer(true)}>
            <IcPlus /> Add Server
          </button>
          <button className={styles.qaBtn} onClick={() => setShowScan(true)}>
            <IcShield /> Run Scan
          </button>
          <button className={styles.qaBtn} onClick={() => navigate('/ssh')}>
            <IcTerminal /> Terminal
          </button>
          <button className={styles.qaBtn}>
            <IcDeploy /> Deploy Agent
          </button>
          <button className={styles.qaBtn}>
            <IcSave /> Backup Now
          </button>
          <button className={styles.qaBtn}>
            <IcRefresh /> Update All
          </button>
        </div>
      </div>

      {/* ── Terminal Widget ── */}
      {showTerminal && <TerminalWidget onClose={() => setShowTerminal(false)} />}

      {/* ── Modals ── */}
      {selectedServer && <ServerModal server={selectedServer} onClose={() => setSelectedServer(null)} />}
      {showAddServer && <AddServerModal onClose={() => setShowAddServer(false)} />}
      {selectedAlert && <AlertModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} />}
      {showScan && <ScanModal onClose={() => setShowScan(false)} servers={servers} />}
      {selectedTimelineEvent && <TimelineDetailModal ev={selectedTimelineEvent} onClose={() => setSelectedTimelineEvent(null)} />}
    </div>
  )
}
