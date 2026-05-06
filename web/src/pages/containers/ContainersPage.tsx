import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchContainers, startContainer, stopContainer,
  fetchContainerImages, fetchContainerVolumes, fetchContainerNetworks, fetchDockerInfo,
  type ContainerImage, type ContainerVolume, type ContainerNetwork,
} from '@/lib/api'
import { Spinner } from '@/components/ui'
import { ContainerDetailModal } from './ContainerDetailModal'
import { ContainerCreateWizard } from './ContainerCreateWizard'
import { PullImageModal } from './PullImageModal'
import {
  formatBytes, getStateColor, getHealthColor,
  type ContainerMock, type ContainerState,
} from './containerMockData'
import styles from './ContainersPage.module.css'

// ── SVG Icons ─────────────────────────────────────────────────────
const IcoGrid      = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="1" y="1" width="4.5" height="4.5" rx="1"/><rect x="7.5" y="1" width="4.5" height="4.5" rx="1"/><rect x="1" y="7.5" width="4.5" height="4.5" rx="1"/><rect x="7.5" y="7.5" width="4.5" height="4.5" rx="1"/></svg>
const IcoList      = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><line x1="2" y1="3.5" x2="11" y2="3.5"/><line x1="2" y1="6.5" x2="11" y2="6.5"/><line x1="2" y1="9.5" x2="11" y2="9.5"/></svg>
const IcoSearch    = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="5.5" cy="5.5" r="4"/><line x1="8.5" y1="8.5" x2="12" y2="12"/></svg>
const IcoRefresh   = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 6.5A5 5 0 1 1 9 2.2"/><polyline points="9,1 11.5,2.2 10,4.5"/></svg>
const IcoPlus      = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><line x1="6.5" y1="1.5" x2="6.5" y2="11.5"/><line x1="1.5" y1="6.5" x2="11.5" y2="6.5"/></svg>
const IcoPull      = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="6.5,1 6.5,9"/><polyline points="3.5,6.5 6.5,9 9.5,6.5"/><line x1="1.5" y1="12" x2="11.5" y2="12"/></svg>
const IcoPrune     = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,3 11,3"/><path d="M4.5 3V2.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V3"/><path d="M3.5 3l.6 7a1 1 0 0 0 1 .9h2.8a1 1 0 0 0 1-.9l.6-7"/></svg>
const IcoStart     = () => <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><polygon points="2,1.5 9,5.5 2,9.5" fill="currentColor"/></svg>
const IcoStop      = () => <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="2" y="2" width="7" height="7" rx="1" fill="currentColor"/></svg>
const IcoRestart   = () => <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M10 5.5A4.5 4.5 0 1 1 8 2"/><polyline points="8,1 10,2 8.3,4"/></svg>
const IcoLogs      = () => <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="1" y="1.5" width="9" height="8" rx="1.5"/><line x1="3" y1="4" x2="8" y2="4"/><line x1="3" y1="6" x2="8" y2="6"/><line x1="3" y1="8" x2="6" y2="8"/></svg>
const IcoInfo      = () => <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="5.5" cy="5.5" r="4.5"/><line x1="5.5" y1="5" x2="5.5" y2="8"/><circle cx="5.5" cy="3.5" r="0.5" fill="currentColor" stroke="none"/></svg>
const IcoDrag      = () => <svg width="10" height="14" viewBox="0 0 10 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="3" y1="3" x2="3" y2="3.01"/><line x1="7" y1="3" x2="7" y2="3.01"/><line x1="3" y1="7" x2="3" y2="7.01"/><line x1="7" y1="7" x2="7" y2="7.01"/><line x1="3" y1="11" x2="3" y2="11.01"/><line x1="7" y1="11" x2="7" y2="11.01"/></svg>

type ViewMode = 'grid' | 'list'
type SortKey  = 'name' | 'cpu' | 'memory' | 'status' | 'uptime'
type FilterState = 'all' | 'running' | 'exited' | 'paused' | 'restarting'
type PageTab  = 'containers' | 'images' | 'volumes' | 'networks'

function stateBadgeStyle(state: ContainerState) {
  const color = getStateColor(state)
  return { background: `${color}1a`, borderColor: `${color}40`, color }
}

