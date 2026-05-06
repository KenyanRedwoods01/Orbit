import styles from './MetricsPage.module.css'

interface GaugeCardProps {
  label: string
  displayValue: string
  value: number        // 0-100
  subText?: string
  icon: React.ReactNode
}

// ── Arc geometry ──────────────────────────────────────────────
const R   = 58     // track radius
const CX  = 80     // centre x
const CY  = 84     // centre y (low so the top arc is centred in card)
const ARC = Math.PI * R  // half-circle arc length ≈ 182

/** Position on the gauge arc.  t=0 → left, t=0.5 → top, t=1 → right */
function pt(t: number, r: number) {
  const a = Math.PI * (1 + t)           // 180° → 360°
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) }
}

const trackPath = `M ${pt(0, R).x} ${pt(0, R).y} A ${R} ${R} 0 0 0 ${pt(1, R).x} ${pt(1, R).y}`

function gaugeColor(v: number): string {
  if (v >= 90) return '#ef4444'
  if (v >= 75) return '#f97316'
  if (v >= 50) return '#4a9eff'
  return '#22c55e'
}

const TICKS = [0, 0.25, 0.5, 0.75, 1]

export function GaugeCard({ label, displayValue, value, subText, icon }: GaugeCardProps) {
  const v      = Math.min(100, Math.max(0, value))
  const t      = v / 100
  const color  = gaugeColor(v)
  const offset = ARC * (1 - t)

  // Needle: draw pointing RIGHT then rotate to correct angle
  const needleAngle = 180 + t * 180   // 180° (left) → 360° (right)
  const needleLen   = R * 0.68
  const id = label.replace(/\s+/g, '_')

  return (
    <div className={styles.gaugeCard}>
      <div className={styles.gaugeIconRow}>{icon}</div>

      <svg viewBox="0 0 160 100" className={styles.gaugeSvg}>
        <defs>
          {/* Glow filter */}
          <filter id={`gl_${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {/* Coloured segments in background arc */}
          <linearGradient id={`seg_${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#22c55e" stopOpacity="0.18"/>
            <stop offset="50%"  stopColor="#4a9eff" stopOpacity="0.18"/>
            <stop offset="75%"  stopColor="#f97316" stopOpacity="0.18"/>
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.18"/>
          </linearGradient>
        </defs>

        {/* Segment hint on track */}
        <path d={trackPath} fill="none"
          stroke={`url(#seg_${id})`} strokeWidth="14" strokeLinecap="round"/>

        {/* Dark background track */}
        <path d={trackPath} fill="none"
          stroke="rgba(255,255,255,0.05)" strokeWidth="11" strokeLinecap="round"/>

        {/* Animated fill arc */}
        <path d={trackPath} fill="none"
          stroke={color} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={`${ARC} ${ARC + 2}`}
          strokeDashoffset={offset}
          filter={`url(#gl_${id})`}
          style={{
            transition: 'stroke-dashoffset 0.7s cubic-bezier(.4,0,.2,1), stroke 0.4s ease',
          }}
        />

        {/* Tick marks */}
        {TICKS.map(tk => {
          const outer = pt(tk, R + 7)
          const inner = pt(tk, R + 2)
          return (
            <line key={tk}
              x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y}
              stroke="rgba(255,255,255,0.18)" strokeWidth={tk === 0 || tk === 1 || tk === 0.5 ? 2 : 1.5}
            />
          )
        })}

        {/* Needle (rotates around centre) */}
        <g style={{
          transformOrigin: `${CX}px ${CY}px`,
          transform: `rotate(${needleAngle}deg)`,
          transition: 'transform 0.7s cubic-bezier(.4,0,.2,1)',
        }}>
          {/* Tail */}
          <line x1={CX} y1={CY} x2={CX - 10} y2={CY}
            stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
          {/* Needle body */}
          <line x1={CX} y1={CY} x2={CX + needleLen} y2={CY}
            stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
        </g>

        {/* Centre hub */}
        <circle cx={CX} cy={CY} r="5" fill="var(--color-surface-raised)"
          stroke={color} strokeWidth="2"/>
        <circle cx={CX} cy={CY} r="2" fill={color}/>

        {/* Value text */}
        <text x={CX} y={CY - 15}
          textAnchor="middle" dominantBaseline="middle"
          fill="white" fontSize="20" fontWeight="700"
          fontFamily="'JetBrains Mono', 'Fira Code', monospace">
          {displayValue}
        </text>

        {subText && (
          <text x={CX} y={CY + 4}
            textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8">
            {subText}
          </text>
        )}

        {/* Min / max labels */}
        <text x={pt(0, R + 16).x} y={pt(0, R + 16).y + 3}
          textAnchor="end" fill="rgba(255,255,255,0.2)" fontSize="7.5">0</text>
        <text x={pt(1, R + 16).x} y={pt(1, R + 16).y + 3}
          textAnchor="start" fill="rgba(255,255,255,0.2)" fontSize="7.5">100</text>
      </svg>

      <div className={styles.gaugeLabel}>{label}</div>
    </div>
  )
}
