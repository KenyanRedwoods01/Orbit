import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { StatusBadge } from '@/components/ui'
import { PageHeader } from '@/components/ui'
import { timeAgo } from '@/lib/utils'
import { fetchAllDeployRuns, type DeployRun } from '@/lib/api'
import styles from './AllDeployments.module.css'

// ── Icons ──────────────────────────────────────────────────────────
const IcoSearch   = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="6" cy="6" r="4"/><line x1="9" y1="9" x2="12.5" y2="12.5"/></svg>
const IcoBack     = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,2 4,7 9,12"/></svg>
const IcoRerun    = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 5.5A3.5 3.5 0 1 1 8.2 2.4"/><polyline points="8.2,1 10,2.4 8.5,4"/></svg>
const IcoRefresh  = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a4 4 0 1 1 1 2.6"/><polyline points="3,10 3,7 6,7"/></svg>

type SortKey = 'started_at' | 'hook_name' | 'status' | 'duration'
type SortDir = 'asc' | 'desc'

const STATUS_OPTIONS = [
  { value: 'all',     label: 'All statuses' },
  { value: 'ok',      label: 'Success' },
  { value: 'error',   label: 'Failed' },
  { value: 'running', label: 'Running' },
]

function statusBadge(s: string): 'active' | 'failed' | 'unknown' | 'paused' {
  if (s === 'ok')      return 'active'
  if (s === 'error')   return 'failed'
  if (s === 'running') return 'active'
  return 'unknown'
}

function statusLabel(s: string) {
  if (s === 'ok')      return 'Success'
  if (s === 'error')   return 'Failed'
  if (s === 'running') return 'Running'
  return s
}

function firstLine(output: string): string {
  const lines = output.split('\n').filter(l => l.trim())
  return lines[0] ?? '—'
}

