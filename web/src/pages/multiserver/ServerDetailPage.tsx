import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getManagedServer } from '@/lib/api'
import { XtermTerminal } from '@/components/XtermTerminal'
import styles from './ServerDetailPage.module.css'

const IcoBack     = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="10,3 5,8 10,13"/></svg>
const IcoServer   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><rect x="2" y="3" width="16" height="5" rx="1.5"/><rect x="2" y="12" width="16" height="5" rx="1.5"/><circle cx="6" cy="5.5" r=".8" fill="currentColor" stroke="none"/><circle cx="6" cy="14.5" r=".8" fill="currentColor" stroke="none"/></svg>
const IcoTerminal = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><rect x="1" y="2" width="14" height="12" rx="2"/><polyline points="4,6 7,9 4,12"/><line x1="9" y1="12" x2="13" y2="12"/></svg>
const IcoRefresh  = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M13.5 8A5.5 5.5 0 1 1 8 2.5a5.5 5.5 0 0 1 3.9 1.6L13.5 6"/><path d="M13.5 2v4h-4"/></svg>
const IcoCopy     = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><rect x="5" y="5" width="8" height="8" rx="1"/><path d="M3 11V3a1 1 0 0 1 1-1h8"/></svg>
const IcoTag      = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="11" height="11"><path d="M8.5 2H4a1 1 0 0 0-1 1v4.5l6 6a1.5 1.5 0 0 0 2.1 0l3.4-3.4a1.5 1.5 0 0 0 0-2.1z"/><circle cx="6" cy="6" r="1" fill="currentColor" stroke="none"/></svg>
const IcoCheck    = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><polyline points="3,8 6,11 13,4"/></svg>
const IcoPlay     = () => <svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11"><polygon points="4,2 13,8 4,14"/></svg>
const IcoStop     = () => <svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11"><rect x="3" y="3" width="10" height="10" rx="1.5"/></svg>

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

type Tab = 'overview' | 'services' | 'alerts' | 'terminal'

