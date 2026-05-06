import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchLogSources, fetchLogEntries } from '@/lib/api'
import {
  PRIORITY_META,
  fmtTs, fmtTsShort, getSourceCount,
  type LogEntry, type Priority, type LogSource,
} from './logsData'
import styles from './LogsPage.module.css'

// ─────────────────────────────────────────────────────────────
// SVG Icons (no emojis anywhere)
// ─────────────────────────────────────────────────────────────
const IcoList     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></svg>
const IcoGrid     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/></svg>
const IcoSearch   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="17" y2="17"/></svg>
const IcoChevDn   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5,8 10,13 15,8"/></svg>
const IcoDrag     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="7" y1="6" x2="7" y2="6"/><line x1="13" y1="6" x2="13" y2="6"/><line x1="7" y1="10" x2="7" y2="10"/><line x1="13" y1="10" x2="13" y2="10"/><line x1="7" y1="14" x2="7" y2="14"/><line x1="13" y1="14" x2="13" y2="14"/></svg>
const IcoX        = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
const IcoDownload = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3v10M6 9l4 4 4-4"/><path d="M3 15v2h14v-2"/></svg>
const IcoCopy     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="9" height="9" rx="1.5"/><path d="M3 12V4a1 1 0 0 1 1-1h8"/></svg>
const IcoExtLink  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M11 3h6v6"/><path d="M17 3l-7 7"/><path d="M9 5H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-4"/></svg>
const IcoLogs     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="3" y="3" width="14" height="14" rx="2"/><line x1="7" y1="8" x2="13" y2="8"/><line x1="7" y1="11" x2="13" y2="11"/><line x1="7" y1="14" x2="10" y2="14"/></svg>
const IcoSort     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><line x1="4" y1="6" x2="16" y2="6"/><line x1="4" y1="10" x2="12" y2="10"/><line x1="4" y1="14" x2="8" y2="14"/></svg>
const IcoFilter   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h14M6 10h8M9 15h2"/></svg>
const IcoContext  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="10" cy="10" r="8"/><line x1="10" y1="7" x2="10" y2="10"/><circle cx="10" cy="13" r="0.6" fill="currentColor" stroke="none"/></svg>
const IcoPause    = () => <svg viewBox="0 0 20 20" fill="currentColor"><rect x="5" y="4" width="3.5" height="12" rx="1"/><rect x="11.5" y="4" width="3.5" height="12" rx="1"/></svg>
const IcoPlay     = () => <svg viewBox="0 0 20 20" fill="currentColor"><path d="M6 4l12 6-12 6z"/></svg>
const IcoArrowUp  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="15" x2="10" y2="5"/><polyline points="6,9 10,5 14,9"/></svg>
const IcoArrowDn  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="5" x2="10" y2="15"/><polyline points="6,11 10,15 14,11"/></svg>

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type ViewMode = 'list' | 'grid'
type SortKey  = 'ts' | 'priority' | 'unit'
type SortDir  = 'asc' | 'desc'
type ModalTab = 'overview' | 'fields' | 'context' | 'json'

const PRIORITY_GROUPS: { label: string; priorities: Priority[]; color: string }[] = [
  { label: 'Critical',   priorities: [0,1,2], color: '#ff6b35' },
  { label: 'Error',      priorities: [3],     color: '#fc8181' },
  { label: 'Warning',    priorities: [4],     color: '#f6ad55' },
  { label: 'Notice',     priorities: [5],     color: '#63b3ed' },
  { label: 'Info',       priorities: [6],     color: '#68d391' },
  { label: 'Debug',      priorities: [7],     color: '#9ca3af' },
]

const TIME_RANGES = [
  { value: 'live',  label: 'Live' },
  { value: '15m',   label: 'Last 15 min' },
  { value: '1h',    label: 'Last hour' },
  { value: 'today', label: 'Today' },
  { value: '7d',    label: 'Last 7 days' },
  { value: 'boot',  label: 'This boot' },
  { value: 'all',   label: 'All time' },
]

function sourceColor(unit: string, sources: LogSource[]): string {
  const id = unit.replace('.service', '')
  const s = sources.find(x => x.id === id || x.id === unit || x.label === unit)
  return s?.color ?? '#9ca3af'
}

