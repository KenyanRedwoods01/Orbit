import { formatBytes, pctColor } from '@/lib/utils'
import type { MetricsSnapshot } from '@/lib/api'
import styles from './MetricsPage.module.css'

interface DiskTableProps {
  disks: MetricsSnapshot['disk']
  onRowClick?: (mount: string) => void
}

const ROW_H = 46

export function DiskTable({ disks, onRowClick }: DiskTableProps) {
  if (!disks?.length) return (
    <p style={{ fontSize: 12, color: 'var(--color-text-dim)', padding: '12px 0' }}>
      No disk partitions found.
    </p>
  )

  const MAX_VISIBLE = 4
  const needsScroll = disks.length > MAX_VISIBLE

  function Row({ d }: { d: MetricsSnapshot['disk'][number] }) {
    return (
      <div
        className={styles.diskRow}
        onClick={() => onRowClick?.(d.mount)}
        style={onRowClick ? { cursor: 'pointer' } : undefined}
        title={onRowClick ? `Open ${d.mount} in File Manager` : undefined}
      >
        <div className={styles.diskMeta}>
          <span className={styles.diskMount}>{d.mount}</span>
          <span className={styles.diskDevice}>{d.device}</span>
        </div>
        <div className={styles.diskBar}>
          <div
            className={styles.diskBarFill}
            style={{
              width: `${Math.min(100, d.used_pct)}%`,
              background: pctColor(d.used_pct),
            }}
          />
        </div>
        <div className={styles.diskStats}>
          <span style={{ color: pctColor(d.used_pct), fontFamily: 'monospace', fontSize: 12 }}>
            {d.used_pct.toFixed(1)}%
          </span>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
            {formatBytes(d.used_bytes)} / {formatBytes(d.total_bytes)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      style={needsScroll ? {
        maxHeight: ROW_H * MAX_VISIBLE + 'px',
        overflowY: 'auto',
        paddingRight: 2,
        scrollbarWidth: 'thin',
      } : undefined}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {disks.map(d => <Row key={d.mount} d={d} />)}
      </div>
      {needsScroll && (
        <div style={{ fontSize: 10, color: 'var(--color-text-dim)', textAlign: 'right', paddingTop: 4 }}>
          {disks.length} partitions — scroll to see all
        </div>
      )}
    </div>
  )
}
