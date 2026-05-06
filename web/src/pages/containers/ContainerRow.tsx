import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { startContainer, stopContainer } from '@/lib/api'
import type { Container } from '@/lib/api'
import { StatusBadge, Spinner } from '@/components/ui'
import { formatBytes } from '@/lib/utils'
import { ContainerLogs } from './ContainerLogs'
import styles from './ContainersPage.module.css'

interface ContainerRowProps {
  container: Container
}

export function ContainerRow({ container }: ContainerRowProps) {
  const [logsOpen, setLogsOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const qc = useQueryClient()

  const mutOpts = (action: string) => ({
    onMutate: () => setPendingAction(action),
    onSettled: () => {
      setPendingAction(null)
      qc.invalidateQueries({ queryKey: ['containers'] })
    },
  })

  const startM = useMutation({ mutationFn: () => startContainer(container.id), ...mutOpts('start') })
  const stopM  = useMutation({ mutationFn: () => stopContainer(container.id),  ...mutOpts('stop') })

  const cpuPct = container.cpu_pct
  const memPct = container.mem_limit > 0 ? (container.mem_bytes / container.mem_limit) * 100 : 0

  return (
    <>
      <tr className={styles.containerRow}>
        <td style={{ padding: '10px 12px' }}>
          <div style={{ fontWeight: 500, fontSize: 13, fontFamily: 'monospace' }}>
            {container.name.replace(/^\//, '')}
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 1, fontFamily: 'monospace' }}>
            {container.id.slice(0, 12)}
          </div>
        </td>
        <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
          {container.image}
        </td>
        <td style={{ padding: '10px 12px' }}>
          <StatusBadge status={container.state} />
        </td>
        <td style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: cpuPct > 50 ? 'var(--color-warning)' : 'var(--color-text)', width: 40 }}>
              {cpuPct.toFixed(1)}%
            </span>
            <div className={styles.usageBar}>
              <div className={styles.usageBarFill} style={{ width: `${Math.min(100, cpuPct)}%`, background: cpuPct > 80 ? 'var(--color-danger)' : 'var(--color-accent)' }} />
            </div>
          </div>
        </td>
        <td style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text)', width: 64 }}>
              {formatBytes(container.mem_bytes)}
            </span>
            {container.mem_limit > 0 && (
              <div className={styles.usageBar}>
                <div className={styles.usageBarFill} style={{ width: `${Math.min(100, memPct)}%`, background: 'var(--color-success)' }} />
              </div>
            )}
          </div>
        </td>
        <td style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {pendingAction ? <Spinner size="sm" /> : (
              <>
                <button
                  className={styles.actionBtn}
                  onClick={() => startM.mutate()}
                  disabled={container.state === 'running'}
                  title="Start"
                >▶</button>
                <button
                  className={`${styles.actionBtn} ${styles.actionBtnStop}`}
                  onClick={() => stopM.mutate()}
                  disabled={container.state !== 'running'}
                  title="Stop"
                >⏹</button>
                <button
                  className={`${styles.actionBtn} ${logsOpen ? styles.actionBtnActive : ''}`}
                  onClick={() => setLogsOpen(v => !v)}
                  title="Logs"
                >≡</button>
              </>
            )}
          </div>
        </td>
      </tr>
      {logsOpen && (
        <tr>
          <td colSpan={6} style={{ padding: 0 }}>
            <ContainerLogs containerId={container.id} containerName={container.name} />
          </td>
        </tr>
      )}
    </>
  )
}