// ─────────────────────────────────────────────────────────────
// Log Detail Modal
// ─────────────────────────────────────────────────────────────
function LogDetailModal({
  entry, allLogs, onClose,
}: {
  entry: LogEntry
  allLogs: LogEntry[]
  onClose: () => void
}) {
  const [tab, setTab] = useState<ModalTab>('overview')
  const [copied, setCopied] = useState(false)
  const pm = PRIORITY_META[entry.priority]

  const contextLogs = useMemo(() => {
    const sameUnit = allLogs
      .filter(l => l.unit === entry.unit)
      .sort((a, b) => b.ts - a.ts)
    const idx = sameUnit.findIndex(l => l.id === entry.id)
    const start = Math.max(0, idx - 5)
    const end   = Math.min(sameUnit.length - 1, idx + 5)
    return sameUnit.slice(start, end + 1).reverse()
  }, [entry, allLogs])

  function copyJson() {
    const json = JSON.stringify(entry.fields, null, 2)
    navigator.clipboard.writeText(json).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  function copyMsg() {
    navigator.clipboard.writeText(entry.message).catch(() => {})
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.modalHead}>
          <span className={styles.modalBadge} style={{ background: pm.bg, color: pm.color }}>
            <span className={styles.priDot} style={{ background: pm.color }} />
            {pm.short}
          </span>
          <div className={styles.modalHeadInfo}>
            <div className={styles.modalUnit}>
              {entry.unit} &nbsp;·&nbsp; PID {entry.pid} &nbsp;·&nbsp; {fmtTs(entry.ts)}
            </div>
            <div className={styles.modalMsg}>{entry.message}</div>
          </div>
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>

        {/* Tabs */}
        <div className={styles.modalTabs}>
          {(['overview','fields','context','json'] as ModalTab[]).map(t => (
            <button key={t} className={`${styles.modalTab} ${tab === t ? styles.modalTabActive : ''}`} onClick={() => setTab(t)}>
              {t === 'overview' ? 'Overview' : t === 'fields' ? 'Journal Fields' : t === 'context' ? 'Context' : 'Raw JSON'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {tab === 'overview' && (
            <table className={styles.fieldsTable}>
              <tbody>
                {[
                  ['Timestamp',    fmtTs(entry.ts)],
                  ['Host',         entry.host],
                  ['Unit',         entry.unit],
                  ['Priority',     `${entry.priority} — ${pm.label}`],
                  ['PID',          String(entry.pid)],
                  ['Command',      entry.comm],
                  ['Executable',   entry.exe],
                  ['UID',          String(entry.uid)],
                  ['Transport',    entry.transport],
                  ['Boot ID',      entry.bootId],
                  ['Message',      entry.message],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td className={styles.fieldKey}>{k}</td>
                    <td className={styles.fieldVal}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'fields' && (
            <table className={styles.fieldsTable}>
              <tbody>
                {Object.entries(entry.fields).map(([k, v]) => (
                  <tr key={k}>
                    <td className={styles.fieldKey}>{k}</td>
                    <td className={styles.fieldVal}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'context' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {contextLogs.map(l => (
                <div
                  key={l.id}
                  className={`${styles.ctxRow} ${l.id === entry.id ? styles.ctxRowHighlight : ''}`}
                >
                  <span className={styles.ctxTs} style={{ color: PRIORITY_META[l.priority].color }}>
                    {PRIORITY_META[l.priority].short}
                  </span>
                  <span className={styles.ctxTs}>{fmtTsShort(l.ts)}</span>
                  <span className={styles.ctxMsg}>{l.message}</span>
                </div>
              ))}
            </div>
          )}
          {tab === 'json' && (
            <div className={styles.jsonBlock}>
              {JSON.stringify(entry.fields, null, 2)}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className={styles.modalActions}>
          <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={copyJson}>
            <IcoCopy />{copied ? 'Copied!' : 'Copy as JSON'}
          </button>
          <button className={styles.actionBtn} onClick={copyMsg}>
            <IcoCopy />Copy message
          </button>
          <button className={styles.actionBtn}>
            <IcoContext />Show context
          </button>
          <button className={styles.actionBtn}>
            <IcoExtLink />Jump to service
          </button>
          <button className={styles.actionBtn}>
            <IcoSort />Run diagnostic
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Priority badge
// ─────────────────────────────────────────────────────────────
function PriBadge({ p }: { p: number }) {
  const pm = PRIORITY_META[p]
  return (
    <span className={styles.priBadge} style={{ background: pm.bg, color: pm.color }}>
      <span className={styles.priDot} style={{ background: pm.color }} />
      {pm.short}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
export default function LogsPage() {
  // filters
  const [search,        setSearch]        = useState('')
  const [activePris,    setActivePris]    = useState<Set<number>>(new Set())
  const [timeRange,     setTimeRange]     = useState('live')
  const [unitFilter,    setUnitFilter]    = useState('all')
  const [view,          setView]          = useState<ViewMode>('list')
  const [sortKey,       setSortKey]       = useState<SortKey>('ts')
  const [sortDir,       setSortDir]       = useState<SortDir>('desc')
  const [liveTail,      setLiveTail]      = useState(true)
  const [selectedEntry, setSelectedEntry] = useState<LogEntry | null>(null)
  const [sources,       setSources]       = useState<LogSource[]>([])
  const [activeSource,  setActiveSource]  = useState('all')
  const [openCards,     setOpenCards]     = useState<Set<string>>(new Set())

  // ── API: sources ──────────────────────────────────────────
  const { data: sourcesData } = useQuery({
    queryKey: ['log-sources'],
    queryFn: fetchLogSources,
    staleTime: 60_000,
    retry: false,
  })

  useEffect(() => {
    if (sourcesData) {
      setSources(prev => {
        // Merge: keep existing order for items already present, append new ones
        const prevIds = new Set(prev.map(s => s.id))
        const incoming = sourcesData as LogSource[]
        const merged = prev.map(p => incoming.find(s => s.id === p.id) ?? p)
        incoming.forEach(s => { if (!prevIds.has(s.id)) merged.push(s) })
        return merged
      })
      // Auto-select first source if nothing meaningful is selected yet
      setActiveSource(prev => {
        if (prev === 'all' && (sourcesData as LogSource[]).length > 0) {
          return (sourcesData as LogSource[])[0].id
        }
        return prev
      })
    }
  }, [sourcesData])

  // ── API: log entries ──────────────────────────────────────
  const { data: entriesData, isLoading } = useQuery({
    queryKey: ['log-entries', activeSource, timeRange],
    queryFn: () => fetchLogEntries({
      source: activeSource !== 'all' ? activeSource : undefined,
      range: timeRange,
      limit: 500,
    }),
    refetchInterval: liveTail ? 10_000 : false,
    staleTime: liveTail ? 0 : 30_000,
    retry: false,
  })

  const apiLogs: LogEntry[] = useMemo(() => {
    if (!entriesData) return []
    return entriesData as LogEntry[]
  }, [entriesData])

  // drag state
  const dragIdx = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  function onDragStart(i: number) { dragIdx.current = i }
  function onDragOver(i: number)  { setDragOver(i) }
  function onDrop(i: number) {
    if (dragIdx.current === null || dragIdx.current === i) { dragIdx.current = null; setDragOver(null); return }
    const arr = [...sources]
    const [item] = arr.splice(dragIdx.current, 1)
    arr.splice(i, 0, item)
    setSources(arr)
    dragIdx.current = null
    setDragOver(null)
  }

  // sort column toggle
  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  // filtered + sorted logs
  const displayedLogs = useMemo(() => {
    let logs = [...apiLogs]

    if (search.trim()) {
      const q = search.toLowerCase()
      logs = logs.filter(l => l.message.toLowerCase().includes(q) || l.unit.toLowerCase().includes(q) || l.comm.toLowerCase().includes(q))
    }

    if (activePris.size > 0) {
      logs = logs.filter(l => activePris.has(l.priority))
    }

    if (unitFilter !== 'all') {
      logs = logs.filter(l => l.unit === unitFilter || l.unit.replace('.service','') === unitFilter)
    }

    logs = [...logs].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'ts')       cmp = a.ts - b.ts
      if (sortKey === 'priority') cmp = a.priority - b.priority
      if (sortKey === 'unit')     cmp = a.unit.localeCompare(b.unit)
      return sortDir === 'asc' ? cmp : -cmp
    })

    return logs
  }, [apiLogs, search, activePris, unitFilter, sortKey, sortDir])

  // stats
  const stats = useMemo(() => {
    const all  = apiLogs.length
    const crit = apiLogs.filter(l => l.priority <= 2).length
    const err  = apiLogs.filter(l => l.priority === 3).length
    const warn = apiLogs.filter(l => l.priority === 4).length
    const info = apiLogs.filter(l => l.priority === 6).length
    const dbg  = apiLogs.filter(l => l.priority === 7).length
    return { all, crit, err, warn, info, dbg }
  }, [apiLogs])

  // grid: group by unit
  const gridGroups = useMemo(() => {
    const map = new Map<string, LogEntry[]>()
    for (const l of displayedLogs) {
      const g = map.get(l.unit) ?? []
      g.push(l)
      map.set(l.unit, g)
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [displayedLogs])

  // unique units for unit filter dropdown
  const allUnits = useMemo(() => {
    const s = new Set(apiLogs.map(l => l.unit))
    return Array.from(s).sort()
  }, [apiLogs])

  function togglePriGroup(priorities: Priority[]) {
    const all = priorities.every(p => activePris.has(p))
    setActivePris(prev => {
      const next = new Set(prev)
      if (all) priorities.forEach(p => next.delete(p))
      else     priorities.forEach(p => next.add(p))
      return next
    })
  }

  function clearFilters() {
    setSearch('')
    setActivePris(new Set())
    setUnitFilter('all')
    setTimeRange('live')
  }

  const hasFilters = search !== '' || activePris.size > 0 || unitFilter !== 'all' || timeRange !== 'live'

  function exportLogs() {
    const lines = displayedLogs.map(l =>
      `${fmtTs(l.ts)}\t${l.unit}\t${PRIORITY_META[l.priority].short}\t${l.pid}\t${l.message}`
    ).join('\n')
    const blob = new Blob([lines], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'orbit-logs.txt'; a.click()
    URL.revokeObjectURL(url)
  }

  const SortIcon = useCallback(({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <span className={styles.thSortIcon}><IcoSort /></span>
    return <span className={styles.thSortIcon}>{sortDir === 'desc' ? <IcoArrowDn /> : <IcoArrowUp />}</span>
  }, [sortKey, sortDir])

  return (
    <div className={styles.page}>
      {/* Stats row */}
      <div className={styles.statsRow}>
        {[
          { label: 'Total Entries', val: stats.all,  color: '#9ca3af', pris: [] as Priority[] },
          { label: 'Critical',      val: stats.crit, color: '#ff6b35', pris: [0,1,2] as Priority[] },
          { label: 'Errors',        val: stats.err,  color: '#fc8181', pris: [3] as Priority[] },
          { label: 'Warnings',      val: stats.warn, color: '#f6ad55', pris: [4] as Priority[] },
          { label: 'Info',          val: stats.info, color: '#68d391', pris: [6] as Priority[] },
          { label: 'Debug',         val: stats.dbg,  color: '#9ca3af', pris: [7] as Priority[] },
        ].map(s => {
          const active = s.pris.length > 0 && s.pris.every(p => activePris.has(p))
          return (
            <div
              key={s.label}
              className={`${styles.statCard} ${active ? styles.statCardActive : ''}`}
              onClick={() => s.pris.length > 0 && togglePriGroup(s.pris as Priority[])}
            >
              <span className={styles.statDot} style={{ background: s.color }} />
              <div className={styles.statText}>
                <div className={styles.statValue} style={{ color: s.pris.length > 0 ? s.color : undefined }}>{s.val}</div>
                <div className={styles.statLabel}>{s.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {/* Search */}
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}><IcoSearch /></span>
            <input
              className={styles.searchInput}
              placeholder="Search messages, units, commands..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Priority pills */}
          <div className={styles.pillRow}>
            {PRIORITY_GROUPS.map(g => {
              const active = g.priorities.every(p => activePris.has(p))
              return (
                <button
                  key={g.label}
                  className={styles.pill}
                  style={active ? { background: g.color + '20', borderColor: g.color, color: g.color } : {}}
                  onClick={() => togglePriGroup(g.priorities as Priority[])}
                >
                  {g.label}
                </button>
              )
            })}
          </div>

          {/* Time range */}
          <div className={styles.tbSelectWrap}>
            <select className={styles.tbSelect} value={timeRange} onChange={e => setTimeRange(e.target.value)}>
              {TIME_RANGES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <IcoChevDn />
          </div>

          {/* Unit filter */}
          <div className={styles.tbSelectWrap}>
            <select className={styles.tbSelect} value={unitFilter} onChange={e => setUnitFilter(e.target.value)}>
              <option value="all">All units</option>
              {allUnits.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <IcoChevDn />
          </div>
        </div>

        <div className={styles.toolbarRight}>
          {/* Clear filters */}
          {hasFilters && (
            <button className={styles.clearBtn} onClick={clearFilters}>Clear filters</button>
          )}

          {/* Live tail */}
          <button
            className={`${styles.liveBtn} ${liveTail ? styles.liveBtnActive : ''}`}
            onClick={() => setLiveTail(v => !v)}
          >
            <span className={`${styles.liveDot} ${liveTail ? '' : styles.liveDotPaused}`} />
            {liveTail ? <IcoPause /> : <IcoPlay />}
            {liveTail ? 'Live' : 'Paused'}
          </button>

          {/* Export */}
          <button className={styles.iconBtn} onClick={exportLogs}>
            <IcoDownload />Export
          </button>

          {/* View toggle */}
          <div className={styles.viewToggle}>
            <button className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnActive : ''}`} onClick={() => setView('list')} title="List view"><IcoList /></button>
            <button className={`${styles.viewBtn} ${view === 'grid' ? styles.viewBtnActive : ''}`} onClick={() => setView('grid')} title="Card view"><IcoGrid /></button>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className={styles.layout}>
        {/* Sidebar */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarHead}>Sources</div>
          <div className={styles.sidebarList}>
            <button
              className={`${styles.sidebarItem} ${activeSource === 'all' ? styles.sidebarItemActive : ''}`}
              onClick={() => setActiveSource('all')}
            >
              <span className={styles.sidebarDot} style={{ background: '#63b3ed' }} />
              <span className={styles.sidebarLabel}>All Sources</span>
              <span className={styles.sidebarBadge}>{apiLogs.length}</span>
            </button>
            {sources.map((s, i) => (
              <button
                key={s.id}
                className={`${styles.sidebarItem} ${activeSource === s.id ? styles.sidebarItemActive : ''} ${dragOver === i ? styles.sidebarItemDragOver : ''}`}
                onClick={() => setActiveSource(s.id)}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={e => { e.preventDefault(); onDragOver(i) }}
                onDrop={() => onDrop(i)}
                onDragEnd={() => { dragIdx.current = null; setDragOver(null) }}
              >
                <span className={styles.sidebarDrag}><IcoDrag /></span>
                <span className={styles.sidebarDot} style={{ background: s.color }} />
                <span className={styles.sidebarLabel}>{s.label}</span>
                <span className={styles.sidebarBadge}>{getSourceCount(s.id, apiLogs)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className={styles.main}>
          {/* Main header */}
          <div className={styles.mainHead}>
            <div className={styles.mainHeadLeft}>
              <span className={styles.resultCount}>
                {isLoading
                  ? 'Loading...'
                  : <>Showing <strong>{displayedLogs.length}</strong> of {apiLogs.length} entries</>}
              </span>
              {hasFilters && (
                <button className={styles.clearBtn} onClick={clearFilters}>
                  <IcoFilter /> Clear
                </button>
              )}
            </div>
            <div className={styles.mainHeadRight}>
              <div className={styles.sortWrap}>
                <select
                  className={styles.sortSelect}
                  value={`${sortKey}-${sortDir}`}
                  onChange={e => {
                    const [k, d] = e.target.value.split('-')
                    setSortKey(k as SortKey); setSortDir(d as SortDir)
                  }}
                >
                  <optgroup label="Timestamp">
                    <option value="ts-desc">Newest first</option>
                    <option value="ts-asc">Oldest first</option>
                  </optgroup>
                  <optgroup label="Priority">
                    <option value="priority-asc">Highest severity first</option>
                    <option value="priority-desc">Lowest severity first</option>
                  </optgroup>
                  <optgroup label="Unit">
                    <option value="unit-asc">Unit A → Z</option>
                    <option value="unit-desc">Unit Z → A</option>
                  </optgroup>
                </select>
                <IcoChevDn />
              </div>
            </div>
          </div>

          {/* List view */}
          {view === 'list' && (
            <div className={styles.tableScroll}>
              {displayedLogs.length === 0 ? (
                <div className={styles.empty}>
                  <span className={styles.emptyIcon}><IcoLogs /></span>
                  <span className={styles.emptyText}>No log entries match the current filters</span>
                  <button className={styles.clearBtn} onClick={clearFilters}>Clear all filters</button>
                </div>
              ) : (
                <table className={styles.table}>
                  <thead className={styles.thead}>
                    <tr>
                      <th className={styles.th} style={{ width: 68 }}>Level</th>
                      <th
                        className={`${styles.th} ${styles.thSortable} ${sortKey === 'ts' ? styles.thSortActive : ''}`}
                        style={{ width: 148 }}
                        onClick={() => toggleSort('ts')}
                      >
                        Timestamp<SortIcon k="ts" />
                      </th>
                      <th
                        className={`${styles.th} ${styles.thSortable} ${sortKey === 'unit' ? styles.thSortActive : ''}`}
                        style={{ width: 190 }}
                        onClick={() => toggleSort('unit')}
                      >
                        Unit<SortIcon k="unit" />
                      </th>
                      <th className={styles.th} style={{ width: 60 }}>PID</th>
                      <th
                        className={`${styles.th} ${styles.thSortable} ${sortKey === 'priority' ? styles.thSortActive : ''}`}
                        onClick={() => toggleSort('priority')}
                        style={{ width: 80 }}
                      >
                        Priority<SortIcon k="priority" />
                      </th>
                      <th className={styles.th}>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedLogs.map(l => (
                      <tr
                        key={l.id}
                        className={`${styles.tr} ${selectedEntry?.id === l.id ? styles.trSelected : ''}`}
                        onClick={() => setSelectedEntry(l)}
                      >
                        <td className={`${styles.td} ${styles.tdPri}`}>
                          <PriBadge p={l.priority} />
                        </td>
                        <td className={`${styles.td} ${styles.tdTs}`}>{fmtTs(l.ts)}</td>
                        <td className={`${styles.td} ${styles.tdUnit}`}>
                          <span className={styles.unitChip}>
                            <span className={styles.unitDot} style={{ background: sourceColor(l.unit, sources) }} />
                            {l.unit}
                          </span>
                        </td>
                        <td className={`${styles.td} ${styles.tdPid}`}>{l.pid || '—'}</td>
                        <td className={styles.td}>
                          <span style={{ fontSize: 11, color: PRIORITY_META[l.priority].color }}>
                            {PRIORITY_META[l.priority].label}
                          </span>
                        </td>
                        <td className={`${styles.td} ${styles.tdMsg}`}>
                          <span className={styles.msgText}>{l.message}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Grid view */}
          {view === 'grid' && (
            <div className={styles.gridScroll}>
              {gridGroups.length === 0 ? (
                <div className={styles.empty}>
                  <span className={styles.emptyIcon}><IcoLogs /></span>
                  <span className={styles.emptyText}>No log entries match the current filters</span>
                </div>
              ) : gridGroups.map(([unit, entries]) => {
                const open = openCards.has(unit)
                const color = sourceColor(unit, sources)
                const topPriority = entries.reduce<number>((m, l) => l.priority < m ? l.priority : m, 7)
                const pm = PRIORITY_META[topPriority]
                return (
                  <div key={unit} className={styles.serviceCard}>
                    <div
                      className={styles.serviceCardHead}
                      onClick={() => setOpenCards(s => {
                        const n = new Set(s)
                        open ? n.delete(unit) : n.add(unit)
                        return n
                      })}
                    >
                      <span className={styles.serviceCardDot} style={{ background: color }} />
                      <span className={styles.serviceCardName}>{unit}</span>
                      <span className={styles.priBadge} style={{ background: pm.bg, color: pm.color, marginRight: 6 }}>
                        <span className={styles.priDot} style={{ background: pm.color }} />
                        {pm.short}
                      </span>
                      <span className={styles.serviceCardCount}>{entries.length} entries</span>
                      <span className={`${styles.serviceCardChevron} ${open ? styles.serviceCardChevronOpen : ''}`}>
                        <IcoChevDn />
                      </span>
                    </div>
                    {open && (
                      <div className={styles.serviceCardBody}>
                        {entries.slice(0, 20).map(l => (
                          <div
                            key={l.id}
                            className={styles.gridEntryRow}
                            onClick={() => setSelectedEntry(l)}
                          >
                            <PriBadge p={l.priority} />
                            <span className={styles.ctxTs} style={{ fontFamily: 'monospace', fontSize: 11 }}>{fmtTsShort(l.ts)}</span>
                            <span className={`${styles.tdPid}`} style={{ fontFamily: 'monospace', fontSize: 11 }}>{l.pid || '—'}</span>
                            <span className={styles.gridEntryMsg}>{l.message}</span>
                          </div>
                        ))}
                        {entries.length > 20 && (
                          <div style={{ padding: '7px 14px', fontSize: 11, color: 'var(--color-text-dim)', textAlign: 'center' }}>
                            +{entries.length - 20} more entries — click to filter
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail modal */}
      {selectedEntry && (
        <LogDetailModal
          entry={selectedEntry}
          allLogs={apiLogs}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  )
}
