import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchPortsSummary, fetchPortsListening, fetchPortsConnections,
  fetchPortsProcesses, fetchPortsRules, createPortRule, deletePortRule,
  togglePortRule, scanPorts,
  type PortEntry, type ConnectionEntry, type PortRule, type PortSummary, type ProcessPort,
} from '@/lib/api'
import styles from './PortsPage.module.css'

// ── Icons ──────────────────────────────────────────────────────────────────
const IcoPort      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="16" height="9" rx="1.5"/><path d="M6 6V4M10 6V4M14 6V4"/><circle cx="10" cy="10.5" r="1.5" fill="currentColor" stroke="none"/></svg>
const IcoListen    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="4"/><circle cx="10" cy="10" r="8" strokeDasharray="3 2" strokeWidth="1.2"/></svg>
const IcoConnect   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="10" r="2.5"/><circle cx="15" cy="10" r="2.5"/><path d="M7.5 10h5"/><path d="M10 7v-2M10 15v-2"/></svg>
const IcoProcess   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="7" height="5" rx="1"/><rect x="11" y="3" width="7" height="5" rx="1"/><rect x="2" y="12" width="7" height="5" rx="1"/><rect x="11" y="12" width="7" height="5" rx="1"/></svg>
const IcoRules     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8l-4-5z"/><polyline points="9,3 9,8 14,8"/><line x1="7" y1="12" x2="13" y2="12"/><line x1="7" y1="15" x2="11" y2="15"/></svg>
const IcoScan      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 10h16M10 2v16"/><circle cx="10" cy="10" r="7.5" strokeDasharray="4 2"/><circle cx="10" cy="10" r="2.5" fill="currentColor" stroke="none"/></svg>
const IcoShield    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5z"/></svg>
const IcoRefresh   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M17 10a7 7 0 0 1-7 7 7 7 0 0 1-5-2"/><polyline points="2,10 3,15 8,14"/></svg>
const IcoPlus      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg>
const IcoTrash     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><polyline points="3,6 17,6"/><path d="M8 6V4h4v2"/><rect x="4" y="6" width="12" height="12" rx="1.5"/></svg>
const IcoSearch    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="17" y2="17"/></svg>
const IcoWarning   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l8 16H2z"/><line x1="10" y1="9" x2="10" y2="13"/><circle cx="10" cy="15.5" r=".7" fill="currentColor" stroke="none"/></svg>
const IcoCheck     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><polyline points="4,10 8,14 16,6"/></svg>
const IcoBlock     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><circle cx="10" cy="10" r="8"/><line x1="4" y1="4" x2="16" y2="16"/></svg>
const IcoGlobe     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8"/><path d="M2 10h16M10 2a12 12 0 0 1 0 16M10 2a12 12 0 0 0 0 16"/></svg>

// ── Helpers ────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'listening' | 'connections' | 'processes' | 'rules' | 'scan'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',     label: 'Overview',     icon: <IcoPort /> },
  { id: 'listening',    label: 'Listening',    icon: <IcoListen /> },
  { id: 'connections',  label: 'Connections',  icon: <IcoConnect /> },
  { id: 'processes',    label: 'Processes',    icon: <IcoProcess /> },
  { id: 'rules',        label: 'Rules',        icon: <IcoRules /> },
  { id: 'scan',         label: 'Port Scan',    icon: <IcoScan /> },
]

function riskColor(risk: string) {
  switch (risk) {
    case 'critical': return '#f85149'
    case 'high':     return '#f97316'
    case 'medium':   return '#f6ad55'
    case 'low':      return '#63b3ed'
    default:         return '#8b949e'
  }
}
function riskBg(risk: string) {
  switch (risk) {
    case 'critical': return 'rgba(248,81,73,0.12)'
    case 'high':     return 'rgba(249,115,22,0.12)'
    case 'medium':   return 'rgba(246,173,85,0.12)'
    case 'low':      return 'rgba(99,179,237,0.1)'
    default:         return 'rgba(139,148,158,0.1)'
  }
}
function stateColor(state: string) {
  switch (state) {
    case 'LISTEN':      return '#63b3ed'
    case 'ESTABLISHED': return '#68d391'
    case 'TIME_WAIT':   return '#f6ad55'
    case 'CLOSE_WAIT':  return '#f97316'
    default:             return '#8b949e'
  }
}
function portTypeColor(pt: string) {
  switch (pt) {
    case 'system':         return '#a78bfa'
    case 'database':       return '#f6ad55'
    case 'application':    return '#63b3ed'
    case 'infrastructure': return '#68d391'
    default:               return '#8b949e'
  }
}

