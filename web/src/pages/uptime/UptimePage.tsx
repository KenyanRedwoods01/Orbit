import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchUptimeMonitors, deleteUptimeMonitor, fetchUptimeIncidents, fetchUptimeStats,
  pingUptimeMonitor,
} from '@/lib/api'
import type { UptimeMonitor, UptimeIncident } from '@/lib/api'
import { MonitorForm } from './MonitorForm'
import { ConfirmDialog } from '@/components/ui'
import { SEVERITY_COLOR } from './incidentData'
import styles from './UptimePage.module.css'

import mailSvg     from '@/assets/incident-icons/mail-server.svg?raw'
import websiteSvg  from '@/assets/incident-icons/website.svg?raw'
import apiSvg      from '@/assets/incident-icons/api.svg?raw'
import stagingSvg  from '@/assets/incident-icons/staging.svg?raw'
import databaseSvg from '@/assets/incident-icons/database.svg?raw'

function monitorSvg(kind: string, target: string): string {
  if (kind === 'icmp') return websiteSvg
  if (target.includes('db') || target.includes('postgres') || target.includes('redis') || target.includes('mysql')) return databaseSvg
  if (target.includes('smtp') || target.includes('mail') || target.includes('587') || target.includes('25')) return mailSvg
  if (target.includes('staging') || target.includes('stage')) return stagingSvg
  if (kind === 'tcp') return apiSvg
  return websiteSvg
}

type DayStatus = 'up' | 'down' | 'degraded' | 'nodata'

