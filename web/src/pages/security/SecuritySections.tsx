import React, { useState } from 'react'
import styles from './SecurityPage.module.css'
import {
  BANNED_IPS, F2B_JAILS, F2B_ATTACK_TREND, BannedIP,
  CROWDSEC_ALERTS, CROWDSEC_DECISIONS, CROWDSEC_FEED, CrowdSecAlert,
  WAZUH_AGENTS, WAZUH_EVENTS, WazuhAgent,
  SURICATA_ALERTS, SURICATA_STATS, SuricataAlert,
  MALWARE_FINDINGS, CLAMAV_STATS, MalwareFinding,
  DOCKER_CONTAINERS, DOCKER_STATS, DockerContainer,
  TRIVY_VULNS, TRIVY_STATS, TrivyVuln,
  USER_SESSIONS, FAILED_LOGINS, AUTH_STATS, UserSession, FailedLogin,
} from './securityToolsData'
import { SEV_META, type Severity } from './securityData'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

// ── Shared Icons ──────────────────────────────────────────────
const IcoX       = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
const IcoBlock   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="10" cy="10" r="8"/><line x1="4" y1="4" x2="16" y2="16"/></svg>
const IcoShield  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2L4 5v5c0 4 3 7 6 8 3-1 6-4 6-8V5z"/><path d="M7 10l2 2 4-4"/></svg>
const IcoRefresh = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 10a7 7 0 0 1-7 7 7 7 0 0 1-5-2"/><polyline points="2,10 3,15 8,14"/></svg>
const IcoEye     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z"/><circle cx="10" cy="10" r="2.5"/></svg>
const IcoSearch  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="17" y2="17"/></svg>
const IcoPlay    = () => <svg viewBox="0 0 20 20" fill="currentColor"><polygon points="5,3 17,10 5,17"/></svg>
const IcoTrash   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,6 17,6"/><path d="M8 6V4h4v2"/><rect x="4" y="6" width="12" height="12" rx="1.5"/></svg>
const IcoPlus    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="10" y1="3" x2="10" y2="17"/><line x1="3" y1="10" x2="17" y2="10"/></svg>
const IcoAgent   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="14" height="14" rx="2"/><line x1="7" y1="10" x2="13" y2="10"/><line x1="10" y1="7" x2="10" y2="13"/></svg>
const IcoKey     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="10" r="4"/><line x1="12" y1="10" x2="18" y2="10"/><line x1="16" y1="10" x2="16" y2="13"/></svg>

// ── Shared helpers ────────────────────────────────────────────
function SevBadge({ sev }: { sev: Severity }) {
  const m = SEV_META[sev]
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: m.bg, color: m.color, border: `1px solid ${m.border}` }}>{m.short}</span>
}
function StatCard({ label, value, sub, color }: { label:string; value:string; sub?:string; color:string }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statIcon} style={{ background: color + '1a' }}>
        <span style={{ color }}><IcoShield /></span>
      </div>
      <div className={styles.statBody}>
        <div className={styles.statVal} style={{ color }}>{value}</div>
        <div className={styles.statLbl}>{label}</div>
        {sub && <div style={{ fontSize:10, color:'var(--color-text-dim)' }}>{sub}</div>}
      </div>
    </div>
  )
}
function Overlay({ onClose, children }: { onClose:()=>void; children:React.ReactNode }) {
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      {children}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// FAIL2BAN SECTION
// ═══════════════════════════════════════════════════════════════
function Fail2BanIPModal({ ip, onClose }: { ip: BannedIP; onClose: ()=>void }) {
  return (
    <Overlay onClose={onClose}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <span style={{ fontSize:20, fontWeight:800, fontFamily:'monospace', color:'#f6ad55' }}>🚫</span>
          <div className={styles.modalHeadInfo}>
            <div className={styles.modalTitle}>{ip.ip}</div>
            <div className={styles.modalSub}>{ip.country} · Jail: {ip.jail} · {ip.attempts} attempts</div>
          </div>
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.detailGrid}>
            {[
              ['IP Address',   ip.ip],
              ['Country',      ip.country],
              ['Jail',         ip.jail],
              ['Banned At',    ip.bannedAt],
              ['Expires At',   ip.expiresAt],
              ['Attempts',     String(ip.attempts)],
            ].map(([k,v]) => (
              <React.Fragment key={k}><span className={styles.detailKey}>{k}</span><span className={styles.detailVal}>{v}</span></React.Fragment>
            ))}
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--color-text-dim)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Unban command</div>
            <div className={styles.codeBlock}>{`fail2ban-client set ${ip.jail} unbanip ${ip.ip}`}</div>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--color-text-dim)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Whitelist command</div>
            <div className={styles.codeBlock}>{`fail2ban-client set ${ip.jail} addignoreip ${ip.ip}`}</div>
          </div>
        </div>
        <div className={styles.modalActions}>
          <button className={`${styles.modalActBtn} ${styles.modalActDanger}`}><IcoBlock />Unban IP</button>
          <button className={`${styles.modalActBtn}`}><IcoShield />Add to Whitelist</button>
          <button className={styles.modalActBtn}><IcoEye />View Logs</button>
        </div>
      </div>
    </Overlay>
  )
}

