import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPlugin } from './pluginsData'
import {
  fetchPlugin, enablePlugin, disablePlugin, installPlugin, uninstallPlugin,
  restartPlugin, updatePluginConfig, updatePluginPortConfig, fetchPluginLogs,
  type ApiPlugin,
} from '@/lib/api'
import { toastSuccess, toastError, toastInfo, toastWarn } from '@/store/toast'
import styles from './PluginsPage.module.css'
import wazuhLogoSrc from '@/assets/wazuh.svg'
import crowdsecLogoSrc from '@/assets/crowdsec.svg'
import fail2banLogoSrc from '@/assets/fail2ban.png'
import suricataLogoSrc from '@/assets/suricata.svg'

const IcoBack    = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="10,3 5,8 10,13"/></svg>
const IcoPlay    = () => <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><polygon points="5,3 17,10 5,17"/></svg>
const IcoStop    = () => <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><rect x="4" y="4" width="12" height="12" rx="1.5"/></svg>
const IcoRefresh = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M17 10a7 7 0 0 1-7 7 7 7 0 0 1-5-2"/><polyline points="2,10 3,15 8,14"/></svg>
const IcoTrash   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><polyline points="3,6 17,6"/><path d="M8 6V4h4v2"/><rect x="4" y="6" width="12" height="12" rx="1.5"/></svg>
const IcoLink    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M11 3h6v6"/><path d="M17 3l-7 7"/><path d="M9 5H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-4"/></svg>
const IcoCopy    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><rect x="8" y="8" width="9" height="9" rx="1.5"/><path d="M3 12V4a1 1 0 0 1 1-1h8"/></svg>
const IcoCheck   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><polyline points="4,10 8,14 16,6"/></svg>
const IcoPackage = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M10 2l7 4v8l-7 4-7-4V6z"/><polyline points="3.27,6.96 10,11.01 16.73,6.96"/><line x1="10" y1="11" x2="10" y2="18"/></svg>
const IcoWarn    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M10 2l8 16H2z"/><line x1="10" y1="9" x2="10" y2="13"/><circle cx="10" cy="15.5" r=".6" fill="currentColor" stroke="none"/></svg>
const IcoX       = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
const IcoPort    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><rect x="2" y="6" width="16" height="10" rx="1.5"/><path d="M6 6V4M10 6V4M14 6V4"/><circle cx="10" cy="11" r="1.5" fill="currentColor" stroke="none"/></svg>
const IcoPlus    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg>

const CAT_COLORS: Record<string, string> = {
  'threat-protection': '#ff4d4d',
  'monitoring':        '#a78bfa',
  'scanning':          '#63b3ed',
  'network':           '#f6ad55',
  'compliance':        '#68d391',
}

const STATUS_CFG = {
  enabled:       { label:'Enabled',       color:'#68d391', bg:'rgba(104,211,145,0.12)', border:'rgba(104,211,145,0.3)', dot:'#68d391' },
  disabled:      { label:'Disabled',      color:'var(--color-text-dim)', bg:'var(--color-surface)', border:'var(--color-border)', dot:'#666' },
  installing:    { label:'Installing…',   color:'#63b3ed', bg:'rgba(99,179,237,0.12)', border:'rgba(99,179,237,0.3)', dot:'#63b3ed' },
  error:         { label:'Error',         color:'#ff4d4d', bg:'rgba(255,77,77,0.12)', border:'rgba(255,77,77,0.3)', dot:'#ff4d4d' },
  not_installed: { label:'Not Installed', color:'#f6ad55', bg:'rgba(246,173,85,0.08)', border:'rgba(246,173,85,0.25)', dot:'#f6ad55' },
}

type DetailTab = 'overview' | 'config' | 'ports' | 'logs'

function getDedicatedPage(id: string): string | undefined {
  if (id === 'fail2ban' || id.startsWith('fail2ban'))  return '/plugins/fail2ban'
  if (id === 'github-actions' || id === 'git-actions') return '/plugins/github-actions'
  if (id === 'crowdsec' || id.startsWith('crowdsec'))  return '/plugins/crowdsec'
  if (id === 'wazuh' || id.startsWith('wazuh'))        return '/plugins/wazuh'
  if (id === 'suricata' || id.startsWith('suricata'))  return '/plugins/suricata'
  return undefined
}

