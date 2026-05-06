// Shared types and constants used by UptimePage and IncidentPage

export type MonitorKind = 'http' | 'tcp' | 'icmp'
export type IncidentSeverity = 'critical' | 'major' | 'minor'
export type IncidentCategory = 'network' | 'ssl' | 'application' | 'infrastructure' | 'database'
export type TimelineEventType = 'detection' | 'alert' | 'escalation' | 'investigation' | 'fix' | 'monitoring' | 'monitoring' | 'resolved'
export type CheckStatus = 'pass' | 'fail' | 'timeout' | 'degraded'

export interface TimelineEvent {
  offsetMin: number
  type: TimelineEventType
  actor: string
  message: string
}

export interface CheckEntry {
  offsetMin: number
  status: CheckStatus
  latencyMs: number | null
  httpCode?: number
  note?: string
}

export interface IncidentDetail {
  id: number
  ref: string
  monitorId: number
  monitorName: string
  monitorKind: MonitorKind
  target: string
  cause: string
  category: IncidentCategory
  severity: IncidentSeverity
  startedAt: Date
  resolvedAt: Date | null
  durationMin: number | null
  mttdSec: number
  mttrMin: number | null
  failedChecks: number
  errorCode: string
  errorDetail: string
  affectedRegions: string[]
  timeline: TimelineEvent[]
  checkLog: CheckEntry[]
  rootCause: string
  logExcerpt: string
  resolution: string
  prevention: string[]
  impactSummary: string
  latencyBaseline: number
  latencyPeak: number
  responderName: string
}

export const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
  critical: '#ef4444',
  major:    '#f97316',
  minor:    '#fbbf24',
}

export const CATEGORY_LABEL: Record<IncidentCategory, string> = {
  network:        'Network',
  ssl:            'SSL / TLS',
  application:    'Application',
  infrastructure: 'Infrastructure',
  database:       'Database',
}

export const MONITOR_ICON_SRC: Record<string, string> = {}
export const CAUSE_ICON_SRC: Record<IncidentCategory, string> = {
  network:        '/src/assets/incident-icons/connection-refused.svg',
  ssl:            '/src/assets/incident-icons/ssl-cert.svg',
  application:    '/src/assets/incident-icons/deploy-rollback.svg',
  infrastructure: '/src/assets/incident-icons/memory-oom.svg',
  database:       '/src/assets/incident-icons/disk-io.svg',
}
