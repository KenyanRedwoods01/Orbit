import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchGitActionsStatus, fetchGitWorkflows, createGitWorkflow, updateGitWorkflow,
  deleteGitWorkflow, triggerGitWorkflow, fetchGitRuns, fetchGitRunLogs,
  cancelGitRun, retryGitRun, fetchGitWebhookInfo, updateGitWebhookSecret,
  fetchGitSettings, updateGitSettings,
  type GitWorkflow, type GitRun, type GitRunLog,
} from '@/lib/api'
import styles from './GithubActionsPage.module.css'

// ── Icons ───────────────────────────────────────────────────────────────────────
const IcoBack     = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="10,3 5,8 10,13"/></svg>
const IcoGit      = () => <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M23.546 10.93L13.067.452a1.55 1.55 0 0 0-2.188 0L8.708 2.627l2.76 2.76a1.838 1.838 0 0 1 2.327 2.341l2.658 2.66a1.838 1.838 0 1 1-1.1 1.101l-2.48-2.48v6.535a1.838 1.838 0 1 1-1.512-.036V9.003a1.838 1.838 0 0 1-.999-2.417L7.61 3.829 .45 10.93a1.55 1.55 0 0 0 0 2.187l10.477 10.478a1.55 1.55 0 0 0 2.189 0l10.43-10.478a1.55 1.55 0 0 0 0-2.187z"/></svg>
const IcoPlus     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><line x1="10" y1="3" x2="10" y2="17"/><line x1="3" y1="10" x2="17" y2="10"/></svg>
const IcoPlay     = () => <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11"><polygon points="5,3 17,10 5,17"/></svg>
const IcoStop     = () => <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11"><rect x="4" y="4" width="12" height="12" rx="1.5"/></svg>
const IcoRefresh  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M17 10a7 7 0 0 1-7 7 7 7 0 0 1-5-2"/><polyline points="2,10 3,15 8,14"/></svg>
const IcoEdit     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M14.5 2.5l3 3L7 16H4v-3z"/><path d="M12 5l3 3"/></svg>
const IcoTrash    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><polyline points="3,6 17,6"/><path d="M8 6V4h4v2"/><rect x="4" y="6" width="12" height="12" rx="1.5"/></svg>
const IcoCopy     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><rect x="8" y="8" width="9" height="9" rx="1.5"/><path d="M3 12V4a1 1 0 0 1 1-1h8"/></svg>
const IcoSave     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M17 17H3V3h10l4 4z"/><rect x="7" y="11" width="6" height="6" rx=".5"/><rect x="6" y="3" width="7" height="4" rx=".5"/></svg>
const IcoCheck    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><polyline points="4,10 8,14 16,6"/></svg>
const IcoClose    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
const IcoWebhook  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M10 2a8 8 0 1 0 0 16"/><path d="M12 8a4 4 0 0 1 4 4"/><circle cx="16" cy="16" r="2"/><path d="M10 12l2-4 2 4"/></svg>
const IcoKey      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><circle cx="8" cy="9" r="4.5"/><path d="M12 12l6 6"/><path d="M15 15l2-2"/></svg>
const IcoLog      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" width="13" height="13"><rect x="3" y="2" width="14" height="16" rx="2"/><line x1="7" y1="7" x2="13" y2="7"/><line x1="7" y1="10" x2="13" y2="10"/><line x1="7" y1="13" x2="10" y2="13"/></svg>
const IcoGlobe    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><circle cx="10" cy="10" r="8"/><path d="M2 10h16M10 2a14 14 0 0 1 0 16M10 2a14 14 0 0 0 0 16"/></svg>
const IcoSettings = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><circle cx="10" cy="10" r="2.8"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>

