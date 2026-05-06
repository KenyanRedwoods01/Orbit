import styles from './ui.module.css'

type AccentColor = 'blue' | 'green' | 'amber' | 'red' | 'purple'

interface StatCardProps {
  label: string
  value: string | number
  unit?: string
  subLabel?: string
  barValue?: number
  accent?: AccentColor
  icon?: string
  trend?: 'up' | 'down' | 'neutral'
  trendLabel?: string
}

const ACCENT_COLORS: Record<AccentColor, { line: string; bar: string }> = {
  blue:   { line: '#4a9eff', bar: '#4a9eff' },
  green:  { line: '#4caf50', bar: '#4caf50' },
  amber:  { line: '#ff9800', bar: '#ff9800' },
  red:    { line: '#f44336', bar: '#f44336' },
  purple: { line: '#9c27b0', bar: '#9c27b0' },
}

function barColor(value: number, accent?: AccentColor): string {
  if (accent) return ACCENT_COLORS[accent].bar
  if (value >= 90) return '#f44336'
  if (value >= 75) return '#ff9800'
  return '#4a9eff'
}

export function StatCard({
  label, value, unit, subLabel, barValue, accent, icon, trend, trendLabel
}: StatCardProps) {
  const accentCfg = accent ? ACCENT_COLORS[accent] : { line: '#4a9eff', bar: '#4a9eff' }

  return (
    <div className={styles.statCard}>
      <div className={styles.statAccentLine} style={{ background: accentCfg.line }} />
      <div className={styles.statTop}>
        <span className={styles.statLabel}>{label}</span>
        {icon && <span className={styles.statIcon}>{icon}</span>}
      </div>
      <div>
        <span className={styles.statValue}>{value}</span>
        {unit && <span className={styles.statUnit}>{unit}</span>}
      </div>
      {subLabel && <div className={styles.statSub}>{subLabel}</div>}
      {typeof barValue === 'number' && (
        <div className={styles.statBar}>
          <div
            className={styles.statBarFill}
            style={{
              width: `${Math.min(100, barValue)}%`,
              background: barColor(barValue, accent),
            }}
          />
        </div>
      )}
      {trend && trendLabel && (
        <div className={`${styles.statTrend} ${
          trend === 'up' ? styles.statTrendUp :
          trend === 'down' ? styles.statTrendDown :
          styles.statTrendNeutral
        }`}>
          <span>{trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}</span>
          <span>{trendLabel}</span>
        </div>
      )}
    </div>
  )
}