export function Fail2BanSection() {
  const [activeTab, setActiveTab] = useState<'bans'|'jails'|'chart'>('bans')
  const [selected, setSelected]   = useState<BannedIP|null>(null)
  const [search, setSearch]       = useState('')

  const filtered = BANNED_IPS.filter(b =>
    !search || b.ip.includes(search) || b.country.toLowerCase().includes(search.toLowerCase()) || b.jail.includes(search)
  )
  const totalBans = 234; const activeBans = BANNED_IPS.length; const attacksToday = 382

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Stats */}
      <div className={styles.scoreRow} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
        <StatCard label="Active Bans"      value={String(activeBans)}  sub="right now"    color="#f6ad55" />
        <StatCard label="Total Bans (24h)" value={String(totalBans)}   sub="cumulative"   color="#ff8c00" />
        <StatCard label="Attacks Today"    value={String(attacksToday)} sub="login attempts" color="#ff4d4d" />
        <StatCard label="Jails Active"     value={String(F2B_JAILS.filter(j=>j.status==='active').length)} sub="of 5 configured" color="#63b3ed" />
      </div>

      {/* Sub-tabs */}
      <div className={styles.tabBar} style={{ gap:4 }}>
        {(['bans','jails','chart'] as const).map(t => (
          <button key={t} className={`${styles.tab} ${activeTab===t?styles.tabActive:''}`} onClick={()=>setActiveTab(t)}>
            {t==='bans'?'Banned IPs':t==='jails'?'Jails':'Attack Timeline'}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <button className={styles.iconBtn}><IcoRefresh />Restart Fail2Ban</button>
        <button className={styles.iconBtn}><IcoPlus />Add Whitelist</button>
      </div>

      {activeTab==='bans' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadLeft}>
              <span className={styles.sectionTitle}>Banned IPs</span>
              <span className={styles.resultCount}><strong>{filtered.length}</strong> active bans</span>
            </div>
            <div className={styles.sectionHeadRight}>
              <div className={styles.searchWrap} style={{ maxWidth:220 }}>
                <span className={styles.searchIcon}><IcoSearch /></span>
                <input className={styles.searchInput} placeholder="Search IP, country, jail…" value={search} onChange={e=>setSearch(e.target.value)} />
              </div>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>IP Address</th>
                  <th className={styles.th}>Country</th>
                  <th className={styles.th}>Jail</th>
                  <th className={styles.th}>Attempts</th>
                  <th className={styles.th}>Banned At</th>
                  <th className={styles.th}>Expires</th>
                  <th className={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => (
                  <tr key={b.id} className={styles.tr} onClick={()=>setSelected(b)}>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ fontWeight:600, color:'#fc8181' }}>{b.ip}</td>
                    <td className={styles.td}>{b.countryCode} <span style={{ color:'var(--color-text-dim)', fontSize:11 }}>{b.country}</span></td>
                    <td className={`${styles.td} ${styles.tdCode}`}><span className={styles.catChip}>{b.jail}</span></td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'#f6ad55', fontWeight:600 }}>{b.attempts}</td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'var(--color-text-dim)' }}>{b.bannedAt}</td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'var(--color-text-dim)' }}>{b.expiresAt}</td>
                    <td className={styles.td} onClick={e=>e.stopPropagation()}>
                      <div className={styles.actionBtns}>
                        <button className={`${styles.actBtn} ${styles.actBtnDanger}`} onClick={()=>setSelected(b)}><IcoBlock />Unban</button>
                        <button className={styles.actBtn} onClick={()=>setSelected(b)}><IcoEye />Details</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab==='jails' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadLeft}><span className={styles.sectionTitle}>Active Jails</span></div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>Jail Name</th>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}>Log Path</th>
                  <th className={styles.th}>Max Retry</th>
                  <th className={styles.th}>Find Time</th>
                  <th className={styles.th}>Ban Time</th>
                  <th className={styles.th}>Failed</th>
                  <th className={styles.th}>Current Bans</th>
                </tr>
              </thead>
              <tbody>
                {F2B_JAILS.map(j => (
                  <tr key={j.id} className={styles.tr}>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ fontWeight:600 }}>{j.name}</td>
                    <td className={styles.td}>
                      <span style={{ fontSize:10.5, fontWeight:600, padding:'2px 8px', borderRadius:5,
                        background: j.status==='active' ? 'rgba(104,211,145,0.1)' : 'rgba(255,77,77,0.1)',
                        color: j.status==='active' ? '#68d391' : '#ff4d4d',
                        border: `1px solid ${j.status==='active' ? 'rgba(104,211,145,0.3)' : 'rgba(255,77,77,0.3)'}` }}>
                        {j.status==='active' ? '● Active' : '○ Inactive'}
                      </span>
                    </td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ fontSize:11, color:'var(--color-text-dim)' }}>{j.logPath}</td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'#f6ad55' }}>{j.maxRetry}</td>
                    <td className={`${styles.td} ${styles.tdCode}`}>{j.findTime}s</td>
                    <td className={`${styles.td} ${styles.tdCode}`}>{j.banTime >= 3600 ? `${j.banTime/3600}h` : `${j.banTime}s`}</td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'#f6ad55' }}>{j.failedAttempts}</td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color: j.currentBans>0?'#ff4d4d':'#68d391', fontWeight:700 }}>{j.currentBans}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab==='chart' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadLeft}><span className={styles.sectionTitle}>Attack Timeline (24h)</span></div>
          </div>
          <div style={{ padding:'8px 16px 20px' }}>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={F2B_ATTACK_TREND} margin={{ top:4, right:12, left:0, bottom:0 }}>
                <defs>
                  <linearGradient id="f2bGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ff4d4d" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ff4d4d" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize:10, fill:'var(--color-text-dim)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:10, fill:'var(--color-text-dim)' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:6, fontSize:11 }} />
                <Area type="monotone" dataKey="count" stroke="#ff4d4d" fill="url(#f2bGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {selected && <Fail2BanIPModal ip={selected} onClose={()=>setSelected(null)} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CROWDSEC SECTION
// ═══════════════════════════════════════════════════════════════
function CrowdSecAlertModal({ alert, onClose }: { alert: CrowdSecAlert; onClose:()=>void }) {
  const m = SEV_META[alert.severity]
  return (
    <Overlay onClose={onClose}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <SevBadge sev={alert.severity} />
          <div className={styles.modalHeadInfo}>
            <div className={styles.modalTitle}>{alert.sourceIp}</div>
            <div className={styles.modalSub}>{alert.scenario} · {alert.country}</div>
          </div>
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.detailGrid}>
            {[['Source IP', alert.sourceIp],['Scenario', alert.scenario],['Country', alert.country],['Severity', m.label],['Timestamp', alert.timestamp],['Decisions', String(alert.decisions)]].map(([k,v])=>(
              <React.Fragment key={k}><span className={styles.detailKey}>{k}</span><span className={styles.detailVal}>{v}</span></React.Fragment>
            ))}
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--color-text-dim)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Manual ban command</div>
            <div className={styles.codeBlock}>{`cscli decisions add --ip ${alert.sourceIp} --duration 24h --reason "${alert.scenario}"`}</div>
          </div>
        </div>
        <div className={styles.modalActions}>
          <button className={`${styles.modalActBtn} ${styles.modalActDanger}`}><IcoBlock />Add Ban Decision</button>
          <button className={styles.modalActBtn}><IcoShield />Whitelist IP</button>
          <button className={styles.modalActBtn}><IcoEye />View in Console</button>
        </div>
      </div>
    </Overlay>
  )
}

