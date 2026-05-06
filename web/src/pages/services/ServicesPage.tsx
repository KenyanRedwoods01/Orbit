import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchServices, startService, stopService, restartService } from '@/lib/api'
import type { Service } from '@/lib/api'
import { Spinner } from '@/components/ui'
import { formatBytes } from '@/lib/utils'
import styles from './ServicesPage.module.css'
import { getExtService } from './servicesData'
import { ServiceDetailModal } from './ServiceDetailModal'

// ─────────────────────────────────────────────────────────
// Inline SVG icons (no emojis)
// ─────────────────────────────────────────────────────────
const IcoServices  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"/></svg>
const IcoRefresh   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10a6 6 0 1 1 1.5 4"/><polyline points="4,14 4,10 8,10"/></svg>
const IcoSearch    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="8.5" cy="8.5" r="5.5"/><line x1="12.5" y1="12.5" x2="17" y2="17"/></svg>
const IcoList      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="16" y2="6"/><line x1="4" y1="10" x2="16" y2="10"/><line x1="4" y1="14" x2="16" y2="14"/></svg>
const IcoGrid      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/></svg>
const IcoDrag      = () => <svg viewBox="0 0 20 20" fill="currentColor"><circle cx="7"  cy="5"  r="1.3"/><circle cx="13" cy="5"  r="1.3"/><circle cx="7"  cy="10" r="1.3"/><circle cx="13" cy="10" r="1.3"/><circle cx="7"  cy="15" r="1.3"/><circle cx="13" cy="15" r="1.3"/></svg>
const IcoPlay      = () => <svg viewBox="0 0 20 20" fill="currentColor"><polygon points="5,3 19,10 5,17"/></svg>
const IcoStop      = () => <svg viewBox="0 0 20 20" fill="currentColor"><rect x="3" y="3" width="14" height="14" rx="2"/></svg>
const IcoRestart   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10a6 6 0 1 1 1.5 4"/><polyline points="4,14 4,10 8,10"/></svg>
const IcoMore      = () => <svg viewBox="0 0 20 20" fill="currentColor"><circle cx="4" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="16" cy="10" r="1.5"/></svg>
const IcoChevronUp = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4,13 10,7 16,13"/></svg>
const IcoChevronDn = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4,7 10,13 16,7"/></svg>
const IcoWarn      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10 3L18 17H2z"/><line x1="10" y1="9" x2="10" y2="12"/><circle cx="10" cy="15" r="0.7" fill="currentColor" stroke="none"/></svg>
const IcoEnable    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 10h10M12 7l3 3-3 3"/></svg>
const IcoDisable   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="4" x2="16" y2="16"/><line x1="16" y1="4" x2="4" y2="16"/></svg>
const IcoMask      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2L4 5v5c0 4 3 7 6 8 3-1 6-4 6-8V5z"/><line x1="7" y1="10" x2="13" y2="10" strokeWidth="2"/></svg>
const IcoCheck     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,10 8,14 16,6"/></svg>
const IcoInfo      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8"/><line x1="10" y1="9" x2="10" y2="14"/><circle cx="10" cy="6.5" r="0.6" fill="currentColor" stroke="none"/></svg>
const IcoReload    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M17 10a7 7 0 0 1-7 7 7 7 0 0 1-5-2"/><polyline points="2,10 3,15 8,14"/></svg>

// ─────────────────────────────────────────────────────────
// Custom Checkbox
// ─────────────────────────────────────────────────────────
const IcoCbCheck = () => <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1.5,5 4,7.5 8.5,2.5"/></svg>
const IcoCbDash  = () => <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="2" y1="5" x2="8" y2="5"/></svg>

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  indeterminate?: boolean
  className?: string
}
function Checkbox({ checked, onChange, indeterminate, className }: CheckboxProps) {
  return (
    <label className={`${styles.cbWrap}${className ? ' ' + className : ''}`}>
      <input
        type="checkbox"
        className={styles.cbInput}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        ref={el => { if (el) el.indeterminate = !!indeterminate }}
      />
      <span className={styles.cbBox}>
        {indeterminate ? <IcoCbDash /> : <IcoCbCheck />}
      </span>
    </label>
  )
}

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
type ViewMode  = 'list' | 'grid'
type SortKey   = 'name' | 'status' | 'cpu' | 'memory' | 'enabled'
type SortDir   = 'asc' | 'desc'
type Filter    = 'all' | 'active' | 'inactive' | 'failed' | 'masked'

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────
function statusOrder(s: string) { return s === 'active' ? 0 : s === 'inactive' ? 1 : s === 'failed' ? 2 : 3 }

