import { useState } from 'react'
import {
  formatBytes, getStateColor, getHealthColor,
  type ContainerMock,
} from './containerMockData'
import styles from './ContainerDetailModal.module.css'

// ── Icons ──────────────────────────────────────────────────────────
const IcoX        = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></svg>
const IcoCopy     = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><path d="M3.5 3.5V2.5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h1"/></svg>
const IcoTerminal = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="1.5" y="2" width="11" height="10" rx="1.5"/><polyline points="4,6 6,8 4,10"/><line x1="7" y1="10" x2="10" y2="10"/></svg>
const IcoCheck    = () => <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1.5,5 4,7.5 8.5,2"/></svg>

// ── Types ─────────────────────────────────────────────────────────
type Tab = 'stats' | 'logs' | 'inspect' | 'terminal' | 'events'

interface Props {
  container: ContainerMock
  onClose: () => void
}

// ── Helpers ────────────────────────────────────────────────────────
function logLineClass(line: string): string {
  const l = line.toLowerCase()
  if (l.includes('error') || l.includes('failed') || l.includes('[error]')) return styles.logError
  if (l.includes('warn') || l.includes('[warn]')) return styles.logWarn
  if (l.includes('success') || l.includes('ready') || l.includes('started') || l.includes('ok')) return styles.logOk
  return ''
}

function eventIcon(type: string): string {
  const m: Record<string, string> = { start: '▶', stop: '■', restart: '↺', kill: '✕', exec: '$', health: '♥', attach: '⤷', die: '✕' }
  return m[type] ?? '·'
}

function eventColor(type: string): string {
  const m: Record<string, string> = {
    start: 'var(--color-success)', stop: 'var(--color-warning)', restart: 'var(--color-accent)',
    kill: 'var(--color-danger)', exec: 'var(--color-accent)', health: 'var(--color-success)',
    attach: 'var(--color-text-muted)', die: 'var(--color-danger)',
  }
  return m[type] ?? 'var(--color-text-dim)'
}

