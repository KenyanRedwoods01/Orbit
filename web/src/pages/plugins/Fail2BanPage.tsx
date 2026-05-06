import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchF2bStatus, fetchF2bJails, fetchF2bBans, fetchF2bLogs,
  fetchF2bConfig, fetchF2bWhitelist, fetchF2bStats,
  f2bBanIP, f2bUnbanIP, f2bUnbanGlobal, f2bService,
  f2bSaveConfig, f2bAddWhitelist, f2bRemoveWhitelist, f2bInstall,
  fetchPlugins,
  type F2bJail, type F2bBan, type F2bLogEntry, type F2bStat,
} from '@/lib/api'
import styles from './Fail2BanPage.module.css'

// ── Icons ──────────────────────────────────────────────────────────────────────
const IcoBack    = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="10,3 5,8 10,13"/></svg>
const IcoShield  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5z"/></svg>
const IcoBan     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" width="13" height="13"><circle cx="10" cy="10" r="7"/><line x1="4.2" y1="4.2" x2="15.8" y2="15.8"/></svg>
const IcoUnban   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><polyline points="4,10 8,14 16,6"/></svg>
const IcoRefresh = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M17 10a7 7 0 0 1-7 7 7 7 0 0 1-5-2"/><polyline points="2,10 3,15 8,14"/></svg>
const IcoPlay    = () => <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11"><polygon points="5,3 17,10 5,17"/></svg>
const IcoStop    = () => <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11"><rect x="4" y="4" width="12" height="12" rx="1.5"/></svg>
const IcoPlus    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><line x1="10" y1="3" x2="10" y2="17"/><line x1="3" y1="10" x2="17" y2="10"/></svg>
const IcoTrash   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><polyline points="3,6 17,6"/><path d="M8 6V4h4v2"/><rect x="4" y="6" width="12" height="12" rx="1.5"/></svg>
const IcoSave    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M17 17H3V3h10l4 4z"/><rect x="7" y="11" width="6" height="6" rx=".5"/><rect x="6" y="3" width="7" height="4" rx=".5"/></svg>
const IcoCopy    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><rect x="8" y="8" width="9" height="9" rx="1.5"/><path d="M3 12V4a1 1 0 0 1 1-1h8"/></svg>
const IcoPackage = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M10 2l7 4v8l-7 4-7-4V6z"/></svg>
const IcoList    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" width="13" height="13"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></svg>
const IcoGlobe   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><circle cx="10" cy="10" r="8"/><path d="M2 10h16M10 2a14 14 0 0 1 0 16M10 2a14 14 0 0 0 0 16"/></svg>

type Tab = 'overview' | 'jails' | 'bans' | 'whitelist' | 'config' | 'logs'

