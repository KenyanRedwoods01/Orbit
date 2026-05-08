import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatBytes, formatBps } from '@/lib/utils'
import { useProcesses } from './useProcesses'
import type { ProcessEntry } from './useProcesses'
import { ProcessAvatar, PROC_BRAND } from '@/components/ProcessIcon'
import styles from './ProcessesPage.module.css'

// ── Types ────────────────────────────────────────────────────
type SortKey = 'cpu_pct' | 'mem_pct' | 'mem_rss' | 'pid' | 'name' | 'threads' | 'fds' | 'nice' | 'io'
type ViewMode = 'list' | 'grid'
type StatusFilter = 'all' | 'R' | 'S' | 'Z'
interface ColVis { virt: boolean; ppid: boolean; nice: boolean; io: boolean; cmd: boolean }

// ── Helpers ──────────────────────────────────────────────────
function cpuColor(v: number) {
  if (v >= 50) return '#ef4444'
  if (v >= 20) return '#f97316'
  if (v >= 10) return '#4a9eff'
  return '#22c55e'
}
function memColor(v: number) {
  if (v >= 20) return '#ef4444'
  if (v >= 10) return '#f97316'
  if (v >= 5)  return '#4a9eff'
  return '#22c55e'
}
function getAccent(name: string) {
  return PROC_BRAND[name.toLowerCase()]?.color ?? '#94a3b8'
}
function exportCSV(rows: ProcessEntry[]) {
  const cols = ['pid','name','user','cpu_pct','mem_pct','mem_rss','threads','fds','nice','status','cmdline']
  const header = cols.join(',')
  const lines  = rows.map(r => cols.map(c => {
    const v = (r as unknown as Record<string, unknown>)[c]
    return typeof v === 'string' && v.includes(',') ? `"${v}"` : v
  }).join(','))
  const blob = new Blob([header + '\n' + lines.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = 'processes.csv'; a.click()
}

// ── Mini SVG sparkline ────────────────────────────────────────
function Sparkline({ pts, color }: { pts: number[]; color: string }) {
  if (pts.length < 2) return <span style={{ display: 'inline-block', width: 44 }} />
  const max = Math.max(...pts, 0.5)
  const W = 44, H = 16
  const coords = pts.map((v, i) =>
    `${((i / (pts.length - 1)) * W).toFixed(1)},${(H - (v / max) * (H - 2) - 1).toFixed(1)}`
  ).join(' ')
  return (
    <svg width={W} height={H} style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/>
    </svg>
  )
}

// ── Status badge ─────────────────────────────────────────────
function StatusBadge({ s }: { s: string }) {
  const map: Record<string, [string, string]> = {
    R: ['Running',  styles.statusR],
    S: ['Sleeping', styles.statusS],
    Z: ['Zombie',   styles.statusZ],
    D: ['Disk Wait',styles.statusD],
    T: ['Stopped',  styles.statusT],
  }
  const [label, cls] = map[s] ?? [s || '?', styles.statusOther]
  return <span className={`${styles.statusBadge} ${cls}`}>{label}</span>
}

// ── Active filter chip ────────────────────────────────────────
function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className={styles.chip}>
      {label}
      <button className={styles.chipX} onClick={onRemove} title="Remove filter">
        <svg viewBox="0 0 12 12" width="8" height="8" fill="currentColor">
          <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </button>
    </span>
  )
}

// ── SVG icons ─────────────────────────────────────────────────
const Ic = (d: string, w = 14) =>
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" width={w} height={w}><path d={d}/></svg>