function cpuColor(pct: number) {
  if (pct > 80) return 'var(--color-danger)'
  if (pct > 50) return 'var(--color-warning)'
  return 'var(--color-accent)'
}

export default function ContainersPage() {
  const qc = useQueryClient()
  const [view, setView]               = useState<ViewMode>('grid')
  const [sortKey, setSortKey]         = useState<SortKey>('name')
  const [sortAsc, setSortAsc]         = useState(true)
  const [search, setSearch]           = useState('')
  const [stateFilter, setStateFilter] = useState<FilterState>('all')
  const [pageTab, setPageTab]         = useState<PageTab>('containers')
  const [dragId, setDragId]           = useState<string | null>(null)
  const [dragOverId, setDragOverId]   = useState<string | null>(null)
  const [order, setOrder]             = useState<string[]>([])
  const [detailContainer, setDetailContainer] = useState<ContainerMock | null>(null)
  const [createOpen, setCreateOpen]   = useState(false)
  const [pullOpen, setPullOpen]       = useState(false)
  const [pendingId, setPendingId]     = useState<string | null>(null)

  // Real API data (may fail if Docker unavailable)
  const { data: apiContainers = [], isFetching, refetch } = useQuery({
    queryKey: ['containers'], queryFn: fetchContainers,
    refetchInterval: 10000, retry: false,
  })
  const { data: apiImages = [] } = useQuery({
    queryKey: ['container-images'], queryFn: fetchContainerImages,
    retry: false,
  })
  const { data: apiVolumes = [] } = useQuery({
    queryKey: ['container-volumes'], queryFn: fetchContainerVolumes,
    retry: false,
  })
  const { data: apiNetworks = [] } = useQuery({
    queryKey: ['container-networks'], queryFn: fetchContainerNetworks,
    retry: false,
  })
  const { data: dockerInfo } = useQuery({
    queryKey: ['docker-info'], queryFn: fetchDockerInfo,
    retry: false,
  })

  const startM = useMutation({
    mutationFn: (id: string) => startContainer(id),
    onMutate: (id) => setPendingId(id),
    onSettled: () => { setPendingId(null); qc.invalidateQueries({ queryKey: ['containers'] }) },
  })
  const stopM = useMutation({
    mutationFn: (id: string) => stopContainer(id),
    onMutate: (id) => setPendingId(id),
    onSettled: () => { setPendingId(null); qc.invalidateQueries({ queryKey: ['containers'] }) },
  })

  // Map real API containers to ContainerMock shape (no mock fallback)
  const containers: ContainerMock[] = useMemo(() => {
    return apiContainers.map(c => {
      const safeState: ContainerState = (['running', 'exited', 'paused', 'restarting'] as const).includes(c.state as ContainerState) ? (c.state as ContainerState) : 'exited'
      return {
        id: c.id,
        name: c.name.replace(/^\//, ''),
        image: c.image,
        imageId: '',
        state: safeState,
        status: c.status,
        health: 'none',
        cpu_pct: c.cpu_pct,
        mem_bytes: c.mem_bytes,
        mem_limit: c.mem_limit,
        net_rx_bps: 0,
        net_tx_bps: 0,
        disk_read_bps: 0,
        disk_write_bps: 0,
        pids: 0,
        pid_limit: 0,
        ports: [],
        network: 'bridge',
        ip: '',
        uptime: c.status,
        mounts: [],
        env: [],
        command: '',
        entrypoint: '',
        labels: {},
        restartPolicy: 'no',
        restartCount: 0,
        created: 0,
        hostname: c.id.slice(0, 12),
        logs: [],
        events: [],
        processes: [],
      } satisfies ContainerMock
    })
  }, [apiContainers])

  // Filter + sort
  const filtered = useMemo(() => {
    const ordered = order.map(id => containers.find(c => c.id === id)).filter(Boolean) as ContainerMock[]
    const rest = containers.filter(c => !order.includes(c.id))
    const all = [...ordered, ...rest]

    return all
      .filter(c => {
        if (stateFilter !== 'all' && c.state !== stateFilter) return false
        if (search) {
          const q = search.toLowerCase()
          if (!c.name.includes(q) && !c.image.includes(q) && !c.id.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        let va: string | number
        let vb: string | number
        if (sortKey === 'cpu')    { va = a.cpu_pct; vb = b.cpu_pct }
        else if (sortKey === 'memory') { va = a.mem_bytes; vb = b.mem_bytes }
        else if (sortKey === 'status') { va = a.state; vb = b.state }
        else { va = a.name; vb = b.name }
        const cmp = va < vb ? -1 : va > vb ? 1 : 0
        return sortAsc ? cmp : -cmp
      })
  }, [containers, order, search, stateFilter, sortKey, sortAsc])

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc(a => !a)
    else { setSortKey(k); setSortAsc(true) }
  }

  // Drag handlers
  const handleDragStart = (id: string) => setDragId(id)
  const handleDragOver = (e: React.DragEvent, id: string) => { e.preventDefault(); setDragOverId(id) }
  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return }
    const ids = containers.map(c => c.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    const next = [...ids]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setOrder(next)
    setDragId(null); setDragOverId(null)
  }
  const handleDragEnd = () => { setDragId(null); setDragOverId(null) }

  // Counts
  const running   = containers.filter(c => c.state === 'running').length
  const stopped   = containers.filter(c => c.state === 'exited').length
  const paused    = containers.filter(c => c.state === 'paused').length
  const restarting = containers.filter(c => c.state === 'restarting').length
  const unhealthy = containers.filter(c => c.health === 'unhealthy').length

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      className={`${styles.sortBtn} ${sortKey === k ? styles.sortBtnActive : ''}`}
      onClick={() => handleSort(k)}
    >
      {label}{sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : ''}
    </button>
  )

  // Docker plugin/daemon warning
  const dockerUnavailable = !isFetching && dockerInfo === undefined
  const dockerNotRunning  = dockerInfo && !dockerInfo.version

  return (
    <div>
      {/* ── Docker unavailable warning ── */}
      {dockerUnavailable && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', marginBottom:12, borderRadius:7, border:'1px solid rgba(246,173,85,0.3)', background:'rgba(246,173,85,0.07)', fontSize:12.5, color:'#f6ad55' }}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="M10 2l7 4v8l-7 4-7-4V6z"/></svg>
          <div>
            <strong>Docker daemon is not reachable.</strong>
            {' '}Ensure Docker is installed and running on this server. Container management is unavailable.
          </div>
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div className={styles.statsRow}>
        {[
          { label: 'Running', val: running, color: 'var(--color-success)', sub: 'containers' },
          { label: 'Stopped', val: stopped, color: 'var(--color-danger)', sub: 'exited' },
          { label: 'Paused', val: paused + restarting, color: 'var(--color-warning)', sub: 'incl. restarting' },
          { label: 'Images', val: dockerInfo?.imagesCount ?? apiImages.length, color: 'var(--color-accent)', sub: 'local cache' },
          { label: 'Volumes', val: dockerInfo?.volumesCount ?? apiVolumes.length, color: '#10b981', sub: 'named + bind' },
          { label: 'Networks', val: dockerInfo?.networksCount ?? apiNetworks.length, color: '#a78bfa', sub: 'active' },
        ].map(s => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statAccent} style={{ background: s.color }} />
            <div className={styles.statLabel}>{s.label}</div>
            <div className={styles.statValue} style={{ color: s.color }}>{s.val}</div>
            <div className={styles.statSub}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Docker info bar ── */}
      <div className={styles.infoBar}>
        {[
          { k: 'Docker', v: dockerInfo ? `v${dockerInfo.version}` : '—' },
          { k: 'API', v: dockerInfo?.apiVersion ?? '—' },
          { k: 'OS / Arch', v: dockerInfo ? `${dockerInfo.os} / ${dockerInfo.arch}` : '—' },
          { k: 'Kernel', v: dockerInfo?.kernelVersion ?? '—' },
          { k: 'Disk Usage', v: dockerInfo?.diskUsage ?? '—' },
        ].map(item => (
          <div key={item.k} className={styles.infoItem}>
            {item.k}: <span className={styles.infoVal}>{item.v}</span>
          </div>
        ))}
        {isFetching && <span style={{ marginLeft: 'auto', color: 'var(--color-text-dim)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}><Spinner size="sm" /> syncing</span>}
      </div>

      {/* ── Alert banner if any unhealthy ── */}
      {unhealthy > 0 && (
        <div className={styles.alertBanner}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M7 1L13 12H1L7 1z"/><line x1="7" y1="5.5" x2="7" y2="8.5"/><circle cx="7" cy="10.5" r="0.5" fill="currentColor" stroke="none"/></svg>
          <span style={{ fontWeight: 600 }}>{unhealthy} container{unhealthy > 1 ? 's' : ''} unhealthy</span>
          <span style={{ color: 'rgba(244,67,54,.7)' }}>—</span>
          <span>{containers.filter(c => c.health === 'unhealthy').map(c => c.name).join(', ')}</span>
        </div>
      )}

      {/* ── Quick actions ── */}
      <div className={styles.quickActions}>
        <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <IcoPlus /> Create Container
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setPullOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <IcoPull /> Pull Image
        </button>
        <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <IcoPrune /> Prune System
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={() => refetch()} disabled={isFetching} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {isFetching ? <Spinner size="sm" /> : <IcoRefresh />} Refresh
        </button>
      </div>

      {/* ── Page tabs ── */}
      <div className={styles.tabs}>
        {(['containers', 'images', 'volumes', 'networks'] as PageTab[]).map(t => (
          <button
            key={t}
            className={`${styles.tab} ${pageTab === t ? styles.tabActive : ''}`}
            onClick={() => setPageTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            <span className={styles.tabCount}>
              {t === 'containers' ? containers.length : t === 'images' ? apiImages.length : t === 'volumes' ? apiVolumes.length : apiNetworks.length}
            </span>
          </button>
        ))}
      </div>

      {/* ── Containers tab ── */}
      {pageTab === 'containers' && (
        <>
          {/* Toolbar */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}><IcoSearch /></span>
                <input
                  className={styles.searchInput}
                  placeholder="Search containers…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <select className={styles.filterSelect} value={stateFilter} onChange={e => setStateFilter(e.target.value as FilterState)}>
                <option value="all">All states</option>
                <option value="running">Running</option>
                <option value="exited">Stopped</option>
                <option value="paused">Paused</option>
                <option value="restarting">Restarting</option>
              </select>
            </div>
            <div className={styles.toolbarRight}>
              <SortBtn k="name" label="Name" />
              <SortBtn k="cpu" label="CPU" />
              <SortBtn k="memory" label="Memory" />
              <SortBtn k="status" label="Status" />
              <div className={styles.viewToggle}>
                <button className={`${styles.viewBtn} ${view === 'grid' ? styles.viewBtnActive : ''}`} onClick={() => setView('grid')} title="Grid view"><IcoGrid /></button>
                <button className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnActive : ''}`} onClick={() => setView('list')} title="List view"><IcoList /></button>
              </div>
            </div>
          </div>

          {/* Grid view */}
          {view === 'grid' && (
            <div className={styles.grid}>
              {filtered.length === 0 && (
                <div className={styles.empty} style={{ gridColumn: '1/-1' }}>No containers match your filter.</div>
              )}
              {filtered.map(c => {
                const sc = getStateColor(c.state)
                const hc = getHealthColor(c.health)
                const cpuPct = c.cpu_pct
                const memPct = c.mem_limit > 0 ? (c.mem_bytes / c.mem_limit) * 100 : 0
                return (
                  <div
                    key={c.id}
                    className={`${styles.containerCard} ${dragId === c.id ? styles.cardDragging : ''} ${dragOverId === c.id ? styles.cardDragOver : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(c.id)}
                    onDragOver={e => handleDragOver(e, c.id)}
                    onDrop={() => handleDrop(c.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => setDetailContainer(c)}
                  >
                    <div className={styles.cardAccent} style={{ background: sc }} />

                    <div className={styles.cardHeader}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className={styles.cardTitle}>{c.name}</div>
                        <div className={styles.cardImage}>{c.image}</div>
                        <div className={styles.cardId}>{c.id}</div>
                      </div>
                      <div className={styles.cardBadges}>
                        {c.health !== 'none' && (
                          <div className={styles.healthDot} style={{ background: hc }} title={`Health: ${c.health}`} />
                        )}
                        <span className={styles.stateBadge} style={stateBadgeStyle(c.state)}>
                          {c.state}
                        </span>
                      </div>
                    </div>

                    {c.state === 'running' && (
                      <div className={styles.cardStats} onClick={e => e.stopPropagation()}>
                        <div className={styles.barRow}>
                          <span className={styles.barLabel}>CPU</span>
                          <div className={styles.bar}><div className={styles.barFill} style={{ width: `${Math.min(100, cpuPct)}%`, background: cpuColor(cpuPct) }} /></div>
                          <span className={styles.barVal} style={{ color: cpuColor(cpuPct) }}>{cpuPct.toFixed(1)}%</span>
                        </div>
                        <div className={styles.barRow}>
                          <span className={styles.barLabel}>MEM</span>
                          <div className={styles.bar}><div className={styles.barFill} style={{ width: `${Math.min(100, memPct)}%`, background: 'var(--color-success)' }} /></div>
                          <span className={styles.barVal}>{formatBytes(c.mem_bytes)}</span>
                        </div>
                        <div className={styles.barRow}>
                          <span className={styles.barLabel}>NET</span>
                          <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--color-text-dim)' }}>
                            {formatBytes(c.net_rx_bps)}/s in · {formatBytes(c.net_tx_bps)}/s out
                          </span>
                        </div>
                      </div>
                    )}

                    {c.ports.length > 0 && (
                      <div className={styles.cardPorts} onClick={e => e.stopPropagation()}>
                        {c.ports.slice(0, 3).map((p, i) => (
                          <span key={i} className={styles.portBadge}>{p.hostPort}:{p.containerPort}/{p.protocol}</span>
                        ))}
                        {c.ports.length > 3 && <span className={styles.portBadge}>+{c.ports.length - 3}</span>}
                      </div>
                    )}

                    <div className={styles.cardFooter} onClick={e => e.stopPropagation()}>
                      <span className={styles.cardMeta}>{c.status}</span>
                      <div className={styles.cardActions}>
                        {pendingId === c.id ? <Spinner size="sm" /> : (
                          <>
                            <button
                              className={`${styles.iconBtn} ${styles.iconBtnSuccess}`}
                              onClick={() => startM.mutate(c.id)}
                              disabled={c.state === 'running'}
                              title="Start"
                            ><IcoStart /></button>
                            <button
                              className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                              onClick={() => stopM.mutate(c.id)}
                              disabled={c.state !== 'running'}
                              title="Stop"
                            ><IcoStop /></button>
                            <button
                              className={styles.iconBtn}
                              onClick={() => stopM.mutate(c.id)}
                              title="Restart"
                            ><IcoRestart /></button>
                            <button
                              className={styles.iconBtn}
                              onClick={() => setDetailContainer(c)}
                              title="Inspect"
                            ><IcoInfo /></button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* List view */}
          {view === 'list' && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th} style={{ width: 30 }}></th>
                    <th className={styles.th}>Container</th>
                    <th className={styles.th}>Image</th>
                    <th className={styles.th} style={{ width: 100 }}>State</th>
                    <th className={styles.th} style={{ width: 130 }}>CPU</th>
                    <th className={styles.th} style={{ width: 140 }}>Memory</th>
                    <th className={styles.th}>Ports</th>
                    <th className={styles.th} style={{ width: 110 }}>Uptime</th>
                    <th className={styles.th} style={{ width: 110 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className={styles.empty}>No containers match your filter.</td></tr>
                  )}
                  {filtered.map(c => {
                    const sc = getStateColor(c.state)
                    const hc = getHealthColor(c.health)
                    const cpuPct = c.cpu_pct
                    const memPct = c.mem_limit > 0 ? (c.mem_bytes / c.mem_limit) * 100 : 0
                    return (
                      <tr
                        key={c.id}
                        className={`${styles.tr} ${dragId === c.id ? styles.trDragging : ''} ${dragOverId === c.id ? styles.trDragOver : ''}`}
                        onClick={() => setDetailContainer(c)}
                        draggable
                        onDragStart={() => handleDragStart(c.id)}
                        onDragOver={e => handleDragOver(e, c.id)}
                        onDrop={() => handleDrop(c.id)}
                        onDragEnd={handleDragEnd}
                      >
                        <td className={styles.td} onClick={e => e.stopPropagation()}>
                          <div className={styles.dragHandle}><IcoDrag /></div>
                        </td>
                        <td className={styles.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 12, fontFamily: 'monospace' }}>{c.name}</div>
                              <div style={{ fontSize: 10, color: 'var(--color-text-dim)', fontFamily: 'monospace' }}>{c.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className={styles.td} style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-muted)' }}>{c.image}</td>
                        <td className={styles.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: `${sc}1a`, border: `1px solid ${sc}40`, color: sc }}>{c.state}</span>
                            {c.health !== 'none' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: hc }} title={c.health} />}
                          </div>
                        </td>
                        <td className={styles.td}>
                          {c.state === 'running' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 11, fontFamily: 'monospace', color: cpuColor(cpuPct), minWidth: 36 }}>{cpuPct.toFixed(1)}%</span>
                              <div className={styles.usageBar}><div className={styles.usageBarFill} style={{ width: `${Math.min(100, cpuPct)}%`, background: cpuColor(cpuPct) }} /></div>
                            </div>
                          ) : <span style={{ color: 'var(--color-text-dim)', fontSize: 11 }}>—</span>}
                        </td>
                        <td className={styles.td}>
                          {c.state === 'running' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 11, fontFamily: 'monospace', minWidth: 54 }}>{formatBytes(c.mem_bytes)}</span>
                              <div className={styles.usageBar}><div className={styles.usageBarFill} style={{ width: `${Math.min(100, memPct)}%`, background: 'var(--color-success)' }} /></div>
                            </div>
                          ) : <span style={{ color: 'var(--color-text-dim)', fontSize: 11 }}>—</span>}
                        </td>
                        <td className={styles.td}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {c.ports.slice(0, 2).map((p, i) => (
                              <span key={i} className={styles.portBadge}>{p.hostPort}:{p.containerPort}</span>
                            ))}
                            {c.ports.length > 2 && <span className={styles.portBadge}>+{c.ports.length - 2}</span>}
                            {c.ports.length === 0 && <span style={{ color: 'var(--color-text-dim)', fontSize: 11 }}>—</span>}
                          </div>
                        </td>
                        <td className={styles.td} style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{c.uptime}</td>
                        <td className={styles.td} onClick={e => e.stopPropagation()}>
                          {pendingId === c.id ? <Spinner size="sm" /> : (
                            <div style={{ display: 'flex', gap: 3 }}>
                              <button className={`${styles.iconBtn} ${styles.iconBtnSuccess}`} onClick={() => startM.mutate(c.id)} disabled={c.state === 'running'} title="Start"><IcoStart /></button>
                              <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => stopM.mutate(c.id)} disabled={c.state !== 'running'} title="Stop"><IcoStop /></button>
                              <button className={styles.iconBtn} title="Restart"><IcoRestart /></button>
                              <button className={`${styles.iconBtn} ${styles.iconBtnActive}`} onClick={() => setDetailContainer(c)} title="Logs / Inspect"><IcoLogs /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Images tab ── */}
      {pageTab === 'images' && (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.imageTable}`}>
            <thead>
              <tr>
                <th className={styles.th}>Repository</th>
                <th className={styles.th}>Tag</th>
                <th className={styles.th}>Image ID</th>
                <th className={styles.th}>Size</th>
                <th className={styles.th}>Created</th>
                <th className={styles.th} style={{ width: 90 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {apiImages.length === 0 && (
                <tr><td colSpan={6} className={styles.empty}>No images found.</td></tr>
              )}
              {(apiImages as ContainerImage[]).map(img => (
                <tr key={img.id} className={styles.tr}>
                  <td className={styles.td} style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{img.repository}</td>
                  <td className={styles.td}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', padding: '1px 6px', borderRadius: 5 }}>{img.tag}</span>
                  </td>
                  <td className={styles.td} style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--color-accent)' }}>{img.id.slice(0, 12)}</td>
                  <td className={styles.td} style={{ fontFamily: 'monospace', fontSize: 11 }}>{img.size}</td>
                  <td className={styles.td} style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{img.created}</td>
                  <td className={styles.td}>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Remove" onClick={() => {}}>
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><polyline points="1.5,2.5 9.5,2.5"/><path d="M3.5 2.5V2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v.5"/><path d="M2.5 2.5l.5 7a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9l.5-7"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Volumes tab ── */}
      {pageTab === 'volumes' && (
        <div className={styles.resourceGrid}>
          {apiVolumes.length === 0 && <div className={styles.empty}>No volumes found.</div>}
          {(apiVolumes as ContainerVolume[]).map(v => (
            <div key={v.name} className={styles.resourceCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--color-accent)" strokeWidth="1.7" strokeLinecap="round"><ellipse cx="7" cy="4" rx="5" ry="2.5"/><path d="M2 4v6c0 1.38 2.24 2.5 5 2.5s5-1.12 5-2.5V4"/><path d="M2 7c0 1.38 2.24 2.5 5 2.5S12 8.38 12 7"/></svg>
                <div className={styles.resourceCardTitle}>{v.name}</div>
              </div>
              <div className={styles.resourceMeta}>
                {[
                  { k: 'Driver', v: v.driver },
                  { k: 'Size', v: v.size },
                  { k: 'Created', v: v.created },
                  { k: 'Mountpoint', v: v.mountpoint },
                ].map(r => (
                  <div key={r.k} className={styles.resourceMetaRow}>
                    <span className={styles.resourceMetaKey}>{r.k}</span>
                    <span className={styles.resourceMetaVal} title={r.v}>{r.v}</span>
                  </div>
                ))}
                {v.usedBy.length > 0 && (
                  <div className={styles.resourceMetaRow}>
                    <span className={styles.resourceMetaKey}>Used by</span>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {v.usedBy.map(u => <span key={u} className={styles.usedByBadge}>{u}</span>)}
                    </div>
                  </div>
                )}
                {v.usedBy.length === 0 && (
                  <div className={styles.resourceMetaRow}>
                    <span className={styles.resourceMetaKey}>Used by</span>
                    <span className={styles.unusedBadge} style={{ fontSize: 9, padding: '1px 5px' }}>unused</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Networks tab ── */}
      {pageTab === 'networks' && (
        <div className={styles.resourceGrid}>
          {apiNetworks.length === 0 && <div className={styles.empty}>No networks found.</div>}
          {(apiNetworks as ContainerNetwork[]).map(n => (
            <div key={n.id} className={styles.resourceCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--color-success)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="5.5"/><line x1="1.5" y1="7" x2="12.5" y2="7"/><path d="M7 1.5a10 10 0 0 1 2.5 5.5A10 10 0 0 1 7 12.5A10 10 0 0 1 4.5 7A10 10 0 0 1 7 1.5z"/></svg>
                <div className={styles.resourceCardTitle}>{n.name}</div>
                {n.internal && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,152,0,.1)', border: '1px solid rgba(255,152,0,.2)', color: 'var(--color-warning)' }}>internal</span>}
              </div>
              <div className={styles.resourceMeta}>
                {[
                  { k: 'Driver', v: n.driver },
                  { k: 'Subnet', v: n.subnet },
                  { k: 'Gateway', v: n.gateway },
                  { k: 'Containers', v: String(n.containers) },
                  { k: 'Created', v: n.created },
                ].map(r => (
                  <div key={r.k} className={styles.resourceMetaRow}>
                    <span className={styles.resourceMetaKey}>{r.k}</span>
                    <span className={styles.resourceMetaVal}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Detail modal ── */}
      {detailContainer && (
        <ContainerDetailModal
          container={detailContainer}
          onClose={() => setDetailContainer(null)}
        />
      )}

      {/* ── Create wizard ── */}
      {createOpen && <ContainerCreateWizard onClose={() => setCreateOpen(false)} />}

      {/* ── Pull Image modal ── */}
      {pullOpen && <PullImageModal onClose={() => setPullOpen(false)} />}
    </div>
  )
}
