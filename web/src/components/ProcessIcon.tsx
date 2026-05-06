import dockerRaw   from '@/assets/process-icons/docker.svg?raw'
import nginxRaw    from '@/assets/process-icons/nginx.svg?raw'
import nodeRaw     from '@/assets/process-icons/nodedotjs.svg?raw'
import pgRaw       from '@/assets/process-icons/postgresql.svg?raw'
import redisRaw    from '@/assets/process-icons/redis.svg?raw'
import goRaw       from '@/assets/process-icons/go.svg?raw'
import pythonRaw   from '@/assets/process-icons/python.svg?raw'
import bashRaw     from '@/assets/process-icons/gnubash.svg?raw'
import linuxRaw    from '@/assets/process-icons/linux.svg?raw'
import sshdRaw     from '@/assets/process-icons/sshd.svg?raw'

// ── Brand color per process ───────────────────────────────────
export const PROC_BRAND: Record<string, { color: string; bg: string }> = {
  docker:  { color: '#2496ed', bg: 'rgba(36,150,237,0.15)' },
  nginx:   { color: '#009639', bg: 'rgba(0,150,57,0.15)'   },
  node:    { color: '#68a063', bg: 'rgba(104,160,99,0.15)' },
  postgres:{ color: '#4393c3', bg: 'rgba(67,147,195,0.15)' },
  redis:   { color: '#ff4438', bg: 'rgba(255,68,56,0.15)'  },
  go:      { color: '#00acd7', bg: 'rgba(0,172,215,0.15)'  },
  python3: { color: '#ffd343', bg: 'rgba(255,211,67,0.15)' },
  bash:    { color: '#4ede9a', bg: 'rgba(78,222,154,0.15)' },
  systemd: { color: '#c0c0c0', bg: 'rgba(192,192,192,0.12)'},
  sshd:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
}

// ── Raw SVG map ───────────────────────────────────────────────
const SVG_MAP: Record<string, string> = {
  docker:   dockerRaw,
  nginx:    nginxRaw,
  node:     nodeRaw,
  nodedotjs:nodeRaw,
  postgres: pgRaw,
  postgresql:pgRaw,
  redis:    redisRaw,
  go:       goRaw,
  python3:  pythonRaw,
  python:   pythonRaw,
  bash:     bashRaw,
  gnubash:  bashRaw,
  systemd:  linuxRaw,
  linux:    linuxRaw,
  sshd:     sshdRaw,
}

interface ProcessIconProps {
  /** Process name, e.g. "docker", "nginx" */
  name: string
  /** Icon size in pixels (default 20) */
  size?: number
  /** Override colour — defaults to brand colour */
  color?: string
}

/**
 * Renders the official brand SVG icon for a known process,
 * or a styled 2-letter monogram for unknown ones.
 */
export function ProcessIcon({ name, size = 20, color }: ProcessIconProps) {
  const key   = name.toLowerCase()
  const brand = PROC_BRAND[key]
  const fill  = color ?? brand?.color ?? '#94a3b8'
  const raw   = SVG_MAP[key]

  if (!raw) {
    const s = size
    return (
      <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:s, height:s, color:fill, flexShrink:0 }}>
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="2" width="14" height="12" rx="2"/>
          <polyline points="3.5,6 5.5,8 3.5,10"/>
          <line x1="8" y1="10" x2="12" y2="10"/>
        </svg>
      </span>
    )
  }

  // Inject width/height/fill="currentColor" onto the root <svg> element
  const svg = raw.replace(
    /<svg([^>]*)>/,
    (_match: string, attrs: string) =>
      `<svg${attrs} width="${size}" height="${size}" fill="currentColor" style="display:block">`,
  )

  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: fill, flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

/** Convenience: square avatar card wrapping the icon */
interface ProcessAvatarProps extends ProcessIconProps {
  /** Card size in pixels (default 34) */
  cardSize?: number
  radius?: number
}

export function ProcessAvatar({ name, cardSize = 34, size, radius = 8, color }: ProcessAvatarProps) {
  const key   = name.toLowerCase()
  const brand = PROC_BRAND[key]
  const fill  = color ?? brand?.color ?? '#94a3b8'
  const bg    = brand?.bg ?? 'rgba(255,255,255,0.07)'
  const iconSize = size ?? Math.round(cardSize * 0.54)

  return (
    <span style={{
      display:        'inline-flex',
      alignItems:     'center',
      justifyContent: 'center',
      width:          cardSize,
      height:         cardSize,
      borderRadius:   radius,
      background:     bg,
      flexShrink:     0,
    }}>
      <ProcessIcon name={name} size={iconSize} color={fill} />
    </span>
  )
}