function IconSearch()   { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><circle cx="8.5" cy="8.5" r="5"/><line x1="13" y1="13" x2="17" y2="17"/></svg> }
function IconList()     { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" width="13" height="13"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></svg> }
function IconGrid()     { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/></svg> }
function IconFilter()   { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M3 5h14M6 10h8M9 15h2"/></svg> }
function IconCols()     { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" width="13" height="13"><rect x="2" y="3" width="5" height="14" rx="1"/><rect x="9" y="3" width="5" height="14" rx="1"/></svg> }
function IconExport()   { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M3 14v3h14v-3M10 3v9M7 9l3 3 3-3"/></svg> }
function IconSignal()   { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><path d="M3 17c1.5-1.5 3.5-2 4-4s-1-3-1-5 2-4 4-4 4 2 4 4-1 3-1 5 2.5 2.5 4 4"/></svg> }
function IconClose()    { return Ic('M5 5l10 10M15 5L5 15', 12) }
function IconArrow()    { return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="11" height="11"><line x1="3" y1="8" x2="13" y2="8"/><polyline points="9,4 13,8 9,12"/></svg> }
function IconRefresh()  { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M4 12a6 6 0 1 0 1-5.2"/><polyline points="1,6 4,9 7,6"/></svg> }
function IconCheck()    { return <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="10" height="10"><polyline points="2,6 5,9 10,3"/></svg> }

// ── Stat card ─────────────────────────────────────────────────
function StatCard({ label, value, icon, color, active, onClick }:
  { label: string; value: number | string; icon: React.ReactNode; color: string; active?: boolean; onClick?: () => void }) {
  return (
    <button className={`${styles.statCard} ${active ? styles.statCardActive : ''}`} onClick={onClick}
      style={{ ['--stat-color' as string]: color }}>
      <div className={styles.statIcon}>{icon}</div>
      <div className={styles.statVal}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </button>
  )
}

// ── Context menu ─────────────────────────────────────────────
interface CtxMenu { x: number; y: number; proc: ProcessEntry }
function ContextMenu({ menu, onClose, onNavigate, onSignal, onCopy }:
  { menu: CtxMenu; onClose: () => void; onNavigate: () => void;
    onSignal: (sig: string) => void; onCopy: (what: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  return (
    <div ref={ref} className={styles.ctxMenu} style={{ left: menu.x, top: menu.y }}>
      <div className={styles.ctxHead}>{menu.proc.name} · {menu.proc.pid}</div>
      <button className={styles.ctxItem} onClick={onNavigate}>{Ic('M3 10h14M10 3l7 7-7 7')} Open detail</button>
      <div className={styles.ctxDivider}/>
      <div className={styles.ctxGroup}>Signals</div>
      {['SIGTERM','SIGKILL','SIGHUP','SIGSTOP','SIGCONT'].map(s => (
        <button key={s} className={`${styles.ctxItem} ${s === 'SIGKILL' ? styles.ctxItemDanger : ''}`}
          onClick={() => { onSignal(s); onClose() }}>
          <IconSignal /> {s}
        </button>
      ))}
      <div className={styles.ctxDivider}/>
      <button className={styles.ctxItem} onClick={() => { onCopy('pid'); onClose() }}>
        {Ic('M8 3H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3M8 3h8v8H8z')} Copy PID
      </button>
      <button className={styles.ctxItem} onClick={() => { onCopy('name'); onClose() }}>
        {Ic('M8 3H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3M8 3h8v8H8z')} Copy name
      </button>
      <button className={styles.ctxItem} onClick={() => { onCopy('cmd'); onClose() }}>
        {Ic('M8 3H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3M8 3h8v8H8z')} Copy command
      </button>
    </div>
  )
}

// ── Custom select dropdown ────────────────────────────────────
interface SelectOption { value: string; label: string }
function SelectDropdown({ value, onChange, options, prefix }: {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  prefix?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const selected = options.find(o => o.value === value)
  return (
    <div className={styles.sel} ref={ref}>
      <button
        className={`${styles.selTrigger} ${open ? styles.selTriggerOpen : ''}`}
        onClick={() => setOpen(v => !v)}
        type="button"
      >
        {prefix && <span className={styles.selPrefix}>{prefix}</span>}
        <span className={styles.selLabel}>{selected?.label ?? value}</span>
        <span className={`${styles.selChevron} ${open ? styles.selChevronUp : ''}`}>
          <svg viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1,3 5,7 9,3"/>
          </svg>
        </span>
      </button>
      {open && (
        <div className={styles.selMenu}>
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`${styles.selOption} ${opt.value === value ? styles.selOptionActive : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false) }}
            >
              <span className={styles.selOptionTick}>
                {opt.value === value && <IconCheck />}
              </span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Column visibility dropdown ────────────────────────────────
function ColVisMenu({ cols, toggle, onClose }:
  { cols: ColVis; toggle: (k: keyof ColVis) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  const items: Array<[keyof ColVis, string]> = [
    ['io',   'I/O'],
    ['virt', 'Virtual Mem'],
    ['ppid', 'PPID'],
    ['nice', 'Nice'],
    ['cmd',  'Command'],
  ]
  return (
    <div ref={ref} className={styles.colMenu}>
      <div className={styles.colMenuTitle}>Show columns</div>
      {items.map(([k, label]) => (
        <button key={k} className={styles.colItem} onClick={() => toggle(k)}>
          <span className={`${styles.colCheck} ${cols[k] ? styles.colCheckOn : ''}`}>
            {cols[k] && <IconCheck />}
          </span>
          {label}
        </button>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function ProcessesPage() {
  const navigate  = useNavigate()
  const { processes } = useProcesses()

  // View + sort
  const [view,    setView]    = useState<ViewMode>('list')
  const [sortKey, setSortKey] = useState<SortKey>('cpu_pct')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Filters
  const [search,        setSearch]        = useState('')
  const [filterStatus,  setFilterStatus]  = useState<StatusFilter>('all')
  const [filterUser,    setFilterUser]    = useState('all')
  const [filterCpuMin,  setFilterCpuMin]  = useState(0)
  const [filterMemMin,  setFilterMemMin]  = useState(0)
  const [filtersOpen,   setFiltersOpen]   = useState(false)

  // Multi-select
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // Column visibility
  const [cols, setCols] = useState<ColVis>({ virt: false, ppid: false, nice: false, io: true, cmd: false })
  const [colMenuOpen, setColMenuOpen] = useState(false)

  // Pagination
  const [pageSize, setPageSize] = useState(25)
  const [page,     setPage]     = useState(1)

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)

  // Signal toast
  const [toast, setToast] = useState<string | null>(null)

  // Sparklines — accumulate CPU history per PID
  const [sparklines, setSparklines] = useState<Map<number, number[]>>(new Map())
  useEffect(() => {
    setSparklines(prev => {
      const next = new Map(prev)
      processes.forEach(p => {
        const arr = [...(next.get(p.pid) ?? []), p.cpu_pct]
        next.set(p.pid, arr.slice(-16))
      })
      return next
    })
  }, [processes])

  // Stats
  const allUsers   = useMemo(() => ['all', ...Array.from(new Set(processes.map(p => p.user))).sort()], [processes])
  const stats = useMemo(() => ({
    total:   processes.length,
    running: processes.filter(p => p.status === 'R').length,
    sleeping:processes.filter(p => p.status === 'S').length,
    highCpu: processes.filter(p => p.cpu_pct >= 10).length,
    highMem: processes.filter(p => p.mem_pct >= 5).length,
  }), [processes])

  // Active filters for chips
  const activeFilters: Array<{ label: string; clear: () => void }> = []
  if (filterStatus !== 'all')  activeFilters.push({ label: `Status: ${filterStatus === 'R' ? 'Running' : filterStatus === 'S' ? 'Sleeping' : 'Zombie'}`, clear: () => setFilterStatus('all') })
  if (filterUser   !== 'all')  activeFilters.push({ label: `User: ${filterUser}`, clear: () => setFilterUser('all') })
  if (filterCpuMin  > 0)       activeFilters.push({ label: `CPU >${filterCpuMin}%`, clear: () => setFilterCpuMin(0) })
  if (filterMemMin  > 0)       activeFilters.push({ label: `Mem >${filterMemMin}%`, clear: () => setFilterMemMin(0) })
  if (search.trim())           activeFilters.push({ label: `Search: ${search.trim()}`, clear: () => setSearch('') })

  // Filtered + sorted
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    let list = processes.filter(p => {
      if (filterStatus !== 'all' && p.status !== filterStatus) return false
      if (filterUser   !== 'all' && p.user   !== filterUser)   return false
      if (p.cpu_pct < filterCpuMin)                             return false
      if (p.mem_pct < filterMemMin)                             return false
      if (q && !p.name.includes(q) && !String(p.pid).includes(q) && !p.user.includes(q) && !p.cmdline.toLowerCase().includes(q)) return false
      return true
    })
    return [...list].sort((a, b) => {
      let va: number | string, vb: number | string
      if (sortKey === 'io') { va = a.io_read_bps + a.io_write_bps; vb = b.io_read_bps + b.io_write_bps }
      else { va = a[sortKey] as number | string; vb = b[sortKey] as number | string }
      if (typeof va === 'string' && typeof vb === 'string')
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
    })
  }, [processes, search, filterStatus, filterUser, filterCpuMin, filterMemMin, sortKey, sortDir])

  // Paginated
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safeP      = Math.min(page, totalPages)
  const paginated  = view === 'list' ? filtered.slice((safeP - 1) * pageSize, safeP * pageSize) : filtered

  const toggle = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
    setPage(1)
  }
  const go = (p: ProcessEntry) => navigate(`/processes/${p.pid}`, { state: p })

  // Selection helpers
  const toggleSelect = (pid: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected(prev => { const n = new Set(prev); n.has(pid) ? n.delete(pid) : n.add(pid); return n })
  }
  const selectAll   = () => setSelected(new Set(paginated.map(p => p.pid)))
  const deselectAll = () => setSelected(new Set())
  const allChecked  = paginated.length > 0 && paginated.every(p => selected.has(p.pid))

  // Signal
  const sendSignal = useCallback((sig: string, pids: number[]) => {
    setToast(`${sig} sent to ${pids.length} process${pids.length > 1 ? 'es' : ''} (no-op — backend offline)`)
    setTimeout(() => setToast(null), 3200)
  }, [])

  // Context menu
  const onCtxMenu = (e: React.MouseEvent, proc: ProcessEntry) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, proc })
  }

  // Column toggle
  const toggleCol = (k: keyof ColVis) => setCols(c => ({ ...c, [k]: !c[k] }))

  // Copy
  const copyText = (proc: ProcessEntry, what: string) => {
    const v = what === 'pid' ? String(proc.pid) : what === 'name' ? proc.name : proc.cmdline
    navigator.clipboard.writeText(v).catch(() => {})
  }

  // Sort header helper
  const SortTh = ({ k, children, style }: { k?: SortKey; children: React.ReactNode; style?: React.CSSProperties }) => (
    <th className={`${styles.th} ${k && sortKey === k ? styles.thActive : ''}`}
      onClick={() => k && toggle(k)}
      style={{ cursor: k ? 'pointer' : 'default', ...style }}>
      {children}
      {k && sortKey === k && <span className={styles.sortArrow}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )

  return (
    <div className={styles.page}>

      {/* ── Page header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.pageTitle}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><rect x="2" y="3" width="7" height="5" rx="1"/><rect x="11" y="3" width="7" height="5" rx="1"/><rect x="2" y="12" width="7" height="5" rx="1"/><rect x="11" y="12" width="7" height="5" rx="1"/></svg>
            Process Manager
          </div>
          <span className={styles.countBadge}>{filtered.length} processes</span>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.headerBtn} onClick={() => exportCSV(filtered)} title="Export filtered as CSV">
            <IconExport /> Export CSV
          </button>
          <button className={styles.headerBtn} title="Data refreshes automatically every 1.8s">
            <IconRefresh /> Auto
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className={styles.statsRow}>
        <StatCard label="Total"    value={stats.total}    color="#94a3b8" active={filterStatus==='all' && filterCpuMin===0 && filterMemMin===0}
          icon={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><rect x="2" y="3" width="7" height="5" rx="1"/><rect x="11" y="3" width="7" height="5" rx="1"/><rect x="2" y="12" width="7" height="5" rx="1"/><rect x="11" y="12" width="7" height="5" rx="1"/></svg>}
          onClick={() => { setFilterStatus('all'); setFilterCpuMin(0); setFilterMemMin(0) }} />
        <StatCard label="Running"  value={stats.running}  color="#4a9eff" active={filterStatus==='R'}
          icon={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><circle cx="10" cy="10" r="8"/><polyline points="8,7 13,10 8,13"/></svg>}
          onClick={() => setFilterStatus(filterStatus === 'R' ? 'all' : 'R')} />
        <StatCard label="Sleeping" value={stats.sleeping} color="#22c55e" active={filterStatus==='S'}
          icon={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><circle cx="10" cy="10" r="8"/><line x1="7" y1="10" x2="13" y2="10"/></svg>}
          onClick={() => setFilterStatus(filterStatus === 'S' ? 'all' : 'S')} />
        <StatCard label="High CPU" value={stats.highCpu}  color="#f97316" active={filterCpuMin===10}
          icon={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><rect x="5" y="5" width="10" height="10" rx="1"/><line x1="8" y1="2" x2="8" y2="5"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="8" y1="15" x2="8" y2="18"/><line x1="12" y1="15" x2="12" y2="18"/><line x1="2" y1="8" x2="5" y2="8"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="15" y1="8" x2="18" y2="8"/><line x1="15" y1="12" x2="18" y2="12"/></svg>}
          onClick={() => setFilterCpuMin(filterCpuMin === 10 ? 0 : 10)} />
        <StatCard label="High Mem" value={stats.highMem}  color="#a78bfa" active={filterMemMin===5}
          icon={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><rect x="2" y="6" width="16" height="8" rx="1.5"/><line x1="6" y1="6" x2="6" y2="14"/><line x1="10" y1="6" x2="10" y2="14"/><line x1="14" y1="6" x2="14" y2="14"/></svg>}
          onClick={() => setFilterMemMin(filterMemMin === 5 ? 0 : 5)} />
      </div>

      {/* ── Filter bar ── */}
      <div className={styles.filterBar}>
        <div className={styles.searchWrap}>
          <IconSearch />
          <input className={styles.searchInput} placeholder="Search name, PID, user, command…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          {search && <button className={styles.searchClear} onClick={() => setSearch('')}><IconClose /></button>}
        </div>

        <div className={styles.filterQuick}>
          <span className={styles.filterSep}>Status</span>
          {(['all','R','S'] as StatusFilter[]).map(s => (
            <button key={s} className={`${styles.fPill} ${filterStatus===s ? styles.fPillActive : ''}`}
              onClick={() => { setFilterStatus(s); setPage(1) }}>
              {s === 'all' ? 'All' : s === 'R' ? 'Running' : 'Sleeping'}
            </button>
          ))}
        </div>

        <div className={styles.filterQuick}>
          <span className={styles.filterSep}>User</span>
          <SelectDropdown
            value={filterUser}
            onChange={v => { setFilterUser(v); setPage(1) }}
            options={allUsers.map(u => ({ value: u, label: u === 'all' ? 'All users' : u }))}
          />
        </div>

        <div className={styles.filterQuick}>
          <span className={styles.filterSep}>CPU</span>
          {[0,5,10,20].map(v => (
            <button key={v} className={`${styles.fPill} ${filterCpuMin===v ? styles.fPillActive : ''}`}
              onClick={() => { setFilterCpuMin(v); setPage(1) }}>
              {v === 0 ? 'All' : `>${v}%`}
            </button>
          ))}
        </div>

        <div className={styles.filterQuick}>
          <span className={styles.filterSep}>Mem</span>
          {[0,2,5,10].map(v => (
            <button key={v} className={`${styles.fPill} ${filterMemMin===v ? styles.fPillActive : ''}`}
              onClick={() => { setFilterMemMin(v); setPage(1) }}>
              {v === 0 ? 'All' : `>${v}%`}
            </button>
          ))}
        </div>

        <button className={`${styles.toolBtn} ${filtersOpen ? styles.toolBtnActive : ''}`}
          onClick={() => setFiltersOpen(v => !v)} title="Advanced filters">
          <IconFilter />
          Filters
          {activeFilters.length > 0 && <span className={styles.filterDot}>{activeFilters.length}</span>}
        </button>
      </div>

      {/* ── Advanced filter panel ── */}
      {filtersOpen && (
        <div className={styles.advFilters}>
          <div className={styles.advFiltersGrid}>
            <div className={styles.advGroup}>
              <div className={styles.advLabel}>Min CPU %</div>
              <input type="range" min={0} max={50} step={1} value={filterCpuMin}
                onChange={e => { setFilterCpuMin(+e.target.value); setPage(1) }}
                className={styles.slider}/>
              <span className={styles.sliderVal}>{filterCpuMin}%</span>
            </div>
            <div className={styles.advGroup}>
              <div className={styles.advLabel}>Min Mem %</div>
              <input type="range" min={0} max={30} step={0.5} value={filterMemMin}
                onChange={e => { setFilterMemMin(+e.target.value); setPage(1) }}
                className={styles.slider}/>
              <span className={styles.sliderVal}>{filterMemMin}%</span>
            </div>
            <div className={styles.advGroup}>
              <div className={styles.advLabel}>Sort by</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(['cpu_pct','mem_pct','mem_rss','pid','name','threads','fds','io'] as SortKey[]).map(k => (
                  <button key={k} className={`${styles.fPill} ${sortKey===k ? styles.fPillActive : ''}`}
                    onClick={() => toggle(k)}>
                    {k === 'cpu_pct' ? 'CPU' : k === 'mem_pct' ? 'Mem %' : k === 'mem_rss' ? 'RSS' : k === 'io' ? 'I/O' : k}
                    {sortKey===k && <span style={{marginLeft:3}}>{sortDir==='asc'?'↑':'↓'}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.advGroup}>
              <div className={styles.advLabel}>Actions</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className={styles.advBtn} onClick={() => { setFilterStatus('all'); setFilterUser('all'); setFilterCpuMin(0); setFilterMemMin(0); setSearch('') }}>
                  Clear all filters
                </button>
                <button className={styles.advBtn} onClick={() => exportCSV(filtered)}>
                  <IconExport /> Export {filtered.length} rows
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Active filter chips ── */}
      {activeFilters.length > 0 && (
        <div className={styles.chipsRow}>
          {activeFilters.map(f => <Chip key={f.label} label={f.label} onRemove={f.clear} />)}
          <button className={styles.chipClearAll} onClick={() => { setFilterStatus('all'); setFilterUser('all'); setFilterCpuMin(0); setFilterMemMin(0); setSearch('') }}>
            Clear all
          </button>
        </div>
      )}

      {/* ── View + col toolbar ── */}
      <div className={styles.viewBar}>
        <span className={styles.resultCount}>
          {filtered.length === processes.length
            ? `${filtered.length} processes`
            : `${filtered.length} of ${processes.length} processes`
          }
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          {/* Column toggle */}
          <div style={{ position: 'relative' }}>
            <button className={`${styles.toolBtn} ${colMenuOpen ? styles.toolBtnActive : ''}`}
              onClick={() => setColMenuOpen(v => !v)}>
              <IconCols /> Columns
            </button>
            {colMenuOpen && <ColVisMenu cols={cols} toggle={toggleCol} onClose={() => setColMenuOpen(false)} />}
          </div>

          {/* Page size */}
          <SelectDropdown
            value={String(pageSize)}
            onChange={v => { setPageSize(+v); setPage(1) }}
            options={[10,25,50,100].map(n => ({ value: String(n), label: `${n} / page` }))}
          />

          {/* View toggle */}
          <div className={styles.viewToggle}>
            <button className={`${styles.viewBtn} ${view==='list' ? styles.viewBtnActive : ''}`} onClick={() => setView('list')} title="List"><IconList /></button>
            <button className={`${styles.viewBtn} ${view==='grid' ? styles.viewBtnActive : ''}`} onClick={() => setView('grid')} title="Grid"><IconGrid /></button>
          </div>
        </div>
      </div>

      {/* ── Bulk actions bar ── */}
      {selected.size > 0 && (
        <div className={styles.bulkBar}>
          <span className={styles.bulkCount}>{selected.size} selected</span>
          <div className={styles.bulkActions}>
            {[
              ['SIGTERM','#f97316'],['SIGKILL','#ef4444'],['SIGHUP','#fbbf24'],
              ['SIGSTOP','#4a9eff'],['SIGCONT','#22c55e']
            ].map(([sig, c]) => (
              <button key={sig} className={styles.bulkBtn}
                style={{ ['--sig-color' as string]: c }}
                onClick={() => sendSignal(sig, [...selected])}>
                <IconSignal /> {sig}
              </button>
            ))}
          </div>
          <button className={styles.bulkDeselect} onClick={deselectAll}><IconClose /> Deselect</button>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && <div className={styles.toast}><IconSignal /> {toast}</div>}

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <div className={styles.empty}>
          <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" width="36" height="36" opacity="0.3">
            <rect x="5" y="7" width="15" height="11" rx="2"/><rect x="5" y="24" width="15" height="11" rx="2"/>
            <rect x="22" y="7" width="15" height="11" rx="2"/><rect x="22" y="24" width="15" height="11" rx="2"/>
          </svg>
          <div>No processes match your filters.</div>
          <button className={styles.emptyReset} onClick={() => { setFilterStatus('all'); setFilterUser('all'); setFilterCpuMin(0); setFilterMemMin(0); setSearch('') }}>
            Reset filters
          </button>
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {view === 'list' && paginated.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th} style={{ width: 32, textAlign: 'center' }}>
                  <input type="checkbox" className={styles.checkbox}
                    checked={allChecked} onChange={allChecked ? deselectAll : selectAll}/>
                </th>
                <SortTh k="pid"     style={{ width: 60 }}>PID</SortTh>
                <SortTh k="name"    style={{ minWidth: 160 }}>Process</SortTh>
                <SortTh k="cpu_pct" style={{ minWidth: 140 }}>CPU</SortTh>
                <SortTh k="mem_pct" style={{ minWidth: 110 }}>Memory</SortTh>
                <SortTh k="mem_rss" style={{ minWidth: 80 }}>RSS</SortTh>
                {cols.virt  && <SortTh style={{ minWidth: 80 }}>Virt</SortTh>}
                <SortTh k="threads" style={{ width: 70 }}>Threads</SortTh>
                <SortTh k="fds"     style={{ width: 60 }}>FDs</SortTh>
                {cols.io    && <SortTh k="io" style={{ minWidth: 110 }}>I/O</SortTh>}
                {cols.nice  && <SortTh k="nice" style={{ width: 60 }}>Nice</SortTh>}
                {cols.ppid  && <SortTh style={{ width: 60 }}>PPID</SortTh>}
                <th className={styles.th}>Status</th>
                {cols.cmd   && <th className={styles.th} style={{ minWidth: 200 }}>Command</th>}
                <th className={styles.th} style={{ width: 28 }}></th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(p => {
                const spark = sparklines.get(p.pid) ?? []
                const isSel = selected.has(p.pid)
                const ioTotal = p.io_read_bps + p.io_write_bps
                return (
                  <tr key={p.pid}
                    className={`${styles.tr} ${isSel ? styles.trSelected : ''}`}
                    onClick={() => go(p)}
                    onContextMenu={e => onCtxMenu(e, p)}>
                    <td className={styles.td} style={{ textAlign: 'center' }} onClick={e => toggleSelect(p.pid, e)}>
                      <input type="checkbox" className={styles.checkbox} checked={isSel} onChange={() => {}} onClick={e => e.stopPropagation()}/>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.pidCell}>{p.pid}</span>
                    </td>
                    <td className={styles.td}>
                      <div className={styles.procNameCell}>
                        <ProcessAvatar name={p.name} cardSize={28} />
                        <div>
                          <div className={styles.procName}>{p.name}</div>
                          <div className={styles.procUser}>{p.user}</div>
                        </div>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div className={styles.cpuCell}>
                        <Sparkline pts={spark} color={cpuColor(p.cpu_pct)} />
                        <div className={styles.cpuBars}>
                          <div className={styles.cpuBar}>
                            <div className={styles.cpuBarFill} style={{ width: `${Math.min(100, p.cpu_pct * 2)}%`, background: cpuColor(p.cpu_pct) }}/>
                          </div>
                          <span className={styles.cpuVal} style={{ color: cpuColor(p.cpu_pct) }}>{p.cpu_pct.toFixed(1)}%</span>
                        </div>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div className={styles.memCell}>
                        <div className={styles.memBar}>
                          <div className={styles.memBarFill} style={{ width: `${Math.min(100, p.mem_pct * 5)}%`, background: memColor(p.mem_pct) }}/>
                        </div>
                        <span className={styles.memVal} style={{ color: memColor(p.mem_pct) }}>{p.mem_pct.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className={styles.td}><span className={styles.mono}>{formatBytes(p.mem_rss)}</span></td>
                    {cols.virt  && <td className={styles.td}><span className={styles.mono}>{formatBytes(p.virt_bytes)}</span></td>}
                    <td className={styles.td}><span className={styles.mono}>{p.threads}</span></td>
                    <td className={styles.td}><span className={styles.mono}>{p.fds}</span></td>
                    {cols.io    && (
                      <td className={styles.td}>
                        <div className={styles.ioCell}>
                          <span style={{ color: '#22c55e' }}>↑ {formatBps(p.io_read_bps)}</span>
                          <span style={{ color: '#a78bfa' }}>↓ {formatBps(p.io_write_bps)}</span>
                        </div>
                        {ioTotal > 0 && (
                          <div className={styles.ioBar}>
                            <div className={styles.ioBarFill} style={{ width: `${Math.min(100, ioTotal / 20000 * 100)}%` }}/>
                          </div>
                        )}
                      </td>
                    )}
                    {cols.nice  && <td className={styles.td}><span className={styles.mono} style={{ color: p.nice > 0 ? 'var(--color-warning)' : p.nice < 0 ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>{p.nice}</span></td>}
                    {cols.ppid  && <td className={styles.td}><span className={styles.mono}>{p.ppid}</span></td>}
                    <td className={styles.td}><StatusBadge s={p.status} /></td>
                    {cols.cmd   && <td className={styles.td}><span className={styles.cmdCell} title={p.cmdline}>{p.cmdline}</span></td>}
                    <td className={styles.td} style={{ color: 'var(--color-text-dim)' }}><IconArrow /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── GRID VIEW ── */}
      {view === 'grid' && paginated.length > 0 && (
        <div className={styles.gridView}>
          {paginated.map(p => {
            const accent = getAccent(p.name)
            const spark  = sparklines.get(p.pid) ?? []
            const isSel  = selected.has(p.pid)
            return (
              <div key={p.pid}
                className={`${styles.gridCard} ${isSel ? styles.gridCardSel : ''}`}
                style={{ ['--accent' as string]: accent }}
                onClick={() => go(p)}
                onContextMenu={e => onCtxMenu(e, p)}>
                {/* Selection checkbox */}
                <input type="checkbox" className={`${styles.checkbox} ${styles.gridCheck}`}
                  checked={isSel} onChange={() => {}} onClick={e => { e.stopPropagation(); toggleSelect(p.pid, e) }}/>
                {/* Top */}
                <div className={styles.gridTop}>
                  <ProcessAvatar name={p.name} cardSize={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={styles.gridName}>{p.name}</div>
                    <div className={styles.gridMeta}>PID {p.pid} · {p.user}</div>
                  </div>
                  <StatusBadge s={p.status} />
                </div>
                {/* CPU row with sparkline */}
                <div className={styles.gridCpuRow}>
                  <div className={styles.gridCpuLeft}>
                    <span className={styles.gridMetricLabel}>CPU</span>
                    <span className={styles.gridMetricVal} style={{ color: cpuColor(p.cpu_pct) }}>{p.cpu_pct.toFixed(1)}%</span>
                  </div>
                  <Sparkline pts={spark} color={cpuColor(p.cpu_pct)} />
                </div>
                <div className={styles.miniBar}><div className={styles.miniBarFill} style={{ width: `${Math.min(100, p.cpu_pct * 2)}%`, background: cpuColor(p.cpu_pct) }}/></div>
                {/* Metrics grid */}
                <div className={styles.gridMetrics}>
                  <div className={styles.gridMetric}>
                    <span className={styles.gridMetricLabel}>Memory</span>
                    <span className={styles.gridMetricVal} style={{ color: memColor(p.mem_pct) }}>{p.mem_pct.toFixed(1)}%</span>
                    <div className={styles.miniBar}><div className={styles.miniBarFill} style={{ width: `${Math.min(100, p.mem_pct * 5)}%`, background: memColor(p.mem_pct) }}/></div>
                  </div>
                  <div className={styles.gridMetric}>
                    <span className={styles.gridMetricLabel}>RSS</span>
                    <span className={styles.gridMetricMono}>{formatBytes(p.mem_rss)}</span>
                  </div>
                  <div className={styles.gridMetric}>
                    <span className={styles.gridMetricLabel}>Threads</span>
                    <span className={styles.gridMetricMono}>{p.threads}</span>
                  </div>
                  <div className={styles.gridMetric}>
                    <span className={styles.gridMetricLabel}>FDs</span>
                    <span className={styles.gridMetricMono}>{p.fds}</span>
                  </div>
                </div>
                {/* Footer */}
                <div className={styles.gridFooter}>
                  <div className={styles.ioCell} style={{ fontSize: 10 }}>
                    <span style={{ color: '#22c55e' }}>↑ {formatBps(p.io_read_bps)}</span>
                    <span style={{ color: '#a78bfa' }}>↓ {formatBps(p.io_write_bps)}</span>
                  </div>
                  <div className={styles.gridActions}>
                    <button className={styles.gridActionBtn} style={{ color: '#f87171' }}
                      onClick={e => { e.stopPropagation(); sendSignal('SIGTERM', [p.pid]) }} title="SIGTERM">
                      <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
                    </button>
                    <button className={styles.gridActionBtn} style={{ color: '#94a3b8' }}
                      onClick={e => { e.stopPropagation(); go(p) }} title="Open detail">
                      <IconArrow />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {view === 'list' && totalPages > 1 && (
        <div className={styles.pagination}>
          <span className={styles.pageInfo}>
            Showing {((safeP-1)*pageSize)+1}–{Math.min(safeP*pageSize, filtered.length)} of {filtered.length}
          </span>
          <div className={styles.pageButtons}>
            <button className={styles.pageBtn} disabled={safeP === 1} onClick={() => setPage(1)}>«</button>
            <button className={styles.pageBtn} disabled={safeP === 1} onClick={() => setPage(p => p-1)}>‹</button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(safeP - 3, totalPages - 6)) + i
              return (
                <button key={p} className={`${styles.pageBtn} ${p === safeP ? styles.pageBtnActive : ''}`}
                  onClick={() => setPage(p)}>{p}</button>
              )
            })}
            <button className={styles.pageBtn} disabled={safeP === totalPages} onClick={() => setPage(p => p+1)}>›</button>
            <button className={styles.pageBtn} disabled={safeP === totalPages} onClick={() => setPage(totalPages)}>»</button>
          </div>
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu menu={ctxMenu}
          onClose={() => setCtxMenu(null)}
          onNavigate={() => { navigate(`/processes/${ctxMenu.proc.pid}`, { state: ctxMenu.proc }); setCtxMenu(null) }}
          onSignal={sig => sendSignal(sig, [ctxMenu.proc.pid])}
          onCopy={what => copyText(ctxMenu.proc, what)} />
      )}
    </div>
  )
}
