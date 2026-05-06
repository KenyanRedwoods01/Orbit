import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { startService, stopService, restartService } from '@/lib/api'
import type { Service } from '@/lib/api'
import { Spinner } from '@/components/ui'
import styles from './ServicesPage.module.css'
import type { ExtService } from './servicesData'

// ── Icons ──
const IcoX       = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
const IcoInfo    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8"/><line x1="10" y1="9" x2="10" y2="14"/><circle cx="10" cy="6.5" r="0.6" fill="currentColor" stroke="none"/></svg>
const IcoLogs    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="14" height="14" rx="2"/><line x1="7" y1="8"  x2="13" y2="8"/><line x1="7" y1="11" x2="13" y2="11"/><line x1="7" y1="14" x2="11" y2="14"/></svg>
const IcoDeps    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="4"  r="2"/><circle cx="4"  cy="16" r="2"/><circle cx="16" cy="16" r="2"/><line x1="10" y1="6" x2="10" y2="10"/><line x1="10" y1="10" x2="4"  y2="14"/><line x1="10" y1="10" x2="16" y2="14"/></svg>
const IcoShield  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2L4 5v5c0 4 3 7 6 8 3-1 6-4 6-8V5z"/></svg>
const IcoFile    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8z"/><polyline points="12,2 12,8 18,8"/></svg>
const IcoPlay    = () => <svg viewBox="0 0 20 20" fill="currentColor"><polygon points="5,3 19,10 5,17"/></svg>
const IcoStop    = () => <svg viewBox="0 0 20 20" fill="currentColor"><rect x="3" y="3" width="14" height="14" rx="2"/></svg>
const IcoRestart = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10a6 6 0 1 1 1.5 4"/><polyline points="4,14 4,10 8,10"/></svg>
const IcoReload  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M17 10a7 7 0 0 1-7 7 7 7 0 0 1-5-2"/><polyline points="2,10 3,15 8,14"/></svg>
const IcoCheck   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,10 8,14 16,6"/></svg>
const IcoFail    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
const IcoWarning = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10 3L18 17H2z"/><line x1="10" y1="9" x2="10" y2="12"/><circle cx="10" cy="15" r="0.6" fill="currentColor" stroke="none"/></svg>
const IcoCpu     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="12" height="12" rx="1.5"/><rect x="7" y="7" width="6" height="6" rx="0.5"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="10" y1="16" x2="10" y2="19"/><line x1="1" y1="10" x2="4" y2="10"/><line x1="16" y1="10" x2="19" y2="10"/></svg>
const IcoChain   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12l-4-4a4 4 0 0 1 5.66-5.66l4 4"/><path d="M12 8l4 4a4 4 0 0 1-5.66 5.66l-4-4"/><line x1="8" y1="12" x2="12" y2="8"/></svg>
const IcoCopy    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="10" height="10" rx="2"/><path d="M4 12H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>

