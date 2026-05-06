import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchCsStatus, fetchCsAlerts, fetchCsDecisions, fetchCsBouncers,
  fetchCsHub, fetchCsMetrics, fetchCsLogs, fetchCsConfig, fetchCsAcquis,
  csAddDecision, csDeleteDecision, csDeleteDecisionByIP,
  csService, csHubUpdate, csHubUpgrade,
  csInstallCollection, csRemoveCollection,
  csSaveConfig, csSaveAcquis, csAllowlistAdd, csInstall,
  fetchPlugins,
} from '@/lib/api'
import styles from './CrowdSecPage.module.css'

// ── Icons ──────────────────────────────────────────────────────────────────────
const IcoBack    = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="10,3 5,8 10,13"/></svg>
const IcoCrowd  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><circle cx="7" cy="7" r="3"/><circle cx="14" cy="7" r="3"/><path d="M1 18c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M13 12a5 5 0 0 1 6 6"/></svg>
const IcoBan    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" width="12" height="12"><circle cx="10" cy="10" r="7"/><line x1="4.2" y1="4.2" x2="15.8" y2="15.8"/></svg>
const IcoUnban  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><polyline points="4,10 8,14 16,6"/></svg>
const IcoPlay   = () => <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11"><polygon points="5,3 17,10 5,17"/></svg>
const IcoStop   = () => <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11"><rect x="4" y="4" width="12" height="12" rx="1.5"/></svg>
const IcoRefresh= () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M17 10a7 7 0 0 1-7 7 7 7 0 0 1-5-2"/><polyline points="2,10 3,15 8,14"/></svg>
const IcoPackage= () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M10 2l7 4v8l-7 4-7-4V6z"/></svg>
const IcoPlus   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><line x1="10" y1="3" x2="10" y2="17"/><line x1="3" y1="10" x2="17" y2="10"/></svg>
const IcoTrash  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><polyline points="3,6 17,6"/><path d="M8 6V4h4v2"/><rect x="4" y="6" width="12" height="12" rx="1.5"/></svg>
const IcoSave   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><path d="M17 17H3V3h10l4 4z"/><rect x="7" y="11" width="6" height="6" rx=".5"/><rect x="6" y="3" width="7" height="4" rx=".5"/></svg>
const IcoHub    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><circle cx="10" cy="10" r="2"/><circle cx="3" cy="5" r="1.5"/><circle cx="17" cy="5" r="1.5"/><circle cx="3" cy="15" r="1.5"/><circle cx="17" cy="15" r="1.5"/><line x1="4" y1="5.5" x2="9" y2="9"/><line x1="16" y1="5.5" x2="11" y2="9"/><line x1="4" y1="14.5" x2="9" y2="11"/><line x1="16" y1="14.5" x2="11" y2="11"/></svg>

type Tab = 'overview' | 'decisions' | 'alerts' | 'bouncers' | 'hub' | 'config' | 'logs'

function Dot({ color }: { color: string }) {
  return <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%', background:color, marginRight:5, flexShrink:0 }} />
}

function HubStatusBadge({ status }: { status: string }) {
  const color = status === 'up-to-date' ? '#68d391'
    : status === 'update-available' ? '#f6ad55'
    : status === 'enabled' ? '#68d391'
    : '#ff4d4d'
  return <span style={{ fontSize:10, padding:'1px 6px', borderRadius:10, background: color+'18', color, border:`1px solid ${color}30` }}>{status}</span>
}

