import { useState, useRef, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { logout, clearCSRFToken } from '@/lib/api'
import { useServerInfo } from '@/lib/useServerInfo'
import ToastContainer from '@/components/ui/Toast'
import styles from './Layout.module.css'

// ── SVG icon set ──────────────────────────────────────────────
function IconMetrics()        { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,14 6,9 9,12 13,6 18,11"/><line x1="2" y1="17" x2="18" y2="17"/></svg> }
function IconServices()       { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"/></svg> }
function IconLogs()           { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="2" width="14" height="16" rx="2"/><line x1="7" y1="7" x2="13" y2="7"/><line x1="7" y1="10" x2="13" y2="10"/><line x1="7" y1="13" x2="10" y2="13"/></svg> }
function IconFirewall()       { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2C6 4 3 4 3 4s0 6 1.5 9C5.7 15.8 8 17.5 10 18c2-.5 4.3-2.2 5.5-5C17 10 17 4 17 4s-3 0-7-2z"/><polyline points="7,10 9,12 13,8"/></svg> }
function IconWebServer()      { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8"/><line x1="2" y1="10" x2="18" y2="10"/><path d="M10 2a14 14 0 0 1 3.5 8A14 14 0 0 1 10 18A14 14 0 0 1 6.5 10A14 14 0 0 1 10 2z"/></svg> }
function IconDeploy()         { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l6 6-1.5 1.5L11 6v8H9V6L5.5 9.5 4 8z"/><path d="M4 15h12"/></svg> }
function IconContainers()     { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l7 4v8l-7 4-7-4V6z"/><polyline points="3.27,6.96 10,11.01 16.73,6.96"/><line x1="10" y1="11" x2="10" y2="18"/></svg> }
function IconUptime()         { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 11c.8-4.5 4.1-6 5.5-6 2 0 3 2.5 3 2.5S11.5 5 13.5 5C15 5 17.5 6.5 18 11"/><path d="M1 14h18"/></svg> }
function IconSecurity()       { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="9" width="10" height="9" rx="1.5"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/><circle cx="10" cy="13.5" r="1" fill="currentColor" stroke="none"/></svg> }
function IconProcesses()      { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="7" height="5" rx="1"/><rect x="11" y="3" width="7" height="5" rx="1"/><rect x="2" y="12" width="7" height="5" rx="1"/><rect x="11" y="12" width="7" height="5" rx="1"/></svg> }
function IconServers()        { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="16" height="5" rx="1.5"/><rect x="2" y="12" width="16" height="5" rx="1.5"/><circle cx="6" cy="5.5" r="0.8" fill="currentColor" stroke="none"/><circle cx="6" cy="14.5" r="0.8" fill="currentColor" stroke="none"/></svg> }
function IconBars()           { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></svg> }
function IconClose()          { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg> }
function IconLogout()         { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4"/><polyline points="13,14 17,10 13,6"/><line x1="17" y1="10" x2="7" y2="10"/></svg> }
function IconChevronDown()    { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="10" height="10"><polyline points="5,8 10,13 15,8"/></svg> }
function IconHost()           { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><rect x="2" y="3" width="16" height="5" rx="1.5"/><rect x="2" y="12" width="16" height="5" rx="1.5"/><circle cx="6" cy="5.5" r="0.7" fill="currentColor" stroke="none"/><circle cx="6" cy="14.5" r="0.7" fill="currentColor" stroke="none"/></svg> }
function IconIP()             { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><circle cx="10" cy="10" r="8"/><line x1="2" y1="10" x2="18" y2="10"/><path d="M10 2a12 12 0 0 1 3 8 12 12 0 0 1-3 8 12 12 0 0 1-3-8 12 12 0 0 1 3-8z"/></svg> }
function IconOS()             { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><rect x="3" y="3" width="14" height="11" rx="1.5"/><path d="M7 17h6M10 14v3"/></svg> }
function IconCPUSmall()       { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><rect x="5" y="5" width="10" height="10" rx="1"/><line x1="8" y1="2" x2="8" y2="5"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="8" y1="15" x2="8" y2="18"/><line x1="12" y1="15" x2="12" y2="18"/><line x1="2" y1="8" x2="5" y2="8"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="15" y1="8" x2="18" y2="8"/><line x1="15" y1="12" x2="18" y2="12"/></svg> }
function IconUptime2()        { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><circle cx="10" cy="10" r="8"/><polyline points="10,6 10,10 13,12"/></svg> }
function IconLocation()       { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><path d="M10 2a6 6 0 0 1 6 6c0 4-6 10-6 10S4 12 4 8a6 6 0 0 1 6-6z"/><circle cx="10" cy="8" r="2"/></svg> }
function IconKernel()         { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><polyline points="4,7 2,10 4,13"/><polyline points="16,7 18,10 16,13"/><line x1="9" y1="4" x2="11" y2="16"/></svg> }
function IconLoad()           { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><polyline points="2,14 6,9 9,12 13,6 18,10"/></svg> }
function IconSettings()       { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2.8"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg> }
function IconFtp()            { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5a1 1 0 0 1 1-1h5l2 2h5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5z"/><line x1="8" y1="11" x2="12" y2="11"/><line x1="10" y1="9" x2="10" y2="13"/></svg> }
function IconSsh()            { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="16" height="14" rx="2"/><polyline points="5,8 8,11 5,14"/><line x1="11" y1="14" x2="15" y2="14"/></svg> }
function IconMcp()            { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="9" r="3.5"/><path d="M11.5 9h6M15 7v4"/><circle cx="10" cy="10" r="8" strokeWidth="1.2" opacity=".3"/></svg> }
function IconBell()           { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2a6 6 0 0 1 6 6v3l1.5 2.5h-15L4 11V8a6 6 0 0 1 6-6z"/><path d="M8 15.5a2 2 0 0 0 4 0"/></svg> }
function IconPlugins()        { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h6v2a2 2 0 0 0 2 2h2v6h-2a2 2 0 0 0-2 2v2H7v-2a2 2 0 0 0-2-2H3V7h2a2 2 0 0 0 2-2V3z"/></svg> }
function IconPorts()          { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="16" height="9" rx="1.5"/><path d="M6 6V4M10 6V4M14 6V4"/><circle cx="10" cy="10.5" r="1.3" fill="currentColor" stroke="none"/></svg> }
function IconDatabase()       { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="10" cy="5" rx="7" ry="2.5"/><path d="M3 5v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5"/><path d="M3 9v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V9"/><path d="M3 13v3c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-3"/></svg> }
function IconProfile()        { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="7" r="3.5"/><path d="M3 18c0-4 3.1-6 7-6s7 2 7 6"/></svg> }
function IconApps()           { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5"/></svg> }
function IconSearch()         { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="17" y2="17"/></svg> }
function IconSun()            { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="3.5"/><line x1="10" y1="1.5" x2="10" y2="3.5"/><line x1="10" y1="16.5" x2="10" y2="18.5"/><line x1="1.5" y1="10" x2="3.5" y2="10"/><line x1="16.5" y1="10" x2="18.5" y2="10"/><line x1="4.1" y1="4.1" x2="5.5" y2="5.5"/><line x1="14.5" y1="14.5" x2="15.9" y2="15.9"/><line x1="4.1" y1="15.9" x2="5.5" y2="14.5"/><line x1="14.5" y1="5.5" x2="15.9" y2="4.1"/></svg> }
function IconMoon()           { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 13A8 8 0 0 1 7 2.5a8 8 0 1 0 10.5 10.5z"/></svg> }

// ── Nav config ─────────────────────────────────────────────────
const NAV_SECTIONS = [
  {
    label: 'Monitor',
    items: [
      { to: '/metrics',    label: 'Metrics',       Icon: IconMetrics   },
      { to: '/processes',  label: 'Processes',     Icon: IconProcesses },
      { to: '/uptime',     label: 'Uptime',        Icon: IconUptime    },
      { to: '/alerts',     label: 'Alerts',        Icon: IconBell      },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/services',   label: 'Services',      Icon: IconServices  },
      { to: '/logs',       label: 'Logs',          Icon: IconLogs      },
      { to: '/security',   label: 'Security',      Icon: IconSecurity  },
    ],
  },
  {
    label: 'Network',
    items: [
      { to: '/firewall',   label: 'Firewall',      Icon: IconFirewall  },
      { to: '/webserver',  label: 'Web Server',    Icon: IconWebServer },
      { to: '/ports',      label: 'Ports',         Icon: IconPorts     },
    ],
  },
  {
    label: 'Deploy',
    items: [
      { to: '/deploy',     label: 'Deploy',        Icon: IconDeploy     },
      { to: '/containers', label: 'Containers',    Icon: IconContainers },
    ],
  },
  {
    label: 'Data',
    items: [
      { to: '/database',   label: 'Database',      Icon: IconDatabase   },
    ],
  },
  {
    label: 'Fleet',
    items: [
      { to: '/servers',    label: 'Servers',       Icon: IconServers },
    ],
  },
  {
    label: 'Files',
    items: [
      { to: '/ftp',        label: 'FTP & Files',   Icon: IconFtp },
      { to: '/ssh',        label: 'SSH Terminal',  Icon: IconSsh },
    ],
  },
  {
    label: 'Extend',
    items: [
      { to: '/apps',       label: 'Apps',       Icon: IconApps    },
      { to: '/plugins',    label: 'Plugins',    Icon: IconPlugins },
    ],
  },
  {
    label: 'Config',
    items: [
      { to: '/notifications', label: 'Notifications', Icon: IconBell     },
      { to: '/mcp',           label: 'MCP Tokens',    Icon: IconMcp      },
      { to: '/settings',      label: 'Settings',      Icon: IconSettings },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/profile', label: 'Profile', Icon: IconProfile },
    ],
  },
]

const PAGE_LABELS: Record<string, string> = {
  '/metrics':       'Metrics',
  '/processes':     'Processes',
  '/uptime':        'Uptime',
  '/services':      'Services',
  '/logs':          'Logs',
  '/security':      'Security',
  '/firewall':      'Firewall',
  '/webserver':     'Web Server',
  '/ports':         'Ports',
  '/deploy':        'Deploy',
  '/containers':    'Containers',
  '/servers':       'Servers',
  '/ftp':           'FTP & Files',
  '/ssh':           'SSH Terminal',
  '/mcp':           'MCP Tokens',
  '/settings':      'Settings',
  '/apps':          'Apps',
  '/plugins':       'Plugins',
  '/notifications': 'Notifications',
  '/database':      'Database',
  '/alerts':        'Alert Rules',
  '/profile':       'Profile',
}

// ── Global search items ────────────────────────────────────────
const SEARCH_ITEMS = [
  { label: 'Metrics',        to: '/metrics',       cat: 'Monitor'  },
  { label: 'Processes',      to: '/processes',     cat: 'Monitor'  },
  { label: 'Uptime',         to: '/uptime',        cat: 'Monitor'  },
  { label: 'Services',       to: '/services',      cat: 'System'   },
  { label: 'Logs',           to: '/logs',          cat: 'System'   },
  { label: 'Security',       to: '/security',      cat: 'System'   },
  { label: 'Firewall',       to: '/firewall',      cat: 'Network'  },
  { label: 'Web Server',     to: '/webserver',     cat: 'Network'  },
  { label: 'Ports',          to: '/ports',         cat: 'Network'  },
  { label: 'Deploy',         to: '/deploy',        cat: 'Deploy'   },
  { label: 'Containers',     to: '/containers',    cat: 'Deploy'   },
  { label: 'Servers',        to: '/servers',       cat: 'Fleet'    },
  { label: 'FTP & Files',    to: '/ftp',           cat: 'Files'    },
  { label: 'Apps',           to: '/apps',          cat: 'Extend'   },
  { label: 'Plugins',        to: '/plugins',       cat: 'Extend'   },
  { label: 'Notifications',  to: '/notifications', cat: 'Config'   },
  { label: 'MCP Tokens',     to: '/mcp',           cat: 'Config'   },
  { label: 'Settings',       to: '/settings',      cat: 'Config'   },
  { label: 'Database',       to: '/database',      cat: 'Data'     },
  { label: 'Alert Rules',    to: '/alerts',        cat: 'Monitor'  },
  { label: 'Profile',        to: '/profile',       cat: 'Account'  },
]

// ── Theme helpers ──────────────────────────────────────────────
function applyTheme(dark: boolean) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}

// ── Component ──────────────────────────────────────────────────
export default function Layout() {
  const [sidebarOpen,  setSidebarOpen]  = useState(true)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchOpen,   setSearchOpen]   = useState(false)
  const [searchQuery,  setSearchQuery]  = useState('')
  const [isDark,       setIsDark]       = useState(true)

  const { user, logout: clearUser } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const dropRef  = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const server   = useServerInfo()

  const currentPage = PAGE_LABELS[location.pathname] ?? 'Dashboard'

  // Apply theme on mount + change
  useEffect(() => { applyTheme(isDark) }, [isDark])

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    function onDown(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [dropdownOpen])

  // Close search on outside click
  useEffect(() => {
    if (!searchOpen) return
    function onDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
        setSearchQuery('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [searchOpen])

  // Global keyboard shortcut: Ctrl+K or Cmd+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(v => !v)
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setSearchQuery('')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const handleLogout = async () => {
    setDropdownOpen(false)
    try { await logout() } catch { /* ignore */ }
    clearCSRFToken()
    clearUser()
    navigate('/login')
  }

  const displayName  = user?.username ?? 'user'
  const dicebearUrl  = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(displayName)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`

  const searchResults = searchQuery.trim()
    ? SEARCH_ITEMS.filter(i =>
        i.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.cat.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : SEARCH_ITEMS

  const SERVER_ROWS: Array<{ icon: React.ReactNode; label: string; value: string }> = server ? [
    { icon: <IconHost />,     label: 'Hostname', value: server.hostname    },
    { icon: <IconIP />,       label: 'IP',       value: server.ip          },
    { icon: <IconOS />,       label: 'OS',       value: server.os          },
    { icon: <IconKernel />,   label: 'Kernel',   value: server.kernel      },
    { icon: <IconCPUSmall />, label: 'CPU',      value: `${server.cpu_model} · ${server.cpu_cores}c` },
    { icon: <IconUptime2 />,  label: 'Uptime',   value: server.uptime      },
    { icon: <IconLoad />,     label: 'Load',     value: server.load        },
    { icon: <IconLocation />, label: 'Region',   value: `${server.region} · ${server.provider}` },
  ] : []

  return (
    <div className={styles.shell}>
      {/* ── Floating top nav ── */}
      <header className={styles.topNav}>
        <div className={styles.topNavLeft}>
          <button
            className={styles.hamburger}
            onClick={() => setSidebarOpen(v => !v)}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <IconClose /> : <IconBars />}
          </button>
          <span className={styles.wordmark}>Orbit <span>VPS</span></span>
          <span className={styles.pageCrumb}>{currentPage}</span>
        </div>

        {/* ── Global search ── */}
        <div className={styles.searchBarWrap} ref={searchRef}>
          <button
            className={styles.searchBarTrigger}
            onClick={() => { setSearchOpen(v => !v); setTimeout(() => searchInputRef.current?.focus(), 50) }}
          >
            <span className={styles.searchBarIcon}><IconSearch /></span>
            <span className={styles.searchBarText}>Search pages...</span>
            <span className={styles.searchBarKbd}><kbd>⌘K</kbd></span>
          </button>

          {searchOpen && (
            <div className={styles.searchDropdown}>
              <div className={styles.searchInputWrap}>
                <span className={styles.searchDdIcon}><IconSearch /></span>
                <input
                  ref={searchInputRef}
                  className={styles.searchDdInput}
                  placeholder="Search pages, features..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <div className={styles.searchResults}>
                {searchResults.length === 0 && (
                  <div className={styles.searchEmpty}>No results for "{searchQuery}"</div>
                )}
                {searchResults.map(item => (
                  <button
                    key={item.to}
                    className={`${styles.searchResultItem} ${location.pathname === item.to ? styles.searchResultActive : ''}`}
                    onClick={() => { navigate(item.to); setSearchOpen(false); setSearchQuery('') }}
                  >
                    <span className={styles.searchResultLabel}>{item.label}</span>
                    <span className={styles.searchResultCat}>{item.cat}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.topNavRight}>
          {/* Theme toggle */}
          <button
            className={styles.themeToggle}
            onClick={() => setIsDark(v => !v)}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {isDark ? <IconSun /> : <IconMoon />}
          </button>

          {/* Profile pill + dropdown */}
          <div className={styles.profileWrap} ref={dropRef}>
            <button
              className={`${styles.navUserPill} ${dropdownOpen ? styles.navUserPillOpen : ''}`}
              onClick={() => setDropdownOpen(v => !v)}
              aria-haspopup="true"
              aria-expanded={dropdownOpen}
            >
              <img src={dicebearUrl} width={22} height={22} alt={displayName} style={{ borderRadius:'50%', display:'block', background:'rgba(74,158,255,0.1)' }} />
              <span className={styles.navUsername}>{displayName}</span>
              <span className={`${styles.pillChevron} ${dropdownOpen ? styles.pillChevronUp : ''}`}>
                <IconChevronDown />
              </span>
            </button>

            {dropdownOpen && (
              <div className={styles.dropdown}>
                {/* ── User header ── */}
                <div className={styles.dropHead}>
                  <img src={dicebearUrl} width={38} height={38} alt={displayName} style={{ borderRadius:'50%', display:'block', background:'rgba(74,158,255,0.1)', border:'2px solid rgba(74,158,255,0.3)' }} />
                  <div className={styles.dropHeadInfo}>
                    <div className={styles.dropName}>{displayName}</div>
                    <span className={styles.dropRole}>{user?.scope ?? 'admin'}</span>
                  </div>
                  <div className={`${styles.dropStatusDot} ${server?.status === 'online' ? styles.dotOnline : styles.dotOffline}`} title={`Server ${server?.status ?? ''}`} />
                </div>

                <div className={styles.dropDivider} />

                {/* ── Server info ── */}
                <div className={styles.dropSection}>
                  <div className={styles.dropSectionLabel}>
                    <IconHost /> Server Info
                  </div>
                  <div className={styles.dropInfoGrid}>
                    {SERVER_ROWS.map(row => (
                      <div key={row.label} className={styles.dropInfoRow}>
                        <span className={styles.dropInfoIcon}>{row.icon}</span>
                        <span className={styles.dropInfoKey}>{row.label}</span>
                        <span className={styles.dropInfoVal}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.dropDivider} />

                {/* ── Sign out ── */}
                <div className={styles.dropFooter}>
                  <button className={styles.dropSignOut} onClick={handleLogout}>
                    <IconLogout />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Floating sidebar ── */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarClosed}`}>
        <div className={styles.sidebarInner}>
          <div className={styles.sidebarAccent} />

          <nav className={styles.nav}>
            {NAV_SECTIONS.map(section => (
              <div key={section.label} className={styles.navSection}>
                <div className={styles.sectionLabel}>{section.label}</div>
                {section.items.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `${styles.navItem} ${isActive ? styles.active : ''}`
                    }
                  >
                    <span className={styles.navIcon}><Icon /></span>
                    <span className={styles.navLabel}>{label}</span>
                    <span className={styles.navIndicator} />
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          <div className={styles.sidebarFooter}>
            <div className={styles.userRow}>
              <img src={dicebearUrl} width={28} height={28} alt={displayName} style={{ borderRadius:'50%', display:'block', background:'rgba(74,158,255,0.1)', flexShrink:0 }} />
              <div className={styles.userInfo}>
                <div className={styles.userName}>{displayName}</div>
                <div className={styles.userScope}>{user?.scope ?? 'admin'}</div>
              </div>
              <button className={styles.logoutBtn} onClick={handleLogout} title="Sign out">
                <IconLogout />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Backdrop (mobile) ── */}
      {sidebarOpen && (
        <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Page content ── */}
      <main className={`${styles.main} ${sidebarOpen ? styles.mainShifted : ''}`}>
        <Outlet />
      </main>
      <ToastContainer />
    </div>
  )
}