export function CrowdSecSection() {
  const [activeTab, setActiveTab] = useState<'feed'|'alerts'|'decisions'>('feed')
  const [selected, setSelected]   = useState<CrowdSecAlert|null>(null)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div className={styles.scoreRow} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
        <StatCard label="Active Decisions"  value={String(CROWDSEC_DECISIONS.length)} sub="IPs blocked"      color="#f6ad55" />
        <StatCard label="Alerts (24h)"      value="127"                                sub="scenarios hit"   color="#ff8c00" />
        <StatCard label="Blocklist Size"    value="9,441"                              sub="community IPs"   color="#63b3ed" />
        <StatCard label="Threat Score"      value="72/100"                             sub="network health"  color="#68d391" />
      </div>

      <div className={styles.tabBar} style={{ gap:4 }}>
        {(['feed','alerts','decisions'] as const).map(t => (
          <button key={t} className={`${styles.tab} ${activeTab===t?styles.tabActive:''}`} onClick={()=>setActiveTab(t)}>
            {t==='feed'?'Live Feed':t==='alerts'?'Alerts':'Decisions'}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <button className={styles.iconBtn}><IcoRefresh />Sync Blocklists</button>
        <button className={styles.iconBtn}><IcoAgent />Install Bouncer</button>
      </div>

      {activeTab==='feed' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadLeft}><span className={styles.sectionTitle}>Live Attack Feed</span></div>
            <div className={styles.sectionHeadRight}>
              <span style={{ fontSize:10, color:'#68d391', display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#68d391', display:'inline-block' }} />Live
              </span>
            </div>
          </div>
          <div style={{ padding:'4px 0' }}>
            {CROWDSEC_FEED.map((f,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 16px', borderBottom:'1px solid var(--color-border)', fontSize:12.5 }}>
                <span style={{ fontFamily:'monospace', fontSize:11, color:'var(--color-text-dim)', flexShrink:0 }}>{f.time}</span>
                <span className={styles.catChip} style={{ flexShrink:0 }}>{f.country}</span>
                <span style={{ fontFamily:'monospace', color:'#fc8181', fontWeight:600, flexShrink:0 }}>{f.ip}</span>
                <span style={{ color:'var(--color-text-muted)', flex:1 }}>{f.action}</span>
                <button className={`${styles.actBtn} ${styles.actBtnDanger}`} style={{ flexShrink:0 }}><IcoBlock />Block</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab==='alerts' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadLeft}><span className={styles.sectionTitle}>CrowdSec Alerts</span></div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>Severity</th>
                  <th className={styles.th}>Source IP</th>
                  <th className={styles.th}>Scenario</th>
                  <th className={styles.th}>Country</th>
                  <th className={styles.th}>Decisions</th>
                  <th className={styles.th}>Timestamp</th>
                  <th className={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {CROWDSEC_ALERTS.map(a => (
                  <tr key={a.id} className={styles.tr} onClick={()=>setSelected(a)}>
                    <td className={styles.td}><SevBadge sev={a.severity} /></td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'#fc8181', fontWeight:600 }}>{a.sourceIp}</td>
                    <td className={`${styles.td} ${styles.tdCode}`}>{a.scenario}</td>
                    <td className={styles.td}><span className={styles.catChip}>{a.country}</span></td>
                    <td className={`${styles.td} ${styles.tdCode}`}>{a.decisions}</td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'var(--color-text-dim)' }}>{a.timestamp}</td>
                    <td className={styles.td} onClick={e=>e.stopPropagation()}>
                      <div className={styles.actionBtns}>
                        <button className={`${styles.actBtn} ${styles.actBtnDanger}`} onClick={()=>setSelected(a)}><IcoBlock />Ban</button>
                        <button className={styles.actBtn} onClick={()=>setSelected(a)}><IcoEye />Details</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab==='decisions' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadLeft}><span className={styles.sectionTitle}>Active Decisions</span></div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>Type</th>
                  <th className={styles.th}>IP Address</th>
                  <th className={styles.th}>Origin</th>
                  <th className={styles.th}>Scope</th>
                  <th className={styles.th}>Duration</th>
                  <th className={styles.th}>Expires</th>
                  <th className={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {CROWDSEC_DECISIONS.map(d => (
                  <tr key={d.id} className={styles.tr}>
                    <td className={styles.td}>
                      <span style={{ fontSize:10.5, fontWeight:700, padding:'2px 8px', borderRadius:5,
                        background: d.type==='ban'?'rgba(255,77,77,0.1)':d.type==='captcha'?'rgba(246,173,85,0.1)':'rgba(99,179,237,0.1)',
                        color: d.type==='ban'?'#ff4d4d':d.type==='captcha'?'#f6ad55':'#63b3ed',
                        border:`1px solid ${d.type==='ban'?'rgba(255,77,77,0.25)':d.type==='captcha'?'rgba(246,173,85,0.25)':'rgba(99,179,237,0.25)'}` }}>
                        {d.type.toUpperCase()}
                      </span>
                    </td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'#fc8181', fontWeight:600 }}>{d.ip}</td>
                    <td className={`${styles.td} ${styles.tdCode}`}><span className={styles.catChip}>{d.origin}</span></td>
                    <td className={`${styles.td} ${styles.tdCode}`}>{d.scope}</td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'#f6ad55' }}>{d.duration}</td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'var(--color-text-dim)' }}>{d.expiresAt}</td>
                    <td className={styles.td}>
                      <div className={styles.actionBtns}>
                        <button className={`${styles.actBtn} ${styles.actBtnDanger}`}><IcoX />Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && <CrowdSecAlertModal alert={selected} onClose={()=>setSelected(null)} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// WAZUH SECTION
// ═══════════════════════════════════════════════════════════════
function WazuhAgentModal({ agent, onClose }: { agent: WazuhAgent; onClose:()=>void }) {
  return (
    <Overlay onClose={onClose}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <span style={{ width:10, height:10, borderRadius:'50%', background: agent.status==='online'?'#68d391':'#ff4d4d', display:'block', flexShrink:0, marginTop:2 }} />
          <div className={styles.modalHeadInfo}>
            <div className={styles.modalTitle}>{agent.hostname}</div>
            <div className={styles.modalSub}>{agent.ip} · {agent.os} · v{agent.agentVersion}</div>
          </div>
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.detailGrid}>
            {[
              ['Hostname',   agent.hostname],
              ['IP Address', agent.ip],
              ['OS',         agent.os],
              ['Status',     agent.status],
              ['Last Seen',  agent.lastHeartbeat],
              ['Version',    agent.agentVersion],
              ['Groups',     agent.groups.join(', ')],
            ].map(([k,v])=>(
              <React.Fragment key={k}><span className={styles.detailKey}>{k}</span><span className={styles.detailVal}>{v}</span></React.Fragment>
            ))}
          </div>
        </div>
        <div className={styles.modalActions}>
          <button className={`${styles.modalActBtn} ${styles.modalActPrimary}`}><IcoPlay />Run Scan</button>
          <button className={styles.modalActBtn}><IcoRefresh />Restart Agent</button>
          <button className={styles.modalActBtn}><IcoEye />View Events</button>
          {agent.status === 'offline' && <button className={`${styles.modalActBtn} ${styles.modalActDanger}`}><IcoTrash />Remove Agent</button>}
        </div>
      </div>
    </Overlay>
  )
}

export function WazuhSection() {
  const [activeTab, setActiveTab] = useState<'agents'|'events'>('agents')
  const [selected, setSelected]   = useState<WazuhAgent|null>(null)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div className={styles.scoreRow} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
        <StatCard label="Agents Online" value={`${WAZUH_AGENTS.filter(a=>a.status==='online').length}/${WAZUH_AGENTS.length}`} sub="active agents" color="#68d391" />
        <StatCard label="FIM Alerts"    value="4"       sub="file changes"    color="#f6ad55" />
        <StatCard label="Events (24h)"  value="8,412"   sub="security events" color="#63b3ed" />
        <StatCard label="Compliance"    value="78%"     sub="controls passing" color="#a78bfa" />
      </div>

      <div className={styles.tabBar} style={{ gap:4 }}>
        {(['agents','events'] as const).map(t => (
          <button key={t} className={`${styles.tab} ${activeTab===t?styles.tabActive:''}`} onClick={()=>setActiveTab(t)}>
            {t==='agents'?'Agents':'Security Events'}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <button className={styles.iconBtn}><IcoAgent />Install Agent</button>
        <button className={styles.iconBtn}><IcoPlay />Run Scan</button>
      </div>

      {activeTab==='agents' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadLeft}><span className={styles.sectionTitle}>Wazuh Agents</span></div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}>Hostname</th>
                  <th className={styles.th}>IP Address</th>
                  <th className={styles.th}>OS</th>
                  <th className={styles.th}>Last Heartbeat</th>
                  <th className={styles.th}>Version</th>
                  <th className={styles.th}>Groups</th>
                  <th className={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {WAZUH_AGENTS.map(a => (
                  <tr key={a.id} className={styles.tr} onClick={()=>setSelected(a)}>
                    <td className={styles.td}>
                      <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, fontWeight:600,
                        color: a.status==='online'?'#68d391':a.status==='offline'?'#ff4d4d':'#f6ad55' }}>
                        <span style={{ width:7, height:7, borderRadius:'50%', background: a.status==='online'?'#68d391':a.status==='offline'?'#ff4d4d':'#f6ad55' }} />
                        {a.status==='online'?'Online':a.status==='offline'?'Offline':'Never'}
                      </span>
                    </td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ fontWeight:600 }}>{a.hostname}</td>
                    <td className={`${styles.td} ${styles.tdCode}`}>{a.ip}</td>
                    <td className={styles.td}><span className={styles.catChip}>{a.os}</span></td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'var(--color-text-dim)' }}>{a.lastHeartbeat}</td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'var(--color-text-dim)' }}>{a.agentVersion}</td>
                    <td className={styles.td}>{a.groups.map(g=><span key={g} className={styles.catChip} style={{ marginRight:3 }}>{g}</span>)}</td>
                    <td className={styles.td} onClick={e=>e.stopPropagation()}>
                      <div className={styles.actionBtns}>
                        <button className={`${styles.actBtn} ${styles.actBtnFix}`} onClick={()=>setSelected(a)}><IcoPlay />Scan</button>
                        <button className={styles.actBtn} onClick={()=>setSelected(a)}><IcoEye />View</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab==='events' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadLeft}><span className={styles.sectionTitle}>Security Events</span></div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>Level</th>
                  <th className={styles.th}>Rule ID</th>
                  <th className={styles.th}>Description</th>
                  <th className={styles.th}>Category</th>
                  <th className={styles.th}>Source</th>
                  <th className={styles.th}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {WAZUH_EVENTS.map(e => (
                  <tr key={e.id} className={styles.tr}>
                    <td className={styles.td}>
                      <span style={{ fontSize:11, fontWeight:700, padding:'2px 7px', borderRadius:4,
                        background: e.level>=10?'rgba(255,77,77,0.1)':e.level>=7?'rgba(255,140,0,0.1)':e.level>=4?'rgba(246,173,85,0.1)':'rgba(104,211,145,0.1)',
                        color: e.level>=10?'#ff4d4d':e.level>=7?'#ff8c00':e.level>=4?'#f6ad55':'#68d391',
                        border:`1px solid ${e.level>=10?'rgba(255,77,77,0.25)':e.level>=7?'rgba(255,140,0,0.25)':e.level>=4?'rgba(246,173,85,0.25)':'rgba(104,211,145,0.25)'}` }}>
                        L{e.level}
                      </span>
                    </td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'var(--color-accent)' }}>{e.ruleId}</td>
                    <td className={styles.td} style={{ color:'var(--color-text-muted)', maxWidth:260 }}>{e.description}</td>
                    <td className={styles.td}><span className={styles.catChip}>{e.category}</span></td>
                    <td className={`${styles.td} ${styles.tdCode}`}>{e.source}</td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'var(--color-text-dim)' }}>{e.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && <WazuhAgentModal agent={selected} onClose={()=>setSelected(null)} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SURICATA SECTION
// ═══════════════════════════════════════════════════════════════
function SuricataAlertModal({ alert, onClose }: { alert: SuricataAlert; onClose:()=>void }) {
  return (
    <Overlay onClose={onClose}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <SevBadge sev={alert.severity} />
          <div className={styles.modalHeadInfo}>
            <div className={styles.modalTitle}>{alert.signature}</div>
            <div className={styles.modalSub}>{alert.srcIp} → {alert.dstIp} · {alert.protocol}</div>
          </div>
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.detailGrid}>
            {[['Signature',alert.signature],['Source IP',alert.srcIp],['Destination',alert.dstIp],['Protocol',alert.protocol],['Category',alert.category],['Action',alert.action.toUpperCase()],['Severity',alert.severity],['Timestamp',alert.timestamp]].map(([k,v])=>(
              <React.Fragment key={k}><span className={styles.detailKey}>{k}</span><span className={styles.detailVal}>{v}</span></React.Fragment>
            ))}
          </div>
        </div>
        <div className={styles.modalActions}>
          {alert.action==='alert' && <button className={`${styles.modalActBtn} ${styles.modalActDanger}`}><IcoBlock />Add Drop Rule</button>}
          <button className={styles.modalActBtn}><IcoShield />Whitelist Signature</button>
          <button className={styles.modalActBtn}><IcoEye />View PCAP</button>
        </div>
      </div>
    </Overlay>
  )
}

export function SuricataSection() {
  const [selected, setSelected] = useState<SuricataAlert|null>(null)
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div className={styles.scoreRow} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
        {SURICATA_STATS.map(s => <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} color={s.color} />)}
      </div>

      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <button className={styles.iconBtn}><IcoRefresh />Update Rules</button>
        <button className={styles.iconBtn}><IcoEye />Export Alerts</button>
      </div>

      <div className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionHeadLeft}><span className={styles.sectionTitle}>IDS/IPS Alerts</span></div>
          <div className={styles.sectionHeadRight}>
            <span style={{ fontSize:10, color:'#68d391', display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'#68d391', display:'inline-block' }} />Live
            </span>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Severity</th>
                <th className={styles.th}>Action</th>
                <th className={styles.th}>Signature</th>
                <th className={styles.th}>Source IP</th>
                <th className={styles.th}>Destination</th>
                <th className={styles.th}>Protocol</th>
                <th className={styles.th}>Category</th>
                <th className={styles.th}>Time</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {SURICATA_ALERTS.map(a => (
                <tr key={a.id} className={styles.tr} onClick={()=>setSelected(a)}>
                  <td className={styles.td}><SevBadge sev={a.severity} /></td>
                  <td className={styles.td}>
                    <span style={{ fontSize:10.5, fontWeight:700, padding:'2px 7px', borderRadius:4,
                      background: a.action==='drop'?'rgba(255,77,77,0.1)':'rgba(246,173,85,0.1)',
                      color: a.action==='drop'?'#ff4d4d':'#f6ad55',
                      border:`1px solid ${a.action==='drop'?'rgba(255,77,77,0.25)':'rgba(246,173,85,0.25)'}` }}>
                      {a.action.toUpperCase()}
                    </span>
                  </td>
                  <td className={styles.td} style={{ fontSize:11.5, maxWidth:200 }}>{a.signature}</td>
                  <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'#fc8181', fontWeight:600 }}>{a.srcIp}</td>
                  <td className={`${styles.td} ${styles.tdCode}`}>{a.dstIp}</td>
                  <td className={`${styles.td} ${styles.tdCode}`}><span className={styles.catChip}>{a.protocol}</span></td>
                  <td className={styles.td} style={{ fontSize:11 }}>{a.category}</td>
                  <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'var(--color-text-dim)' }}>{a.timestamp}</td>
                  <td className={styles.td} onClick={e=>e.stopPropagation()}>
                    <button className={styles.actBtn} onClick={()=>setSelected(a)}><IcoEye />Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selected && <SuricataAlertModal alert={selected} onClose={()=>setSelected(null)} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CLAMAV SECTION
