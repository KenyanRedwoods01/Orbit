import { useQuery } from '@tanstack/react-query'
import { fetchLogFiles } from '@/lib/api'
import type { LogFile } from '@/lib/api'
import styles from './LogsPage.module.css'

interface LogSourcePickerProps {
  selected: string | null
  onSelect: (source: string) => void
}

const QUICK_SOURCES: LogFile[] = [
  { name: 'syslog',   path: '/var/log/syslog',   kind: 'file',     size_bytes: 0 },
  { name: 'auth',     path: '/var/log/auth.log',  kind: 'file',     size_bytes: 0 },
  { name: 'nginx',    path: '/var/log/nginx/error.log', kind: 'file', size_bytes: 0 },
  { name: 'kernel',   path: 'kernel',             kind: 'journald', size_bytes: 0 },
  { name: 'systemd',  path: 'systemd',            kind: 'journald', size_bytes: 0 },
]

export function LogSourcePicker({ selected, onSelect }: LogSourcePickerProps) {
  const { data } = useQuery({
    queryKey: ['log-files'],
    queryFn: fetchLogFiles,
    retry: false,
  })

  const sources = data?.length ? data : QUICK_SOURCES

  return (
    <div className={styles.sourcePicker}>
      <div className={styles.sourceHeader}>Log Sources</div>
      <div className={styles.sourceList}>
        {sources.map(s => (
          <button
            key={s.path}
            className={`${styles.sourceItem} ${selected === s.path ? styles.sourceItemActive : ''}`}
            onClick={() => onSelect(s.path)}
          >
            <span className={styles.sourceKindDot} style={{ background: s.kind === 'journald' ? 'var(--color-purple)' : 'var(--color-accent)' }} />
            <span className={styles.sourceName}>{s.name}</span>
            <span className={styles.sourceKind}>{s.kind}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
