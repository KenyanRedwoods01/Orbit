import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  fetchSuricataStatus, fetchSuricataAlerts, fetchSuricataRules,
  fetchSuricataHTTP, fetchSuricataDNS, fetchSuricataTLS,
  fetchSuricataLogs, fetchSuricataStats, fetchSuricataConfig,
  fetchSuricataHostbits,
  suricataService, suricataReloadRules, suricataUpdateRules,
  suricataInstall, suricataCreateRule, suricataDropIP,
  suricataAddHostbit, suricataSaveConfig, fetchPlugins,
  type SuricataAlert, type SuricataRule, type SuricataLogEntry,
} from '@/lib/api'
import styles from './SuricataPage.module.css'
import suricataLogoSrc from '@/assets/suricata.svg'

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoBack    = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="10,3 5,8 10,13"/></svg>
const IcoRefresh = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M17 10a7 7 0 0 1-7 7 7 7 0 0 1-5-2"/><polyline points="2,10 3,15 8,14"/></svg>
const IcoShield  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5z"/></svg>
const IcoAlert   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M10 2l8 16H2z"/><line x1="10" y1="9" x2="10" y2="13"/><circle cx="10" cy="15.5" r=".6" fill="currentColor" stroke="none"/></svg>
const IcoRules   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M9 3H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8l-4-5z"/><polyline points="9,3 9,8 14,8"/><line x1="7" y1="12" x2="13" y2="12"/><line x1="7" y1="15" x2="11" y2="15"/></svg>
const IcoNetwork = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><circle cx="10" cy="10" r="2"/><circle cx="3" cy="5" r="1.5"/><circle cx="17" cy="5" r="1.5"/><circle cx="3" cy="15" r="1.5"/><circle cx="17" cy="15" r="1.5"/><line x1="4" y1="5.5" x2="9" y2="9"/><line x1="16" y1="5.5" x2="11" y2="9"/><line x1="4" y1="14.5" x2="9" y2="11"/><line x1="16" y1="14.5" x2="11" y2="11"/></svg>
const IcoDNS     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><circle cx="10" cy="10" r="8"/><path d="M2 10h16M10 2a12 12 0 0 1 0 16M10 2a12 12 0 0 0 0 16"/></svg>
const IcoTLS     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><rect x="5" y="9" width="10" height="8" rx="1.5"/><path d="M8 9V6a2 2 0 0 1 4 0v3"/><circle cx="10" cy="13" r="1" fill="currentColor" stroke="none"/></svg>
const IcoLog     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><rect x="3" y="3" width="14" height="14" rx="2"/><line x1="7" y1="8" x2="13" y2="8"/><line x1="7" y1="12" x2="13" y2="12"/><line x1="7" y1="10" x2="10" y2="10"/></svg>
const IcoConfig  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><circle cx="10" cy="10" r="3"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>
const IcoInstall = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M10 2v10M6 8l4 4 4-4M4 16h12"/></svg>
const IcoStats   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><polyline points="3,15 7,9 11,12 17,5"/><line x1="3" y1="17" x2="17" y2="17"/></svg>
const IcoPlay    = () => <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><polygon points="5,3 17,10 5,17"/></svg>
const IcoStop    = () => <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><rect x="4" y="4" width="12" height="12" rx="1.5"/></svg>
const IcoPlus    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg>
const IcoTrash   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><polyline points="3,6 17,6"/><path d="M8 6V4h4v2"/><rect x="4" y="6" width="12" height="12" rx="1.5"/></svg>
const IcoCopy    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><rect x="8" y="8" width="9" height="9" rx="1.5"/><path d="M3 12V4a1 1 0 0 1 1-1h8"/></svg>
const IcoBlock   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><circle cx="10" cy="10" r="8"/><line x1="4" y1="4" x2="16" y2="16"/></svg>
const IcoUpdate  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M3 10a7 7 0 0 1 7-7 7 7 0 0 1 5 2"/><polyline points="18,10 17,5 12,6"/><path d="M17 10a7 7 0 0 1-7 7 7 7 0 0 1-5-2"/></svg>

// ── Helpers ───────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'alerts' | 'rules' | 'http' | 'dns' | 'tls' | 'logs' | 'stats' | 'config' | 'install'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview',  icon: <IcoShield /> },
  { id: 'alerts',   label: 'Alerts',    icon: <IcoAlert /> },
  { id: 'rules',    label: 'Rules',     icon: <IcoRules /> },
  { id: 'http',     label: 'HTTP',      icon: <IcoNetwork /> },
  { id: 'dns',      label: 'DNS',       icon: <IcoDNS /> },
  { id: 'tls',      label: 'TLS',       icon: <IcoTLS /> },
  { id: 'logs',     label: 'Logs',      icon: <IcoLog /> },
  { id: 'stats',    label: 'Stats',     icon: <IcoStats /> },
  { id: 'config',   label: 'Config',    icon: <IcoConfig /> },
  { id: 'install',  label: 'Install',   icon: <IcoInstall /> },
]