// ═══════════════════════════════════════════════════════════════
function MalwareModal({ item, onClose }: { item: MalwareFinding; onClose:()=>void }) {
  const m = SEV_META[item.severity]
  return (
    <Overlay onClose={onClose}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <SevBadge sev={item.severity} />
          <div className={styles.modalHeadInfo}>
            <div className={styles.modalTitle}>{item.signature}</div>
            <div className={styles.modalSub}>{item.filePath} · {item.size}</div>
          </div>
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.detailGrid}>
            {[['File Path',item.filePath],['Signature',item.signature],['Severity',m.label],['Action',item.action],['File Size',item.size],['Detected',item.timestamp]].map(([k,v])=>(
              <React.Fragment key={k}><span className={styles.detailKey}>{k}</span><span className={styles.detailVal}>{v}</span></React.Fragment>
            ))}
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--color-text-dim)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Manual scan command</div>
            <div className={styles.codeBlock}>{`clamscan --remove "${item.filePath}"`}</div>
          </div>
        </div>
        <div className={styles.modalActions}>
          {item.action !== 'deleted' && <button className={`${styles.modalActBtn} ${styles.modalActDanger}`}><IcoTrash />Delete File</button>}
          {item.action === 'quarantined' && <button className={styles.modalActBtn}><IcoEye />View in Quarantine</button>}
          <button className={styles.modalActBtn}><IcoShield />Mark False Positive</button>
        </div>
      </div>
    </Overlay>
  )
}

