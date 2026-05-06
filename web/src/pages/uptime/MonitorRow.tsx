import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteUptimeMonitor } from '@/lib/api'
import type { UptimeMonitor } from '@/lib/api'
import { StatusBadge, ConfirmDialog } from '@/components/ui'
import { useState } from 'react'
import styles from './UptimePage.module.css'

interface MonitorRowProps {
  monitor: UptimeMonitor
}

const HTTP_ICON = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="5.5"/><line x1="1.5" y1="7" x2="12.5" y2="7"/><path d="M7 1.5a10 10 0 0 1 2.5 5.5A10 10 0 0 1 7 12.5A10 10 0 0 1 4.5 7A10 10 0 0 1 7 1.5z"/></svg>
const TCP_ICON = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="12" height="8" rx="1.5"/><line x1="4" y1="6" x2="10" y2="6"/><line x1="4" y1="8.5" x2="7" y2="8.5"/></svg>
const ICMP_ICON = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 7h2.5l2-4 3 8 2-4H13"/></svg>
const KIND_ICON_MAP: Record<string, () => JSX.Element> = { http: HTTP_ICON, tcp: TCP_ICON, icmp: ICMP_ICON }

export function MonitorRow({ monitor }: MonitorRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const qc = useQueryClient()

  const deleteMut = useMutation({
    mutationFn: () => deleteUptimeMonitor(monitor.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['uptime-monitors'] })
      setConfirmDelete(false)
    },
  })

  const latencyColor = monitor.latency_ms > 1000 ? 'var(--color-danger)' : monitor.latency_ms > 500 ? 'var(--color-warning)' : 'var(--color-success)'

  return (
    <>
      <tr className={styles.monitorRow}>
        <td style={{ padding: '11px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className={`${styles.bigDot} ${monitor.status === 'up' ? styles.dotUp : monitor.status === 'down' ? styles.dotDown : styles.dotUnknown}`} />
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{monitor.name}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'monospace', marginTop: 1 }}>{monitor.target}</div>
            </div>
          </div>
        </td>
        <td style={{ padding: '11px 12px' }}>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
            {(() => { const Ico = KIND_ICON_MAP[monitor.kind]; return Ico ? <><Ico />{' '}</> : null })()}{monitor.kind.toUpperCase()}
          </span>
        </td>
        <td style={{ padding: '11px 12px' }}>
          <StatusBadge status={monitor.status} />
        </td>
        <td style={{ padding: '11px 12px', fontFamily: 'monospace', fontSize: 12 }}>
          {monitor.latency_ms > 0
            ? <span style={{ color: latencyColor }}>{monitor.latency_ms.toFixed(0)} ms</span>
            : <span style={{ color: 'var(--color-text-dim)' }}>—</span>
          }
        </td>
        <td style={{ padding: '11px 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>
          Every {monitor.interval_s}s
        </td>
        <td style={{ padding: '11px 12px' }}>
          <button
            className={styles.deleteBtn}
            onClick={() => setConfirmDelete(true)}
            title="Delete monitor"
          >
            🗑
          </button>
        </td>
      </tr>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteMut.mutate()}
        title="Delete Monitor"
        message={`Remove the monitor for "${monitor.name}"? Historical uptime data will also be deleted.`}
        confirmLabel="Delete"
        isLoading={deleteMut.isPending}
      />
    </>
  )
}
