import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchDeployHooks, triggerDeploy, createDeployHook, fetchAllDeployRuns, fetchDeployStats, type DeployHook, type DeployLog } from '@/lib/api'
import { PageHeader, EmptyState, Spinner, StatusBadge } from '@/components/ui'
import { DeployLogPanel } from './DeployLogPanel'
import { PipelineDetailModal } from './PipelineDetailModal'
import { PipelineWizard } from './PipelineWizard'
import { timeAgo } from '@/lib/utils'
import { ServiceIcons, getServiceIcon } from './ServiceIcons'
import styles from './DeployPage.module.css'

type SortKey = 'name' | 'created_at' | 'project'
type ViewMode = 'grid' | 'list'

function statusLabel(s: string): 'active' | 'failed' | 'unknown' {
  if (s === 'ok') return 'active'
  if (s === 'error') return 'failed'
  return 'unknown'
}

export default function DeployPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [view, setView] = useState<ViewMode>('grid')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [search, setSearch] = useState('')
  const [_filterStatus, _setFilterStatus] = useState('all')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [detailHook, setDetailHook] = useState<DeployHook | null>(null)
  const [activeLog, setActiveLog] = useState<DeployLog | null>(null)
  const [triggeringId, setTriggeringId] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [hooksOrder, setHooksOrder] = useState<number[]>([])
  const [dragId, setDragId] = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)

  const { isLoading, error, data: rawHooks = [] } = useQuery({
    queryKey: ['deploy-hooks'],
    queryFn: fetchDeployHooks,
    retry: false,
  })

  const { data: recentRuns = [] } = useQuery({
    queryKey: ['deploy-runs-recent'],
    queryFn: fetchAllDeployRuns,
    retry: false,
    select: (runs) => runs.slice(0, 5),
  })

  const { data: deployStats } = useQuery({
    queryKey: ['deploy-stats'],
    queryFn: fetchDeployStats,
    retry: false,
  })

  // Merge API data with drag order
  const hooks: DeployHook[] = hooksOrder.length > 0
    ? [...rawHooks].sort((a, b) => {
        const ai = hooksOrder.indexOf(a.id)
        const bi = hooksOrder.indexOf(b.id)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
    : rawHooks

  const triggerMut = useMutation({
    mutationFn: (id: number) => triggerDeploy(id),
    onMutate: (id) => setTriggeringId(id),
    onSettled: () => setTriggeringId(null),
    onSuccess: (log) => setActiveLog(log),
  })

  const createMut = useMutation({
    mutationFn: (data: { name: string; project: string; script_path: string; strategy: string }) =>
      createDeployHook(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deploy-hooks'] }),
  })

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc(a => !a)
    else { setSortKey(k); setSortAsc(true) }
  }

  const sortedHooks = [...hooks]
    .filter(h => {
      const q = search.toLowerCase()
      return h.name.toLowerCase().includes(q) || h.project.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      let va: string | number = a[sortKey]
      let vb: string | number = b[sortKey]
      if (typeof va === 'string') va = va.toLowerCase()
      if (typeof vb === 'string') vb = vb.toLowerCase()
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sortAsc ? cmp : -cmp
    })

  const copyWebhook = (id: number, secret: string) => {
    const url = `${window.location.origin}/webhook/${secret}`
    navigator.clipboard.writeText(url).catch(() => {})
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1800)
  }

  // Drag handlers
  const handleDragStart = (id: number) => setDragId(id)
  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault()
    setDragOverId(id)
  }
  const handleDrop = (targetId: number) => {
    if (dragId === null || dragId === targetId) { setDragId(null); setDragOverId(null); return }
    const from = hooks.findIndex(h => h.id === dragId)
    const to = hooks.findIndex(h => h.id === targetId)
    const next = hooks.map(h => h.id)
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setHooksOrder(next)
    setDragId(null)
    setDragOverId(null)
  }
  const handleDragEnd = () => { setDragId(null); setDragOverId(null) }

  const total = hooks.length
  const successRate = deployStats ? Math.round(deployStats.success_rate) : 100
  const deploysToday = deployStats?.today ?? 0
  const failed = deployStats?.failed ?? 0

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <span style={{ opacity: 0.3 }}>↕</span>
    return <span>{sortAsc ? '↑' : '↓'}</span>
  }

  return (
    <div>
      <PageHeader
        title="Deploy"
        description="Webhook-triggered deployment pipelines"
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setWizardOpen(true)}>
            + New Pipeline
          </button>
        }
      />

      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statAccent} style={{ background: 'var(--color-accent)' }} />
          <div className={styles.statLabel}>Active Pipelines</div>
          <div className={styles.statValue}>{total}</div>
          <div className={styles.statSub}>webhook-triggered</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statAccent} style={{ background: 'var(--color-success)' }} />
          <div className={styles.statLabel}>Deploys Today</div>
          <div className={styles.statValue}>{deploysToday}</div>
          <div className={styles.statSub}>across all pipelines</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statAccent} style={{ background: 'var(--color-warning)' }} />
          <div className={styles.statLabel}>Success Rate</div>
          <div className={styles.statValue}>{successRate}<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-text-muted)' }}>%</span></div>
          <div className={styles.statSub}>last 7 days</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statAccent} style={{ background: 'var(--color-danger)' }} />
          <div className={styles.statLabel}>Failed (24h)</div>
          <div className={styles.statValue} style={{ color: failed > 0 ? 'var(--color-danger)' : 'var(--color-text)' }}>{failed}</div>
          <div className={styles.statSub}>requires attention</div>
        </div>
      </div>

      {/* Recent Deployments */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Recent Deployments</span>
          <button className={styles.sectionAction} onClick={() => navigate('/deploy/deployments')}>View all</button>
        </div>
        <table className={styles.deploymentsTable}>
          <thead>
            <tr>
              <th>#</th>
              <th>Status</th>
              <th>Pipeline</th>
              <th>Commit</th>
              <th>Time</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {recentRuns.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-dim)', padding: '20px 0', fontSize: 12 }}>No deployments yet — trigger a pipeline to see runs here.</td></tr>
            ) : recentRuns.map(d => (
              <tr
                key={d.id}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/deploy/deployments/${d.id}`)}
              >
                <td style={{ color: 'var(--color-text-dim)', fontSize: 11 }}>#{d.id}</td>
                <td>
                  <StatusBadge
                    status={statusLabel(d.status)}
                    label={d.status === 'ok' ? 'Success' : d.status === 'error' ? 'Failed' : 'Running'}
                    size="sm"
                  />
                </td>
                <td style={{ fontWeight: 500 }}>{d.hook_name}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className={styles.commitMsg}>{d.project || '—'}</span>
                  </div>
                </td>
                <td style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{timeAgo(d.started_at)}</td>
                <td className={styles.durationBadge}>{d.duration || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Error */}
      {error && (
        <div className={styles.errorBanner}>
          Failed to load pipelines — {error instanceof Error ? error.message : 'unknown error'}
        </div>
      )}

      {/* Log output */}
      {activeLog && (
        <DeployLogPanel log={activeLog} onClose={() => setActiveLog(null)} />
      )}

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <input
            className={styles.searchBox}
            placeholder="Search pipelines…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            className={`${styles.sortBtn} ${sortKey === 'name' ? styles.sortBtnActive : ''}`}
            onClick={() => handleSort('name')}
          >
            Name <SortIcon k="name" />
          </button>
          <button
            className={`${styles.sortBtn} ${sortKey === 'project' ? styles.sortBtnActive : ''}`}
            onClick={() => handleSort('project')}
          >
            Project <SortIcon k="project" />
          </button>
          <button
            className={`${styles.sortBtn} ${sortKey === 'created_at' ? styles.sortBtnActive : ''}`}
            onClick={() => handleSort('created_at')}
          >
            Date <SortIcon k="created_at" />
          </button>
        </div>
        <div className={styles.toolbarRight}>
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewBtn} ${view === 'grid' ? styles.viewBtnActive : ''}`}
              onClick={() => setView('grid')}
              title="Grid view"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
            <button
              className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnActive : ''}`}
              onClick={() => setView('list')}
              title="List view"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <line x1="1" y1="3.5" x2="13" y2="3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="1" y1="10.5" x2="13" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Pipeline list */}
      {isLoading ? (
        <div className={view === 'grid' ? styles.hooksGrid : styles.hooksList}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard}>
              <div className={styles.skeletonLine} style={{ width: '55%' }} />
              <div className={styles.skeletonLine} style={{ width: '35%' }} />
              <div className={styles.skeletonLine} style={{ width: '80%', marginTop: 16 }} />
            </div>
          ))}
        </div>
      ) : sortedHooks.length === 0 ? (
        <div className={styles.emptyWrap}>
          <EmptyState
            icon=""
            title="No pipelines yet"
            description="Create a pipeline and point your Git provider's webhook at it to trigger automated deploys."
            action={<button className="btn btn-primary btn-sm" onClick={() => setWizardOpen(true)}>Create first pipeline</button>}
          />
        </div>
      ) : view === 'grid' ? (
        <div className={styles.hooksGrid}>
          {sortedHooks.map(hook => {
            const iconKey = getServiceIcon(hook.name, hook.project)
            const Icon = ServiceIcons[iconKey] || ServiceIcons.default
            const isDragging = dragId === hook.id
            const isDragOver = dragOverId === hook.id && dragId !== hook.id
            return (
              <div
                key={hook.id}
                className={`${styles.hookCard} ${isDragging ? styles.hookCardDragging : ''} ${isDragOver ? styles.hookCardDragOver : ''}`}
                draggable
                onDragStart={() => handleDragStart(hook.id)}
                onDragOver={e => handleDragOver(e, hook.id)}
                onDrop={() => handleDrop(hook.id)}
                onDragEnd={handleDragEnd}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className={styles.serviceIconWrap}>
                      <Icon />
                    </div>
                    <div>
                      <div className={styles.hookName}>{hook.name}</div>
                      <div className={styles.hookProject}>{hook.project}</div>
                    </div>
                  </div>
                  <span className={styles.dragHandle} title="Drag to reorder">⠿</span>
                </div>

                <div className={styles.hookMeta}>
                  <span className={`${styles.metaTag} ${styles.metaTagAccent}`}>
                    {hook.strategy === 'blue-green' ? 'blue/green' : 'exec'}
                  </span>
                  <span className={styles.metaTag}>webhook</span>
                  <span className={`${styles.metaTag} ${styles.metaTagSuccess}`}>active</span>
                </div>

                <div className={styles.hookWebhook}>
                  <span className={styles.webhookUrl}>/webhook/{'<secret>'}</span>
                  <button
                    className={styles.copyBtn}
                    onClick={e => { e.stopPropagation(); copyWebhook(hook.id, 'secret') }}
                    title="Copy webhook URL"
                  >
                    {copiedId === hook.id ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <div className={styles.hookFooter}>
                  <span className={styles.hookTime}>Created {timeAgo(hook.created_at)}</span>
                  <div className={styles.footerActions}>
                    <button
                      className={styles.iconBtn}
                      onClick={() => setDetailHook(hook)}
                      title="View details"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                        <line x1="6" y1="5" x2="6" y2="8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        <circle cx="6" cy="3.5" r="0.75" fill="currentColor" />
                      </svg>
                    </button>
                    <button
                      className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                      title="Delete"
                      onClick={e => e.stopPropagation()}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 3h8M5 3V2h2v1M4.5 3v6M7.5 3v6M3 3l.5 7h5L9 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      className={styles.triggerBtn}
                      onClick={() => triggerMut.mutate(hook.id)}
                      disabled={triggeringId !== null}
                    >
                      {triggeringId === hook.id
                        ? <><Spinner size="sm" /> Running</>
                        : <>
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                              <path d="M2 1.5l7 3.5-7 3.5V1.5z" />
                            </svg>
                            Trigger
                          </>
                      }
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className={styles.hooksList}>
          {sortedHooks.map(hook => {
            const iconKey = getServiceIcon(hook.name, hook.project)
            const Icon = ServiceIcons[iconKey] || ServiceIcons.default
            const isDragging = dragId === hook.id
            const isDragOver = dragOverId === hook.id && dragId !== hook.id
            return (
              <div
                key={hook.id}
                className={`${styles.hookCardList} ${isDragging ? styles.hookCardListDragging : ''} ${isDragOver ? styles.hookCardListDragOver : ''}`}
                draggable
                onDragStart={() => handleDragStart(hook.id)}
                onDragOver={e => handleDragOver(e, hook.id)}
                onDrop={() => handleDrop(hook.id)}
                onDragEnd={handleDragEnd}
              >
                <span className={styles.dragHandle}>⠿</span>
                <div className={styles.serviceIconWrap}>
                  <Icon />
                </div>
                <div className={styles.hookListMain}>
                  <div className={styles.hookListName}>{hook.name}</div>
                  <div className={styles.hookListSub}>{hook.project}</div>
                </div>
                <div className={styles.hookListMeta}>
                  <span className={`${styles.metaTag} ${styles.metaTagAccent}`}>
                    {hook.strategy === 'blue-green' ? 'blue/green' : 'exec'}
                  </span>
                  <span className={`${styles.metaTag} ${styles.metaTagSuccess}`}>active</span>
                  <span className={styles.hookTime}>{timeAgo(hook.created_at)}</span>
                </div>
                <div className={styles.hookListActions}>
                  <button
                    className={styles.iconBtn}
                    onClick={() => setDetailHook(hook)}
                    title="View details"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                      <line x1="6" y1="5" x2="6" y2="8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <circle cx="6" cy="3.5" r="0.75" fill="currentColor" />
                    </svg>
                  </button>
                  <button
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    title="Delete"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 3h8M5 3V2h2v1M4.5 3v6M7.5 3v6M3 3l.5 7h5L9 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    className={styles.triggerBtn}
                    onClick={() => triggerMut.mutate(hook.id)}
                    disabled={triggeringId !== null}
                  >
                    {triggeringId === hook.id
                      ? <><Spinner size="sm" /> Running</>
                      : <>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                            <path d="M2 1.5l7 3.5-7 3.5V1.5z" />
                          </svg>
                          Trigger
                        </>
                    }
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      <PipelineWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreate={(data) => {
          createMut.mutate(data)
          setWizardOpen(false)
        }}
      />
      {detailHook && (
        <PipelineDetailModal
          hook={detailHook}
          onClose={() => setDetailHook(null)}
          onTrigger={() => triggerMut.mutate(detailHook.id)}
          triggering={triggeringId === detailHook.id}
        />
      )}
    </div>
  )
}