export function ClamAVSection() {
  const [selected, setSelected] = useState<MalwareFinding|null>(null)
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div className={styles.scoreRow} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
        {CLAMAV_STATS.map(s => <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} color={s.color} />)}
      </div>

      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <button className={styles.iconBtn}><IcoPlay />Run Full Scan</button>
        <button className={styles.iconBtn}><IcoRefresh />Update Definitions</button>
        <button className={styles.iconBtn}><IcoEye />View Quarantine</button>
      </div>

      {MALWARE_FINDINGS.length > 0 && (
        <div style={{ background:'rgba(255,77,77,0.07)', border:'1px solid rgba(255,77,77,0.2)', borderRadius:8, padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
          <svg viewBox="0 0 20 20" fill="none" stroke="#ff4d4d" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" style={{ flexShrink:0 }}><path d="M10 2l8 16H2z"/><line x1="10" y1="9" x2="10" y2="13"/><circle cx="10" cy="15.5" r=".6" fill="#ff4d4d" stroke="none"/></svg>
          <span style={{ fontSize:13, color:'var(--color-text-muted)' }}><strong style={{ color:'#ff4d4d' }}>{MALWARE_FINDINGS.length} malware findings</strong> detected. Immediate action required.</span>
        </div>
      )}

      <div className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionHeadLeft}><span className={styles.sectionTitle}>Malware Findings</span></div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Severity</th>
                <th className={styles.th}>Signature</th>
                <th className={styles.th}>File Path</th>
                <th className={styles.th}>Size</th>
                <th className={styles.th}>Action</th>
                <th className={styles.th}>Detected</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {MALWARE_FINDINGS.map(f => (
                <tr key={f.id} className={styles.tr} onClick={()=>setSelected(f)}>
                  <td className={styles.td}><SevBadge sev={f.severity} /></td>
                  <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'#fc8181', fontWeight:600 }}>{f.signature}</td>
                  <td className={`${styles.td} ${styles.tdCode}`} style={{ fontSize:11, color:'var(--color-text-muted)' }}>{f.filePath}</td>
                  <td className={`${styles.td} ${styles.tdCode}`}>{f.size}</td>
                  <td className={styles.td}>
                    <span style={{ fontSize:10.5, fontWeight:600, padding:'2px 7px', borderRadius:4,
                      background: f.action==='deleted'?'rgba(104,211,145,0.1)':f.action==='quarantined'?'rgba(246,173,85,0.1)':'rgba(99,179,237,0.1)',
                      color: f.action==='deleted'?'#68d391':f.action==='quarantined'?'#f6ad55':'#63b3ed',
                      border:`1px solid ${f.action==='deleted'?'rgba(104,211,145,0.25)':f.action==='quarantined'?'rgba(246,173,85,0.25)':'rgba(99,179,237,0.25)'}` }}>
                      {f.action.charAt(0).toUpperCase()+f.action.slice(1)}
                    </span>
                  </td>
                  <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'var(--color-text-dim)' }}>{f.timestamp}</td>
                  <td className={styles.td} onClick={e=>e.stopPropagation()}>
                    <div className={styles.actionBtns}>
                      <button className={`${styles.actBtn} ${styles.actBtnDanger}`} onClick={()=>setSelected(f)}><IcoTrash />Delete</button>
                      <button className={styles.actBtn} onClick={()=>setSelected(f)}><IcoEye />Details</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selected && <MalwareModal item={selected} onClose={()=>setSelected(null)} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// DOCKER SECURITY SECTION
