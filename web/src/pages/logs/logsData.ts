export type Priority = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

export const PRIORITY_META: Record<number, { label: string; short: string; color: string; bg: string }> = {
  0: { label: 'Emergency', short: 'EMERG', color: '#ff4d4d', bg: 'rgba(255,77,77,0.12)'  },
  1: { label: 'Alert',     short: 'ALERT', color: '#ff6b35', bg: 'rgba(255,107,53,0.12)' },
  2: { label: 'Critical',  short: 'CRIT',  color: '#ff8c00', bg: 'rgba(255,140,0,0.12)'  },
  3: { label: 'Error',     short: 'ERROR', color: '#fc8181', bg: 'rgba(252,129,129,0.1)' },
  4: { label: 'Warning',   short: 'WARN',  color: '#f6ad55', bg: 'rgba(246,173,85,0.1)'  },
  5: { label: 'Notice',    short: 'NOTIC', color: '#63b3ed', bg: 'rgba(99,179,237,0.1)'  },
  6: { label: 'Info',      short: 'INFO',  color: '#68d391', bg: 'rgba(104,211,145,0.08)'},
  7: { label: 'Debug',     short: 'DEBUG', color: '#9ca3af', bg: 'rgba(156,163,175,0.08)'},
}

export interface LogEntry {
  id:        string
  ts:        number
  unit:      string
  pid:       number
  priority:  number
  message:   string
  host:      string
  comm:      string
  exe:       string
  uid:       number
  transport: string
  bootId:    string
  fields:    Record<string, string>
}

export interface LogSource {
  id:    string
  label: string
  kind:  'journald' | 'file' | 'kernel'
  color: string
}

export function getSourceCount(sourceId: string, logs: LogEntry[]): number {
  if (sourceId === 'all') return logs.length
  return logs.filter(l => {
    const u = l.unit.replace('.service', '')
    return u === sourceId || l.unit === sourceId
  }).length
}

export function filterBySource(sourceId: string, logs: LogEntry[]): LogEntry[] {
  if (sourceId === 'all') return logs
  return logs.filter(l => {
    const u = l.unit.replace('.service', '')
    return u === sourceId || l.unit === sourceId
  })
}

export function fmtTs(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function fmtTsShort(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
