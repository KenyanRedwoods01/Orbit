import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchApp, fetchAppStatus, fetchAppLogs, fetchAppPreflight,
  installApp, uninstallApp, controlApp,
  type AppResponse, type AppPreflightResult, type AppLogEntry,
} from '@/lib/api'
import styles from './AppsPage.module.css'

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoBack    = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="10,3 5,8 10,13"/></svg>
const IcoPlay    = () => <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11"><polygon points="5,3 17,10 5,17"/></svg>
const IcoStop    = () => <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11"><rect x="4" y="4" width="12" height="12" rx="1.5"/></svg>
const IcoRefresh = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M17 10a7 7 0 0 1-7 7 7 7 0 0 1-5-2"/><polyline points="2,10 3,15 8,14"/></svg>
const IcoTrash   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><polyline points="3,6 17,6"/><path d="M8 6V4h4v2"/><rect x="4" y="6" width="12" height="12" rx="1.5"/></svg>
const IcoLink    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M11 3h6v6"/><path d="M17 3l-7 7"/><path d="M9 5H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-4"/></svg>
const IcoCopy    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><rect x="8" y="8" width="9" height="9" rx="1.5"/><path d="M3 12V4a1 1 0 0 1 1-1h8"/></svg>
const IcoCheck   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><polyline points="4,10 8,14 16,6"/></svg>
const IcoPackage = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M10 2l7 4v8l-7 4-7-4V6z"/><polyline points="3.27,6.96 10,11.01 16.73,6.96"/><line x1="10" y1="11" x2="10" y2="18"/></svg>
const IcoWarn    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M10 2l8 16H2z"/><line x1="10" y1="9" x2="10" y2="13"/><circle cx="10" cy="15.5" r=".6" fill="currentColor" stroke="none"/></svg>

const CAT_META: Record<string, { label: string; color: string }> = {
  'Platform as a Service':  { label: 'PaaS',             color: '#4a9eff' },
  'Container Management':   { label: 'Containers',       color: '#a78bfa' },
  'Reverse Proxy':          { label: 'Reverse Proxy',    color: '#f6ad55' },
  'Database':               { label: 'Database',         color: '#68d391' },
  'CI/CD':                  { label: 'CI/CD',            color: '#f687b3' },
}

const STATUS_CFG = {
  not_installed: { label: 'Not Installed', color: 'var(--color-text-dim)', bg: 'var(--color-surface)', border: 'var(--color-border)', dot: '#666' },
  installing:    { label: 'Installing…',   color: '#63b3ed', bg: 'rgba(99,179,237,0.12)', border: 'rgba(99,179,237,0.3)', dot: '#63b3ed' },
  running:       { label: 'Running',       color: '#68d391', bg: 'rgba(104,211,145,0.12)', border: 'rgba(104,211,145,0.3)', dot: '#68d391' },
  stopped:       { label: 'Stopped',       color: '#f6ad55', bg: 'rgba(246,173,85,0.10)', border: 'rgba(246,173,85,0.25)', dot: '#f6ad55' },
  error:         { label: 'Error',         color: '#ff4d4d', bg: 'rgba(255,77,77,0.12)', border: 'rgba(255,77,77,0.3)', dot: '#ff4d4d' },
} as const

function getStatusCfg(s: string) {
  return STATUS_CFG[s as keyof typeof STATUS_CFG] ?? STATUS_CFG['not_installed']
}