function getPluginIcon(id: string, color: string, size = 28) {
  const props = { width: size, height: size, stroke: color, fill: 'none', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (id.startsWith('fail2ban'))  return <img src={fail2banLogoSrc} alt="Fail2Ban" style={{ width: size, height: size, objectFit: 'contain' }} />
  if (id.startsWith('crowdsec')) return <img src={crowdsecLogoSrc} alt="CrowdSec" style={{ width: size, height: size, objectFit: 'contain' }} />
  if (id.startsWith('wazuh'))    return <img src={wazuhLogoSrc} alt="Wazuh" style={{ width: size, height: size, objectFit: 'contain' }} />
  if (id.startsWith('suricata')) return <img src={suricataLogoSrc} alt="Suricata" style={{ width: size, height: size, objectFit: 'contain' }} />
  if (id.startsWith('clamav'))   return <svg viewBox="0 0 20 20" {...props}><circle cx="10" cy="10" r="7"/><path d="M7 10l2 2 4-4"/></svg>
  if (id.startsWith('trivy'))    return <svg viewBox="0 0 20 20" {...props}><rect x="3" y="3" width="14" height="14" rx="2"/><circle cx="10" cy="10" r="3"/></svg>
  if (id.startsWith('docker'))   return <svg viewBox="0 0 20 20" {...props}><rect x="2" y="9" width="3" height="3" rx=".5"/><rect x="6" y="9" width="3" height="3" rx=".5"/><rect x="10" y="9" width="3" height="3" rx=".5"/><rect x="10" y="5" width="3" height="3" rx=".5"/><rect x="6" y="5" width="3" height="3" rx=".5"/></svg>
  if (id.startsWith('lynis') || id.startsWith('rkhunter')) return <svg viewBox="0 0 20 20" {...props}><path d="M9 3H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8l-4-5z"/><polyline points="9,3 9,8 14,8"/><line x1="7" y1="12" x2="13" y2="12"/></svg>
  return null
}

function deriveStatus(api: ApiPlugin) {
  if (api.install_status === 'not_installed') return 'not_installed' as const
  if (api.install_status === 'installing')    return 'installing' as const
  if (api.install_status === 'error')         return 'error' as const
  return (api.enabled ? 'enabled' : 'disabled') as 'enabled' | 'disabled'
}

// ─── Confirm modal ────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:8000, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:7, width:'100%', maxWidth:420, boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 18px', borderBottom:'1px solid var(--color-border)' }}>
          <span style={{ color: danger ? '#ff4d4d' : '#f6ad55' }}><IcoWarn /></span>
          <span style={{ fontWeight:700, fontSize:14, color:'var(--color-text)' }}>{title}</span>
          <button onClick={onCancel} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'var(--color-text-dim)', display:'flex' }}><IcoX /></button>
        </div>
        <div style={{ padding:'18px 18px 14px', fontSize:13, color:'var(--color-text-muted)', lineHeight:1.5 }}>{message}</div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', padding:'0 18px 16px' }}>
          <button onClick={onCancel} style={{ background:'none', border:'1px solid var(--color-border)', borderRadius:7, padding:'6px 14px', fontSize:12.5, color:'var(--color-text-dim)', cursor:'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ borderRadius:7, padding:'6px 14px', fontSize:12.5, fontWeight:600, cursor:'pointer', border:'none', background: danger ? '#ff4d4d' : 'var(--color-accent)', color:'#fff' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Default port configs for known plugins ───────────────────────────────────
const DEFAULT_PORT_DEFS: Record<string, { port: number; protocol: 'tcp'|'udp'; purpose: string }[]> = {
  'crowdsec':       [{ port: 8080, protocol: 'tcp', purpose: 'Local API' }, { port: 6060, protocol: 'tcp', purpose: 'Prometheus metrics' }],
  'wazuh':          [{ port: 1514, protocol: 'tcp', purpose: 'Agent communication' }, { port: 1515, protocol: 'tcp', purpose: 'Agent registration' }, { port: 55000, protocol: 'tcp', purpose: 'REST API' }],
  'suricata':       [{ port: 6343, protocol: 'udp', purpose: 'NetFlow input' }],
  'fail2ban-monitor': [],
}

export default function PluginDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc       = useQueryClient()

  const dedicatedPage = id ? getDedicatedPage(id) : undefined

  useEffect(() => {
    if (dedicatedPage) navigate(dedicatedPage, { replace: true })
  }, [dedicatedPage, navigate])

  const plugin = getPlugin(id ?? '')
  const [tab, setTab]           = useState<DetailTab>('overview')
  const [copied, setCopied]     = useState(false)
  const [configValues, setConfigValues] = useState<Record<string, string | number | boolean>>(
    () => Object.fromEntries((plugin?.config ?? []).map(f => [f.key, f.value]))
  )
  const [portRows, setPortRows] = useState<{ port: string; protocol: string; purpose: string }[]>([])
  const [portSaved, setPortSaved] = useState(false)
  const [confirm, setConfirm] = useState<null | 'disable' | 'uninstall'>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // ── Live API data ──
  const { data: livePlugin } = useQuery({
    queryKey: ['plugin', id],
    queryFn: () => fetchPlugin(id!),
    enabled: !!id && !dedicatedPage,
    refetchInterval: 10000,
  })

  // Initialize port rows from API data
  useEffect(() => {
    if (livePlugin && portRows.length === 0) {
      try {
        const pc = JSON.parse(livePlugin.config || '{}')
        if (Array.isArray(pc.ports)) {
          setPortRows(pc.ports)
          return
        }
      } catch { /* ignore */ }
      // Use defaults
      const defs = DEFAULT_PORT_DEFS[livePlugin.plugin_id] ?? []
      setPortRows(defs.map(d => ({ port: String(d.port), protocol: d.protocol, purpose: d.purpose })))
    }
  }, [livePlugin])

  const { data: liveLogs = [], refetch: refetchLogs } = useQuery({
    queryKey: ['plugin-logs', id],
    queryFn: () => fetchPluginLogs(id!, 200),
    enabled: !!id && tab === 'logs' && !dedicatedPage,
    refetchInterval: tab === 'logs' ? 10000 : false,
  })

  const mutRestart = useMutation({
    mutationFn: () => restartPlugin(id!),
    onSuccess: r => {
      if (r.ok) toastSuccess('Plugin restarted', plugin?.name)
      else toastError('Restart failed', r.output)
    },
    onError: () => toastError('Restart failed'),
  })

  const mutInstall = useMutation({
    mutationFn: () => installPlugin(id!),
    onSuccess: () => {
      toastInfo('Installing…', `${plugin?.name ?? id} is being installed`)
      setTimeout(() => qc.invalidateQueries({ queryKey: ['plugin', id] }), 2000)
      setTimeout(() => qc.invalidateQueries({ queryKey: ['plugins'] }), 2000)
    },
    onError: () => toastError('Install failed', plugin?.name),
  })

  const mutEnable = useMutation({
    mutationFn: () => enablePlugin(id!),
    onSuccess: () => {
      toastSuccess('Plugin enabled', plugin?.name)
      qc.invalidateQueries({ queryKey: ['plugin', id] })
      qc.invalidateQueries({ queryKey: ['plugins'] })
    },
    onError: () => toastError('Enable failed', plugin?.name),
  })

  const mutDisable = useMutation({
    mutationFn: () => disablePlugin(id!),
    onSuccess: () => {
      toastWarn('Plugin disabled', plugin?.name)
      qc.invalidateQueries({ queryKey: ['plugin', id] })
      qc.invalidateQueries({ queryKey: ['plugins'] })
    },
    onError: () => toastError('Disable failed', plugin?.name),
  })

  const mutUninstall = useMutation({
    mutationFn: () => uninstallPlugin(id!),
    onSuccess: () => {
      toastSuccess('Plugin uninstalled', plugin?.name)
      qc.invalidateQueries({ queryKey: ['plugins'] })
      navigate('/plugins')
    },
    onError: () => toastError('Uninstall failed', plugin?.name),
  })

  const mutSaveConfig = useMutation({
    mutationFn: () => updatePluginConfig(id!, configValues),
    onSuccess: () => toastSuccess('Configuration saved', plugin?.name),
    onError: () => toastError('Save failed'),
  })

  const mutSavePorts = useMutation({
    mutationFn: () => updatePluginPortConfig(id!, { ports: portRows }),
    onSuccess: () => { toastSuccess('Port config saved'); setPortSaved(true); setTimeout(() => setPortSaved(false), 2000) },
    onError: () => toastError('Port save failed'),
  })

  useEffect(() => {
    if (tab === 'logs' && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [liveLogs, tab])

  if (dedicatedPage) {
    return (
      <div className={styles.detailPage}>
        <div className={styles.backLink} onClick={() => navigate('/plugins')}><IcoBack /> Plugins</div>
        <div style={{ textAlign:'center', padding:'60px 0', color:'var(--color-text-dim)', fontSize:13 }}>Redirecting…</div>
      </div>
    )
  }

  if (!plugin) {
    return (
      <div className={styles.detailPage}>
        <div className={styles.backLink} onClick={() => navigate('/plugins')}><IcoBack /> Plugins</div>
        <div style={{ textAlign:'center', padding:'60px 0', color:'var(--color-text-dim)' }}>Plugin not found.</div>
      </div>
    )
  }

  const status    = livePlugin ? deriveStatus(livePlugin) : (plugin.status as keyof typeof STATUS_CFG)
  const catColor  = CAT_COLORS[plugin.category] ?? '#63b3ed'
  const scfg      = STATUS_CFG[status]
  const isEnabled = status === 'enabled'
  const isInstalling = status === 'installing'
  const isNotInstalled = status === 'not_installed'
  const isInstalled = livePlugin ? livePlugin.install_status === 'installed' : true
  const icon      = getPluginIcon(plugin.id, catColor)

  function copyInstall() {
    navigator.clipboard.writeText(plugin?.installCommand ?? '').catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const logColor = (lvl: string) =>
    lvl === 'error' ? '#ff4d4d' : lvl === 'warn' ? '#f6ad55' : 'var(--color-text-dim)'

  const isBusy = mutInstall.isPending || mutEnable.isPending || mutDisable.isPending || mutUninstall.isPending

  function doConfirm() {
    if (confirm === 'disable') mutDisable.mutate()
    else if (confirm === 'uninstall') mutUninstall.mutate()
    setConfirm(null)
  }

  const defaultPortDefs = DEFAULT_PORT_DEFS[plugin.id] ?? []

  return (
    <div className={styles.detailPage}>
      <div className={styles.backLink} onClick={() => navigate('/plugins')}>
        <IcoBack /> Plugins
      </div>

      {/* Header card */}
      <div className={styles.detailHeader}>
        <div className={styles.detailAccent} style={{ background: catColor + '20', color: catColor }}>
          {icon ?? plugin.shortName}
        </div>
        <div className={styles.detailMeta}>
          <div className={styles.detailName}>{plugin.name}</div>
          <div className={styles.detailVerRow}>
            <span className={styles.detailVer}>v{livePlugin?.version ?? plugin.version}</span>
            <span className={styles.detailVer}>·</span>
            <span className={styles.detailVer}>{plugin.author}</span>
            <span className={styles.detailVer}>·</span>
            <span className={styles.detailVer}>{plugin.size}</span>
            <span className={styles.detailLicense}>{plugin.license}</span>
            <span className={styles.statusChip} style={{ background:scfg.bg, color:scfg.color, border:`1px solid ${scfg.border}` }}>
              <span className={styles.statusDot} style={{ background:scfg.dot }} />{scfg.label}
            </span>
          </div>
          <p className={styles.detailDesc}>{plugin.longDescription}</p>

          <div className={styles.detailActions}>
            {/* Primary action based on state */}
            {isNotInstalled && (
              <button className={styles.btnPrimary} onClick={() => mutInstall.mutate()} disabled={isBusy}>
                {mutInstall.isPending ? 'Installing…' : <><IcoPackage />Install & Enable</>}
              </button>
            )}
            {isEnabled && !isNotInstalled && (
              <button className={styles.btnDanger} onClick={() => setConfirm('disable')} disabled={isBusy}>
                <IcoStop />Disable
              </button>
            )}
            {status === 'disabled' && isInstalled && (
              <button className={styles.btnPrimary} onClick={() => mutEnable.mutate()} disabled={isBusy}>
                <IcoPlay />Enable
              </button>
            )}
            {status === 'error' && (
              <button className={styles.btnPrimary} onClick={() => mutInstall.mutate()} disabled={isBusy}>
                <IcoPackage />Retry Install
              </button>
            )}

            {/* Restart */}
            <button className={styles.btnSecondary} onClick={() => mutRestart.mutate()} disabled={mutRestart.isPending || !isEnabled}>
              <IcoRefresh />{mutRestart.isPending ? 'Restarting…' : 'Restart'}
            </button>

            {/* Website */}
            {plugin.website && (
              <button className={styles.btnSecondary} onClick={() => window.open(plugin.website, '_blank')}>
                <IcoLink />Website
              </button>
            )}

            {/* Uninstall */}
            {isInstalled && (
              <button className={styles.btnDanger} style={{ borderColor:'rgba(255,77,77,0.3)', background:'rgba(255,77,77,0.08)' }}
                onClick={() => setConfirm('uninstall')} disabled={isBusy}>
                <IcoTrash />Uninstall
              </button>
            )}
          </div>
        </div>

        <div className={styles.detailHeaderRight}>
          <div className={styles.bigToggle}>
            <span className={styles.bigToggleLabel} style={{ color: isEnabled ? '#68d391' : 'var(--color-text-dim)' }}>
              {isInstalling ? 'Installing…' : isEnabled ? 'Running' : 'Stopped'}
            </span>
            <label className={styles.bigToggleTrack} onClick={() => {
              if (isBusy || isInstalling) return
              if (isNotInstalled) mutInstall.mutate()
              else if (isEnabled) setConfirm('disable')
              else mutEnable.mutate()
            }}>
              <input type="checkbox" readOnly checked={isEnabled || isInstalling} />
              <span className={styles.bigToggleTrackBg} />
              <span className={styles.bigToggleThumb} />
            </label>
          </div>
          <div style={{ fontSize:10, color:'var(--color-text-dim)', textAlign:'right' }}>
            {plugin.category.replace('-',' ')}
          </div>
        </div>
      </div>

      {/* Not installed banner */}
      {isNotInstalled && (
        <div className={styles.notInstalledBanner}>
          <IcoPackage />
          <div className={styles.notInstalledText}>
            <div className={styles.notInstalledTitle}>{plugin.name} is not installed</div>
            <div className={styles.notInstalledSub}>Click "Install & Enable" to install automatically, or run the command below on your server.</div>
          </div>
          <button className={styles.btnPrimary} onClick={() => mutInstall.mutate()} disabled={isBusy}>
            {mutInstall.isPending ? 'Installing…' : 'Install Now'}
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className={styles.detailTabBar}>
        {(['overview','config','ports','logs'] as DetailTab[]).map(t => (
          <button key={t} className={`${styles.detailTab} ${tab===t?styles.detailTabActive:''}`} onClick={() => setTab(t)}>
            {t === 'overview' ? 'Overview' : t === 'config' ? 'Configuration' : t === 'ports' ? 'Ports' : 'Logs'}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div className={styles.detailGrid2}>
          <div className={styles.detailCard}>
            <div className={styles.detailCardTitle}>Service Info</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {[
                { k:'Status',    v: scfg.label },
                { k:'Version',   v: `v${livePlugin?.version ?? plugin.version}` },
                { k:'Author',    v: plugin.author },
                { k:'License',   v: plugin.license },
                { k:'Size',      v: plugin.size },
                { k:'Category',  v: plugin.category.replace('-',' ') },
              ].map(r => (
                <div key={r.k} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12 }}>
                  <span style={{ color:'var(--color-text-dim)', minWidth:80 }}>{r.k}</span>
                  <span style={{ fontFamily:'monospace', fontSize:11.5 }}>{r.v}</span>
                </div>
              ))}
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12 }}>
                <span style={{ color:'var(--color-text-dim)', minWidth:80 }}>Website</span>
                <span style={{ color:'#4a9eff', cursor:'pointer', textDecoration:'underline', fontSize:12 }} onClick={() => window.open(plugin.website,'_blank')}>{plugin.website}</span>
              </div>
            </div>
          </div>

          <div className={styles.detailCard}>
            <div className={styles.detailCardTitle}>Features</div>
            <div className={styles.featureList}>
              {plugin.features.map(f => (
                <div key={f} className={styles.featureItem}>
                  <div className={styles.featureCheck}>
                    <svg viewBox="0 0 20 20" fill="none" stroke={catColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><polyline points="4,10 8,14 16,6"/></svg>
                  </div>
                  {f}
                </div>
              ))}
            </div>
          </div>

          <div className={styles.detailCard}>
            <div className={styles.detailCardTitle}>Install Command</div>
            <div className={styles.installBlock}>{plugin.installCommand}</div>
            <button className={styles.btnSecondary} style={{ marginTop:12, width:'fit-content' }} onClick={copyInstall}>
              {copied ? <><IcoCheck />Copied!</> : <><IcoCopy />Copy command</>}
            </button>
          </div>

          <div className={styles.detailCard}>
            <div className={styles.detailCardTitle}>Dependencies</div>
            {plugin.dependencies.length === 0
              ? <div style={{ fontSize:12, color:'var(--color-text-dim)' }}>No external dependencies required.</div>
              : <div className={styles.depList}>
                  {plugin.dependencies.map(d => <div key={d} className={styles.depItem}>{d}</div>)}
                </div>
            }
            <div style={{ marginTop:14 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--color-text-dim)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:7 }}>Tags</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                {plugin.tags.map(t => (
                  <span key={t} style={{ fontSize:10, padding:'3px 8px', background:'var(--color-bg,#0d1117)', border:'1px solid var(--color-border)', borderRadius:5, color:'var(--color-text-dim)' }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Config tab */}
      {tab === 'config' && (
        <div className={styles.detailCard}>
          <div className={styles.detailCardTitle}>Configuration</div>
          <div className={styles.configForm}>
            {plugin.config.map(field => (
              <div key={field.key} className={styles.configField}>
                <label className={styles.configLabel} htmlFor={field.key}>{field.label}</label>
                <div className={styles.configDesc}>{field.description}</div>
                {field.type === 'boolean' ? (
                  <div className={styles.configCheckbox}>
                    <input id={field.key} type="checkbox"
                      checked={Boolean(configValues[field.key])}
                      onChange={e => setConfigValues(prev => ({ ...prev, [field.key]: e.target.checked }))}
                      style={{ width:15, height:15, cursor:'pointer', accentColor:'#63b3ed' }}
                    />
                    <span style={{ fontSize:12, color:'var(--color-text-muted)' }}>
                      {configValues[field.key] ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                ) : field.type === 'select' ? (
                  <select id={field.key} className={styles.configSelect}
                    value={String(configValues[field.key])}
                    onChange={e => setConfigValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                  >
                    {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input id={field.key} className={styles.configInput}
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={String(configValues[field.key])}
                    onChange={e => setConfigValues(prev => ({ ...prev, [field.key]: field.type==='number' ? Number(e.target.value) : e.target.value }))}
                  />
                )}
              </div>
            ))}
            {plugin.config.length === 0 && (
              <div style={{ fontSize:12.5, color:'var(--color-text-dim)' }}>No configuration options for this plugin.</div>
            )}
            {plugin.config.length > 0 && (
              <button className={styles.configSave} onClick={() => mutSaveConfig.mutate()} disabled={mutSaveConfig.isPending}>
                {mutSaveConfig.isPending ? 'Saving…' : 'Save Configuration'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Ports tab */}
      {tab === 'ports' && (
        <div className={styles.detailCard}>
          <div className={styles.detailCardTitle} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ display:'flex', alignItems:'center', gap:7 }}><IcoPort />Port Configuration</span>
            <button className={styles.btnSecondary} style={{ fontSize:11, padding:'4px 10px' }}
              onClick={() => setPortRows(prev => [...prev, { port: '', protocol: 'tcp', purpose: '' }])}>
              <IcoPlus />Add Port
            </button>
          </div>
          <div style={{ fontSize:12, color:'var(--color-text-dim)', marginBottom:14, lineHeight:1.5 }}>
            Configure which ports this plugin listens on. This is used for documentation and firewall rule suggestions.
            {defaultPortDefs.length > 0 && (
              <> Default ports for {plugin.name}: {defaultPortDefs.map(d => `${d.port}/${d.protocol}`).join(', ')}.</>
            )}
          </div>

          {portRows.length === 0 ? (
            <div style={{ fontSize:12.5, color:'var(--color-text-dim)', textAlign:'center', padding:'28px 0' }}>
              No port definitions. Click "Add Port" to add one.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 1fr 32px', gap:8, fontSize:10.5, fontWeight:700, color:'var(--color-text-dim)', textTransform:'uppercase', letterSpacing:'.06em', padding:'0 2px' }}>
                <span>Port</span><span>Protocol</span><span>Purpose</span><span></span>
              </div>
              {portRows.map((row, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 100px 1fr 32px', gap:8, alignItems:'center' }}>
                  <input
                    type="number"
                    value={row.port}
                    onChange={e => setPortRows(prev => prev.map((r,j) => j===i ? { ...r, port: e.target.value } : r))}
                    placeholder="e.g. 8080"
                    style={{ background:'var(--color-bg)', border:'1px solid var(--color-border)', borderRadius:7, padding:'6px 10px', color:'var(--color-text)', fontSize:12, fontFamily:'monospace' }}
                  />
                  <select
                    value={row.protocol}
                    onChange={e => setPortRows(prev => prev.map((r,j) => j===i ? { ...r, protocol: e.target.value } : r))}
                    style={{ background:'var(--color-bg)', border:'1px solid var(--color-border)', borderRadius:7, padding:'6px 8px', color:'var(--color-text)', fontSize:12 }}
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                    <option value="both">TCP+UDP</option>
                  </select>
                  <input
                    value={row.purpose}
                    onChange={e => setPortRows(prev => prev.map((r,j) => j===i ? { ...r, purpose: e.target.value } : r))}
                    placeholder="Purpose / description"
                    style={{ background:'var(--color-bg)', border:'1px solid var(--color-border)', borderRadius:7, padding:'6px 10px', color:'var(--color-text)', fontSize:12 }}
                  />
                  <button onClick={() => setPortRows(prev => prev.filter((_,j) => j !== i))}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,77,77,0.6)', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:5, padding:4 }}
                    onMouseEnter={e => (e.currentTarget.style.color='#ff4d4d')}
                    onMouseLeave={e => (e.currentTarget.style.color='rgba(255,77,77,0.6)')}>
                    <IcoX />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button className={styles.configSave} onClick={() => mutSavePorts.mutate()} disabled={mutSavePorts.isPending}>
              {mutSavePorts.isPending ? 'Saving…' : portSaved ? 'Saved!' : 'Save Port Config'}
            </button>
          </div>
        </div>
      )}

      {/* Logs tab */}
      {tab === 'logs' && (
        <div className={styles.detailCard}>
          <div className={styles.detailCardTitle} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span>Service Logs</span>
            <button className={styles.btnSecondary} style={{ fontSize:11, padding:'4px 9px' }} onClick={() => refetchLogs()}><IcoRefresh />Refresh</button>
          </div>
          {liveLogs.length === 0
            ? <div className={styles.logEmpty}>No logs available. Plugin may not be installed or running.</div>
            : <div className={styles.logList} ref={logRef}>
                {liveLogs.map((l, i) => (
                  <div key={i} className={styles.logEntry}>
                    <span className={styles.logTime}>{l.time}</span>
                    <span className={styles.logLvl} style={{ color: logColor(l.level) }}>{l.level.toUpperCase()}</span>
                    <span className={styles.logMsg}>{l.message}</span>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmModal
          title={confirm === 'disable' ? `Disable ${plugin.name}` : `Uninstall ${plugin.name}`}
          message={confirm === 'disable'
            ? `Are you sure you want to disable ${plugin.name}? It will stop running but remain installed.`
            : `Are you sure you want to uninstall ${plugin.name}? This will stop and remove the plugin from this system.`}
          confirmLabel={confirm === 'disable' ? 'Disable' : 'Uninstall'}
          danger
          onConfirm={doConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