function cpuColor(pct: number) {
  return pct > 50 ? '#ef4444' : pct > 20 ? '#f59e0b' : '#22c55e'
}
function memColor(pct: number) {
  return pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : 'var(--color-accent)'
}

// ─────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cls = status === 'active' ? styles.statusRunning : status === 'failed' ? styles.statusFailed : status === 'masked' ? styles.statusMasked : styles.statusInactive
  const label = status === 'active' ? 'running' : status
  return (
    <span className={`${styles.statusBadge} ${cls}`}>
      <span className={styles.statusDot}/>
      {label}
    </span>
  )
}

function EnabledBadge({ val }: { val: string }) {
  const cls = val === 'enabled' ? styles.enabledOn : val === 'disabled' ? styles.enabledOff : styles.enabledStatic
  return <span className={`${styles.enabledBadge} ${cls}`}>{val}</span>
}

function MicroBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className={styles.microBar}>
      <div className={styles.microBarTrack}>
        <div className={styles.microBarFill} style={{ width: `${Math.min(100,pct)}%`, background: color }}/>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Action row mutations hook
// ─────────────────────────────────────────────────────────
function useServiceActions(name: string) {
  const qc = useQueryClient()
  const opts = { onSettled: () => qc.invalidateQueries({ queryKey: ['services'] }) }
  const startM   = useMutation({ mutationFn: () => startService(name),   ...opts })
  const stopM    = useMutation({ mutationFn: () => stopService(name),    ...opts })
  const restartM = useMutation({ mutationFn: () => restartService(name), ...opts })
  const pending  = startM.isPending || stopM.isPending || restartM.isPending
  return { startM, stopM, restartM, pending }
}

