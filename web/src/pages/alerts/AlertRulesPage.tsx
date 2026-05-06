import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchAlertRules, fetchAlertEvents,
  createAlertRule, updateAlertRule, deleteAlertRule, toggleAlertRule,
  type AlertRule,
} from '@/lib/api'
import styles from './AlertRulesPage.module.css'

// ── Icons ────────────────────────────────────────────────────────────────────
const IcoBell    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2a6 6 0 0 1 6 6v3l1.5 2.5h-15L4 11V8a6 6 0 0 1 6-6z"/><path d="M8 15.5a2 2 0 0 0 4 0"/></svg>
const IcoPlus    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg>
const IcoEdit    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 3.5a2.12 2.12 0 0 1 3 3L7 16l-4 1 1-4z"/></svg>
const IcoTrash   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="5,7 15,7"/><path d="M8 7V4h4v3"/><rect x="5" y="7" width="10" height="10" rx="1.5"/><line x1="8" y1="11" x2="8" y2="14"/><line x1="12" y1="11" x2="12" y2="14"/></svg>
const IcoCheck   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,10 8,14 16,6"/></svg>
const IcoX       = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
const IcoRefresh = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10a6 6 0 1 1 1.5 4"/><polyline points="4,14 4,10 8,10"/></svg>
const IcoPower   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3v5"/><path d="M6.3 5.3A7 7 0 1 0 13.7 5.3"/></svg>
const IcoFire    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C10 5 8 6 8 9a4 4 0 0 0 8 0c0-3-2-4-2-7z"/><path d="M10 12c-1 1.5-1 3 0 4s3 1 3-1"/></svg>

// ── Metric options ────────────────────────────────────────────────────────────
const METRICS = [
  { value: 'cpu',      label: 'CPU Usage (%)'      },
  { value: 'memory',   label: 'Memory Usage (%)'   },
  { value: 'disk',     label: 'Disk Usage (%)'     },
  { value: 'load1',    label: '1-min Load Avg'     },
  { value: 'load5',    label: '5-min Load Avg'     },
  { value: 'load15',   label: '15-min Load Avg'    },
  { value: 'swap',     label: 'Swap Usage (%)'     },
  { value: 'net_sent', label: 'Net Send (bps)'     },
  { value: 'net_recv', label: 'Net Recv (bps)'     },
]

const OPERATORS = [
  { value: '>',  label: '> Greater than'    },
  { value: '>=', label: '>= At least'       },
  { value: '<',  label: '< Less than'       },
  { value: '<=', label: '<= At most'        },
  { value: '==', label: '== Equals'         },
]

const CHANNELS = [
  { value: 'log',     label: 'Dashboard Log' },
  { value: 'email',   label: 'Email'         },
  { value: 'webhook', label: 'Webhook'       },
  { value: 'slack',   label: 'Slack'         },
  { value: 'discord', label: 'Discord'       },
]

