import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchApps, type AppResponse } from '@/lib/api'
import styles from './AppsPage.module.css'

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoSearch    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="17" y2="17"/></svg>
const IcoX         = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
const IcoFilter    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h14M6 10h8M9 15h2"/></svg>
const IcoArrow     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="10" x2="17" y2="10"/><polyline points="12,5 17,10 12,15"/></svg>
const IcoGrid      = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="13" height="13"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
const IcoList      = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" width="13" height="13"><line x1="1" y1="4" x2="15" y2="4"/><line x1="1" y1="8" x2="15" y2="8"/><line x1="1" y1="12" x2="15" y2="12"/></svg>
const IcoCheck     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,10 8,14 16,6"/></svg>
const IcoApps      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5"/></svg>
const IcoPackage   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l7 4v8l-7 4-7-4V6z"/><polyline points="3.27,6.96 10,11.01 16.73,6.96"/><line x1="10" y1="11" x2="10" y2="18"/></svg>

// ── Category metadata ─────────────────────────────────────────────────────────
const CAT_META: Record<string, { label: string; color: string }> = {
  'Platform as a Service':  { label: 'PaaS',             color: '#4a9eff' },
  'Container Management':   { label: 'Containers',       color: '#a78bfa' },
  'Reverse Proxy':          { label: 'Reverse Proxy',    color: '#f6ad55' },
  'Database':               { label: 'Database',         color: '#68d391' },
  'CI/CD':                  { label: 'CI/CD',            color: '#f687b3' },
}

const STATUS_CFG = {
  not_installed: { label: 'Not Installed', color: 'var(--color-text-dim)', bg: 'var(--color-surface)', border: 'var(--color-border)', dot: '#666' },
  installing:    { label: 'Installing…',   color: '#63b3ed', bg: 'rgba(99,179,237,0.12)', border: 'rgba(99,179,237,0.3)', dot: '#63b3ed' },
  running:       { label: 'Running',       color: '#68d391', bg: 'rgba(104,211,145,0.12)', border: 'rgba(104,211,145,0.3)', dot: '#68d391' },
  stopped:       { label: 'Stopped',       color: '#f6ad55', bg: 'rgba(246,173,85,0.10)', border: 'rgba(246,173,85,0.25)', dot: '#f6ad55' },
  error:         { label: 'Error',         color: '#ff4d4d', bg: 'rgba(255,77,77,0.12)', border: 'rgba(255,77,77,0.3)', dot: '#ff4d4d' },
} as const
type StatusKey = keyof typeof STATUS_CFG

function getStatusCfg(s: string) {
  return STATUS_CFG[s as StatusKey] ?? STATUS_CFG['not_installed']
}