// ── Mini bar chart ─────────────────────────────────────────────────────────────
function BanChart({ stats }: { stats: F2bStat[] }) {
  const max = Math.max(1, ...stats.map(s => s.bans))
  const W = 320, H = 56, pad = 4, barW = Math.floor((W - pad * 2) / Math.max(stats.length, 1)) - 2
  return (
    <svg width={W} height={H} style={{ display:'block' }}>
      {stats.map((s, i) => {
        const h = Math.max(2, Math.round((s.bans / max) * (H - 20)))
        const x = pad + i * (barW + 2)
        const y = H - h - 14
        return (
          <g key={s.date}>
            <rect x={x} y={y} width={barW} height={h} rx={2} fill={s.bans > 0 ? '#f6ad55' : 'rgba(255,255,255,0.06)'} />
            {i % 2 === 0 && (
              <text x={x + barW / 2} y={H - 2} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={8}>
                {s.date.slice(5)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Status dot ────────────────────────────────────────────────────────────────
function Dot({ color }: { color: string }) {
  return <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%', background:color, marginRight:5, flexShrink:0 }} />
}

export default function Fail2BanPage() {
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const [tab, setTab]           = useState<Tab>('overview')
  const { data: allPlugins = [] } = useQuery({ queryKey: ['plugins'], queryFn: fetchPlugins, staleTime: 60000 })
  const f2bPlugin = allPlugins.find(p => p.plugin_id === 'fail2ban-monitor' || p.plugin_id.startsWith('fail2ban'))
  const pluginWarning = f2bPlugin
    ? (f2bPlugin.install_status === 'not_installed' ? 'not_installed' : !f2bPlugin.enabled ? 'disabled' : null)
    : null
  const [banIP, setBanIP]       = useState('')
  const [banJail, setBanJail]   = useState('sshd')
  const [wlInput, setWlInput]   = useState('')
  const [rawConfig, setRawConfig] = useState('')
  const [toast, setToast]       = useState<string | null>(null)
  const [installLog, setInstallLog] = useState<string | null>(null)
  const toastRef = useRef<ReturnType<typeof setTimeout>>()

  const showToast = (msg: string) => {
    setToast(msg)
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), 3000)
  }

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['f2b-status'], queryFn: fetchF2bStatus, refetchInterval: 10000,
  })
  const { data: jails = [] } = useQuery({
    queryKey: ['f2b-jails'], queryFn: fetchF2bJails, refetchInterval: 15000,
    enabled: status?.installed && status?.running,
  })
  const { data: bans = [] } = useQuery({
    queryKey: ['f2b-bans'], queryFn: fetchF2bBans, refetchInterval: 15000,
    enabled: status?.installed && status?.running,
  })
  const { data: logs = [] } = useQuery({
    queryKey: ['f2b-logs'], queryFn: () => fetchF2bLogs(200), refetchInterval: 20000,
    enabled: tab === 'logs' && status?.installed,
  })
  const { data: cfg } = useQuery({
    queryKey: ['f2b-config'], queryFn: fetchF2bConfig, enabled: tab === 'config',
  })
  const { data: whitelist } = useQuery({
    queryKey: ['f2b-whitelist'], queryFn: fetchF2bWhitelist, enabled: tab === 'whitelist',
  })
  const { data: stats = [] } = useQuery({
    queryKey: ['f2b-stats'], queryFn: fetchF2bStats, refetchInterval: 60000,
    enabled: status?.installed,
  })

  useEffect(() => { if (cfg?.raw && !rawConfig) setRawConfig(cfg.raw) }, [cfg])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['f2b-status'] })
    qc.invalidateQueries({ queryKey: ['f2b-jails'] })
    qc.invalidateQueries({ queryKey: ['f2b-bans'] })
  }

  const mutService = useMutation({
    mutationFn: (action: string) => f2bService(action),
    onSuccess: (r) => { showToast(r.ok ? 'Done' : 'Error: ' + r.output); setTimeout(invalidate, 1500) },
  })
  const mutUnban = useMutation({
    mutationFn: ({ ip, jail }: { ip: string; jail?: string }) => f2bUnbanGlobal(ip, jail),
    onSuccess: () => { showToast('IP unbanned'); invalidate() },
  })
  const mutBan = useMutation({
    mutationFn: ({ ip, jail }: { ip: string; jail: string }) => f2bBanIP(jail, ip),
    onSuccess: () => { showToast('IP banned'); setBanIP(''); invalidate() },
  })
  const mutWlAdd = useMutation({
    mutationFn: (ip: string) => f2bAddWhitelist(ip),
    onSuccess: () => { showToast('Added to whitelist'); setWlInput(''); qc.invalidateQueries({ queryKey: ['f2b-whitelist'] }) },
  })
  const mutWlRemove = useMutation({
    mutationFn: (ip: string) => f2bRemoveWhitelist(ip),
    onSuccess: () => { showToast('Removed from whitelist'); qc.invalidateQueries({ queryKey: ['f2b-whitelist'] }) },
  })
  const mutSaveCfg = useMutation({
    mutationFn: () => f2bSaveConfig(rawConfig),
    onSuccess: (r) => showToast(r.ok ? 'Config saved & reloaded' : 'Save failed: ' + r.output),
  })
  const mutInstall = useMutation({
    mutationFn: f2bInstall,
    onSuccess: (r) => {
      setInstallLog(r.output)
      if (r.ok) { showToast('Fail2Ban installed!'); invalidate() }
      else showToast('Install failed — see log')
    },
  })

  const isRunning  = status?.running ?? false
  const totalBanned = bans.length || status?.total_banned || 0
  const bansToday  = stats.find(s => s.date === new Date().toISOString().slice(0,10))?.bans ?? 0

  if (statusLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.backLink} onClick={() => navigate('/plugins')}><IcoBack /> Plugins</div>
        <div className={styles.loading}>Loading Fail2Ban…</div>
      </div>
    )
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview',   label: 'Overview' },
    { id: 'jails',      label: `Jails (${jails.length})` },
    { id: 'bans',       label: `Banned IPs (${totalBanned})` },
    { id: 'whitelist',  label: 'Whitelist' },
    { id: 'config',     label: 'Config' },
    { id: 'logs',       label: 'Logs' },
  ]

  const logColor = (level: string) =>
    level === 'error' ? '#ff4d4d' : level === 'warn' || level === 'warning' ? '#f6ad55' : 'rgba(255,255,255,0.4)'

  const actionColor = (action: string) =>
    action === 'ban' ? '#ff4d4d' : action === 'unban' ? '#68d391' : action === 'found' ? '#f6ad55' : 'rgba(255,255,255,0.3)'

  return (
    <div className={styles.page}>
      {/* Toast */}
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* Back */}
      <div className={styles.backLink} onClick={() => navigate('/plugins')}><IcoBack /> Plugins</div>

      {/* Plugin status warning */}
      {pluginWarning && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', marginBottom:4, borderRadius:7, border:'1px solid', fontSize:12.5, lineHeight:1.45,
          background: pluginWarning === 'not_installed' ? 'rgba(246,173,85,0.08)' : 'rgba(255,77,77,0.07)',
          borderColor: pluginWarning === 'not_installed' ? 'rgba(246,173,85,0.3)' : 'rgba(255,77,77,0.25)',
          color: pluginWarning === 'not_installed' ? '#f6ad55' : '#ff8080' }}>
          <IcoPackage />
          <div>
            <strong>Fail2Ban plugin {pluginWarning === 'not_installed' ? 'not installed' : 'is disabled'}.</strong>
            {' '}{pluginWarning === 'not_installed'
              ? 'Install it from the Plugins page to enable full integration.'
              : 'Enable it in the Plugins page to restore full integration.'}
          </div>
          <button onClick={() => navigate('/plugins')}
            style={{ marginLeft:'auto', background:'none', border:'1px solid currentColor', borderRadius:6, padding:'3px 10px', fontSize:11, cursor:'pointer', color:'inherit', whiteSpace:'nowrap' }}>
            Go to Plugins
          </button>
        </div>
      )}

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <IcoShield />
          F2B
        </div>
        <div className={styles.headerMeta}>
          <div className={styles.headerTitle}>Fail2Ban</div>
          <div className={styles.headerSub}>
            {status?.installed ? (
              <>v{status.version || '0.11.x'} · Brute-force protection · {jails.length} jail{jails.length !== 1 ? 's' : ''}</>
            ) : (
              <>Not installed</>
            )}
          </div>
          <div className={styles.headerBadges}>
            {status?.installed ? (
              <span className={styles.badge} style={{ background: isRunning ? 'rgba(104,211,145,0.15)' : 'rgba(255,77,77,0.15)', color: isRunning ? '#68d391' : '#ff4d4d', border: `1px solid ${isRunning ? 'rgba(104,211,145,0.3)' : 'rgba(255,77,77,0.3)'}` }}>
                <Dot color={isRunning ? '#68d391' : '#ff4d4d'} />
                {isRunning ? 'Running' : 'Stopped'}
              </span>
            ) : (
              <span className={styles.badge} style={{ background: 'rgba(246,173,85,0.12)', color: '#f6ad55', border: '1px solid rgba(246,173,85,0.3)' }}>
                <Dot color="#f6ad55" /> Not Installed
              </span>
            )}
            <span className={styles.badge} style={{ background: 'rgba(255,77,77,0.08)', color: '#ff8c00', border: '1px solid rgba(255,77,77,0.2)' }}>
              {totalBanned} banned
            </span>
          </div>
        </div>
        <div className={styles.headerActions}>
          {status?.installed && (
            <>
              {isRunning ? (
                <button className={styles.btnDanger} onClick={() => mutService.mutate('stop')} disabled={mutService.isPending}>
                  <IcoStop />Stop
                </button>
              ) : (
                <button className={styles.btnPrimary} onClick={() => mutService.mutate('start')} disabled={mutService.isPending}>
                  <IcoPlay />Start
                </button>
              )}
              <button className={styles.btnSecondary} onClick={() => mutService.mutate('restart')} disabled={mutService.isPending}>
                <IcoRefresh />Restart
              </button>
              <button className={styles.btnSecondary} onClick={() => mutService.mutate('reload')} disabled={mutService.isPending}>
                Reload
              </button>
            </>
          )}
        </div>
      </div>

      {/* Not installed */}
      {!status?.installed && (
        <div className={styles.notInstalled}>
          <div className={styles.notInstalledIcon}><IcoPackage /></div>
          <div className={styles.notInstalledBody}>
            <div className={styles.notInstalledTitle}>Fail2Ban is not installed</div>
            <div className={styles.notInstalledSub}>Fail2Ban protects your server from brute-force attacks by monitoring logs and banning offending IPs. Click below to install automatically, or run the command manually.</div>
            <div className={styles.installCmd}>sudo apt-get install -y fail2ban</div>
            <button className={styles.btnPrimary} onClick={() => mutInstall.mutate()} disabled={mutInstall.isPending} style={{ marginTop: 14 }}>
              <IcoPackage />
              {mutInstall.isPending ? 'Installing…' : 'Install Fail2Ban'}
            </button>
          </div>

          {/* Feature cards */}
          <div className={styles.featSection}>
            <div className={styles.featSectionTitle}>What Fail2Ban Can Do</div>
            <div className={styles.featGrid}>
              {[
                { color: '#ff4d4d', title: 'Brute-Force Protection',   desc: 'Automatically bans IPs that exceed the retry threshold across SSH, HTTP, FTP, and custom services via iptables or nftables.' },
                { color: '#f6ad55', title: 'Real-Time Log Monitoring', desc: 'Continuously tails system log files and applies regex filters to detect attack patterns as they happen.' },
                { color: '#63b3ed', title: 'Flexible Jail System',     desc: 'Define isolated jails per service with independent ban times, max-retry counts, and target log paths.' },
                { color: '#68d391', title: 'IP Whitelisting',          desc: 'Permanently exempt trusted IPs and CIDR ranges from bans using the ignoreip directive in jail configuration.' },
                { color: '#a78bfa', title: 'Multi-Protocol Support',   desc: 'Supports SSH, HTTP/S, FTP, SMTP, IMAP, POP3, and any custom service with parseable log output.' },
                { color: '#4a9eff', title: 'Firewall Integration',     desc: 'Ban actions are enforced at kernel level via iptables, nftables, ipset, or firewalld for maximum performance.' },
              ].map(f => (
                <div key={f.title} className={styles.featCard}>
                  <div className={styles.featAccent} style={{ background: f.color }} />
                  <div className={styles.featTitle}>{f.title}</div>
                  <div className={styles.featDesc}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {installLog && (
            <div className={styles.installLog}>
              <div className={styles.installLogTitle}>Installation Output</div>
              <pre className={styles.installLogPre}>{installLog}</pre>
            </div>
          )}
        </div>
      )}

      {status?.installed && (
        <>
          {/* Tabs */}
          <div className={styles.tabBar}>
            {tabs.map(t => (
              <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Overview ── */}
          {tab === 'overview' && (
            <div className={styles.content}>
              {/* Stat cards */}
              <div className={styles.statsRow}>
                {[
                  { label: 'Jails Active',    value: status.jail_count ?? jails.length, color: '#63b3ed' },
                  { label: 'Currently Banned', value: totalBanned,                        color: '#f6ad55' },
                  { label: 'Total Failed',     value: status.total_failed,               color: '#ff8c00' },
                  { label: 'Bans Today',       value: bansToday,                          color: '#ff4d4d' },
                ].map(s => (
                  <div key={s.label} className={styles.statCard}>
                    <div className={styles.statVal} style={{ color: s.color }}>{s.value}</div>
                    <div className={styles.statLbl}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Ban chart */}
              {stats.length > 0 && (
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Bans — Last 7 Days</div>
                  <div style={{ padding: '8px 0 4px' }}>
                    <BanChart stats={stats} />
                  </div>
                </div>
              )}

              {/* Jail summary */}
              {jails.length > 0 && (
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Active Jails</div>
                  <table className={styles.table}>
                    <thead>
                      <tr><th>Jail</th><th>Banned</th><th>Failed</th><th>Max Retry</th><th>Ban Time</th><th>Find Time</th></tr>
                    </thead>
                    <tbody>
                      {jails.map(j => (
                        <tr key={j.name} className={styles.tableRow} onClick={() => setTab('jails')}>
                          <td><span className={styles.jailName}>{j.name}</span></td>
                          <td><span style={{ color: j.banned_ips.length > 0 ? '#f6ad55' : 'inherit' }}>{j.banned_ips.length}</span></td>
                          <td>{j.currently_failed}</td>
                          <td>{j.max_retry}</td>
                          <td>{j.ban_time >= 3600 ? `${(j.ban_time/3600).toFixed(0)}h` : j.ban_time >= 60 ? `${(j.ban_time/60).toFixed(0)}m` : `${j.ban_time}s`}</td>
                          <td>{j.find_time >= 3600 ? `${(j.find_time/3600).toFixed(0)}h` : j.find_time >= 60 ? `${(j.find_time/60).toFixed(0)}m` : `${j.find_time}s`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Info */}
              <div className={styles.card}>
                <div className={styles.cardTitle}>Service Info</div>
                <div className={styles.infoGrid}>
                  {[
                    ['Version',     status.version || '—'],
                    ['Config File', status.config_file],
                    ['Socket',      status.socket_path],
                    ['Database',    status.db_path],
                    ['Status',      isRunning ? 'Running' : 'Stopped'],
                  ].map(([k, v]) => (
                    <div key={k} className={styles.infoRow}>
                      <span className={styles.infoKey}>{k}</span>
                      <span className={styles.infoVal}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Feature / Capability Cards */}
              <div className={styles.featSection}>
                <div className={styles.featSectionTitle}>Capabilities</div>
                <div className={styles.featGrid}>
                  {[
                    { color: '#ff4d4d', title: 'Brute-Force Protection',    desc: 'Automatically bans IPs that exceed the retry threshold across SSH, HTTP, FTP, and custom services via iptables or nftables.' },
                    { color: '#f6ad55', title: 'Real-Time Log Monitoring',  desc: 'Continuously tails system log files and applies regex filters to detect attack patterns as they happen.' },
                    { color: '#63b3ed', title: 'Flexible Jail System',      desc: 'Define isolated jails per service with independent ban times, max-retry counts, and target log paths.' },
                    { color: '#68d391', title: 'IP Whitelisting',           desc: 'Permanently exempt trusted IPs and CIDR ranges from bans using the ignoreip directive in jail configuration.' },
                    { color: '#a78bfa', title: 'Multi-Protocol Support',    desc: 'Supports SSH, HTTP/S, FTP, SMTP, IMAP, POP3, and any custom service with parseable log output.' },
                    { color: '#4a9eff', title: 'Firewall Integration',      desc: 'Ban actions are enforced at kernel level via iptables, nftables, ipset, or firewalld for maximum performance.' },
                  ].map(f => (
                    <div key={f.title} className={styles.featCard}>
                      <div className={styles.featAccent} style={{ background: f.color }} />
                      <div className={styles.featTitle}>{f.title}</div>
                      <div className={styles.featDesc}>{f.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Jails ── */}
          {tab === 'jails' && (
            <div className={styles.content}>
              {jails.length === 0 ? (
                <div className={styles.empty}>No active jails found. Make sure Fail2Ban is running.</div>
              ) : (
                jails.map(j => <JailCard key={j.name} jail={j} onBan={(ip) => mutBan.mutate({ ip, jail: j.name })} onUnban={(ip) => mutUnban.mutate({ ip, jail: j.name })} />)
              )}
            </div>
          )}

          {/* ── Bans ── */}
          {tab === 'bans' && (
            <div className={styles.content}>
              <div className={styles.card}>
                <div className={styles.cardTitle} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span>Banned IPs</span>
                  <button className={styles.btnRefresh} onClick={() => qc.invalidateQueries({ queryKey: ['f2b-bans'] })}><IcoRefresh /></button>
                </div>
                {/* Ban an IP */}
                <div className={styles.banForm}>
                  <input className={styles.input} placeholder="IP to ban (e.g. 1.2.3.4)" value={banIP} onChange={e => setBanIP(e.target.value)} />
                  <select className={styles.select} value={banJail} onChange={e => setBanJail(e.target.value)}>
                    {jails.map(j => <option key={j.name} value={j.name}>{j.name}</option>)}
                  </select>
                  <button className={styles.btnDanger} onClick={() => banIP && mutBan.mutate({ ip: banIP, jail: banJail })} disabled={!banIP || mutBan.isPending}>
                    <IcoBan /> Ban
                  </button>
                </div>
                {bans.length === 0 ? (
                  <div className={styles.empty}>No IPs are currently banned.</div>
                ) : (
                  <table className={styles.table}>
                    <thead><tr><th>IP Address</th><th>Jail</th><th>Failures</th><th>Actions</th></tr></thead>
                    <tbody>
                      {bans.map((b, i) => (
                        <tr key={i} className={styles.tableRow}>
                          <td><code className={styles.ipCode}>{b.ip}</code></td>
                          <td><span className={styles.jailBadge}>{b.jail}</span></td>
                          <td>{b.failures || '—'}</td>
                          <td>
                            <button className={styles.btnIconGreen} onClick={() => mutUnban.mutate({ ip: b.ip, jail: b.jail })} disabled={mutUnban.isPending} title="Unban">
                              <IcoUnban />
                            </button>
                            <button className={styles.btnIconBlue} onClick={() => { setWlInput(b.ip); setTab('whitelist') }} title="Add to whitelist">
                              <IcoGlobe />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── Whitelist ── */}
          {tab === 'whitelist' && (
            <div className={styles.content}>
              <div className={styles.card}>
                <div className={styles.cardTitle}>IP Whitelist (ignoreip)</div>
                <div className={styles.wlNote}>IPs in this list will never be banned by Fail2Ban. This updates the ignoreip setting in jail configuration.</div>
                <div className={styles.banForm} style={{ marginBottom: 16 }}>
                  <input className={styles.input} placeholder="Add IP or CIDR (e.g. 10.0.0.0/8)" value={wlInput} onChange={e => setWlInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && wlInput && mutWlAdd.mutate(wlInput)} />
                  <button className={styles.btnPrimary} onClick={() => wlInput && mutWlAdd.mutate(wlInput)} disabled={!wlInput || mutWlAdd.isPending}>
                    <IcoPlus /> Add
                  </button>
                </div>
                {(!whitelist?.ips || whitelist.ips.length === 0) ? (
                  <div className={styles.empty}>No custom IPs in whitelist. 127.0.0.1 is always ignored by default.</div>
                ) : (
                  <div className={styles.wlList}>
                    {whitelist.ips.map(ip => (
                      <div key={ip} className={styles.wlItem}>
                        <code className={styles.ipCode}>{ip}</code>
                        <button className={styles.btnIconRed} onClick={() => mutWlRemove.mutate(ip)} title="Remove">
                          <IcoTrash />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {whitelist?.raw && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4, textTransform:'uppercase', letterSpacing:'.06em' }}>Raw ignoreip value</div>
                    <code className={styles.rawCode}>{whitelist.raw}</code>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Config ── */}
          {tab === 'config' && (
            <div className={styles.content}>
              <div className={styles.card}>
                <div className={styles.cardTitle} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span>Configuration Editor</span>
                  <div style={{ display:'flex', gap:6 }}>
                    <button className={styles.btnSecondary} onClick={() => { navigator.clipboard.writeText(rawConfig).catch(()=>{}) }}><IcoCopy /> Copy</button>
                    <button className={styles.btnPrimary} onClick={() => mutSaveCfg.mutate()} disabled={mutSaveCfg.isPending}><IcoSave /> {mutSaveCfg.isPending ? 'Saving…' : 'Save & Reload'}</button>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>Editing /etc/fail2ban/jail.local — will auto-reload on save</div>
                <textarea
                  className={styles.configEditor}
                  value={rawConfig}
                  onChange={e => setRawConfig(e.target.value)}
                  spellCheck={false}
                />
                {/* Parsed fields */}
                {cfg && (
                  <div className={styles.cfgParsed}>
                    <div className={styles.cfgParsedTitle}>Parsed Global Settings</div>
                    <div className={styles.infoGrid}>
                      {[
                        ['Ban Time',   cfg.ban_time || '—'],
                        ['Find Time',  cfg.find_time || '—'],
                        ['Max Retry',  cfg.max_retry || '—'],
                        ['Backend',    cfg.backend || '—'],
                        ['Use DNS',    cfg.use_dns || '—'],
                        ['Log Level',  cfg.log_level || '—'],
                        ['Ignore IP',  cfg.ignore_ip || '—'],
                      ].map(([k, v]) => (
                        <div key={k} className={styles.infoRow}>
                          <span className={styles.infoKey}>{k}</span>
                          <span className={styles.infoVal}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Logs ── */}
          {tab === 'logs' && (
            <div className={styles.content}>
              <div className={styles.card}>
                <div className={styles.cardTitle} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span>Fail2Ban Logs</span>
                  <button className={styles.btnRefresh} onClick={() => qc.invalidateQueries({ queryKey: ['f2b-logs'] })}><IcoRefresh /></button>
                </div>
                {logs.length === 0 ? (
                  <div className={styles.empty}>No log entries found. Check {status.config_file} for the log path.</div>
                ) : (
                  <div className={styles.logList}>
                    {logs.map((l, i) => (
                      <div key={i} className={styles.logEntry}>
                        <span className={styles.logTime}>{l.timestamp?.slice(0,19) || '—'}</span>
                        <span className={styles.logLevel} style={{ color: logColor(l.level) }}>{(l.level || 'info').toUpperCase()}</span>
                        {l.action && <span className={styles.logAction} style={{ color: actionColor(l.action) }}>{l.action.toUpperCase()}</span>}
                        {l.jail && <span className={styles.logJail}>[{l.jail}]</span>}
                        {l.ip && <span className={styles.logIP}>{l.ip}</span>}
                        <span className={styles.logMsg}>{l.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Jail Card Component ────────────────────────────────────────────────────────
function JailCard({ jail, onBan, onUnban }: { jail: F2bJail; onBan: (ip:string)=>void; onUnban: (ip:string)=>void }) {
  const [expanded, setExpanded] = useState(false)
  const [banIP, setBanIP] = useState('')
  const hasBanned = jail.banned_ips.length > 0

  return (
    <div className={styles.jailCard}>
      <div className={styles.jailCardHead} onClick={() => setExpanded(!expanded)}>
        <div className={styles.jailCardLeft}>
          <span className={styles.jailName}>{jail.name}</span>
          {hasBanned && <span className={styles.jailBanCount}>{jail.banned_ips.length} banned</span>}
          {jail.currently_failed > 0 && <span className={styles.jailFailCount}>{jail.currently_failed} failing</span>}
        </div>
        <div className={styles.jailCardRight}>
          <span className={styles.jailStat}><span style={{ color:'rgba(255,255,255,0.4)' }}>retry</span> {jail.max_retry}</span>
          <span className={styles.jailStat}><span style={{ color:'rgba(255,255,255,0.4)' }}>ban</span> {jail.ban_time >= 3600 ? `${(jail.ban_time/3600).toFixed(0)}h` : `${Math.floor(jail.ban_time/60)}m`}</span>
          <span className={styles.jailStat}><span style={{ color:'rgba(255,255,255,0.4)' }}>find</span> {jail.find_time >= 3600 ? `${(jail.find_time/3600).toFixed(0)}h` : `${Math.floor(jail.find_time/60)}m`}</span>
          <span className={styles.expandChevron} style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}>›</span>
        </div>
      </div>
      {expanded && (
        <div className={styles.jailCardBody}>
          <div className={styles.jailMeta}>
            {jail.filter && <div className={styles.jailMetaItem}><span>Filter</span><code>{jail.filter}</code></div>}
            {jail.log_path && <div className={styles.jailMetaItem}><span>Log Path</span><code>{jail.log_path}</code></div>}
            {jail.actions?.length > 0 && <div className={styles.jailMetaItem}><span>Actions</span><span>{jail.actions.join(', ')}</span></div>}
          </div>
          {/* Ban form */}
          <div className={styles.jailBanForm}>
            <input className={styles.input} placeholder="Ban IP…" value={banIP} onChange={e => setBanIP(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && banIP) { onBan(banIP); setBanIP('') } }} />
            <button className={styles.btnDanger} onClick={() => { if (banIP) { onBan(banIP); setBanIP('') } }} disabled={!banIP} style={{ fontSize:11 }}>
              <IcoBan /> Ban IP
            </button>
          </div>
          {/* Banned IPs */}
          {jail.banned_ips.length > 0 && (
            <div className={styles.bannedList}>
              {jail.banned_ips.map(ip => (
                <div key={ip} className={styles.bannedItem}>
                  <code className={styles.ipCode}>{ip}</code>
                  <button className={styles.btnIconGreen} onClick={() => onUnban(ip)} title="Unban"><IcoUnban /></button>
                </div>
              ))}
            </div>
          )}
          {jail.banned_ips.length === 0 && <div className={styles.jailNoBans}>No IPs currently banned in this jail.</div>}
        </div>
      )}
    </div>
  )
}
