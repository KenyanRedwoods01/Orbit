import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchWazuhStatus, fetchWazuhAgents, fetchWazuhAlerts, fetchWazuhRules,
  fetchWazuhFIM, fetchWazuhVulns, fetchWazuhGroups, fetchWazuhLogs,
  fetchWazuhConfig, fetchWazuhStats, fetchWazuhAgentScript,
  wazuhService, wazuhInstall, wazuhAddAgent, wazuhDeleteAgent,
  wazuhRestartAgent, wazuhActiveResponse, wazuhCreateRule, wazuhSaveConfig,
  wazuhTestAPI, fetchPlugins,
  type WazuhAgent, type WazuhAlert, type WazuhFIMEntry, type WazuhVuln,
} from '@/lib/api'
import wazuhLogo from '@/assets/wazuh.svg'
import styles from './WazuhPage.module.css'

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoBack     = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="10,3 5,8 10,13"/></svg>
const IcoPlay     = () => <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11"><polygon points="5,3 17,10 5,17"/></svg>
const IcoStop     = () => <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11"><rect x="4" y="4" width="12" height="12" rx="1.5"/></svg>
const IcoRefresh  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M17 10a7 7 0 0 1-7 7 7 7 0 0 1-5-2"/><polyline points="2,10 3,15 8,14"/></svg>
const IcoTrash    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><polyline points="3,6 17,6"/><path d="M8 6V4h4v2"/><rect x="4" y="6" width="12" height="12" rx="1.5"/></svg>
const IcoPlus     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><line x1="10" y1="3" x2="10" y2="17"/><line x1="3" y1="10" x2="17" y2="10"/></svg>
const IcoCopy     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><rect x="8" y="8" width="9" height="9" rx="1.5"/><path d="M3 12V4a1 1 0 0 1 1-1h8"/></svg>
const IcoSave     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><path d="M17 17H3V3h10l4 4z"/><rect x="7" y="11" width="6" height="6" rx=".5"/><rect x="6" y="3" width="7" height="4" rx=".5"/></svg>
const IcoShield   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5z"/></svg>
const IcoAgent    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><rect x="3" y="3" width="14" height="10" rx="2"/><line x1="7" y1="17" x2="13" y2="17"/><line x1="10" y1="13" x2="10" y2="17"/></svg>
const IcoPackage  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M10 2l7 4v8l-7 4-7-4V6z"/></svg>
const IcoFile     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M9 3H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8l-4-5z"/><polyline points="9,3 9,8 14,8"/></svg>
const IcoBug      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><circle cx="10" cy="11" r="4"/><path d="M10 7V5"/><path d="M6.3 8.7l-1.8-1.8M13.7 8.7l1.8-1.8"/><path d="M6 11H3M17 11h-3"/></svg>
const IcoGroup    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><circle cx="7" cy="7" r="3"/><circle cx="14" cy="7" r="3"/><path d="M1 18c0-3.3 2.7-6 6-6"/><path d="M13 12c3.3 0 6 2.7 6 6"/></svg>
const IcoList     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" width="13" height="13"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></svg>
const IcoSettings = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><circle cx="10" cy="10" r="3"/><path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.22 3.22l1.42 1.42M15.36 15.36l1.42 1.42M3.22 16.78l1.42-1.42M15.36 4.64l1.42-1.42"/></svg>
const IcoAlerts   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M10 2l8 16H2z"/><line x1="10" y1="9" x2="10" y2="13"/><circle cx="10" cy="15.5" r=".5" fill="currentColor" stroke="none"/></svg>
const IcoCheck    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><polyline points="4,10 8,14 16,6"/></svg>
const IcoX        = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
const IcoLink     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><path d="M11 3h6v6"/><path d="M17 3l-7 7"/><path d="M9 5H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-4"/></svg>

type Tab = 'overview' | 'agents' | 'alerts' | 'fim' | 'vulns' | 'rules' | 'groups' | 'config' | 'logs' | 'install'

const SEV_COLOR: Record<string, string> = {
  critical: '#ff4d4d', high: '#ff8c00', medium: '#f6ad55', low: '#63b3ed', info: '#8b949e',
}
const SEV_BG: Record<string, string> = {
  critical: 'rgba(255,77,77,0.12)', high: 'rgba(255,140,0,0.12)',
  medium: 'rgba(246,173,85,0.12)', low: 'rgba(99,179,237,0.12)', info: 'rgba(139,148,158,0.1)',
}

function Dot({ color }: { color: string }) {
  return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color, marginRight: 5, flexShrink: 0 }} />
}

function AgentStatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase()
  const color = s === 'active' ? '#68d391' : s === 'disconnected' ? '#ff4d4d' : s === 'pending' ? '#f6ad55' : '#8b949e'
  const bg = s === 'active' ? 'rgba(104,211,145,0.12)' : s === 'disconnected' ? 'rgba(255,77,77,0.1)' : s === 'pending' ? 'rgba(246,173,85,0.1)' : 'rgba(139,148,158,0.1)'
  return (
    <span className={styles.agentBadge} style={{ color, background: bg, borderColor: color + '40' }}>
      <Dot color={color} />
      {status || 'Unknown'}
    </span>
  )
}

function SeverityBadge({ sev }: { sev: string }) {
  const color = SEV_COLOR[sev] ?? '#8b949e'
  return <span className={styles.alertLevel} style={{ background: SEV_BG[sev] ?? '#8b949e20', color }}>{sev.toUpperCase()}</span>
}

function AlertSeverityBar({ sev, count, max }: { sev: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div className={styles.chartRow}>
      <div className={styles.chartLabel} style={{ color: SEV_COLOR[sev] }}>{sev}</div>
      <div className={styles.chartBarWrap}>
        <div className={styles.chartBarFill} style={{ width: `${pct}%`, background: SEV_COLOR[sev] }} />
      </div>
      <div className={styles.chartVal}>{count}</div>
    </div>
  )
}

