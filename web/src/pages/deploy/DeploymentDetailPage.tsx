import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { StatusBadge, Spinner } from '@/components/ui'
import { timeAgo } from '@/lib/utils'
import { fetchDeployRun } from '@/lib/api'
import { getStatusColor, getStatusLabel } from './deploymentData'
import styles from './DeploymentDetail.module.css'

// ── Icons ─────────────────────────────────────────────────────────
const IcoBack    = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,2 4,7 9,12"/></svg>
const IcoClock   = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="5.5"/><polyline points="7,4 7,7 9.5,8.5"/></svg>
const IcoServer  = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="2" width="11" height="4" rx="1"/><rect x="1.5" y="8" width="11" height="4" rx="1"/><circle cx="4" cy="4" r="0.7" fill="currentColor" stroke="none"/><circle cx="4" cy="10" r="0.7" fill="currentColor" stroke="none"/></svg>
const IcoHook    = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1L5 7.5h4L6 13"/></svg>

function formatTs(sec: number): string {
  return new Date(sec * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function logLineClass(line: string): string {
  const l = line.toLowerCase()
  if (l.includes('error') || l.includes('fail') || l.includes('✗') || l.includes('× ')) return styles.logLineError
  if (l.includes('warn')) return styles.logLineWarn
  if (l.includes('✓') || l.includes('success') || l.includes('passed') || l.includes('ok')) return styles.logLineOk
  return ''
}

export default function DeploymentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'output' | 'info'>('output')

  const { data: run, isLoading, error } = useQuery({
    queryKey: ['deploy-run', id],
    queryFn: () => fetchDeployRun(Number(id)),
    enabled: !!id,
    retry: false,
  })

  if (isLoading) {
    return (
      <div style={{ padding: '60px 0', display: 'flex', justifyContent: 'center' }}>
        <Spinner size="md" />
      </div>
    )
  }

  if (error || !run) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 14 }}>
        Run #{id} not found.{' '}
        <button
          onClick={() => navigate('/deploy')}
          style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <IcoBack /> Back to Deploy
        </button>
      </div>
    )
  }

  const statusColor = getStatusColor(run.status)
  const statusLabel = getStatusLabel(run.status)
  const outputLines = (run.output || '').split('\n')

  return (
    <div>
      {/* ── Breadcrumb ── */}
      <div className={styles.backBar}>
        <button className={styles.backBtn} onClick={() => navigate('/deploy')}>
          <IcoBack /> Deploy
        </button>
        <div className={styles.breadcrumb}>
          <span className={styles.breadcrumbLink} onClick={() => navigate('/deploy')}>Pipelines</span>
          <span>/</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{run.hook_name}</span>
          <span>/</span>
          <span style={{ color: 'var(--color-text)' }}>Run #{run.id}</span>
        </div>
      </div>

      {/* ── Hero card ── */}
      <div className={styles.heroCard}>
        <div className={styles.heroAccent} style={{ background: statusColor }} />

        <div className={styles.heroTop}>
          <div className={styles.heroLeft}>
            <div className={styles.heroId}>
              Run #{run.id} · {run.hook_name}{run.project ? ` · ${run.project}` : ''}
            </div>
            <div className={styles.heroTitle}>Deploy run — {run.hook_name}</div>

            <div className={styles.heroBadges}>
              <span className={styles.heroPill} style={{
                background: `${statusColor}18`,
                borderColor: `${statusColor}40`,
                color: statusColor,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
                {statusLabel}
              </span>

              <span className={styles.heroPill} style={{
                background: 'var(--color-surface-raised)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-muted)',
              }}>
                <IcoHook />
                webhook
              </span>
            </div>

            <div className={styles.heroMeta}>
              <div className={styles.heroMetaItem}>
                <IcoClock />
                <span>{timeAgo(run.started_at)}</span>
                {run.duration && (
                  <>
                    <span style={{ color: 'var(--color-text-dim)' }}>·</span>
                    <span className={styles.heroMetaVal}>{run.duration}</span>
                  </>
                )}
              </div>
              <div className={styles.heroMetaItem}>
                <IcoServer />
                <span>local (this machine)</span>
              </div>
            </div>
          </div>

          <div className={styles.heroActions}>
            <StatusBadge
              status={run.status === 'ok' ? 'active' : run.status === 'error' ? 'failed' : 'unknown'}
              label={statusLabel}
            />
          </div>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statAccent} style={{ background: 'var(--color-accent)' }} />
          <div className={styles.statLabel}>Duration</div>
          <div className={styles.statVal} style={{ fontSize: 18, fontFamily: 'monospace' }}>{run.duration || '—'}</div>
          <div className={styles.statSub}>started {timeAgo(run.started_at)}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statAccent} style={{ background: statusColor }} />
          <div className={styles.statLabel}>Status</div>
          <div className={styles.statVal} style={{ color: statusColor }}>{statusLabel}</div>
          <div className={styles.statSub}>{run.ended_at ? `ended ${timeAgo(run.ended_at)}` : 'still running'}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statAccent} style={{ background: '#10b981' }} />
          <div className={styles.statLabel}>Pipeline</div>
          <div className={styles.statVal} style={{ fontSize: 13, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.hook_name}</div>
          <div className={styles.statSub}>hook #{run.hook_id}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statAccent} style={{ background: 'var(--color-text-dim)' }} />
          <div className={styles.statLabel}>Output Lines</div>
          <div className={styles.statVal}>{outputLines.filter(l => l.trim()).length}</div>
          <div className={styles.statSub}>script output</div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'output' ? styles.tabActive : ''}`} onClick={() => setTab('output')}>
          Build Output
          <span className={styles.tabCount}>{outputLines.filter(l => l.trim()).length}</span>
        </button>
        <button className={`${styles.tab} ${tab === 'info' ? styles.tabActive : ''}`} onClick={() => setTab('info')}>
          Run Info
        </button>
      </div>

      {/* ── Output tab ── */}
      {tab === 'output' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionCardHeader} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className={styles.sectionCardTitle}>Script Output</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-dim)', fontFamily: 'monospace' }}>
              {outputLines.filter(l => l.trim()).length} lines
            </span>
          </div>
          <div style={{ padding: '10px 0' }}>
            {outputLines.length === 0 || (outputLines.length === 1 && !outputLines[0].trim()) ? (
              <div style={{ padding: '20px 16px', color: 'var(--color-text-dim)', fontStyle: 'italic', fontSize: 12 }}>
                No output captured for this run.
              </div>
            ) : (
              outputLines.map((line, i) => (
                <div key={i} className={styles.logLine}>
                  <span className={styles.logLineNum}>{i + 1}</span>
                  <span className={`${styles.logLineText} ${logLineClass(line)}`}>{line || '\u00a0'}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Info tab ── */}
      {tab === 'info' && (
        <div>
          <div className={styles.triggerCard}>
            <div className={styles.triggerGrid}>
              <div className={styles.triggerField}>
                <div className={styles.triggerLabel}>Run ID</div>
                <div className={styles.triggerValMono}>#{run.id}</div>
              </div>
              <div className={styles.triggerField}>
                <div className={styles.triggerLabel}>Hook ID</div>
                <div className={styles.triggerValMono}>#{run.hook_id}</div>
              </div>
              <div className={styles.triggerField}>
                <div className={styles.triggerLabel}>Pipeline</div>
                <div className={styles.triggerVal}>{run.hook_name}</div>
              </div>
              <div className={styles.triggerField}>
                <div className={styles.triggerLabel}>Project</div>
                <div className={styles.triggerVal}>{run.project || '—'}</div>
              </div>
              <div className={styles.triggerField}>
                <div className={styles.triggerLabel}>Status</div>
                <div className={styles.triggerVal} style={{ color: statusColor, fontWeight: 600 }}>{statusLabel}</div>
              </div>
              <div className={styles.triggerField}>
                <div className={styles.triggerLabel}>Duration</div>
                <div className={styles.triggerValMono}>{run.duration || '—'}</div>
              </div>
              <div className={styles.triggerField}>
                <div className={styles.triggerLabel}>Started</div>
                <div className={styles.triggerVal}>{formatTs(run.started_at)}</div>
              </div>
              {run.ended_at && (
                <div className={styles.triggerField}>
                  <div className={styles.triggerLabel}>Finished</div>
                  <div className={styles.triggerVal}>{formatTs(run.ended_at)}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