// ── App category icon ─────────────────────────────────────────────────────────
function AppIcon({ appId, color, size = 22 }: { appId: string; color: string; size?: number }) {
  const p = { width: size, height: size, stroke: color, fill: 'none', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (appId === 'coolify' || appId === 'dokploy' || appId === 'caprover' || appId === 'easypanel')
    return <svg viewBox="0 0 20 20" {...p}><path d="M10 2l7 4v4a7 7 0 0 1-7 8 7 7 0 0 1-7-8V6z"/><polyline points="7,10 9,12 13,8"/></svg>
  if (appId === 'portainer' || appId === 'dockge' || appId === 'yacht')
    return <svg viewBox="0 0 20 20" {...p}><rect x="2" y="9" width="3" height="3" rx=".5"/><rect x="6" y="9" width="3" height="3" rx=".5"/><rect x="10" y="9" width="3" height="3" rx=".5"/><rect x="10" y="5" width="3" height="3" rx=".5"/><rect x="6" y="5" width="3" height="3" rx=".5"/><path d="M18 11c0 0-.5-2-3.5-2H14V6.5a.5.5 0 0 0-.5-.5H13"/><path d="M2.5 11c0 2.2 1.5 5 7.5 5s8-2.8 8-5"/></svg>
  if (appId === 'traefik' || appId === 'nginx-proxy-manager' || appId === 'caddy')
    return <svg viewBox="0 0 20 20" {...p}><circle cx="10" cy="10" r="8"/><polyline points="4,10 8,6 12,10 16,6"/></svg>
  if (appId === 'postgresql' || appId === 'redis')
    return <svg viewBox="0 0 20 20" {...p}><ellipse cx="10" cy="6" rx="7" ry="2.5"/><path d="M3 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/><path d="M3 10v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4"/></svg>
  if (appId === 'jenkins' || appId === 'gitea')
    return <svg viewBox="0 0 20 20" {...p}><circle cx="6" cy="5" r="2"/><circle cx="14" cy="5" r="2"/><circle cx="10" cy="15" r="2"/><line x1="6" y1="7" x2="10" y2="13"/><line x1="14" y1="7" x2="10" y2="13"/></svg>
  return <svg viewBox="0 0 20 20" {...p}><path d="M10 2l7 4v8l-7 4-7-4V6z"/><line x1="10" y1="6" x2="10" y2="14"/><line x1="3.3" y1="7" x2="16.7" y2="13"/></svg>
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AppsPage() {
  const navigate = useNavigate()
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [view, setView]           = useState<'grid' | 'list'>('grid')

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: fetchApps,
    refetchInterval: 15000,
  })

  const runningCount  = apps.filter(a => a.status === 'running').length
  const installedCount = apps.filter(a => a.status !== 'not_installed').length
  const errorCount    = apps.filter(a => a.status === 'error').length

  const categories = useMemo(() => Array.from(new Set(apps.map(a => a.category))), [apps])

  const filtered = useMemo(() => apps.filter(a => {
    const q = search.toLowerCase()
    const matchSearch = !search || a.name.toLowerCase().includes(q) || a.tagline.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.tags.some(t => t.includes(q))
    const matchCat    = catFilter === 'all' || a.category === catFilter
    const matchStatus = statusFilter === 'all' ||
      (statusFilter === 'running' && a.status === 'running') ||
      (statusFilter === 'installed' && a.status !== 'not_installed') ||
      (statusFilter === 'not_installed' && a.status === 'not_installed')
    return matchSearch && matchCat && matchStatus
  }), [apps, search, catFilter, statusFilter])

  if (isLoading) return (
    <div className={styles.page} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div style={{ color: 'var(--color-text-dim)', fontSize: 14 }}>Loading apps…</div>
    </div>
  )

  return (
    <div className={styles.page}>

      {/* Hero */}
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.heroTitle}>App Marketplace</div>
          <div className={styles.heroSub}>Install and manage server applications — PaaS platforms, container managers, reverse proxies, databases, and CI/CD tools. All deployable with one click.</div>
        </div>
        <div className={styles.heroRight}>
          <div className={styles.heroStat}>
            <div className={styles.heroStatVal}>{apps.length}</div>
            <div className={styles.heroStatLbl}>Available</div>
          </div>
          <div className={styles.heroStat}>
            <div className={styles.heroStatVal} style={{ color: '#68d391' }}>{runningCount}</div>
            <div className={styles.heroStatLbl}>Running</div>
          </div>
          <div className={styles.heroStat}>
            <div className={styles.heroStatVal} style={{ color: installedCount > 0 ? '#4a9eff' : 'var(--color-text-dim)' }}>{installedCount}</div>
            <div className={styles.heroStatLbl}>Installed</div>
          </div>
          <div className={styles.heroStat}>
            <div className={styles.heroStatVal} style={{ color: errorCount > 0 ? '#ff4d4d' : '#68d391' }}>{errorCount}</div>
            <div className={styles.heroStatLbl}>Errors</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsRow}>
        {[
          { label: 'Total Apps',  value: apps.length,    icon: <IcoApps />,    color: '#4a9eff'  },
          { label: 'Running',     value: runningCount,   icon: <IcoCheck />,   color: '#68d391'  },
          { label: 'Installed',   value: installedCount, icon: <IcoPackage />, color: '#a78bfa'  },
          { label: 'Errors',      value: errorCount,     icon: <IcoX />,       color: errorCount > 0 ? '#ff4d4d' : '#68d391' },
        ].map(s => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: s.color + '1a', color: s.color }}>{s.icon}</div>
            <div>
              <div className={styles.statVal} style={{ color: s.color }}>{s.value}</div>
              <div className={styles.statLbl}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}><IcoSearch /></span>
          <input className={styles.searchInput} placeholder="Search apps…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className={styles.searchClear} onClick={() => setSearch('')}><IcoX /></button>}
        </div>
        <div className={styles.toolbarDiv} />
        <span style={{ color: 'var(--color-text-dim)', display: 'flex', alignItems: 'center' }}><IcoFilter /></span>
        <select className={styles.filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="running">Running</option>
          <option value="installed">Installed</option>
          <option value="not_installed">Not Installed</option>
        </select>
        <div className={styles.toolbarDiv} />
        <div className={styles.viewToggle}>
          <button className={`${styles.viewBtn} ${view === 'grid' ? styles.viewBtnActive : ''}`} onClick={() => setView('grid')}><IcoGrid /></button>
          <button className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnActive : ''}`} onClick={() => setView('list')}><IcoList /></button>
        </div>
      </div>

      {/* Category pills */}
      <div className={styles.catRow}>
        <button className={`${styles.catPill} ${catFilter === 'all' ? styles.catPillActive : ''}`} onClick={() => setCatFilter('all')}>All</button>
        {categories.map(c => {
          const meta = CAT_META[c] ?? { label: c, color: '#4a9eff' }
          return (
            <button key={c}
              className={`${styles.catPill} ${catFilter === c ? styles.catPillActive : ''}`}
              onClick={() => setCatFilter(c)}
              style={catFilter === c ? { background: meta.color + '18', borderColor: meta.color, color: meta.color } : {}}>
              {meta.label}
            </button>
          )
        })}
        {(search || catFilter !== 'all' || statusFilter !== 'all') && (
          <span className={styles.resultCount}>{filtered.length} of {apps.length}</span>
        )}
      </div>

      {/* Grid */}
      {view === 'grid' && (
        <div className={styles.grid}>
          {filtered.map(app => <AppCard key={app.id} app={app} onOpen={() => navigate(`/apps/${app.id}`)} />)}
        </div>
      )}

      {/* List */}
      {view === 'list' && (
        <div className={styles.listView}>
          <div className={styles.listHead}>
            <span>App</span>
            <span>Category</span>
            <span>Version</span>
            <span>Status</span>
            <span>Port</span>
            <span>Actions</span>
          </div>
          {filtered.map(app => {
            const meta   = CAT_META[app.category] ?? { label: app.category, color: '#4a9eff' }
            const scfg   = getStatusCfg(app.status)
            return (
              <div key={app.id} className={styles.listRow} onClick={() => navigate(`/apps/${app.id}`)}>
                <div className={styles.listAppName}>
                  <div className={styles.listIconBadge} style={{ background: meta.color + '18' }}>
                    <AppIcon appId={app.id} color={meta.color} size={16} />
                  </div>
                  <div>
                    <div className={styles.listName}>{app.name}</div>
                    <div className={styles.listDesc}>{app.tagline}</div>
                  </div>
                </div>
                <span className={styles.catBadge} style={{ background: meta.color + '18', color: meta.color }}>{meta.label}</span>
                <span className={styles.listVer}>v{app.version}</span>
                <span className={styles.statusChip} style={{ background: scfg.bg, color: scfg.color, border: `1px solid ${scfg.border}` }}>
                  <span className={styles.statusDot} style={{ background: scfg.dot }} />
                  {scfg.label}
                </span>
                <span className={styles.listVer} style={{ fontFamily: 'monospace' }}>:{app.port || app.default_port}</span>
                <div className={styles.listActions} onClick={e => e.stopPropagation()}>
                  <button className={styles.btnDetails} onClick={() => navigate(`/apps/${app.id}`)}>
                    {app.status === 'not_installed' ? 'Install' : 'Manage'} <IcoArrow />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {filtered.length === 0 && apps.length > 0 && (
        <div className={styles.emptyState}>
          <IcoApps />
          <div>No apps match your search</div>
          <button className={styles.clearBtn} onClick={() => { setSearch(''); setCatFilter('all'); setStatusFilter('all') }}>Clear filters</button>
        </div>
      )}
    </div>
  )
}

function AppCard({ app, onOpen }: { app: AppResponse; onOpen: () => void }) {
  const meta = CAT_META[app.category] ?? { label: app.category, color: '#4a9eff' }
  const scfg = getStatusCfg(app.status)
  const color = meta.color

  return (
    <div className={`${styles.appCard} ${app.status === 'running' ? styles.appCardRunning : ''}`} onClick={onOpen}>
      <div className={styles.appCardAccent} style={{ background: color }} />
      <div className={styles.appCardBody}>
        <div className={styles.appCardTop}>
          <div className={styles.appIconArea}>
            <div className={styles.appIconBadge} style={{ background: color + '1e' }}>
              <AppIcon appId={app.id} color={color} />
            </div>
            <div>
              <div className={styles.appName}>{app.name}</div>
              <div className={styles.appTagline}>{app.tagline}</div>
            </div>
          </div>
          <div className={styles.appBadges}>
            <span className={styles.statusChip} style={{ background: scfg.bg, color: scfg.color, border: `1px solid ${scfg.border}` }}>
              <span className={styles.statusDot} style={{ background: scfg.dot }} />
              {scfg.label}
            </span>
            <span className={styles.catBadge} style={{ background: color + '18', color }}>{meta.label}</span>
          </div>
        </div>

        <p className={styles.appDesc}>{app.description}</p>

        <div className={styles.featureList}>
          {app.features.slice(0, 3).map(f => (
            <div key={f} className={styles.featureItem}>
              <div className={styles.featureCheck} style={{ background: color + '20' }}>
                <svg viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="11" height="11"><polyline points="4,10 8,14 16,6"/></svg>
              </div>
              <span>{f}</span>
            </div>
          ))}
          {app.features.length > 3 && (
            <div className={styles.featureItem} style={{ color: 'var(--color-text-dim)', paddingLeft: 22 }}>
              +{app.features.length - 3} more features
            </div>
          )}
        </div>

        <div className={styles.appCardFoot} onClick={e => e.stopPropagation()}>
          <div className={styles.appTags}>
            {app.tags.slice(0, 2).map(t => <span key={t} className={styles.tagChip}>{t}</span>)}
          </div>
          <div className={styles.cardActions}>
            <button className={app.status === 'not_installed' ? styles.btnInstall : styles.btnDetails} onClick={e => { e.stopPropagation(); onOpen() }}>
              {app.status === 'not_installed' ? 'Install' : app.status === 'running' ? 'Manage' : 'Details'}
              <IcoArrow />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