export default function CrowdSecPage() {
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const [tab, setTab]         = useState<Tab>('overview')
  const { data: allPlugins = [] } = useQuery({ queryKey: ['plugins'], queryFn: fetchPlugins, staleTime: 60000 })
  const csPlugin = allPlugins.find(p => p.plugin_id === 'crowdsec' || p.plugin_id.startsWith('crowdsec'))
  const pluginWarning = csPlugin
    ? (csPlugin.install_status === 'not_installed' ? 'not_installed' : !csPlugin.enabled ? 'disabled' : null)
    : null
  const [banIP, setBanIP]     = useState('')
  const [banDur, setBanDur]   = useState('4h')
  const [banReason, setBanReason] = useState('')
  const [rawCfg, setRawCfg]   = useState('')
  const [rawAcquis, setRawAcquis] = useState('')
  const [cfgPath, setCfgPath] = useState('/etc/crowdsec/config.yaml')
  const [hubSearch, setHubSearch] = useState('')
  const [toast, setToast]     = useState<string | null>(null)
  const [installLog, setInstallLog] = useState<string | null>(null)
  const [hubType, setHubType] = useState<string>('all')
  const [collectionInput, setCollectionInput] = useState('')
  const toastRef = useRef<ReturnType<typeof setTimeout>>()

  const showToast = (msg: string) => {
    setToast(msg)
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), 3200)
  }

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['cs-status'], queryFn: fetchCsStatus, refetchInterval: 10000,
  })
  const { data: decisions = [] } = useQuery({
    queryKey: ['cs-decisions'], queryFn: fetchCsDecisions, refetchInterval: 15000,
    enabled: status?.installed,
  })
  const { data: alerts = [] } = useQuery({
    queryKey: ['cs-alerts'], queryFn: () => fetchCsAlerts(100), refetchInterval: 20000,
    enabled: tab === 'alerts' && status?.installed,
  })
  const { data: bouncers = [] } = useQuery({
    queryKey: ['cs-bouncers'], queryFn: fetchCsBouncers, refetchInterval: 30000,
    enabled: tab === 'bouncers' && status?.installed,
  })
  const { data: hubItems = [] } = useQuery({
    queryKey: ['cs-hub', hubType], queryFn: () => fetchCsHub(hubType === 'all' ? undefined : hubType),
    enabled: tab === 'hub' && status?.installed,
  })
  const { data: metrics } = useQuery({
    queryKey: ['cs-metrics'], queryFn: fetchCsMetrics, refetchInterval: 30000,
    enabled: status?.installed,
  })
  const { data: logs = [] } = useQuery({
    queryKey: ['cs-logs'], queryFn: () => fetchCsLogs(200), refetchInterval: 20000,
    enabled: tab === 'logs' && status?.installed,
  })
  const { data: cfg } = useQuery({
    queryKey: ['cs-config'], queryFn: fetchCsConfig, enabled: tab === 'config',
  })
  const { data: acquis } = useQuery({
    queryKey: ['cs-acquis'], queryFn: fetchCsAcquis, enabled: tab === 'config',
  })

  useEffect(() => {
    if (cfg?.raw && !rawCfg) { setRawCfg(cfg.raw); if (cfg.path) setCfgPath(cfg.path) }
  }, [cfg])
  useEffect(() => {
    if (acquis?.raw && !rawAcquis) setRawAcquis(acquis.raw)
  }, [acquis])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cs-status'] })
    qc.invalidateQueries({ queryKey: ['cs-decisions'] })
  }

  const mutService = useMutation({
    mutationFn: (action: string) => csService(action),
    onSuccess: (r, action) => { showToast(r.ok ? `Service ${action}ed` : 'Error: ' + r.output); setTimeout(invalidate, 1500) },
  })
  const mutAddDecision = useMutation({
    mutationFn: () => csAddDecision({ ip: banIP, duration: banDur, reason: banReason || 'Manual ban via Orbit VPS' }),
    onSuccess: (r) => { showToast(r.ok ? `${banIP} banned for ${banDur}` : 'Error: ' + r.output); setBanIP(''); invalidate() },
  })
  const mutDelDecision = useMutation({
    mutationFn: (id: number) => csDeleteDecision(id),
    onSuccess: () => { showToast('Decision deleted'); invalidate() },
  })
  const mutDelByIP = useMutation({
    mutationFn: (ip: string) => csDeleteDecisionByIP(ip),
    onSuccess: () => { showToast('All decisions for IP removed'); invalidate() },
  })
  const mutHubUpdate = useMutation({
    mutationFn: csHubUpdate,
    onSuccess: (r) => { showToast(r.ok ? 'Hub updated' : 'Error: ' + r.output); qc.invalidateQueries({ queryKey: ['cs-hub'] }) },
  })
  const mutHubUpgrade = useMutation({
    mutationFn: csHubUpgrade,
    onSuccess: (r) => { showToast(r.ok ? 'Hub upgraded' : 'Error: ' + r.output); qc.invalidateQueries({ queryKey: ['cs-hub'] }) },
  })
  const mutInstallCollection = useMutation({
    mutationFn: (name: string) => csInstallCollection(name),
    onSuccess: (r) => { showToast(r.ok ? 'Collection installed' : 'Error: ' + r.output); setCollectionInput(''); qc.invalidateQueries({ queryKey: ['cs-hub'] }) },
  })
  const mutRemoveCollection = useMutation({
    mutationFn: (name: string) => csRemoveCollection(name),
    onSuccess: (r) => { showToast(r.ok ? 'Collection removed' : 'Error removing collection'); qc.invalidateQueries({ queryKey: ['cs-hub'] }) },
  })
  const mutSaveCfg = useMutation({
    mutationFn: () => csSaveConfig(rawCfg, cfgPath),
    onSuccess: (r) => showToast(r.ok ? 'Config saved & reloaded' : 'Save failed'),
  })
  const mutSaveAcquis = useMutation({
    mutationFn: () => csSaveAcquis(rawAcquis),
    onSuccess: (r) => showToast(r.ok ? 'Acquis saved & reloaded' : 'Save failed'),
  })
  const mutInstall = useMutation({
    mutationFn: csInstall,
    onSuccess: (r) => {
      setInstallLog(r.output)
      if (r.ok) { showToast('CrowdSec installed!'); invalidate() }
      else showToast('Install failed — see log')
    },
  })

  const isRunning  = status?.running ?? false
  const totalBans  = decisions.length || status?.total_decisions || 0

  if (statusLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.backLink} onClick={() => navigate('/plugins')}><IcoBack /> Plugins</div>
        <div className={styles.loading}>Loading CrowdSec…</div>
      </div>
    )
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview',  label: 'Overview' },
    { id: 'decisions', label: `Decisions (${totalBans})` },
    { id: 'alerts',    label: `Alerts (${alerts.length})` },
    { id: 'bouncers',  label: `Bouncers (${bouncers.length})` },
    { id: 'hub',       label: 'Hub' },
    { id: 'config',    label: 'Config' },
    { id: 'logs',      label: 'Logs' },
  ]

  const logColor = (level: string) =>
    level === 'error' || level === 'fatal' ? '#ff4d4d'
    : level === 'warn' || level === 'warning' ? '#f6ad55'
    : 'rgba(255,255,255,0.35)'

  const filteredHub = hubItems.filter(h =>
    !hubSearch || h.name.toLowerCase().includes(hubSearch.toLowerCase()) || h.description?.toLowerCase().includes(hubSearch.toLowerCase())
  )

  const originColor = (origin: string) =>
    origin === 'crowdsec' ? '#a78bfa' : origin === 'CAPI' ? '#63b3ed' : origin === 'lists' ? '#68d391' : '#f6ad55'

  const banTypeColors: Record<string, string> = { ban: '#ff4d4d', captcha: '#f6ad55', throttle: '#63b3ed' }

  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <div className={styles.backLink} onClick={() => navigate('/plugins')}><IcoBack /> Plugins</div>

      {/* Plugin status warning */}
      {pluginWarning && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', marginBottom:4, borderRadius:7, border:'1px solid', fontSize:12.5, lineHeight:1.45,
          background: pluginWarning === 'not_installed' ? 'rgba(246,173,85,0.08)' : 'rgba(255,77,77,0.07)',
          borderColor: pluginWarning === 'not_installed' ? 'rgba(246,173,85,0.3)' : 'rgba(255,77,77,0.25)',
          color: pluginWarning === 'not_installed' ? '#f6ad55' : '#ff8080' }}>
          <IcoPackage />
          <div>
            <strong>CrowdSec plugin {pluginWarning === 'not_installed' ? 'not installed' : 'is disabled'}.</strong>
            {' '}{pluginWarning === 'not_installed'
              ? 'Install it from the Plugins page to enable full integration.'
              : 'Enable it in the Plugins page to restore full integration.'}
          </div>
          <button onClick={() => navigate('/plugins')}
            style={{ marginLeft:'auto', background:'none', border:'1px solid currentColor', borderRadius:6, padding:'3px 10px', fontSize:11, cursor:'pointer', color:'inherit', whiteSpace:'nowrap' }}>
            Go to Plugins
          </button>
        </div>
      )}

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerIcon}><IcoCrowd />CS</div>
        <div className={styles.headerMeta}>
          <div className={styles.headerTitle}>CrowdSec</div>
          <div className={styles.headerSub}>
            {status?.installed
              ? <>{status.version || '1.x'} · Collaborative threat intelligence · LAPI: {status.api_url}</>
              : <>Not installed</>
            }
          </div>
          <div className={styles.headerBadges}>
            {status?.installed ? (
              <>
                <span className={styles.badge} style={{ background: isRunning ? 'rgba(104,211,145,0.12)' : 'rgba(255,77,77,0.12)', color: isRunning ? '#68d391' : '#ff4d4d', border: `1px solid ${isRunning ? 'rgba(104,211,145,0.3)' : 'rgba(255,77,77,0.3)'}` }}>
                  <Dot color={isRunning ? '#68d391' : '#ff4d4d'} />
                  {isRunning ? 'Running' : 'Stopped'}
                </span>
                <span className={styles.badge} style={{ background: status.api_running ? 'rgba(104,211,145,0.08)' : 'rgba(255,77,77,0.08)', color: status.api_running ? '#68d391' : '#ff6b6b', border: `1px solid ${status.api_running ? 'rgba(104,211,145,0.25)' : 'rgba(255,77,77,0.25)'}` }}>
                  LAPI {status.api_running ? 'Up' : 'Down'}
                </span>
                <span className={styles.badge} style={{ background: 'rgba(255,77,77,0.08)', color: '#ff8c00', border: '1px solid rgba(255,77,77,0.2)' }}>
                  {totalBans} decisions
                </span>
              </>
            ) : (
              <span className={styles.badge} style={{ background: 'rgba(246,173,85,0.12)', color: '#f6ad55', border: '1px solid rgba(246,173,85,0.3)' }}>
                <Dot color="#f6ad55" /> Not Installed
              </span>
            )}
          </div>
        </div>
        <div className={styles.headerActions}>
          {status?.installed && (
            <>
              {isRunning ? (
                <button className={styles.btnDanger} onClick={() => mutService.mutate('stop')} disabled={mutService.isPending}><IcoStop />Stop</button>
              ) : (
                <button className={styles.btnPrimary} onClick={() => mutService.mutate('start')} disabled={mutService.isPending}><IcoPlay />Start</button>
              )}
              <button className={styles.btnSecondary} onClick={() => mutService.mutate('restart')} disabled={mutService.isPending}><IcoRefresh />Restart</button>
            </>
          )}
        </div>
      </div>

      {/* Not installed */}
      {!status?.installed && (
        <div className={styles.notInstalled}>
          <div className={styles.notInstalledBody}>
            <div className={styles.notInstalledTitle}>CrowdSec is not installed</div>
            <div className={styles.notInstalledSub}>CrowdSec is an open-source, collaborative security engine that leverages crowd-sourced threat intelligence to protect your infrastructure. It analyzes behaviors, provides a threat database shared among all users, and offers bouncers to block threats at various levels.</div>
            <div className={styles.installStep}>
              <div className={styles.installStepNum}>1</div>
              <div><div className={styles.installStepTitle}>Install CrowdSec + Bouncer</div>
              <code className={styles.installCmd}>apt install crowdsec crowdsec-firewall-bouncer-iptables</code></div>
            </div>
            <div className={styles.installStep}>
              <div className={styles.installStepNum}>2</div>
              <div><div className={styles.installStepTitle}>Install Collections</div>
              <code className={styles.installCmd}>cscli collections install crowdsecurity/linux crowdsecurity/sshd</code></div>
            </div>
            <button className={styles.btnPrimary} onClick={() => mutInstall.mutate()} disabled={mutInstall.isPending} style={{ marginTop: 16 }}>
              <IcoPackage /> {mutInstall.isPending ? 'Installing… (this may take 1-2 min)' : 'Install CrowdSec Automatically'}
            </button>
          </div>

          {/* Feature cards */}
          <div className={styles.featSection}>
            <div className={styles.featSectionTitle}>What CrowdSec Can Do</div>
            <div className={styles.featGrid}>
              {[
                { color: '#a78bfa', title: 'Crowd-Sourced Threat Intel', desc: 'Automatically receives real-time IP blocklists from the global CrowdSec community of 100k+ installations.' },
                { color: '#63b3ed', title: 'Behavioral Analysis',        desc: 'Detects attacks by analyzing behavioral patterns from log files rather than just matching signatures.' },
                { color: '#f6ad55', title: 'Bouncer Architecture',       desc: 'Modular bouncers enforce decisions at every layer: firewall, Nginx, Cloudflare, HAProxy, and more.' },
                { color: '#68d391', title: 'LAPI (Local API)',           desc: 'Central API server coordinates all agents and bouncers on the host, supporting multi-machine deployments.' },
                { color: '#ff4d4d', title: 'Hub Collections',            desc: 'Install curated detection collections (SSH, HTTP, WordPress, etc.) from the official CrowdSec Hub in one command.' },
                { color: '#4a9eff', title: 'Allowlisting',              desc: 'Define per-IP or per-CIDR allowlists to permanently exempt trusted infrastructure from any enforcement action.' },
              ].map(f => (
                <div key={f.title} className={styles.featCard}>
                  <div className={styles.featAccent} style={{ background: f.color }} />
                  <div className={styles.featTitle}>{f.title}</div>
                  <div className={styles.featDesc}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {installLog && (
            <div className={styles.installLog}>
              <div className={styles.installLogTitle}>Installation Output</div>
              <pre className={styles.installLogPre}>{installLog}</pre>
            </div>
          )}
        </div>
      )}

      {status?.installed && (
        <>
          <div className={styles.tabBar}>
            {tabs.map(t => (
              <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Overview ── */}
          {tab === 'overview' && (
            <div className={styles.content}>
              <div className={styles.statsRow}>
                {[
                  { label: 'Active Decisions', value: metrics?.active_decisions ?? totalBans, color: '#f6ad55' },
                  { label: 'From CrowdSec',    value: metrics?.origin_crowdsec  ?? 0,         color: '#a78bfa' },
                  { label: 'From CAPI',        value: metrics?.origin_capi      ?? 0,         color: '#63b3ed' },
                  { label: 'From Lists',       value: metrics?.origin_list      ?? 0,         color: '#68d391' },
                ].map(s => (
                  <div key={s.label} className={styles.statCard}>
                    <div className={styles.statVal} style={{ color: s.color }}>{s.value}</div>
                    <div className={styles.statLbl}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Decision origin breakdown */}
              {decisions.length > 0 && (
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Decision Types</div>
                  <div className={styles.pieRow}>
                    {['ban','captcha','throttle'].map(type => {
                      const cnt = decisions.filter(d => d.type === type).length
                      if (cnt === 0) return null
                      return (
                        <div key={type} className={styles.pieStat}>
                          <div className={styles.pieVal} style={{ color: banTypeColors[type] || '#f6ad55' }}>{cnt}</div>
                          <div className={styles.pieLbl}>{type}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Service info */}
              <div className={styles.card}>
                <div className={styles.cardTitle}>Service Info</div>
                <div className={styles.infoGrid}>
                  {[
                    ['Version',      status.version || '—'],
                    ['LAPI URL',     status.api_url],
                    ['LAPI Status',  status.api_running ? 'Reachable' : 'Unreachable'],
                    ['Hub Status',   status.hub_status || '—'],
                    ['Config Path',  status.config_path],
                    ['Log File',     status.log_file],
                    ['DB Path',      status.db_path],
                  ].map(([k, v]) => (
                    <div key={k} className={styles.infoRow}>
                      <span className={styles.infoKey}>{k}</span>
                      <span className={styles.infoVal}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Feature / Capability Cards */}
              <div className={styles.featSection}>
                <div className={styles.featSectionTitle}>Capabilities</div>
                <div className={styles.featGrid}>
                  {[
                    { color: '#a78bfa', title: 'Crowd-Sourced Threat Intel',  desc: 'Automatically receives real-time IP blocklists from the global CrowdSec community of 100k+ installations.' },
                    { color: '#63b3ed', title: 'Behavioral Analysis',         desc: 'Detects attacks by analyzing behavioral patterns from log files rather than just matching signatures.' },
                    { color: '#f6ad55', title: 'Bouncer Architecture',        desc: 'Modular bouncers enforce decisions at every layer: firewall, Nginx, Cloudflare, HAProxy, and more.' },
                    { color: '#68d391', title: 'LAPI (Local API)',            desc: 'Central API server coordinates all agents and bouncers on the host, supporting multi-machine deployments.' },
                    { color: '#ff4d4d', title: 'Hub Collections',             desc: 'Install curated detection collections (SSH, HTTP, WordPress, etc.) from the official CrowdSec Hub in one command.' },
                    { color: '#4a9eff', title: 'Allowlisting',               desc: 'Define per-IP or per-CIDR allowlists to permanently exempt trusted infrastructure from any enforcement action.' },
                  ].map(f => (
                    <div key={f.title} className={styles.featCard}>
                      <div className={styles.featAccent} style={{ background: f.color }} />
                      <div className={styles.featTitle}>{f.title}</div>
                      <div className={styles.featDesc}>{f.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent decisions preview */}
              {decisions.length > 0 && (
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Recent Decisions (top 10)</div>
                  <table className={styles.table}>
                    <thead><tr><th>IP / Value</th><th>Type</th><th>Origin</th><th>Duration</th><th>Scenario</th></tr></thead>
                    <tbody>
                      {decisions.slice(0, 10).map((d, i) => (
                        <tr key={d.id ?? i} className={styles.tableRow}>
                          <td><code className={styles.ipCode}>{d.value}</code></td>
                          <td><span style={{ color: banTypeColors[d.type] || '#f6ad55', fontSize:11 }}>{d.type}</span></td>
                          <td><span style={{ color: originColor(d.origin), fontSize:11 }}>{d.origin}</span></td>
                          <td><span style={{ color:'rgba(255,255,255,0.5)', fontSize:11 }}>{d.duration}</span></td>
                          <td><span style={{ color:'rgba(255,255,255,0.45)', fontSize:10, fontFamily:'monospace' }}>{d.scenario || '—'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Decisions ── */}
          {tab === 'decisions' && (
            <div className={styles.content}>
              <div className={styles.card}>
                <div className={styles.cardTitle} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span>Active Decisions</span>
                  <button className={styles.btnRefresh} onClick={() => qc.invalidateQueries({ queryKey: ['cs-decisions'] })}><IcoRefresh /></button>
                </div>
                {/* Add decision */}
                <div className={styles.banForm}>
                  <input className={styles.input} placeholder="IP to ban (e.g. 1.2.3.4)" value={banIP} onChange={e => setBanIP(e.target.value)} />
                  <input className={styles.inputSm} placeholder="Duration (4h, 1d, 7d)" value={banDur} onChange={e => setBanDur(e.target.value)} />
                  <input className={styles.input} placeholder="Reason (optional)" value={banReason} onChange={e => setBanReason(e.target.value)} />
                  <button className={styles.btnDanger} onClick={() => banIP && mutAddDecision.mutate()} disabled={!banIP || mutAddDecision.isPending}>
                    <IcoBan /> Ban
                  </button>
                </div>
                {decisions.length === 0 ? (
                  <div className={styles.empty}>No active decisions. CrowdSec is running clean.</div>
                ) : (
                  <table className={styles.table}>
                    <thead><tr><th>IP / Value</th><th>Type</th><th>Origin</th><th>Duration</th><th>Scenario</th><th>Actions</th></tr></thead>
                    <tbody>
                      {decisions.map((d, i) => (
                        <tr key={d.id ?? i} className={styles.tableRow}>
                          <td><code className={styles.ipCode}>{d.value}</code></td>
                          <td><span style={{ color: banTypeColors[d.type] || '#f6ad55', fontSize:11 }}>{d.type}</span></td>
                          <td><span style={{ color: originColor(d.origin), fontSize:11 }}>{d.origin}</span></td>
                          <td>{d.duration}</td>
                          <td><span style={{ fontSize:10.5, fontFamily:'monospace', color:'rgba(255,255,255,0.4)' }}>{d.scenario || '—'}</span></td>
                          <td>
                            <div style={{ display:'flex', gap:4 }}>
                              <button className={styles.btnIconGreen} onClick={() => d.id && mutDelDecision.mutate(d.id)} disabled={mutDelDecision.isPending} title="Remove decision"><IcoUnban /></button>
                              <button className={styles.btnIconRed} onClick={() => mutDelByIP.mutate(d.value)} disabled={mutDelByIP.isPending} title="Remove all decisions for this IP"><IcoTrash /></button>
                              <button className={styles.btnIconBlue} onClick={() => csAllowlistAdd(d.value)} title="Allowlist IP"><IcoPlus /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── Alerts ── */}
          {tab === 'alerts' && (
            <div className={styles.content}>
              <div className={styles.card}>
                <div className={styles.cardTitle} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span>Security Alerts</span>
                  <button className={styles.btnRefresh} onClick={() => qc.invalidateQueries({ queryKey: ['cs-alerts'] })}><IcoRefresh /></button>
                </div>
                {alerts.length === 0 ? (
                  <div className={styles.empty}>No alerts yet. CrowdSec is monitoring your system.</div>
                ) : (
                  <table className={styles.table}>
                    <thead><tr><th>IP</th><th>Scenario</th><th>Events</th><th>Country</th><th>Start</th><th>Message</th></tr></thead>
                    <tbody>
                      {alerts.map((a, i) => (
                        <tr key={a.id ?? i} className={styles.tableRow}>
                          <td><code className={styles.ipCode}>{a.source?.ip || '—'}</code></td>
                          <td><span style={{ fontSize:10.5, fontFamily:'monospace', color:'#a78bfa' }}>{a.scenario}</span></td>
                          <td><span style={{ color: a.events_count > 10 ? '#f6ad55' : 'inherit' }}>{a.events_count}</span></td>
                          <td><span style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>{a.source?.cn || '—'}</span></td>
                          <td><span style={{ fontSize:10.5, color:'rgba(255,255,255,0.35)' }}>{a.start_at?.slice(0,16) || '—'}</span></td>
                          <td><span style={{ fontSize:10.5, color:'rgba(255,255,255,0.45)' }}>{a.message?.slice(0, 60)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── Bouncers ── */}
          {tab === 'bouncers' && (
            <div className={styles.content}>
              <div className={styles.card}>
                <div className={styles.cardTitle}>Registered Bouncers</div>
                {bouncers.length === 0 ? (
                  <div className={styles.empty}>No bouncers registered. Install crowdsec-firewall-bouncer-iptables to enforce decisions.</div>
                ) : (
                  <table className={styles.table}>
                    <thead><tr><th>Name</th><th>Type</th><th>IP</th><th>Version</th><th>Last Pull</th><th>Status</th></tr></thead>
                    <tbody>
                      {bouncers.map((b, i) => (
                        <tr key={b.name ?? i} className={styles.tableRow}>
                          <td><span style={{ fontWeight:600, color:'#fff' }}>{b.name}</span></td>
                          <td><span style={{ fontSize:11, color:'rgba(255,255,255,0.55)' }}>{b.type || '—'}</span></td>
                          <td><code className={styles.ipCode}>{b.ip_address || '—'}</code></td>
                          <td><span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>{b.version || '—'}</span></td>
                          <td><span style={{ fontSize:10.5, color:'rgba(255,255,255,0.35)' }}>{b.last_pull?.slice(0,16) || '—'}</span></td>
                          <td>
                            {b.revoked
                              ? <span style={{ fontSize:10.5, color:'#ff4d4d' }}>Revoked</span>
                              : <span style={{ fontSize:10.5, color:'#68d391' }}>Active</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── Hub ── */}
          {tab === 'hub' && (
            <div className={styles.content}>
              <div className={styles.card}>
                <div className={styles.cardTitle} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span>Hub — Collections, Parsers, Scenarios</span>
                  <div style={{ display:'flex', gap:6 }}>
                    <button className={styles.btnSecondary} onClick={() => mutHubUpdate.mutate()} disabled={mutHubUpdate.isPending}><IcoRefresh />{mutHubUpdate.isPending ? 'Updating…' : 'Update Index'}</button>
                    <button className={styles.btnPrimary} onClick={() => mutHubUpgrade.mutate()} disabled={mutHubUpgrade.isPending}><IcoHub />{mutHubUpgrade.isPending ? 'Upgrading…' : 'Upgrade All'}</button>
                  </div>
                </div>

                {/* Install collection */}
                <div className={styles.banForm}>
                  <input className={styles.input} placeholder="Install collection (e.g. crowdsecurity/nginx)" value={collectionInput} onChange={e => setCollectionInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && collectionInput && mutInstallCollection.mutate(collectionInput)} />
                  <button className={styles.btnPrimary} onClick={() => collectionInput && mutInstallCollection.mutate(collectionInput)} disabled={!collectionInput || mutInstallCollection.isPending}>
                    <IcoPlus /> Install
                  </button>
                </div>

                {/* Filters */}
                <div style={{ display:'flex', gap:8, padding:'8px 14px', borderBottom:'1px solid rgba(255,255,255,0.05)', flexWrap:'wrap' }}>
                  {['all','collections','parsers','scenarios'].map(t => (
                    <button key={t} className={`${styles.filterPill} ${hubType === t ? styles.filterPillActive : ''}`} onClick={() => setHubType(t)}>{t}</button>
                  ))}
                  <input className={styles.input} placeholder="Search hub…" value={hubSearch} onChange={e => setHubSearch(e.target.value)} style={{ marginLeft:'auto', width:180, flex:'none' }} />
                </div>

                {filteredHub.length === 0 ? (
                  <div className={styles.empty}>{hubItems.length === 0 ? 'No hub items found. Click "Update Index" to fetch.' : 'No items match search.'}</div>
                ) : (
                  <table className={styles.table}>
                    <thead><tr><th>Name</th><th>Type</th><th>Author</th><th>Version</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                      {filteredHub.map((h, i) => (
                        <tr key={h.name ?? i} className={styles.tableRow}>
                          <td>
                            <div style={{ fontWeight:600, color:'#fff', fontSize:12 }}>{h.name}</div>
                            {h.description && <div style={{ fontSize:10.5, color:'rgba(255,255,255,0.35)', marginTop:1 }}>{h.description?.slice(0,60)}</div>}
                          </td>
                          <td><span style={{ fontSize:10.5, color:'rgba(255,255,255,0.45)' }}>{h.type || '—'}</span></td>
                          <td><span style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>{h.author}</span></td>
                          <td><span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>{h.version}</span></td>
                          <td><HubStatusBadge status={h.status || 'enabled'} /></td>
                          <td>
                            <div style={{ display:'flex', gap:4 }}>
                              <button className={styles.btnIconRed} onClick={() => mutRemoveCollection.mutate(h.name)} disabled={mutRemoveCollection.isPending} title="Remove"><IcoTrash /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── Config ── */}
          {tab === 'config' && (
            <div className={styles.content}>
              <div className={styles.card}>
                <div className={styles.cardTitle} style={{ display:'flex', justifyContent:'space-between' }}>
                  <span>Main Config — {cfgPath}</span>
                  <button className={styles.btnPrimary} onClick={() => mutSaveCfg.mutate()} disabled={mutSaveCfg.isPending}><IcoSave />{mutSaveCfg.isPending ? 'Saving…' : 'Save & Reload'}</button>
                </div>
                <textarea className={styles.configEditor} value={rawCfg} onChange={e => setRawCfg(e.target.value)} spellCheck={false} />
              </div>
              <div className={styles.card}>
                <div className={styles.cardTitle} style={{ display:'flex', justifyContent:'space-between' }}>
                  <span>Acquisition Config — /etc/crowdsec/acquis.yaml</span>
                  <button className={styles.btnPrimary} onClick={() => mutSaveAcquis.mutate()} disabled={mutSaveAcquis.isPending}><IcoSave />{mutSaveAcquis.isPending ? 'Saving…' : 'Save & Reload'}</button>
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', padding:'6px 14px' }}>Defines log sources for CrowdSec to monitor</div>
                <textarea className={styles.configEditor} value={rawAcquis} onChange={e => setRawAcquis(e.target.value)} spellCheck={false} style={{ minHeight:220 }} />
              </div>
            </div>
          )}

          {/* ── Logs ── */}
          {tab === 'logs' && (
            <div className={styles.content}>
              <div className={styles.card}>
                <div className={styles.cardTitle} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span>CrowdSec Logs</span>
                  <button className={styles.btnRefresh} onClick={() => qc.invalidateQueries({ queryKey: ['cs-logs'] })}><IcoRefresh /></button>
                </div>
                {logs.length === 0 ? (
                  <div className={styles.empty}>No log entries found. Check {status.log_file} for the log path.</div>
                ) : (
                  <div className={styles.logList}>
                    {logs.map((l, i) => (
                      <div key={i} className={styles.logEntry}>
                        <span className={styles.logTime}>{l.timestamp?.slice(0,19) || '—'}</span>
                        <span className={styles.logLevel} style={{ color: logColor(l.level) }}>{(l.level || 'info').toUpperCase().slice(0,4)}</span>
                        {l.component && <span className={styles.logComponent}>{l.component}</span>}
                        {l.ip && <span className={styles.logIP}>{l.ip}</span>}
                        {l.scenario && <span className={styles.logScenario}>{l.scenario}</span>}
                        <span className={styles.logMsg}>{l.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