function sevColor(sev: number) {
  if (sev === 1) return '#f85149'
  if (sev === 2) return '#f6ad55'
  if (sev === 3) return '#63b3ed'
  return '#8b949e'
}
function sevBg(sev: number) {
  if (sev === 1) return 'rgba(248,81,73,0.12)'
  if (sev === 2) return 'rgba(246,173,85,0.12)'
  if (sev === 3) return 'rgba(99,179,237,0.12)'
  return 'rgba(139,148,158,0.1)'
}
function actionColor(action: string) {
  if (action === 'allowed') return '#68d391'
  if (action === 'drop' || action === 'blocked') return '#f85149'
  return '#f6ad55'
}
function fmtBytes(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB'
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB'
  return bytes + ' B'
}
function fmtNum(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(n)
}
function logColor(level: string) {
  if (level === 'error') return '#f85149'
  if (level === 'warning' || level === 'warn') return '#f6ad55'
  if (level === 'notice') return '#63b3ed'
  if (level === 'perf') return '#a78bfa'
  return '#8b949e'
}
function ruleActionColor(action: string) {
  if (action === 'alert') return '#f6ad55'
  if (action === 'drop')  return '#f85149'
  if (action === 'pass')  return '#68d391'
  return '#63b3ed'
}
function ruleActionBg(action: string) {
  if (action === 'alert') return 'rgba(246,173,85,0.12)'
  if (action === 'drop')  return 'rgba(248,81,73,0.12)'
  if (action === 'pass')  return 'rgba(104,211,145,0.12)'
  return 'rgba(99,179,237,0.1)'
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SuricataPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')
  const { data: allPlugins = [] } = useQuery({ queryKey: ['plugins'], queryFn: fetchPlugins, staleTime: 60000 })
  const suricataPlugin = allPlugins.find(p => p.plugin_id === 'suricata' || p.plugin_id.startsWith('suricata'))
  const pluginWarning = suricataPlugin
    ? (suricataPlugin.install_status === 'not_installed' ? 'not_installed' : !suricataPlugin.enabled ? 'disabled' : null)
    : null
  const [toast, setToast] = useState('')
  const [alertSearch, setAlertSearch] = useState('')
  const [ruleSearch, setRuleSearch] = useState('')
  const [dnsSearch, setDnsSearch] = useState('')
  const [logSearch, setLogSearch] = useState('')
  const [configRaw, setConfigRaw] = useState('')
  const [configDirty, setConfigDirty] = useState(false)
  const [installMode, setInstallMode] = useState<'ids'|'ips'|'monitor'>('ids')
  const [installIface, setInstallIface] = useState('eth0')
  const [installLog, setInstallLog] = useState('')
  const [installing, setInstalling] = useState(false)
  const [showRuleDialog, setShowRuleDialog] = useState(false)
  const [newRule, setNewRule] = useState('')
  const [dropIPVal, setDropIPVal] = useState('')
  const [hbIP, setHbIP] = useState('')
  const [hbName, setHbName] = useState('orbit-block')
  const [hbExpire, setHbExpire] = useState('3600')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // ── Queries ──
  const { data: status, refetch: refetchStatus } = useQuery({ queryKey: ['suricata-status'], queryFn: fetchSuricataStatus, refetchInterval: 10000 })
  const { data: alerts = [] } = useQuery({ queryKey: ['suricata-alerts'], queryFn: () => fetchSuricataAlerts(500), enabled: tab === 'alerts' })
  const { data: rules = [] }  = useQuery({ queryKey: ['suricata-rules'],  queryFn: fetchSuricataRules,  enabled: tab === 'rules' })
  const { data: http = [] }   = useQuery({ queryKey: ['suricata-http'],   queryFn: () => fetchSuricataHTTP(200), enabled: tab === 'http' })
  const { data: dns = [] }    = useQuery({ queryKey: ['suricata-dns'],    queryFn: () => fetchSuricataDNS(200), enabled: tab === 'dns' })
  const { data: tls = [] }    = useQuery({ queryKey: ['suricata-tls'],    queryFn: () => fetchSuricataTLS(200), enabled: tab === 'tls' })
  const { data: logs = [] }   = useQuery({ queryKey: ['suricata-logs'],   queryFn: () => fetchSuricataLogs(500), enabled: tab === 'logs' })
  const { data: statsData = [] } = useQuery({ queryKey: ['suricata-stats'], queryFn: fetchSuricataStats, enabled: tab === 'stats' })
  const { data: cfgData }     = useQuery({ queryKey: ['suricata-config'], queryFn: fetchSuricataConfig, enabled: tab === 'config',
    onSuccess: (d) => { if (!configDirty) setConfigRaw(d.raw) }
  })
  const { data: hostbits = [] } = useQuery({ queryKey: ['suricata-hostbits'], queryFn: fetchSuricataHostbits, enabled: tab === 'overview' })

  // ── Mutations ──
  const svcMut = useMutation({ mutationFn: (action: string) => suricataService(action),
    onSuccess: (d, action) => { showToast(`${action} → ${d.ok ? 'OK' : 'failed'}`); refetchStatus() }
  })
  const reloadMut  = useMutation({ mutationFn: suricataReloadRules,  onSuccess: () => showToast('Rules reloaded') })
  const updateMut  = useMutation({ mutationFn: suricataUpdateRules,  onSuccess: (d) => showToast(d.ok ? 'Rules updated' : 'Update failed') })
  const dropMut    = useMutation({ mutationFn: ({ ip }: { ip: string }) => suricataDropIP(ip),
    onSuccess: () => { showToast(`Blocked ${dropIPVal}`); setDropIPVal('') }
  })
  const hbMut      = useMutation({ mutationFn: ({ ip, name, expire }: { ip: string; name: string; expire: number }) => suricataAddHostbit(ip, name, expire),
    onSuccess: () => { showToast('Hostbit added'); setHbIP('') }
  })
  const ruleCreateMut = useMutation({ mutationFn: (rule: string) => suricataCreateRule(rule),
    onSuccess: (d) => { showToast(d.ok ? 'Rule added' : d.error ?? 'Failed'); setShowRuleDialog(false); setNewRule('') }
  })
  const cfgSaveMut = useMutation({ mutationFn: ({ raw, path }: { raw: string; path: string }) => suricataSaveConfig(raw, path),
    onSuccess: (d) => { showToast(d.ok ? 'Config saved & Suricata restarted' : d.error ?? 'Save failed'); setConfigDirty(false) }
  })

  // ── Filtered lists ──
  const filteredAlerts = useMemo(() => alerts.filter(a =>
    !alertSearch || a.signature?.toLowerCase().includes(alertSearch.toLowerCase()) ||
    a.src_ip?.includes(alertSearch) || a.dest_ip?.includes(alertSearch) ||
    a.category?.toLowerCase().includes(alertSearch.toLowerCase())
  ), [alerts, alertSearch])

  const filteredRules = useMemo(() => rules.filter(r =>
    !ruleSearch || r.msg?.toLowerCase().includes(ruleSearch.toLowerCase()) ||
    r.sid?.includes(ruleSearch) || r.file?.includes(ruleSearch)
  ), [rules, ruleSearch])

  const filteredDNS = useMemo(() => dns.filter(d =>
    !dnsSearch || d.rrname?.toLowerCase().includes(dnsSearch.toLowerCase()) ||
    d.src_ip?.includes(dnsSearch) || d.dest_ip?.includes(dnsSearch)
  ), [dns, dnsSearch])

  const filteredLogs = useMemo(() => logs.filter(l =>
    !logSearch || l.message?.toLowerCase().includes(logSearch.toLowerCase()) ||
    l.level?.toLowerCase().includes(logSearch.toLowerCase())
  ), [logs, logSearch])

  // ── Install handler ──
  async function handleInstall() {
    setInstalling(true)
    setInstallLog('')
    try {
      const result = await suricataInstall({ mode: installMode, interface: installIface })
      setInstallLog(result.output)
      showToast(result.ok ? 'Suricata installed!' : 'Install failed — check log')
      refetchStatus()
    } catch (e: unknown) {
      setInstallLog(String(e))
    } finally {
      setInstalling(false)
    }
  }

  const installed = status?.installed ?? false
  const running   = status?.running   ?? false

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      {/* Back link */}
      <div>
        <span className={styles.backLink} onClick={() => navigate('/plugins')}>
          <IcoBack /> Plugins
        </span>
      </div>

      {/* Plugin status warning */}
      {pluginWarning && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', marginBottom:4, borderRadius:7, border:'1px solid', fontSize:12.5, lineHeight:1.45,
          background: pluginWarning === 'not_installed' ? 'rgba(246,173,85,0.08)' : 'rgba(255,77,77,0.07)',
          borderColor: pluginWarning === 'not_installed' ? 'rgba(246,173,85,0.3)' : 'rgba(255,77,77,0.25)',
          color: pluginWarning === 'not_installed' ? '#f6ad55' : '#ff8080' }}>
          <IcoInstall />
          <div>
            <strong>Suricata plugin {pluginWarning === 'not_installed' ? 'not installed' : 'is disabled'}.</strong>
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

      {/* Hero */}
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.heroLogo}>
            <img src={suricataLogoSrc} alt="Suricata" />
          </div>
          <div>
            <div className={styles.heroTitle}>Suricata</div>
            <div className={styles.heroSub}>High-performance Network IDS/IPS · v{status?.version ?? '7.0.3'}</div>
          </div>
        </div>
        <div className={styles.heroRight}>
          <div className={styles.heroStat}><div className={styles.heroStatVal} style={{ color: sevColor(1) }}>{fmtNum(status?.alerts_today ?? 0)}</div><div className={styles.heroStatLbl}>Alerts Today</div></div>
          <div className={styles.heroStat}><div className={styles.heroStatVal}>{fmtNum(status?.rules_loaded ?? 0)}</div><div className={styles.heroStatLbl}>Rules</div></div>
          <div className={styles.heroStat}><div className={styles.heroStatVal}>{fmtNum(status?.packets_total ?? 0)}</div><div className={styles.heroStatLbl}>Packets</div></div>
          <div className={styles.heroStat}><div className={styles.heroStatVal}>{status?.mode?.toUpperCase() ?? 'IDS'}</div><div className={styles.heroStatLbl}>Mode</div></div>
          {/* Service controls */}
          {installed && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {running
                ? <button className={styles.btnDanger} onClick={() => svcMut.mutate('stop')} disabled={svcMut.isPending}><IcoStop /> Stop</button>
                : <button className={styles.btnPrimary} onClick={() => svcMut.mutate('start')} disabled={svcMut.isPending}><IcoPlay /> Start</button>
              }
              <button className={styles.btnSecondary} onClick={() => svcMut.mutate('restart')} disabled={svcMut.isPending}><IcoRefresh /> Restart</button>
            </div>
          )}
        </div>
      </div>

      {/* Status banner */}
      {installed ? (
        <div className={styles.statusBanner} style={running
          ? { background: 'rgba(104,211,145,0.07)', borderColor: 'rgba(104,211,145,0.25)', color: '#68d391' }
          : { background: 'rgba(248,81,73,0.07)',   borderColor: 'rgba(248,81,73,0.25)',   color: '#f85149' }
        }>
          <span className={styles.statusDot} style={{ background: running ? '#68d391' : '#f85149' }} />
          {running
            ? <>Suricata is <strong>running</strong> on <code style={{ fontFamily: 'monospace', marginLeft: 4, marginRight: 4 }}>{status?.interface ?? 'eth0'}</code> · PID {status?.pid}</>
            : <>Suricata is <strong>stopped</strong> — click Start to enable network monitoring</>
          }
        </div>
      ) : (
        <div className={styles.notInstalledBanner}>
          <IcoInstall />
          <div>
            <div className={styles.notInstalledTitle}>Suricata is not installed</div>
            <div className={styles.notInstalledSub}>Use the Install tab to set up Suricata in IDS or IPS mode</div>
          </div>
          <button className={styles.btnPrimary} style={{ marginLeft: 'auto' }} onClick={() => setTab('install')}><IcoInstall /> Install Now</button>
        </div>
      )}

      {/* Tab bar */}
      <div className={styles.tabBar}>
        {TABS.map(t => (
          <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <>
          {/* Stats row */}
          <div className={styles.statsRow}>
            {[
              { lbl: 'Alerts Today',   val: fmtNum(status?.alerts_today ?? 0),     clr: '#f85149', bg: 'rgba(248,81,73,0.1)',   icon: <IcoAlert /> },
              { lbl: 'Rules Loaded',   val: fmtNum(status?.rules_loaded ?? 0),     clr: '#63b3ed', bg: 'rgba(99,179,237,0.1)', icon: <IcoRules /> },
              { lbl: 'Packets Total',  val: fmtNum(status?.packets_total ?? 0),    clr: '#a78bfa', bg: 'rgba(167,139,250,0.1)',icon: <IcoNetwork /> },
              { lbl: 'Packet Drops',   val: fmtNum(status?.packets_drop ?? 0),     clr: '#f6ad55', bg: 'rgba(246,173,85,0.1)', icon: <IcoAlert /> },
              { lbl: 'Bytes Seen',     val: fmtBytes(status?.bytes_total ?? 0),    clr: '#68d391', bg: 'rgba(104,211,145,0.1)',icon: <IcoStats /> },
              { lbl: 'Config',         val: status?.config_path ? 'OK' : '—',      clr: '#68d391', bg: 'rgba(104,211,145,0.1)',icon: <IcoConfig /> },
            ].map(s => (
              <div key={s.lbl} className={styles.statCard}>
                <div className={styles.statIcon} style={{ background: s.bg, color: s.clr }}>{s.icon}</div>
                <div>
                  <div className={styles.statVal}>{s.val}</div>
                  <div className={styles.statLbl}>{s.lbl}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Info + quick actions */}
          <div className={styles.grid2}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>System Info</div>
              <div className={styles.infoGrid}>
                {[
                  { k: 'Version',    v: status?.version    ?? '—' },
                  { k: 'Mode',       v: status?.mode?.toUpperCase() ?? '—' },
                  { k: 'Interface',  v: status?.interface  ?? '—' },
                  { k: 'PID',        v: status?.pid ? String(status.pid) : '—' },
                  { k: 'Config',     v: status?.config_path ?? '—' },
                  { k: 'EVE Log',    v: status?.eve_log_path ?? '—' },
                  { k: 'Rules Dir',  v: status?.rules_path ?? '—' },
                  { k: 'Socket',     v: status?.socket_path ?? '—' },
                ].map(i => (
                  <div key={i.k}>
                    <div className={styles.infoKey}>{i.k}</div>
                    <div className={styles.infoVal}>{i.v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>Quick Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className={styles.btnSecondary} onClick={() => reloadMut.mutate()} disabled={!installed || reloadMut.isPending}><IcoRefresh /> Reload Rules (hot-reload via socket)</button>
                <button className={styles.btnWarn} onClick={() => updateMut.mutate()} disabled={!installed || updateMut.isPending}><IcoUpdate /> Update Rules via suricata-update</button>
                <button className={styles.btnSecondary} onClick={() => setShowRuleDialog(true)} disabled={!installed}><IcoPlus /> Add Custom Rule to local.rules</button>
                <button className={styles.btnSecondary} onClick={() => setTab('alerts')}><IcoAlert /> View Live Alerts</button>
                <button className={styles.btnSecondary} onClick={() => setTab('config')}><IcoConfig /> Edit suricata.yaml</button>
                <button className={styles.btnSecondary} onClick={() => svcMut.mutate('restart')} disabled={!installed || svcMut.isPending}><IcoRefresh /> Restart Service</button>
              </div>
            </div>
          </div>

          {/* Drop IP / Hostbit */}
          <div className={styles.grid2}>
            <div className={styles.card}>
              <div className={styles.cardTitle}><IcoBlock /> Block IP Immediately</div>
              <div className={styles.formRow}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>IP Address</label>
                  <input className={styles.formInput} placeholder="1.2.3.4" value={dropIPVal} onChange={e => setDropIPVal(e.target.value)} />
                </div>
              </div>
              <div className={styles.btnRow}>
                <button className={styles.btnDanger} onClick={() => dropMut.mutate({ ip: dropIPVal })} disabled={!dropIPVal || dropMut.isPending}><IcoBlock /> Drop IP (iptables + hostbit)</button>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>Add Hostbit</div>
              <div className={styles.formRow}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>IP</label>
                  <input className={styles.formInput} placeholder="1.2.3.4" value={hbIP} onChange={e => setHbIP(e.target.value)} />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Bit Name</label>
                  <input className={styles.formInput} placeholder="orbit-block" value={hbName} onChange={e => setHbName(e.target.value)} />
                </div>
              </div>
              <div className={styles.formField} style={{ marginTop: 8 }}>
                <label className={styles.formLabel}>Expire (seconds)</label>
                <input className={styles.formInput} type="number" value={hbExpire} onChange={e => setHbExpire(e.target.value)} />
              </div>
              <div className={styles.btnRow}>
                <button className={styles.btnPrimary} onClick={() => hbMut.mutate({ ip: hbIP, name: hbName, expire: parseInt(hbExpire) })} disabled={!hbIP || hbMut.isPending}><IcoPlus /> Add Hostbit</button>
              </div>
            </div>
          </div>

          {/* Active hostbits */}
          {hostbits.length > 0 && (
            <div className={styles.card}>
              <div className={styles.cardTitle}>Active Hostbits ({hostbits.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {hostbits.map((hb, i) => (
                  <div key={i} className={styles.hostbitRow}>
                    <span className={styles.mono} style={{ color: '#63b3ed', flex: 1 }}>{hb.ip}</span>
                    <span className={styles.textDim}>{hb.name}</span>
                    <span className={styles.textDim} style={{ fontSize: 10 }}>expires {hb.expire}s</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Alerts ── */}
      {tab === 'alerts' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            <span>Alerts ({filteredAlerts.length})</span>
            <input className={styles.searchInput} style={{ width: 260, fontFamily: 'inherit', marginLeft: 'auto' }}
              placeholder="Search signature, IP, category…" value={alertSearch} onChange={e => setAlertSearch(e.target.value)} />
          </div>
          {filteredAlerts.length === 0 ? (
            <div className={styles.textDim} style={{ fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
              {alerts.length === 0 ? 'No alerts found — EVE log may be empty or Suricata is not running.' : 'No alerts match filter.'}
            </div>
          ) : (
            <div className={styles.alertList}>
              {filteredAlerts.map((a, i) => (
                <div key={i} className={styles.alertRow}>
                  <div className={styles.alertSev} style={{ background: sevColor(a.severity) }} />
                  <div className={styles.alertMeta}>
                    <div className={styles.alertSig}>{a.signature || '(no signature)'}</div>
                    <div className={styles.alertDetail}>
                      <span className={styles.alertSevBadge} style={{ background: sevBg(a.severity), color: sevColor(a.severity) }}>
                        {a.sev_label?.toUpperCase() || 'LOW'}
                      </span>
                      <span className={styles.alertAction} style={{ background: 'rgba(0,0,0,0.3)', color: actionColor(a.action) }}>
                        {a.action}
                      </span>
                      <span className={styles.mono} style={{ color: '#8b949e' }}>SID:{a.sig_id}</span>
                      <span className={styles.mono}>{a.src_ip}:{a.src_port}</span>
                      <span style={{ color: '#8b949e' }}>→</span>
                      <span className={styles.mono}>{a.dest_ip}:{a.dest_port}</span>
                      <span style={{ color: '#8b949e' }}>{a.proto}</span>
                      {a.app_proto && a.app_proto !== '<nil>' && <span style={{ color: '#a78bfa', fontSize: 10, fontWeight: 700 }}>{a.app_proto.toUpperCase()}</span>}
                      {a.category && <span className={styles.textDim}>{a.category}</span>}
                    </div>
                  </div>
                  <div className={styles.alertTs}>{a.timestamp ? a.timestamp.substring(0, 19).replace('T', ' ') : ''}</div>
                  <button className={styles.btnDanger} style={{ padding: '3px 8px', fontSize: 10 }}
                    onClick={() => { setDropIPVal(a.src_ip); dropMut.mutate({ ip: a.src_ip }); showToast(`Blocking ${a.src_ip}`) }}>
                    <IcoBlock />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Rules ── */}
      {tab === 'rules' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            <span>Rules ({filteredRules.length})</span>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
              <input className={styles.searchInput} style={{ width: 240, fontFamily: 'inherit' }}
                placeholder="Search msg, SID, file…" value={ruleSearch} onChange={e => setRuleSearch(e.target.value)} />
              <button className={styles.btnPrimary} onClick={() => setShowRuleDialog(true)}><IcoPlus /> Add Rule</button>
            </div>
          </div>
          {filteredRules.length === 0 ? (
            <div className={styles.textDim} style={{ fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
              {rules.length === 0
                ? 'No rules found — run "Update Rules" to download Emerging Threats rules.'
                : 'No rules match filter.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 600, overflowY: 'auto' }}>
              {filteredRules.map((r, i) => (
                <div key={i} className={styles.ruleRow} style={{ opacity: r.enabled ? 1 : 0.45 }}>
                  <span style={{ color: r.enabled ? '#68d391' : '#8b949e', fontSize: 12 }}>{r.enabled ? '●' : '○'}</span>
                  <span className={styles.ruleAction} style={{ background: ruleActionBg(r.action), color: ruleActionColor(r.action) }}>{r.action}</span>
                  <span className={styles.mono} style={{ color: '#8b949e', fontSize: 10, flexShrink: 0 }}>{r.proto}</span>
                  <span className={styles.ruleMsg} title={r.msg}>{r.msg || r.raw?.substring(0, 80)}</span>
                  <span className={styles.ruleSID}>SID:{r.sid}</span>
                  <span className={styles.ruleFile}>{r.file}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── HTTP ── */}
      {tab === 'http' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>HTTP Events ({http.length})</div>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Time</th><th>Method</th><th>Host</th><th>URL</th><th>Status</th><th>Size</th><th>Src IP</th><th>UA</th>
                </tr>
              </thead>
              <tbody>
                {http.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '24px 0', color: '#8b949e' }}>No HTTP events — EVE log may be empty.</td></tr>
                ) : http.map((h, i) => (
                  <tr key={i}>
                    <td className={`${styles.mono} ${styles.textDim}`} style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{h.timestamp?.substring(0, 19)?.replace('T', ' ')}</td>
                    <td>
                      <span style={{ fontWeight: 700, color: h.method === 'GET' ? '#68d391' : h.method === 'POST' ? '#63b3ed' : h.method === 'DELETE' ? '#f85149' : '#f6ad55' }}>
                        {h.method}
                      </span>
                    </td>
                    <td className={styles.mono} style={{ fontSize: 11 }}>{h.hostname}</td>
                    <td className={styles.mono} style={{ fontSize: 10, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.url}</td>
                    <td>
                      <span style={{ color: h.status < 300 ? '#68d391' : h.status < 400 ? '#f6ad55' : '#f85149', fontWeight: 700, fontSize: 12 }}>{h.status}</span>
                    </td>
                    <td className={styles.textDim} style={{ fontSize: 11 }}>{fmtBytes(h.length)}</td>
                    <td className={`${styles.mono} ${styles.textDim}`} style={{ fontSize: 11 }}>{h.src_ip}</td>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, color: '#8b949e' }} title={h.user_agent}>{h.user_agent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── DNS ── */}
      {tab === 'dns' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            <span>DNS Events ({filteredDNS.length})</span>
            <input className={styles.searchInput} style={{ width: 240, fontFamily: 'inherit', marginLeft: 'auto' }}
              placeholder="Search hostname, IP…" value={dnsSearch} onChange={e => setDnsSearch(e.target.value)} />
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr><th>Time</th><th>Type</th><th>Name</th><th>RR Type</th><th>Rcode</th><th>Src IP</th><th>TTL</th></tr>
              </thead>
              <tbody>
                {filteredDNS.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px 0', color: '#8b949e' }}>No DNS events.</td></tr>
                ) : filteredDNS.map((d, i) => (
                  <tr key={i}>
                    <td className={`${styles.mono} ${styles.textDim}`} style={{ fontSize: 10 }}>{d.timestamp?.substring(0, 19)?.replace('T', ' ')}</td>
                    <td><span className={styles.pill} style={{ color: d.type === 'query' ? '#63b3ed' : '#68d391', borderColor: d.type === 'query' ? 'rgba(99,179,237,0.3)' : 'rgba(104,211,145,0.3)', background: d.type === 'query' ? 'rgba(99,179,237,0.1)' : 'rgba(104,211,145,0.1)' }}>{d.type}</span></td>
                    <td className={styles.mono} style={{ fontSize: 11 }}>{d.rrname}</td>
                    <td className={styles.textDim} style={{ fontSize: 11 }}>{d.rrtype}</td>
                    <td style={{ color: d.rcode === 'NOERROR' ? '#68d391' : '#f85149', fontSize: 11 }}>{d.rcode}</td>
                    <td className={`${styles.mono} ${styles.textDim}`} style={{ fontSize: 11 }}>{d.src_ip}</td>
                    <td className={styles.textDim} style={{ fontSize: 11 }}>{d.ttl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TLS ── */}
      {tab === 'tls' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>TLS/SSL Events ({tls.length})</div>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr><th>Time</th><th>SNI</th><th>Subject</th><th>Version</th><th>Valid Until</th><th>Src IP</th><th>Dest</th></tr>
              </thead>
              <tbody>
                {tls.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px 0', color: '#8b949e' }}>No TLS events.</td></tr>
                ) : tls.map((t, i) => (
                  <tr key={i}>
                    <td className={`${styles.mono} ${styles.textDim}`} style={{ fontSize: 10 }}>{t.timestamp?.substring(0, 19)?.replace('T', ' ')}</td>
                    <td className={styles.mono} style={{ fontSize: 11 }}>{t.sni}</td>
                    <td style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.subject}>{t.subject}</td>
                    <td><span className={styles.pill} style={{ color: '#a78bfa', borderColor: 'rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.1)' }}>{t.version}</span></td>
                    <td className={styles.textDim} style={{ fontSize: 11 }}>{t.notafter}</td>
                    <td className={`${styles.mono} ${styles.textDim}`} style={{ fontSize: 11 }}>{t.src_ip}</td>
                    <td className={`${styles.mono} ${styles.textDim}`} style={{ fontSize: 11 }}>{t.dest_ip}:{t.dest_port}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Logs ── */}
      {tab === 'logs' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            <span>Suricata Logs ({filteredLogs.length})</span>
            <input className={styles.searchInput} style={{ width: 240, fontFamily: 'inherit', marginLeft: 'auto' }}
              placeholder="Filter…" value={logSearch} onChange={e => setLogSearch(e.target.value)} />
          </div>
          <div className={styles.logList}>
            {filteredLogs.length === 0 ? (
              <div className={styles.textDim} style={{ fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No log entries found.</div>
            ) : filteredLogs.map((l, i) => (
              <div key={i} className={styles.logRow}>
                <span className={styles.logTs}>{l.timestamp}</span>
                <span className={styles.logLvl} style={{ color: logColor(l.level) }}>{l.level?.toUpperCase()}</span>
                <span className={styles.logMsg}>{l.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Stats ── */}
      {tab === 'stats' && (
        <>
          <div className={styles.statsRow}>
            {[
              { lbl: 'Alerts Today',  val: fmtNum(status?.alerts_today ?? 0),  clr: '#f85149', bg: 'rgba(248,81,73,0.1)',    icon: <IcoAlert /> },
              { lbl: 'Packets Total', val: fmtNum(status?.packets_total ?? 0), clr: '#63b3ed', bg: 'rgba(99,179,237,0.1)',  icon: <IcoNetwork /> },
              { lbl: 'Packet Drops',  val: fmtNum(status?.packets_drop ?? 0),  clr: '#f6ad55', bg: 'rgba(246,173,85,0.1)',  icon: <IcoAlert /> },
              { lbl: 'Bytes Total',   val: fmtBytes(status?.bytes_total ?? 0), clr: '#68d391', bg: 'rgba(104,211,145,0.1)', icon: <IcoStats /> },
            ].map(s => (
              <div key={s.lbl} className={styles.statCard}>
                <div className={styles.statIcon} style={{ background: s.bg, color: s.clr }}>{s.icon}</div>
                <div><div className={styles.statVal}>{s.val}</div><div className={styles.statLbl}>{s.lbl}</div></div>
              </div>
            ))}
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>Alerts — Last 7 Days</div>
            {statsData.length === 0 ? (
              <div className={styles.textDim} style={{ fontSize: 13 }}>No historical stats available.</div>
            ) : (() => {
              const maxAlerts = Math.max(...statsData.map(s => s.alerts), 1)
              return (
                <div className={styles.chartWrap}>
                  {statsData.map((s, i) => (
                    <div key={i} className={styles.chartRow}>
                      <span className={styles.chartLabel}>{s.date}</span>
                      <div className={styles.chartBarWrap}>
                        <div className={styles.chartBarFill} style={{ width: `${(s.alerts / maxAlerts) * 100}%`, background: 'rgba(248,81,73,0.6)' }} />
                      </div>
                      <span className={styles.chartVal}>{s.alerts}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>Traffic — Last 7 Days</div>
            {statsData.length === 0 ? (
              <div className={styles.textDim} style={{ fontSize: 13 }}>No historical stats available.</div>
            ) : (() => {
              const maxBytes = Math.max(...statsData.map(s => s.bytes), 1)
              return (
                <div className={styles.chartWrap}>
                  {statsData.map((s, i) => (
                    <div key={i} className={styles.chartRow}>
                      <span className={styles.chartLabel}>{s.date}</span>
                      <div className={styles.chartBarWrap}>
                        <div className={styles.chartBarFill} style={{ width: `${(s.bytes / maxBytes) * 100}%`, background: 'rgba(99,179,237,0.6)' }} />
                      </div>
                      <span className={styles.chartVal}>{fmtBytes(s.bytes)}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        </>
      )}

      {/* ── Config ── */}
      {tab === 'config' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            <span>suricata.yaml — {cfgData?.path ?? '/etc/suricata/suricata.yaml'}</span>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              {configDirty && <span className={styles.pill} style={{ color: '#f6ad55', borderColor: 'rgba(246,173,85,0.3)', background: 'rgba(246,173,85,0.1)' }}>Unsaved changes</span>}
              <button className={styles.btnPrimary} disabled={!configDirty || cfgSaveMut.isPending}
                onClick={() => cfgSaveMut.mutate({ raw: configRaw, path: cfgData?.path ?? '/etc/suricata/suricata.yaml' })}>
                Save & Restart
              </button>
            </div>
          </div>
          {!installed ? (
            <div className={styles.textDim} style={{ fontSize: 13 }}>Suricata is not installed — no config available.</div>
          ) : (
            <textarea
              className={styles.configEditor}
              value={configRaw || cfgData?.raw || '# config not available'}
              onChange={e => { setConfigRaw(e.target.value); setConfigDirty(true) }}
              spellCheck={false}
            />
          )}
        </div>
      )}

      {/* ── Install ── */}
      {tab === 'install' && (
        <>
          {installed && (
            <div className={styles.statusBanner} style={{ background: 'rgba(104,211,145,0.07)', borderColor: 'rgba(104,211,145,0.25)', color: '#68d391' }}>
              <span className={styles.statusDot} style={{ background: '#68d391' }} />
              Suricata v{status?.version} is already installed. You can re-run installation to switch modes.
            </div>
          )}

          <div className={styles.card}>
            <div className={styles.cardTitle}>Select Deployment Mode</div>
            <div className={styles.modeCards}>
              {([
                { id: 'ids' as const, icon: '🛡️', title: 'IDS Mode (Detect Only)', desc: 'Monitor traffic passively and generate alerts. No packets are dropped. Safest option.' },
                { id: 'ips' as const, icon: '⚔️', title: 'IPS Mode (Detect & Block)', desc: 'Inline mode via NFQUEUE. Actively drops malicious packets. Requires careful tuning.' },
                { id: 'monitor' as const, icon: '📡', title: 'Monitor Only', desc: 'Pure NSM — record all traffic metadata (flows, HTTP, DNS, TLS) without alerting.' },
              ]).map(m => (
                <button key={m.id} className={`${styles.modeCard} ${installMode === m.id ? styles.modeCardActive : ''}`} onClick={() => setInstallMode(m.id)}>
                  <div className={styles.modeCardIcon}>{m.icon}</div>
                  <div className={styles.modeCardTitle}>{m.title}</div>
                  <div className={styles.modeCardDesc}>{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>Network Interface</div>
            <div className={styles.formRow}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Interface to monitor</label>
                <input className={styles.formInput} placeholder="eth0" value={installIface} onChange={e => setInstallIface(e.target.value)} />
              </div>
            </div>
            <div className={styles.textDim} style={{ fontSize: 11, marginTop: 6 }}>
              Common: eth0, ens3, ens160, enp3s0. Run <code style={{ fontFamily: 'monospace', background: '#0d1117', padding: '1px 4px', borderRadius: 3 }}>ip link</code> to list interfaces.
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>What the installer does</div>
            <div className={styles.installWizard}>
              {[
                { n: 1, title: 'Add OISF PPA & install Suricata', desc: 'Installs the latest stable Suricata from the official OISF repository.' },
                { n: 2, title: 'Update rules (suricata-update)', desc: 'Downloads Emerging Threats Open ruleset — over 30,000+ detection rules.' },
                { n: 3, title: 'Configure interface', desc: `Sets the monitoring interface to ${installIface} in suricata.yaml.` },
                { n: 4, title: 'Enable & start service', desc: 'Runs: systemctl enable --now suricata' },
                ...(installMode === 'ips' ? [{ n: 5, title: 'Enable NFQUEUE (IPS)', desc: 'Adds iptables rules to route traffic through Suricata for active blocking.' }] : []),
              ].map(step => (
                <div key={step.n} className={styles.installStep}>
                  <div className={styles.stepNum}>{step.n}</div>
                  <div className={styles.stepBody}>
                    <div className={styles.stepTitle}>{step.title}</div>
                    <div className={styles.stepDesc}>{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.btnRow}>
              <button className={styles.btnPrimary} onClick={handleInstall} disabled={installing}>
                <IcoInstall /> {installing ? 'Installing…' : `Install Suricata (${installMode.toUpperCase()} mode)`}
              </button>
            </div>
          </div>

          {installLog && (
            <div className={styles.card}>
              <div className={styles.cardTitle}>Installation Output</div>
              <pre className={styles.installLog}>{installLog}</pre>
            </div>
          )}

          <div className={styles.card}>
            <div className={styles.cardTitle}>Manual Commands</div>
            {[
              { title: 'Install Suricata', code: 'add-apt-repository -y ppa:oisf/suricata-stable\napt-get update && apt-get install -y suricata suricata-update' },
              { title: 'Update rules', code: 'suricata-update' },
              { title: 'Test config', code: 'suricata -T -c /etc/suricata/suricata.yaml' },
              { title: 'Check logs', code: 'tail -f /var/log/suricata/suricata.log' },
              { title: 'Watch EVE alerts', code: 'tail -f /var/log/suricata/eve.json | jq \'select(.event_type=="alert")\'' },
            ].map(cmd => (
              <div key={cmd.title} style={{ marginBottom: 12 }}>
                <div className={styles.infoKey}>{cmd.title}</div>
                <div className={styles.codeBlock} style={{ marginTop: 4, position: 'relative' }}>
                  {cmd.code}
                  <button className={styles.copyBtn} onClick={() => { navigator.clipboard.writeText(cmd.code); showToast('Copied') }}><IcoCopy /> Copy</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Add Rule Dialog ── */}
      {showRuleDialog && (
        <div className={styles.overlay} onClick={() => setShowRuleDialog(false)}>
          <div className={styles.popup} onClick={e => e.stopPropagation()}>
            <div className={styles.popupTitle}>
              Add Custom Rule
              <button className={styles.popupClose} onClick={() => setShowRuleDialog(false)}>×</button>
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Suricata Rule</label>
              <textarea className={styles.formTextarea} style={{ minHeight: 120 }}
                placeholder={'alert tcp any any -> any 80 (msg:"Test rule"; sid:9000001; rev:1;)'}
                value={newRule} onChange={e => setNewRule(e.target.value)} />
            </div>
            <div style={{ fontSize: 11, color: '#8b949e', marginTop: 8 }}>
              Rule is added to <code style={{ fontFamily: 'monospace' }}>/etc/suricata/rules/local.rules</code> and validated before saving.
            </div>
            <div className={styles.btnRow}>
              <button className={styles.btnPrimary} onClick={() => ruleCreateMut.mutate(newRule)} disabled={!newRule || ruleCreateMut.isPending}>
                <IcoPlus /> Add Rule
              </button>
              <button className={styles.btnSecondary} onClick={() => setShowRuleDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
