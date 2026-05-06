import { useEffect, useRef } from 'react'
import type { DeployLog } from '@/lib/api'
import { StatusBadge } from '@/components/ui'
import { timeAgo } from '@/lib/utils'
import styles from './DeployPage.module.css'

interface DeployLogPanelProps {
  log: DeployLog | null
  onClose: () => void
}

function statusToStatus(s: string): 'active' | 'failed' | 'unknown' {
  if (s === 'ok') return 'active'
  if (s === 'error') return 'failed'
  return 'unknown'
}

export function DeployLogPanel({ log, onClose }: DeployLogPanelProps) {
  const preRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [log?.output])

  if (!log) return null

  const duration = log.ended_at
    ? `${Math.round((log.ended_at - log.started_at))}s`
    : null

  return (
    <div className={styles.logPanel}>
      <div className={styles.logPanelHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <StatusBadge status={statusToStatus(log.status)} label={log.status === 'ok' ? 'Success' : log.status === 'error' ? 'Failed' : 'Running'} size="sm" />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
            Deploy #{log.id}
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
            started {timeAgo(log.started_at)}
            {duration && ` — ${duration}`}
          </span>
        </div>
        <button
          style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 16, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }}
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <pre ref={preRef} className={styles.logOutput}>
        {log.output || (log.status === 'running' ? 'Running…' : '(no output)')}
      </pre>
    </div>
  )
}