// ── Provider icons ──────────────────────────────────────────────────────────────
function ProviderIcon({ provider, size = 18 }: { provider: string; size?: number }) {
  const s = { width: size, height: size }
  switch (provider) {
    case 'github':
      return <svg viewBox="0 0 24 24" fill="currentColor" style={s}><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
    case 'gitlab':
      return <svg viewBox="0 0 24 24" fill="#fc6d26" style={s}><path d="M4.845.904a.96.96 0 0 0-.908.635L.05 13.144a1.437 1.437 0 0 0 .522 1.607l11.071 8.045a.586.586 0 0 0 .712 0l11.071-8.045a1.44 1.44 0 0 0 .523-1.608L20.062 1.54a.96.96 0 0 0-.908-.635.96.96 0 0 0-.908.635l-3.254 10.01H8.98L5.752 1.54A.96.96 0 0 0 4.845.904z"/></svg>
    case 'gitea':
      return <svg viewBox="0 0 24 24" fill="#609926" style={s}><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.368 13.184c0 .576-.461 1.037-1.037 1.037H7.67a1.036 1.036 0 0 1-1.038-1.037V9.778c0-.576.462-1.037 1.038-1.037h8.661c.576 0 1.037.461 1.037 1.037v3.406z"/></svg>
    case 'bitbucket':
      return <svg viewBox="0 0 24 24" fill="#0052cc" style={s}><path d="M.778 1.213a.768.768 0 0 0-.768.892l3.263 19.81c.084.5.517.865 1.022.865h15.386a.77.77 0 0 0 .765-.649l3.263-20.03a.768.768 0 0 0-.768-.888zM14.52 15.53H9.522L8.17 8.466h7.696z"/></svg>
    default:
      return <IcoGit />
  }
}

