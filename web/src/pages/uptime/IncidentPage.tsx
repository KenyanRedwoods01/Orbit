import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchUptimeIncident, resolveUptimeIncident } from '@/lib/api'
import type { UptimeIncident } from '@/lib/api'
import { SEVERITY_COLOR, CATEGORY_LABEL } from './incidentData'
import type { TimelineEventType, CheckStatus } from './incidentData'
import styles from './IncidentPage.module.css'

// ── Raw SVG imports ───────────────────────────────────────────
import mailSvg        from '@/assets/incident-icons/mail-server.svg?raw'
import websiteSvg     from '@/assets/incident-icons/website.svg?raw'
import apiSvg         from '@/assets/incident-icons/api.svg?raw'
import stagingSvg     from '@/assets/incident-icons/staging.svg?raw'
import databaseSvg    from '@/assets/incident-icons/database.svg?raw'
import connRefSvg     from '@/assets/incident-icons/connection-refused.svg?raw'
import sslSvg         from '@/assets/incident-icons/ssl-cert.svg?raw'
import rollbackSvg    from '@/assets/incident-icons/deploy-rollback.svg?raw'
import memorySvg      from '@/assets/incident-icons/memory-oom.svg?raw'
import diskSvg        from '@/assets/incident-icons/disk-io.svg?raw'

function monitorSvgForIncident(kind: string, target: string): string {
  if (kind === 'icmp') return websiteSvg
  if (target.includes('db') || target.includes('postgres') || target.includes('redis') || target.includes('mysql')) return databaseSvg
  if (target.includes('smtp') || target.includes('mail') || target.includes('587') || target.includes(':25')) return mailSvg
  if (target.includes('staging') || target.includes('stage')) return stagingSvg
  if (kind === 'tcp') return apiSvg
  return websiteSvg
}

const CAUSE_SVG: Record<string, string> = {
  network: connRefSvg, ssl: sslSvg, application: rollbackSvg,
  infrastructure: memorySvg, database: diskSvg,
}

// ── Tiny inline icon components ───────────────────────────────
function IconArrowLeft() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="12,4 6,10 12,16"/><line x1="6" y1="10" x2="18" y2="10"/></svg>
}
function IconClock() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><circle cx="10" cy="10" r="8"/><polyline points="10,6 10,10 13,12"/></svg>
}
function IconTimeline() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><circle cx="4" cy="4"  r="2"/><circle cx="4" cy="10" r="2"/><circle cx="4" cy="16" r="2"/><line x1="4" y1="6"  x2="4" y2="8"/><line x1="4" y1="12" x2="4" y2="14"/><line x1="8" y1="4"  x2="18" y2="4"/><line x1="8" y1="10" x2="18" y2="10"/><line x1="8" y1="16" x2="18" y2="16"/></svg>
}
function IconLog() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M4 3h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><line x1="6" y1="7"  x2="14" y2="7"/><line x1="6" y1="10" x2="14" y2="10"/><line x1="6" y1="13" x2="10" y2="13"/></svg>
}
function IconRootCause() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><circle cx="10" cy="10" r="8"/><line x1="10" y1="6" x2="10" y2="10"/><circle cx="10" cy="13.5" r="0.6" fill="currentColor" stroke="none"/></svg>
}
function IconShield() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M10 2C7 3.5 4 4 4 4s0 5 1.2 7.5C6.4 14 8 15.5 10 16c2-.5 3.6-2 4.8-4.5C16 9 16 4 16 4s-3-.5-6-2z"/><polyline points="7.5,10 9.5,12 13,8"/></svg>
}
function IconChart() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><polyline points="2,14 7,9 10,12 14,6 18,9"/><line x1="2" y1="17" x2="18" y2="17"/></svg>
}
function IconServer() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><rect x="2" y="3" width="16" height="5" rx="1"/><rect x="2" y="12" width="16" height="5" rx="1"/><circle cx="16" cy="5.5" r="0.8" fill="currentColor" stroke="none"/><circle cx="16" cy="14.5" r="0.8" fill="currentColor" stroke="none"/></svg>
}
function IconImpact() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M10 3L18 17H2z"/><line x1="10" y1="9" x2="10" y2="12"/><circle cx="10" cy="15" r="0.5" fill="currentColor" stroke="none"/></svg>
}