function AppIcon({ appId, color, size = 28 }: { appId: string; color: string; size?: number }) {
  const p = { width: size, height: size, stroke: color, fill: 'none', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (['coolify','dokploy','caprover','easypanel'].includes(appId))
    return <svg viewBox="0 0 20 20" {...p}><path d="M10 2l7 4v4a7 7 0 0 1-7 8 7 7 0 0 1-7-8V6z"/><polyline points="7,10 9,12 13,8"/></svg>
  if (['portainer','dockge','yacht'].includes(appId))
    return <svg viewBox="0 0 20 20" {...p}><rect x="2" y="9" width="3" height="3" rx=".5"/><rect x="6" y="9" width="3" height="3" rx=".5"/><rect x="10" y="9" width="3" height="3" rx=".5"/><rect x="10" y="5" width="3" height="3" rx=".5"/><rect x="6" y="5" width="3" height="3" rx=".5"/><path d="M18 11c0 0-.5-2-3.5-2"/><path d="M2.5 11c0 2.2 1.5 5 7.5 5s8-2.8 8-5"/></svg>
  if (['traefik','nginx-proxy-manager','caddy'].includes(appId))
    return <svg viewBox="0 0 20 20" {...p}><circle cx="10" cy="10" r="8"/><polyline points="4,10 8,6 12,10 16,6"/></svg>
  if (['postgresql','redis'].includes(appId))
    return <svg viewBox="0 0 20 20" {...p}><ellipse cx="10" cy="6" rx="7" ry="2.5"/><path d="M3 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/><path d="M3 10v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4"/></svg>
  return <svg viewBox="0 0 20 20" {...p}><circle cx="6" cy="5" r="2"/><circle cx="14" cy="5" r="2"/><circle cx="10" cy="15" r="2"/><line x1="6" y1="7" x2="10" y2="13"/><line x1="14" y1="7" x2="10" y2="13"/></svg>
}

type Tab = 'overview' | 'logs' | 'install'

export default function AppDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc       = useQueryClient()

  const [tab, setTab]           = useState<Tab>('overview')
  const [port, setPort]         = useState<number>(0)
  const [copied, setCopied]     = useState(false)
  const [uninstallConfirm, setUninstallConfirm] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const { data: app, isLoading } = useQuery({
    queryKey: ['apps', id],
    queryFn: () => fetchApp(id!),
    refetchInterval: (q) => {
      const status = (q.state.data as AppResponse | undefined)?.status
      return status === 'installing' ? 2000 : 15000
    },
    enabled: !!id,
  })

  const { data: preflight } = useQuery({
    queryKey: ['apps', id, 'preflight'],
    queryFn: () => fetchAppPreflight(id!),
    enabled: !!id && tab === 'install' && app?.status === 'not_installed',
    staleTime: 30000,
  })

  const { data: logs = [], refetch: refetchLogs } = useQuery({
    queryKey: ['apps', id, 'logs'],
    queryFn: () => fetchAppLogs(id!, 300),
    enabled: !!id && tab === 'logs',
    refetchInterval: tab === 'logs' ? 5000 : false,
  })

  // Live status poll when installing
  const { data: liveStatus } = useQuery({
    queryKey: ['apps', id, 'status'],
    queryFn: () => fetchAppStatus(id!),
    enabled: !!id && app?.status === 'installing',
    refetchInterval: 2500,
  })
  useEffect(() => {
    if (liveStatus && liveStatus.status !== 'installing') {
      qc.invalidateQueries({ queryKey: ['apps', id] })
      qc.invalidateQueries({ queryKey: ['apps'] })
    }
  }, [liveStatus?.status])

  useEffect(() => {
    if (app && port === 0) setPort(app.port || app.default_port)
  }, [app])

  // Scroll logs to bottom
  useEffect(() => {
    if (tab === 'logs' && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs, tab])

  const installM = useMutation({
    mutationFn: () => installApp(id!, { port }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['apps', id] }); setTab('logs') },
  })

  const uninstallM = useMutation({
    mutationFn: () => uninstallApp(id!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['apps', id] }); qc.invalidateQueries({ queryKey: ['apps'] }); setUninstallConfirm(false) },
  })

  const controlM = useMutation({
    mutationFn: (action: string) => controlApp(id!, action),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['apps', id] }) },
  })

  function copyCmd() {
    if (!app) return
    navigator.clipboard.writeText(app.install_command).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  if (isLoading) return (
    <div className={styles.detailPage}>
      <div className={styles.backLink} onClick={() => navigate('/apps')}><IcoBack /> Apps</div>
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-dim)' }}>Loading…</div>
    </div>
  )

  if (!app) return (
    <div className={styles.detailPage}>
      <div className={styles.backLink} onClick={() => navigate('/apps')}><IcoBack /> Apps</div>
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-dim)' }}>App not found.</div>
    </div>
  )

  const meta   = CAT_META[app.category] ?? { label: app.category, color: '#4a9eff' }
  const scfg   = getStatusCfg(app.status)
  const color  = meta.color
  const isRunning    = app.status === 'running'
  const isStopped    = app.status === 'stopped'
  const isInstalling = app.status === 'installing'
  const isInstalled  = app.status !== 'not_installed'
  const activePort   = port || app.default_port

  return (
    <div className={styles.detailPage}>
      <div className={styles.backLink} onClick={() => navigate('/apps')}><IcoBack /> Apps</div>

      {/* Header */}
      <div className={styles.detailHeader}>
        <div className={styles.detailIconWrap} style={{ background: color + '1e' }}>
          <AppIcon appId={app.id} color={color} size={30} />
        </div>
        <div className={styles.detailMeta}>
          <div className={styles.detailName}>{app.name}</div>
          <div className={styles.detailTagline}>{app.tagline}</div>
          <div className={styles.detailVerRow}>
            <span className={styles.detailVer}>v{app.version}</span>
            <span className={styles.detailVer}>·</span>
            <span className={styles.detailVer}>{app.author}</span>
            <span className={styles.detailVer}>·</span>
            <span className={styles.detailVer}>{app.license}</span>
            <span className={styles.detailBadge} style={{ background: color + '18', color }}>{meta.label}</span>
            <span className={styles.statusChip} style={{ background: scfg.bg, color: scfg.color, border: `1px solid ${scfg.border}` }}>
              <span className={styles.statusDot} style={{ background: scfg.dot }} />
              {scfg.label}
            </span>
          </div>

          <div className={styles.detailActions}>
            {!isInstalled && !isInstalling && (
              <button className={styles.btnPrimary} onClick={() => setTab('install')}>
                <IcoPackage /> Install
              </button>
            )}
            {isInstalling && (
              <button className={styles.btnPrimary} disabled>
                <div style={{ width: 10, height: 10, border: '2px solid rgba(74,158,255,0.3)', borderTopColor: '#4a9eff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                Installing…
              </button>
            )}
            {isStopped && (
              <button className={styles.btnSuccess} onClick={() => controlM.mutate('start')}>
                <IcoPlay /> Start
              </button>
            )}
            {isRunning && (
              <button className={styles.btnWarning} onClick={() => controlM.mutate('stop')}>
                <IcoStop /> Stop
              </button>
            )}
            {isInstalled && !isInstalling && (
              <button className={styles.btnSecondary} onClick={() => controlM.mutate('restart')}>
                <IcoRefresh /> Restart
              </button>
            )}
            <button className={styles.btnSecondary} onClick={() => window.open(app.website, '_blank')}>
              <IcoLink /> Website
            </button>
            <button className={styles.btnSecondary} onClick={() => window.open(app.github, '_blank')}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M10 2a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.32c-2.23.49-2.7-1.07-2.7-1.07a2.12 2.12 0 0 0-.89-1.17c-.73-.5.06-.49.06-.49a1.68 1.68 0 0 1 1.23.83 1.7 1.7 0 0 0 2.33.67 1.71 1.71 0 0 1 .51-1.08c-1.78-.2-3.65-.89-3.65-3.97a3.1 3.1 0 0 1 .83-2.16 2.9 2.9 0 0 1 .08-2.13s.67-.21 2.2.82a7.64 7.64 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82a2.9 2.9 0 0 1 .08 2.13 3.1 3.1 0 0 1 .83 2.16c0 3.09-1.87 3.77-3.66 3.97a1.91 1.91 0 0 1 .55 1.49v2.2c0 .21.14.46.55.38A8 8 0 0 0 10 2z"/></svg>
              GitHub
            </button>
            {isInstalled && (
              <>
                {!uninstallConfirm
                  ? <button className={styles.btnDanger} onClick={() => setUninstallConfirm(true)}><IcoTrash /> Uninstall</button>
                  : <button className={styles.btnDanger} onClick={() => uninstallM.mutate()}>
                      {uninstallM.isPending ? 'Uninstalling…' : 'Confirm Uninstall'}
                    </button>
                }
              </>
            )}
          </div>
        </div>

        <div className={styles.detailHeaderRight}>
          <div className={styles.portBadge}>:{activePort}</div>
          {isRunning && (
            <button className={styles.openLink} onClick={() => window.open(`http://localhost:${activePort}`, '_blank')}>
              Open in browser
            </button>
          )}
        </div>
      </div>

      {/* Installing banner */}
      {isInstalling && (
        <div className={styles.installBanner}>
          <div className={styles.installSpinner} />
          <div className={styles.installText}>
            <div className={styles.installTitle}>Installing {app.name}…</div>
            <div className={styles.installSub}>The installation is running on your server. Logs will appear when complete.</div>
          </div>
        </div>
      )}

      {/* Error banner */}
      {app.status === 'error' && app.error && (
        <div className={styles.notInstalledBanner} style={{ borderColor: 'rgba(255,77,77,0.3)' }}>
          <IcoWarn />
          <div className={styles.notInstalledText}>
            <div className={styles.notInstalledTitle} style={{ color: '#ff4d4d' }}>Installation failed</div>
            <div className={styles.notInstalledSub}>{app.error}</div>
          </div>
          <button className={styles.btnPrimary} onClick={() => setTab('install')}>Retry</button>
        </div>
      )}

      {/* Tab bar */}
      <div className={styles.tabBar}>
        {([['overview', 'Overview'], ['logs', 'Logs'], ['install', 'Install']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <>
          <div className={styles.cardGrid}>
            {/* Features */}
            <div className={styles.card}>
              <div className={styles.cardTitle}>Features</div>
              <div className={styles.featureListCard}>
                {app.features.map(f => (
                  <div key={f} className={styles.featureItemCard}>
                    <div className={styles.featureCheckCard} style={{ background: color + '20' }}>
                      <svg viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="10" height="10"><polyline points="4,10 8,14 16,6"/></svg>
                    </div>
                    {f}
                  </div>
                ))}
              </div>
            </div>

            {/* Requirements & Ports */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className={styles.card}>
                <div className={styles.cardTitle}>System Requirements</div>
                <div className={styles.reqGrid}>
                  <div className={styles.reqItem}>
                    <div className={styles.reqVal} style={{ color }}>{app.min_ram_mb >= 1024 ? `${app.min_ram_mb / 1024}GB` : `${app.min_ram_mb}MB`}</div>
                    <div className={styles.reqLbl}>Min RAM</div>
                  </div>
                  <div className={styles.reqItem}>
                    <div className={styles.reqVal} style={{ color }}>{app.min_cpu}</div>
                    <div className={styles.reqLbl}>CPU Cores</div>
                  </div>
                  <div className={styles.reqItem}>
                    <div className={styles.reqVal} style={{ color }}>{app.min_disk_gb}GB</div>
                    <div className={styles.reqLbl}>Disk Space</div>
                  </div>
                </div>
                <div className={styles.portList}>
                  {app.required_ports.map(p => (
                    <span key={p} className={styles.portChip}>:{p}</span>
                  ))}
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardTitle}>App Info</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { k: 'Author', v: app.author },
                    { k: 'License', v: app.license },
                    { k: 'Version', v: `v${app.version}` },
                    { k: 'Install', v: app.install_method },
                    { k: 'Default Port', v: `:${app.default_port}` },
                    ...(app.docker_image ? [{ k: 'Docker Image', v: app.docker_image }] : []),
                  ].map(r => (
                    <div key={r.k} className={styles.infoRow}>
                      <span className={styles.infoKey}>{r.k}</span>
                      <span className={styles.infoVal}>{r.v}</span>
                    </div>
                  ))}
                  <div className={styles.infoRow}>
                    <span className={styles.infoKey}>Website</span>
                    <span className={styles.infoLink} onClick={() => window.open(app.website, '_blank')}>{app.website}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoKey}>Docs</span>
                    <span className={styles.infoLink} onClick={() => window.open(app.docs, '_blank')}>{app.docs}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Tags</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {app.tags.map(t => (
                <span key={t} style={{ fontSize: 11.5, padding: '3px 9px', background: 'var(--color-bg,#0d1117)', border: '1px solid var(--color-border)', borderRadius: 5, color: 'var(--color-text-dim)' }}>{t}</span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Logs tab ── */}
      {tab === 'logs' && (
        <div className={styles.card}>
          <div className={styles.cardTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span>Container / Service Logs</span>
            <button className={styles.btnSecondary} style={{ fontSize: 11, padding: '4px 9px' }} onClick={() => refetchLogs()}>
              <IcoRefresh /> Refresh
            </button>
          </div>
          {logs.length === 0 ? (
            <div style={{ color: 'var(--color-text-dim)', fontSize: 12.5, padding: '20px 0' }}>
              {isInstalled ? 'No logs available. Container may still be starting.' : 'App is not installed. No logs to show.'}
            </div>
          ) : (
            <div className={styles.logBlock} ref={logRef}>
              {logs.map((l, i) => (
                <div key={i} className={styles.logLineFull}>{l.line}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Install tab ── */}
      {tab === 'install' && (
        <>
          {/* Preflight checks */}
          {preflight && (
            <div className={styles.preflightBanner}>
              <div className={styles.preflightTitle}>
                Pre-flight Checks — {preflight.all_passed ? 'All checks passed' : 'Some checks failed'}
              </div>
              <div className={styles.preflightList}>
                {preflight.checks.map(c => (
                  <div key={c.name} className={styles.preflightItem}>
                    <div className={styles.preflightIcon} style={{ background: c.passed ? 'rgba(104,211,145,0.15)' : 'rgba(255,77,77,0.15)' }}>
                      {c.passed
                        ? <svg viewBox="0 0 20 20" fill="none" stroke="#68d391" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="11" height="11"><polyline points="4,10 8,14 16,6"/></svg>
                        : <svg viewBox="0 0 20 20" fill="none" stroke="#ff4d4d" strokeWidth="2.5" strokeLinecap="round" width="11" height="11"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
                      }
                    </div>
                    <span className={styles.preflightLabel}>{c.name}</span>
                    <span className={styles.preflightDetail}>{c.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Port configuration */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Port Configuration</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span style={{ fontSize: 12.5, color: 'var(--color-text-dim)' }}>Web UI port:</span>
              <input
                className={styles.portInput}
                type="number"
                value={port || app.default_port}
                min={1}
                max={65535}
                onChange={e => setPort(Number(e.target.value))}
              />
              <span style={{ fontSize: 11.5, color: 'var(--color-text-dim)' }}>
                Default: {app.default_port}{app.health_endpoint ? ` · Health: ${app.health_endpoint}` : ''}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 14 }}>
              Required ports: {app.required_ports.join(', ') || 'None'}
            </div>
          </div>

          {/* Install command */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Install Command</div>
            <div className={styles.cmdBlock}>{app.install_command}</div>
            <div className={styles.cmdCopyRow}>
              <button className={styles.btnSecondary} style={{ fontSize: 11.5, padding: '5px 11px' }} onClick={copyCmd}>
                {copied ? <><IcoCheck />Copied!</> : <><IcoCopy />Copy</>}
              </button>
            </div>
          </div>

          {/* Install action */}
          {!isInstalling && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className={styles.btnPrimary}
                style={{ fontSize: 13, padding: '9px 20px' }}
                disabled={installM.isPending}
                onClick={() => installM.mutate()}
              >
                <IcoPackage />
                {installM.isPending ? 'Starting…' : `Install ${app.name}`}
              </button>
              {installM.isError && (
                <span style={{ fontSize: 12, color: '#ff4d4d', alignSelf: 'center' }}>
                  {String(installM.error)}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