// ═══════════════════════════════════════════════════════════════
function DockerModal({ c, onClose }: { c: DockerContainer; onClose:()=>void }) {
  const m = SEV_META[c.riskLevel]
  return (
    <Overlay onClose={onClose}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <SevBadge sev={c.riskLevel} />
          <div className={styles.modalHeadInfo}>
            <div className={styles.modalTitle}>{c.name}</div>
            <div className={styles.modalSub}>{c.image} · {c.status}</div>
          </div>
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.detailGrid}>
            {[
              ['Container',      c.name],
              ['Image',          c.image],
              ['Status',         c.status],
              ['Privileged',     c.privileged ? 'YES (elevated risk)' : 'No'],
              ['Root User',      c.rootUser   ? 'YES (root)' : 'No'],
              ['Exposed Ports',  c.exposedPorts.join(', ') || 'None'],
              ['Capabilities',   c.capabilities.join(', ') || 'Default only'],
              ['CVEs Found',     String(c.vulnerabilities)],
              ['Risk Level',     m.label],
            ].map(([k,v])=>(
              <React.Fragment key={k}><span className={styles.detailKey}>{k}</span><span className={styles.detailVal}>{v}</span></React.Fragment>
            ))}
          </div>
          {(c.privileged || c.rootUser) && (
            <div style={{ background:'rgba(255,77,77,0.07)', border:'1px solid rgba(255,77,77,0.2)', borderRadius:7, padding:'10px 12px' }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#ff4d4d', marginBottom:6 }}>Remediation</div>
              {c.privileged && <div className={styles.codeBlock} style={{ fontSize:11 }}>{`# Remove privileged flag:\ndocker update --privileged=false ${c.name}`}</div>}
              {c.rootUser && <p style={{ fontSize:12, color:'var(--color-text-dim)', marginTop:6 }}>Add USER directive to Dockerfile to run as non-root user.</p>}
            </div>
          )}
        </div>
        <div className={styles.modalActions}>
          <button className={`${styles.modalActBtn} ${styles.modalActPrimary}`}><IcoShield />Run Trivy Scan</button>
          <button className={styles.modalActBtn}><IcoEye />View Compose File</button>
          {c.status === 'running' && <button className={`${styles.modalActBtn} ${styles.modalActDanger}`}><IcoBlock />Stop Container</button>}
        </div>
      </div>
    </Overlay>
  )
}