// ── Helpers ───────────────────────────────────────────────────
function fmtDate(d: Date) {
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).replace(',', '')
}
function fmtOffset(min: number) {
  if (min < 0)    return `T${min.toFixed(0)}m`
  if (min === 0)  return 'T+00:00'
  const h  = Math.floor(min / 60)
  const m  = Math.floor(min % 60)
  const s  = Math.round((min % 1) * 60)
  if (h > 0)   return `T+${h}h${m > 0 ? `${m}m` : ''}`
  if (m > 0)   return `T+${m}m${s > 0 ? `${s}s` : ''}`
  return `T+${s}s`
}
function fmtDuration(min: number | null) {
  if (min === null) return 'Ongoing'
  if (min < 60)     return `${min}m`
  return `${Math.floor(min / 60)}h ${min % 60}m`
}
function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}

const TL_TYPE_LABEL: Record<string, string> = {
  detection:     'Detected',
  alert:         'Alert',
  escalation:    'Escalated',
  investigation: 'Investigation',
  fix:           'Fix Applied',
  monitoring:    'Monitoring',
  resolved:      'Resolved',
}

// ── Impact sparkline ─────────────────────────────────────────
function ImpactChart({
  entries, baseline, peak,
}: { entries: { offset_min: number; latency_ms: number | null }[]; baseline: number; peak: number }) {
  const W = 560; const H = 80
  const pts = entries.filter(e => e.latency_ms != null && e.latency_ms > 0)
  if (pts.length < 2) return null
  const maxLat = Math.max(peak, ...pts.map(e => e.latency_ms!))
  const minOff = Math.min(...entries.map(e => e.offset_min))
  const maxOff = Math.max(...entries.map(e => e.offset_min))
  const range  = maxOff - minOff || 1

  const toX = (off: number) => ((off - minOff) / range) * (W - 20) + 10
  const toY = (lat: number) => H - 8 - (lat / maxLat) * (H - 16)

  const lineCoords = pts.map(e => `${toX(e.offset_min).toFixed(1)},${toY(e.latency_ms!).toFixed(1)}`).join(' ')
  const areaCoords = `${toX(pts[0].offset_min)},${H} ${lineCoords} ${toX(pts[pts.length-1].offset_min)},${H}`
  const baseY = toY(baseline)

  const zeroEntries = entries.filter(e => e.latency_ms === null)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="impactGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="okGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.2"/>
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0"/>
        </linearGradient>
      </defs>

      {/* baseline */}
      <line x1="10" y1={baseY} x2={W-10} y2={baseY} stroke="#22c55e" strokeWidth="1" strokeDasharray="4 3" opacity="0.5"/>
      <text x="12" y={baseY - 3} fontSize="8" fill="#22c55e" opacity="0.7">baseline {baseline}ms</text>

      {/* fail zones */}
      {zeroEntries.map((e, i) => (
        <rect key={i} x={toX(e.offset_min) - 4} y={0} width={8} height={H}
          fill="rgba(239,68,68,0.08)" rx="1"/>
      ))}

      {/* area + line */}
      <polygon points={areaCoords} fill="url(#impactGrad)" />
      <polyline points={lineCoords} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>

      {/* data points */}
      {pts.map((e, i) => (
        <circle key={i} cx={toX(e.offset_min)} cy={toY(e.latency_ms!)} r="2.5"
          fill={e.latency_ms! > baseline * 3 ? '#ef4444' : e.latency_ms! > baseline * 1.5 ? '#f97316' : '#22c55e'}
          stroke="var(--color-surface)" strokeWidth="1.5"/>
      ))}

      {/* X axis */}
      <line x1="10" y1={H-2} x2={W-10} y2={H-2} stroke="var(--color-border)" strokeWidth="1"/>
    </svg>
  )
}

