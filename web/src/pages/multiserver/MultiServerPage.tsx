import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  fetchManagedServers, fetchServerGroups, fetchAllServerAlerts, reorderServers,
} from '@/lib/api'
import { EmptyState, Spinner } from '@/components/ui'
import { AddServerWizard } from './AddServerWizard'
import { ServerDetailModal } from './ServerDetailModal'
import { RunCommandModal } from './RunCommandModal'
import { BulkOpsModal } from './BulkOpsModal'
import type { ServerRecord } from './serversData'
import styles from './MultiServerPage.module.css'

// ── SVG Icons ───────────────────────────────────────────────────────────────
function IcServer() {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="16" height="5" rx="1.5"/><rect x="2" y="12" width="16" height="5" rx="1.5"/><circle cx="6" cy="5.5" r=".8" fill="currentColor" stroke="none"/><circle cx="6" cy="14.5" r=".8" fill="currentColor" stroke="none"/></svg>
}
function IcGrid() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="1" y="1" width="6" height="6" rx="1.2"/><rect x="9" y="1" width="6" height="6" rx="1.2"/><rect x="1" y="9" width="6" height="6" rx="1.2"/><rect x="9" y="9" width="6" height="6" rx="1.2"/></svg>
}
function IcList() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="1" y1="4" x2="15" y2="4"/><line x1="1" y1="8" x2="15" y2="8"/><line x1="1" y1="12" x2="15" y2="12"/></svg>
}
function IcDrag() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="4" cy="3" r="1"/><circle cx="8" cy="3" r="1"/><circle cx="4" cy="6" r="1"/><circle cx="8" cy="6" r="1"/><circle cx="4" cy="9" r="1"/><circle cx="8" cy="9" r="1"/></svg>
}
function IcChevron({ dir = 'up' }: { dir?: 'up' | 'down' | 'none' }) {
  if (dir === 'none') return <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" style={{ opacity: 0.2 }}><path d="M4 1l3 3H1z"/></svg>
  return <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" style={{ opacity: 0.5 }}><path d={dir === 'up' ? 'M4 1l3 3H1z' : 'M4 7l3-3H1z'}/></svg>
}
function IcRefresh() {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 8A5.5 5.5 0 1 1 8 2.5a5.5 5.5 0 0 1 3.9 1.6L13.5 6"/><path d="M13.5 2v4h-4"/></svg>
}
function IcTerminal() {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="2" width="14" height="12" rx="2"/><polyline points="4,6 7,9 4,12"/><line x1="9" y1="12" x2="13" y2="12"/></svg>
}
function IcBulk() {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h10M3 8h7M3 12h4"/><circle cx="13" cy="11" r="2.5"/><path d="M13 9.5v1.5l1 1"/></svg>
}
function IcPlus() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/></svg>
}
function IcSearch() {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="6.5" cy="6.5" r="4.5"/><line x1="10" y1="10" x2="14" y2="14"/></svg>
}
function IcEye() {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>
}
function IcExport() {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M13 10v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2"/><polyline points="10,5 13,2 16,5" transform="translate(-3,0)"/><line x1="10" y1="2" x2="10" y2="10"/></svg>
}

// ── Role colors ─────────────────────────────────────────────────────────────
const ROLE_COLOR: Record<string, { bg: string; color: string }> = {
  web:          { bg: 'rgba(74,158,255,.15)', color: '#4a9eff' },
  database:     { bg: 'rgba(255,152,0,.15)',  color: '#ff9800' },
  cache:        { bg: 'rgba(156,39,176,.15)', color: '#9c27b0' },
  worker:       { bg: 'rgba(76,175,80,.15)',  color: '#4caf50' },
  loadbalancer: { bg: 'rgba(0,188,212,.15)',  color: '#00bcd4' },
  backup:       { bg: 'rgba(107,112,128,.2)', color: '#9aa0b0' },
  monitoring:   { bg: 'rgba(233,30,99,.15)',  color: '#e91e63' },
}

const STATUS_COLOR: Record<string, string> = {
  connected:    'var(--color-success)',
  disconnected: 'var(--color-danger)',
  error:        'var(--color-danger)',
  maintenance:  'var(--color-warning)',
}