// ── Status helpers ──────────────────────────────────────────────────────────────
function runStatusColor(s: string) {
  switch (s) {
    case 'success':   return '#48c78e'
    case 'failed':    return '#ff4d4d'
    case 'running':   return '#f6c90e'
    case 'cancelled': return 'rgba(255,255,255,0.35)'
    default:          return 'rgba(255,255,255,0.25)'
  }
}
function runStatusLabel(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function fmtDuration(secs: number) {
  if (!secs) return '—'
  if (secs < 60) return `${Math.round(secs)}s`
  return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`
}
function fmtTs(ts: number) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function shortSHA(sha: string) {
  return sha ? sha.slice(0, 7) : ''
}

type Tab = 'overview' | 'workflows' | 'runs' | 'webhooks' | 'logs' | 'settings'

// ── Workflow form defaults ──────────────────────────────────────────────────────
const defaultWF: Partial<GitWorkflow> = {
  name: '', description: '', repo_url: '', branch: 'main',
  provider: 'github', trigger_type: 'push',
  build_command: '', deploy_command: '',
  pre_commands: '[]', post_commands: '[]', env_vars: '{}',
  timeout_secs: 600, retry_count: 0,
  notify_on_success: true, notify_on_failure: true,
  enabled: true, webhook_secret: '',
}

export default function GithubActionsPage() {
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const [tab, setTab]             = useState<Tab>('overview')
  const [wfModal, setWfModal]     = useState<'create' | GitWorkflow | null>(null)
  const [wfForm, setWfForm]       = useState<Partial<GitWorkflow>>(defaultWF)
  const [selectedRun, setSelectedRun] = useState<GitRun | null>(null)
  const [runFilter, setRunFilter] = useState<string>('')
  const [toast, setToast]         = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [whSecrets, setWhSecrets] = useState<Record<string, string>>({})
  const [settingsForm, setSettingsForm] = useState<any>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const toastRef = useRef<ReturnType<typeof setTimeout>>()

  const showToast = (msg: string) => {
    setToast(msg)
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), 3000)
  }

  const { data: status, isLoading } = useQuery({
    queryKey: ['git-actions-status'],
    queryFn: fetchGitActionsStatus,
    refetchInterval: 15000,
  })
  const { data: workflows = [] } = useQuery({
    queryKey: ['git-workflows'],
    queryFn: fetchGitWorkflows,
    enabled: tab === 'overview' || tab === 'workflows',
  })
  const { data: runs = [], refetch: refetchRuns } = useQuery({
    queryKey: ['git-runs', runFilter],
    queryFn: () => fetchGitRuns(runFilter || undefined),
    enabled: tab === 'overview' || tab === 'runs' || tab === 'logs',
    refetchInterval: (tab === 'runs' || tab === 'logs') ? 5000 : 30000,
  })
  const { data: runLogs = [] } = useQuery({
    queryKey: ['git-run-logs', selectedRun?.id],
    queryFn: () => fetchGitRunLogs(selectedRun!.id),
    enabled: !!selectedRun && tab === 'logs',
    refetchInterval: selectedRun?.status === 'running' ? 2000 : false,
  })
  const { data: webhookInfo } = useQuery({
    queryKey: ['git-webhook-info'],
    queryFn: fetchGitWebhookInfo,
    enabled: tab === 'webhooks',
  })
  const { data: settings } = useQuery({
    queryKey: ['git-settings'],
    queryFn: fetchGitSettings,
    enabled: tab === 'settings',
  })
  useEffect(() => { if (settings && !settingsForm) setSettingsForm({ ...settings }) }, [settings])

  useEffect(() => {
    if (tab === 'logs' && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [runLogs, tab])

  useEffect(() => {
    if (webhookInfo) {
      const init: Record<string, string> = {}
      Object.entries(webhookInfo.providers).forEach(([k, v]) => { init[k] = v.secret })
      setWhSecrets(init)
    }
  }, [webhookInfo])

  // ── Mutations ──────────────────────────────────────────────────────────────────
  const mutCreate = useMutation({
    mutationFn: () => createGitWorkflow(wfForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['git-workflows'] })
      qc.invalidateQueries({ queryKey: ['git-actions-status'] })
      setWfModal(null)
      showToast('Workflow created')
    },
  })
  const mutUpdate = useMutation({
    mutationFn: () => updateGitWorkflow((wfModal as GitWorkflow).id, wfForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['git-workflows'] })
      setWfModal(null)
      showToast('Workflow updated')
    },
  })
  const mutDelete = useMutation({
    mutationFn: (id: string) => deleteGitWorkflow(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['git-workflows'] })
      qc.invalidateQueries({ queryKey: ['git-actions-status'] })
      setDeleteConfirm(null)
      showToast('Workflow deleted')
    },
  })
  const mutTrigger = useMutation({
    mutationFn: (id: string) => triggerGitWorkflow(id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['git-runs'] })
      qc.invalidateQueries({ queryKey: ['git-actions-status'] })
      setTab('runs')
      showToast(`Run started: ${r.run_id.slice(0, 8)}`)
    },
  })
  const mutCancel = useMutation({
    mutationFn: (id: string) => cancelGitRun(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['git-runs'] })
      showToast('Run cancelled')
    },
  })
  const mutRetry = useMutation({
    mutationFn: (id: string) => retryGitRun(id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['git-runs'] })
      showToast(`Retry started: ${r.run_id.slice(0, 8)}`)
    },
  })
  const mutSaveSecret = useMutation({
    mutationFn: ({ provider, secret }: { provider: string; secret: string }) =>
      updateGitWebhookSecret(provider, secret),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['git-webhook-info'] })
      showToast(`${vars.provider} secret saved`)
    },
  })
  const mutSaveSettings = useMutation({
    mutationFn: () => updateGitSettings(settingsForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['git-settings'] }); showToast('Settings saved') },
  })

  // ── Modal helpers ──────────────────────────────────────────────────────────────
  function openCreate() {
    setWfForm({ ...defaultWF })
    setWfModal('create')
  }
  function openEdit(wf: GitWorkflow) {
    setWfForm({ ...wf })
    setWfModal(wf)
  }
  function submitModal() {
    if (wfModal === 'create') mutCreate.mutate()
    else mutUpdate.mutate()
  }
  function fv(k: keyof GitWorkflow) {
    return (wfForm as any)[k] ?? ''
  }
  function sv(k: keyof GitWorkflow, v: any) {
    setWfForm(f => ({ ...f, [k]: v }))
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text).catch(() => {})
    showToast('Copied')
  }

  // ── Recent runs for overview ───────────────────────────────────────────────────
  const recentRuns = runs.slice(0, 8)
  const selectedRunLogs: GitRunLog[] = runLogs

  // ── Render ─────────────────────────────────────────────────────────────────────
  if (isLoading) return <div className={styles.page}><div className={styles.loading}>Loading Git Actions…</div></div>

  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* Back */}
      <div className={styles.backLink} onClick={() => navigate('/plugins')}>
        <IcoBack /> Plugins
      </div>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <IcoGit />
        </div>
        <div className={styles.headerMeta}>
          <div className={styles.headerTitle}>Git Actions</div>
          <div className={styles.headerSub}>CI/CD pipeline runner — trigger builds and deployments from GitHub, GitLab, Gitea, and Bitbucket</div>
          <div className={styles.headerBadges}>
            <span className={`${styles.badge} ${styles.badgeGreen}`}><IcoCheck />Active</span>
            <span className={`${styles.badge} ${styles.badgeBlue}`}>v1.0.0</span>
            <span className={styles.badge}>MIT License</span>
            <span className={styles.badge}>GitHub · GitLab · Gitea · Bitbucket</span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} onClick={openCreate}>
            <IcoPlus />New Workflow
          </button>
          <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`} onClick={() => { refetchRuns(); qc.invalidateQueries({ queryKey: ['git-actions-status'] }) }}>
            <IcoRefresh />Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsRow}>
        {[
          { label: 'Workflows', value: status?.workflow_count ?? 0, color: '#63b3ed' },
          { label: 'Total Runs',  value: status?.total_runs ?? 0, color: 'rgba(255,255,255,0.7)' },
          { label: 'Success',    value: status?.success_runs ?? 0, color: '#48c78e' },
          { label: 'Failed',     value: status?.failed_runs ?? 0, color: '#ff4d4d' },
          { label: 'Success Rate', value: `${status?.success_rate ?? 0}%`, color: '#48c78e' },
        ].map(s => (
          <div key={s.label} className={styles.statCard}>
            <div>
              <div className={styles.statVal} style={{ color: s.color }}>{s.value}</div>
              <div className={styles.statLbl}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {([
          ['overview',  'Overview',   <IcoGit />],
          ['workflows', 'Workflows',  <IcoGlobe />],
          ['runs',      'Runs',       <IcoLog />],
          ['webhooks',  'Webhooks',   <IcoWebhook />],
          ['logs',      'Logs',       <IcoLog />],
          ['settings',  'Settings',   <IcoSettings />],
        ] as const).map(([id, label, icon]) => (
          <button key={id} className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`} onClick={() => setTab(id as Tab)}>
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className={styles.grid2}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Active Workflows</div>
            {workflows.length === 0
              ? <div className={styles.empty}>
                  <div className={styles.emptyIcon}><IcoGit /></div>
                  No workflows configured yet.<br />
                  <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} style={{ marginTop: 14 }} onClick={openCreate}><IcoPlus />Create First Workflow</button>
                </div>
              : <div className={styles.wfList}>
                  {workflows.slice(0, 5).map(wf => (
                    <div key={wf.id} className={styles.wfItem} style={{ padding: '10px 12px' }}>
                      <div className={styles.wfProviderIcon}><ProviderIcon provider={wf.provider} size={16} /></div>
                      <div className={styles.wfMeta}>
                        <div className={styles.wfName}>{wf.name}</div>
                        <div className={styles.wfTags}>
                          <span className={styles.wfTag}>{wf.provider}</span>
                          <span className={styles.wfTag}>{wf.branch}</span>
                          <span className={styles.wfTag}>{wf.trigger_type}</span>
                        </div>
                      </div>
                      <div>
                        {wf.last_run_status
                          ? <span style={{ fontSize: 11, color: runStatusColor(wf.last_run_status) }}>{runStatusLabel(wf.last_run_status)}</span>
                          : <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>No runs yet</span>
                        }
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Recent Runs</div>
            {recentRuns.length === 0
              ? <div className={styles.empty} style={{ padding: '24px 0' }}>No runs yet</div>
              : <div className={styles.runList}>
                  {recentRuns.map(run => (
                    <div key={run.id} className={`${styles.runItem} ${selectedRun?.id === run.id ? styles.runItemActive : ''}`}
                      style={{ padding: '8px 10px' }}
                      onClick={() => { setSelectedRun(run); setTab('logs') }}>
                      <div className={styles.runStatusDot} style={{ background: runStatusColor(run.status) }} />
                      <div className={styles.runMeta}>
                        <div className={styles.runTitle}>{run.workflow_name}</div>
                        <div className={styles.runSub}>
                          {shortSHA(run.commit_sha) && <code style={{ fontSize: 10, color: '#4a9eff' }}>{shortSHA(run.commit_sha)}</code>}
                          {run.author && <span>{run.author}</span>}
                        </div>
                      </div>
                      <div className={styles.runRight}>
                        <div className={styles.runDuration}>{fmtDuration(run.duration_secs)}</div>
                        <div className={styles.runTime}>{fmtTs(run.started_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>
      )}

      {/* ── Workflows ────────────────────────────────────────────────────────────── */}
      {tab === 'workflows' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} onClick={openCreate}><IcoPlus />New Workflow</button>
          </div>
          {workflows.length === 0
            ? <div className={styles.card}><div className={styles.empty}>
                <div className={styles.emptyIcon}><IcoGit /></div>
                No workflows yet. Create your first CI/CD pipeline.
                <br /><button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} style={{ marginTop: 14 }} onClick={openCreate}><IcoPlus />Create Workflow</button>
              </div></div>
            : <div className={styles.wfList}>
                {workflows.map(wf => (
                  <div key={wf.id} className={styles.wfItem}>
                    <div className={styles.wfProviderIcon}><ProviderIcon provider={wf.provider} /></div>
                    <div className={styles.wfMeta}>
                      <div className={styles.wfName}>{wf.name}</div>
                      {wf.description && <div className={styles.wfDesc}>{wf.description}</div>}
                      <div className={styles.wfTags}>
                        <span className={`${styles.wfTag} ${styles.wfTagBlue}`}>{wf.provider}</span>
                        <span className={styles.wfTag}>branch: {wf.branch}</span>
                        <span className={styles.wfTag}>on: {wf.trigger_type}</span>
                        {wf.repo_url && <span className={styles.wfTag} style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{wf.repo_url.replace('https://', '').replace('http://', '')}</span>}
                        <span className={styles.wfTag}>{wf.total_runs} run{wf.total_runs !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div className={styles.wfLastRun}>
                      {wf.last_run_status
                        ? <div className={styles.wfStatus} style={{ background: runStatusColor(wf.last_run_status) + '18', color: runStatusColor(wf.last_run_status), border: `1px solid ${runStatusColor(wf.last_run_status)}30` }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: runStatusColor(wf.last_run_status) }} />
                            {runStatusLabel(wf.last_run_status)}
                          </div>
                        : <div className={`${styles.badge}`}>No runs</div>
                      }
                      {wf.last_run_at > 0 && <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>{fmtTs(wf.last_run_at)}</div>}
                    </div>
                    <div className={styles.wfActions}>
                      <button className={`${styles.btn} ${styles.btnGhost} ${styles.btnXs}`} title="Run now"
                        onClick={() => mutTrigger.mutate(wf.id)} disabled={mutTrigger.isPending}>
                        <IcoPlay />
                      </button>
                      <button className={`${styles.btn} ${styles.btnGhost} ${styles.btnXs}`} title="Edit" onClick={() => openEdit(wf)}>
                        <IcoEdit />
                      </button>
                      <button className={`${styles.btn} ${styles.btnGhost} ${styles.btnXs}`} title="Delete"
                        style={{ color: '#ff6b6b' }} onClick={() => setDeleteConfirm(wf.id)}>
                        <IcoTrash />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
          }
          {/* Delete confirm */}
          {deleteConfirm && (
            <div className={styles.overlay} onClick={() => setDeleteConfirm(null)}>
              <div className={styles.modal} style={{ maxWidth: 380, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                <div className={styles.modalTitle} style={{ color: '#ff6b6b' }}>Delete Workflow?</div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>This will also delete all associated run history and logs. This action cannot be undone.</p>
                <div className={styles.modalActions} style={{ justifyContent: 'center' }}>
                  <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setDeleteConfirm(null)}>Cancel</button>
                  <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => mutDelete.mutate(deleteConfirm)} disabled={mutDelete.isPending}>
                    {mutDelete.isPending ? 'Deleting…' : 'Delete Workflow'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Runs ─────────────────────────────────────────────────────────────────── */}
      {tab === 'runs' && (
        <div>
          <div className={styles.filterBar}>
            <select className={styles.filterSelect} value={runFilter} onChange={e => setRunFilter(e.target.value)}>
              <option value="">All Workflows</option>
              {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <select className={styles.filterSelect} onChange={e => setRunFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="running">Running</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`} onClick={() => refetchRuns()}><IcoRefresh />Refresh</button>
          </div>
          {runs.length === 0
            ? <div className={styles.card}><div className={styles.empty}><div className={styles.emptyIcon}><IcoLog /></div>No runs yet. Trigger a workflow to see results.</div></div>
            : <div className={styles.runList}>
                {runs.map(run => (
                  <div key={run.id} className={`${styles.runItem} ${selectedRun?.id === run.id ? styles.runItemActive : ''}`}
                    onClick={() => { setSelectedRun(run); setTab('logs') }}>
                    <div className={styles.runStatusDot} style={{ background: runStatusColor(run.status) }} />
                    <div className={styles.runMeta}>
                      <div className={styles.runTitle}>
                        {run.workflow_name} &nbsp;
                        <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>#{run.id.slice(0, 8)}</span>
                      </div>
                      <div className={styles.runSub}>
                        <span style={{ color: runStatusColor(run.status) }}>{runStatusLabel(run.status)}</span>
                        {shortSHA(run.commit_sha) && <code style={{ fontSize: 10, color: '#4a9eff' }}>{shortSHA(run.commit_sha)}</code>}
                        {run.commit_message && <span style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.commit_message}</span>}
                        {run.author && <span>{run.author}</span>}
                        <span>{run.trigger_type}</span>
                      </div>
                    </div>
                    <div className={styles.runRight}>
                      <div className={styles.runDuration}>{fmtDuration(run.duration_secs)}</div>
                      <div className={styles.runTime}>{fmtTs(run.started_at)}</div>
                    </div>
                    <div className={styles.runActions} onClick={e => e.stopPropagation()}>
                      {run.status === 'running'
                        ? <button className={`${styles.btn} ${styles.btnGhost} ${styles.btnXs}`} style={{ color: '#ff4d4d' }}
                            onClick={() => mutCancel.mutate(run.id)} disabled={mutCancel.isPending} title="Cancel">
                            <IcoStop />
                          </button>
                        : <button className={`${styles.btn} ${styles.btnGhost} ${styles.btnXs}`}
                            onClick={() => mutRetry.mutate(run.id)} disabled={mutRetry.isPending} title="Retry">
                            <IcoRefresh />
                          </button>
                      }
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* ── Webhooks ─────────────────────────────────────────────────────────────── */}
      {tab === 'webhooks' && (
        <div>
          <div className={styles.card} style={{ marginBottom: 14 }}>
            <div className={styles.cardTitle}>Webhook Endpoints</div>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', marginBottom: 16, lineHeight: 1.6 }}>
              Add these URLs as webhooks in your Git provider. When code is pushed, your configured workflows will be triggered automatically. Optionally set a secret for HMAC signature verification.
            </p>
            <div className={styles.providerGrid}>
              {(['github', 'gitlab', 'gitea', 'bitbucket'] as const).map(provider => {
                const info = webhookInfo?.providers?.[provider]
                const url = info?.url ?? `${webhookInfo?.base_url ?? ''}/${provider}`
                return (
                  <div key={provider} className={styles.providerCard}>
                    <div className={styles.providerHeader}>
                      <ProviderIcon provider={provider} size={20} />
                      <span className={styles.providerName}>{provider.charAt(0).toUpperCase() + provider.slice(1)}</span>
                    </div>
                    <div className={styles.label} style={{ marginBottom: 4 }}>Webhook URL</div>
                    <div className={styles.providerUrl} onClick={() => copyText(url)} title="Click to copy">
                      {url}
                    </div>
                    <div className={styles.label} style={{ marginBottom: 5 }}><IcoKey /> Secret (optional)</div>
                    <div className={styles.providerSecretRow}>
                      <input
                        type="text"
                        className={styles.providerSecretInput}
                        placeholder="Leave empty to disable signature verification"
                        value={whSecrets[provider] ?? ''}
                        onChange={e => setWhSecrets(s => ({ ...s, [provider]: e.target.value }))}
                      />
                      <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                        onClick={() => mutSaveSecret.mutate({ provider, secret: whSecrets[provider] ?? '' })}
                        disabled={mutSaveSecret.isPending}>
                        <IcoSave />
                      </button>
                      <button className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}
                        onClick={() => copyText(url)} title="Copy URL">
                        <IcoCopy />
                      </button>
                    </div>
                    {provider === 'github' && (
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 8, lineHeight: 1.5 }}>
                        In GitHub: Settings → Webhooks → Add webhook. Content type: application/json
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Logs ─────────────────────────────────────────────────────────────────── */}
      {tab === 'logs' && (
        <div className={styles.grid2}>
          <div>
            <div className={styles.card} style={{ marginBottom: 10 }}>
              <div className={styles.cardTitle}>Select Run</div>
              {runs.length === 0
                ? <div className={styles.empty} style={{ padding: '16px 0' }}>No runs yet</div>
                : <div className={styles.runList} style={{ maxHeight: 440, overflowY: 'auto' }}>
                    {runs.slice(0, 30).map(run => (
                      <div key={run.id}
                        className={`${styles.runItem} ${selectedRun?.id === run.id ? styles.runItemActive : ''}`}
                        style={{ padding: '8px 10px' }}
                        onClick={() => setSelectedRun(run)}>
                        <div className={styles.runStatusDot} style={{ background: runStatusColor(run.status) }} />
                        <div className={styles.runMeta}>
                          <div className={styles.runTitle}>{run.workflow_name}</div>
                          <div className={styles.runSub}>
                            <span style={{ color: runStatusColor(run.status) }}>{runStatusLabel(run.status)}</span>
                            <span>{fmtTs(run.started_at)}</span>
                          </div>
                        </div>
                        <div className={styles.runDuration}>{fmtDuration(run.duration_secs)}</div>
                      </div>
                    ))}
                  </div>
              }
            </div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              {selectedRun
                ? <>Run Logs — <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#4a9eff' }}>#{selectedRun.id.slice(0, 8)}</span>
                    {selectedRun.status === 'running' && <span style={{ fontSize: 10.5, color: '#f6c90e', marginLeft: 8 }}>Live</span>}
                  </>
                : 'Run Logs'
              }
            </div>
            {!selectedRun
              ? <div className={styles.empty}>Select a run from the left to view its logs</div>
              : selectedRunLogs.length === 0
                ? <div className={styles.empty}>No logs available for this run</div>
                : <div className={styles.logViewer} ref={logRef}>
                    {selectedRunLogs.map((l, i) => (
                      <div key={i} className={styles.logLine}>
                        <span className={styles.logTs}>{new Date(l.ts * 1000).toLocaleTimeString()}</span>
                        <span className={`${styles.logLvl} ${l.level === 'error' ? styles.logLvlError : l.level === 'warn' ? styles.logLvlWarn : styles.logLvlInfo}`}>
                          {l.level.toUpperCase()}
                        </span>
                        <span className={styles.logMsg}>{l.message}</span>
                      </div>
                    ))}
                  </div>
            }
          </div>
        </div>
      )}

      {/* ── Settings ─────────────────────────────────────────────────────────────── */}
      {tab === 'settings' && settingsForm && (
        <div className={styles.card} style={{ maxWidth: 600 }}>
          <div className={styles.cardTitle}>Git Actions Settings</div>
          <div className={styles.settingsSection}>
            <div className={styles.settingsTitle}>Git Provider Tokens</div>
            {[
              { k: 'github_token', label: 'GitHub Token', desc: 'Personal access token for cloning private GitHub repositories' },
              { k: 'gitlab_token', label: 'GitLab Token', desc: 'Personal access token for cloning private GitLab repositories' },
              { k: 'gitea_token',  label: 'Gitea Token',  desc: 'API token for cloning private Gitea repositories' },
            ].map(({ k, label, desc }) => (
              <div key={k} className={styles.settingRow}>
                <div style={{ flex: 1 }}>
                  <div className={styles.settingLabel}>{label}</div>
                  <div className={styles.settingDesc}>{desc}</div>
                </div>
                <input type="password" className={styles.input} style={{ width: 220, flex: 'none' }}
                  value={settingsForm[k] ?? ''} onChange={e => setSettingsForm((f: any) => ({ ...f, [k]: e.target.value }))}
                  placeholder="ghp_…" />
              </div>
            ))}
          </div>
          <div className={styles.settingsSection}>
            <div className={styles.settingsTitle}>Execution</div>
            <div className={styles.settingRow}>
              <div style={{ flex: 1 }}>
                <div className={styles.settingLabel}>Work Directory</div>
                <div className={styles.settingDesc}>Where cloned repositories and build artifacts are stored</div>
              </div>
              <input className={styles.input} style={{ width: 220, flex: 'none' }}
                value={settingsForm.work_dir ?? ''} onChange={e => setSettingsForm((f: any) => ({ ...f, work_dir: e.target.value }))}
                placeholder="/tmp/orbit-git-actions" />
            </div>
            <div className={styles.settingRow}>
              <div style={{ flex: 1 }}>
                <div className={styles.settingLabel}>Max Concurrent Runs</div>
                <div className={styles.settingDesc}>Maximum number of workflows that can run simultaneously</div>
              </div>
              <input type="number" className={styles.input} style={{ width: 80, flex: 'none' }}
                value={settingsForm.max_concurrent ?? 3} onChange={e => setSettingsForm((f: any) => ({ ...f, max_concurrent: parseInt(e.target.value) || 1 }))}
                min={1} max={20} />
            </div>
            <div className={styles.settingRow}>
              <div style={{ flex: 1 }}>
                <div className={styles.settingLabel}>Default Timeout (seconds)</div>
                <div className={styles.settingDesc}>Default maximum run duration. Individual workflows can override this.</div>
              </div>
              <input type="number" className={styles.input} style={{ width: 100, flex: 'none' }}
                value={settingsForm.default_timeout ?? 600} onChange={e => setSettingsForm((f: any) => ({ ...f, default_timeout: parseInt(e.target.value) || 300 }))}
                min={60} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => mutSaveSettings.mutate()} disabled={mutSaveSettings.isPending}>
              <IcoSave />{mutSaveSettings.isPending ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ── Workflow Modal ───────────────────────────────────────────────────────── */}
      {wfModal !== null && (
        <div className={styles.overlay} onClick={() => setWfModal(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalTitle}>
              {wfModal === 'create' ? 'New Workflow' : `Edit: ${(wfModal as GitWorkflow).name}`}
            </div>

            <div className={styles.formRow}>
              <label className={styles.label}>Name *</label>
              <input className={styles.input} value={fv('name')} onChange={e => sv('name', e.target.value)} placeholder="Deploy to production" />
            </div>
            <div className={styles.formRow}>
              <label className={styles.label}>Description</label>
              <input className={styles.input} value={fv('description')} onChange={e => sv('description', e.target.value)} placeholder="Optional description" />
            </div>
            <div className={styles.formRow}>
              <label className={styles.label}>Repository URL *</label>
              <input className={styles.input} value={fv('repo_url')} onChange={e => sv('repo_url', e.target.value)} placeholder="https://github.com/user/repo" />
            </div>
            <div className={`${styles.formRow} ${styles.formRow2}`}>
              <div className={styles.formRow}>
                <label className={styles.label}>Branch</label>
                <input className={styles.input} value={fv('branch')} onChange={e => sv('branch', e.target.value)} placeholder="main" />
              </div>
              <div className={styles.formRow}>
                <label className={styles.label}>Git Provider</label>
                <select className={styles.select} value={fv('provider')} onChange={e => sv('provider', e.target.value)}>
                  <option value="github">GitHub</option>
                  <option value="gitlab">GitLab</option>
                  <option value="gitea">Gitea</option>
                  <option value="bitbucket">Bitbucket</option>
                </select>
              </div>
            </div>
            <div className={`${styles.formRow} ${styles.formRow2}`}>
              <div className={styles.formRow}>
                <label className={styles.label}>Trigger</label>
                <select className={styles.select} value={fv('trigger_type')} onChange={e => sv('trigger_type', e.target.value)}>
                  <option value="push">Push</option>
                  <option value="pull_request">Pull Request</option>
                  <option value="tag">Tag</option>
                  <option value="manual">Manual only</option>
                </select>
              </div>
              <div className={styles.formRow}>
                <label className={styles.label}>Timeout (seconds)</label>
                <input type="number" className={styles.input} value={fv('timeout_secs') || 600} onChange={e => sv('timeout_secs', parseInt(e.target.value) || 600)} min={30} />
              </div>
            </div>
            <div className={styles.formRow}>
              <label className={styles.label}>Build Command</label>
              <textarea className={styles.textarea} value={fv('build_command')} onChange={e => sv('build_command', e.target.value)} placeholder="npm install && npm run build" style={{ minHeight: 56 }} />
            </div>
            <div className={styles.formRow}>
              <label className={styles.label}>Deploy Command</label>
              <textarea className={styles.textarea} value={fv('deploy_command')} onChange={e => sv('deploy_command', e.target.value)} placeholder="systemctl restart myapp" style={{ minHeight: 56 }} />
            </div>
            <div className={styles.formRow}>
              <label className={styles.label}>Webhook Secret (optional)</label>
              <input className={styles.input} value={fv('webhook_secret')} onChange={e => sv('webhook_secret', e.target.value)} placeholder="Leave empty to skip signature check" />
            </div>

            <div className={styles.modalActions}>
              <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setWfModal(null)}><IcoClose />Cancel</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={submitModal}
                disabled={mutCreate.isPending || mutUpdate.isPending || !fv('name') || !fv('repo_url')}>
                <IcoSave />{wfModal === 'create' ? (mutCreate.isPending ? 'Creating…' : 'Create Workflow') : (mutUpdate.isPending ? 'Saving…' : 'Save Changes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