function metricLabel(m: string) {
  return METRICS.find(x => x.value === m)?.label ?? m
}
function operatorLabel(op: string) {
  return OPERATORS.find(x => x.value === op)?.label ?? op
}
function channelLabel(ch: string) {
  return CHANNELS.find(x => x.value === ch)?.label ?? ch
}
function tsToRelative(ts: number) {
  const diff = Math.floor(Date.now() / 1000 - ts)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ── Empty rule form ───────────────────────────────────────────────────────────
const emptyForm = (): Partial<AlertRule> => ({
  name: '', metric: 'cpu', operator: '>', threshold: 90, channel: 'log', enabled: true,
})

// ── Delete confirm modal ──────────────────────────────────────────────────────
function DeleteModal({ rule, onCancel, onConfirm, pending }: {
  rule: AlertRule; onCancel: () => void; onConfirm: () => void; pending: boolean
}) {
  return (
    <div className={styles.backdrop}>
      <div className={styles.modal} style={{ maxWidth: 400 }}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Delete Rule</span>
          <button className={styles.iconBtn} onClick={onCancel}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <p style={{ margin: 0, color: 'var(--color-text)', fontSize: 14 }}>
            Delete alert rule <strong>"{rule.name}"</strong>? This action cannot be undone.
          </p>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnSecondary} onClick={onCancel} disabled={pending}>Cancel</button>
          <button className={styles.btnDanger} onClick={onConfirm} disabled={pending}>
            {pending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Rule form modal ───────────────────────────────────────────────────────────
function RuleModal({ initial, onClose, onSave, pending }: {
  initial: Partial<AlertRule>; onClose: () => void; onSave: (rule: Partial<AlertRule>) => void; pending: boolean
}) {
  const [form, setForm] = useState<Partial<AlertRule>>(initial)
  const upd = (k: keyof AlertRule, v: string | number | boolean) =>
    setForm(f => ({ ...f, [k]: v }))

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{initial.id ? 'Edit Rule' : 'New Alert Rule'}</span>
          <button className={styles.iconBtn} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Rule Name</label>
            <input
              className={styles.input}
              placeholder="e.g. High CPU alert"
              value={form.name ?? ''}
              onChange={e => upd('name', e.target.value)}
            />
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Metric</label>
              <select className={styles.select} value={form.metric ?? 'cpu'} onChange={e => upd('metric', e.target.value)}>
                {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className={styles.formGroup} style={{ maxWidth: 160 }}>
              <label className={styles.label}>Operator</label>
              <select className={styles.select} value={form.operator ?? '>'} onChange={e => upd('operator', e.target.value)}>
                {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className={styles.formGroup} style={{ maxWidth: 110 }}>
              <label className={styles.label}>Threshold</label>
              <input
                className={styles.input}
                type="number"
                value={form.threshold ?? 90}
                onChange={e => upd('threshold', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Notification Channel</label>
            <select className={styles.select} value={form.channel ?? 'log'} onChange={e => upd('channel', e.target.value)}>
              {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          {(form.channel === 'webhook' || form.channel === 'slack' || form.channel === 'discord') && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Webhook URL</label>
              <input
                className={styles.input}
                placeholder="https://…"
                value={form.channel_cfg ?? ''}
                onChange={e => upd('channel_cfg', e.target.value)}
              />
            </div>
          )}
          {form.channel === 'email' && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Email Address</label>
              <input
                className={styles.input}
                placeholder="alerts@example.com"
                value={form.channel_cfg ?? ''}
                onChange={e => upd('channel_cfg', e.target.value)}
              />
            </div>
          )}
          <div className={styles.formGroup}>
            <label className={styles.toggleRow}>
              <span className={styles.label} style={{ marginBottom: 0 }}>Enabled</span>
              <div
                className={`${styles.toggle} ${form.enabled ? styles.toggleOn : ''}`}
                onClick={() => upd('enabled', !form.enabled)}
              >
                <div className={styles.toggleThumb} />
              </div>
            </label>
            <p className={styles.hint}>When enabled, this rule fires in real time against live metrics.</p>
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnSecondary} onClick={onClose} disabled={pending}>Cancel</button>
          <button
            className={styles.btnPrimary}
            onClick={() => onSave(form)}
            disabled={pending || !form.name?.trim()}
          >
            {pending ? 'Saving…' : (initial.id ? 'Save Changes' : 'Create Rule')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AlertRulesPage() {
  const qc = useQueryClient()
  const [modalRule, setModalRule]   = useState<Partial<AlertRule> | null>(null)
  const [deleteRule, setDeleteRule] = useState<AlertRule | null>(null)
  const [tab, setTab]               = useState<'rules' | 'events'>('rules')

  const { data: rules = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: fetchAlertRules,
    refetchInterval: 15000,
  })
  const { data: events = [] } = useQuery({
    queryKey: ['alert-events'],
    queryFn: fetchAlertEvents,
    refetchInterval: 15000,
  })

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['alert-rules'] })
    qc.invalidateQueries({ queryKey: ['alert-events'] })
  }

  const createM = useMutation({ mutationFn: createAlertRule, onSuccess: () => { setModalRule(null); inv() } })
  const updateM = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<AlertRule> }) => updateAlertRule(id, data), onSuccess: () => { setModalRule(null); inv() } })
  const deleteM = useMutation({ mutationFn: (id: number) => deleteAlertRule(id), onSuccess: () => { setDeleteRule(null); inv() } })
  const toggleM = useMutation({ mutationFn: (id: number) => toggleAlertRule(id), onSuccess: inv })

  const onSave = (form: Partial<AlertRule>) => {
    if (form.id) {
      updateM.mutate({ id: form.id, data: form })
    } else {
      createM.mutate(form as Omit<AlertRule, 'id' | 'created_at'>)
    }
  }

  const totalRules   = rules.length
  const activeRules  = rules.filter(r => r.enabled).length
  const disabledRules = rules.filter(r => !r.enabled).length
  const recentEvents  = events.slice(0, 5)

  const savePending = createM.isPending || updateM.isPending

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.headerTitle}><IcoBell /> Alert Rules</div>
          <div className={styles.headerDesc}>Real-time threshold monitoring with multi-channel notifications</div>
        </div>
        <div className={styles.headerRight}>
          <button className={`${styles.iconBtn} ${isFetching ? styles.spin : ''}`} onClick={() => refetch()} title="Refresh"><IcoRefresh /></button>
          <button className={styles.btnPrimary} onClick={() => setModalRule(emptyForm())}><IcoPlus /> New Rule</button>
        </div>
      </div>

      {/* Stats strip */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statVal}>{totalRules}</div>
          <div className={styles.statLabel}>Total Rules</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statVal} style={{ color: 'var(--color-success)' }}>{activeRules}</div>
          <div className={styles.statLabel}>Active</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statVal} style={{ color: 'var(--color-text-dim)' }}>{disabledRules}</div>
          <div className={styles.statLabel}>Disabled</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statVal} style={{ color: 'var(--color-warning)' }}>{events.length}</div>
          <div className={styles.statLabel}>Total Alerts Fired</div>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'rules' ? styles.tabActive : ''}`} onClick={() => setTab('rules')}>
          Rules ({totalRules})
        </button>
        <button className={`${styles.tab} ${tab === 'events' ? styles.tabActive : ''}`} onClick={() => setTab('events')}>
          Alert Events {events.length > 0 && <span className={styles.badge}>{events.length}</span>}
        </button>
      </div>

      {/* Rules tab */}
      {tab === 'rules' && (
        <div className={styles.tableWrap}>
          {isLoading && (
            <div className={styles.emptyState}>Loading rules…</div>
          )}
          {error && (
            <div className={styles.errorBanner}>
              Failed to load alert rules: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          )}
          {!isLoading && !error && rules.length === 0 && (
            <div className={styles.emptyState}>
              <IcoBell />
              <p>No alert rules configured yet.</p>
              <button className={styles.btnPrimary} onClick={() => setModalRule(emptyForm())}>
                <IcoPlus /> Create your first rule
              </button>
            </div>
          )}
          {rules.length > 0 && (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Rule</th>
                  <th className={styles.th}>Condition</th>
                  <th className={styles.th}>Channel</th>
                  <th className={styles.th} style={{ width: 90 }}>Status</th>
                  <th className={styles.th} style={{ width: 90 }}>Created</th>
                  <th className={styles.th} style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <tr key={rule.id} className={styles.tr}>
                    <td className={styles.td}>
                      <div className={styles.ruleName}>{rule.name}</div>
                      <div className={styles.ruleMetric}>{metricLabel(rule.metric)}</div>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.condBadge}>
                        {metricLabel(rule.metric)} {operatorLabel(rule.operator)} <strong>{rule.threshold}</strong>
                      </span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.channelBadge}>{channelLabel(rule.channel)}</span>
                    </td>
                    <td className={styles.td}>
                      <button
                        className={`${styles.statusBtn} ${rule.enabled ? styles.statusOn : styles.statusOff}`}
                        onClick={() => toggleM.mutate(rule.id)}
                        title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                      >
                        <IcoPower />
                        {rule.enabled ? 'Active' : 'Off'}
                      </button>
                    </td>
                    <td className={styles.td} style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
                      {tsToRelative(rule.created_at)}
                    </td>
                    <td className={styles.td}>
                      <div className={styles.actions}>
                        <button className={styles.iconBtn} title="Edit" onClick={() => setModalRule(rule)}>
                          <IcoEdit />
                        </button>
                        <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Delete" onClick={() => setDeleteRule(rule)}>
                          <IcoTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Events tab */}
      {tab === 'events' && (
        <div className={styles.tableWrap}>
          {events.length === 0 && (
            <div className={styles.emptyState}>
              <IcoCheck />
              <p>No alerts have fired yet. All systems nominal.</p>
            </div>
          )}
          {events.length > 0 && (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Alert</th>
                  <th className={styles.th}>Metric</th>
                  <th className={styles.th}>Value</th>
                  <th className={styles.th}>Channel</th>
                  <th className={styles.th}>Fired</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev, i) => (
                  <tr key={i} className={styles.tr}>
                    <td className={styles.td}>
                      <div className={styles.eventName}><IcoFire /> {ev.rule_name}</div>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.condBadge}>{metricLabel(ev.metric)} {ev.operator} {ev.threshold}</span>
                    </td>
                    <td className={styles.td} style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-danger)' }}>
                      {ev.value?.toFixed(1)}
                    </td>
                    <td className={styles.td}>
                      <span className={styles.channelBadge}>{channelLabel(ev.channel)}</span>
                    </td>
                    <td className={styles.td} style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
                      {tsToRelative(ev.fired_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Recent events sidebar strip */}
      {tab === 'rules' && recentEvents.length > 0 && (
        <div className={styles.recentSection}>
          <div className={styles.recentTitle}><IcoFire /> Recent Alerts</div>
          <div className={styles.recentList}>
            {recentEvents.map((ev, i) => (
              <div key={i} className={styles.recentItem}>
                <span className={styles.recentName}>{ev.rule_name}</span>
                <span className={styles.recentVal}>{metricLabel(ev.metric)} = {ev.value?.toFixed(1)}</span>
                <span className={styles.recentTime}>{tsToRelative(ev.fired_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {modalRule && (
        <RuleModal
          initial={modalRule}
          onClose={() => setModalRule(null)}
          onSave={onSave}
          pending={savePending}
        />
      )}
      {deleteRule && (
        <DeleteModal
          rule={deleteRule}
          onCancel={() => setDeleteRule(null)}
          onConfirm={() => deleteM.mutate(deleteRule.id)}
          pending={deleteM.isPending}
        />
      )}
    </div>
  )
}
