import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatBytes } from '@/lib/utils'
import type { MetricsSnapshot } from '@/lib/api'
import { ProcessAvatar } from '@/components/ProcessIcon'
import styles from './MetricsPage.module.css'

type ProcessStat = MetricsSnapshot['processes'][number]
type SortKey = 'cpu_pct' | 'mem_pct' | 'mem_rss' | 'pid' | 'name'

interface ProcessTableProps {
  processes: ProcessStat[]
}

function cpuColor(pct: number): string {
  if (pct > 50) return 'var(--color-danger)'
  if (pct > 20) return 'var(--color-warning)'
  return 'var(--color-text)'
}

function IconArrow() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><line x1="4" y1="10" x2="16" y2="10"/><polyline points="11,5 16,10 11,15"/></svg>
}

export function ProcessTable({ processes }: ProcessTableProps) {
  const navigate = useNavigate()
  const [sortKey, setSortKey] = useState<SortKey>('cpu_pct')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const toggle = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }

  const sorted = [...processes].sort((a, b) => {
    const va = a[sortKey], vb = b[sortKey]
    if (typeof va === 'string' && typeof vb === 'string')
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
  })

  const SortTh = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      className={styles.procTh}
      onClick={() => toggle(k)}
      style={{ cursor: 'pointer', userSelect: 'none' }}
    >
      {label}
      {sortKey === k && <span style={{ marginLeft: 4, opacity: 0.6 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className={styles.procTable}>
        <thead>
          <tr>
            <SortTh label="PID"     k="pid"     />
            <SortTh label="Process" k="name"    />
            <SortTh label="CPU %"   k="cpu_pct" />
            <SortTh label="Mem %"   k="mem_pct" />
            <SortTh label="RSS"     k="mem_rss" />
            <th className={styles.procTh}>Status</th>
            <th className={styles.procTh} style={{ width: 32 }}></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(p => {
            return (
              <tr
                key={p.pid}
                className={styles.procRow}
                onClick={() => navigate(`/processes/${p.pid}`)}
                style={{ cursor: 'pointer' }}
                title={`Open ${p.name} details`}
              >
                <td className={styles.procTd} style={{ color: 'var(--color-text-muted)', fontFamily: 'monospace', fontSize: 11 }}>
                  {p.pid}
                </td>
                <td className={styles.procTd}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <ProcessAvatar name={p.name} cardSize={22} radius={4} />
                    <span style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </span>
                  </div>
                </td>
                <td className={styles.procTd} style={{ color: cpuColor(p.cpu_pct), fontFamily: 'monospace' }}>
                  {p.cpu_pct.toFixed(1)}%
                </td>
                <td className={styles.procTd} style={{ fontFamily: 'monospace', color: p.mem_pct > 10 ? 'var(--color-warning)' : 'var(--color-text)' }}>
                  {p.mem_pct.toFixed(1)}%
                </td>
                <td className={styles.procTd} style={{ fontFamily: 'monospace', color: 'var(--color-text-muted)', fontSize: 12 }}>
                  {formatBytes(p.mem_rss)}
                </td>
                <td className={styles.procTd}>
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 10,
                    background: p.status === 'S' ? 'var(--color-success-dim)' : 'var(--color-surface-raised)',
                    color: p.status === 'S' ? 'var(--color-success)' : 'var(--color-text-muted)',
                    border: '1px solid transparent',
                  }}>
                    {p.status || '?'}
                  </span>
                </td>
                <td className={styles.procTd} style={{ color: 'var(--color-text-dim)', paddingLeft: 4 }}>
                  <IconArrow />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* View all link */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--color-border)', textAlign: 'right' }}>
        <button
          onClick={() => navigate('/processes')}
          style={{ fontSize: 11, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          View all processes <IconArrow />
        </button>
      </div>
    </div>
  )
}