// ── Map API incident to view model ────────────────────────────
function mapIncident(raw: UptimeIncident) {
  const startedAt  = new Date(raw.started_at * 1000)
  const resolvedAt = raw.resolved_at ? new Date(raw.resolved_at * 1000) : null

  const timeline = (raw.timeline ?? []).map(ev => ({
    offsetMin: ev.offset_min,
    type:      ev.type as TimelineEventType,
    actor:     ev.actor,
    message:   ev.message,
  }))

  const checkLog = (raw.check_log ?? []).map(c => ({
    offsetMin: c.offset_min,
    status:    c.status as CheckStatus,
    latencyMs: c.latency_ms,
    httpCode:  c.http_code,
    note:      c.note,
  }))

  return {
    id:              raw.id,
    ref:             raw.ref,
    monitorId:       raw.monitor_id,
    monitorName:     raw.monitor_name,
    monitorKind:     raw.monitor_kind as 'http' | 'tcp' | 'icmp',
    target:          raw.target,
    cause:           raw.cause,
    category:        raw.category as 'network' | 'ssl' | 'application' | 'infrastructure' | 'database',
    severity:        raw.severity,
    startedAt,
    resolvedAt,
    durationMin:     raw.duration_min,
    mttdSec:         raw.mttd_sec,
    mttrMin:         raw.mttr_min,
    failedChecks:    raw.failed_checks,
    errorCode:       raw.error_code,
    errorDetail:     raw.error_detail,
    affectedRegions: raw.affected_regions ?? ['local'],
    timeline,
    checkLog,
    rootCause:       raw.root_cause,
    logExcerpt:      raw.log_excerpt,
    resolution:      raw.resolution,
    prevention:      raw.prevention ?? [],
    impactSummary:   raw.impact_summary,
    latencyBaseline: raw.latency_baseline,
    latencyPeak:     raw.latency_peak,
    responderName:   raw.responder_name,
  }
}