function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}
function fmtDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── SVG icons ─────────────────────────────────────────────────
function IconActivity() { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><polyline points="2,12 6,7 9,10 13,5 18,9"/></svg> }
function IconPlus()     { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width="13" height="13"><line x1="10" y1="3" x2="10" y2="17"/><line x1="3" y1="10" x2="17" y2="10"/></svg> }
function IconTrash()    { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><polyline points="4,6 16,6"/><path d="M8 6V4h4v2"/><rect x="5" y="6" width="10" height="11" rx="1"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="12" y1="10" x2="12" y2="14"/></svg> }
function IconGlobe()    { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><circle cx="10" cy="10" r="8"/><line x1="2" y1="10" x2="18" y2="10"/><path d="M10 2a12 12 0 0 1 3 8 12 12 0 0 1-3 8 12 12 0 0 1-3-8 12 12 0 0 1 3-8z"/></svg> }
function IconPlug()     { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><line x1="12" y1="2" x2="12" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><rect x="5" y="6" width="10" height="6" rx="1"/><path d="M10 12v6"/></svg> }
function IconWifi()     { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><path d="M2 8a11 11 0 0 1 16 0M5.5 11.5a7 7 0 0 1 9 0M9 15a2 2 0 0 1 2 0"/><circle cx="10" cy="17" r="0.8" fill="currentColor" stroke="none"/></svg> }
function IconShield()   { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><path d="M10 2C6 4 3 4 3 4s0 6 1.5 9C5.7 15.8 8 17.5 10 18c2-.5 4.3-2.2 5.5-5C17 10 17 4 17 4s-3 0-7-2z"/><polyline points="7,10 9,12 13,8"/></svg> }
function IconClock()    { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="11" height="11"><circle cx="10" cy="10" r="8"/><polyline points="10,6 10,10 13,12"/></svg> }
function IconAlert()    { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M10 3L18 17H2z"/><line x1="10" y1="9" x2="10" y2="13"/><circle cx="10" cy="15.5" r="0.6" fill="currentColor" stroke="none"/></svg> }
function IconCheck()    { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="4,10 8,14 16,6"/></svg> }
function IconRefresh()  { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M4 12a6 6 0 1 0 1-5.2"/><polyline points="1,6 4,9 7,6"/></svg> }
function IconDot()      { return <svg viewBox="0 0 8 8" width="8" height="8" fill="currentColor"><circle cx="4" cy="4" r="3.5"/></svg> }
const KIND_ICON: Record<string, React.ReactNode> = {
  http: <IconGlobe />,
  tcp:  <IconPlug />,
  icmp: <IconWifi />,
}
const KIND_LABEL: Record<string, string> = { http: 'HTTP', tcp: 'TCP', icmp: 'ICMP' }

// ── Sparkline ─────────────────────────────────────────────────
function Sparkline({ pts, color, w = 80, h = 24 }: { pts: number[]; color: string; w?: number; h?: number }) {
  const nonZero = pts.filter(p => p > 0)
  if (nonZero.length < 2) return null
  const max = Math.max(...nonZero, 0.1)
  const coords = pts.map((v, i) =>
    `${((i / (pts.length - 1)) * w).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`
  ).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id={`sg${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon
        points={`0,${h} ${coords} ${w},${h}`}
        fill={`url(#sg${color.replace('#','')})`}
      />
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── 90-day uptime bar ─────────────────────────────────────────
function UptimeBar({ history }: { history: DayStatus[] }) {
  const COLOR: Record<DayStatus, string> = {
    up:       '#22c55e',
    down:     '#ef4444',
    degraded: '#f97316',
    nodata:   'var(--color-border)',
  }
  const TIP: Record<DayStatus, string> = {
    up: 'Operational', down: 'Outage', degraded: 'Degraded', nodata: 'No data',
  }
  return (
    <div className={styles.barWrap}>
      <div className={styles.barTicks}>
        {history.map((s, i) => (
          <div
            key={i}
            className={styles.barTick}
            style={{ background: COLOR[s] }}
            title={`${TIP[s]} — ${history.length - i - 1}d ago`}
          />
        ))}
      </div>
      <div className={styles.barLabels}>
        <span>90d ago</span>
        <span>45d ago</span>
        <span>Today</span>
      </div>
    </div>
  )
}

// ── Latency color ─────────────────────────────────────────────
function latColor(ms: number) {
  if (ms > 1000) return '#ef4444'
  if (ms > 500)  return '#f97316'
  if (ms > 200)  return '#fbbf24'
  return '#22c55e'
}

function pctColor(p: number) {
  return p >= 99.9 ? '#22c55e' : p >= 99 ? '#4a9eff' : p >= 95 ? '#f97316' : '#ef4444'
}

// ── Monitor card ──────────────────────────────────────────────
function MonitorCard({ m, onDelete }: { m: UptimeMonitor; onDelete: () => void }) {
  const [confirmDel, setConfirmDel] = useState(false)
  const qc = useQueryClient()

  const history  = (m.history_90d ?? []) as DayStatus[]
  const latPts   = m.sparkline_24h ?? []
  const sslDays  = m.kind === 'http' ? m.ssl_days_left : undefined
  const httpCode = m.kind === 'http' ? m.http_code : undefined
  const isUp     = m.status === 'up'
  const isDown   = m.status === 'down'

  const p24 = m.sla_24h ?? 100
  const p7  = m.sla_7d  ?? 100
  const p30 = m.sla_30d ?? 100
  const p90 = m.sla_90d ?? 100

  useMutation({
    mutationFn: () => pingUptimeMonitor(m.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['uptime-monitors'] }),
  })

  const lastChecked = m.last_check_at
    ? timeAgo(new Date(m.last_check_at * 1000))
    : 'Never'

  return (
    <>
      <div className={`${styles.card} ${isDown ? styles.cardDown : ''}`}>
        {/* Card header */}
        <div className={styles.cardHead}>
          <div className={styles.cardHeadLeft}>
            <div className={`${styles.statusDot} ${isUp ? styles.dotUp : isDown ? styles.dotDown : styles.dotUnknown}`}>
              {isUp && <div className={styles.statusRing}/>}
            </div>
            <div>
              <div className={styles.cardName}>{m.name}</div>
              <div className={styles.cardTarget}>{m.target}</div>
            </div>
          </div>
          <div className={styles.cardHeadRight}>
            <span className={`${styles.kindBadge} ${styles[`kind_${m.kind}`]}`}>
              {KIND_ICON[m.kind]} {KIND_LABEL[m.kind]}
            </span>
            <span className={`${styles.statusBadge} ${isUp ? styles.badgeUp : isDown ? styles.badgeDown : styles.badgeUnknown}`}>
              {isUp ? <><IconCheck /> Up</> : isDown ? <><IconAlert /> Down</> : <><IconDot /> Unknown</>}
            </span>
            <button className={styles.deleteBtn} onClick={() => setConfirmDel(true)} title="Delete monitor"><IconTrash /></button>
          </div>
        </div>

        {/* Metrics row */}
        <div className={styles.metricsRow}>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Latency</span>
            <span className={styles.metricVal} style={{ color: m.latency_ms > 0 ? latColor(m.latency_ms) : 'var(--color-text-dim)' }}>
              {m.latency_ms > 0 ? `${m.latency_ms.toFixed(0)} ms` : '—'}
            </span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Interval</span>
            <span className={styles.metricVal}>Every {m.interval_s >= 60 ? `${m.interval_s/60}m` : `${m.interval_s}s`}</span>
          </div>
          {httpCode !== undefined && (
            <div className={styles.metricItem}>
              <span className={styles.metricLabel}>HTTP</span>
              <span className={styles.metricVal} style={{ color: httpCode < 400 ? '#22c55e' : '#ef4444' }}>{httpCode}</span>
            </div>
          )}
          {sslDays !== undefined && (
            <div className={styles.metricItem}>
              <span className={styles.metricLabel}>SSL</span>
              <span className={styles.metricVal} style={{ color: sslDays < 30 ? '#f97316' : '#22c55e' }}>
                <IconShield /> {sslDays}d
              </span>
            </div>
          )}
          <div className={styles.metricItem} style={{ marginLeft: 'auto' }}>
            <span className={styles.metricLabel}><IconClock /> Checked</span>
            <span className={styles.metricVal}>{lastChecked}</span>
          </div>
        </div>

        {/* Sparkline row */}
        {m.latency_ms > 0 && latPts.some(p => p > 0) && (
          <div className={styles.sparkRow}>
            <div className={styles.sparkLabel}>Response time (24h)</div>
            <Sparkline pts={latPts} color={latColor(m.latency_ms)} w={180} h={28} />
          </div>
        )}

        {/* 90-day bar */}
        <div className={styles.barSection}>
          <div className={styles.barSectionTitle}>90-day uptime</div>
          <UptimeBar history={history.length === 90 ? history : [...Array(90 - history.length).fill('nodata'), ...history] as DayStatus[]} />
        </div>

        {/* SLA row */}
        <div className={styles.slaRow}>
          {([['24h', p24], ['7d', p7], ['30d', p30], ['90d', p90]] as [string, number][]).map(([label, pct]) => (
            <div key={label} className={styles.slaItem}>
              <span className={styles.slaLabel}>{label}</span>
              <span className={styles.slaVal} style={{ color: pctColor(pct) }}>{pct.toFixed(2)}%</span>
            </div>
          ))}
          <div className={styles.slaItem} style={{ marginLeft: 'auto' }}>
            <span className={styles.slaLabel}>Checks</span>
            <span className={styles.slaVal}>{(90 * 86400 / m.interval_s).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={onDelete}
        title="Delete Monitor"
        message={`Remove the monitor for "${m.name}"? Historical uptime data will also be deleted.`}
        confirmLabel="Delete"
        isLoading={false}
      />
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function UptimePage() {
  const [addOpen, setAddOpen] = useState(false)
  const [view,    setView]    = useState<'cards' | 'table'>('cards')
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data: monitors = [], isLoading } = useQuery({
    queryKey: ['uptime-monitors'],
    queryFn: fetchUptimeMonitors,
    refetchInterval: 30_000,
    retry: false,
  })

  const { data: stats } = useQuery({
    queryKey: ['uptime-stats'],
    queryFn: fetchUptimeStats,
    refetchInterval: 30_000,
    retry: false,
  })

  const { data: incidents = [] } = useQuery({
    queryKey: ['uptime-incidents'],
    queryFn: fetchUptimeIncidents,
    refetchInterval: 30_000,
    retry: false,
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteUptimeMonitor(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['uptime-monitors'] }),
  })

  const upCount    = stats?.up_count    ?? monitors.filter(m => m.status === 'up').length
  const downCount  = stats?.down_count  ?? monitors.filter(m => m.status === 'down').length
  const avgLat     = stats?.avg_latency_ms ?? (
    monitors.filter(m => m.latency_ms > 0).reduce((s, m) => s + m.latency_ms, 0) /
    (monitors.filter(m => m.latency_ms > 0).length || 1)
  )
  const overallPct = stats?.overall_sla ?? (
    monitors.reduce((s, m) => s + (m.sla_30d ?? 100), 0) / (monitors.length || 1)
  )
  const allUp      = downCount === 0

  const activeIncidents = incidents.filter((i: UptimeIncident) => i.resolved_at === null)

  return (
    <div className={styles.page}>

      {/* ── Page header ── */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.pageTitle}>
            <IconActivity />
            Uptime Monitors
          </div>
          <span className={styles.countBadge}>{monitors.length} monitors</span>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.viewToggle}>
            <button className={`${styles.viewBtn} ${view === 'cards' ? styles.viewBtnActive : ''}`}
              onClick={() => setView('cards')}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="12" height="12"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
              Cards
            </button>
            <button className={`${styles.viewBtn} ${view === 'table' ? styles.viewBtnActive : ''}`}
              onClick={() => setView('table')}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="12" height="12"><line x1="1" y1="4" x2="15" y2="4"/><line x1="1" y1="8" x2="15" y2="8"/><line x1="1" y1="12" x2="15" y2="12"/></svg>
              Table
            </button>
          </div>
          <button className={styles.addBtn} onClick={() => setAddOpen(true)}>
            <IconPlus /> Add Monitor
          </button>
        </div>
      </div>

      {/* ── System status banner ── */}
      <div className={`${styles.banner} ${allUp ? styles.bannerUp : styles.bannerDown}`}>
        <div className={styles.bannerIcon}>
          {allUp ? <IconCheck /> : <IconAlert />}
        </div>
        <div className={styles.bannerText}>
          <div className={styles.bannerTitle}>
            {allUp ? 'All Systems Operational' : `${downCount} Service${downCount > 1 ? 's' : ''} Disrupted`}
          </div>
          <div className={styles.bannerSub}>
            {allUp
              ? `${monitors.length} monitors · Last checked just now · ${overallPct.toFixed(3)}% avg uptime`
              : `${downCount} monitor${downCount > 1 ? 's are' : ' is'} currently reporting outages — ${upCount} of ${monitors.length} operational`
            }
          </div>
        </div>
        <div className={styles.bannerRefresh}>
          <IconRefresh /> Refreshes every 30s
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className={styles.statsRow}>
        <div className={styles.statCard} style={{ ['--sc' as string]: '#4a9eff' }}>
          <div className={styles.statTop}>
            <span className={styles.statLabel}>Overall SLA</span>
            <svg viewBox="0 0 20 20" fill="none" stroke="#4a9eff" strokeWidth="1.5" width="14" height="14" opacity="0.6"><path d="M10 2C6 4 3 4 3 4s0 6 1.5 9C5.7 15.8 8 17.5 10 18c2-.5 4.3-2.2 5.5-5C17 10 17 4 17 4s-3 0-7-2z"/></svg>
          </div>
          <div className={styles.statVal}>{overallPct.toFixed(3)}<span className={styles.statUnit}>%</span></div>
          <div className={styles.statBar}><div className={styles.statBarFill} style={{ width: `${overallPct}%`, background: overallPct > 99.9 ? '#22c55e' : '#f97316' }}/></div>
          <div className={styles.statSub}>30-day rolling average</div>
        </div>

        <div className={styles.statCard} style={{ ['--sc' as string]: '#22c55e' }}>
          <div className={styles.statTop}>
            <span className={styles.statLabel}>Services</span>
            <svg viewBox="0 0 20 20" fill="none" stroke="#22c55e" strokeWidth="1.5" width="14" height="14" opacity="0.6"><circle cx="10" cy="10" r="8"/><polyline points="7,10 9.5,12.5 14,7.5"/></svg>
          </div>
          <div className={styles.statVal}>{upCount}<span className={styles.statUnit}>/{monitors.length}</span></div>
          <div className={styles.statSub} style={{ color: downCount > 0 ? '#ef4444' : 'var(--color-text-dim)' }}>
            {downCount > 0 ? `${downCount} down` : 'All operational'}
          </div>
          <div className={styles.statusDots}>
            {monitors.map(m => (
              <span key={m.id} className={`${styles.miniDot} ${m.status === 'up' ? styles.miniDotUp : m.status === 'down' ? styles.miniDotDown : styles.miniDotUnk}`} title={m.name}/>
            ))}
          </div>
        </div>

        <div className={styles.statCard} style={{ ['--sc' as string]: '#fbbf24' }}>
          <div className={styles.statTop}>
            <span className={styles.statLabel}>Avg Latency</span>
            <svg viewBox="0 0 20 20" fill="none" stroke="#fbbf24" strokeWidth="1.5" width="14" height="14" opacity="0.6"><circle cx="10" cy="10" r="8"/><polyline points="10,6 10,10 13,12"/></svg>
          </div>
          <div className={styles.statVal}>{avgLat.toFixed(0)}<span className={styles.statUnit}>ms</span></div>
          <div className={styles.statSub} style={{ color: latColor(avgLat) }}>{avgLat < 200 ? 'Excellent' : avgLat < 500 ? 'Good' : 'High'}</div>
          <Sparkline pts={monitors.filter(m => m.latency_ms > 0).map(m => m.latency_ms)} color="#fbbf24" w={80} h={18} />
        </div>

        <div className={styles.statCard} style={{ ['--sc' as string]: activeIncidents.length ? '#ef4444' : '#22c55e' }}>
          <div className={styles.statTop}>
            <span className={styles.statLabel}>Active Incidents</span>
            <svg viewBox="0 0 20 20" fill="none" stroke={activeIncidents.length ? '#ef4444' : '#22c55e'} strokeWidth="1.5" width="14" height="14" opacity="0.6"><path d="M10 3L18 17H2z"/><line x1="10" y1="9" x2="10" y2="12"/><circle cx="10" cy="15" r="0.5" fill="currentColor"/></svg>
          </div>
          <div className={styles.statVal} style={{ color: activeIncidents.length ? '#ef4444' : '#22c55e' }}>
            {activeIncidents.length}
          </div>
          <div className={styles.statSub}>{stats?.total_incident_90d ?? incidents.length} total in 90d</div>
          {stats?.mttr_avg_min ? <div className={styles.statSub}>MTTR avg {stats.mttr_avg_min.toFixed(0)}m</div> : null}
        </div>
      </div>

      {/* ── Cards view ── */}
      {view === 'cards' && (
        <div className={styles.cardsGrid}>
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => <div key={i} className={`${styles.card} ${styles.cardSkeleton}`}/>)
            : monitors.map(m => (
                <MonitorCard key={m.id} m={m} onDelete={() => deleteMut.mutate(m.id)} />
              ))
          }
        </div>
      )}

      {/* ── Table view ── */}
      {view === 'table' && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {['Monitor', 'Type', 'Status', 'Latency', 'Uptime 30d', 'Uptime 90d', 'SSL', 'Interval', ''].map(h => (
                  <th key={h} className={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monitors.map(m => {
                const p30  = m.sla_30d ?? 100
                const p90  = m.sla_90d ?? 100
                const ssl  = m.kind === 'http' ? m.ssl_days_left : undefined
                const isUp = m.status === 'up'
                const isDn = m.status === 'down'
                return (
                  <tr key={m.id} className={styles.tr}>
                    <td className={styles.td}>
                      <div className={styles.procNameCell}>
                        <div className={`${styles.tableDot} ${isUp ? styles.dotUp : isDn ? styles.dotDown : styles.dotUnknown}`}/>
                        <div>
                          <div className={styles.monName}>{m.name}</div>
                          <div className={styles.monTarget}>{m.target}</div>
                        </div>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <span className={`${styles.kindBadge} ${styles[`kind_${m.kind}`]}`}>
                        {KIND_ICON[m.kind]} {KIND_LABEL[m.kind]}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <span className={`${styles.statusBadge} ${isUp ? styles.badgeUp : isDn ? styles.badgeDown : styles.badgeUnknown}`}>
                        {isUp ? 'Up' : isDn ? 'Down' : 'Unknown'}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: m.latency_ms > 0 ? latColor(m.latency_ms) : 'var(--color-text-dim)' }}>
                        {m.latency_ms > 0 ? `${m.latency_ms}ms` : '—'}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: pctColor(p30) }}>{p30.toFixed(2)}%</span>
                    </td>
                    <td className={styles.td}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: pctColor(p90) }}>{p90.toFixed(2)}%</span>
                    </td>
                    <td className={styles.td}>
                      {ssl !== undefined ? (
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: ssl < 30 ? '#f97316' : '#22c55e' }}>
                          {ssl < 30 ? '!' : ''} {ssl}d
                        </span>
                      ) : <span style={{ color: 'var(--color-text-dim)', fontSize: 12 }}>n/a</span>}
                    </td>
                    <td className={styles.td} style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
                      {m.interval_s >= 60 ? `${m.interval_s/60}m` : `${m.interval_s}s`}
                    </td>
                    <td className={styles.td}>
                      <button className={styles.deleteBtn} onClick={() => deleteMut.mutate(m.id)}><IconTrash /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Incident log ── */}
      <div className={styles.incidentsSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}><IconAlert /> Incident Log</span>
          <span className={styles.sectionSub}>{stats?.total_incident_90d ?? incidents.length} events in the last 90 days</span>
        </div>
        <div className={styles.incidentList}>
          {incidents.length === 0 && (
            <div style={{ padding: '20px', color: 'var(--color-text-dim)', textAlign: 'center', fontSize: 13 }}>
              No incidents in the last 90 days
            </div>
          )}
          {incidents.map((inc: UptimeIncident) => (
            <div
              key={inc.id}
              className={`${styles.incidentRow} ${!inc.resolved_at ? styles.incidentActive : ''} ${styles.incidentRowClickable}`}
              onClick={() => navigate(`/uptime/incidents/${inc.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && navigate(`/uptime/incidents/${inc.id}`)}
            >
              <div className={styles.incidentLeft}>
                <div className={`${styles.incidentDot} ${!inc.resolved_at ? styles.incidentDotActive : styles.incidentDotResolved}`}/>
                <div
                  className={styles.incidentIconWrap}
                  style={{ color: SEVERITY_COLOR[inc.severity] }}
                  dangerouslySetInnerHTML={{ __html: monitorSvg(inc.monitor_kind, inc.target) }}
                />
                <div>
                  <div className={styles.incidentName}>
                    {inc.monitor_name}
                    <span className={styles.incidentRef}>{inc.ref}</span>
                  </div>
                  <div className={styles.incidentCause}>{inc.cause}</div>
                </div>
              </div>
              <div className={styles.incidentRight}>
                <div className={styles.incidentTime}>{fmtDate(new Date(inc.started_at * 1000))}</div>
                {inc.resolved_at ? (
                  <div className={styles.incidentDuration}>Resolved · {inc.duration_min}m downtime</div>
                ) : (
                  <div className={styles.incidentOngoing}>Ongoing · {timeAgo(new Date(inc.started_at * 1000))}</div>
                )}
                <div className={styles.incidentArrow}>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><polyline points="8,4 14,10 8,16"/></svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <MonitorForm open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