function MiniBar({ value, color }: { value: number; color?: string }) {
  return (
    <div style={{ height: 4, background: 'var(--color-border)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(value, 100)}%`, background: color ?? metricColor(value), transition: 'width .5s', borderRadius: 4 }} />
    </div>
  )
}

export default function ServerDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab]   = useState<Tab>('overview')
  const [copied, setCopied] = useState(false)

  const numericId = id ? parseInt(id, 10) : NaN

  const { data: server, isLoading, error } = useQuery({
    queryKey: ['server', numericId],
    queryFn: () => getManagedServer(numericId),
    enabled: !isNaN(numericId),
    staleTime: 30_000,
    retry: false,
  })

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.backLink} onClick={() => navigate('/servers')}><IcoBack /> Servers</div>
        <div style={{ textAlign:'center', padding:'60px 0', color:'var(--color-text-dim)' }}>Loading server...</div>
      </div>
    )
  }

  if (error || !server) {
    return (
      <div className={styles.page}>
        <div className={styles.backLink} onClick={() => navigate('/servers')}><IcoBack /> Servers</div>
        <div style={{ textAlign:'center', padding:'60px 0', color:'var(--color-text-dim)' }}>Server not found.</div>
      </div>
    )
  }

  const rc          = ROLE_COLOR[server.role] ?? ROLE_COLOR.web
  const statusColor = STATUS_COLOR[server.status] ?? 'var(--color-text-dim)'
  const m           = server.metrics

  function copyHost() {
    navigator.clipboard.writeText(`${server!.user}@${server!.host}`).catch(() => {})
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const serviceColor = (s: string) =>
    s === 'active' ? 'var(--color-success)' : s === 'failed' ? 'var(--color-danger)' : 'var(--color-text-dim)'

  const alertSevStyle = (sev: string) =>
    sev === 'critical'
      ? { background:'rgba(255,77,77,0.15)', color:'#ff4d4d' }
      : sev === 'warning'
        ? { background:'rgba(255,140,0,0.15)', color:'#ff8c00' }
        : { background:'rgba(104,211,145,0.12)', color:'#68d391' }

  return (
    <div className={styles.page}>
      <div className={styles.backLink} onClick={() => navigate('/servers')}><IcoBack /> Servers</div>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.serverIcon} style={{ background: rc.bg, borderColor: rc.color + '40', color: rc.color }}>
            <IcoServer />
          </div>
          <div>
            <div className={styles.serverName}>{server.name}</div>
            <div className={styles.serverHost}>
              <span style={{ fontFamily:'monospace', fontSize:12, color:'var(--color-text-muted)' }}>
                {server.user}@{server.host}:{server.port}
              </span>
              <button className={styles.copyBtn} onClick={copyHost} title="Copy host">
                {copied ? <IcoCheck /> : <IcoCopy />}
              </button>
            </div>
            <div className={styles.headerBadges}>
              <span className={styles.roleBadge} style={{ background:rc.bg, color:rc.color }}>{server.role}</span>
              <span className={styles.envBadge}>{server.environment}</span>
              <span className={styles.envBadge}>{server.region}</span>
              <span className={styles.envBadge}>{server.os}</span>
              {server.tags.slice(0,3).map(t => (
                <span key={t} className={styles.envBadge} style={{ display:'flex', alignItems:'center', gap:3 }}>
                  <IcoTag />{t}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.statusRow}>
            <span className={styles.statusDot} style={{ background: statusColor }} />
            <span className={styles.statusLabel} style={{ color: statusColor }}>{server.status}</span>
          </div>
          {server.latency_ms !== undefined && (
            <span className={styles.latencyBadge} style={{ color: server.latency_ms > 100 ? 'var(--color-warning)' : 'var(--color-success)' }}>
              {server.latency_ms} ms
            </span>
          )}
          <div style={{ display:'flex', gap:6 }}>
            <button className={styles.actionBtn} onClick={() => setTab('terminal')}><IcoTerminal />Terminal</button>
            <button className={styles.actionBtn} onClick={() => window.location.reload()}><IcoRefresh />Refresh</button>
          </div>
        </div>
      </div>

      {/* ── Metrics row ── */}
      {m ? (
        <div className={styles.metricsRow}>
          {[
            { label:'CPU',    value: m.cpu_pct,  display: `${m.cpu_pct.toFixed(2)}%`,       color: metricColor(m.cpu_pct),  extra: `Load avg ${m.load_avg.toFixed(2)}` },
            { label:'Memory', value: m.mem_pct,  display: `${m.mem_pct.toFixed(2)}%`,       color: metricColor(m.mem_pct),  extra: `${m.mem_used_gb.toFixed(2)} / ${m.mem_total_gb.toFixed(2)} GB` },
            { label:'Disk',   value: m.disk_pct, display: `${m.disk_pct.toFixed(2)}%`,      color: metricColor(m.disk_pct), extra: `${m.disk_used_gb.toFixed(2)} / ${m.disk_total_gb.toFixed(2)} GB` },
            { label:'Net In', value: 0,          display: `${m.net_in_mbps.toFixed(2)} mbps`,  color: '#63b3ed', extra: 'inbound throughput', noBar: true },
            { label:'Net Out',value: 0,          display: `${m.net_out_mbps.toFixed(2)} mbps`, color: '#63b3ed', extra: 'outbound throughput', noBar: true },
          ].map(({ label, value, display, color, extra, noBar }) => (
            <div key={label} className={styles.metricCard}>
              <div className={styles.metricLabel}>{label}</div>
              <div className={styles.metricValue} style={{ color }}>{display}</div>
              <div className={styles.metricExtra}>{extra}</div>
              {!noBar
                ? <div className={styles.metricBarWrap}><MiniBar value={value} color={color} /></div>
                : <div />}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.card} style={{ padding:'12px 16px', color:'var(--color-text-dim)', fontSize:12, textAlign:'center' }}>
          {server.status === 'disconnected' ? 'Server is offline — metrics unavailable.' : 'Connecting to server…'}
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className={styles.tabBar}>
        {([
          { id:'overview', label:'Overview' },
          { id:'services', label:`Services (${server.services.length})` },
          { id:'alerts',   label:'Alerts', badge: server.alerts.filter(a=>a.severity!=='resolved').length },
          { id:'terminal', label:'Terminal' },
        ] as { id:Tab; label:string; badge?:number }[]).map(t => (
          <button key={t.id} className={`${styles.tab} ${tab===t.id?styles.tabActive:''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.badge !== undefined && t.badge > 0 && <span className={styles.alertBadge}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className={styles.overviewGrid}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Server Info</div>
            <div className={styles.infoGrid}>
              {[
                ['Hostname',    server.name],
                ['Host',        `${server.host}:${server.port}`],
                ['User',        server.user],
                ['Key file',    server.key_file || '—'],
                ['OS',          server.os || '—'],
                ['Kernel',      server.kernel || '—'],
                ['Uptime',      server.uptime || '—'],
                ['Environment', server.environment],
                ['Region',      server.region],
                ['Role',        server.role],
                ['Last seen',   server.last_seen || '—'],
              ].map(([k,v]) => (
                <React.Fragment key={k}>
                  <span className={styles.infoKey}>{k}</span>
                  <span className={styles.infoVal}>{v}</span>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>Tags</div>
              {server.tags.length === 0
                ? <div style={{ fontSize:12, color:'var(--color-text-dim)' }}>No tags assigned.</div>
                : <div className={styles.tagList}>
                    {server.tags.map(t => (
                      <span key={t} className={styles.tag}><IcoTag />{t}</span>
                    ))}
                  </div>
              }
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>Description</div>
              <p style={{ fontSize:12, color:'var(--color-text-muted)', lineHeight:1.6, margin:0 }}>
                {server.description || 'No description provided.'}
              </p>
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>Quick Services</div>
              <div className={styles.svcList}>
                {server.services.slice(0,5).map(s => (
                  <div key={s.name} className={styles.svcRow}>
                    <span className={styles.svcDot} style={{ background: serviceColor(s.status) }} />
                    <span className={styles.svcName}>{s.name}</span>
                    <span className={styles.svcStatus} style={{ color: serviceColor(s.status) }}>{s.status}</span>
                  </div>
                ))}
                {server.services.length > 5 && (
                  <button className={styles.showMoreBtn} onClick={() => setTab('services')}>
                    +{server.services.length - 5} more — view all
                  </button>
                )}
                {server.services.length === 0 && (
                  <div style={{ fontSize:12, color:'var(--color-text-dim)' }}>No service data available.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Services ── */}
      {tab === 'services' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Services ({server.services.length})</div>
          {server.services.length === 0 ? (
            <div style={{ fontSize:12, color:'var(--color-text-dim)', padding:'8px 0' }}>No service data available for this server.</div>
          ) : (
            <div className={styles.serviceTable}>
              <div className={styles.serviceTableHead}>
                <span>Service</span>
                <span>Status</span>
                <span>Action</span>
              </div>
              {server.services.map(svc => (
                <div key={svc.name} className={styles.serviceTableRow}>
                  <span style={{ fontFamily:'monospace', fontSize:12, color:'var(--color-text-muted)' }}>{svc.name}</span>
                  <span style={{ display:'flex', alignItems:'center', gap:6, fontSize:11.5 }}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background: serviceColor(svc.status), display:'inline-block' }} />
                    <span style={{ color: serviceColor(svc.status), fontWeight:600, textTransform:'capitalize' }}>{svc.status}</span>
                  </span>
                  <span style={{ display:'flex', gap:4 }}>
                    {svc.status !== 'active'
                      ? <button className={styles.svcActionBtn}><IcoPlay /></button>
                      : <button className={styles.svcActionBtn}><IcoStop /></button>
                    }
                    <button className={styles.svcActionBtn}><IcoRefresh /></button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Alerts ── */}
      {tab === 'alerts' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Alerts ({server.alerts.length})</div>
          {server.alerts.length === 0
            ? <div style={{ fontSize:12, color:'var(--color-text-dim)', padding:'8px 0' }}>No alerts for this server.</div>
            : <div className={styles.alertList}>
                {server.alerts.map(a => (
                  <div key={a.id} className={styles.alertRow}>
                    <div className={styles.alertIcon}>
                      <span className={styles.alertSev} style={alertSevStyle(a.severity)}>
                        {a.severity === 'resolved' ? 'OK' : a.severity.slice(0,4).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className={styles.alertMsg}>{a.message}</div>
                      <div className={styles.alertTime}>{a.time}</div>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* ── Terminal ── */}
      {tab === 'terminal' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            <IcoTerminal /> SSH Terminal
          </div>
          <XtermTerminal height={480} />
        </div>
      )}
    </div>
  )
}