// ── Main page ─────────────────────────────────────────────────
export default function IncidentPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: raw, isLoading, isError } = useQuery({
    queryKey: ['uptime-incident', id],
    queryFn: () => fetchUptimeIncident(Number(id)),
    enabled: !!id,
    retry: false,
  })

  const resolveMut = useMutation({
    mutationFn: () => resolveUptimeIncident(Number(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['uptime-incident', id] })
      qc.invalidateQueries({ queryKey: ['uptime-incidents'] })
    },
  })

  if (isLoading) {
    return (
      <div className={styles.page}>
        <button className={styles.backBtn} onClick={() => navigate('/uptime')}>
          <IconArrowLeft /> Monitors
        </button>
        <div className={styles.notFound}>
          <div className={styles.notFoundSub}>Loading incident…</div>
        </div>
      </div>
    )
  }

  if (isError || !raw) {
    return (
      <div className={styles.page}>
        <button className={styles.backBtn} onClick={() => navigate('/uptime')}>
          <IconArrowLeft /> Monitors
        </button>
        <div className={styles.notFound}>
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48" strokeLinecap="round"><circle cx="24" cy="24" r="20"/><line x1="24" y1="16" x2="24" y2="26"/><circle cx="24" cy="32" r="1.5" fill="currentColor"/></svg>
          <div className={styles.notFoundTitle}>Incident not found</div>
          <div className={styles.notFoundSub}>INC-{String(id).padStart(4,'0')} does not exist in the incident log.</div>
        </div>
      </div>
    )
  }

  const inc = mapIncident(raw)

  const isOngoing    = inc.resolvedAt === null
  const sevColor     = SEVERITY_COLOR[inc.severity]
  const catLabel     = CATEGORY_LABEL[inc.category] ?? inc.category
  const monIconSvg   = monitorSvgForIncident(inc.monitorKind, inc.target)
  const causeIconSvg = CAUSE_SVG[inc.category] ?? connRefSvg

  const preChecks  = inc.checkLog.filter(c => c.offsetMin < 0)
  const incChecks  = inc.checkLog.filter(c => c.offsetMin >= 0)
  const allChecks  = [...preChecks, ...incChecks]

  function checkRowClass(s: CheckStatus) {
    if (s === 'fail')    return styles.checkTrFail
    if (s === 'timeout') return styles.checkTrTimeout
    if (s === 'degraded')return styles.checkTrDeg
    return ''
  }
  function checkBadgeClass(s: CheckStatus) {
    if (s === 'pass')    return styles.checkPass
    if (s === 'fail')    return styles.checkFail
    if (s === 'timeout') return styles.checkTimeout
    return styles.checkDeg
  }
  function latColor(ms: number | null) {
    if (!ms) return 'var(--color-text-dim)'
    if (ms > 1000) return '#ef4444'
    if (ms > 400)  return '#f97316'
    if (ms > 150)  return '#fbbf24'
    return '#22c55e'
  }

  return (
    <div className={styles.page}>

      {/* Back nav */}
      <button className={styles.backBtn} onClick={() => navigate('/uptime')}>
        <IconArrowLeft /> Monitors
      </button>

      {/* ── Hero ── */}
      <div className={styles.hero}>
        <div className={styles.heroGlow} style={{ background: `linear-gradient(90deg, ${sevColor}80, transparent)` }}/>
        <div className={styles.heroTop}>
          <div className={styles.heroIcon}
            style={{ background: `color-mix(in srgb, ${sevColor} 15%, transparent)`, color: sevColor }}
            dangerouslySetInnerHTML={{ __html: monIconSvg }}
          />
          <div className={styles.heroInfo}>
            <div className={styles.heroRef}>{inc.ref} · {inc.monitorName}</div>
            <div className={styles.heroTitle}>{inc.cause}</div>
            <div className={styles.heroTarget}>{inc.target}</div>
          </div>
        </div>

        <div className={styles.heroBadges}>
          <span className={`${styles.statusBadge} ${isOngoing ? styles.badgeOngoing : styles.badgeResolved}`}>
            {isOngoing ? '● Ongoing' : '✓ Resolved'}
          </span>
          <span className={`${styles.statusBadge} ${inc.severity === 'critical' ? styles.badgeCritical : inc.severity === 'major' ? styles.badgeMajor : styles.badgeMinor}`}>
            {inc.severity.toUpperCase()}
          </span>
          <span className={styles.badgeCat}
            dangerouslySetInnerHTML={{ __html: `<span style="display:inline-flex;align-items:center;gap:5px;width:12px;height:12px;flex-shrink:0">${causeIconSvg}</span>&nbsp;${catLabel}` }}
          />
          {isOngoing && (
            <button
              onClick={() => resolveMut.mutate()}
              disabled={resolveMut.isPending}
              style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid #22c55e', color: '#22c55e', background: 'transparent', cursor: 'pointer' }}
            >
              {resolveMut.isPending ? 'Resolving…' : 'Mark Resolved'}
            </button>
          )}
        </div>

        <div className={styles.heroDuration}>
          <span><IconClock /> Started: <strong>{fmtDate(inc.startedAt)}</strong></span>
          {inc.resolvedAt && <span>Resolved: <strong>{fmtDate(inc.resolvedAt)}</strong></span>}
          <span>Duration: <strong style={{ color: isOngoing ? '#ef4444' : 'var(--color-text)' }}>{fmtDuration(inc.durationMin)}</strong></span>
          <span>Opened: <strong>{timeAgo(inc.startedAt)}</strong></span>
          <span>Responder: <strong style={{ color: 'var(--color-accent)' }}>@{inc.responderName}</strong></span>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className={styles.statsRow}>
        <div className={styles.statCard} style={{ ['--sc' as string]: isOngoing ? '#ef4444' : '#22c55e' }}>
          <div className={styles.statLabel}>Duration</div>
          <div className={styles.statVal} style={{ color: isOngoing ? '#ef4444' : 'var(--color-text)' }}>
            {inc.durationMin !== null ? inc.durationMin : '—'}<span className={styles.statUnit}>{inc.durationMin !== null ? 'm' : ''}</span>
          </div>
          <div className={styles.statSub}>{isOngoing ? 'Still ongoing' : 'Time to resolution'}</div>
        </div>

        <div className={styles.statCard} style={{ ['--sc' as string]: '#4a9eff' }}>
          <div className={styles.statLabel}>MTTD</div>
          <div className={styles.statVal}>
            {inc.mttdSec < 60 ? inc.mttdSec : Math.floor(inc.mttdSec / 60)}
            <span className={styles.statUnit}>{inc.mttdSec < 60 ? 's' : 'm'}</span>
          </div>
          <div className={styles.statSub}>Mean time to detect</div>
        </div>

        <div className={styles.statCard} style={{ ['--sc' as string]: inc.mttrMin ? '#22c55e' : '#94a3b8' }}>
          <div className={styles.statLabel}>MTTR</div>
          <div className={styles.statVal} style={{ color: inc.mttrMin ? 'var(--color-text)' : 'var(--color-text-dim)' }}>
            {inc.mttrMin ?? '—'}<span className={styles.statUnit}>{inc.mttrMin ? 'm' : ''}</span>
          </div>
          <div className={styles.statSub}>Mean time to recover</div>
        </div>

        <div className={styles.statCard} style={{ ['--sc' as string]: '#ef4444' }}>
          <div className={styles.statLabel}>Failed Checks</div>
          <div className={styles.statVal} style={{ color: '#ef4444' }}>
            {inc.failedChecks}
          </div>
          <div className={styles.statSub}>Consecutive failures</div>
        </div>
      </div>

      {/* ── Impact chart (full width) ── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitle}><IconChart /> Response Time Impact</div>
          <div className={styles.sectionSub}>Baseline {inc.latencyBaseline}ms · Peak {inc.latencyPeak > 0 ? `${inc.latencyPeak}ms` : 'N/A (TCP timeout)'}</div>
        </div>
        <div className={styles.chartWrap}>
          <div className={styles.chartLabel}>
            <span>Latency during incident window (ms)</span>
            <span style={{ color: '#ef4444' }}>Red zones = failed checks</span>
          </div>
          <div className={styles.chartArea}>
            <ImpactChart entries={inc.checkLog} baseline={inc.latencyBaseline} peak={inc.latencyPeak}/>
          </div>
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className={styles.twoCol}>

        {/* ── Left column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Timeline */}
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionTitle}><IconTimeline /> Incident Timeline</div>
              <div className={styles.sectionSub}>{inc.timeline.length} events</div>
            </div>
            <div className={styles.timeline}>
              {inc.timeline.map((ev, i) => (
                <div key={i} className={styles.tlRow}>
                  <div className={styles.tlLeft}>
                    <div className={`${styles.tlDot} ${styles[`type_${ev.type}`]}`}/>
                    <div className={styles.tlLine}/>
                  </div>
                  <div className={styles.tlContent}>
                    <div className={`${styles.tlType} ${styles[`type_${ev.type}`]}`}>
                      {TL_TYPE_LABEL[ev.type] ?? ev.type}
                      <span style={{ fontWeight: 400, color: 'var(--color-text-dim)', marginLeft: 8 }}>
                        {fmtOffset(ev.offsetMin)}
                      </span>
                    </div>
                    <div className={styles.tlMsg}>{ev.message}</div>
                    <div className={styles.tlMeta}>
                      <span className={styles.tlActor}>@{ev.actor}</span>
                      <span className={styles.tlTime}>
                        {fmtDate(new Date(inc.startedAt.getTime() + ev.offsetMin * 60_000))}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Root cause */}
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionTitle}><IconRootCause /> Root Cause Analysis</div>
              <div className={styles.sectionSub}>{catLabel}</div>
            </div>
            <div className={styles.prose}>{inc.rootCause || 'Investigation pending.'}</div>
            {inc.logExcerpt && (
              <>
                <div className={styles.sectionHead} style={{ borderTop: '1px solid var(--color-border)', borderBottom: 'none' }}>
                  <div className={styles.sectionTitle}><IconLog /> Log Excerpt</div>
                </div>
                <pre className={styles.logBlock}>{inc.logExcerpt}</pre>
              </>
            )}
          </div>

          {/* Prevention */}
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionTitle}><IconShield /> Prevention &amp; Follow-ups</div>
              <div className={styles.sectionSub}>{inc.prevention.length} action items</div>
            </div>
            {inc.prevention.length > 0 ? (
              <div className={styles.preventList}>
                {inc.prevention.map((p, i) => (
                  <div key={i} className={styles.preventItem}>
                    <span className={styles.preventNum}>{i + 1}</span>
                    {p}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '10px 14px', color: 'var(--color-text-dim)', fontSize: 12 }}>No prevention items recorded yet.</div>
            )}
            {inc.resolution && (
              <>
                <div className={styles.sectionHead} style={{ borderTop: '1px solid var(--color-border)', borderBottom: 'none' }}>
                  <div className={styles.sectionTitle}>Resolution Summary</div>
                </div>
                <div className={styles.prose}>{inc.resolution}</div>
              </>
            )}
          </div>

          {/* Check log */}
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionTitle}><IconLog /> Check Log</div>
              <div className={styles.sectionSub}>{allChecks.length} checks · showing ±window</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className={styles.checkTable}>
                <thead>
                  <tr>
                    {['Offset', 'Time (UTC)', 'Status', 'Latency', 'HTTP', 'Note'].map(h => (
                      <th key={h} className={styles.checkTh}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allChecks.map((c, i) => (
                    <tr key={i} className={`${styles.checkTr} ${checkRowClass(c.status)}`}>
                      <td className={styles.checkTd}>
                        <span style={{
                          fontFamily: 'monospace', fontSize: 11,
                          color: c.offsetMin < 0 ? 'var(--color-text-dim)' : c.offsetMin === 0 ? '#ef4444' : 'var(--color-text-muted)',
                          fontWeight: c.offsetMin === 0 ? 700 : 400,
                        }}>
                          {fmtOffset(c.offsetMin)}
                        </span>
                      </td>
                      <td className={styles.checkTd} style={{ fontFamily: 'monospace', fontSize: 10.5, color: 'var(--color-text-muted)' }}>
                        {fmtDate(new Date(inc.startedAt.getTime() + c.offsetMin * 60_000))}
                      </td>
                      <td className={styles.checkTd}>
                        <span className={`${styles.checkStatus} ${checkBadgeClass(c.status)}`}>
                          {c.status.toUpperCase()}
                        </span>
                      </td>
                      <td className={styles.checkTd} style={{ fontFamily: 'monospace', fontSize: 12, color: latColor(c.latencyMs) }}>
                        {c.latencyMs != null ? `${c.latencyMs}ms` : '—'}
                      </td>
                      <td className={styles.checkTd} style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {c.httpCode != null
                          ? <span style={{ color: c.httpCode < 400 ? '#22c55e' : '#ef4444' }}>{c.httpCode}</span>
                          : <span style={{ color: 'var(--color-text-dim)' }}>—</span>
                        }
                      </td>
                      <td className={styles.checkTd} style={{ fontFamily: 'monospace', fontSize: 10.5, color: 'var(--color-text-dim)' }}>
                        {c.note ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div className={styles.sidebar}>

          {/* Monitor info */}
          <div className={styles.infoCard}>
            <div className={styles.infoCardHead}><IconServer /> Monitor</div>
            <div className={styles.infoRows}>
              <div className={styles.infoRow}><span className={styles.infoKey}>Name</span><span className={styles.infoVal}>{inc.monitorName}</span></div>
              <div className={styles.infoRow}><span className={styles.infoKey}>Kind</span><span className={styles.infoVal}>{inc.monitorKind.toUpperCase()}</span></div>
              <div className={styles.infoRow}><span className={styles.infoKey}>Target</span><span className={styles.infoVal} style={{ fontSize: 10 }}>{inc.target}</span></div>
              <div className={styles.infoRow}><span className={styles.infoKey}>Regions</span>
                <span className={styles.infoVal} style={{ fontSize: 10 }}>
                  {inc.affectedRegions.join(', ')}
                </span>
              </div>
            </div>
          </div>

          {/* Incident metadata */}
          <div className={styles.infoCard}>
            <div className={styles.infoCardHead}>Incident Details</div>
            <div className={styles.infoRows}>
              <div className={styles.infoRow}><span className={styles.infoKey}>Reference</span><span className={styles.infoVal}>{inc.ref}</span></div>
              <div className={styles.infoRow}><span className={styles.infoKey}>Severity</span>
                <span className={styles.infoVal} style={{ color: sevColor, textTransform: 'capitalize' }}>{inc.severity}</span>
              </div>
              <div className={styles.infoRow}><span className={styles.infoKey}>Category</span><span className={styles.infoVal}>{catLabel}</span></div>
              <div className={styles.infoRow}><span className={styles.infoKey}>Error</span>
                <span className={styles.infoVal} style={{ color: '#f87171', fontSize: 10 }}>{inc.errorCode}</span>
              </div>
              <div className={styles.infoRow}><span className={styles.infoKey}>Responder</span>
                <span className={styles.infoVal} style={{ color: 'var(--color-accent)' }}>@{inc.responderName}</span>
              </div>
              <div className={styles.infoRow}><span className={styles.infoKey}>Failed checks</span>
                <span className={styles.infoVal} style={{ color: '#ef4444' }}>{inc.failedChecks}</span>
              </div>
            </div>
          </div>

          {/* Latency summary */}
          <div className={styles.infoCard}>
            <div className={styles.infoCardHead}><IconChart /> Latency Impact</div>
            <div className={styles.infoRows}>
              <div className={styles.infoRow}><span className={styles.infoKey}>Baseline</span>
                <span className={styles.infoVal} style={{ color: '#22c55e' }}>{inc.latencyBaseline}ms</span>
              </div>
              <div className={styles.infoRow}><span className={styles.infoKey}>Peak</span>
                <span className={styles.infoVal} style={{ color: inc.latencyPeak > 0 ? '#ef4444' : 'var(--color-text-dim)' }}>
                  {inc.latencyPeak > 0 ? `${inc.latencyPeak}ms` : 'N/A'}
                </span>
              </div>
              <div className={styles.infoRow}><span className={styles.infoKey}>Degradation</span>
                <span className={styles.infoVal} style={{ color: '#f97316' }}>
                  {inc.latencyPeak > 0 && inc.latencyBaseline > 0 ? `${((inc.latencyPeak / inc.latencyBaseline) * 100 - 100).toFixed(0)}%` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Error detail */}
          {inc.errorDetail && (
            <div className={styles.infoCard}>
              <div className={styles.infoCardHead}>Error Detail</div>
              <div className={styles.prose} style={{ fontSize: 11.5, padding: '10px 13px' }}>
                {inc.errorDetail}
              </div>
            </div>
          )}

          {/* Impact summary */}
          {inc.impactSummary && (
            <div className={styles.infoCard}>
              <div className={styles.infoCardHead}><IconImpact /> Business Impact</div>
              <div className={styles.impactBox}>{inc.impactSummary}</div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