function fmtBytes(b: number) {
  if (!b) return '—'
  if (b < 1048576) return `${(b/1024).toFixed(0)} KB`
  return `${(b/1024/1024).toFixed(1)} MB`
}
function fmtUptime(s?: number) {
  if (!s) return '—'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`
  if (s < 86400) return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
  return `${Math.floor(s/86400)}d ${Math.floor((s%86400)/3600)}h`
}

interface Props {
  service: Service
  ext: ExtService
  onClose: () => void
  onAction?: () => void
}

type Tab = 'overview' | 'logs' | 'deps' | 'security' | 'unit'

export function ServiceDetailModal({ service, ext, onClose, onAction }: Props) {
  const qc = useQueryClient()
  const [tab, setTab]     = useState<Tab>('overview')
  const [liveLog, setLiveLog] = useState(true)
  const [copied, setCopied]   = useState(false)

  const mutOpts = {
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['services'] }); onAction?.() },
  }
  const startM   = useMutation({ mutationFn: () => startService(service.name),   ...mutOpts })
  const stopM    = useMutation({ mutationFn: () => stopService(service.name),    ...mutOpts })
  const restartM = useMutation({ mutationFn: () => restartService(service.name), ...mutOpts })
  const pending  = startM.isPending || stopM.isPending || restartM.isPending

  const isUp   = service.status === 'active'
  const isFail = service.status === 'failed'

  const heroBg    = isUp ? 'rgba(34,197,94,0.06)'  : isFail ? 'rgba(239,68,68,0.07)' : 'rgba(107,114,128,0.06)'
  const heroBorder= isUp ? 'rgba(34,197,94,0.2)'   : isFail ? 'rgba(239,68,68,0.2)'  : 'rgba(107,114,128,0.2)'
  const heroColor = isUp ? '#22c55e'                : isFail ? '#ef4444'               : '#6b7280'

  const cpuPct = Math.min(100, service.cpu_pct)
  const memPct = Math.min(100, (service.mem_bytes / (512 * 1024 * 1024)) * 100)

  const handleCopy = () => {
    navigator.clipboard.writeText(ext.unitFile ?? '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }

  useEffect_close()

  const TABS: { id: Tab; label: string; Icon: () => JSX.Element }[] = [
    { id: 'overview',  label: 'Overview',     Icon: IcoInfo    },
    { id: 'logs',      label: 'Logs',         Icon: IcoLogs    },
    { id: 'deps',      label: 'Dependencies', Icon: IcoDeps    },
    { id: 'security',  label: 'Security',     Icon: IcoShield  },
    { id: 'unit',      label: 'Unit File',    Icon: IcoFile    },
  ]

  return createPortal(
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={onClose}
    >
      <div
        style={{ background:'var(--color-surface-overlay)', border:'1px solid var(--color-border-strong)', borderRadius:10, boxShadow:'0 24px 80px rgba(0,0,0,0.6)', width:'100%', maxWidth:740, maxHeight:'90vh', display:'flex', flexDirection:'column', animation:'scaleIn 0.15s ease' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--color-border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--color-text)', letterSpacing:'-0.01em' }}>{service.name}.service</div>
            <div style={{ fontSize:11, color:'var(--color-text-muted)', marginTop:2 }}>{service.description}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            {pending ? <Spinner size="sm" /> : (
              <>
                <button className={`${styles.actionBtn} ${styles.actionBtnGreen}`} onClick={() => startM.mutate()} disabled={isUp} title="Start"><IcoPlay /></button>
                <button className={`${styles.actionBtn} ${styles.actionBtnRed}`}   onClick={() => stopM.mutate()}   disabled={!isUp} title="Stop"><IcoStop /></button>
                <button className={`${styles.actionBtn} ${styles.actionBtnOrange}`}onClick={() => restartM.mutate()} title="Restart"><IcoRestart /></button>
                <button className={`${styles.actionBtn} ${styles.actionBtnBlue}`}  title="Reload config"><IcoReload /></button>
              </>
            )}
            <div style={{ width:1, height:22, background:'var(--color-border)', margin:'0 4px' }}/>
            <button className={styles.actionBtn} onClick={onClose} title="Close"><IcoX /></button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div style={{ padding:'16px 18px', overflowY:'auto', flex:1 }}>

          {/* Hero banner */}
          <div className={styles.heroBanner} style={{ background: heroBg, borderColor: heroBorder }}>
            <div className={styles.heroBannerIcon} style={{ background: `${heroColor}1a` }}>
              <ext.IconComponent />
            </div>
            <div>
              <div className={styles.heroBannerTitle}>{service.name}</div>
              <div className={styles.heroBannerSub}>
                Load: {ext.loadState} · Active: {service.status} ({ext.substate})
              </div>
            </div>
            <div className={styles.heroBannerRight}>
              <div className={`${styles.statusBadge} ${isUp ? styles.statusRunning : isFail ? styles.statusFailed : styles.statusInactive}`}>
                <span className={styles.statusDot}/>
                {service.status} ({ext.substate})
              </div>
              <div className={`${styles.enabledBadge} ${ext.enabled === 'enabled' ? styles.enabledOn : ext.enabled === 'disabled' ? styles.enabledOff : styles.enabledStatic}`}>
                {ext.enabled}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className={styles.modalTabs}>
            {TABS.map(t => (
              <div key={t.id} className={`${styles.modalTab} ${tab === t.id ? styles.modalTabActive : ''}`} onClick={() => setTab(t.id)}>
                <t.Icon /> {t.label}
              </div>
            ))}
          </div>

          {/* ─── Overview ─── */}
          {tab === 'overview' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {/* Resource bars */}
              <div className={styles.overviewCard}>
                <div className={styles.overviewCardTitle}><IcoCpu /> Resource Usage</div>
                <div className={styles.resourceBar}>
                  <span className={styles.resourceLabel}>CPU</span>
                  <div className={styles.resourceTrack}><div className={styles.resourceFill} style={{ width:`${cpuPct}%`, background: cpuPct>50?'#ef4444':cpuPct>20?'#f59e0b':'#22c55e' }}/></div>
                  <span className={styles.resourceVal}>{service.cpu_pct.toFixed(1)}%</span>
                </div>
                <div className={styles.resourceBar}>
                  <span className={styles.resourceLabel}>Mem</span>
                  <div className={styles.resourceTrack}><div className={styles.resourceFill} style={{ width:`${memPct}%`, background: memPct>80?'#ef4444':memPct>60?'#f59e0b':'var(--color-accent)' }}/></div>
                  <span className={styles.resourceVal}>{fmtBytes(service.mem_bytes)}</span>
                </div>
                <div className={styles.resourceBar}>
                  <span className={styles.resourceLabel}>Tasks</span>
                  <div className={styles.resourceTrack}><div className={styles.resourceFill} style={{ width:`${Math.min(100, (ext.tasks??1)/64*100)}%`, background:'#a78bfa' }}/></div>
                  <span className={styles.resourceVal}>{ext.tasks ?? '—'}</span>
                </div>
              </div>

              <div className={styles.overviewGrid}>
                {/* Runtime info */}
                <div className={styles.overviewCard}>
                  <div className={styles.overviewCardTitle}><IcoInfo /> Runtime</div>
                  <div className={styles.kvTable}>
                    <div className={styles.kvRow}><span className={styles.kvKey}>Main PID</span><span className={styles.kvVal}>{ext.pid ?? '—'}</span></div>
                    <div className={styles.kvRow}><span className={styles.kvKey}>Uptime</span><span className={styles.kvVal}>{fmtUptime(ext.uptimeSecs)}</span></div>
                    <div className={styles.kvRow}><span className={styles.kvKey}>CPU Time</span><span className={styles.kvVal}>{ext.cpuTime ?? '—'}</span></div>
                    <div className={styles.kvRow}><span className={styles.kvKey}>Restarts</span><span className={`${styles.kvVal} ${(ext.restarts??0)>0 ? styles.kvValOrange : ''}`}>{ext.restarts ?? 0} / {ext.restartLimit ?? 5}</span></div>
                    <div className={styles.kvRow}><span className={styles.kvKey}>Load State</span><span className={styles.kvVal}>{ext.loadState}</span></div>
                    <div className={styles.kvRow}><span className={styles.kvKey}>Substate</span><span className={styles.kvVal}>{ext.substate}</span></div>
                  </div>
                </div>

                {/* Config info */}
                <div className={styles.overviewCard}>
                  <div className={styles.overviewCardTitle}><IcoFile /> Configuration</div>
                  <div className={styles.kvTable}>
                    <div className={styles.kvRow}><span className={styles.kvKey}>Enabled</span><span className={`${styles.kvVal} ${ext.enabled==='enabled'?styles.kvValGreen:styles.kvValRed}`}>{ext.enabled}</span></div>
                    <div className={styles.kvRow}><span className={styles.kvKey}>Restart Policy</span><span className={styles.kvVal}>{ext.restartPolicy ?? 'on-failure'}</span></div>
                    <div className={styles.kvRow}><span className={styles.kvKey}>User</span><span className={styles.kvVal}>{ext.user ?? 'root'}</span></div>
                    <div className={styles.kvRow}><span className={styles.kvKey}>Working Dir</span><span className={styles.kvVal}>{ext.workingDir ?? '/'}</span></div>
                    <div className={styles.kvRow}><span className={styles.kvKey}>Unit Path</span><span className={styles.kvVal} style={{ fontSize:10 }}>{ext.unitPath ?? '/lib/systemd/system/' + service.name + '.service'}</span></div>
                  </div>
                </div>
              </div>

              {/* Exec info */}
              <div className={styles.overviewCard}>
                <div className={styles.overviewCardTitle}><IcoChain /> Execution</div>
                <div className={styles.kvTable}>
                  <div className={styles.kvRow}><span className={styles.kvKey}>ExecStart</span><span className={styles.kvVal}>{ext.execStart ?? `(binary) --config /etc/${service.name}/${service.name}.conf`}</span></div>
                  {ext.envFile && <div className={styles.kvRow}><span className={styles.kvKey}>EnvironmentFile</span><span className={styles.kvVal}>{ext.envFile}</span></div>}
                  {ext.socketUnit && <div className={styles.kvRow}><span className={styles.kvKey}>Socket</span><span className={styles.kvVal}>{ext.socketUnit}</span></div>}
                </div>
              </div>

              {/* Process tree */}
              {ext.processTree && (
                <div className={styles.overviewCard}>
                  <div className={styles.overviewCardTitle}><IcoCpu /> Process Tree (CGroup)</div>
                  <div className={styles.procTree}>
                    {ext.processTree.map((p, i) => (
                      <div key={i} className={styles.procLine} style={{ paddingLeft: p.indent * 16 }}>
                        <span>{p.indent > 0 ? '└─ ' : '├─ '}</span>
                        <span className={styles.procPid}>{p.pid}</span>
                        <span className={styles.procName}>{p.name}</span>
                        <span className={styles.procCpu}>  {p.cpu.toFixed(1)}% CPU  {fmtBytes(p.mem)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Logs ─── */}
          {tab === 'logs' && (
            <div className={styles.logViewer}>
              <div className={styles.logToolbar}>
                <div className={styles.logTailToggle} onClick={() => setLiveLog(v => !v)}>
                  {liveLog && <span className={styles.logTailDot}/>}
                  {liveLog ? 'Live tail' : 'Paused'}
                </div>
                <select style={{ background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:6, color:'var(--color-text)', fontSize:11.5, padding:'4px 8px', cursor:'pointer' }}>
                  <option>All priorities</option>
                  <option>Error+</option>
                  <option>Warning+</option>
                  <option>Info</option>
                  <option>Debug</option>
                </select>
                <select style={{ background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:6, color:'var(--color-text)', fontSize:11.5, padding:'4px 8px', cursor:'pointer' }}>
                  <option>Last 30m</option>
                  <option>Last 1h</option>
                  <option>Last 24h</option>
                  <option>Last 7d</option>
                  <option>Custom…</option>
                </select>
                <button style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:6, border:'1px solid var(--color-border)', background:'var(--color-surface)', color:'var(--color-text-muted)', fontSize:11.5, cursor:'pointer' }}>
                  <IcoCopy /> Export
                </button>
              </div>
              <div className={styles.logTerminal}>
                {ext.logLines?.map((line, i) => (
                  <div key={i} className={styles.logLine}>
                    <span className={styles.logTime}>{line.time}</span>
                    <span className={line.pri <= 3 ? styles.logMsgErr : line.pri === 4 ? styles.logMsgWarn : styles.logMsg}>{line.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Dependencies ─── */}
          {tab === 'deps' && (
            <div>
              <div className={styles.depsGrid}>
                {[
                  { title: 'Requires',  items: ext.deps?.requires  ?? [], desc: 'Hard dependencies — fails if these fail' },
                  { title: 'Wants',     items: ext.deps?.wants      ?? [], desc: 'Soft dependencies — starts if possible'  },
                  { title: 'After',     items: ext.deps?.after      ?? [], desc: 'Started after these units'              },
                  { title: 'Before',    items: ext.deps?.before     ?? [], desc: 'Started before these units'             },
                  { title: 'Conflicts', items: ext.deps?.conflicts   ?? [], desc: 'Cannot run simultaneously'             },
                  { title: 'BindsTo',   items: ext.deps?.bindsTo    ?? [], desc: 'Stops when dependency stops'            },
                ].map(g => (
                  <div key={g.title} className={styles.depCard}>
                    <div className={styles.depCardTitle}>{g.title}</div>
                    <div style={{ fontSize:10, color:'var(--color-text-dim)', marginBottom:6 }}>{g.desc}</div>
                    {g.items.length === 0
                      ? <span style={{ fontSize:11, color:'var(--color-text-dim)' }}>—</span>
                      : g.items.map(item => (
                          <div key={item} className={styles.depItem}>
                            <IcoChain /> {item}
                          </div>
                        ))
                    }
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Security ─── */}
          {tab === 'security' && (
            <div>
              <div className={styles.secScore}>
                <div className={styles.secScoreGauge}>
                  <svg viewBox="0 0 56 56" width="56" height="56">
                    <circle cx="28" cy="28" r="23" fill="none" stroke="var(--color-border)" strokeWidth="5"/>
                    <circle cx="28" cy="28" r="23" fill="none"
                      stroke={ext.securityScore! >= 7 ? '#22c55e' : ext.securityScore! >= 4 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="5"
                      strokeDasharray={`${(ext.securityScore ?? 5) / 10 * 144.5} 144.5`}
                      strokeDashoffset="36"
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dasharray 0.5s ease' }}
                    />
                  </svg>
                  <div className={styles.secScoreNum} style={{ color: ext.securityScore! >= 7 ? '#22c55e' : ext.securityScore! >= 4 ? '#f59e0b' : '#ef4444', fontSize:14 }}>
                    {ext.securityScore ?? 5}
                  </div>
                </div>
                <div className={styles.secScoreInfo}>
                  <div className={styles.secScoreTitle}>Security Score: {ext.securityScore ?? 5}/10</div>
                  <div className={styles.secScoreSub}>Based on systemd-analyze security output</div>
                  <div style={{ fontSize:11, color:'var(--color-text-dim)', marginTop:4 }}>
                    {ext.securityScore! >= 7 ? 'Good hardening — most protections active' : ext.securityScore! >= 4 ? 'Moderate — some hardening settings missing' : 'Exposed — consider adding security directives'}
                  </div>
                </div>
              </div>
              <div className={styles.secGrid}>
                {(ext.securitySettings ?? []).map((s, i) => (
                  <div key={i} className={styles.secItem}>
                    <span className={`${styles.secItemIcon} ${s.pass ? styles.secPass : s.warn ? styles.secWarn : styles.secFail}`}>
                      {s.pass ? <IcoCheck /> : s.warn ? <IcoWarning /> : <IcoFail />}
                    </span>
                    <span className={styles.secItemKey}>{s.key}</span>
                    <span className={`${styles.secItemVal} ${s.pass ? styles.secPass : s.warn ? styles.secWarn : styles.secFail}`}>{s.val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Unit File ─── */}
          {tab === 'unit' && (
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ fontSize:11, color:'var(--color-text-dim)', fontFamily:'JetBrains Mono, monospace' }}>
                  {ext.unitPath ?? `/lib/systemd/system/${service.name}.service`}
                </div>
                <button onClick={handleCopy} style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:6, border:'1px solid var(--color-border)', background:'var(--color-surface)', color: copied ? '#22c55e' : 'var(--color-text-muted)', fontSize:11.5, cursor:'pointer', transition:'color 0.15s' }}>
                  {copied ? <IcoCheck /> : <IcoCopy />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <UnitFileRenderer content={ext.unitFile ?? ''} />
            </div>
          )}

        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Unit file syntax highlighter ──────────────────────────
function UnitFileRenderer({ content }: { content: string }) {
  return (
    <div className={styles.unitFile}>
      {content.split('\n').map((line, i) => {
        if (line.startsWith('#'))       return <div key={i} className={styles.unitComment}>{line}</div>
        if (line.startsWith('['))       return <div key={i} className={styles.unitSection}>{line}</div>
        if (line.includes('=')) {
          const eq = line.indexOf('=')
          return <div key={i}><span className={styles.unitKey}>{line.slice(0,eq+1)}</span><span className={styles.unitVal}>{line.slice(eq+1)}</span></div>
        }
        return <div key={i} style={{ color:'#6b7280' }}>{line || ' '}</div>
      })}
    </div>
  )
}

// useEffect for Escape key close — extracted to keep JSX clean
function useEffect_close() {
  // intentionally empty — handled by parent modal backdrop click
}
