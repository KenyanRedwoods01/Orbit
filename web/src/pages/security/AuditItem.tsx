import { useState } from 'react'
import type { SecurityFinding } from '@/lib/api'
import styles from './SecurityPage.module.css'

const SevDot = ({ color }: { color: string }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill={color}><circle cx="5" cy="5" r="5"/></svg>
)

const SEV_CONFIG = {
  critical: { color: '#ff1744', bg: 'rgba(255,23,68,.1)', border: 'rgba(255,23,68,.25)', icon: <SevDot color="#ff1744" /> },
  high:     { color: '#f44336', bg: 'rgba(244,67,54,.1)', border: 'rgba(244,67,54,.25)', icon: <SevDot color="#f44336" /> },
  medium:   { color: '#ff9800', bg: 'rgba(255,152,0,.1)', border: 'rgba(255,152,0,.25)', icon: <SevDot color="#ff9800" /> },
  low:      { color: '#4caf50', bg: 'rgba(76,175,80,.1)', border: 'rgba(76,175,80,.2)',  icon: <SevDot color="#4caf50" /> },
  info:     { color: '#4a9eff', bg: 'rgba(74,158,255,.1)', border: 'rgba(74,158,255,.2)', icon: <SevDot color="#4a9eff" /> },
}

interface AuditItemProps {
  finding: SecurityFinding
}

export function AuditItem({ finding }: AuditItemProps) {
  const [expanded, setExpanded] = useState(false)
  const cfg = SEV_CONFIG[finding.severity] ?? SEV_CONFIG.info

  return (
    <div
      className={styles.findingCard}
      style={{ borderColor: cfg.border, background: cfg.bg }}
    >
      <div
        className={styles.findingHeader}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14 }}>{cfg.icon}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>
              {finding.title}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 1 }}>
              {finding.category}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 20,
            background: cfg.bg,
            color: cfg.color,
            border: `1px solid ${cfg.border}`,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {finding.severity}
          </span>
          <span style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className={styles.findingBody}>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            {finding.description}
          </p>
          {finding.remediation && (
            <div className={styles.remediation}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Remediation
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, fontFamily: 'monospace' }}>
                {finding.remediation}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