function isPublicBind(addr: string) {
  return addr === '0.0.0.0' || addr === '::' || addr === '*'
}

// ── Main component ──────────────────────────────────────────────────────────
export default function PortsPage() {
  const [tab, setTab] = useState<Tab>('overview')
  const [search, setSearch] = useState('')
  const [connSearch, setConnSearch] = useState('')
  const [ruleSearch, setRuleSearch] = useState('')
  const [showRuleDialog, setShowRuleDialog] = useState(false)
  const [newPort, setNewPort] = useState('')
  const [newProto, setNewProto] = useState('tcp')
  const [newAction, setNewAction] = useState<'allow' | 'block'>('allow')
  const [newSource, setNewSource] = useState('any')
  const [newComment, setNewComment] = useState('')
  const [toast, setToast] = useState('')
  const [scanTarget, setScanTarget] = useState('127.0.0.1')
  const [scanRange, setScanRange] = useState('1-10000')
  const [scanning, setScanning] = useState(false)
  const [scanResults, setScanResults] = useState<{ port: number; protocol: string; state: string; service_name: string }[]>([])
  const [scanInfo, setScanInfo] = useState<{ target: string; scanned_at: string } | null>(null)
  const [riskFilter, setRiskFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [protoFilter, setProtoFilter] = useState('all')

  const qc = useQueryClient()

  const { data: summary, refetch: refetchSummary } = useQuery<PortSummary>({
    queryKey: ['ports-summary'],
    queryFn: fetchPortsSummary,
    refetchInterval: 15000,
  })
  const { data: listening = [], refetch: refetchListening } = useQuery<PortEntry[]>({
    queryKey: ['ports-listening'],
    queryFn: fetchPortsListening,
    refetchInterval: 20000,
    enabled: tab === 'listening' || tab === 'overview',
  })
  const { data: connections = [], refetch: refetchConns } = useQuery<ConnectionEntry[]>({
    queryKey: ['ports-connections'],
    queryFn: fetchPortsConnections,
    refetchInterval: 10000,
    enabled: tab === 'connections',
  })
  const { data: processes = [], refetch: refetchProcs } = useQuery<ProcessPort[]>({
    queryKey: ['ports-processes'],
    queryFn: fetchPortsProcesses,
    refetchInterval: 20000,
    enabled: tab === 'processes',
  })
  const { data: rules = [], refetch: refetchRules } = useQuery<PortRule[]>({
    queryKey: ['ports-rules'],
    queryFn: fetchPortsRules,
    enabled: tab === 'rules',
  })

  const createMut = useMutation({
    mutationFn: createPortRule,
    onSuccess: () => {
      showToast('Rule created and applied')
      qc.invalidateQueries({ queryKey: ['ports-rules'] })
      setShowRuleDialog(false)
      resetForm()
    },
    onError: (e: Error) => showToast(e.message),
  })
  const deleteMut = useMutation({
    mutationFn: deletePortRule,
    onSuccess: () => { showToast('Rule removed'); qc.invalidateQueries({ queryKey: ['ports-rules'] }) },
  })
  const toggleMut = useMutation({
    mutationFn: togglePortRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ports-rules'] }),
  })

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }
  function resetForm() {
    setNewPort(''); setNewProto('tcp'); setNewAction('allow')
    setNewSource('any'); setNewComment('')
  }

  const handleScan = async () => {
    setScanning(true)
    setScanResults([])
    setScanInfo(null)
    try {
      const res = await scanPorts({ target: scanTarget, port_range: scanRange })
      setScanResults(res.results ?? [])
      setScanInfo({ target: res.target, scanned_at: res.scanned_at })
    } catch (e: unknown) {
      showToast((e as Error).message)
    } finally {
      setScanning(false)
    }
  }

  // ── Filtered data ──────────────────────────────────────────────────────────
  const filteredListening = listening.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !q || String(p.port).includes(q) || p.service_name.toLowerCase().includes(q) ||
      p.process_name.toLowerCase().includes(q) || p.bind_address.toLowerCase().includes(q)
    const matchRisk  = riskFilter  === 'all' || p.risk_level === riskFilter
    const matchType  = typeFilter  === 'all' || p.port_type  === typeFilter
    const matchProto = protoFilter === 'all' || p.protocol   === protoFilter
    return matchSearch && matchRisk && matchType && matchProto
  })
  const filteredConns = connections.filter(c => {
    const q = connSearch.toLowerCase()
    return !q || c.local_addr.includes(q) || c.remote_addr.includes(q) ||
      String(c.local_port).includes(q) || String(c.remote_port).includes(q) ||
      c.process_name.toLowerCase().includes(q)
  })
  const filteredRules = rules.filter(r => {
    const q = ruleSearch.toLowerCase()
    return !q || String(r.port).includes(q) || r.comment.toLowerCase().includes(q) ||
      r.action.toLowerCase().includes(q) || r.source.toLowerCase().includes(q)
  })

  // ── Risk counts ────────────────────────────────────────────────────────────
  const critCount = listening.filter(p => p.risk_level === 'critical').length
  const highCount  = listening.filter(p => p.risk_level === 'high').length

  return (
    <div className={styles.page}>
      {/* ── Tab bar ── */}
      <div className={styles.tabBar}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            {t.label}
            {t.id === 'listening' && listening.length > 0 && (
              <span className={styles.tabBadge}>{listening.length}</span>
            )}
            {t.id === 'connections' && tab === 'connections' && connections.length > 0 && (
              <span className={styles.tabBadge}>{connections.length}</span>
            )}
            {t.id === 'rules' && tab === 'rules' && rules.length > 0 && (
              <span className={styles.tabBadge}>{rules.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className={styles.tabContent}>
          {/* Stats row */}
          <div className={styles.statsRow}>
            {[
              { label: 'Listening',   val: summary?.total_listening   ?? 0, color: '#63b3ed', icon: <IcoListen /> },
              { label: 'TCP',         val: summary?.total_tcp         ?? 0, color: '#a78bfa', icon: <IcoPort /> },
              { label: 'UDP',         val: summary?.total_udp         ?? 0, color: '#68d391', icon: <IcoPort /> },
              { label: 'Connections', val: summary?.total_established ?? 0, color: '#f6ad55', icon: <IcoConnect /> },
              { label: 'Critical',    val: summary?.risk_breakdown?.critical ?? 0, color: '#f85149', icon: <IcoWarning /> },
              { label: 'High Risk',   val: summary?.risk_breakdown?.high ?? 0,     color: '#f97316', icon: <IcoWarning /> },
            ].map(s => (
              <div className={styles.statCard} key={s.label}>
                <div className={styles.statIcon} style={{ background: s.color + '18', color: s.color }}>
                  {s.icon}
                </div>
                <div>
                  <div className={styles.statVal} style={{ color: s.color }}>{s.val}</div>
                  <div className={styles.statLbl}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Risk alerts */}
          {(critCount > 0 || highCount > 0) && (
            <div className={styles.alertBanner}>
              <IcoWarning />
              <span>
                {critCount > 0 && <><strong>{critCount} critical-risk</strong> port{critCount > 1 ? 's' : ''} detected (e.g. Telnet, RDP, VNC exposed). </>}
                {highCount > 0 && <><strong>{highCount} high-risk</strong> port{highCount > 1 ? 's' : ''} exposed to internet (e.g. Redis, MongoDB, Docker).</>}
              </span>
            </div>
          )}

          <div className={styles.overviewGrid}>
            {/* Public ports */}
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <IcoGlobe />
                Public Ports
                <span className={styles.cardBadge}>{summary?.public_ports?.length ?? 0}</span>
              </div>
              <div className={styles.portPillsWrap}>
                {(summary?.public_ports ?? []).slice(0, 40).map(p => (
                  <span key={p} className={styles.portPill} style={{ background: riskBg(listening.find(l => l.port === p)?.risk_level ?? 'info'), color: riskColor(listening.find(l => l.port === p)?.risk_level ?? 'info') }}>
                    {p}
                  </span>
                ))}
                {(summary?.public_ports?.length ?? 0) > 40 && (
                  <span className={styles.portPillMore}>+{(summary?.public_ports?.length ?? 0) - 40} more</span>
                )}
                {(summary?.public_ports?.length ?? 0) === 0 && (
                  <span className={styles.emptyInline}>No publicly exposed ports</span>
                )}
              </div>
            </div>

            {/* Port types */}
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <IcoPort />
                Port Types
              </div>
              <div className={styles.typeBreakdown}>
                {Object.entries(summary?.ports_by_type ?? {}).map(([type, count]) => (
                  <div key={type} className={styles.typeRow}>
                    <span className={styles.typeDot} style={{ background: portTypeColor(type) }} />
                    <span className={styles.typeLabel}>{type}</span>
                    <div className={styles.typeBarWrap}>
                      <div className={styles.typeBar} style={{ width: `${Math.min(100, (count / (summary?.total_listening || 1)) * 100)}%`, background: portTypeColor(type) }} />
                    </div>
                    <span className={styles.typeCount}>{count}</span>
                  </div>
                ))}
                {Object.keys(summary?.ports_by_type ?? {}).length === 0 && (
                  <span className={styles.emptyInline}>No data</span>
                )}
              </div>
            </div>

            {/* Risk breakdown */}
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <IcoShield />
                Risk Distribution
              </div>
              <div className={styles.typeBreakdown}>
                {['critical', 'high', 'medium', 'low', 'info'].map(level => {
                  const count = summary?.risk_breakdown?.[level] ?? 0
                  return (
                    <div key={level} className={styles.typeRow}>
                      <span className={styles.typeDot} style={{ background: riskColor(level) }} />
                      <span className={styles.typeLabel} style={{ textTransform: 'capitalize' }}>{level}</span>
                      <div className={styles.typeBarWrap}>
                        <div className={styles.typeBar} style={{ width: `${Math.min(100, (count / (summary?.total_listening || 1)) * 100)}%`, background: riskColor(level) }} />
                      </div>
                      <span className={styles.typeCount}>{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Top processes */}
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <IcoProcess />
                Top Processes
              </div>
              <div className={styles.processList}>
                {(summary?.top_processes ?? []).slice(0, 8).map(pp => (
                  <div key={pp.process_name} className={styles.processRow}>
                    <div className={styles.processInfo}>
                      <span className={styles.processName}>{pp.process_name || 'kernel'}</span>
                      {pp.pid > 0 && <span className={styles.processPid}>PID {pp.pid}</span>}
                    </div>
                    <div className={styles.processPorts}>
                      {(pp.ports ?? []).slice(0, 5).map(p => (
                        <span key={p} className={styles.processPort}>{p}</span>
                      ))}
                      {(pp.ports?.length ?? 0) > 5 && <span className={styles.processPortMore}>+{(pp.ports?.length ?? 0) - 5}</span>}
                    </div>
                    <span className={styles.processPortCount}>{pp.port_count}</span>
                  </div>
                ))}
                {(summary?.top_processes ?? []).length === 0 && (
                  <span className={styles.emptyInline}>No process data</span>
                )}
              </div>
            </div>
          </div>

          {/* High-risk listening ports table */}
          {listening.filter(p => p.risk_level === 'critical' || p.risk_level === 'high').length > 0 && (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <IcoWarning />
                High-Risk Ports
                <span className={styles.cardBadgeWarn}>
                  {listening.filter(p => p.risk_level === 'critical' || p.risk_level === 'high').length}
                </span>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Port</th><th>Protocol</th><th>Service</th><th>Process</th><th>Bind</th><th>Risk</th><th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listening.filter(p => p.risk_level === 'critical' || p.risk_level === 'high').map((p, i) => (
                      <tr key={i}>
                        <td><span className={styles.portNum}>{p.port}</span></td>
                        <td><span className={styles.protoChip}>{p.protocol.toUpperCase()}</span></td>
                        <td>{p.service_name || '—'}</td>
                        <td>{p.process_name || '—'}</td>
                        <td>
                          <span className={`${styles.bindChip} ${isPublicBind(p.bind_address) ? styles.bindPublic : styles.bindLocal}`}>
                            {isPublicBind(p.bind_address) ? <IcoGlobe /> : null}
                            {p.bind_address}
                          </span>
                        </td>
                        <td>
                          <span className={styles.riskChip} style={{ background: riskBg(p.risk_level), color: riskColor(p.risk_level) }}>
                            {p.risk_level}
                          </span>
                        </td>
                        <td className={styles.descCell}>{p.description || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className={styles.refreshRow}>
            <button className={styles.refreshBtn} onClick={() => { refetchSummary(); refetchListening() }}>
              <IcoRefresh /> Refresh
            </button>
          </div>
        </div>
      )}

      {/* ── Listening Ports ── */}
      {tab === 'listening' && (
        <div className={styles.tabContent}>
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}><IcoSearch /></span>
                <input className={styles.searchInput} placeholder="Filter by port, service, process…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select className={styles.filterSelect} value={riskFilter} onChange={e => setRiskFilter(e.target.value)}>
                <option value="all">All Risks</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="info">Info</option>
              </select>
              <select className={styles.filterSelect} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="all">All Types</option>
                <option value="system">System</option>
                <option value="database">Database</option>
                <option value="application">Application</option>
                <option value="infrastructure">Infrastructure</option>
                <option value="custom">Custom</option>
              </select>
              <select className={styles.filterSelect} value={protoFilter} onChange={e => setProtoFilter(e.target.value)}>
                <option value="all">TCP + UDP</option>
                <option value="tcp">TCP only</option>
                <option value="udp">UDP only</option>
              </select>
            </div>
            <div className={styles.toolbarRight}>
              <button className={styles.refreshBtn} onClick={() => refetchListening()}>
                <IcoRefresh /> Refresh
              </button>
            </div>
          </div>
          <div className={styles.card}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Port</th><th>Proto</th><th>State</th><th>Service</th>
                    <th>Process</th><th>PID</th><th>Bind Address</th><th>Type</th><th>Risk</th><th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredListening.length === 0 && (
                    <tr><td colSpan={10} className={styles.emptyRow}>No listening ports found{search ? ' matching your filter' : ''}</td></tr>
                  )}
                  {filteredListening.map((p, i) => (
                    <tr key={i}>
                      <td><span className={styles.portNum}>{p.port}</span></td>
                      <td><span className={styles.protoChip}>{p.protocol.toUpperCase()}</span></td>
                      <td>
                        <span className={styles.stateChip} style={{ color: stateColor(p.state), background: stateColor(p.state) + '18' }}>
                          {p.state}
                        </span>
                      </td>
                      <td>{p.service_name || '—'}</td>
                      <td className={styles.processCell}>{p.process_name || '—'}</td>
                      <td className={styles.dimCell}>{p.process_pid > 0 ? p.process_pid : '—'}</td>
                      <td>
                        <span className={`${styles.bindChip} ${isPublicBind(p.bind_address) ? styles.bindPublic : styles.bindLocal}`}>
                          {isPublicBind(p.bind_address) && <IcoGlobe />}
                          {p.bind_address}
                        </span>
                      </td>
                      <td>
                        <span className={styles.typeChip} style={{ color: portTypeColor(p.port_type), background: portTypeColor(p.port_type) + '18' }}>
                          {p.port_type}
                        </span>
                      </td>
                      <td>
                        <span className={styles.riskChip} style={{ background: riskBg(p.risk_level), color: riskColor(p.risk_level) }}>
                          {p.risk_level}
                        </span>
                      </td>
                      <td className={styles.descCell}>{p.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className={styles.tableFooter}>{filteredListening.length} of {listening.length} ports shown</div>
        </div>
      )}

      {/* ── Connections ── */}
      {tab === 'connections' && (
        <div className={styles.tabContent}>
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}><IcoSearch /></span>
                <input className={styles.searchInput} placeholder="Filter by IP, port, process…" value={connSearch} onChange={e => setConnSearch(e.target.value)} />
              </div>
            </div>
            <div className={styles.toolbarRight}>
              <button className={styles.refreshBtn} onClick={() => refetchConns()}>
                <IcoRefresh /> Refresh
              </button>
            </div>
          </div>
          <div className={styles.card}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Local Address</th><th>Local Port</th><th>Remote Address</th><th>Remote Port</th>
                    <th>State</th><th>Protocol</th><th>Process</th><th>PID</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConns.length === 0 && (
                    <tr><td colSpan={8} className={styles.emptyRow}>No active connections found</td></tr>
                  )}
                  {filteredConns.map((c, i) => (
                    <tr key={i}>
                      <td className={styles.monoCell}>{c.local_addr}</td>
                      <td><span className={styles.portNum}>{c.local_port}</span></td>
                      <td className={styles.monoCell}>{c.remote_addr}</td>
                      <td><span className={styles.portNum}>{c.remote_port}</span></td>
                      <td>
                        <span className={styles.stateChip} style={{ color: stateColor(c.state), background: stateColor(c.state) + '18' }}>
                          {c.state}
                        </span>
                      </td>
                      <td><span className={styles.protoChip}>{c.protocol.toUpperCase()}</span></td>
                      <td className={styles.processCell}>{c.process_name || '—'}</td>
                      <td className={styles.dimCell}>{c.process_pid > 0 ? c.process_pid : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className={styles.tableFooter}>{filteredConns.length} connections</div>
        </div>
      )}

      {/* ── Processes ── */}
      {tab === 'processes' && (
        <div className={styles.tabContent}>
          <div className={styles.toolbarRight} style={{ justifyContent: 'flex-end', display: 'flex' }}>
            <button className={styles.refreshBtn} onClick={() => refetchProcs()}>
              <IcoRefresh /> Refresh
            </button>
          </div>
          <div className={styles.processGrid}>
            {processes.length === 0 && (
              <div className={styles.emptyState}>No process data available</div>
            )}
            {processes.map((pp, i) => (
              <div key={i} className={styles.processCard}>
                <div className={styles.processCardHead}>
                  <div className={styles.processCardName}>{pp.process_name || 'kernel'}</div>
                  {pp.pid > 0 && <span className={styles.processPidBadge}>PID {pp.pid}</span>}
                  <span className={styles.processPortBadge}>{pp.port_count} port{pp.port_count !== 1 ? 's' : ''}</span>
                </div>
                <div className={styles.processCardPorts}>
                  {(pp.ports ?? []).map(p => (
                    <span key={p} className={styles.processCardPort}>
                      {p}
                      <span className={styles.processCardPortSvc}>{listening.find(l => l.port === p)?.service_name || ''}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Rules ── */}
      {tab === 'rules' && (
        <div className={styles.tabContent}>
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}><IcoSearch /></span>
                <input className={styles.searchInput} placeholder="Filter rules…" value={ruleSearch} onChange={e => setRuleSearch(e.target.value)} />
              </div>
            </div>
            <div className={styles.toolbarRight}>
              <button className={styles.refreshBtn} onClick={() => refetchRules()}>
                <IcoRefresh /> Refresh
              </button>
              <button className={styles.addBtn} onClick={() => setShowRuleDialog(true)}>
                <IcoPlus /> Add Rule
              </button>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Port</th><th>Protocol</th><th>Action</th><th>Source</th>
                    <th>Comment</th><th>Created</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRules.length === 0 && (
                    <tr><td colSpan={8} className={styles.emptyRow}>No rules defined. Add a rule to control port access.</td></tr>
                  )}
                  {filteredRules.map(rule => (
                    <tr key={rule.id} className={!rule.enabled ? styles.rowDisabled : ''}>
                      <td><span className={styles.portNum}>{rule.port}</span></td>
                      <td><span className={styles.protoChip}>{rule.protocol.toUpperCase()}</span></td>
                      <td>
                        <span className={styles.actionChip} style={{
                          background: rule.action === 'allow' ? 'rgba(104,211,145,0.12)' : 'rgba(248,81,73,0.12)',
                          color: rule.action === 'allow' ? '#68d391' : '#f85149',
                        }}>
                          {rule.action === 'allow' ? <IcoCheck /> : <IcoBlock />}
                          {rule.action}
                        </span>
                      </td>
                      <td className={styles.monoCell}>{rule.source}</td>
                      <td className={styles.dimCell}>{rule.comment || '—'}</td>
                      <td className={styles.dimCell}>{rule.created_at ? new Date(rule.created_at).toLocaleDateString() : '—'}</td>
                      <td>
                        <button
                          className={`${styles.toggleSwitch} ${rule.enabled ? styles.toggleOn : styles.toggleOff}`}
                          onClick={() => toggleMut.mutate(rule.id)}
                          title={rule.enabled ? 'Disable' : 'Enable'}
                        >
                          <span className={styles.toggleThumb} />
                        </button>
                      </td>
                      <td>
                        <button className={styles.iconBtn} onClick={() => { if (confirm(`Remove port rule for ${rule.port}?`)) deleteMut.mutate(rule.id) }} title="Delete rule">
                          <IcoTrash />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className={styles.tableFooter}>{filteredRules.length} rule{filteredRules.length !== 1 ? 's' : ''}</div>
        </div>
      )}

      {/* ── Port Scan ── */}
      {tab === 'scan' && (
        <div className={styles.tabContent}>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <IcoScan />
              Port Scanner
            </div>
            <div className={styles.scanForm}>
              <div className={styles.scanField}>
                <label className={styles.scanLabel}>Target</label>
                <input
                  className={styles.scanInput}
                  value={scanTarget}
                  onChange={e => setScanTarget(e.target.value)}
                  placeholder="127.0.0.1 or hostname"
                />
              </div>
              <div className={styles.scanField}>
                <label className={styles.scanLabel}>Port Range</label>
                <input
                  className={styles.scanInput}
                  value={scanRange}
                  onChange={e => setScanRange(e.target.value)}
                  placeholder="1-65535"
                />
              </div>
              <button className={styles.scanBtn} onClick={handleScan} disabled={scanning}>
                {scanning ? 'Scanning…' : <><IcoScan /> Start Scan</>}
              </button>
            </div>
            {scanning && (
              <div className={styles.scanProgress}>
                <div className={styles.scanSpinner} />
                Scanning {scanTarget} on range {scanRange}…
              </div>
            )}
          </div>

          {scanResults.length > 0 && (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <IcoCheck />
                Scan Results
                {scanInfo && (
                  <span className={styles.scanMeta}>
                    Target: {scanInfo.target} · {new Date(scanInfo.scanned_at).toLocaleString()}
                  </span>
                )}
                <span className={styles.cardBadge}>{scanResults.length} open</span>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Port</th><th>Protocol</th><th>State</th><th>Service</th></tr>
                  </thead>
                  <tbody>
                    {scanResults.map((r, i) => (
                      <tr key={i}>
                        <td><span className={styles.portNum}>{r.port}</span></td>
                        <td><span className={styles.protoChip}>{r.protocol.toUpperCase()}</span></td>
                        <td>
                          <span className={styles.stateChip} style={{ color: '#68d391', background: 'rgba(104,211,145,0.12)' }}>
                            {r.state}
                          </span>
                        </td>
                        <td>{r.service_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!scanning && scanResults.length === 0 && scanInfo === null && (
            <div className={styles.emptyState}>
              Configure the target and port range above, then click Start Scan.
            </div>
          )}
          {!scanning && scanResults.length === 0 && scanInfo !== null && (
            <div className={styles.emptyState}>No open ports found on {scanInfo?.target}</div>
          )}
        </div>
      )}

      {/* ── Add Rule Dialog ── */}
      {showRuleDialog && (
        <div className={styles.dialogOverlay} onClick={() => setShowRuleDialog(false)}>
          <div className={styles.dialog} onClick={e => e.stopPropagation()}>
            <div className={styles.dialogHead}>
              <IcoRules />
              Add Port Rule
            </div>
            <div className={styles.dialogBody}>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Port *</label>
                <input className={styles.formInput} type="number" min="1" max="65535" value={newPort} onChange={e => setNewPort(e.target.value)} placeholder="e.g. 8080" />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Protocol</label>
                <select className={styles.formSelect} value={newProto} onChange={e => setNewProto(e.target.value)}>
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                </select>
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Action</label>
                <div className={styles.actionToggle}>
                  <button className={`${styles.actionToggleBtn} ${newAction === 'allow' ? styles.actionAllow : ''}`} onClick={() => setNewAction('allow')}>
                    <IcoCheck /> Allow
                  </button>
                  <button className={`${styles.actionToggleBtn} ${newAction === 'block' ? styles.actionBlock : ''}`} onClick={() => setNewAction('block')}>
                    <IcoBlock /> Block
                  </button>
                </div>
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Source IP / CIDR</label>
                <input className={styles.formInput} value={newSource} onChange={e => setNewSource(e.target.value)} placeholder="any or 192.168.1.0/24" />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Comment</label>
                <input className={styles.formInput} value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Optional description" />
              </div>
            </div>
            <div className={styles.dialogFoot}>
              <button className={styles.cancelBtn} onClick={() => { setShowRuleDialog(false); resetForm() }}>Cancel</button>
              <button
                className={styles.submitBtn}
                disabled={!newPort || createMut.isPending}
                onClick={() => createMut.mutate({ port: parseInt(newPort), protocol: newProto, action: newAction, source: newSource, comment: newComment })}
              >
                {createMut.isPending ? 'Applying…' : 'Apply Rule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