export default function AllDeploymentsPage() {
  const navigate  = useNavigate()
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatus]     = useState('all')
  const [hookFilter, setHook]         = useState('all')
  const [sortKey, setSortKey]         = useState<SortKey>('started_at')
  const [sortDir, setSortDir]         = useState<SortDir>('desc')
  const [page, setPage]               = useState(1)
  const PER_PAGE = 20

  const { data: runs = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['deploy-all-runs'],
    queryFn: fetchAllDeployRuns,
    refetchInterval: 15000,
  })

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }

  // Unique hook names for filter
  const HOOK_OPTIONS = ['all', ...Array.from(new Set(runs.map(d => d.hook_name)))]

  const filtered = useMemo(() => {
    return runs
      .filter(d => {
        if (statusFilter !== 'all' && d.status !== statusFilter) return false
        if (hookFilter !== 'all' && d.hook_name !== hookFilter) return false
        if (search) {
          const q = search.toLowerCase()
          const msg = firstLine(d.output).toLowerCase()
          if (!d.hook_name.toLowerCase().includes(q) && !d.project.toLowerCase().includes(q) && !msg.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        let va: string | number, vb: string | number
        if      (sortKey === 'started_at') { va = a.started_at; vb = b.started_at }
        else if (sortKey === 'hook_name')  { va = a.hook_name;  vb = b.hook_name  }
        else if (sortKey === 'status')     { va = a.status;     vb = b.status     }
        else                               { va = a.duration ?? ''; vb = b.duration ?? '' }
        const cmp = va < vb ? -1 : va > vb ? 1 : 0
        return sortDir === 'asc' ? cmp : -cmp
      })
  }, [runs, search, statusFilter, hookFilter, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const total   = runs.length
  const success = runs.filter(d => d.status === 'ok').length
  const failed  = runs.filter(d => d.status === 'error').length
  const rate    = total === 0 ? 100 : Math.round((success / total) * 100)

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      className={`${styles.sortBtn} ${sortKey === k ? styles.sortBtnActive : ''}`}
      onClick={() => handleSort(k)}
    >
      {label}
      {sortKey === k && <span>{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>}
    </button>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <button className={styles.backBtn} onClick={() => navigate('/deploy')}>
          <IcoBack /> Deploy
        </button>
        <div className={styles.breadcrumb}>
          <span className={styles.breadcrumbLink} onClick={() => navigate('/deploy')}>Pipelines</span>
          <span>/</span>
          <span style={{ color: 'var(--color-text)' }}>All Deployments</span>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button
            className={styles.backBtn}
            style={{ opacity: isFetching ? 0.6 : 1 }}
            onClick={() => refetch()}
            title="Refresh"
          >
            <IcoRefresh />
          </button>
        </div>
      </div>

      <PageHeader
        title="All Deployments"
        description="Complete history of all deployment runs across hooks"
      />

      {/* Summary strip */}
      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryVal}>{total}</div>
          <div className={styles.summaryLabel}>Total runs</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryVal} style={{ color: 'var(--color-success)' }}>{success}</div>
          <div className={styles.summaryLabel}>Successful</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryVal} style={{ color: 'var(--color-danger)' }}>{failed}</div>
          <div className={styles.summaryLabel}>Failed</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryVal}>{rate}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-text-muted)' }}>%</span></div>
          <div className={styles.summaryLabel}>Success rate</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}><IcoSearch /></span>
            <input
              className={styles.searchInput}
              placeholder="Search by hook, project, output…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <select className={styles.filterSelect} value={statusFilter} onChange={e => { setStatus(e.target.value); setPage(1) }}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className={styles.filterSelect} value={hookFilter} onChange={e => { setHook(e.target.value); setPage(1) }}>
            {HOOK_OPTIONS.map(h => <option key={h} value={h}>{h === 'all' ? 'All hooks' : h}</option>)}
          </select>
        </div>
        <div className={styles.toolbarRight}>
          <SortBtn k="started_at" label="Date" />
          <SortBtn k="hook_name"  label="Hook" />
          <SortBtn k="status"     label="Status" />
          <SortBtn k="duration"   label="Duration" />
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        {isLoading && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 13 }}>
            Loading deployments…
          </div>
        )}
        {!isLoading && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th} style={{ width: 44 }}>#</th>
                <th className={styles.th} style={{ width: 100 }}>Status</th>
                <th className={styles.th}>Hook / Project</th>
                <th className={styles.th}>Output</th>
                <th className={styles.th} style={{ width: 110 }}>Time</th>
                <th className={styles.th} style={{ width: 90 }}>Duration</th>
                <th className={styles.th} style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-dim)', fontSize: 13 }}>
                    {runs.length === 0 ? 'No deployment runs yet. Trigger a hook to see results here.' : 'No deployments match your filters.'}
                  </td>
                </tr>
              )}
              {paged.map((dep: DeployRun) => (
                <tr key={dep.id} className={styles.tr}>
                  <td className={styles.td} style={{ color: 'var(--color-text-dim)', fontFamily: 'monospace', fontSize: 11 }}>
                    {dep.id}
                  </td>
                  <td className={styles.td}>
                    <StatusBadge status={statusBadge(dep.status)} label={statusLabel(dep.status)} size="sm" />
                  </td>
                  <td className={styles.td}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{dep.hook_name}</div>
                    {dep.project && <div style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>{dep.project}</div>}
                  </td>
                  <td className={styles.td}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                      {firstLine(dep.output)}
                    </div>
                  </td>
                  <td className={styles.td} style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {timeAgo(dep.started_at)}
                  </td>
                  <td className={styles.td} style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {dep.duration || '—'}
                  </td>
                  <td className={styles.td} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      <button className={styles.iconBtn} title="Re-run" onClick={() => {}}>
                        <IcoRerun />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                className={`${styles.pageBtn} ${page === i + 1 ? styles.pageBtnActive : ''}`}
                onClick={() => setPage(i + 1)}
              >
                {i + 1}
              </button>
            ))}
            <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
