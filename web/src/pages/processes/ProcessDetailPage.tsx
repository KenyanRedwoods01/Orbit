import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import { formatBytes, formatBps } from '@/lib/utils'
import { useProcesses, useProcessHistory } from './useProcesses'
import type { ProcessEntry } from './useProcesses'
import { ProcessAvatar, PROC_BRAND } from '@/components/ProcessIcon'
import styles from './ProcessDetailPage.module.css'

// ── Inline gauge (reused from metrics) ───────────────────────
const R = 58, CX = 80, CY = 84, ARC = Math.PI * R

function pt(t: number, r: number) {
  const a = Math.PI * (1 + t)
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) }
}
const trackPath = `M ${pt(0, R).x} ${pt(0, R).y} A ${R} ${R} 0 0 0 ${pt(1, R).x} ${pt(1, R).y}`

function gaugeColor(v: number) {
  if (v >= 90) return '#ef4444'
  if (v >= 75) return '#f97316'
  if (v >= 50) return '#4a9eff'
  return '#22c55e'
}

function MiniGauge({ value, label, displayVal, icon }: { value: number; label: string; displayVal: string; icon: React.ReactNode }) {
  const v = Math.min(100, Math.max(0, value))
  const color = gaugeColor(v)
  const offset = ARC * (1 - v / 100)
  const angle = 180 + (v / 100) * 180
  const needleLen = R * 0.68
  const id = `det_${label}`
  return (
    <div className={styles.gaugeCard}>
      <div className={styles.gaugeIconRow}>{icon}</div>
      <svg viewBox="0 0 160 100" className={styles.gaugeSvg}>
        <defs>
          <filter id={`gl_${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="11" strokeLinecap="round"/>
        <path d={trackPath} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={`${ARC} ${ARC + 2}`} strokeDashoffset={offset}
          filter={`url(#gl_${id})`}
          style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(.4,0,.2,1), stroke 0.4s ease' }}
        />
        {[0, 0.25, 0.5, 0.75, 1].map(tk => {
          const o = pt(tk, R + 7), i = pt(tk, R + 2)
          return <line key={tk} x1={o.x} y1={o.y} x2={i.x} y2={i.y} stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
        })}
        <g style={{ transformOrigin: `${CX}px ${CY}px`, transform: `rotate(${angle}deg)`, transition: 'transform 0.7s cubic-bezier(.4,0,.2,1)' }}>
          <line x1={CX} y1={CY} x2={CX - 10} y2={CY} stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1={CX} y1={CY} x2={CX + needleLen} y2={CY} stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
        </g>
        <circle cx={CX} cy={CY} r="5" fill="var(--color-surface-raised)" stroke={color} strokeWidth="2"/>
        <circle cx={CX} cy={CY} r="2" fill={color}/>
        <text x={CX} y={CY - 15} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="20" fontWeight="700" fontFamily="'JetBrains Mono',monospace">{displayVal}</text>
      </svg>
      <div className={styles.gaugeLabel}>{label}</div>
    </div>
  )
}

function getC(name: string) {
  const brand = PROC_BRAND[name.toLowerCase()]
  return {
    fg: brand?.color ?? '#94a3b8',
    bg: brand?.bg    ?? 'rgba(255,255,255,0.08)',
  }
}

// ── Infer file descriptor type from path ───────────────────────
function inferFdType(path: string): string {
  if (path.startsWith('socket:') || path.startsWith('TCP:') || path.startsWith('UDP:')) return 'SOCK'
  if (path.startsWith('pipe:') || path.startsWith('pipe:[')) return 'PIPE'
  if (path.startsWith('anon_inode:')) return 'ANON'
  return 'FILE'
}

// ── Tooltip components ────────────────────────────────────────
function ChartTip({ active, payload, fmt }: TooltipProps<number, string> & { fmt: (v: number) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--color-surface-overlay)', border: '1px solid var(--color-border-strong)', borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>
      <div style={{ color: 'var(--color-text-muted)', fontSize: 10, marginBottom: 2 }}>
        {new Date(payload[0]?.payload?.time ?? 0).toLocaleTimeString()}
      </div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, fontFamily: 'monospace' }}>
          {p.name}: {fmt(typeof p.value === 'number' ? p.value : 0)}
        </div>
      ))}
    </div>
  )
}

