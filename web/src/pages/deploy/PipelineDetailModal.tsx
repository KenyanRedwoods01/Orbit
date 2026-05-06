import { useQuery } from '@tanstack/react-query'
import type { DeployHook } from '@/lib/api'
import { fetchDeployHookRuns } from '@/lib/api'
import { Modal, Spinner, StatusBadge } from '@/components/ui'
import { ServiceIcons, getServiceIcon } from './ServiceIcons'
import { timeAgo } from '@/lib/utils'
import styles from './DeployPage.module.css'

interface PipelineDetailModalProps {
  hook: DeployHook
  onClose: () => void
  onTrigger: () => void
  triggering: boolean
}

function statusLabel(s: string): 'active' | 'failed' | 'unknown' {
  if (s === 'ok') return 'active'
  if (s === 'error') return 'failed'
  return 'unknown'
}

export function PipelineDetailModal({ hook, onClose, onTrigger, triggering }: PipelineDetailModalProps) {
  const iconKey = getServiceIcon(hook.name, hook.project)
  const Icon = ServiceIcons[iconKey] || ServiceIcons.default

  const webhookUrl = `${window.location.origin}/api/deploy/hooks/${hook.id}/trigger`

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl).catch(() => {})
  }

  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['deploy-hook-runs', hook.id],
    queryFn: () => fetchDeployHookRuns(hook.id),
    retry: false,
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={hook.name}
      subtitle={`Pipeline details — ${hook.project}`}
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button
            className="btn btn-primary"
            onClick={onTrigger}
            disabled={triggering}
          >
            {triggering && <Spinner size="sm" />}
            {triggering ? 'Running…' : 'Trigger Deploy'}
          </button>
        </>
      }
    >
      {/* Header card */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--color-surface-raised)', borderRadius: 7, padding: '12px 14px', border: '1px solid var(--color-border)', marginBottom: 16 }}>
        <div className={styles.serviceIconWrapLg} style={{ margin: 0 }}>
          <Icon />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>{hook.name}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={`${styles.metaTag} ${styles.metaTagAccent}`}>
              {hook.strategy === 'blue-green' ? 'blue/green' : 'exec'}
            </span>
            <span className={styles.metaTag}>webhook</span>
            <span className={`${styles.metaTag} ${styles.metaTagSuccess}`}>active</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>Created</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{timeAgo(hook.created_at)}</div>
        </div>
      </div>

      {/* Details grid */}
      <div className={styles.detailGrid} style={{ marginBottom: 16 }}>
        <div className={styles.detailField}>
          <div className={styles.detailLabel}>Project</div>
          <div className={styles.detailValueMono}>{hook.project}</div>
        </div>
        <div className={styles.detailField}>
          <div className={styles.detailLabel}>Strategy</div>
          <div className={styles.detailValue}>
            {hook.strategy === 'blue-green' ? 'Blue/Green (zero-downtime)' : 'Direct exec'}
          </div>
        </div>
        <div className={styles.detailField}>
          <div className={styles.detailLabel}>Trigger</div>
          <div className={styles.detailValue}>Webhook (POST)</div>
        </div>
        <div className={styles.detailField}>
          <div className={styles.detailLabel}>Pipeline ID</div>
          <div className={styles.detailValueMono}>#{hook.id}</div>
        </div>
      </div>

      {/* Webhook box */}
      <div className={styles.webhookBox}>
        <div className={styles.webhookBoxLabel}>Webhook URL</div>
        <div className={styles.webhookBoxUrl}>{webhookUrl}</div>
        <div className={styles.webhookBoxActions}>
          <button className="btn btn-ghost btn-sm" onClick={copyWebhook}>
            Copy URL
          </button>
          <button className="btn btn-ghost btn-sm">
            Test Webhook
          </button>
        </div>
      </div>

      {/* Deployment history */}
      <div className={styles.section} style={{ marginBottom: 0 }}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Deployment History</span>
        </div>
        {histLoading ? (
          <div style={{ padding: '16px 0', display: 'flex', justifyContent: 'center' }}><Spinner size="sm" /></div>
        ) : history.length === 0 ? (
          <div style={{ padding: '16px 14px', color: 'var(--color-text-dim)', fontSize: 12 }}>No runs yet — trigger a deploy to see history.</div>
        ) : (
          <table className={styles.historyTable}>
            <tbody>
              {history.map(d => (
                <tr key={d.id}>
                  <td style={{ width: 40, color: 'var(--color-text-dim)', fontSize: 11 }}>#{d.id}</td>
                  <td style={{ width: 90 }}>
                    <StatusBadge
                      status={statusLabel(d.status)}
                      label={d.status === 'ok' ? 'Success' : d.status === 'error' ? 'Failed' : 'Running'}
                      size="sm"
                    />
                  </td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{d.project || d.hook_name}</td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{timeAgo(d.started_at)}</td>
                  <td style={{ color: 'var(--color-text-dim)', fontSize: 11, fontFamily: 'monospace' }}>{d.duration || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  )
}