function formatTs(ms: number): string {
  return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── Mock terminal state ────────────────────────────────────────────
const TERMINAL_HISTORY = [
  '/ # ps aux',
  'PID   USER     TIME  COMMAND',
  '    1 root      0:00 nginx: master process nginx -g daemon off;',
  '    7 nginx     0:05 nginx: worker process',
  '    8 nginx     0:04 nginx: worker process',
  '/ # nginx -v',
  'nginx version: nginx/1.24.0',
  '/ # cat /etc/os-release',
  'NAME="Alpine Linux"',
  'ID=alpine',
  'VERSION_ID=3.19.1',
  'PRETTY_NAME="Alpine Linux v3.19"',
  '/ # ',
]

// ── Component ──────────────────────────────────────────────────────
export function ContainerDetailModal({ container, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('stats')
  const [copied, setCopied] = useState('')
  const [termInput, setTermInput] = useState('')
  const [termLines, setTermLines] = useState<string[]>(TERMINAL_HISTORY)

  const cpuPct = container.cpu_pct
  const memPct = container.mem_limit > 0 ? (container.mem_bytes / container.mem_limit) * 100 : 0
  const stateColor = getStateColor(container.state)

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(''), 1500)
  }

  const handleTermEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const cmd = termInput.trim()
    if (!cmd) return
    setTermLines(prev => [...prev, `/ # ${cmd}`, `(simulated — not a real shell)`])
    setTermInput('')
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerAccent} style={{ background: stateColor }} />
            <div>
              <div className={styles.headerTitle}>{container.name}</div>
              <div className={styles.headerSub}>
                <span style={{ fontFamily: 'monospace', color: 'var(--color-accent)', fontSize: 10 }}>{container.id}</span>
                <span style={{ color: 'var(--color-text-dim)' }}>·</span>
                <span>{container.image}</span>
                <span style={{ color: 'var(--color-text-dim)' }}>·</span>
                <span style={{
                  background: `${stateColor}1a`, border: `1px solid ${stateColor}44`,
                  color: stateColor, borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 600,
                }}>
                  {container.state}
                </span>
                {container.health !== 'none' && (
                  <span style={{
                    background: `${getHealthColor(container.health)}1a`,
                    border: `1px solid ${getHealthColor(container.health)}44`,
                    color: getHealthColor(container.health),
                    borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 600,
                  }}>
                    {container.health}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><IcoX /></button>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          {(['stats', 'logs', 'inspect', 'terminal', 'events'] as Tab[]).map(t => (
            <button
              key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'events' && container.events.length > 0 && (
                <span className={styles.tabCount}>{container.events.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className={styles.body}>

          {/* ── Stats tab ── */}
          {tab === 'stats' && (
            <div className={styles.statsTab}>
              {/* Mini stat row */}
              <div className={styles.miniStats}>
                {[
                  { label: 'CPU', value: `${cpuPct.toFixed(1)}%`, color: cpuPct > 80 ? 'var(--color-danger)' : cpuPct > 50 ? 'var(--color-warning)' : 'var(--color-success)' },
                  { label: 'Memory', value: formatBytes(container.mem_bytes), color: 'var(--color-accent)' },
                  { label: 'PIDs', value: `${container.pids}/${container.pid_limit}`, color: 'var(--color-text)' },
                  { label: 'Net Rx', value: `${formatBytes(container.net_rx_bps)}/s`, color: 'var(--color-success)' },
                  { label: 'Net Tx', value: `${formatBytes(container.net_tx_bps)}/s`, color: 'var(--color-accent)' },
                ].map(s => (
                  <div key={s.label} className={styles.miniStat}>
                    <div className={styles.miniStatLabel}>{s.label}</div>
                    <div className={styles.miniStatVal} style={{ color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Resource bars */}
              <div className={styles.sectionCard}>
                <div className={styles.sectionCardHeader}>Resource Usage (live)</div>
                <div className={styles.sectionCardBody} style={{ padding: '14px 16px' }}>
                  {[
                    { label: 'CPU', pct: cpuPct, val: `${cpuPct.toFixed(1)}%`, color: cpuPct > 80 ? 'var(--color-danger)' : 'var(--color-accent)' },
                    { label: 'Memory', pct: memPct, val: `${formatBytes(container.mem_bytes)} / ${formatBytes(container.mem_limit)}`, color: 'var(--color-success)' },
                    { label: 'PIDs', pct: (container.pids / container.pid_limit) * 100, val: `${container.pids} / ${container.pid_limit}`, color: 'var(--color-warning)' },
                  ].map(r => (
                    <div key={r.label} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-muted)' }}>{r.label}</span>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: r.color }}>{r.val}</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, r.pct)}%`, background: r.color, borderRadius: 3, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  ))}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
                    {[
                      { label: 'Net Received', val: `${formatBytes(container.net_rx_bps)}/s` },
                      { label: 'Net Sent', val: `${formatBytes(container.net_tx_bps)}/s` },
                      { label: 'Disk Read', val: `${formatBytes(container.disk_read_bps)}/s` },
                      { label: 'Disk Write', val: `${formatBytes(container.disk_write_bps)}/s` },
                    ].map(n => (
                      <div key={n.label} style={{ background: 'var(--color-surface-raised)', borderRadius: 7, padding: '8px 10px', border: '1px solid var(--color-border)' }}>
                        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 3 }}>{n.label}</div>
                        <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text)', fontWeight: 500 }}>{n.val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Process table */}
              {container.processes.length > 0 && (
                <div className={styles.sectionCard} style={{ marginTop: 12 }}>
                  <div className={styles.sectionCardHeader}>Top Processes (docker top)</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-surface-raised)' }}>
                        {['PID', 'USER', 'CPU %', 'MEM %', 'COMMAND'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 500, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {container.processes.map((p, i) => (
                        <tr key={i} style={{ borderBottom: i < container.processes.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                          <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-muted)' }}>{p.pid}</td>
                          <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11 }}>{p.user}</td>
                          <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11, color: Number(p.cpu) > 20 ? 'var(--color-warning)' : 'var(--color-text)' }}>{p.cpu}</td>
                          <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11 }}>{p.mem}</td>
                          <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-muted)' }}>{p.command}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Logs tab ── */}
          {tab === 'logs' && (
            <div className={styles.logsTab}>
              <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Log stream — {container.name}</span>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 5, background: container.state === 'running' ? 'var(--color-success-dim)' : 'var(--color-surface-raised)', border: `1px solid ${container.state === 'running' ? 'rgba(76,175,80,.2)' : 'var(--color-border)'}`, color: container.state === 'running' ? 'var(--color-success)' : 'var(--color-text-dim)' }}>
                  {container.state === 'running' ? 'live' : 'buffered'}
                </span>
              </div>
              {container.logs.length === 0
                ? <div className={styles.emptyInline}>No log output captured for this container.</div>
                : (
                  <div className={styles.mockLog}>
                    <div style={{ padding: '6px 10px', background: 'var(--color-surface-raised)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>Showing {container.logs.length} buffered lines</span>
                      <span style={{ fontSize: 10, color: 'var(--color-text-dim)', fontFamily: 'monospace' }}>{container.name} · {container.id}</span>
                    </div>
                    {container.logs.map((line, i) => (
                      <div key={i} className={`${styles.logLine} ${logLineClass(line)}`}>
                        <span className={styles.logLineNum}>{i + 1}</span>
                        <span className={styles.logLineText}>{line || '\u00a0'}</span>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          )}

          {/* ── Inspect tab ── */}
          {tab === 'inspect' && (
            <div className={styles.inspectTab}>
              {/* Basic Info */}
              <div className={styles.sectionCard}>
                <div className={styles.sectionCardHeader}>Basic Info</div>
                <div className={styles.inspectGrid}>
                  {[
                    { k: 'ID', v: container.id },
                    { k: 'Name', v: container.name },
                    { k: 'Image', v: container.image },
                    { k: 'Image ID', v: container.imageId },
                    { k: 'Created', v: formatTs(container.created) },
                    { k: 'Status', v: container.status },
                    { k: 'Restart Policy', v: container.restartPolicy },
                    { k: 'Restart Count', v: String(container.restartCount) },
                    { k: 'Hostname', v: container.hostname },
                    { k: 'IP', v: container.ip || '—' },
                    { k: 'Network', v: container.network },
                    { k: 'Command', v: container.command },
                  ].map(row => (
                    <div key={row.k} className={styles.inspectRow}>
                      <div className={styles.inspectKey}>{row.k}</div>
                      <div className={styles.inspectVal}>
                        <span className={styles.inspectValMono}>{row.v}</span>
                        <button className={styles.copyBtn} onClick={() => copy(row.v, row.k)} title="Copy">
                          {copied === row.k ? <IcoCheck /> : <IcoCopy />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Port Bindings */}
              <div className={styles.sectionCard}>
                <div className={styles.sectionCardHeader}>Port Bindings ({container.ports.length})</div>
                {container.ports.length === 0
                  ? <div className={styles.emptyInline}>No ports exposed</div>
                  : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr style={{ background: 'var(--color-surface-raised)' }}>
                        {['Host IP', 'Host Port', 'Container Port', 'Protocol'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 500, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {container.ports.map((p, i) => (
                          <tr key={i} style={{ borderBottom: i < container.ports.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                            <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-muted)' }}>{p.hostIp}</td>
                            <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--color-accent)' }}>{p.hostPort}</td>
                            <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11 }}>{p.containerPort}</td>
                            <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11 }}>{p.protocol}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                }
              </div>

              {/* Mounts */}
              <div className={styles.sectionCard}>
                <div className={styles.sectionCardHeader}>Mounts ({container.mounts.length})</div>
                {container.mounts.length === 0
                  ? <div className={styles.emptyInline}>No mounts configured</div>
                  : container.mounts.map((m, i) => (
                    <div key={i} className={styles.mountRow}>
                      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, border: '1px solid var(--color-border)', color: 'var(--color-text-dim)', textTransform: 'uppercase', flexShrink: 0 }}>{m.type}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.host}</span>
                      <span style={{ color: 'var(--color-text-dim)', fontSize: 11 }}>→</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.container}</span>
                      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: m.mode === 'rw' ? 'var(--color-accent-dim)' : 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: m.mode === 'rw' ? 'var(--color-accent)' : 'var(--color-text-dim)', flexShrink: 0 }}>{m.mode}</span>
                    </div>
                  ))
                }
              </div>

              {/* Environment */}
              <div className={styles.sectionCard}>
                <div className={styles.sectionCardHeader}>Environment Variables ({container.env.length})</div>
                {container.env.length === 0
                  ? <div className={styles.emptyInline}>No environment variables</div>
                  : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {container.env.map((e, i) => (
                          <tr key={i} style={{ borderBottom: i < container.env.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                            <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text)', fontWeight: 500, width: 200 }}>{e.key}</td>
                            <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 12, color: e.secret ? 'var(--color-text-dim)' : 'var(--color-text-muted)' }}>
                              {e.secret ? '••••••••••••' : e.value}
                            </td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', width: 70 }}>
                              {e.secret && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'var(--color-warning-dim)', border: '1px solid rgba(255,152,0,.2)', color: 'var(--color-warning)', fontWeight: 500 }}>secret</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                }
              </div>

              {/* Labels */}
              {Object.keys(container.labels).length > 0 && (
                <div className={styles.sectionCard}>
                  <div className={styles.sectionCardHeader}>Labels ({Object.keys(container.labels).length})</div>
                  <div style={{ padding: '8px 10px' }}>
                    {Object.entries(container.labels).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 4, fontFamily: 'monospace', fontSize: 11 }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>{k}</span>
                        <span style={{ color: 'var(--color-text-dim)' }}>=</span>
                        <span style={{ color: 'var(--color-text)' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Terminal tab ── */}
          {tab === 'terminal' && (
            <div className={styles.terminalTab}>
              <div className={styles.terminalBar}>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <IcoTerminal />
                  docker exec -it {container.name} /bin/sh
                </span>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 5, background: 'var(--color-success-dim)', border: '1px solid rgba(76,175,80,.2)', color: 'var(--color-success)' }}>connected</span>
              </div>
              <div className={styles.terminalBody}>
                {termLines.map((line, i) => (
                  <div key={i} className={styles.termLine}>
                    {line.startsWith('/ #') ? <><span style={{ color: '#68d391' }}>{line.split('#')[0]}#</span><span style={{ color: '#b8bdd1' }}>{line.split('#').slice(1).join('#')}</span></> : <span style={{ color: '#9ea3b8' }}>{line}</span>}
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ color: '#68d391', fontFamily: 'monospace', fontSize: 12 }}>/ #</span>
                  <input
                    className={styles.termInput}
                    value={termInput}
                    onChange={e => setTermInput(e.target.value)}
                    onKeyDown={handleTermEnter}
                    placeholder="type a command…"
                    autoFocus
                  />
                </div>
              </div>
              <div className={styles.terminalFooter}>
                <button className="btn btn-ghost btn-sm" onClick={() => setTermLines(TERMINAL_HISTORY)}>Clear</button>
                <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>Simulated terminal — exec not wired to backend</span>
              </div>
            </div>
          )}

          {/* ── Events tab ── */}
          {tab === 'events' && (
            <div className={styles.eventsTab}>
              {container.events.length === 0
                ? <div className={styles.emptyInline}>No events recorded.</div>
                : container.events.map((ev, i) => (
                  <div key={ev.id} className={styles.eventRow}>
                    <div className={styles.eventDot} style={{ background: eventColor(ev.type) }}>
                      {eventIcon(ev.type)}
                    </div>
                    <div className={styles.eventLine} style={{ display: i < container.events.length - 1 ? 'block' : 'none' }} />
                    <div className={styles.eventBody}>
                      <div className={styles.eventMsg}>{ev.message}</div>
                      <div className={styles.eventTs}>{formatTs(ev.ts)}</div>
                    </div>
                    <span className={styles.eventType} style={{ background: `${eventColor(ev.type)}1a`, border: `1px solid ${eventColor(ev.type)}44`, color: eventColor(ev.type) }}>
                      {ev.type}
                    </span>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