// ── SVG icons ─────────────────────────────────────────────────
const Ic = (d: string, w = 14) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width={w} height={w}>
    <path d={d}/>
  </svg>
)
function IconCPU()      { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><rect x="5" y="5" width="10" height="10" rx="1"/><line x1="8" y1="2" x2="8" y2="5"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="8" y1="15" x2="8" y2="18"/><line x1="12" y1="15" x2="12" y2="18"/><line x1="2" y1="8" x2="5" y2="8"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="15" y1="8" x2="18" y2="8"/><line x1="15" y1="12" x2="18" y2="12"/></svg> }
function IconMem()      { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><rect x="2" y="6" width="16" height="8" rx="1.5"/><line x1="6" y1="6" x2="6" y2="14"/><line x1="10" y1="6" x2="10" y2="14"/><line x1="14" y1="6" x2="14" y2="14"/><line x1="6" y1="3" x2="6" y2="6"/><line x1="10" y1="3" x2="10" y2="6"/><line x1="14" y1="3" x2="14" y2="6"/></svg> }
function IconInfo()     { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><circle cx="10" cy="10" r="8"/><line x1="10" y1="9" x2="10" y2="14"/><circle cx="10" cy="6.5" r="0.5" fill="currentColor"/></svg> }
function IconTree()     { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><circle cx="4" cy="10" r="2"/><circle cx="16" cy="5" r="2"/><circle cx="16" cy="15" r="2"/><line x1="6" y1="10" x2="10" y2="7"/><line x1="6" y1="10" x2="10" y2="13"/><line x1="10" y1="7" x2="14" y2="5"/><line x1="10" y1="13" x2="14" y2="15"/></svg> }
function IconFiles()    { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M4 2h8l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><polyline points="12,2 12,6 16,6"/></svg> }
function IconIO()       { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M5 10h10M10 5l5 5-5 5"/></svg> }
function IconSignal()   { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M3 17c1.5-1.5 3.5-2 4-4s-1-3-1-5 2-4 4-4 4 2 4 4-1 3-1 5 2.5 2.5 4 4"/></svg> }
function IconChevron()  { return Ic('M5 8l5 5 5-5', 12) }

export default function ProcessDetailPage() {
  const { pid } = useParams<{ pid: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const pidNum = Number(pid)

  const { processes } = useProcesses()
  const history       = useProcessHistory(pidNum)

  // Use passed state first for instant load, fall back to live list
  const stateProc = location.state as ProcessEntry | null
  const liveProc  = processes.find((p: ProcessEntry) => p.pid === pidNum)
  const proc      = liveProc ?? stateProc

  const [envOpen,   setEnvOpen]   = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [openFiles, setOpenFiles] = useState<Array<{ fd: number; path: string }>>([])
  const [envVars,   setEnvVars]   = useState<Array<{ k: string; v: string }>>([])

  // Fetch real open-files and env vars when pid changes
  useEffect(() => {
    if (!pidNum) return
    fetch(`/api/processes/${pidNum}/files`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.open_files) setOpenFiles(d.open_files) })
      .catch(() => {})
    fetch(`/api/processes/${pidNum}/environ`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.vars) setEnvVars(d.vars) })
      .catch(() => {})
  }, [pidNum])

  const sendSignal = (sig: string) => {
    setActionMsg(`Signal ${sig} sent to PID ${pidNum} (no-op — backend offline)`)
    setTimeout(() => setActionMsg(null), 3000)
  }

  if (!proc) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Process PID {pid} not found.
        <button onClick={() => navigate('/processes')} style={{ marginLeft: 12, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, display:'inline-flex', alignItems:'center', gap:4 }}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><polyline points="10,3 5,8 10,13"/></svg> Processes</button>
      </div>
    )
  }

  const c     = getC(proc.name)
  const files = openFiles.map(f => ({ fd: f.fd, type: inferFdType(f.path), path: f.path }))
  const lastH = history[history.length - 1]
  const uptimeStr = '5d 2h 14m'

  return (
    <div>
      {/* Breadcrumb */}
      <div className={styles.breadcrumb}>
        <button className={styles.breadcrumbLink} onClick={() => navigate('/processes')}>Processes</button>
        <span className={styles.breadcrumbSep}>›</span>
        <span className={styles.breadcrumbCurrent}>{proc.name}</span>
        <span className={styles.breadcrumbSep}>·</span>
        <span style={{ fontFamily: 'monospace', color: 'var(--color-text-dim)' }}>PID {proc.pid}</span>
      </div>

      {/* Hero */}
      <div className={styles.hero}>
        <div className={styles.heroAccent} style={{ background: `linear-gradient(90deg, ${c.fg}60, transparent)` }}/>
        <ProcessAvatar name={proc.name} cardSize={56} radius={12} />
        <div className={styles.heroInfo}>
          <div className={styles.heroName}>
            {proc.name}
            <span className={styles.pidBadge}>PID {proc.pid}</span>
          </div>
          <div className={styles.heroBadges}>
            <span className={`${styles.badge} ${styles.badgeGreen}`}>Sleeping</span>
            <span className={`${styles.badge} ${styles.badgeBlue}`}>{proc.user}</span>
            <span className={`${styles.badge} ${styles.badgePurple}`}>{proc.threads} threads</span>
            <span className={`${styles.badge} ${styles.badgeAmber}`}>{proc.fds} FDs</span>
          </div>
        </div>
        <div className={styles.heroRight}>
          <div className={styles.heroUptime}>Uptime {uptimeStr}</div>
          <div className={styles.heroCmdline} title={proc.cmdline}>{proc.cmdline}</div>
        </div>
      </div>

      {/* Signals */}
      <div className={styles.actions}>
        <span className={styles.actionsLabel}><IconSignal /> Signals</span>
        <button className={`${styles.actionBtn} ${styles.btnDanger}`}  onClick={() => sendSignal('SIGTERM')}>SIGTERM</button>
        <button className={`${styles.actionBtn} ${styles.btnKill}`}    onClick={() => sendSignal('SIGKILL')}>SIGKILL</button>
        <button className={`${styles.actionBtn} ${styles.btnAmber}`}   onClick={() => sendSignal('SIGHUP')}>SIGHUP</button>
        <button className={`${styles.actionBtn} ${styles.btnBlue}`}    onClick={() => sendSignal('SIGSTOP')}>SIGSTOP</button>
        <button className={`${styles.actionBtn} ${styles.btnGreen}`}   onClick={() => sendSignal('SIGCONT')}>SIGCONT</button>
        {actionMsg && <span className={styles.resultToast}>{actionMsg}</span>}
      </div>

      {/* Gauges + Quick Stats */}
      <div className={styles.gaugeRow}>
        <MiniGauge value={proc.cpu_pct} label="CPU" displayVal={`${proc.cpu_pct.toFixed(1)}%`} icon={<IconCPU />}/>
        <MiniGauge value={proc.mem_pct} label="Memory" displayVal={`${proc.mem_pct.toFixed(1)}%`} icon={<IconMem />}/>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}><IconInfo /> Quick Stats</span>
          </div>
          <div className={styles.statsGrid}>
            {[
              ['RSS',      formatBytes(proc.mem_rss)],
              ['Virtual',  formatBytes(proc.virt_bytes)],
              ['Shared',   formatBytes(proc.shr_bytes)],
              ['Threads',  String(proc.threads)],
              ['FDs',      String(proc.fds)],
              ['Nice',     String(proc.nice)],
              ['Priority', String(proc.priority)],
              ['CPU Time', proc.cpu_time],
            ].map(([k, v]) => (
              <div key={k} className={styles.statItem}>
                <div className={styles.statKey}>{k}</div>
                <div className={styles.statVal}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className={styles.row2} style={{ marginBottom: 10 }}>
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <span className={styles.chartTitle}>CPU History</span>
            {lastH && <span className={styles.chartVal} style={{ color: '#4a9eff' }}>{lastH.cpu.toFixed(1)}%</span>}
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={history} margin={{ top: 4, right: 2, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="detCpuG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#4a9eff" stopOpacity={0.35}/>
                  <stop offset="95%" stopColor="#4a9eff" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
              <XAxis dataKey="time" hide/>
              <YAxis domain={[0, 'auto']} tick={{ fontSize: 9, fill: 'var(--color-text-dim)' }} tickLine={false} axisLine={false}/>
              <Tooltip content={<ChartTip fmt={v => `${v.toFixed(1)}%`}/>}/>
              <Area type="monotoneX" dataKey="cpu" stroke="#4a9eff" strokeWidth={2} fill="url(#detCpuG)" dot={false} activeDot={{ r: 3, strokeWidth: 0 }}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <span className={styles.chartTitle}>I/O Throughput</span>
            {lastH && (
              <span style={{ display: 'flex', gap: 8, fontSize: 11, fontFamily: 'monospace' }}>
                <span style={{ color: '#22c55e' }}>↑ {formatBps(lastH.ioRead)}</span>
                <span style={{ color: '#a78bfa' }}>↓ {formatBps(lastH.ioWrite)}</span>
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={history} margin={{ top: 4, right: 2, left: -4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
              <XAxis dataKey="time" hide/>
              <YAxis tick={{ fontSize: 9, fill: 'var(--color-text-dim)' }} tickLine={false} axisLine={false} tickFormatter={v => formatBps(v)} width={50}/>
              <Tooltip content={<ChartTip fmt={formatBps}/>}/>
              <Line type="monotoneX" dataKey="ioRead"  stroke="#22c55e" strokeWidth={1.8} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} name="Read"/>
              <Line type="monotoneX" dataKey="ioWrite" stroke="#a78bfa" strokeWidth={1.8} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} name="Write"/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Process Info + Tree */}
      <div className={styles.row2} style={{ marginBottom: 10 }}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}><IconInfo /> Process Info</span>
          </div>
          <div className={styles.cardBody}>
            <table className={styles.infoTable}>
              <tbody>
                {[
                  ['Name',       proc.name],
                  ['PID',        String(proc.pid)],
                  ['Parent PID', String(proc.ppid)],
                  ['User',       proc.user],
                  ['Status',     'Sleeping (S)'],
                  ['CWD',        proc.cwd],
                  ['Started',    new Date(proc.started_at).toLocaleString()],
                  ['Uptime',     uptimeStr],
                  ['CPU Time',   proc.cpu_time],
                  ['Nice',       String(proc.nice)],
                  ['Priority',   String(proc.priority)],
                ].map(([k, v]) => (
                  <tr key={k} className={styles.infoTr}>
                    <td className={`${styles.infoTd} ${styles.infoKey}`}>{k}</td>
                    <td className={`${styles.infoTd} ${styles.infoVal}`}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}><IconTree /> Process Tree</span>
          </div>
          <div className={styles.cardBody}>
            {/* Parent */}
            <div className={styles.treeNode}>
              <span className={styles.treeLine}></span>
              <ProcessAvatar name="systemd" cardSize={28} />
              <div>
                <div className={styles.treeName} style={{ color: 'var(--color-text-muted)' }}>systemd</div>
                <div style={{ fontSize: 10, color: 'var(--color-text-dim)', fontFamily: 'monospace' }}>parent</div>
              </div>
              <span className={styles.treePid}>PID 1</span>
            </div>
            {/* Self */}
            <div className={styles.treeNode} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
              <span className={styles.treeLine} style={{ color: c.fg }}>└</span>
              <ProcessAvatar name={proc.name} cardSize={28} />
              <div>
                <div className={styles.treeName} style={{ color: c.fg }}>{proc.name}</div>
                <div style={{ fontSize: 10, color: 'var(--color-text-dim)', fontFamily: 'monospace' }}>current</div>
              </div>
              <span className={styles.treePid}>PID {proc.pid}</span>
            </div>
            {/* Children */}
            {proc.children_pids.map((cpid, i) => (
              <div key={cpid} className={styles.treeNode} style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/processes/${cpid}`)}>
                <span className={styles.treeLine} style={{ paddingLeft: 14, color: 'var(--color-text-dim)' }}>
                  {i === proc.children_pids.length - 1 ? '└' : '├'}
                </span>
                <ProcessAvatar name={proc.name} cardSize={28} color="var(--color-text-dim)" />
                <div>
                  <div className={styles.treeName} style={{ color: 'var(--color-text-muted)' }}>{proc.name} worker</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-dim)', fontFamily: 'monospace' }}>child</div>
                </div>
                <span className={styles.treePid} style={{ color: 'var(--color-accent)' }}>PID {cpid}</span>
              </div>
            ))}
            {proc.children_pids.length === 0 && (
              <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--color-text-dim)' }}>No child processes.</div>
            )}
          </div>
        </div>
      </div>

      {/* Open Files */}
      <div className={styles.card} style={{ marginBottom: 10 }}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}><IconFiles /> Open File Descriptors</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{proc.fds} total</span>
        </div>
        <table className={styles.filesTable}>
          <thead>
            <tr>
              <th className={styles.filesTh}>FD</th>
              <th className={styles.filesTh}>Type</th>
              <th className={styles.filesTh}>Path / Inode</th>
            </tr>
          </thead>
          <tbody>
            {files.map(f => (
              <tr key={f.fd} className={styles.filesRow}>
                <td className={styles.filesTd}>{f.fd}</td>
                <td className={styles.filesTd}>
                  <span className={`${styles.fileType} ${f.type === 'SOCK' ? styles.typeSocket : f.type === 'PIPE' ? styles.typePipe : styles.typeFile}`}>
                    {f.type}
                  </span>
                </td>
                <td className={styles.filesTd}>{f.path}</td>
              </tr>
            ))}
            {proc.fds > files.length && (
              <tr className={styles.filesRow}>
                <td colSpan={3} className={styles.filesTd} style={{ color: 'var(--color-text-dim)', textAlign: 'center' }}>
                  …and {proc.fds - files.length} more
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Environment Variables */}
      <div className={styles.accordion}>
        <div className={styles.accordionHead} onClick={() => setEnvOpen(v => !v)}>
          <span className={styles.accordionTitle}>
            <IconIO /> Environment Variables
            <span style={{ fontSize: 10, color: 'var(--color-text-dim)', fontWeight: 400 }}>({envVars.length} shown)</span>
          </span>
          <span className={`${styles.accordionChevron} ${envOpen ? styles.accordionChevronOpen : ''}`}>
            <IconChevron />
          </span>
        </div>
        {envOpen && (
          <div className={styles.accordionBody}>
            {envVars.map(e => (
              <div key={e.k} className={styles.envRow}>
                <span className={styles.envKey}>{e.k}</span>
                <span className={styles.envVal}>{e.v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
