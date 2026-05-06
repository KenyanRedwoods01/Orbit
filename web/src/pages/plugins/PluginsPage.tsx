import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchPlugins, enablePlugin, disablePlugin, installPlugin, uninstallPlugin,
  type ApiPlugin,
} from '@/lib/api'
import { toastSuccess, toastError, toastInfo } from '@/store/toast'
import { PLUGINS } from './pluginsData'
import styles from './PluginsPage.module.css'
import wazuhLogoSrc from '@/assets/wazuh.svg'
import crowdsecLogoSrc from '@/assets/crowdsec.svg'
import fail2banLogoSrc from '@/assets/fail2ban.png'
import suricataLogoSrc from '@/assets/suricata.svg'

const IcoSearch  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="17" y2="17"/></svg>
const IcoPuzzle  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h6v2a2 2 0 0 0 2 2h2v6h-2a2 2 0 0 0-2 2v2H7v-2a2 2 0 0 0-2-2H3V7h2a2 2 0 0 0 2-2V3z"/></svg>
const IcoArrow   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="10" x2="17" y2="10"/><polyline points="12,5 17,10 12,15"/></svg>
const IcoCheck   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,10 8,14 16,6"/></svg>
const IcoX       = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
const IcoWarn    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l8 16H2z"/><line x1="10" y1="9" x2="10" y2="13"/><circle cx="10" cy="15.5" r=".6" fill="currentColor" stroke="none"/></svg>
const IcoFilter  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h14M6 10h8M9 15h2"/></svg>
const IcoTrash   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,6 17,6"/><path d="M8 6V4h4v2"/><rect x="4" y="6" width="12" height="12" rx="1.5"/></svg>
const IcoPackage = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l7 4v8l-7 4-7-4V6z"/><polyline points="3.27,6.96 10,11.01 16.73,6.96"/><line x1="10" y1="11" x2="10" y2="18"/></svg>
const IcoPlay    = () => <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11"><polygon points="5,3 17,10 5,17"/></svg>
const IcoStop    = () => <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11"><rect x="4" y="4" width="12" height="12" rx="1.5"/></svg>

type PluginCategory = 'threat-protection' | 'monitoring' | 'scanning' | 'network' | 'compliance'

const CAT_FROM_BACKEND: Record<string, PluginCategory> = {
  'Security':      'threat-protection',
  'CI/CD':         'network',
  'Maintenance':   'compliance',
  'Notifications': 'monitoring',
  'Monitoring':    'monitoring',
  'Network':       'network',
  'Scanning':      'scanning',
  'Compliance':    'compliance',
}
const CAT_LABELS: Record<string, string> = {
  'threat-protection': 'Threat Protection',
  'monitoring':        'Monitoring',
  'scanning':          'Scanning',
  'network':           'Network',
  'compliance':        'Compliance',
  'Security':          'Security',
  'CI/CD':             'CI/CD',
  'Maintenance':       'Maintenance',
  'Notifications':     'Notifications',
}
const CAT_COLORS: Record<string, string> = {
  'threat-protection': '#ff4d4d',
  'monitoring':        '#a78bfa',
  'scanning':          '#63b3ed',
  'network':           '#f6ad55',
  'compliance':        '#68d391',
  'Security':          '#ff4d4d',
  'CI/CD':             '#63b3ed',
  'Maintenance':       '#68d391',
  'Notifications':     '#a78bfa',
}

const STATUS_CFG = {
  enabled:       { label:'Enabled',       color:'#68d391', bg:'rgba(104,211,145,0.12)', border:'rgba(104,211,145,0.3)', dot:'#68d391' },
  disabled:      { label:'Disabled',      color:'var(--color-text-dim)', bg:'var(--color-surface)', border:'var(--color-border)', dot:'#666' },
  installing:    { label:'Installing…',   color:'#63b3ed', bg:'rgba(99,179,237,0.12)', border:'rgba(99,179,237,0.3)', dot:'#63b3ed' },
  error:         { label:'Error',         color:'#ff4d4d', bg:'rgba(255,77,77,0.12)', border:'rgba(255,77,77,0.3)', dot:'#ff4d4d' },
  not_installed: { label:'Not Installed', color:'#f6ad55', bg:'rgba(246,173,85,0.08)', border:'rgba(246,173,85,0.25)', dot:'#f6ad55' },
} as const
type StatusKey = keyof typeof STATUS_CFG