export function DockerSecSection() {
  const [selected, setSelected] = useState<DockerContainer|null>(null)
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div className={styles.scoreRow} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
        {DOCKER_STATS.map(s => <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} color={s.color} />)}
      </div>
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <button className={styles.iconBtn}><IcoRefresh />Scan All Images</button>
        <button className={styles.iconBtn}><IcoShield />CIS Benchmark</button>
      </div>
      <div className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionHeadLeft}><span className={styles.sectionTitle}>Container Security Audit</span></div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Risk</th>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>Image</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Privileged</th>
                <th className={styles.th}>Root User</th>
                <th className={styles.th}>CVEs</th>
                <th className={styles.th}>Ports</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {DOCKER_CONTAINERS.map(c => (
                <tr key={c.id} className={styles.tr} onClick={()=>setSelected(c)}>
                  <td className={styles.td}><SevBadge sev={c.riskLevel} /></td>
                  <td className={`${styles.td} ${styles.tdCode}`} style={{ fontWeight:600 }}>{c.name}</td>
                  <td className={`${styles.td} ${styles.tdCode}`} style={{ fontSize:11, color:'var(--color-text-dim)' }}>{c.image}</td>
                  <td className={styles.td}>
                    <span style={{ fontSize:10.5, padding:'2px 7px', borderRadius:4, fontWeight:600,
                      background:c.status==='running'?'rgba(104,211,145,0.1)':c.status==='stopped'?'rgba(99,179,237,0.1)':'rgba(246,173,85,0.1)',
                      color:c.status==='running'?'#68d391':c.status==='stopped'?'#63b3ed':'#f6ad55',
                      border:`1px solid ${c.status==='running'?'rgba(104,211,145,0.25)':c.status==='stopped'?'rgba(99,179,237,0.25)':'rgba(246,173,85,0.25)'}` }}>
                      {c.status}
                    </span>
                  </td>
                  <td className={styles.td}>
                    {c.privileged ? <span style={{ color:'#ff4d4d', fontWeight:700 }}>⚠ YES</span> : <span style={{ color:'#68d391' }}>No</span>}
                  </td>
                  <td className={styles.td}>
                    {c.rootUser ? <span style={{ color:'#f6ad55', fontWeight:700 }}>⚠ YES</span> : <span style={{ color:'#68d391' }}>No</span>}
                  </td>
                  <td className={`${styles.td} ${styles.tdCode}`} style={{ color: c.vulnerabilities>0?'#ff4d4d':'#68d391', fontWeight:700 }}>{c.vulnerabilities}</td>
                  <td className={`${styles.td} ${styles.tdCode}`} style={{ fontSize:11 }}>{c.exposedPorts.join(', ') || '—'}</td>
                  <td className={styles.td} onClick={e=>e.stopPropagation()}>
                    <button className={styles.actBtn} onClick={()=>setSelected(c)}><IcoEye />Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selected && <DockerModal c={selected} onClose={()=>setSelected(null)} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TRIVY SECTION
// ═══════════════════════════════════════════════════════════════
function TrivyModal({ vuln, onClose }: { vuln: TrivyVuln; onClose:()=>void }) {
  const sev = vuln.severity.toLowerCase() as Severity
  return (
    <Overlay onClose={onClose}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <SevBadge sev={sev} />
          <div className={styles.modalHeadInfo}>
            <div className={styles.modalTitle}>{vuln.cveId}</div>
            <div className={styles.modalSub}>{vuln.pkg} · {vuln.image}</div>
          </div>
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.descBlock}>{vuln.title}</p>
          <div className={styles.detailGrid}>
            {[['CVE ID',vuln.cveId],['Image',vuln.image],['Package',vuln.pkg],['Installed',vuln.installedVersion],['Fixed In',vuln.fixedVersion || 'No fix available'],['Severity',vuln.severity]].map(([k,v])=>(
              <React.Fragment key={k}><span className={styles.detailKey}>{k}</span><span className={styles.detailVal}>{v}</span></React.Fragment>
            ))}
          </div>
          {vuln.fixedVersion && (
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--color-text-dim)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Remediation</div>
              <div className={styles.codeBlock}>{`# Rebuild with newer base image or update package:\ndocker pull ${vuln.image.split(':')[0]}:latest`}</div>
            </div>
          )}
        </div>
        <div className={styles.modalActions}>
          <button className={`${styles.modalActBtn} ${styles.modalActPrimary}`}><IcoShield />Update Image</button>
          <button className={styles.modalActBtn}><IcoEye />View on NVD</button>
          <button className={styles.modalActBtn}><IcoBlock />Mark Accepted Risk</button>
        </div>
      </div>
    </Overlay>
  )
}

export function TrivySection() {
  const [selected, setSelected] = useState<TrivyVuln|null>(null)
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div className={styles.scoreRow} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
        {TRIVY_STATS.map(s => <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} color={s.color} />)}
      </div>
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <button className={styles.iconBtn}><IcoPlay />Scan All Images</button>
        <button className={styles.iconBtn}><IcoEye />Export SBOM</button>
      </div>
      <div className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionHeadLeft}><span className={styles.sectionTitle}>Container Image Vulnerabilities</span></div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Severity</th>
                <th className={styles.th}>CVE ID</th>
                <th className={styles.th}>Image</th>
                <th className={styles.th}>Package</th>
                <th className={styles.th}>Installed</th>
                <th className={styles.th}>Fixed In</th>
                <th className={styles.th}>Description</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {TRIVY_VULNS.map(v => {
                const sev = v.severity.toLowerCase() as Severity
                return (
                  <tr key={v.id} className={styles.tr} onClick={()=>setSelected(v)}>
                    <td className={styles.td}><SevBadge sev={sev} /></td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'var(--color-accent)', fontWeight:600 }}>{v.cveId}</td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ fontSize:11 }}>{v.image}</td>
                    <td className={`${styles.td} ${styles.tdCode}`}>{v.pkg}</td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'#fc8181' }}>{v.installedVersion}</td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color: v.fixedVersion!=='none'?'#68d391':'var(--color-text-dim)' }}>{v.fixedVersion}</td>
                    <td className={styles.td} style={{ fontSize:11, color:'var(--color-text-dim)', maxWidth:200 }}>{v.title}</td>
                    <td className={styles.td} onClick={e=>e.stopPropagation()}>
                      <button className={`${styles.actBtn} ${styles.actBtnFix}`} onClick={()=>setSelected(v)}><IcoEye />Details</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {selected && <TrivyModal vuln={selected} onClose={()=>setSelected(null)} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// AUTH / MFA SECTION
// ═══════════════════════════════════════════════════════════════
function SessionModal({ session, onClose }: { session: UserSession; onClose:()=>void }) {
  return (
    <Overlay onClose={onClose}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <div style={{ width:36, height:36, borderRadius:8, background:'rgba(99,179,237,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, color:'#63b3ed', flexShrink:0 }}>
            {session.username[0]?.toUpperCase()}
          </div>
          <div className={styles.modalHeadInfo}>
            <div className={styles.modalTitle}>{session.username}</div>
            <div className={styles.modalSub}>{session.device} · {session.location}</div>
          </div>
          {session.current && <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:4, background:'rgba(104,211,145,0.15)', color:'#68d391', border:'1px solid rgba(104,211,145,0.3)' }}>CURRENT SESSION</span>}
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.detailGrid}>
            {[['Username',session.username],['IP Address',session.ip],['Device',session.device],['Browser',session.browser],['Location',session.location],['Last Seen',session.lastSeen],['MFA',session.mfaEnabled?'Enabled':'Disabled']].map(([k,v])=>(
              <React.Fragment key={k}><span className={styles.detailKey}>{k}</span><span className={styles.detailVal}>{v}</span></React.Fragment>
            ))}
          </div>
          {!session.mfaEnabled && (
            <div style={{ background:'rgba(246,173,85,0.07)', border:'1px solid rgba(246,173,85,0.25)', borderRadius:7, padding:'10px 12px' }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#f6ad55', marginBottom:4 }}>MFA Not Enabled</div>
              <p style={{ fontSize:12, color:'var(--color-text-dim)', margin:0 }}>This account is not protected by MFA. Consider enabling TOTP or WebAuthn.</p>
            </div>
          )}
        </div>
        <div className={styles.modalActions}>
          {!session.current && <button className={`${styles.modalActBtn} ${styles.modalActDanger}`}><IcoBlock />Revoke Session</button>}
          {!session.mfaEnabled && <button className={`${styles.modalActBtn} ${styles.modalActPrimary}`}><IcoKey />Enable MFA</button>}
          <button className={styles.modalActBtn}><IcoEye />View Activity</button>
        </div>
      </div>
    </Overlay>
  )
}

export function AuthMFASection() {
  const [activeTab, setActiveTab] = useState<'sessions'|'failed'>('sessions')
  const [selected, setSelected]   = useState<UserSession|null>(null)
  const reasonLabel = (r: FailedLogin['reason']) =>
    r==='wrong_password'?'Wrong password':r==='mfa_failed'?'MFA failed':r==='account_locked'?'Account locked':'IP blocked'

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div className={styles.scoreRow} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
        {AUTH_STATS.map(s => <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} color={s.color} />)}
      </div>

      <div className={styles.tabBar} style={{ gap:4 }}>
        {(['sessions','failed'] as const).map(t => (
          <button key={t} className={`${styles.tab} ${activeTab===t?styles.tabActive:''}`} onClick={()=>setActiveTab(t)}>
            {t==='sessions'?'Active Sessions':'Failed Logins'}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <button className={styles.iconBtn}><IcoKey />Enable MFA</button>
        <button className={styles.iconBtn}><IcoBlock />Revoke All</button>
      </div>

      {activeTab==='sessions' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadLeft}><span className={styles.sectionTitle}>Active Sessions</span><span className={styles.resultCount}><strong>{USER_SESSIONS.length}</strong> sessions</span></div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>User</th>
                  <th className={styles.th}>IP Address</th>
                  <th className={styles.th}>Device</th>
                  <th className={styles.th}>Browser</th>
                  <th className={styles.th}>Location</th>
                  <th className={styles.th}>Last Seen</th>
                  <th className={styles.th}>MFA</th>
                  <th className={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {USER_SESSIONS.map(s => (
                  <tr key={s.id} className={styles.tr} onClick={()=>setSelected(s)}>
                    <td className={styles.td}>
                      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                        <div style={{ width:26, height:26, borderRadius:6, background:'rgba(99,179,237,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#63b3ed' }}>
                          {s.username[0]?.toUpperCase()}
                        </div>
                        <span style={{ fontWeight:600, fontSize:12.5 }}>{s.username}</span>
                        {s.current && <span style={{ fontSize:8, fontWeight:700, padding:'1px 4px', borderRadius:3, background:'rgba(104,211,145,0.15)', color:'#68d391', border:'1px solid rgba(104,211,145,0.3)' }}>YOU</span>}
                      </div>
                    </td>
                    <td className={`${styles.td} ${styles.tdCode}`}>{s.ip}</td>
                    <td className={styles.td} style={{ fontSize:11.5 }}>{s.device}</td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ fontSize:11 }}>{s.browser}</td>
                    <td className={styles.td} style={{ fontSize:11.5 }}>{s.location}</td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'var(--color-text-dim)', fontSize:11 }}>{s.lastSeen}</td>
                    <td className={styles.td}>
                      {s.mfaEnabled
                        ? <span style={{ fontSize:10.5, padding:'2px 7px', borderRadius:4, background:'rgba(104,211,145,0.1)', color:'#68d391', border:'1px solid rgba(104,211,145,0.25)', fontWeight:600 }}>MFA On</span>
                        : <span style={{ fontSize:10.5, padding:'2px 7px', borderRadius:4, background:'rgba(246,173,85,0.1)', color:'#f6ad55', border:'1px solid rgba(246,173,85,0.25)', fontWeight:600 }}>Off</span>
                      }
                    </td>
                    <td className={styles.td} onClick={e=>e.stopPropagation()}>
                      <div className={styles.actionBtns}>
                        {!s.current && <button className={`${styles.actBtn} ${styles.actBtnDanger}`}><IcoBlock />Revoke</button>}
                        <button className={styles.actBtn} onClick={()=>setSelected(s)}><IcoEye />View</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab==='failed' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadLeft}><span className={styles.sectionTitle}>Failed Login Attempts</span><span className={styles.resultCount}><strong>{FAILED_LOGINS.length}</strong> recent</span></div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>Username</th>
                  <th className={styles.th}>IP Address</th>
                  <th className={styles.th}>Country</th>
                  <th className={styles.th}>Reason</th>
                  <th className={styles.th}>Timestamp</th>
                  <th className={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {FAILED_LOGINS.map(f => (
                  <tr key={f.id} className={styles.tr}>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ fontWeight:600 }}>{f.username}</td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'#fc8181' }}>{f.ip}</td>
                    <td className={styles.td}><span className={styles.catChip}>{f.country}</span></td>
                    <td className={styles.td}>
                      <span style={{ fontSize:10.5, padding:'2px 7px', borderRadius:4, fontWeight:600,
                        background: f.reason==='mfa_failed'?'rgba(99,179,237,0.1)':f.reason==='ip_blocked'?'rgba(104,211,145,0.1)':'rgba(255,77,77,0.1)',
                        color: f.reason==='mfa_failed'?'#63b3ed':f.reason==='ip_blocked'?'#68d391':'#ff4d4d',
                        border:`1px solid ${f.reason==='mfa_failed'?'rgba(99,179,237,0.25)':f.reason==='ip_blocked'?'rgba(104,211,145,0.25)':'rgba(255,77,77,0.25)'}` }}>
                        {reasonLabel(f.reason)}
                      </span>
                    </td>
                    <td className={`${styles.td} ${styles.tdCode}`} style={{ color:'var(--color-text-dim)' }}>{f.timestamp}</td>
                    <td className={styles.td}>
                      <div className={styles.actionBtns}>
                        <button className={`${styles.actBtn} ${styles.actBtnDanger}`}><IcoBlock />Ban IP</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {selected && <SessionModal session={selected} onClose={()=>setSelected(null)} />}
    </div>
  )
}
