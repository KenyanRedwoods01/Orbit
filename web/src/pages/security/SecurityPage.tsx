import React, { useState, useMemo, useEffect, lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
// Lazy-load plugin management pages so they render inside the security tab
const Fail2BanEmbed  = lazy(() => import('@/pages/plugins/Fail2BanPage'))
const CrowdSecEmbed  = lazy(() => import('@/pages/plugins/CrowdSecPage'))
const WazuhEmbed     = lazy(() => import('@/pages/plugins/WazuhPage'))
const SuricataEmbed  = lazy(() => import('@/pages/plugins/SuricataPage'))
const pluginEmbeds: Partial<Record<string, React.ComponentType>> = {
  fail2ban: Fail2BanEmbed,
  crowdsec:  CrowdSecEmbed,
  wazuh:     WazuhEmbed,
  suricata:  SuricataEmbed,
}
import { fetchSecurityAudit, fetchSecurityStats } from '@/lib/api'
import {
  SEV_META,
  type SSHCheck, type Severity, type SSHCheckStatus,
} from './securityData'
import styles from './SecurityPage.module.css'
import { usePluginsStore } from '@/store/plugins'
import { SecurityChecklistSection } from './SecurityChecklist'

// ─────────────────────────────────────────────────────────
// SVG Icons
// ─────────────────────────────────────────────────────────
const IcoShield  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2L4 5v5c0 4 3 7 6 8 3-1 6-4 6-8V5z"/><path d="M7 10l2 2 4-4"/></svg>
const IcoSSH     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="3" y="11" width="14" height="8" rx="1.5"/><path d="M7 11V7a3 3 0 0 1 6 0v4"/><circle cx="10" cy="15" r="1.2" fill="currentColor" stroke="none"/></svg>
const IcoPorts   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="16" height="5" rx="1.5"/><rect x="2" y="10" width="16" height="5" rx="1.5"/><circle cx="5.5" cy="5.5" r="0.9" fill="currentColor" stroke="none"/><circle cx="5.5" cy="12.5" r="0.9" fill="currentColor" stroke="none"/><line x1="9" y1="5.5" x2="14" y2="5.5"/><line x1="9" y1="12.5" x2="14" y2="12.5"/></svg>
const IcoCVE     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8"/><line x1="10" y1="7" x2="10" y2="10.5"/><circle cx="10" cy="13.5" r="0.7" fill="currentColor" stroke="none"/></svg>
const IcoCheck   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,10 8,14 16,6"/></svg>
const IcoX       = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
const IcoWarn    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l8 16H2z"/><line x1="10" y1="9" x2="10" y2="13"/><circle cx="10" cy="15.5" r="0.6" fill="currentColor" stroke="none"/></svg>
const IcoSearch  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="17" y2="17"/></svg>
const IcoList    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></svg>
const IcoGrid    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/></svg>
const IcoChevDn  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5,8 10,13 15,8"/></svg>
const IcoRefresh = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 10a7 7 0 0 1-7 7 7 7 0 0 1-5-2"/><polyline points="2,10 3,15 8,14"/></svg>
const IcoFix     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4l1 1-9 9-4 1 1-4z"/><line x1="13" y1="6" x2="14" y2="7"/></svg>
const IcoEye     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z"/><circle cx="10" cy="10" r="2.5"/></svg>
const IcoBlock   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="10" cy="10" r="8"/><line x1="4" y1="4" x2="16" y2="16"/></svg>
const IcoArrowUp = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="15" x2="10" y2="5"/><polyline points="6,9 10,5 14,9"/></svg>
const IcoArrowDn = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="5" x2="10" y2="15"/><polyline points="6,11 10,15 14,11"/></svg>
const IcoSort    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><line x1="4" y1="6" x2="16" y2="6"/><line x1="4" y1="10" x2="12" y2="10"/><line x1="4" y1="14" x2="8" y2="14"/></svg>
const IcoCopy    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="9" height="9" rx="1.5"/><path d="M3 12V4a1 1 0 0 1 1-1h8"/></svg>
const IcoCompliance = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M7 10l2 2 4-4"/></svg>

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────
type SectionTab  = 'ssh' | 'ports' | 'cve' | 'compliance' | 'fail2ban' | 'crowdsec' | 'wazuh' | 'suricata' | 'clamav' | 'docker' | 'trivy' | 'auth' | 'checklist'
type ViewMode    = 'list' | 'grid'
type ModalTab    = 'overview' | 'remediation' | 'details'

function gradeColor(grade: string) {
  if (grade === 'A') return '#68d391'
  if (grade === 'B') return '#8bc34a'
  if (grade === 'C') return '#f6ad55'
  if (grade === 'D') return '#fc8181'
  return '#ff4d4d'
}

function SevBadge({ sev }: { sev: Severity }) {
  const m = SEV_META[sev]
  return (
    <span className={styles.sevBadge} style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}` }}>
      {m.short}
    </span>
  )
}

function StatusBadge({ status }: { status: 'pass' | 'fail' | 'warn' }) {
  if (status === 'pass') return (
    <span className={styles.statusBadge} style={{ background: 'rgba(104,211,145,0.1)', color: '#68d391', border: '1px solid rgba(104,211,145,0.25)' }}>
      <span className={styles.passIcon}><IcoCheck /></span> Pass
    </span>
  )
  if (status === 'fail') return (
    <span className={styles.statusBadge} style={{ background: 'rgba(255,77,77,0.1)', color: '#ff4d4d', border: '1px solid rgba(255,77,77,0.25)' }}>
      <span className={styles.failIcon}><IcoX /></span> Fail
    </span>
  )
  return (
    <span className={styles.statusBadge} style={{ background: 'rgba(246,173,85,0.1)', color: '#f6ad55', border: '1px solid rgba(246,173,85,0.3)' }}>
      <span className={styles.warnIcon}><IcoWarn /></span> Warn
    </span>
  )
}


// ─────────────────────────────────────────────────────────
// SSH Detail Modal
// ─────────────────────────────────────────────────────────
function SSHModal({ check, onClose }: { check: SSHCheck; onClose: () => void }) {
  const [tab, setTab] = useState<ModalTab>('overview')
  const [copied, setCopied] = useState(false)
  const m = SEV_META[check.severity]

  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <SevBadge sev={check.severity} />
          <div className={styles.modalHeadInfo}>
            <div className={styles.modalTitle}>{check.param}</div>
            <div className={styles.modalSub}>{check.category} · {check.status === 'pass' ? 'Passing' : check.status === 'fail' ? 'Failing' : 'Warning'}</div>
          </div>
          <StatusBadge status={check.status} />
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalTabs}>
          {(['overview','remediation','details'] as ModalTab[]).map(t => (
            <button key={t} className={`${styles.modalTab} ${tab === t ? styles.modalTabActive : ''}`} onClick={() => setTab(t)}>
              {t === 'overview' ? 'Overview' : t === 'remediation' ? 'Remediation' : 'Details'}
            </button>
          ))}
        </div>
        <div className={styles.modalBody}>
          {tab === 'overview' && (
            <>
              <p className={styles.descBlock}>{check.description}</p>
              <div className={styles.detailGrid}>
                {[
                  ['Parameter',      check.param],
                  ['Category',       check.category],
                  ['Current value',  check.currentValue],
                  ['Desired value',  check.desiredValue],
                  ['Severity',       m.label],
                  ['Status',         check.status.toUpperCase()],
                ].map(([k,v]) => (
                  <React.Fragment key={k}><span className={styles.detailKey}>{k}</span><span className={styles.detailVal}>{v}</span></React.Fragment>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Security Impact</div>
                <p className={styles.descBlock}>{check.impact}</p>
              </div>
            </>
          )}
          {tab === 'remediation' && (
            <>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Verification Command</div>
                <div className={styles.codeBlock}>{check.command}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Fix Command</div>
                <div className={styles.codeBlock}>{check.remediation}</div>
              </div>
            </>
          )}
          {tab === 'details' && (
            <div className={styles.detailGrid}>
              {[
                ['Check ID',      check.id],
                ['Param',         check.param],
                ['Category',      check.category],
                ['Severity',      m.label + ' (' + m.short + ')'],
                ['Current',       check.currentValue],
                ['Desired',       check.desiredValue],
                ['Status',        check.status.toUpperCase()],
                ['Verify cmd',    check.command],
              ].map(([k,v]) => (
                <React.Fragment key={k}><span className={styles.detailKey}>{k}</span><span className={styles.detailVal}>{v}</span></React.Fragment>
              ))}
            </div>
          )}
        </div>
        <div className={styles.modalActions}>
          {check.status !== 'pass' && (
            <button className={`${styles.modalActBtn} ${styles.modalActPrimary}`}><IcoFix />Apply Fix</button>
          )}
          <button className={styles.modalActBtn} onClick={() => copy(check.remediation)}>
            <IcoCopy />{copied ? 'Copied!' : 'Copy command'}
          </button>
          <button className={styles.modalActBtn}><IcoEye />View config</button>
          <button className={styles.modalActBtn}><IcoRefresh />Revert backup</button>
        </div>
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────
export default function SecurityPage() {
  const { statuses: pluginStatuses } = usePluginsStore()
  const [tab,          setTab]          = useState<SectionTab>('ssh')
  const [view,         setView]         = useState<ViewMode>('list')
  const [search,       setSearch]       = useState('')
  const [sevFilter,    setSevFilter]    = useState<Set<Severity>>(new Set())
  const [sortKey,      setSortKey]      = useState('severity')
  const [sortDir,      setSortDir]      = useState<'asc'|'desc'>('asc')
  const [selectedSSH,  setSelectedSSH]  = useState<SSHCheck | null>(null)

  const { data: auditData, refetch: refetchAudit, isFetching: scanning } = useQuery({
    queryKey: ['security-audit'],
    queryFn: fetchSecurityAudit,
    staleTime: 5 * 60 * 1000,
  })

  useQuery({
    queryKey: ['security-stats'],
    queryFn: fetchSecurityStats,
    staleTime: 5 * 60 * 1000,
  })

  const score = Math.round(auditData?.score ?? 100)
  const grade = auditData?.grade ?? 'A'
  const lastScanned = auditData?.scanned_at
    ? new Date(auditData.scanned_at).toLocaleString()
    : 'Not scanned yet'

  // Map API SSH findings → SSHCheck format (real data only)
  const effectiveSSHChecks = useMemo<SSHCheck[]>(() => {
    if (!auditData?.findings) return []
    return auditData.findings
      .filter(f => f.category === 'SSH Configuration')
      .map(f => ({
        id: f.id,
        param: f.title,
        description: f.description,
        currentValue: 'Non-compliant',
        desiredValue: 'Compliant',
        severity: f.severity as Severity,
        status: 'fail' as SSHCheckStatus,
        category: f.category,
        command: '',
        remediation: f.remediation ?? '',
        impact: '',
      }))
  }, [auditData])

  // Network security findings from API for ports tab
  const apiNetworkFindings = useMemo(() => {
    if (!auditData?.findings) return []
    return auditData.findings.filter(f =>
      f.category === 'Network Security' || f.category === 'File Permissions' || f.category === 'Access Control' || f.category === 'System Updates'
    )
  }, [auditData])

  const sshCounts = useMemo(() => ({
    fail: effectiveSSHChecks.filter(c => c.status === 'fail').length,
    warn: effectiveSSHChecks.filter(c => c.status === 'warn').length,
    pass: effectiveSSHChecks.filter(c => c.status === 'pass').length,
  }), [effectiveSSHChecks])

  const portCounts = useMemo(() => ({
    critical: apiNetworkFindings.filter(f => f.severity === 'critical').length,
    high:     apiNetworkFindings.filter(f => f.severity === 'high').length,
    medium:   apiNetworkFindings.filter(f => f.severity === 'medium').length,
    low:      apiNetworkFindings.filter(f => f.severity === 'low').length,
  }), [apiNetworkFindings])

  const SEVERITIES: Severity[] = ['critical','high','medium','low','info']

  function toggleSev(s: Severity) {
    setSevFilter(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })
  }

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function SortIcon({ k }: { k: string }) {
    if (sortKey !== k) return <span className={styles.thSortIcon}><IcoSort /></span>
    return <span className={styles.thSortIcon}>{sortDir === 'asc' ? <IcoArrowUp /> : <IcoArrowDn />}</span>
  }

  function runScan() {
    refetchAudit()
  }

  // ── filtered / sorted SSH ──
  const filteredSSH = useMemo(() => {
    let r = [...effectiveSSHChecks]
    if (search) { const q = search.toLowerCase(); r = r.filter(c => c.param.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)) }
    if (sevFilter.size > 0) r = r.filter(c => sevFilter.has(c.severity))
    const SEV_ORDER: Record<string, number> = { fail: 0, warn: 1, pass: 2 }
    const SEV_RANK: Record<string, number>  = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
    r.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'severity') cmp = (SEV_RANK[a.severity] ?? 5) - (SEV_RANK[b.severity] ?? 5)
      else if (sortKey === 'status') cmp = (SEV_ORDER[a.status] ?? 3) - (SEV_ORDER[b.status] ?? 3)
      else if (sortKey === 'param') cmp = a.param.localeCompare(b.param)
      else if (sortKey === 'category') cmp = a.category.localeCompare(b.category)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return r
  }, [search, sevFilter, sortKey, sortDir])


  // Reset sort/filters on tab change
  function switchTab(t: SectionTab) {
    setTab(t); setSearch(''); setSevFilter(new Set()); setSortKey('severity'); setSortDir('asc')
  }

  // If current tab belongs to a disabled plugin, reset to ssh
  const pluginTabIds: SectionTab[] = ['fail2ban','crowdsec','wazuh','suricata','clamav','docker','trivy']
  const pluginTabToPluginId: Record<string,string> = {
    fail2ban:'fail2ban', crowdsec:'crowdsec', wazuh:'wazuh', suricata:'suricata',
    clamav:'clamav', docker:'docker-security', trivy:'trivy',
  }
  const currentTabDisabled = pluginTabIds.includes(tab) && pluginStatuses[pluginTabToPluginId[tab]] !== 'enabled'

  useEffect(() => {
    if (currentTabDisabled) switchTab('ssh')
  }, [currentTabDisabled])

  return (
    <div className={styles.page}>
      {/* ── Score Row ── */}
      <div className={styles.scoreRow}>
        <div className={styles.scoreGaugeCard}>
          <div className={styles.scoreGauge} style={{ borderColor: gradeColor(grade) }}>
            <span className={styles.scoreNum} style={{ color: gradeColor(grade) }}>{score}</span>
            <span className={styles.scoreGrade} style={{ color: gradeColor(grade) }}>Grade {grade}</span>
          </div>
          <div className={styles.scoreInfo}>
            <div className={styles.scoreTitleRow}>
              <span className={styles.scoreTitle}>Security Score</span>
              <span className={styles.scoreSub}>{lastScanned}</span>
            </div>
            <div className={styles.scoreSevRow}>
              {([['critical','#ff4d4d'],[' high','#ff8c00'],['medium','#f6ad55'],['low','#68d391']] as [string,string][]).map(([s,c]) => (
                <span key={s} className={styles.sevPill} style={{ color: c }}>
                  <span className={styles.sevDot} style={{ background: c }} />{s}
                </span>
              ))}
            </div>
            <button className={styles.iconBtn} onClick={runScan} disabled={scanning} style={{ width: 'fit-content', marginTop: 2 }}>
              <IcoRefresh />{scanning ? 'Scanning…' : 'Re-scan now'}
            </button>
          </div>
        </div>

        {[
          { label: 'SSH Checks',  val: `${sshCounts.fail}/${effectiveSSHChecks.length}`, sub: 'failing', color: sshCounts.fail > 0 ? '#ff8c00' : '#68d391', icon: <IcoSSH />, tab: 'ssh' as SectionTab },
          { label: 'Open Ports',  val: `${portCounts.critical + portCounts.high}`, sub: 'high-risk ports', color: portCounts.critical > 0 ? '#ff4d4d' : portCounts.high > 0 ? '#ff8c00' : '#68d391', icon: <IcoPorts />, tab: 'ports' as SectionTab },
          { label: 'CVEs Found',  val: 'N/A', sub: 'no scanner connected', color: 'var(--color-text-dim)', icon: <IcoCVE />, tab: 'cve' as SectionTab },
          { label: 'Compliance',  val: 'N/A', sub: 'no audit data', color: '#63b3ed', icon: <IcoCompliance />, tab: 'compliance' as SectionTab },
        ].map(s => (
          <div key={s.label} className={styles.statCard} style={{ cursor: 'pointer' }} onClick={() => switchTab(s.tab)}>
            <div className={styles.statIcon} style={{ background: s.color + '1a' }}>
              <span style={{ color: s.color }}>{s.icon}</span>
            </div>
            <div className={styles.statBody}>
              <div className={styles.statVal} style={{ color: s.color }}>{s.val}</div>
              <div className={styles.statLbl}>{s.label}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 1 }}>{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {scanning && (
        <div className={styles.scanBanner}>
          <div className={styles.scanSpinner} />
          Running full security audit — SSH hardening, port scan, CVE database check…
        </div>
      )}

      {/* ── Section tabs ── */}
      <div className={styles.tabBar}>
        {([
          { id: 'ssh',        label: 'SSH Hardening',   icon: <IcoSSH />,       badge: sshCounts.fail,                         badgeCrit: sshCounts.fail > 3,       pluginId: null },
          { id: 'ports',      label: 'Open Ports',      icon: <IcoPorts />,     badge: portCounts.critical + portCounts.high,  badgeCrit: portCounts.critical > 0,   pluginId: null },
          { id: 'cve',        label: 'CVE Scan',        icon: <IcoCVE />,       badge: null, badgeCrit: false,                                                                pluginId: null },
          { id: 'compliance', label: 'Compliance',      icon: <IcoCompliance />,badge: null, badgeCrit: false,                                                        pluginId: null },
          { id: 'fail2ban',   label: 'Fail2Ban',        icon: <IcoBlock />,     badge: null, badgeCrit: false,  pluginId: 'fail2ban' },
          { id: 'crowdsec',   label: 'CrowdSec',        icon: <IcoShield />,    badge: null, badgeCrit: false,  pluginId: 'crowdsec' },
          { id: 'wazuh',      label: 'Wazuh',           icon: <IcoSearch />,    badge: null, badgeCrit: false,  pluginId: 'wazuh' },
          { id: 'suricata',   label: 'Suricata',        icon: <IcoWarn />,      badge: null, badgeCrit: false,  pluginId: 'suricata' },
          { id: 'clamav',     label: 'ClamAV',          icon: <IcoFix />,       badge: null, badgeCrit: false,  pluginId: 'clamav' },
          { id: 'docker',     label: 'Docker Sec',      icon: <IcoPorts />,     badge: null, badgeCrit: false,  pluginId: 'docker-security' },
          { id: 'trivy',      label: 'Trivy',           icon: <IcoCVE />,       badge: null, badgeCrit: false,  pluginId: 'trivy' },
          { id: 'auth',       label: 'Auth & MFA',      icon: <IcoCompliance />,badge: null, badgeCrit: false,  pluginId: null },
          { id: 'checklist',  label: 'Sec Checklist',   icon: <IcoCheck />,     badge: null, badgeCrit: false,  pluginId: null },
        ] as { id: SectionTab; label: string; icon: React.ReactNode; badge: number|null; badgeCrit: boolean; pluginId: string|null }[])
          .filter(t => t.pluginId === null || pluginStatuses[t.pluginId] === 'enabled')
          .map(t => (
          <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`} onClick={() => switchTab(t.id)}>
            {t.icon}{t.label}
            {t.badge !== null && t.badge > 0 && (
              <span className={`${styles.tabBadge} ${t.badgeCrit ? styles.tabBadgeCrit : ''}`}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── SSH Hardening ── */}
      {tab === 'ssh' && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}><IcoSearch /></span>
                <input className={styles.searchInput} placeholder="Search parameters, categories…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className={styles.pillRow}>
                {SEVERITIES.slice(0,4).map(s => {
                  const m = SEV_META[s]; const active = sevFilter.has(s)
                  return <button key={s} className={styles.pill} style={active ? { background: m.bg, borderColor: m.color, color: m.color } : {}} onClick={() => toggleSev(s)}>{m.label}</button>
                })}
              </div>
              <div className={styles.selectWrap}>
                <select className={styles.tbSelect} value={`${sortKey === 'status' ? 'status' : 'severity'}`} onChange={e => { setSortKey(e.target.value); setSortDir('asc') }}>
                  <option value="severity">Sort: Severity</option>
                  <option value="status">Sort: Status</option>
                  <option value="param">Sort: Parameter</option>
                  <option value="category">Sort: Category</option>
                </select>
                <IcoChevDn />
              </div>
            </div>
            <div className={styles.toolbarRight}>
              <div className={styles.viewToggle}>
                <button className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnActive : ''}`} onClick={() => setView('list')}><IcoList /></button>
                <button className={`${styles.viewBtn} ${view === 'grid' ? styles.viewBtnActive : ''}`} onClick={() => setView('grid')}><IcoGrid /></button>
              </div>
            </div>
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionHeadLeft}>
                <span className={styles.sectionTitle}>SSH Configuration Checks</span>
                <span className={styles.resultCount}><strong>{filteredSSH.length}</strong> of {effectiveSSHChecks.length}</span>
              </div>
              <div className={styles.sectionHeadRight}>
                {[
                  { label: `${sshCounts.fail} failing`, color: '#ff4d4d', bg: 'rgba(255,77,77,0.1)', border: 'rgba(255,77,77,0.25)' },
                  { label: `${sshCounts.warn} warnings`, color: '#f6ad55', bg: 'rgba(246,173,85,0.1)', border: 'rgba(246,173,85,0.3)' },
                  { label: `${sshCounts.pass} passing`, color: '#68d391', bg: 'rgba(104,211,145,0.1)', border: 'rgba(104,211,145,0.25)' },
                ].map(b => (
                  <span key={b.label} className={styles.sevPill} style={{ color: b.color, borderColor: b.border, fontSize: 10 }}>{b.label}</span>
                ))}
              </div>
            </div>

            {view === 'list' ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead className={styles.thead}>
                    <tr>
                      <th className={`${styles.th} ${styles.thSort} ${sortKey === 'status' ? styles.thSortActive : ''}`} onClick={() => toggleSort('status')}>Status<SortIcon k="status" /></th>
                      <th className={`${styles.th} ${styles.thSort} ${sortKey === 'param' ? styles.thSortActive : ''}`} onClick={() => toggleSort('param')}>Parameter<SortIcon k="param" /></th>
                      <th className={`${styles.th} ${styles.thSort} ${sortKey === 'category' ? styles.thSortActive : ''}`} onClick={() => toggleSort('category')}>Category<SortIcon k="category" /></th>
                      <th className={`${styles.th} ${styles.thSort} ${sortKey === 'severity' ? styles.thSortActive : ''}`} onClick={() => toggleSort('severity')}>Severity<SortIcon k="severity" /></th>
                      <th className={styles.th}>Current</th>
                      <th className={styles.th}>Desired</th>
                      <th className={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSSH.map(c => (
                      <tr key={c.id} className={styles.tr} onClick={() => setSelectedSSH(c)}>
                        <td className={styles.td}><StatusBadge status={c.status} /></td>
                        <td className={`${styles.td} ${styles.tdCode}`} style={{ fontWeight: 600 }}>{c.param}</td>
                        <td className={styles.td}><span className={styles.catChip}>{c.category}</span></td>
                        <td className={styles.td}><SevBadge sev={c.severity} /></td>
                        <td className={`${styles.td} ${styles.tdCode}`} style={{ color: c.status === 'fail' ? '#ff4d4d' : c.status === 'warn' ? '#f6ad55' : 'var(--color-text-muted)' }}>{c.currentValue}</td>
                        <td className={`${styles.td} ${styles.tdCode}`} style={{ color: 'var(--color-text-dim)' }}>{c.desiredValue}</td>
                        <td className={styles.td} onClick={e => e.stopPropagation()}>
                          <div className={styles.actionBtns}>
                            {c.status !== 'pass' && <button className={`${styles.actBtn} ${styles.actBtnFix}`} onClick={() => setSelectedSSH(c)}><IcoFix />Fix</button>}
                            <button className={styles.actBtn} onClick={() => setSelectedSSH(c)}><IcoEye />View</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: 12 }}>
                <div className={styles.gridWrap}>
                  {filteredSSH.map(c => {
                    const m = SEV_META[c.severity]
                    return (
                      <div key={c.id} className={styles.gridCard} onClick={() => setSelectedSSH(c)}>
                        <div className={styles.gridCardAccent} style={{ background: m.color }} />
                        <div className={styles.gridCardBody}>
                          <div className={styles.gridCardTop}>
                            <div>
                              <div className={styles.gridCardTitle}>{c.param}</div>
                              <div className={styles.gridCardSub}>{c.category}</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                              <StatusBadge status={c.status} />
                              <SevBadge sev={c.severity} />
                            </div>
                          </div>
                          <div className={styles.gridCardDesc}>{c.description}</div>
                          <div className={styles.gridCardFoot}>
                            <span className={styles.catChip}>{c.category}</span>
                            <span style={{ fontSize: 10.5, color: 'var(--color-text-dim)', fontFamily: 'monospace', marginLeft: 'auto' }}>{c.currentValue}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Open Ports ── */}
      {tab === 'ports' && (
        <>
          {apiNetworkFindings.length > 0 && (
            <div className={styles.sectionCard} style={{ marginBottom: 12 }}>
              <div className={styles.sectionHead}>
                <div className={styles.sectionHeadLeft}>
                  <span className={styles.sectionTitle}>Live Audit Findings</span>
                  <span className={styles.resultCount}><strong>{apiNetworkFindings.length}</strong> issues detected</span>
                </div>
              </div>
              <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {apiNetworkFindings.map(f => {
                  const sev = f.severity as Severity
                  const m = SEV_META[sev] ?? SEV_META['info']
                  return (
                    <div key={f.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', background: 'var(--color-surface-raised)', borderRadius: 6, border: `1px solid ${m.border}` }}>
                      <span style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}`, borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '2px 5px', flexShrink: 0, marginTop: 1 }}>{m.short}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', marginBottom: 2 }}>{f.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{f.description}</div>
                        {f.remediation && <div style={{ fontSize: 10.5, color: 'var(--color-text-dim)', marginTop: 4 }}><strong style={{ color: 'var(--color-text-muted)' }}>Fix:</strong> {f.remediation}</div>}
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--color-text-dim)', flexShrink: 0 }}>{f.category}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {apiNetworkFindings.length === 0 && (
            <div className={styles.sectionCard}>
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 13 }}>
                No network security issues detected by the last audit.
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-dim)' }}>Run a new scan above to check for open port risks, access control gaps, and firewall misconfigurations.</div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── CVE Scan ── */}
      {tab === 'cve' && (
        <div className={styles.sectionCard}>
          <div style={{ padding: '40px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--color-text-dim)', fontWeight: 600, marginBottom: 8 }}>No CVE scanner connected</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-dim)', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>
              CVE scanning requires Trivy or another vulnerability scanner to be installed and enabled as a plugin. Enable the Trivy plugin to start scanning packages for known vulnerabilities.
            </div>
          </div>
        </div>
      )}

      {/* ── Compliance ── */}
      {tab === 'compliance' && (
        <>
          <div className={styles.sectionCard}>
            <div style={{ padding: '40px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-dim)', fontWeight: 600, marginBottom: 8 }}>No compliance data available</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-dim)', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>
                Compliance checks (CIS Benchmarks, PCI-DSS, HIPAA, NIST) require a connected audit tool. Run a full audit scan to generate compliance results.
              </div>
            </div>
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionHeadLeft}><span className={styles.sectionTitle}>Hardening Templates</span></div>
            </div>
            <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {[
                { name: 'CIS Level 1',    desc: 'Apply baseline CIS SSH hardening recommendations for all production servers.', color: '#60a5fa' },
                { name: 'CIS Level 2',    desc: 'Strict CIS profile — includes additional constraints for high-security environments.', color: '#a78bfa' },
                { name: 'PCI-DSS v3.2.1',desc: 'Payment Card Industry compliance hardening — SSH, TLS, access control.', color: '#f6ad55' },
                { name: 'HIPAA',          desc: 'Healthcare compliance — encryption, session logging, access control.', color: '#68d391' },
                { name: 'NIST 800-171',  desc: 'FIPS 140-2 validated cryptography — Curve25519, AES-256-GCM required.', color: '#63b3ed' },
                { name: 'Zero Trust',     desc: 'Strongest hardening — key-only auth, 2FA, fail2ban, non-standard port, port knocking.', color: '#fc8181' },
              ].map(t => (
                <div key={t.name} className={styles.gridCard} style={{ cursor: 'default' }}>
                  <div className={styles.gridCardAccent} style={{ background: t.color }} />
                  <div className={styles.gridCardBody}>
                    <div className={styles.gridCardTitle} style={{ color: t.color }}>{t.name}</div>
                    <div className={styles.gridCardDesc} style={{ WebkitLineClamp: 'unset' }}>{t.desc}</div>
                    <div className={styles.gridCardFoot}>
                      <button className={`${styles.actBtn} ${styles.actBtnFix}`} style={{ marginTop: 4 }}><IcoShield />Apply template</button>
                      <button className={styles.actBtn} style={{ marginTop: 4 }}><IcoEye />Preview changes</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Plugin tabs — embed the dedicated plugin management page ── */}
      {(['fail2ban','crowdsec','wazuh','suricata','clamav','docker','trivy'] as SectionTab[]).map(id =>
        tab === id ? (
          <div key={id}>
            {pluginEmbeds[id] ? (
              <Suspense fallback={
                <div className={styles.sectionCard}>
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-dim)' }}>Loading plugin UI…</div>
                </div>
              }>
                {React.createElement(pluginEmbeds[id]!)}
              </Suspense>
            ) : (
              <div className={styles.sectionCard}>
                <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)', fontWeight: 600, marginBottom: 8 }}>Plugin management not available</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-dim)', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>
                    This plugin is enabled but has no dedicated management interface yet.
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null
      )}

      {/* ── Auth & MFA ── */}
      {tab === 'auth' && (
        <div className={styles.sectionCard}>
          <div style={{ padding: '40px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--color-text-dim)', fontWeight: 600, marginBottom: 8 }}>Auth & MFA data not available</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-dim)', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>
              Authentication and MFA monitoring requires a connected identity provider or PAM module. Configure an auth integration to see session and MFA status data here.
            </div>
          </div>
        </div>
      )}

      {/* ── Security Checklist ── */}
      {tab === 'checklist' && <SecurityChecklistSection />}

      {/* ── Modals ── */}
      {selectedSSH && <SSHModal check={selectedSSH} onClose={() => setSelectedSSH(null)} />}
    </div>
  )
}