function getPluginIcon(id: string, color: string) {
  const props = { width: 22, height: 22, stroke: color, fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (id.startsWith('fail2ban'))  return <img src={fail2banLogoSrc} alt="Fail2Ban" style={{ width: 26, height: 26, objectFit: 'contain' }} />
  if (id.startsWith('crowdsec')) return <img src={crowdsecLogoSrc} alt="CrowdSec" style={{ width: 26, height: 26, objectFit: 'contain' }} />
  if (id.startsWith('wazuh'))    return <img src={wazuhLogoSrc} alt="Wazuh" style={{ width: 26, height: 26, objectFit: 'contain' }} />
  if (id.startsWith('suricata')) return <img src={suricataLogoSrc} alt="Suricata" style={{ width: 26, height: 26, objectFit: 'contain' }} />
  if (id.startsWith('clamav'))   return <svg viewBox="0 0 20 20" {...props}><circle cx="10" cy="10" r="7"/><path d="M7 10l2 2 4-4"/></svg>
  if (id.startsWith('trivy'))    return <svg viewBox="0 0 20 20" {...props}><rect x="3" y="3" width="14" height="14" rx="2"/><circle cx="10" cy="10" r="3"/><line x1="3" y1="10" x2="7" y2="10"/><line x1="13" y1="10" x2="17" y2="10"/></svg>
  if (id.startsWith('docker'))   return <svg viewBox="0 0 20 20" {...props}><rect x="2" y="9" width="3" height="3" rx=".5"/><rect x="6" y="9" width="3" height="3" rx=".5"/><rect x="10" y="9" width="3" height="3" rx=".5"/><rect x="10" y="5" width="3" height="3" rx=".5"/><rect x="6" y="5" width="3" height="3" rx=".5"/><path d="M18 11c0 0-.5-2-3.5-2"/><path d="M2.5 11c0 2.2 1.5 5 7.5 5s8-2.8 8-5"/></svg>
  if (id.startsWith('lynis') || id.startsWith('rkhunter')) return <svg viewBox="0 0 20 20" {...props}><path d="M9 3H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8l-4-5z"/><polyline points="9,3 9,8 14,8"/><line x1="7" y1="12" x2="13" y2="12"/><line x1="7" y1="15" x2="11" y2="15"/></svg>
  return null
}

function deriveStatus(api: ApiPlugin): StatusKey {
  if (api.install_status === 'not_installed') return 'not_installed'
  if (api.install_status === 'installing')    return 'installing'
  if (api.install_status === 'error')         return 'error'
  return api.enabled ? 'enabled' : 'disabled'
}

function mergePlugin(api: ApiPlugin) {
  const local = PLUGINS.find(p => p.id === api.plugin_id || api.plugin_id.startsWith(p.id))
  const cat   = CAT_FROM_BACKEND[api.category] ?? 'monitoring'
  return {
    id:           api.plugin_id,
    numericId:    api.id,
    name:         api.name,
    shortName:    local?.shortName ?? api.name.slice(0, 4).toUpperCase(),
    version:      api.version,
    description:  api.description,
    category:     cat as PluginCategory,
    rawCategory:  api.category,
    author:       api.author,
    status:       deriveStatus(api),
    installStatus: api.install_status,
    enabled:      api.enabled,
    tags:         local?.tags ?? [],
    website:      local?.website ?? '',
    license:      local?.license ?? '',
    size:         local?.size ?? '',
    features:     local?.features ?? [],
  }
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
interface ConfirmProps {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}
function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }: ConfirmProps) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:8000, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:7, width:'100%', maxWidth:420, padding:0, boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 18px', borderBottom:'1px solid var(--color-border)' }}>
          <span style={{ color: danger ? '#ff4d4d' : '#f6ad55' }}><IcoWarn /></span>
          <span style={{ fontWeight:700, fontSize:14, color:'var(--color-text)' }}>{title}</span>
          <button onClick={onCancel} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'var(--color-text-dim)', display:'flex', alignItems:'center' }}><IcoX /></button>
        </div>
        <div style={{ padding:'18px 18px 14px', fontSize:13, color:'var(--color-text-muted)', lineHeight:1.5 }}>{message}</div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', padding:'0 18px 16px' }}>
          <button onClick={onCancel}
            style={{ background:'none', border:'1px solid var(--color-border)', borderRadius:7, padding:'6px 14px', fontSize:12.5, color:'var(--color-text-dim)', cursor:'pointer' }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            style={{ borderRadius:7, padding:'6px 14px', fontSize:12.5, fontWeight:600, cursor:'pointer', border:'none',
              background: danger ? '#ff4d4d' : 'var(--color-accent)',
              color: '#fff' }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PluginsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch]             = useState('')
  const [catFilter, setCatFilter]       = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all'|'enabled'|'disabled'|'not_installed'>('all')
  const [view, setView]                 = useState<'grid'|'list'>('grid')
  const [confirm, setConfirm]           = useState<null | { type: 'disable'|'uninstall'; pluginId: string; name: string }>(null)

  const { data: rawPlugins = [], isLoading } = useQuery({
    queryKey: ['plugins'],
    queryFn: fetchPlugins,
    refetchInterval: 15000,
  })

  const mutInstall = useMutation({
    mutationFn: (pluginId: string) => installPlugin(pluginId),
    onSuccess: (_, pluginId) => {
      toastInfo('Installing…', `${pluginId} is being installed`)
      setTimeout(() => qc.invalidateQueries({ queryKey: ['plugins'] }), 2000)
    },
    onError: (_, pluginId) => toastError('Install failed', pluginId),
  })

  const mutEnable = useMutation({
    mutationFn: (pluginId: string) => enablePlugin(pluginId),
    onSuccess: (_, pluginId) => {
      const p = plugins.find(x => x.id === pluginId)
      toastSuccess('Plugin enabled', p?.name ?? pluginId)
      qc.invalidateQueries({ queryKey: ['plugins'] })
    },
    onError: (_, pluginId) => toastError('Enable failed', pluginId),
  })

  const mutDisable = useMutation({
    mutationFn: (pluginId: string) => disablePlugin(pluginId),
    onSuccess: (_, pluginId) => {
      const p = plugins.find(x => x.id === pluginId)
      toastSuccess('Plugin disabled', p?.name ?? pluginId)
      qc.invalidateQueries({ queryKey: ['plugins'] })
    },
    onError: (_, pluginId) => toastError('Disable failed', pluginId),
  })

  const mutUninstall = useMutation({
    mutationFn: (pluginId: string) => uninstallPlugin(pluginId),
    onSuccess: (_, pluginId) => {
      const p = plugins.find(x => x.id === pluginId)
      toastSuccess('Plugin uninstalled', p?.name ?? pluginId)
      qc.invalidateQueries({ queryKey: ['plugins'] })
    },
    onError: (_, pluginId) => toastError('Uninstall failed', pluginId),
  })

  const plugins = useMemo(() => rawPlugins.map(mergePlugin), [rawPlugins])

  const enabledCount   = plugins.filter(p => p.status === 'enabled').length
  const disabledCount  = plugins.filter(p => p.status === 'disabled').length
  const hasErrors      = plugins.filter(p => p.status === 'error').length
  const notInstalled   = plugins.filter(p => p.status === 'not_installed').length

  const cats = Array.from(new Set(plugins.map(p => p.category)))

  const filtered = plugins.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !search || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.tags.some(t => t.includes(q))
    const matchCat    = catFilter === 'all' || p.category === catFilter
    const matchStatus = statusFilter === 'all' || p.status === statusFilter || (statusFilter === 'disabled' && (p.status === 'disabled' || p.status === 'not_installed'))
    return matchSearch && matchCat && matchStatus
  })

  function handleAction(p: ReturnType<typeof mergePlugin>, e: React.MouseEvent) {
    e.stopPropagation()
    if (p.installStatus === 'not_installed' || p.installStatus === 'error') {
      mutInstall.mutate(p.id)
    } else if (p.installStatus === 'installed') {
      if (p.enabled) {
        setConfirm({ type: 'disable', pluginId: p.id, name: p.name })
      } else {
        mutEnable.mutate(p.id)
      }
    }
  }

  function handleToggle(p: ReturnType<typeof mergePlugin>, e: React.MouseEvent) {
    e.stopPropagation()
    if (p.installStatus === 'not_installed' || p.installStatus === 'error') {
      mutInstall.mutate(p.id)
    } else if (p.installStatus === 'installed') {
      if (p.enabled) {
        setConfirm({ type: 'disable', pluginId: p.id, name: p.name })
      } else {
        mutEnable.mutate(p.id)
      }
    }
  }

  function handleUninstall(p: ReturnType<typeof mergePlugin>, e: React.MouseEvent) {
    e.stopPropagation()
    setConfirm({ type: 'uninstall', pluginId: p.id, name: p.name })
  }

  function doConfirm() {
    if (!confirm) return
    if (confirm.type === 'disable') mutDisable.mutate(confirm.pluginId)
    else mutUninstall.mutate(confirm.pluginId)
    setConfirm(null)
  }

  function actionLabel(p: ReturnType<typeof mergePlugin>, busy: boolean): React.ReactNode {
    if (busy) return 'Working…'
    if (p.installStatus === 'not_installed') return <><IcoPackage />Install</>
    if (p.installStatus === 'installing')    return 'Installing…'
    if (p.installStatus === 'error')         return <><IcoPackage />Retry Install</>
    if (p.enabled) return <><IcoStop />Disable</>
    return <><IcoPlay />Enable</>
  }

  function actionStyle(p: ReturnType<typeof mergePlugin>): React.CSSProperties {
    if (p.installStatus === 'not_installed' || p.installStatus === 'error') {
      return { background: 'rgba(74,158,255,0.15)', borderColor: 'rgba(74,158,255,0.4)', color: '#4a9eff' }
    }
    if (p.enabled) return { background: 'rgba(255,77,77,0.12)', borderColor: 'rgba(255,77,77,0.35)', color: '#ff4d4d' }
    return { background: 'rgba(104,211,145,0.12)', borderColor: 'rgba(104,211,145,0.35)', color: '#68d391' }
  }

  if (isLoading) {
    return (
      <div className={styles.page} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ color: 'var(--color-text-dim)', fontSize: 14 }}>Loading plugins…</div>
      </div>
    )
  }

  const busyIds = new Set([
    ...(mutInstall.isPending  ? [mutInstall.variables]  : []),
    ...(mutEnable.isPending   ? [mutEnable.variables]   : []),
    ...(mutDisable.isPending  ? [mutDisable.variables]  : []),
    ...(mutUninstall.isPending? [mutUninstall.variables]: []),
  ])

  return (
    <div className={styles.page}>

      {/* ── Hero banner ── */}
      <div className={styles.heroBanner}>
        <div className={styles.heroLeft}>
          <div className={styles.heroTitle}>Plugin Marketplace</div>
          <div className={styles.heroSub}>Extend your server's capabilities with security, monitoring, and compliance plugins</div>
        </div>
        <div className={styles.heroRight}>
          <div className={styles.heroStat}>
            <div className={styles.heroStatVal}>{plugins.length}</div>
            <div className={styles.heroStatLbl}>Available</div>
          </div>
          <div className={styles.heroStat}>
            <div className={styles.heroStatVal} style={{ color: '#68d391' }}>{enabledCount}</div>
            <div className={styles.heroStatLbl}>Active</div>
          </div>
          <div className={styles.heroStat}>
            <div className={styles.heroStatVal} style={{ color: hasErrors > 0 ? '#ff4d4d' : '#68d391' }}>{hasErrors}</div>
            <div className={styles.heroStatLbl}>Issues</div>
          </div>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className={styles.statsRow}>
        {[
          { label:'Total Plugins',   value:plugins.length,  icon:<IcoPuzzle />, color:'#63b3ed' },
          { label:'Enabled',         value:enabledCount,    icon:<IcoCheck />,  color:'#68d391' },
          { label:'Disabled',        value:disabledCount,   icon:<IcoX />,      color:'var(--color-text-dim)' },
          { label:'Not Installed',   value:notInstalled,    icon:<IcoPackage />,color:'#f6ad55' },
          { label:'Errors',          value:hasErrors,       icon:<IcoWarn />,   color: hasErrors > 0 ? '#ff4d4d' : '#68d391' },
        ].map(s => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: s.color + '1a', color: s.color }}>{s.icon}</div>
            <div className={styles.statBody}>
              <div className={styles.statVal} style={{ color: s.color }}>{s.value}</div>
              <div className={styles.statLbl}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}><IcoSearch /></span>
          <input className={styles.searchInput} placeholder="Search plugins…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className={styles.searchClear} onClick={() => setSearch('')}><IcoX /></button>}
        </div>
        <div className={styles.toolbarDivider} />
        <span className={styles.filterIcon}><IcoFilter /></span>
        <select className={styles.filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
          <option value="all">All Status</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
          <option value="not_installed">Not Installed</option>
        </select>
        <div className={styles.toolbarDivider} />
        <div className={styles.viewToggle}>
          <button className={`${styles.viewBtn} ${view==='grid'?styles.viewBtnActive:''}`} onClick={() => setView('grid')} title="Grid view">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="13" height="13"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
          </button>
          <button className={`${styles.viewBtn} ${view==='list'?styles.viewBtnActive:''}`} onClick={() => setView('list')} title="List view">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" width="13" height="13"><line x1="1" y1="4" x2="15" y2="4"/><line x1="1" y1="8" x2="15" y2="8"/><line x1="1" y1="12" x2="15" y2="12"/></svg>
          </button>
        </div>
      </div>

      {/* ── Category pills ── */}
      <div className={styles.catRow}>
        <button className={`${styles.catPill} ${catFilter==='all'?styles.catPillActive:''}`} onClick={() => setCatFilter('all')}>All</button>
        {cats.map(c => (
          <button key={c} className={`${styles.catPill} ${catFilter===c?styles.catPillActive:''}`}
            onClick={() => setCatFilter(c)}
            style={catFilter===c ? { background: (CAT_COLORS[c]??'#63b3ed')+'18', borderColor: CAT_COLORS[c]??'#63b3ed', color: CAT_COLORS[c]??'#63b3ed' } : {}}>
            {CAT_LABELS[c] ?? c}
          </button>
        ))}
        {(search || catFilter !== 'all' || statusFilter !== 'all') && (
          <span className={styles.resultCount}>{filtered.length} of {plugins.length}</span>
        )}
      </div>

      {/* ── Grid View ── */}
      {view === 'grid' && (
        <div className={styles.grid}>
          {filtered.map(p => {
            const scfg     = STATUS_CFG[p.status]
            const catColor = CAT_COLORS[p.category] ?? '#63b3ed'
            const isEnabled = p.status === 'enabled'
            const isBusy   = busyIds.has(p.id)
            const icon     = getPluginIcon(p.id, catColor)
            const isInstalling = p.status === 'installing'
            const isNotInstalled = p.status === 'not_installed'

            return (
              <div key={p.id} className={`${styles.pluginCard} ${isEnabled ? styles.pluginCardEnabled : ''}`} onClick={() => navigate(`/plugins/${p.id}`)}>
                <div className={styles.pluginCardAccent} style={{ background: catColor }} />
                <div className={styles.pluginCardBody}>
                  <div className={styles.pluginCardTop}>
                    <div className={styles.pluginIconArea}>
                      {icon
                        ? <div className={styles.pluginShortBadge} style={{ background: catColor + '1e' }}>{icon}</div>
                        : <div className={styles.pluginShortBadgeFallback} style={{ background: catColor + '22', color: catColor }}>{p.shortName}</div>
                      }
                      <div>
                        <div className={styles.pluginName}>{p.name}</div>
                        <div className={styles.pluginVersion}>v{p.version} · {p.author}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5 }}>
                      <span className={styles.statusChip} style={{ background:scfg.bg, color:scfg.color, border:`1px solid ${scfg.border}` }}>
                        <span className={styles.statusDot} style={{ background:scfg.dot }} />
                        {isBusy ? 'Working…' : scfg.label}
                      </span>
                      <span className={styles.catBadge} style={{ background:catColor+'18', color:catColor }}>{CAT_LABELS[p.category] ?? p.category}</span>
                    </div>
                  </div>

                  <p className={styles.pluginDesc}>{p.description}</p>

                  {p.features.length > 0 && (
                    <div className={styles.cardFeatures}>
                      {p.features.slice(0, 3).map(f => (
                        <div key={f} className={styles.cardFeatureItem}>
                          <div className={styles.cardFeatureCheck} style={{ background: catColor + '20' }}>
                            <svg viewBox="0 0 20 20" fill="none" stroke={catColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="11" height="11"><polyline points="4,10 8,14 16,6"/></svg>
                          </div>
                          <span>{f}</span>
                        </div>
                      ))}
                      {p.features.length > 3 && (
                        <div className={styles.cardFeatureItem} style={{ color: 'var(--color-text-dim)', paddingLeft: 25 }}>
                          +{p.features.length - 3} more features
                        </div>
                      )}
                    </div>
                  )}

                  <div className={styles.pluginCardFoot} onClick={e => e.stopPropagation()}>
                    <div className={styles.pluginTags}>
                      {p.tags.slice(0,3).map(t => <span key={t} className={styles.tagChip}>{t}</span>)}
                    </div>
                    <div className={styles.cardActions}>
                      {/* Toggle: only meaningful when installed */}
                      {!isNotInstalled && (
                        <div className={styles.toggleWrap}>
                          <span className={styles.toggleLabel} style={{ color: isEnabled ? '#68d391' : 'var(--color-text-dim)' }}>
                            {isBusy ? '…' : isInstalling ? '…' : isEnabled ? 'On' : 'Off'}
                          </span>
                          <label className={styles.toggle} onClick={e => handleToggle(p, e)}>
                            <input type="checkbox" readOnly checked={isEnabled} disabled={isBusy || isInstalling} />
                            <span className={styles.toggleTrack} />
                            <span className={styles.toggleThumb} />
                          </label>
                        </div>
                      )}

                      {/* Action button */}
                      <button
                        className={styles.detailsBtn}
                        style={{ display:'inline-flex', alignItems:'center', gap:5, border:'1px solid', borderRadius:7, padding:'4px 11px', fontSize:11.5, cursor: (isBusy || isInstalling) ? 'not-allowed' : 'pointer', opacity: (isBusy || isInstalling) ? 0.6 : 1, ...actionStyle(p) }}
                        disabled={isBusy || isInstalling}
                        onClick={e => handleAction(p, e)}>
                        {actionLabel(p, isBusy)}
                      </button>

                      {/* Uninstall for installed plugins */}
                      {p.installStatus === 'installed' && (
                        <button
                          onClick={e => handleUninstall(p, e)}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,77,77,0.5)', display:'flex', alignItems:'center', padding:'4px 4px', borderRadius:5, transition:'color .14s' }}
                          title="Uninstall"
                          onMouseEnter={e => (e.currentTarget.style.color='#ff4d4d')}
                          onMouseLeave={e => (e.currentTarget.style.color='rgba(255,77,77,0.5)')}>
                          <IcoTrash />
                        </button>
                      )}

                      <button className={styles.detailsBtn} onClick={e => { e.stopPropagation(); navigate(`/plugins/${p.id}`) }}>
                        Details <IcoArrow />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── List View ── */}
      {view === 'list' && (
        <div className={styles.listView}>
          <div className={styles.listHead}>
            <span>Plugin</span>
            <span>Category</span>
            <span>Version</span>
            <span>Status</span>
            <span>Tags</span>
            <span>Actions</span>
          </div>
          {filtered.map(p => {
            const scfg     = STATUS_CFG[p.status]
            const catColor = CAT_COLORS[p.category] ?? '#63b3ed'
            const isEnabled = p.status === 'enabled'
            const isBusy   = busyIds.has(p.id)
            const isInstalling = p.status === 'installing'
            const isNotInstalled = p.status === 'not_installed'
            const icon     = getPluginIcon(p.id, catColor)
            return (
              <div key={p.id} className={`${styles.listRow} ${isEnabled ? styles.listRowEnabled : ''}`} onClick={() => navigate(`/plugins/${p.id}`)}>
                <div className={styles.listPluginName}>
                  {icon
                    ? <div className={styles.listShort} style={{ background: catColor + '1e' }}>{icon}</div>
                    : <div className={styles.listShort} style={{ background: catColor + '22', color: catColor, fontSize: 9, fontFamily: 'monospace', fontWeight: 700 }}>{p.shortName}</div>
                  }
                  <div>
                    <div className={styles.listName}>{p.name}</div>
                    <div className={styles.listDesc}>{p.description.slice(0, 70)}{p.description.length > 70 ? '…' : ''}</div>
                  </div>
                </div>
                <span className={styles.catBadge} style={{ background:catColor+'18', color:catColor }}>{CAT_LABELS[p.category] ?? p.category}</span>
                <span className={styles.listVer}>v{p.version}</span>
                <span className={styles.statusChip} style={{ background:scfg.bg, color:scfg.color, border:`1px solid ${scfg.border}`, whiteSpace:'nowrap' }}>
                  <span className={styles.statusDot} style={{ background:scfg.dot }} />
                  {isBusy ? 'Working…' : scfg.label}
                </span>
                <div className={styles.listStats}>
                  {p.tags.slice(0, 2).map(t => (
                    <span key={t} className={styles.listStatChip} style={{ color: 'var(--color-text-muted)' }}>{t}</span>
                  ))}
                </div>
                <div className={styles.listActions} onClick={e => e.stopPropagation()}>
                  {!isNotInstalled && (
                    <label className={styles.toggle} onClick={e => handleToggle(p, e)}>
                      <input type="checkbox" readOnly checked={isEnabled} disabled={isBusy || isInstalling} />
                      <span className={styles.toggleTrack} />
                      <span className={styles.toggleThumb} />
                    </label>
                  )}
                  <button
                    style={{ display:'inline-flex', alignItems:'center', gap:4, border:'1px solid', borderRadius:7, padding:'3px 9px', fontSize:11, cursor: (isBusy || isInstalling) ? 'not-allowed' : 'pointer', opacity: (isBusy || isInstalling) ? 0.6 : 1, ...actionStyle(p) }}
                    disabled={isBusy || isInstalling}
                    onClick={e => handleAction(p, e)}>
                    {actionLabel(p, isBusy)}
                  </button>
                  {p.installStatus === 'installed' && (
                    <button onClick={e => handleUninstall(p, e)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,77,77,0.5)', display:'flex', alignItems:'center', padding:'3px', borderRadius:5 }} title="Uninstall"
                      onMouseEnter={e => (e.currentTarget.style.color='#ff4d4d')}
                      onMouseLeave={e => (e.currentTarget.style.color='rgba(255,77,77,0.5)')}>
                      <IcoTrash />
                    </button>
                  )}
                  <button className={styles.detailsBtn} onClick={e => { e.stopPropagation(); navigate(`/plugins/${p.id}`) }}>View</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {filtered.length === 0 && plugins.length > 0 && (
        <div className={styles.emptyState}>
          <IcoPuzzle />
          <div>No plugins match your search</div>
          <button className={styles.clearBtn} onClick={() => { setSearch(''); setCatFilter('all'); setStatusFilter('all') }}>Clear filters</button>
        </div>
      )}

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmModal
          title={confirm.type === 'disable' ? `Disable ${confirm.name}` : `Uninstall ${confirm.name}`}
          message={confirm.type === 'disable'
            ? `Are you sure you want to disable ${confirm.name}? It will stop running but remain installed.`
            : `Are you sure you want to uninstall ${confirm.name}? This will stop and remove the plugin from this system.`}
          confirmLabel={confirm.type === 'disable' ? 'Disable' : 'Uninstall'}
          danger
          onConfirm={doConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