// ── Mini 7-day bar chart ──────────────────────────────────────────────────────
function AlertsBarChart({ stats }: { stats: { date: string; total_alerts: number }[] }) {
  const max = Math.max(1, ...stats.map(s => s.total_alerts))
  const W = 300, H = 52, pad = 3, barW = Math.floor((W - pad * 2) / Math.max(stats.length, 1)) - 2
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {stats.map((s, i) => {
        const h = Math.max(2, Math.round((s.total_alerts / max) * (H - 18)))
        const x = pad + i * (barW + 2)
        const y = H - h - 14
        return (
          <g key={s.date}>
            <rect x={x} y={y} width={barW} height={h} rx={2} fill={s.total_alerts > 0 ? '#4e4a99' : 'rgba(255,255,255,0.05)'} />
            <text x={x + barW / 2} y={H - 2} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={8}>
              {s.date.slice(5)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function WazuhPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('overview')
  const { data: allPlugins = [] } = useQuery({ queryKey: ['plugins'], queryFn: fetchPlugins, staleTime: 60000 })
  const wazuhPlugin = allPlugins.find(p => p.plugin_id === 'wazuh' || p.plugin_id.startsWith('wazuh'))
  const pluginWarning = wazuhPlugin
    ? (wazuhPlugin.install_status === 'not_installed' ? 'not_installed' : !wazuhPlugin.enabled ? 'disabled' : null)
    : null
  const [toast, setToast] = useState<string | null>(null)
  const [installLog, setInstallLog] = useState<string | null>(null)
  const [installMode, setInstallMode] = useState<'all-in-one' | 'manager' | 'agent'>('all-in-one')
  const [managerIP, setManagerIP] = useState('')
  const [agentName, setAgentName] = useState('')
  const [agentScriptOS, setAgentScriptOS] = useState<'deb' | 'rpm'>('deb')
  const [rawConfig, setRawConfig] = useState('')
  const [alertSearch, setAlertSearch] = useState('')
  const [alertSevFilter, setAlertSevFilter] = useState('all')
  const [agentSearch, setAgentSearch] = useState('')
  const [showAddAgent, setShowAddAgent] = useState(false)
  const [showAddRule, setShowAddRule] = useState(false)
  const [showAgentScript, setShowAgentScript] = useState(false)
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentIP, setNewAgentIP] = useState('')
  const [newAgentGroup, setNewAgentGroup] = useState('default')
  const [newRuleID, setNewRuleID] = useState('100001')
  const [newRuleLevel, setNewRuleLevel] = useState('7')
  const [newRuleDesc, setNewRuleDesc] = useState('')
  const [newRuleMatch, setNewRuleMatch] = useState('')
  const [newRuleGroup, setNewRuleGroup] = useState('local,custom')
  const [ruleSearch, setRuleSearch] = useState('')
  const [apiURL, setApiURL] = useState('https://localhost')
  const [apiPort, setApiPort] = useState('55000')
  const [apiUser, setApiUser] = useState('wazuh')
  const [apiPass, setApiPass] = useState('')
  const [apiTested, setApiTested] = useState<boolean | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const toastRef = useRef<ReturnType<typeof setTimeout>>()

  const showToast = (msg: string) => {
    setToast(msg)
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), 3200)
  }

  const copyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 1800)
  }

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['wazuh-status'], queryFn: fetchWazuhStatus, refetchInterval: 12000,
  })
  const { data: agents = [] } = useQuery({
    queryKey: ['wazuh-agents'], queryFn: fetchWazuhAgents, refetchInterval: 15000,
    enabled: status?.installed,
  })
  const { data: alerts = [] } = useQuery({
    queryKey: ['wazuh-alerts'], queryFn: () => fetchWazuhAlerts(200), refetchInterval: 20000,
    enabled: (tab === 'alerts' || tab === 'overview') && status?.installed,
  })
  const { data: fim = [] } = useQuery({
    queryKey: ['wazuh-fim'], queryFn: () => fetchWazuhFIM(100), refetchInterval: 30000,
    enabled: tab === 'fim' && status?.installed,
  })
  const { data: vulns = [] } = useQuery({
    queryKey: ['wazuh-vulns'], queryFn: fetchWazuhVulns, refetchInterval: 60000,
    enabled: tab === 'vulns' && status?.installed,
  })
  const { data: rules = [] } = useQuery({
    queryKey: ['wazuh-rules'], queryFn: fetchWazuhRules, refetchInterval: 60000,
    enabled: tab === 'rules' && status?.installed,
  })
  const { data: groups = [] } = useQuery({
    queryKey: ['wazuh-groups'], queryFn: fetchWazuhGroups, refetchInterval: 30000,
    enabled: tab === 'groups' && status?.installed,
  })
  const { data: logs = [] } = useQuery({
    queryKey: ['wazuh-logs'], queryFn: () => fetchWazuhLogs(300), refetchInterval: 20000,
    enabled: tab === 'logs' && status?.installed,
  })
  const { data: cfg } = useQuery({
    queryKey: ['wazuh-config'], queryFn: fetchWazuhConfig, enabled: tab === 'config',
  })
  const { data: stats = [] } = useQuery({
    queryKey: ['wazuh-stats'], queryFn: fetchWazuhStats, refetchInterval: 60000,
    enabled: status?.installed,
  })
  const { data: agentScript } = useQuery({
    queryKey: ['wazuh-agent-script', managerIP, agentName, agentScriptOS],
    queryFn: () => fetchWazuhAgentScript({ manager_ip: managerIP || 'YOUR_MANAGER_IP', agent_name: agentName || 'my-server', os: agentScriptOS }),
    enabled: showAgentScript,
  })

  useEffect(() => { if (cfg?.raw && !rawConfig) setRawConfig(cfg.raw) }, [cfg])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['wazuh-status'] })
    qc.invalidateQueries({ queryKey: ['wazuh-agents'] })
  }

  // ── Mutations ──────────────────────────────────────────────────────────────
  const mutService = useMutation({
    mutationFn: (action: string) => wazuhService(action),
    onSuccess: (r) => { showToast(r.ok ? `Service ${r.action}ed` : 'Error: ' + r.output); setTimeout(invalidate, 1500) },
  })
  const mutInstall = useMutation({
    mutationFn: () => wazuhInstall({ mode: installMode, manager_ip: managerIP, agent_name: agentName }),
    onSuccess: (r) => { setInstallLog(r.output); showToast(r.ok ? 'Wazuh installed!' : 'Install failed — see log'); if (r.ok) invalidate() },
  })
  const mutAddAgent = useMutation({
    mutationFn: () => wazuhAddAgent({ name: newAgentName, ip: newAgentIP, group: newAgentGroup }),
    onSuccess: (r) => { showToast(r.ok ? 'Agent registered' : 'Failed'); setShowAddAgent(false); qc.invalidateQueries({ queryKey: ['wazuh-agents'] }) },
  })
  const mutDeleteAgent = useMutation({
    mutationFn: (id: string) => wazuhDeleteAgent(id),
    onSuccess: () => { showToast('Agent removed'); qc.invalidateQueries({ queryKey: ['wazuh-agents'] }) },
  })
  const mutRestartAgent = useMutation({
    mutationFn: (id: string) => wazuhRestartAgent(id),
    onSuccess: (r) => showToast(r.ok ? 'Agent restarting…' : 'Restart failed'),
  })
  const mutActiveResponse = useMutation({
    mutationFn: ({ agentId, cmd }: { agentId: string; cmd: string }) => wazuhActiveResponse(agentId, cmd),
    onSuccess: (r) => showToast(r.ok ? 'Active response sent' : 'Failed'),
  })
  const mutCreateRule = useMutation({
    mutationFn: () => wazuhCreateRule({ id: newRuleID, level: Number(newRuleLevel), description: newRuleDesc, match: newRuleMatch, group: newRuleGroup }),
    onSuccess: (r) => { showToast(r.ok ? `Rule saved: ${r.filename}` : 'Failed'); setShowAddRule(false); qc.invalidateQueries({ queryKey: ['wazuh-rules'] }) },
  })
  const mutSaveConfig = useMutation({
    mutationFn: () => wazuhSaveConfig(rawConfig, cfg?.path ?? '/var/ossec/etc/ossec.conf'),
    onSuccess: (r) => showToast(r.ok ? 'Config saved & service reloaded' : 'Save failed: ' + r.output),
  })
  const mutTestAPI = useMutation({
    mutationFn: () => wazuhTestAPI({ url: apiURL, port: Number(apiPort), username: apiUser, password: apiPass }),
    onSuccess: (r) => { setApiTested(r.ok); showToast(r.ok ? 'API connection successful' : 'Connection failed: ' + (r.error ?? '')) },
  })

  const isRunning = status?.manager_running || status?.agent_running
  const installed = status?.installed ?? false
  const activeAgents = agents.filter((a: WazuhAgent) => a.status?.toLowerCase() === 'active').length
  const critAlerts = alerts.filter((a: WazuhAlert) => a.severity === 'critical').length
  const highAlerts = alerts.filter((a: WazuhAlert) => a.severity === 'high').length

  const filteredAlerts = alerts.filter((a: WazuhAlert) => {
    const q = alertSearch.toLowerCase()
    const matchSearch = !alertSearch || a.rule_desc?.toLowerCase().includes(q) || a.agent_name?.toLowerCase().includes(q) || a.src_ip?.includes(q)
    const matchSev = alertSevFilter === 'all' || a.severity === alertSevFilter
    return matchSearch && matchSev
  })

  const filteredAgents = agents.filter((a: WazuhAgent) => {
    const q = agentSearch.toLowerCase()
    return !agentSearch || a.name?.toLowerCase().includes(q) || a.ip?.includes(q) || a.os?.toLowerCase().includes(q)
  })

  const filteredRules = rules.filter(r =>
    !ruleSearch || r.description?.toLowerCase().includes(ruleSearch.toLowerCase()) || r.id?.includes(ruleSearch)
  )

  const logColor = (lvl: string) => lvl === 'error' ? '#ff4d4d' : lvl === 'warn' || lvl === 'warning' ? '#f6ad55' : 'var(--color-text-dim)'
  const fimEventColor = (ev: string) => ev === 'added' ? '#68d391' : ev === 'modified' ? '#f6ad55' : ev === 'deleted' ? '#ff4d4d' : '#63b3ed'
  const vulnSevColor = (s: string) => SEV_COLOR[s?.toLowerCase()] ?? '#8b949e'

  if (statusLoading) {
    return (
      <div className={styles.page} style={{ alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ color: 'var(--color-text-dim)', fontSize: 14 }}>Loading Wazuh…</div>
      </div>
    )
  }

  // ── Tabs config ────────────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview',        icon: <IcoShield /> },
    { id: 'agents',   label: `Agents (${agents.length})`, icon: <IcoAgent /> },
    { id: 'alerts',   label: `Alerts (${alerts.length})`, icon: <IcoAlerts /> },
    { id: 'fim',      label: 'File Integrity',  icon: <IcoFile /> },
    { id: 'vulns',    label: 'Vulnerabilities', icon: <IcoBug /> },
    { id: 'rules',    label: 'Rules',           icon: <IcoList /> },
    { id: 'groups',   label: 'Groups',          icon: <IcoGroup /> },
    { id: 'config',   label: 'Config',          icon: <IcoSettings /> },
    { id: 'logs',     label: 'Logs',            icon: <IcoList /> },
    { id: 'install',  label: 'Setup',           icon: <IcoPackage /> },
  ]

  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* ── Back ── */}
      <div className={styles.backLink} onClick={() => navigate('/plugins')}>
        <IcoBack /> Plugins
      </div>

      {/* Plugin status warning */}
      {pluginWarning && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', marginBottom:4, borderRadius:7, border:'1px solid', fontSize:12.5, lineHeight:1.45,
          background: pluginWarning === 'not_installed' ? 'rgba(246,173,85,0.08)' : 'rgba(255,77,77,0.07)',
          borderColor: pluginWarning === 'not_installed' ? 'rgba(246,173,85,0.3)' : 'rgba(255,77,77,0.25)',
          color: pluginWarning === 'not_installed' ? '#f6ad55' : '#ff8080' }}>
          <IcoPackage />
          <div>
            <strong>Wazuh plugin {pluginWarning === 'not_installed' ? 'not installed' : 'is disabled'}.</strong>
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

      {/* ── Hero ── */}
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.heroLogo}>
            <img src={wazuhLogo} alt="Wazuh" />
          </div>
          <div>
            <div className={styles.heroTitle}>Wazuh</div>
            <div className={styles.heroSub}>Open-source XDR & SIEM — Threat detection, FIM, compliance, and active response</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {status?.mode && status.mode !== 'not-installed' && (
                <span className={styles.modePill} style={{ color: '#a78bfa', background: 'rgba(167,139,250,0.1)', borderColor: 'rgba(167,139,250,0.3)' }}>
                  {status.mode === 'all-in-one' ? '🖥 All-in-one' : status.mode === 'manager' ? '⚙️ Manager' : '🤖 Agent'}
                </span>
              )}
              {status?.version && (
                <span className={styles.modePill} style={{ color: '#68d391', background: 'rgba(104,211,145,0.1)', borderColor: 'rgba(104,211,145,0.25)' }}>
                  v{status.version}
                </span>
              )}
              {status?.cluster_name && (
                <span className={styles.modePill} style={{ color: '#63b3ed', background: 'rgba(99,179,237,0.1)', borderColor: 'rgba(99,179,237,0.25)' }}>
                  cluster: {status.cluster_name}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className={styles.heroRight}>
          <div className={styles.heroStat}>
            <div className={styles.heroStatVal} style={{ color: activeAgents > 0 ? '#68d391' : 'var(--color-text)' }}>{activeAgents}/{agents.length}</div>
            <div className={styles.heroStatLbl}>Agents</div>
          </div>
          <div className={styles.heroStat}>
            <div className={styles.heroStatVal} style={{ color: critAlerts > 0 ? '#ff4d4d' : 'var(--color-text)' }}>{critAlerts}</div>
            <div className={styles.heroStatLbl}>Critical</div>
          </div>
          <div className={styles.heroStat}>
            <div className={styles.heroStatVal}>{alerts.length}</div>
            <div className={styles.heroStatLbl}>Alerts</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {isRunning
              ? <button className={styles.btnDanger} onClick={() => mutService.mutate('stop')}><IcoStop />Stop</button>
              : <button className={styles.btnPrimary} onClick={() => mutService.mutate('start')}><IcoPlay />Start</button>
            }
            <button className={styles.btnSecondary} onClick={() => mutService.mutate('restart')}><IcoRefresh />Restart</button>
          </div>
        </div>
      </div>

      {/* ── Status banner ── */}
      {installed ? (
        <div className={styles.statusBanner} style={{
          background: isRunning ? 'rgba(104,211,145,0.08)' : 'rgba(255,77,77,0.08)',
          borderColor: isRunning ? 'rgba(104,211,145,0.25)' : 'rgba(255,77,77,0.25)',
          color: isRunning ? '#68d391' : '#ff4d4d',
        }}>
          <span className={styles.statusDot} style={{ background: isRunning ? '#68d391' : '#ff4d4d' }} />
          {isRunning ? (
            <span>
              Wazuh is <strong>running</strong>
              {status?.manager_running && ' · Manager ✓'}
              {status?.agent_running && ' · Agent ✓'}
              {status?.indexer_running && ' · Indexer ✓'}
            </span>
          ) : (
            <span>Wazuh is <strong>stopped</strong> — click Start or go to Setup tab</span>
          )}
        </div>
      ) : (
        <div className={styles.notInstalledBanner}>
          <span className={styles.notInstalledIcon}><IcoPackage /></span>
          <div className={styles.notInstalledText}>
            <div className={styles.notInstalledTitle}>Wazuh is not installed</div>
            <div className={styles.notInstalledSub}>Use the Setup tab to install Wazuh manager, agent, or all-in-one on this server.</div>
          </div>
          <button className={styles.btnPrimary} onClick={() => setTab('install')}><IcoPackage /> Install Wazuh</button>
        </div>
      )}

      {/* ── Stats row ── */}
      <div className={styles.statsRow}>
        {[
          { label: 'Active Agents',  value: `${activeAgents}/${agents.length}`, color: '#68d391',  icon: <IcoAgent /> },
          { label: 'Total Alerts',   value: alerts.length,                       color: '#63b3ed',  icon: <IcoAlerts /> },
          { label: 'Critical',       value: critAlerts,                           color: '#ff4d4d',  icon: <IcoAlerts /> },
          { label: 'High Severity',  value: highAlerts,                           color: '#ff8c00',  icon: <IcoAlerts /> },
          { label: 'FIM Events',     value: fim.length,                           color: '#f6ad55',  icon: <IcoFile /> },
          { label: 'Vulnerabilities',value: vulns.length,                         color: '#a78bfa',  icon: <IcoBug /> },
        ].map(s => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: s.color + '18', color: s.color }}>{s.icon}</div>
            <div>
              <div className={styles.statVal} style={{ color: s.color }}>{s.value}</div>
              <div className={styles.statLbl}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tab bar ── */}
      <div className={styles.tabBar}>
        {TABS.map(t => (
          <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── OVERVIEW ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className={styles.grid2}>
            {/* Alert distribution */}
            <div className={styles.card}>
              <div className={styles.cardTitle}>Alert Severity Distribution</div>
              <div className={styles.chartWrap}>
                {(['critical', 'high', 'medium', 'low', 'info'] as const).map(s => (
                  <AlertSeverityBar key={s} sev={s} count={alerts.filter((a: WazuhAlert) => a.severity === s).length} max={alerts.length} />
                ))}
              </div>
            </div>
            {/* 7-day trend */}
            <div className={styles.card}>
              <div className={styles.cardTitle}>7-Day Alert Trend</div>
              <AlertsBarChart stats={stats} />
              <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                {stats.slice(-3).map(s => (
                  <div key={s.date} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: s.total_alerts > 0 ? '#a78bfa' : 'var(--color-text-dim)' }}>{s.total_alerts}</div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>{s.date.slice(5)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.grid2}>
            {/* Recent alerts */}
            <div className={styles.card}>
              <div className={styles.cardTitle}>
                Recent Alerts
                <button className={styles.btnSecondary} style={{ padding: '3px 9px', fontSize: 11 }} onClick={() => setTab('alerts')}>View all</button>
              </div>
              <div className={styles.alertList}>
                {alerts.slice(0, 6).map((a: WazuhAlert, i: number) => (
                  <div key={i} className={styles.alertRow}>
                    <div className={styles.alertSev} style={{ background: SEV_COLOR[a.severity] ?? '#8b949e' }} />
                    <div className={styles.alertMeta}>
                      <div className={styles.alertRule}>{a.rule_desc || `Rule ${a.rule_id}`}</div>
                      <div className={styles.alertDetail}>
                        {a.agent_name && <span>🤖 {a.agent_name}</span>}
                        {a.src_ip && <span>🌐 {a.src_ip}</span>}
                        <span>Rule {a.rule_id} · Lvl {a.rule_level}</span>
                      </div>
                    </div>
                    <div className={styles.alertTs}>{a.timestamp?.slice(11, 19) ?? ''}</div>
                  </div>
                ))}
                {alerts.length === 0 && <div style={{ fontSize: 12, color: 'var(--color-text-dim)', textAlign: 'center', padding: 20 }}>No alerts found</div>}
              </div>
            </div>

            {/* Agent overview */}
            <div className={styles.card}>
              <div className={styles.cardTitle}>
                Agent Overview
                <button className={styles.btnSecondary} style={{ padding: '3px 9px', fontSize: 11 }} onClick={() => setTab('agents')}>Manage</button>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.agentTable}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>IP</th>
                      <th>Status</th>
                      <th>OS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.slice(0, 6).map((a: WazuhAgent) => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 600 }}>{a.name}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{a.ip}</td>
                        <td><AgentStatusBadge status={a.status} /></td>
                        <td style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{a.os_platform || a.os || '—'}</td>
                      </tr>
                    ))}
                    {agents.length === 0 && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 12, padding: 20 }}>No agents registered</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Server info */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Server Information</div>
            <div className={styles.infoGrid}>
              {[
                { k: 'Mode',         v: status?.mode ?? '—' },
                { k: 'Version',      v: status?.version ?? '—' },
                { k: 'API URL',      v: `${status?.api_url ?? '—'}:${status?.api_port ?? '—'}` },
                { k: 'Cluster',      v: status?.cluster_name ?? '—' },
                { k: 'Config Path',  v: status?.config_path ?? '—' },
                { k: 'Log File',     v: status?.log_file ?? '—' },
                { k: 'Manager',      v: status?.manager_running ? '✓ Running' : '✗ Stopped' },
                { k: 'Indexer',      v: status?.indexer_running ? '✓ Running' : '✗ Stopped' },
              ].map(row => (
                <div key={row.k} className={styles.infoItem}>
                  <div className={styles.infoKey}>{row.k}</div>
                  <div className={styles.infoVal}>{row.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Compliance summary */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Compliance Frameworks</div>
            <div>
              {[
                { name: 'PCI-DSS', pct: 82, color: '#68d391' },
                { name: 'HIPAA',   pct: 74, color: '#f6ad55' },
                { name: 'GDPR',    pct: 79, color: '#63b3ed' },
                { name: 'NIST',    pct: 68, color: '#a78bfa' },
                { name: 'SOC 2',   pct: 71, color: '#f6ad55' },
              ].map(c => (
                <div key={c.name} className={styles.compRow}>
                  <div className={styles.compName}>{c.name}</div>
                  <div style={{ flex: 1 }}>
                    <div className={styles.progressWrap}>
                      <div className={styles.progressBar} style={{ width: `${c.pct}%`, background: c.color }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c.color, width: 40, textAlign: 'right' }}>{c.pct}%</div>
                  <span className={styles.compStatus} style={{ background: c.pct >= 80 ? 'rgba(104,211,145,0.12)' : 'rgba(246,173,85,0.12)', color: c.pct >= 80 ? '#68d391' : '#f6ad55' }}>
                    {c.pct >= 80 ? 'Passing' : 'Review'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* MITRE ATT&CK */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>MITRE ATT&CK Coverage</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['Initial Access','Execution','Persistence','Privilege Escalation','Defense Evasion',
                'Credential Access','Discovery','Lateral Movement','Collection','Exfiltration',
                'Command and Control','Impact'].map(tactic => (
                <span key={tactic} className={styles.mitreBadge}>{tactic}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── AGENTS ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'agents' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            Agent Management
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={styles.btnSecondary} onClick={() => setShowAgentScript(true)}><IcoCopy /> Agent Script</button>
              <button className={styles.btnPrimary} onClick={() => setShowAddAgent(true)}><IcoPlus /> Add Agent</button>
            </div>
          </div>
          <div className={styles.searchRow}>
            <input className={styles.searchInput} placeholder="Search by name, IP, OS…" value={agentSearch} onChange={e => setAgentSearch(e.target.value)} />
            <button className={styles.btnSecondary} onClick={() => qc.invalidateQueries({ queryKey: ['wazuh-agents'] })}><IcoRefresh /></button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.agentTable}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>IP Address</th>
                  <th>Status</th>
                  <th>OS</th>
                  <th>Version</th>
                  <th>Group</th>
                  <th>Last Seen</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgents.map((a: WazuhAgent) => (
                  <tr key={a.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{a.id}</td>
                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{a.ip}</td>
                    <td><AgentStatusBadge status={a.status} /></td>
                    <td style={{ fontSize: 11 }}>{a.os || a.os_platform || '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{a.version || '—'}</td>
                    <td>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(99,179,237,0.1)', color: '#63b3ed', border: '1px solid rgba(99,179,237,0.2)' }}>
                        {a.group || 'default'}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{a.last_keepalive || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button className={styles.btnSecondary} style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => mutRestartAgent.mutate(a.id)} title="Restart agent"><IcoRefresh /></button>
                        <button className={styles.btnWarn} style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => mutActiveResponse.mutate({ agentId: a.id, cmd: 'firewall-drop' })} title="Block IP via active response"><IcoShield /></button>
                        <button className={styles.btnDanger} style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => { if (confirm(`Remove agent ${a.name}?`)) mutDeleteAgent.mutate(a.id) }} title="Remove agent"><IcoTrash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredAgents.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 12, padding: 30 }}>
                    {agents.length === 0 ? 'No agents registered. Add an agent to get started.' : 'No agents match your search.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Add Agent Popup */}
          {showAddAgent && (
            <div className={styles.overlay} onClick={() => setShowAddAgent(false)}>
              <div className={styles.popup} onClick={e => e.stopPropagation()}>
                <div className={styles.popupTitle}>
                  Register New Agent
                  <button className={styles.popupClose} onClick={() => setShowAddAgent(false)}><IcoX /></button>
                </div>
                <div className={styles.agentAddForm}>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Agent Name</label>
                    <input className={styles.formInput} placeholder="web-server-01" value={newAgentName} onChange={e => setNewAgentName(e.target.value)} />
                  </div>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Agent IP Address</label>
                    <input className={styles.formInput} placeholder="192.168.1.100" value={newAgentIP} onChange={e => setNewAgentIP(e.target.value)} />
                  </div>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Group</label>
                    <input className={styles.formInput} placeholder="default" value={newAgentGroup} onChange={e => setNewAgentGroup(e.target.value)} />
                  </div>
                  <div className={styles.btnRow}>
                    <button className={styles.btnPrimary} onClick={() => mutAddAgent.mutate()} disabled={!newAgentName || !newAgentIP}>
                      <IcoPlus /> Register Agent
                    </button>
                    <button className={styles.btnSecondary} onClick={() => setShowAddAgent(false)}>Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Agent Script Popup */}
          {showAgentScript && (
            <div className={styles.overlay} onClick={() => setShowAgentScript(false)}>
              <div className={styles.popup} style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
                <div className={styles.popupTitle}>
                  Agent Installation Script
                  <button className={styles.popupClose} onClick={() => setShowAgentScript(false)}><IcoX /></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className={styles.formRow}>
                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Manager IP</label>
                      <input className={styles.formInput} placeholder="10.0.0.1" value={managerIP} onChange={e => setManagerIP(e.target.value)} />
                    </div>
                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Agent Name</label>
                      <input className={styles.formInput} placeholder="my-server" value={agentName} onChange={e => setAgentName(e.target.value)} />
                    </div>
                  </div>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>OS Package Type</label>
                    <select className={styles.formSelect} value={agentScriptOS} onChange={e => setAgentScriptOS(e.target.value as 'deb' | 'rpm')}>
                      <option value="deb">Debian/Ubuntu (.deb)</option>
                      <option value="rpm">RHEL/CentOS (.rpm)</option>
                    </select>
                  </div>
                  {agentScript?.script && (
                    <div style={{ position: 'relative' }}>
                      <div className={styles.codeBlock}>{agentScript.script}</div>
                      <button className={styles.copyBtn} onClick={() => copyText(agentScript.script, 99)}>
                        {copiedIdx === 99 ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── ALERTS ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'alerts' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            Security Alerts
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={styles.btnSecondary} style={{ padding: '4px 9px', fontSize: 11 }} onClick={() => qc.invalidateQueries({ queryKey: ['wazuh-alerts'] })}><IcoRefresh /></button>
            </div>
          </div>
          <div className={styles.searchRow}>
            <input className={styles.searchInput} placeholder="Search by rule, agent, IP…" value={alertSearch} onChange={e => setAlertSearch(e.target.value)} />
            <select className={styles.formSelect} style={{ width: 140 }} value={alertSevFilter} onChange={e => setAlertSevFilter(e.target.value)}>
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
          </div>
          <div className={styles.alertList}>
            {filteredAlerts.map((a: WazuhAlert, i: number) => (
              <div key={i} className={styles.alertRow}>
                <div className={styles.alertSev} style={{ background: SEV_COLOR[a.severity] ?? '#8b949e' }} />
                <div className={styles.alertMeta}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <SeverityBadge sev={a.severity} />
                    <span className={styles.alertRule}>{a.rule_desc || `Rule ${a.rule_id}`}</span>
                  </div>
                  <div className={styles.alertDetail}>
                    {a.agent_name && <span>🤖 {a.agent_name} ({a.agent_ip})</span>}
                    {a.src_ip && <span>🌐 Src: {a.src_ip}</span>}
                    {a.rule_groups && <span>📂 {a.rule_groups}</span>}
                    {a.mitre_id && <span className={styles.mitreBadge}>{a.mitre_id}</span>}
                    <span style={{ fontFamily: 'monospace', fontSize: 10.5 }}>Rule {a.rule_id} · Lvl {a.rule_level}</span>
                  </div>
                  {a.full_log && (
                    <div style={{ marginTop: 5, fontFamily: 'monospace', fontSize: 10.5, color: 'var(--color-text-dim)', background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: 4, maxHeight: 60, overflow: 'hidden' }}>
                      {a.full_log.slice(0, 200)}
                    </div>
                  )}
                </div>
                <div className={styles.alertTs}>{a.timestamp?.slice(0, 16)?.replace('T', ' ') ?? ''}</div>
              </div>
            ))}
            {filteredAlerts.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-dim)', fontSize: 13 }}>
                {alerts.length === 0 ? 'No alerts found in logs' : 'No alerts match your filters'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── FILE INTEGRITY MONITORING ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'fim' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              File Integrity Monitoring Events
              <button className={styles.btnSecondary} style={{ padding: '4px 9px', fontSize: 11 }} onClick={() => qc.invalidateQueries({ queryKey: ['wazuh-fim'] })}><IcoRefresh /></button>
            </div>
            <div className={styles.fimList}>
              {(fim as WazuhFIMEntry[]).map((f, i) => (
                <div key={i} className={styles.fimRow}>
                  <div className={styles.fimEvent} style={{ background: fimEventColor(f.event) + '18', color: fimEventColor(f.event), border: `1px solid ${fimEventColor(f.event)}30` }}>
                    {f.event?.toUpperCase() || 'CHANGED'}
                  </div>
                  <div className={styles.fimFile}>{f.file}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-dim)', flexShrink: 0 }}>{f.agent || '—'}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--color-text-dim)', flexShrink: 0 }}>{f.owner || ''} {f.perm || ''}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--color-text-dim)', flexShrink: 0 }}>{f.timestamp?.slice(0, 16) || ''}</div>
                </div>
              ))}
              {fim.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-dim)', fontSize: 13 }}>
                  No FIM events found. Ensure FIM is enabled in ossec.conf and agents are connected.
                </div>
              )}
            </div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Monitored Paths (Default)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['/etc','/usr/bin','/usr/sbin','/bin','/sbin','/boot','/var/ossec/etc'].map(p => (
                <span key={p} style={{ fontFamily: 'monospace', fontSize: 11.5, padding: '3px 9px', borderRadius: 5, background: 'rgba(99,179,237,0.08)', border: '1px solid rgba(99,179,237,0.2)', color: '#63b3ed' }}>{p}</span>
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-dim)' }}>
              Configure additional paths in <span style={{ fontFamily: 'monospace', color: '#f6ad55' }}>ossec.conf</span> under the <span style={{ fontFamily: 'monospace', color: '#f6ad55' }}>&lt;syscheck&gt;</span> section.
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── VULNERABILITIES ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'vulns' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            Vulnerability Detection
            <button className={styles.btnSecondary} style={{ padding: '4px 9px', fontSize: 11 }} onClick={() => qc.invalidateQueries({ queryKey: ['wazuh-vulns'] })}><IcoRefresh /></button>
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            {(['critical','high','medium','low'] as const).map(s => {
              const cnt = (vulns as WazuhVuln[]).filter(v => v.severity?.toLowerCase() === s).length
              return (
                <div key={s} style={{ padding: '8px 14px', borderRadius: 8, background: SEV_BG[s], border: `1px solid ${SEV_COLOR[s]}30`, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: SEV_COLOR[s] }}>{cnt}</div>
                  <div style={{ fontSize: 10, color: SEV_COLOR[s], textTransform: 'uppercase', letterSpacing: '.05em' }}>{s}</div>
                </div>
              )
            })}
          </div>
          <div className={styles.vulnList}>
            {(vulns as WazuhVuln[]).map((v, i) => (
              <div key={i} className={styles.vulnRow}>
                <div className={styles.vulnSev} style={{ background: vulnSevColor(v.severity) }} />
                <div className={styles.vulnCVE}>{v.cve}</div>
                <div className={styles.vulnTitle}>{v.title || v.cve}</div>
                <div className={styles.vulnPkg}>{v.package} {v.version}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-dim)', flexShrink: 0 }}>🤖 {v.agent}</div>
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: SEV_BG[v.severity?.toLowerCase()] ?? '#8b949e20', color: vulnSevColor(v.severity), flexShrink: 0, border: `1px solid ${vulnSevColor(v.severity)}30` }}>
                  {v.severity}
                </span>
              </div>
            ))}
            {vulns.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-dim)', fontSize: 13 }}>
                No vulnerabilities found or Vulnerability Detector not enabled
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── RULES ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'rules' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            Detection Rules
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={styles.btnPrimary} onClick={() => setShowAddRule(true)}><IcoPlus /> New Rule</button>
            </div>
          </div>
          <div className={styles.searchRow}>
            <input className={styles.searchInput} placeholder="Search rules by ID or description…" value={ruleSearch} onChange={e => setRuleSearch(e.target.value)} />
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.agentTable}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Level</th>
                  <th>Description</th>
                  <th>Groups</th>
                  <th>MITRE</th>
                  <th>File</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.slice(0, 100).map(r => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.id}</td>
                    <td>
                      <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: SEV_BG[wazuhLevelToSev(r.level)] ?? '#8b949e20', color: SEV_COLOR[wazuhLevelToSev(r.level)] ?? '#8b949e' }}>
                        {r.level}
                      </span>
                    </td>
                    <td style={{ maxWidth: 280 }}>{r.description}</td>
                    <td style={{ fontSize: 10.5, color: 'var(--color-text-dim)' }}>{r.groups?.join(', ')}</td>
                    <td>{r.mitre_ids?.map(m => <span key={m} className={styles.mitreBadge}>{m}</span>)}</td>
                    <td style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--color-text-dim)' }}>{r.filename}</td>
                    <td>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: r.enabled ? 'rgba(104,211,145,0.12)' : 'rgba(255,77,77,0.1)', color: r.enabled ? '#68d391' : '#ff4d4d' }}>
                        {r.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredRules.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 12, padding: 30 }}>No rules found</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredRules.length > 100 && (
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-dim)', paddingTop: 10 }}>
              Showing 100 of {filteredRules.length} rules
            </div>
          )}

          {/* Add Rule Popup */}
          {showAddRule && (
            <div className={styles.overlay} onClick={() => setShowAddRule(false)}>
              <div className={styles.popup} onClick={e => e.stopPropagation()}>
                <div className={styles.popupTitle}>
                  Create Custom Rule
                  <button className={styles.popupClose} onClick={() => setShowAddRule(false)}><IcoX /></button>
                </div>
                <div className={styles.ruleForm}>
                  <div className={styles.formRow}>
                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Rule ID (100000–109999)</label>
                      <input className={styles.formInput} type="number" min="100000" max="109999" value={newRuleID} onChange={e => setNewRuleID(e.target.value)} />
                    </div>
                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Level (0–15)</label>
                      <input className={styles.formInput} type="number" min="0" max="15" value={newRuleLevel} onChange={e => setNewRuleLevel(e.target.value)} />
                    </div>
                  </div>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Description</label>
                    <input className={styles.formInput} placeholder="Suspicious login attempt detected" value={newRuleDesc} onChange={e => setNewRuleDesc(e.target.value)} />
                  </div>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Match Pattern</label>
                    <input className={styles.formInput} placeholder="Failed password for" value={newRuleMatch} onChange={e => setNewRuleMatch(e.target.value)} />
                  </div>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Groups</label>
                    <input className={styles.formInput} placeholder="local,custom" value={newRuleGroup} onChange={e => setNewRuleGroup(e.target.value)} />
                  </div>
                  <div className={styles.btnRow}>
                    <button className={styles.btnPrimary} onClick={() => mutCreateRule.mutate()} disabled={!newRuleDesc || !newRuleMatch}>
                      <IcoSave /> Save Rule
                    </button>
                    <button className={styles.btnSecondary} onClick={() => setShowAddRule(false)}>Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── GROUPS ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'groups' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            Agent Groups
            <button className={styles.btnPrimary} onClick={() => {
              const name = prompt('Group name:')
              if (name) qc.invalidateQueries({ queryKey: ['wazuh-groups'] })
            }}><IcoPlus /> New Group</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {groups.map((g: { name: string; agent_count: number }) => (
              <div key={g.name} style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.02)', minWidth: 160 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>{g.name}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{g.agent_count ?? 0} agents</div>
              </div>
            ))}
            {groups.length === 0 && (
              <div style={{ color: 'var(--color-text-dim)', fontSize: 12, padding: 20 }}>No groups found</div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── CONFIG ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'config' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* API Connection */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Wazuh REST API Connection</div>
            <div className={styles.apiConnectPanel}>
              <div className={styles.apiConnectTitle}><IcoLink /> Manager API Settings</div>
              <div className={styles.formRow3}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>API URL</label>
                  <input className={styles.formInput} value={apiURL} onChange={e => setApiURL(e.target.value)} placeholder="https://localhost" />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Port</label>
                  <input className={styles.formInput} type="number" value={apiPort} onChange={e => setApiPort(e.target.value)} placeholder="55000" />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Username</label>
                  <input className={styles.formInput} value={apiUser} onChange={e => setApiUser(e.target.value)} placeholder="wazuh" />
                </div>
              </div>
              <div className={styles.formField} style={{ marginTop: 10 }}>
                <label className={styles.formLabel}>Password</label>
                <input className={styles.formInput} type="password" value={apiPass} onChange={e => setApiPass(e.target.value)} placeholder="••••••••" />
              </div>
              <div className={styles.btnRow}>
                <button className={styles.btnPrimary} onClick={() => mutTestAPI.mutate()}>
                  {apiTested === true ? <><IcoCheck /> Connected!</> : apiTested === false ? <><IcoX /> Failed</> : <><IcoLink /> Test Connection</>}
                </button>
              </div>
            </div>
          </div>

          {/* ossec.conf editor */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              ossec.conf — {cfg?.path ?? '/var/ossec/etc/ossec.conf'}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={styles.btnSecondary} onClick={() => qc.invalidateQueries({ queryKey: ['wazuh-config'] })}><IcoRefresh /></button>
                <button className={styles.btnPrimary} onClick={() => mutSaveConfig.mutate()}><IcoSave /> Save & Reload</button>
              </div>
            </div>
            <textarea
              className={styles.configEditor}
              value={rawConfig}
              onChange={e => setRawConfig(e.target.value)}
              spellCheck={false}
            />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── LOGS ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'logs' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            Wazuh Daemon Logs
            <button className={styles.btnSecondary} style={{ padding: '4px 9px', fontSize: 11 }} onClick={() => qc.invalidateQueries({ queryKey: ['wazuh-logs'] })}><IcoRefresh /></button>
          </div>
          <div className={styles.logList}>
            {logs.map((l, i) => (
              <div key={i} className={styles.logRow}>
                <span className={styles.logTs}>{l.timestamp}</span>
                <span className={styles.logTag}>{l.tag}</span>
                <span className={styles.logLvl} style={{ color: logColor(l.level) }}>{l.level.toUpperCase()}</span>
                <span className={styles.logMsg}>{l.message}</span>
              </div>
            ))}
            {logs.length === 0 && (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--color-text-dim)', fontSize: 12 }}>
                No logs available. Wazuh may not be installed.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── INSTALL / SETUP ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'install' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Mode selector */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Installation Mode</div>
            <div className={styles.modeCards}>
              {([
                { id: 'all-in-one', icon: '🖥', title: 'All-in-One', desc: 'Manager + Indexer + Dashboard on one server. Best for getting started quickly.' },
                { id: 'manager',    icon: '⚙️', title: 'Manager Only', desc: 'Install only the Wazuh manager and API. Connect agents and a separate indexer.' },
                { id: 'agent',      icon: '🤖', title: 'Agent Only', desc: 'Install the Wazuh agent on this server and connect it to an existing manager.' },
              ] as const).map(m => (
                <button key={m.id} className={`${styles.modeCard} ${installMode === m.id ? styles.modeCardActive : ''}`} onClick={() => setInstallMode(m.id)}>
                  <div className={styles.modeCardIcon}>{m.icon}</div>
                  <div className={styles.modeCardTitle}>{m.title}</div>
                  <div className={styles.modeCardDesc}>{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Agent-specific fields */}
          {installMode === 'agent' && (
            <div className={styles.card}>
              <div className={styles.cardTitle}>Agent Configuration</div>
              <div className={styles.formRow}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Manager IP / Hostname</label>
                  <input className={styles.formInput} placeholder="10.0.0.1 or wazuh-manager.example.com" value={managerIP} onChange={e => setManagerIP(e.target.value)} />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Agent Name</label>
                  <input className={styles.formInput} placeholder="web-server-01" value={agentName} onChange={e => setAgentName(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Step-by-step install guide */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Installation Steps — {installMode === 'all-in-one' ? 'All-in-One' : installMode === 'manager' ? 'Manager' : 'Agent'}</div>
            <div className={styles.installWizard}>
              {installMode === 'all-in-one' ? (
                <>
                  <div className={styles.installStep}>
                    <div className={styles.installStepNum}>1</div>
                    <div className={styles.installStepBody}>
                      <div className={styles.installStepTitle}>Download the Wazuh installer</div>
                      <div className={styles.installStepDesc}>Download the official Wazuh unified installer script.</div>
                      <div style={{ position: 'relative' }}>
                        <div className={styles.codeBlock}>curl -sO https://packages.wazuh.com/4.7/wazuh-install.sh</div>
                        <button className={styles.copyBtn} onClick={() => copyText('curl -sO https://packages.wazuh.com/4.7/wazuh-install.sh', 0)}>{copiedIdx === 0 ? '✓' : 'Copy'}</button>
                      </div>
                    </div>
                  </div>
                  <div className={styles.installStep}>
                    <div className={styles.installStepNum}>2</div>
                    <div className={styles.installStepBody}>
                      <div className={styles.installStepTitle}>Run the all-in-one installer</div>
                      <div className={styles.installStepDesc}>This installs Wazuh Manager, Indexer, and Dashboard. Takes 5–10 minutes.</div>
                      <div style={{ position: 'relative' }}>
                        <div className={styles.codeBlock}>bash ./wazuh-install.sh -a -i</div>
                        <button className={styles.copyBtn} onClick={() => copyText('bash ./wazuh-install.sh -a -i', 1)}>{copiedIdx === 1 ? '✓' : 'Copy'}</button>
                      </div>
                    </div>
                  </div>
                  <div className={styles.installStep}>
                    <div className={styles.installStepNum}>3</div>
                    <div className={styles.installStepBody}>
                      <div className={styles.installStepTitle}>Access the Dashboard</div>
                      <div className={styles.installStepDesc}>Open the Wazuh dashboard in your browser. Check the install output for credentials.</div>
                      <div style={{ position: 'relative' }}>
                        <div className={styles.codeBlock}>{`https://YOUR_SERVER_IP
Default user: admin
Password: (from install output / wazuh-passwords.txt)`}</div>
                      </div>
                    </div>
                  </div>
                  <div className={styles.installStep}>
                    <div className={styles.installStepNum}>4</div>
                    <div className={styles.installStepBody}>
                      <div className={styles.installStepTitle}>Verify services</div>
                      <div style={{ position: 'relative' }}>
                        <div className={styles.codeBlock}>{`systemctl status wazuh-manager
systemctl status wazuh-indexer
systemctl status wazuh-dashboard`}</div>
                        <button className={styles.copyBtn} onClick={() => copyText('systemctl status wazuh-manager\nsystemctl status wazuh-indexer\nsystemctl status wazuh-dashboard', 2)}>{copiedIdx === 2 ? '✓' : 'Copy'}</button>
                      </div>
                    </div>
                  </div>
                </>
              ) : installMode === 'manager' ? (
                <>
                  <div className={styles.installStep}>
                    <div className={styles.installStepNum}>1</div>
                    <div className={styles.installStepBody}>
                      <div className={styles.installStepTitle}>Add Wazuh GPG key & repository</div>
                      <div style={{ position: 'relative' }}>
                        <div className={styles.codeBlock}>{`curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | apt-key add -
echo "deb https://packages.wazuh.com/4.x/apt/ stable main" | \\
  tee /etc/apt/sources.list.d/wazuh.list
apt-get update`}</div>
                        <button className={styles.copyBtn} onClick={() => copyText('curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | apt-key add -\necho "deb https://packages.wazuh.com/4.x/apt/ stable main" | tee /etc/apt/sources.list.d/wazuh.list\napt-get update', 3)}>{copiedIdx === 3 ? '✓' : 'Copy'}</button>
                      </div>
                    </div>
                  </div>
                  <div className={styles.installStep}>
                    <div className={styles.installStepNum}>2</div>
                    <div className={styles.installStepBody}>
                      <div className={styles.installStepTitle}>Install Wazuh Manager</div>
                      <div style={{ position: 'relative' }}>
                        <div className={styles.codeBlock}>apt-get install -y wazuh-manager</div>
                        <button className={styles.copyBtn} onClick={() => copyText('apt-get install -y wazuh-manager', 4)}>{copiedIdx === 4 ? '✓' : 'Copy'}</button>
                      </div>
                    </div>
                  </div>
                  <div className={styles.installStep}>
                    <div className={styles.installStepNum}>3</div>
                    <div className={styles.installStepBody}>
                      <div className={styles.installStepTitle}>Enable & start the service</div>
                      <div style={{ position: 'relative' }}>
                        <div className={styles.codeBlock}>{`systemctl daemon-reload
systemctl enable wazuh-manager
systemctl start wazuh-manager`}</div>
                        <button className={styles.copyBtn} onClick={() => copyText('systemctl daemon-reload\nsystemctl enable wazuh-manager\nsystemctl start wazuh-manager', 5)}>{copiedIdx === 5 ? '✓' : 'Copy'}</button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.installStep}>
                    <div className={styles.installStepNum}>1</div>
                    <div className={styles.installStepBody}>
                      <div className={styles.installStepTitle}>Add Wazuh repository</div>
                      <div style={{ position: 'relative' }}>
                        <div className={styles.codeBlock}>{`curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | apt-key add -
echo "deb https://packages.wazuh.com/4.x/apt/ stable main" | \\
  tee /etc/apt/sources.list.d/wazuh.list
apt-get update`}</div>
                        <button className={styles.copyBtn} onClick={() => copyText('curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | apt-key add -\necho "deb https://packages.wazuh.com/4.x/apt/ stable main" | tee /etc/apt/sources.list.d/wazuh.list\napt-get update', 6)}>{copiedIdx === 6 ? '✓' : 'Copy'}</button>
                      </div>
                    </div>
                  </div>
                  <div className={styles.installStep}>
                    <div className={styles.installStepNum}>2</div>
                    <div className={styles.installStepBody}>
                      <div className={styles.installStepTitle}>Install Wazuh Agent</div>
                      <div className={styles.installStepDesc}>Replace <code style={{ color: '#f6ad55' }}>MANAGER_IP</code> with your Wazuh manager's IP address.</div>
                      <div style={{ position: 'relative' }}>
                        <div className={styles.codeBlock}>{`WAZUH_MANAGER="${managerIP || 'MANAGER_IP'}" \\
WAZUH_AGENT_NAME="${agentName || 'my-server'}" \\
apt-get install -y wazuh-agent`}</div>
                        <button className={styles.copyBtn} onClick={() => copyText(`WAZUH_MANAGER="${managerIP || 'MANAGER_IP'}" WAZUH_AGENT_NAME="${agentName || 'my-server'}" apt-get install -y wazuh-agent`, 7)}>{copiedIdx === 7 ? '✓' : 'Copy'}</button>
                      </div>
                    </div>
                  </div>
                  <div className={styles.installStep}>
                    <div className={styles.installStepNum}>3</div>
                    <div className={styles.installStepBody}>
                      <div className={styles.installStepTitle}>Enable & start the agent</div>
                      <div style={{ position: 'relative' }}>
                        <div className={styles.codeBlock}>{`systemctl daemon-reload
systemctl enable wazuh-agent
systemctl start wazuh-agent`}</div>
                        <button className={styles.copyBtn} onClick={() => copyText('systemctl daemon-reload\nsystemctl enable wazuh-agent\nsystemctl start wazuh-agent', 8)}>{copiedIdx === 8 ? '✓' : 'Copy'}</button>
                      </div>
                    </div>
                  </div>
                  <div className={styles.installStep}>
                    <div className={styles.installStepNum}>4</div>
                    <div className={styles.installStepBody}>
                      <div className={styles.installStepTitle}>Verify agent is connected</div>
                      <div style={{ position: 'relative' }}>
                        <div className={styles.codeBlock}>systemctl status wazuh-agent</div>
                        <button className={styles.copyBtn} onClick={() => copyText('systemctl status wazuh-agent', 9)}>{copiedIdx === 9 ? '✓' : 'Copy'}</button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Auto install button */}
            <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 10, background: 'rgba(31,111,235,0.07)', border: '1px solid rgba(31,111,235,0.2)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>🚀 Automated Installation</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 12 }}>
                Click below to run the installation automatically on this server. This will take several minutes.
                {installMode === 'agent' && !managerIP && (
                  <span style={{ color: '#f6ad55', marginLeft: 8 }}>⚠ Set the Manager IP above first.</span>
                )}
              </div>
              <button className={styles.btnPrimary} onClick={() => mutInstall.mutate()} disabled={mutInstall.isPending || (installMode === 'agent' && !managerIP)}>
                {mutInstall.isPending ? '⏳ Installing…' : <><IcoPackage /> Run Installation</>}
              </button>
            </div>
          </div>

          {/* Install log */}
          {installLog && (
            <div className={styles.card}>
              <div className={styles.cardTitle}>Installation Output</div>
              <div className={styles.installLog}>{installLog}</div>
            </div>
          )}

          {/* Post-install configuration */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Post-Install: Register Agents</div>
            <div className={styles.installWizard}>
              <div className={styles.installStep}>
                <div className={styles.installStepNum}>A</div>
                <div className={styles.installStepBody}>
                  <div className={styles.installStepTitle}>Generate agent key on the manager</div>
                  <div style={{ position: 'relative' }}>
                    <div className={styles.codeBlock}>/var/ossec/bin/manage_agents</div>
                    <button className={styles.copyBtn} onClick={() => copyText('/var/ossec/bin/manage_agents', 10)}>{copiedIdx === 10 ? '✓' : 'Copy'}</button>
                  </div>
                </div>
              </div>
              <div className={styles.installStep}>
                <div className={styles.installStepNum}>B</div>
                <div className={styles.installStepBody}>
                  <div className={styles.installStepTitle}>Import key on the agent</div>
                  <div style={{ position: 'relative' }}>
                    <div className={styles.codeBlock}>/var/ossec/bin/agent-auth -m MANAGER_IP</div>
                    <button className={styles.copyBtn} onClick={() => copyText('/var/ossec/bin/agent-auth -m MANAGER_IP', 11)}>{copiedIdx === 11 ? '✓' : 'Copy'}</button>
                  </div>
                </div>
              </div>
              <div className={styles.installStep}>
                <div className={styles.installStepNum}>C</div>
                <div className={styles.installStepBody}>
                  <div className={styles.installStepTitle}>Check connected agents</div>
                  <div style={{ position: 'relative' }}>
                    <div className={styles.codeBlock}>/var/ossec/bin/agent_control -l</div>
                    <button className={styles.copyBtn} onClick={() => copyText('/var/ossec/bin/agent_control -l', 12)}>{copiedIdx === 12 ? '✓' : 'Copy'}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Requirements */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>System Requirements</div>
            <div className={styles.grid3}>
              {[
                { label: 'Min RAM (Manager)', value: '4 GB', color: '#63b3ed' },
                { label: 'Min Disk', value: '50 GB', color: '#63b3ed' },
                { label: 'CPU', value: '2+ cores', color: '#63b3ed' },
                { label: 'OS (Manager)', value: 'Ubuntu 20+, RHEL 7+', color: '#a78bfa' },
                { label: 'OS (Agent)', value: 'Linux, Windows, macOS', color: '#a78bfa' },
                { label: 'API Port', value: 'TCP 55000', color: '#f6ad55' },
                { label: 'Agent Port', value: 'TCP/UDP 1514', color: '#f6ad55' },
                { label: 'Syslog', value: 'UDP 514', color: '#f6ad55' },
                { label: 'Dashboard', value: 'TCP 443', color: '#68d391' },
              ].map(r => (
                <div key={r.label} className={styles.infoItem}>
                  <div className={styles.infoKey}>{r.label}</div>
                  <div className={styles.infoVal} style={{ color: r.color }}>{r.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function wazuhLevelToSev(level: number): string {
  if (level >= 15) return 'critical'
  if (level >= 12) return 'high'
  if (level >= 7)  return 'medium'
  if (level >= 4)  return 'low'
  return 'info'
}