// ─────────────────────────────────────────────────────────
// More-menu dropdown
// ─────────────────────────────────────────────────────────
function MoreMenu({ onDetail, onClose }: { name: string; onDetail: () => void; onClose: () => void }) {
  return (
    <div className={styles.moreMenu}>
      <div className={styles.moreMenuItem} onClick={() => { onDetail(); onClose() }}><IcoInfo /> View details</div>
      <div className={styles.moreMenuItem} onClick={onClose}><IcoReload /> Reload config</div>
      <div className={styles.moreMenuDivider}/>
      <div className={styles.moreMenuItem} onClick={onClose}><IcoEnable /> Enable at boot</div>
      <div className={styles.moreMenuItem} onClick={onClose}><IcoDisable /> Disable at boot</div>
      <div className={styles.moreMenuDivider}/>
      <div className={`${styles.moreMenuItem} ${styles.moreMenuItemDanger}`} onClick={onClose}><IcoMask /> Mask service</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// List row
// ─────────────────────────────────────────────────────────
interface RowProps {
  service: Service
  selected: boolean
  onSelect: (n: string) => void
  onDetail: (s: Service) => void
  dragIdx: number
  onDragStart: (i: number) => void
  onDragOver:  (i: number) => void
  onDrop:      (i: number) => void
  dragOverIdx: number
  index: number
}

function ServiceListRow({ service: s, selected, onSelect, onDetail, index, dragIdx, dragOverIdx, onDragStart, onDragOver, onDrop }: RowProps) {
  const { startM, stopM, restartM, pending } = useServiceActions(s.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const ext = getExtService(s)

  const cpuPct = Math.min(100, s.cpu_pct)
  const memPct = Math.min(100, (s.mem_bytes / (512 * 1024 * 1024)) * 100)

  const isDragging  = dragIdx === index
  const isDragOver  = dragOverIdx === index && dragIdx !== index

  return (
    <tr
      className={`${styles.tr} ${selected ? styles.trSelected : ''} ${isDragging ? styles.trDragging : ''} ${isDragOver ? styles.trDragOver : ''}`}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={e => { e.preventDefault(); onDragOver(index) }}
      onDrop={() => onDrop(index)}
    >
      <td className={styles.td} style={{ width: 24, paddingRight: 0 }}>
        <div className={styles.dragHandle}><IcoDrag /></div>
      </td>
      <td className={styles.td} style={{ width: 20, paddingRight: 0 }}>
        <Checkbox checked={selected} onChange={() => onSelect(s.name)} />
      </td>
      <td className={styles.td} style={{ minWidth: 200 }}>
        <div className={styles.svcCell}>
          <div className={styles.svcIcon} style={{ color: ext.accentColor }}>
            <ext.IconComponent />
          </div>
          <div>
            <div className={styles.svcName} onClick={() => onDetail(s)}>{s.name}</div>
            {s.description && <div className={styles.svcDesc}>{s.description}</div>}
          </div>
        </div>
      </td>
      <td className={styles.td} style={{ width: 120 }}>
        <StatusBadge status={s.status} />
      </td>
      <td className={styles.td} style={{ width: 90 }}>
        <EnabledBadge val={ext.enabled} />
      </td>
      <td className={styles.td} style={{ width: 40, fontFamily: 'monospace', fontSize: 11.5, color: 'var(--color-text-dim)' }}>
        {ext.pid ?? '—'}
      </td>
      <td className={styles.td} style={{ width: 110 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11.5, fontFamily: 'monospace', color: cpuColor(cpuPct), minWidth: 36 }}>{s.cpu_pct.toFixed(1)}%</span>
          <MicroBar pct={cpuPct} color={cpuColor(cpuPct)} />
        </div>
      </td>
      <td className={styles.td} style={{ width: 130 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11.5, fontFamily: 'monospace', color: 'var(--color-text-muted)', minWidth: 54 }}>{formatBytes(s.mem_bytes)}</span>
          <MicroBar pct={memPct} color={memColor(memPct)} />
        </div>
      </td>
      <td className={styles.td} style={{ width: 50, fontFamily: 'monospace', fontSize: 11.5, color: (ext.restarts ?? 0) > 0 ? '#fb923c' : 'var(--color-text-dim)' }}>
        {ext.restarts ?? 0}/{ext.restartLimit ?? 5}
      </td>
      <td className={styles.td} style={{ width: 140 }}>
        <div className={styles.actionsCell}>
          {pending ? (
            <Spinner size="sm" />
          ) : (
            <>
              <button className={`${styles.actionBtn} ${styles.actionBtnGreen}`}   onClick={() => startM.mutate()}   disabled={s.status === 'active'}  title="Start"><IcoPlay /></button>
              <button className={`${styles.actionBtn} ${styles.actionBtnRed}`}     onClick={() => stopM.mutate()}    disabled={s.status !== 'active'}  title="Stop"><IcoStop /></button>
              <button className={`${styles.actionBtn} ${styles.actionBtnOrange}`}  onClick={() => restartM.mutate()}                                    title="Restart"><IcoRestart /></button>
              <button className={`${styles.actionBtn} ${styles.actionBtnBlue}`}                                                                         title="Reload"><IcoReload /></button>
              <div className={styles.moreBtn} style={{ position: 'relative' }}>
                <button className={styles.actionBtn} onClick={() => setMenuOpen(v => !v)} title="More"><IcoMore /></button>
                {menuOpen && (
                  <MoreMenu name={s.name} onDetail={() => onDetail(s)} onClose={() => setMenuOpen(false)} />
                )}
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────
// Grid card
// ─────────────────────────────────────────────────────────
interface CardProps {
  service: Service
  selected: boolean
  onSelect: (n: string) => void
  onDetail: (s: Service) => void
  index: number
  dragIdx: number
  dragOverIdx: number
  onDragStart: (i: number) => void
  onDragOver:  (i: number) => void
  onDrop:      (i: number) => void
}

function ServiceCard({ service: s, selected, onSelect, onDetail, index, dragIdx, dragOverIdx, onDragStart, onDragOver, onDrop }: CardProps) {
  const { startM, stopM, restartM, pending } = useServiceActions(s.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const ext = getExtService(s)

  const cpuPct = Math.min(100, s.cpu_pct)
  const memPct = Math.min(100, (s.mem_bytes / (512 * 1024 * 1024)) * 100)

  const isDragging = dragIdx === index
  const isDragOver = dragOverIdx === index && dragIdx !== index

  return (
    <div
      className={`${styles.serviceCard} ${selected ? styles.serviceCardSelected : ''} ${isDragging ? styles.serviceCardDragging : ''} ${isDragOver ? styles.serviceCardDragOver : ''}`}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={e => { e.preventDefault(); onDragOver(index) }}
      onDrop={() => onDrop(index)}
    >
      {/* accent line */}
      <div className={styles.cardAccentLine} style={{ background: ext.accentColor, opacity: s.status === 'active' ? 0.8 : 0.3 }}/>

      {/* header */}
      <div className={styles.cardHeader}>
        <Checkbox checked={selected} onChange={() => onSelect(s.name)} className={styles.cardCheckbox} />
        <div className={styles.cardIconWrap} style={{ color: ext.accentColor }}>
          <ext.IconComponent />
        </div>
        <div className={styles.cardTitleBlock}>
          <div className={styles.cardName} onClick={() => onDetail(s)}>{s.name}</div>
          {s.description && <div className={styles.cardDesc}>{s.description}</div>}
        </div>
        <div className={styles.cardDragHandle}><IcoDrag /></div>
      </div>

      {/* meta row: status + enabled */}
      <div className={styles.cardMetaRow}>
        <StatusBadge status={s.status} />
        <EnabledBadge val={ext.enabled} />
        {ext.pid && <span style={{ fontSize: 10.5, color: 'var(--color-text-dim)', fontFamily: 'monospace' }}>PID {ext.pid}</span>}
      </div>

      {/* stats */}
      <div className={styles.cardStats}>
        <div className={styles.cardStat}>
          <span className={styles.cardStatLabel}>CPU</span>
          <div className={styles.cardStatBarWrap}>
            <span className={styles.cardStatVal} style={{ color: cpuColor(cpuPct) }}>{s.cpu_pct.toFixed(1)}%</span>
            <div className={styles.cardStatBar}><div className={styles.cardStatBarFill} style={{ width: `${cpuPct}%`, background: cpuColor(cpuPct) }}/></div>
          </div>
        </div>
        <div className={styles.cardStat}>
          <span className={styles.cardStatLabel}>Memory</span>
          <div className={styles.cardStatBarWrap}>
            <span className={styles.cardStatVal} style={{ color: memColor(memPct) }}>{formatBytes(s.mem_bytes)}</span>
            <div className={styles.cardStatBar}><div className={styles.cardStatBarFill} style={{ width: `${memPct}%`, background: memColor(memPct) }}/></div>
          </div>
        </div>
        <div className={styles.cardStat}>
          <span className={styles.cardStatLabel}>Restarts</span>
          <span className={styles.cardStatVal} style={{ color: (ext.restarts ?? 0) > 0 ? '#fb923c' : 'var(--color-text-muted)' }}>{ext.restarts ?? 0}/{ext.restartLimit ?? 5}</span>
        </div>
        <div className={styles.cardStat}>
          <span className={styles.cardStatLabel}>Tasks</span>
          <span className={styles.cardStatVal}>{ext.tasks ?? '—'}</span>
        </div>
      </div>

      {/* actions */}
      <div className={styles.cardActions}>
        {pending ? (
          <Spinner size="sm" />
        ) : (
          <>
            <button className={`${styles.actionBtn} ${styles.actionBtnGreen}`}  onClick={() => startM.mutate()}  disabled={s.status === 'active'} title="Start"><IcoPlay /></button>
            <button className={`${styles.actionBtn} ${styles.actionBtnRed}`}    onClick={() => stopM.mutate()}   disabled={s.status !== 'active'} title="Stop"><IcoStop /></button>
            <button className={`${styles.actionBtn} ${styles.actionBtnOrange}`} onClick={() => restartM.mutate()}                                 title="Restart"><IcoRestart /></button>
            <button className={`${styles.actionBtn} ${styles.actionBtnBlue}`}                                                                      title="Reload"><IcoReload /></button>
          </>
        )}
        <div className={styles.cardActionsRight} style={{ position: 'relative' }}>
          <button className={styles.actionBtn} onClick={() => setMenuOpen(v => !v)} title="More"><IcoMore /></button>
          {menuOpen && <MoreMenu name={s.name} onDetail={() => onDetail(s)} onClose={() => setMenuOpen(false)} />}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Skeleton loaders
// ─────────────────────────────────────────────────────────
function ListSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className={styles.tr}>
          {[24, 20, 240, 100, 80, 40, 100, 110, 50, 140].map((w, j) => (
            <td key={j} className={styles.td}>
              <div className={styles.skel} style={{ width: w, animationDelay: `${i * 0.06}s` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

function GridSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className={styles.skeletonCard} style={{ animationDelay: `${i * 0.06}s` }} />
      ))}
    </>
  )
}

// ─────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────
export default function ServicesPage() {
  const qc = useQueryClient()

  // ── Data ──
  const { data: apiData, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['services'],
    queryFn: fetchServices,
    refetchInterval: 10_000,
    retry: false,
  })
  const rawData: Service[] = apiData ?? []

  // ── State ──
  const [view,     setView]     = useState<ViewMode>('list')
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState<Filter>('all')
  const [sortKey,  setSortKey]  = useState<SortKey>('name')
  const [sortDir,  setSortDir]  = useState<SortDir>('asc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [order,    setOrder]    = useState<string[]>([])
  const [detail,   setDetail]   = useState<Service | null>(null)
  const [dragIdx,     setDragIdx]     = useState(-1)
  const [dragOverIdx, setDragOverIdx] = useState(-1)

  // sync order when data changes
  useEffect(() => {
    setOrder(prev => {
      const names = rawData.map(s => s.name)
      const existing = prev.filter(n => names.includes(n))
      const added    = names.filter(n => !prev.includes(n))
      return [...existing, ...added]
    })
  }, [rawData.length])

  // Close modal on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') setDetail(null) }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  // ── Counts ──
  const counts = {
    all:      rawData.length,
    active:   rawData.filter(s => s.status === 'active').length,
    inactive: rawData.filter(s => s.status === 'inactive').length,
    failed:   rawData.filter(s => s.status === 'failed').length,
    masked:   0,
  }

  // ── Sort + filter ──
  const sorted = [...rawData].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'name')    cmp = a.name.localeCompare(b.name)
    if (sortKey === 'status')  cmp = statusOrder(a.status) - statusOrder(b.status)
    if (sortKey === 'cpu')     cmp = b.cpu_pct - a.cpu_pct
    if (sortKey === 'memory')  cmp = b.mem_bytes - a.mem_bytes
    if (sortKey === 'enabled') cmp = getExtService(a).enabled.localeCompare(getExtService(b).enabled)
    return sortDir === 'asc' ? cmp : -cmp
  })

  const displayed = sorted.filter(s => {
    const matchFilter = filter === 'all' || s.status === filter
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.description?.toLowerCase().includes(search.toLowerCase()))
    return matchFilter && matchSearch
  })

  // apply manual drag-reorder only when no sort is active (or in grid mode)
  const finalList = (view === 'grid' || (sortKey === 'name' && sortDir === 'asc' && !search))
    ? (order.length > 0 ? displayed.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name)) : displayed)
    : displayed

  // ── Sort toggle ──
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // ── Selection ──
  const toggleSelect = useCallback((name: string) => {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(name) ? n.delete(name) : n.add(name)
      return n
    })
  }, [])
  const selectAll  = () => setSelected(new Set(finalList.map(s => s.name)))
  const clearSelect = () => setSelected(new Set())

  // ── Drag ──
  const handleDrop = (toIdx: number) => {
    if (dragIdx === -1 || dragIdx === toIdx) { setDragIdx(-1); setDragOverIdx(-1); return }
    const items = finalList.map(s => s.name)
    const [moved] = items.splice(dragIdx, 1)
    items.splice(toIdx, 0, moved)
    setOrder(items)
    setDragIdx(-1)
    setDragOverIdx(-1)
  }

  // ── Bulk mutations ──
  const bulkStart   = () => { selected.forEach(n => startService(n));   setTimeout(() => qc.invalidateQueries({ queryKey: ['services'] }), 600) }
  const bulkStop    = () => { selected.forEach(n => stopService(n));    setTimeout(() => qc.invalidateQueries({ queryKey: ['services'] }), 600) }
  const bulkRestart = () => { selected.forEach(n => restartService(n)); setTimeout(() => qc.invalidateQueries({ queryKey: ['services'] }), 600) }

  const SortIcon = ({ k }: { k: SortKey }) => (
    sortKey === k
      ? (sortDir === 'asc' ? <IcoChevronUp /> : <IcoChevronDn />)
      : <span style={{ opacity: 0.25 }}><IcoChevronUp /></span>
  )

  const SORT_OPTIONS: { label: string; key: SortKey }[] = [
    { label: 'Name',    key: 'name'    },
    { label: 'Status',  key: 'status'  },
    { label: 'CPU',     key: 'cpu'     },
    { label: 'Memory',  key: 'memory'  },
    { label: 'Enabled', key: 'enabled' },
  ]

  return (
    <div className={styles.page}>

      {/* ── Page header ── */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.headerTitle}>
            <IcoServices />
            Services
          </div>
          <div className={styles.headerDesc}>systemd service management — {rawData.length} units{!apiData ? ' (demo data)' : ''}</div>
        </div>
        <div className={styles.headerRight}>
          <button
            className={`${styles.iconBtn} ${isFetching ? styles.iconBtnSpin : ''}`}
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh"
          >
            <IcoRefresh />
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className={styles.statRow}>
        {[
          { label: 'Total',    value: counts.all,      sub: 'units',            color: 'var(--color-accent)', f: 'all'      },
          { label: 'Running',  value: counts.active,   sub: 'active services',  color: '#22c55e',             f: 'active'   },
          { label: 'Inactive', value: counts.inactive, sub: 'stopped / dead',   color: '#6b7280',             f: 'inactive' },
          { label: 'Failed',   value: counts.failed,   sub: 'need attention',   color: '#ef4444',             f: 'failed'   },
          { label: 'Masked',   value: counts.masked,   sub: 'masked units',     color: '#fb923c',             f: 'masked'   },
        ].map(c => (
          <div
            key={c.f}
            className={`${styles.statCard} ${filter === c.f ? styles.statCardActive : ''}`}
            onClick={() => setFilter(c.f as Filter)}
          >
            <div className={styles.statAccent} style={{ background: c.color }} />
            <div className={styles.statLabel}>{c.label}</div>
            <div className={styles.statValue}>{c.value}</div>
            <div className={styles.statSub}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <IcoSearch />
          <input
            className={styles.searchInput}
            placeholder="Search by name or description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className={styles.filterPills}>
          {(['all','active','inactive','failed'] as Filter[]).map(f => (
            <button
              key={f}
              className={`${styles.pill} ${filter === f ? styles.pillActive : ''} ${f === 'failed' && counts.failed > 0 ? styles.pillFailed : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? `All (${counts.all})` : f === 'active' ? `Running (${counts.active})` : f === 'inactive' ? `Inactive (${counts.inactive})` : `Failed (${counts.failed})`}
            </button>
          ))}
        </div>

        <div className={styles.toolbarRight}>
          {view === 'grid' && (
            <div className={styles.sortWrap}>
              <select
                className={styles.sortSelect}
                value={`${sortKey}-${sortDir}`}
                onChange={e => {
                  const [k, d] = e.target.value.split('-')
                  setSortKey(k as SortKey); setSortDir(d as SortDir)
                }}
              >
                {SORT_OPTIONS.map(o => (
                  <optgroup key={o.key} label={o.label}>
                    <option value={o.key+'-asc'}>{o.label}: A → Z</option>
                    <option value={o.key+'-desc'}>{o.label}: Z → A</option>
                  </optgroup>
                ))}
              </select>
              <IcoChevronDn />
            </div>
          )}

          <div className={styles.viewToggle}>
            <button className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnActive : ''}`} onClick={() => setView('list')} title="List view"><IcoList /></button>
            <button className={`${styles.viewBtn} ${view === 'grid' ? styles.viewBtnActive : ''}`} onClick={() => setView('grid')} title="Grid view"><IcoGrid /></button>
          </div>
        </div>
      </div>

      {/* ── Bulk action bar ── */}
      {selected.size > 0 && (
        <div className={styles.bulkBar}>
          <span className={styles.bulkCount}>{selected.size} selected</span>
          <div className={styles.bulkDivider}/>
          <div className={styles.bulkActions}>
            <button className={styles.bulkBtn} onClick={bulkStart}>   <IcoPlay />    Start all</button>
            <button className={styles.bulkBtn} onClick={bulkStop}>    <IcoStop />    Stop all</button>
            <button className={styles.bulkBtn} onClick={bulkRestart}> <IcoRestart /> Restart all</button>
            <button className={styles.bulkBtn}>                       <IcoEnable />  Enable at boot</button>
            <button className={styles.bulkBtn}>                       <IcoDisable /> Disable at boot</button>
            <button className={`${styles.bulkBtn} ${styles.bulkBtnDanger}`}><IcoMask /> Mask selected</button>
          </div>
          <div className={styles.bulkDivider}/>
          <button className={styles.bulkBtn} onClick={selectAll}><IcoCheck /> Select all</button>
          <span className={styles.bulkClear} onClick={clearSelect}>Clear</span>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className={styles.errBanner}>
          <IcoWarn />
          {error instanceof Error ? error.message : 'Failed to reach backend — showing demo data'}
        </div>
      )}

      {/* ── List view ── */}
      {view === 'list' && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th} style={{ width: 24 }} />
                <th className={styles.th} style={{ width: 20 }}>
                  <Checkbox
                    checked={selected.size === finalList.length && finalList.length > 0}
                    indeterminate={selected.size > 0 && selected.size < finalList.length}
                    onChange={c => c ? selectAll() : clearSelect()}
                  />
                </th>
                {[
                  { label: 'Service',  key: 'name'    as SortKey },
                  { label: 'Status',   key: 'status'  as SortKey },
                  { label: 'Enabled',  key: 'enabled' as SortKey },
                  { label: 'PID',      key: null },
                  { label: 'CPU',      key: 'cpu'     as SortKey },
                  { label: 'Memory',   key: 'memory'  as SortKey },
                  { label: 'Restarts', key: null },
                  { label: 'Actions',  key: null },
                ].map(col => (
                  <th
                    key={col.label}
                    className={`${styles.th} ${col.key ? styles.thSortable : ''} ${col.key && sortKey === col.key ? styles.thActive : ''}`}
                    onClick={() => col.key && toggleSort(col.key)}
                  >
                    <span className={styles.thSort}>
                      {col.label}
                      {col.key && <SortIcon k={col.key} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? <ListSkeleton />
                : finalList.length === 0
                ? (
                    <tr><td colSpan={10}>
                      <div className={styles.emptyState} style={{ border: 'none' }}>
                        <IcoServices />
                        <div className={styles.emptyTitle}>No services match your filters</div>
                        <div className={styles.emptyDesc}>Try adjusting your search or filter criteria</div>
                      </div>
                    </td></tr>
                  )
                : finalList.map((s, i) => (
                    <ServiceListRow
                      key={s.name}
                      service={s}
                      index={i}
                      selected={selected.has(s.name)}
                      onSelect={toggleSelect}
                      onDetail={setDetail}
                      dragIdx={dragIdx}
                      dragOverIdx={dragOverIdx}
                      onDragStart={setDragIdx}
                      onDragOver={setDragOverIdx}
                      onDrop={handleDrop}
                    />
                  ))
              }
            </tbody>
          </table>
        </div>
      )}

      {/* ── Grid view ── */}
      {view === 'grid' && (
        isLoading
          ? <div className={styles.cardsGrid}><GridSkeleton /></div>
          : finalList.length === 0
          ? (
              <div className={styles.emptyState}>
                <IcoServices />
                <div className={styles.emptyTitle}>No services match your filters</div>
                <div className={styles.emptyDesc}>Try adjusting your search or filter criteria</div>
              </div>
            )
          : (
              <div className={styles.cardsGrid}>
                {finalList.map((s, i) => (
                  <ServiceCard
                    key={s.name}
                    service={s}
                    index={i}
                    selected={selected.has(s.name)}
                    onSelect={toggleSelect}
                    onDetail={setDetail}
                    dragIdx={dragIdx}
                    dragOverIdx={dragOverIdx}
                    onDragStart={setDragIdx}
                    onDragOver={setDragOverIdx}
                    onDrop={handleDrop}
                  />
                ))}
              </div>
            )
      )}

      {/* ── Detail modal ── */}
      {detail && (
        <ServiceDetailModal
          service={detail}
          ext={getExtService(detail)}
          onClose={() => setDetail(null)}
          onAction={() => qc.invalidateQueries({ queryKey: ['services'] })}
        />
      )}
    </div>
  )
}
