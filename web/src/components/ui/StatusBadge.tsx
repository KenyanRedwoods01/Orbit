import styles from './ui.module.css'

type Status =
  | 'active' | 'inactive' | 'failed' | 'unknown'
  | 'up' | 'down'
  | 'running' | 'exited' | 'paused' | 'restarting' | 'stopped'
  | 'ok' | 'error' | 'connected' | 'disconnected'
  | string

interface StatusConfig {
  colorClass: string
  pulse: boolean
  label: string
}

const CONFIG: Record<string, StatusConfig> = {
  active:       { colorClass: styles.badgeSuccess, pulse: true,  label: 'active' },
  running:      { colorClass: styles.badgeSuccess, pulse: true,  label: 'running' },
  up:           { colorClass: styles.badgeSuccess, pulse: true,  label: 'up' },
  ok:           { colorClass: styles.badgeSuccess, pulse: false, label: 'ok' },
  connected:    { colorClass: styles.badgeSuccess, pulse: true,  label: 'connected' },
  inactive:     { colorClass: styles.badgeMuted,   pulse: false, label: 'inactive' },
  exited:       { colorClass: styles.badgeMuted,   pulse: false, label: 'exited' },
  stopped:      { colorClass: styles.badgeMuted,   pulse: false, label: 'stopped' },
  unknown:      { colorClass: styles.badgeMuted,   pulse: false, label: 'unknown' },
  failed:       { colorClass: styles.badgeDanger,  pulse: false, label: 'failed' },
  down:         { colorClass: styles.badgeDanger,  pulse: false, label: 'down' },
  error:        { colorClass: styles.badgeDanger,  pulse: false, label: 'error' },
  disconnected: { colorClass: styles.badgeDanger,  pulse: false, label: 'disconnected' },
  paused:       { colorClass: styles.badgeWarning, pulse: false, label: 'paused' },
  restarting:   { colorClass: styles.badgeWarning, pulse: true,  label: 'restarting' },
}

interface StatusBadgeProps {
  status: Status
  label?: string
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, label, size = 'md' }: StatusBadgeProps) {
  const cfg = CONFIG[status] ?? { colorClass: styles.badgeMuted, pulse: false, label: status }
  const displayLabel = label ?? cfg.label

  return (
    <span
      className={`${styles.badge} ${cfg.colorClass} ${size === 'sm' ? styles.badgeSm : ''}`}
    >
      <span
        className={`${styles.badgeDot} ${cfg.pulse ? styles.badgeDotPulse : ''}`}
      />
      {displayLabel}
    </span>
  )
}