function metricColor(pct: number) {
  return pct >= 85 ? 'var(--color-danger)' : pct >= 70 ? 'var(--color-warning)' : 'var(--color-success)'
}

type SortField = 'name' | 'status' | 'latency' | 'region' | 'role' | 'environment' | 'cpu' | 'mem'
type SortDir = 'asc' | 'desc'

// ── Stat card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue} style={{ color: accent ?? 'var(--color-text)' }}>{value}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  )
}

// ── Mini metric bar ──────────────────────────────────────────────────────────
function MiniBar({ value }: { value: number }) {
  return (
    <div className={styles.metricBar}>
      <div className={styles.metricBarFill} style={{ width: `${Math.min(value, 100)}%`, background: metricColor(value) }} />
    </div>
  )
}

// ── Server grid card ─────────────────────────────────────────────────────────
function ServerGridCard({
  server, onOpen, onNavigate, onDragStart, onDragOver, onDrop, isDragging, isDragOver,
}: {
  server: ServerRecord
  onOpen: () => void
  onNavigate: () => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  isDragging: boolean
  isDragOver: boolean
}) {
  const rc = ROLE_COLOR[server.role] ?? ROLE_COLOR.web
  const m = server.metrics
  const statusColor = STATUS_COLOR[server.status] ?? 'var(--color-text-dim)'
  const hasAlerts = server.alerts.length > 0

  return (
    <div
      className={`${styles.serverCard} ${isDragging ? styles.dragging : ''} ${isDragOver ? styles.dragOver : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={() => {}}
    >
      <div className={styles.serverCardHeader}>
        <div className={styles.serverIconWrap} style={{ background: rc.bg, borderColor: `${rc.color}30`, color: rc.color }}>
          <IcServer />
        </div>
        <div className={styles.serverCardMeta}>
          <div className={styles.serverName}>{server.name}</div>
          <div className={styles.serverHost}>{server.user}@{server.host}:{server.port}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {hasAlerts && <span className={styles.alertDot} title={`${server.alerts.length} alert(s)`} />}
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
        </div>
      </div>

      <div className={styles.serverCardBadges}>
        <span className={styles.roleBadge} style={{ background: rc.bg, color: rc.color }}>{server.role}</span>
        <span className={styles.envBadge}>{server.environment}</span>
        <span className={styles.envBadge}>{server.region}</span>
      </div>

      {m ? (
        <div className={styles.serverMetrics}>
          {[
            { label: 'Memory', value: m.mem_pct, display: `${m.mem_pct.toFixed(2)}%` },
            { label: 'Disk', value: m.disk_pct, display: `${m.disk_pct.toFixed(2)}%` },
            { label: 'CPU', value: m.cpu_pct, display: `${m.cpu_pct.toFixed(2)}%` },
            { label: 'Load', value: m.load_avg * 20, display: m.load_avg.toFixed(2) },
          ].map(({ label, value, display }) => (
            <div key={label} className={styles.metricItem}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className={styles.metricLabel}>{label}</span>
                <span className={styles.metricValue} style={{ color: value >= 85 ? 'var(--color-danger)' : value >= 70 ? 'var(--color-warning)' : 'var(--color-text)' }}>{display}</span>
              </div>
              <MiniBar value={value} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: '10px 0', fontSize: 12, color: 'var(--color-text-dim)', textAlign: 'center', borderTop: '1px solid var(--color-border)' }}>
          {server.status === 'disconnected' ? 'Offline — no metrics' : 'Connecting...'}
        </div>
      )}

      <div className={styles.serverCardFooter}>
        <span className={styles.latency} style={{ color: server.latency_ms !== undefined ? (server.latency_ms > 100 ? 'var(--color-warning)' : 'var(--color-success)') : 'var(--color-text-dim)' }}>
          {server.latency_ms !== undefined ? `${server.latency_ms} ms` : '—'}
        </span>
        <div className={styles.cardActions}>
          <button className={styles.cardActionBtn} title="Open Detail Page" onClick={onNavigate}><IcEye /></button>
          <button className={styles.cardActionBtn} title="Quick View" onClick={onOpen}
            style={{ fontSize:10, padding:'2px 7px', display:'flex', alignItems:'center', gap:3 }}>···</button>
          <button className={styles.cardActionBtn} title="Run Command" onClick={() => {}}><IcTerminal /></button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function MultiServerPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [addOpen, setAddOpen]       = useState(false)
  const [detailServer, setDetailServer] = useState<ServerRecord | null>(null)
  const [cmdOpen, setCmdOpen]       = useState(false)
  const [bulkOpen, setBulkOpen]     = useState(false)
  const [view, setView]             = useState<'grid' | 'list'>('grid')
  const [search, setSearch]         = useState('')
  const [sortField, setSortField]   = useState<SortField>('name')
  const [sortDir, setSortDir]       = useState<SortDir>('asc')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterRole, setFilterRole] = useState('all')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [dragId, setDragId]         = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)
  const [serverOrder, setServerOrder] = useState<number[]>([])

  const { data: servers = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['servers'],
    queryFn: fetchManagedServers,
    refetchInterval: 30_000,
    retry: false,
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['server-groups'],
    queryFn: fetchServerGroups,
    retry: false,
  })

  const { data: alerts = [] } = useQuery({
    queryKey: ['server-alerts'],
    queryFn: fetchAllServerAlerts,
    retry: false,
  })

  const reorderMutation = useMutation({
    mutationFn: reorderServers,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  })

  useEffect(() => {
    if (servers.length > 0 && serverOrder.length === 0) {
      setServerOrder(servers.map(s => s.id))
    }
  }, [servers, serverOrder.length])

  const allServers: ServerRecord[] = (() => {
    if (serverOrder.length > 0) {
      const map = new Map(servers.map(s => [s.id, s]))
      return serverOrder.map(id => map.get(id)).filter(Boolean) as ServerRecord[]
    }
    return servers as ServerRecord[]
  })()

  const filtered = allServers.filter(s => {
    const q = search.toLowerCase()
    if (q && !s.name.toLowerCase().includes(q) && !s.host.toLowerCase().includes(q) && !s.role.includes(q)) return false
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    if (filterRole !== 'all' && s.role !== filterRole) return false
    return true
  }).sort((a, b) => {
    let av: string | number = '', bv: string | number = ''
    if (sortField === 'name')        { av = a.name; bv = b.name }
    else if (sortField === 'status') { av = a.status; bv = b.status }
    else if (sortField === 'latency'){ av = a.latency_ms ?? 9999; bv = b.latency_ms ?? 9999 }
    else if (sortField === 'region') { av = a.region; bv = b.region }
    else if (sortField === 'role')   { av = a.role; bv = b.role }
    else if (sortField === 'environment') { av = a.environment; bv = b.environment }
    else if (sortField === 'cpu')    { av = a.metrics?.cpu_pct ?? -1; bv = b.metrics?.cpu_pct ?? -1 }
    else if (sortField === 'mem')    { av = a.metrics?.mem_pct ?? -1; bv = b.metrics?.mem_pct ?? -1 }
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const total     = allServers.length
  const online    = allServers.filter(s => s.status === 'connected').length
  const offline   = allServers.filter(s => s.status === 'disconnected').length
  const alertCount = allServers.reduce((n, s) => n + s.alerts.length, 0)
  const avgCpu    = Math.round(allServers.filter(s => s.metrics).reduce((n, s) => n + (s.metrics?.cpu_pct ?? 0), 0) / (allServers.filter(s => s.metrics).length || 1))
  const avgMem    = Math.round(allServers.filter(s => s.metrics).reduce((n, s) => n + (s.metrics?.mem_pct ?? 0), 0) / (allServers.filter(s => s.metrics).length || 1))

  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(f); setSortDir('asc') }
  }

  const sortIcon = (f: SortField) => sortField === f ? (sortDir === 'asc' ? <IcChevron dir="up" /> : <IcChevron dir="down" />) : <IcChevron dir="none" />

  const clearSelect = () => setSelectedIds(new Set())

  const handleDragStart = useCallback((id: number) => { setDragId(id) }, [])
  const handleDragOver = useCallback((e: React.DragEvent, id: number) => { e.preventDefault(); setDragOverId(id) }, [])
  const handleDrop = useCallback((targetId: number) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return }
    setServerOrder(prev => {
      const arr = [...prev]
      const from = arr.indexOf(dragId)
      const to = arr.indexOf(targetId)
      if (from === -1 || to === -1) return prev
      arr.splice(from, 1)
      arr.splice(to, 0, dragId)
      reorderMutation.mutate(arr)
      return arr
    })
    setDragId(null)
    setDragOverId(null)
  }, [dragId, reorderMutation])

  const exportCSV = () => {
    const rows = [
      'name,host,port,user,role,environment,region,status,latency_ms,cpu_pct,mem_pct,disk_pct',
      ...allServers.map(s => `${s.name},${s.host},${s.port},${s.user},${s.role},${s.environment},${s.region},${s.status},${s.latency_ms ?? ''},${s.metrics?.cpu_pct ?? ''},${s.metrics?.mem_pct ?? ''},${s.metrics?.disk_pct ?? ''}`)
    ].join('\n')
    const blob = new Blob([rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'servers.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={styles.page}>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--color-text-muted)' }}><IcServer /></span>
            Servers
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
            Multi-server fleet management via SSH — no agent required
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => refetch()} disabled={isFetching} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            {isFetching ? <Spinner size="sm" /> : <IcRefresh />} Refresh
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setCmdOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <IcTerminal /> Run Command
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setBulkOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <IcBulk /> Bulk Ops
          </button>
          <button className="btn btn-ghost btn-sm" onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <IcExport /> Export
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <IcPlus /> Add Server
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className={styles.statsRow}>
        <StatCard label="Total Servers" value={total} sub="in fleet" />
        <StatCard label="Online" value={online} sub={total > 0 ? `${Math.round(online/total*100)}% uptime` : '0%'} accent="var(--color-success)" />
        <StatCard label="Offline" value={offline} sub="need attention" accent={offline > 0 ? 'var(--color-danger)' : undefined} />
        <StatCard label="Active Alerts" value={alertCount} sub={alertCount > 0 ? 'action required' : 'all clear'} accent={alertCount > 0 ? 'var(--color-warning)' : undefined} />
        <StatCard label="Avg CPU / Mem" value={`${avgCpu}% / ${avgMem}%`} sub="across fleet" accent={avgCpu > 70 ? 'var(--color-warning)' : undefined} />
      </div>

      {/* ── Selection bulk bar ── */}
      {selectedIds.size > 0 && (
        <div className={styles.bulkBar}>
          <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{selectedIds.size} selected</span>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setCmdOpen(true)}>Run Command</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setBulkOpen(true)}>Bulk Ops</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--color-danger)' }} onClick={clearSelect}>Clear Selection</button>
        </div>
      )}

      {/* ── Main two-column layout ── */}
      <div className={styles.mainLayout}>

        {/* ── Left: server area ── */}
        <div className={styles.serverArea}>
          {/* Toolbar */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarSearch}>
              <IcSearch />
              <input
                className={styles.toolbarSearchInput}
                placeholder="Search by name, host, role..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', fontSize: 13, padding: 0 }}>×</button>
              )}
            </div>

            <div className={styles.toolbarDivider} />

            <select className={styles.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">All Status</option>
              <option value="connected">Online</option>
              <option value="disconnected">Offline</option>
              <option value="maintenance">Maintenance</option>
            </select>

            <select className={styles.filterSelect} value={filterRole} onChange={e => setFilterRole(e.target.value)}>
              <option value="all">All Roles</option>
              <option value="web">Web</option>
              <option value="database">Database</option>
              <option value="cache">Cache</option>
              <option value="worker">Worker</option>
              <option value="backup">Backup</option>
              <option value="monitoring">Monitoring</option>
            </select>

            <select className={styles.sortSelect} value={`${sortField}:${sortDir}`} onChange={e => {
              const [f, d] = e.target.value.split(':')
              setSortField(f as SortField)
              setSortDir(d as SortDir)
            }}>
              <option value="name:asc">Name A–Z</option>
              <option value="name:desc">Name Z–A</option>
              <option value="status:asc">Status</option>
              <option value="latency:asc">Latency (low first)</option>
              <option value="cpu:desc">CPU (high first)</option>
              <option value="mem:desc">Memory (high first)</option>
              <option value="role:asc">Role</option>
              <option value="environment:asc">Environment</option>
              <option value="region:asc">Region</option>
            </select>

            <div className={styles.toolbarDivider} />

            <div className={styles.viewToggle}>
              <button className={`${styles.viewBtn} ${view === 'grid' ? styles.active : ''}`} onClick={() => setView('grid')} title="Grid view"><IcGrid /></button>
              <button className={`${styles.viewBtn} ${view === 'list' ? styles.active : ''}`} onClick={() => setView('list')} title="List view"><IcList /></button>
            </div>
          </div>

          {/* Results label */}
          {(search || filterStatus !== 'all' || filterRole !== 'all') && (
            <div style={{ fontSize: 11, color: 'var(--color-text-dim)', padding: '0 2px' }}>
              Showing {filtered.length} of {total} servers
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className={view === 'grid' ? styles.serversGrid : ''}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ height: view === 'grid' ? 200 : 44, borderRadius: 7, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <div className={styles.skeleton} style={{ height: '100%', borderRadius: 7 }} />
                </div>
              ))}
            </div>
          )}

          {/* Empty */}
          {!isLoading && filtered.length === 0 && (
            <div className={styles.emptyWrap}>
              <EmptyState
                title={search ? 'No matching servers' : 'No servers in fleet'}
                description={search ? 'Try adjusting your search or filters.' : 'Add servers via SSH key to manage them from Orbit. No agent required.'}
                action={!search ? <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>Add First Server</button> : undefined}
              />
            </div>
          )}

          {/* Grid View */}
          {!isLoading && filtered.length > 0 && view === 'grid' && (
            <div className={styles.serversGrid}>
              {filtered.map(server => (
                <ServerGridCard
                  key={server.id}
                  server={server}
                  onOpen={() => setDetailServer(server)}
                  onNavigate={() => navigate(`/servers/${server.id}`)}
                  onDragStart={() => handleDragStart(server.id)}
                  onDragOver={e => handleDragOver(e, server.id)}
                  onDrop={() => handleDrop(server.id)}
                  isDragging={dragId === server.id}
                  isDragOver={dragOverId === server.id && dragId !== server.id}
                />
              ))}
            </div>
          )}

          {/* List View */}
          {!isLoading && filtered.length > 0 && view === 'list' && (
            <div className={styles.serverTable}>
              <div className={styles.serverTableHead}>
                <span />
                <span onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>Name {sortIcon('name')}</span>
                <span onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>Status {sortIcon('status')}</span>
                <span onClick={() => handleSort('role')} style={{ cursor: 'pointer' }}>Role {sortIcon('role')}</span>
                <span onClick={() => handleSort('region')} style={{ cursor: 'pointer' }}>Region {sortIcon('region')}</span>
                <span onClick={() => handleSort('latency')} style={{ cursor: 'pointer' }}>Latency {sortIcon('latency')}</span>
                <span onClick={() => handleSort('cpu')} style={{ cursor: 'pointer' }}>CPU {sortIcon('cpu')}</span>
                <span onClick={() => handleSort('mem')} style={{ cursor: 'pointer' }}>Mem {sortIcon('mem')}</span>
                <span>Actions</span>
              </div>
              {filtered.map(server => {
                const rc = ROLE_COLOR[server.role] ?? ROLE_COLOR.web
                const hasAlerts = server.alerts.length > 0
                return (
                  <div
                    key={server.id}
                    className={`${styles.serverTableRow} ${dragId === server.id ? styles.dragging : ''} ${dragOverId === server.id && dragId !== server.id ? styles.dragOver : ''}`}
                    onClick={() => navigate(`/servers/${server.id}`)}
                    draggable
                    onDragStart={() => handleDragStart(server.id)}
                    onDragOver={e => handleDragOver(e, server.id)}
                    onDrop={() => handleDrop(server.id)}
                  >
                    <span className={styles.dragHandle}><IcDrag /></span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      {hasAlerts && <span className={styles.alertDot} style={{ flexShrink: 0 }} />}
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{server.name}</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: STATUS_COLOR[server.status] ?? 'var(--color-text-dim)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[server.status] ?? 'var(--color-text-dim)', display: 'inline-block', flexShrink: 0 }} />
                      {server.status}
                    </span>
                    <span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: rc.bg, color: rc.color }}>{server.role}</span>
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{server.region}</span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: server.latency_ms !== undefined ? (server.latency_ms > 100 ? 'var(--color-warning)' : 'var(--color-success)') : 'var(--color-text-dim)' }}>
                      {server.latency_ms !== undefined ? `${server.latency_ms}ms` : '—'}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: server.metrics ? metricColor(server.metrics.cpu_pct) : 'var(--color-text-dim)' }}>
                      {server.metrics ? `${server.metrics.cpu_pct.toFixed(2)}%` : '—'}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: server.metrics ? metricColor(server.metrics.mem_pct) : 'var(--color-text-dim)' }}>
                      {server.metrics ? `${server.metrics.mem_pct.toFixed(2)}%` : '—'}
                    </span>
                    <span style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                      <button className={styles.cardActionBtn} title="Open Detail Page" onClick={() => navigate(`/servers/${server.id}`)}><IcEye /></button>
                      <button className={styles.cardActionBtn} title="Terminal" onClick={() => {}}><IcTerminal /></button>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Right: Sidebar ── */}
        <div className={styles.sidebar}>

          {/* Groups */}
          <div className={styles.sidePanel}>
            <div className={styles.sidePanelHeader}>Server Groups</div>
            {groups.length === 0 && (
              <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--color-text-dim)' }}>No groups yet.</div>
            )}
            {groups.map(g => (
              <div
                key={g.id ?? g.name}
                className={styles.groupItem}
                onClick={() => setSearch(g.name.toLowerCase().split(' ')[0])}
              >
                <span className={styles.groupDot} style={{ background: g.color }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{g.name}</span>
                <span className={styles.groupCount}>{g.servers.length}</span>
              </div>
            ))}
          </div>

          {/* Alerts */}
          <div className={styles.sidePanel}>
            <div className={styles.sidePanelHeader}>Recent Alerts</div>
            {alerts.length === 0 && (
              <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--color-text-dim)' }}>No active alerts.</div>
            )}
            {alerts.map(a => (
              <div key={a.id} className={styles.alertItem}>
                <span className={`${styles.alertSev} ${a.severity === 'critical' ? styles.alertSevCritical : a.severity === 'warning' ? styles.alertSevWarning : styles.alertSevResolved}`}>
                  {a.severity === 'resolved' ? 'ok' : a.severity.slice(0, 4)}
                </span>
                <div>
                  <div className={styles.alertMsg}>{a.message}</div>
                  <div className={styles.alertTime}>{a.time}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className={styles.sidePanel}>
            <div className={styles.sidePanelHeader}>Quick Actions</div>
            {[
              { label: 'Run Command', action: () => setCmdOpen(true) },
              { label: 'Bulk Operations', action: () => setBulkOpen(true) },
              { label: 'Export Inventory', action: exportCSV },
              { label: 'Add Server', action: () => setAddOpen(true) },
            ].map(({ label, action }) => (
              <div key={label} className={styles.groupItem} onClick={action}>
                <span style={{ flex: 1, fontSize: 12 }}>{label}</span>
                <span style={{ color: 'var(--color-text-dim)', fontSize: 12 }}>›</span>
              </div>
            ))}
          </div>

          {/* Fleet health summary */}
          <div className={styles.sidePanel}>
            <div className={styles.sidePanelHeader}>Fleet Health</div>
            <div style={{ padding: '12px' }}>
              {[
                { label: 'Avg CPU', value: avgCpu },
                { label: 'Avg Memory', value: avgMem },
              ].map(({ label, value }) => (
                <div key={label} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 11 }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                    <span style={{ fontFamily: 'monospace', color: metricColor(value) }}>{value}%</span>
                  </div>
                  <MiniBar value={value} />
                </div>
              ))}
              <div style={{ paddingTop: 8, borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[
                  { label: 'Servers Online', val: `${online}/${total}`, color: 'var(--color-success)' },
                  { label: 'Active Alerts', val: String(alertCount), color: alertCount > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)' },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                    <span style={{ fontFamily: 'monospace', color }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      <AddServerWizard open={addOpen} onClose={() => setAddOpen(false)} />
      <ServerDetailModal server={detailServer} onClose={() => setDetailServer(null)} />
      <RunCommandModal open={cmdOpen} onClose={() => setCmdOpen(false)} servers={filtered} />
      <BulkOpsModal open={bulkOpen} onClose={() => setBulkOpen(false)} servers={filtered} />
    </div>
  )
}
