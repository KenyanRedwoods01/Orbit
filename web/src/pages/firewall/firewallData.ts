// Type definitions only — all data is loaded from the backend API.
// No demo/mock data; see FirewallPage.tsx and web/src/lib/api.ts.

export type Direction     = 'in' | 'out' | 'fwd'
export type Protocol      = 'tcp' | 'udp' | 'both' | 'icmp'
export type RuleAction    = 'allow' | 'deny' | 'reject' | 'limit'
export type LogLevel      = 'off' | 'on' | 'all'
export type FirewallStatus = 'active' | 'inactive'
export type LogType       = 'BLOCK' | 'ALLOW' | 'LIMIT'

// ── Firewall Rules ────────────────────────────────────────
export interface FWRule {
  id:           string
  order:        number
  direction:    Direction
  protocol:     Protocol
  port:         string
  portLabel:    string
  sourceIp:     string
  destIp:       string
  iface:        string
  action:       RuleAction
  logging:      LogLevel
  comment:      string
  created:      string
  hits:         number
  serviceColor?: string
}

// ── App Profiles ──────────────────────────────────────────
export interface AppProfile {
  id:      string
  name:    string
  ports:   string
  proto:   string
  service: string
  enabled: boolean
  color:   string
}

// ── NAT / Port Forwards ───────────────────────────────────
export interface NATForward {
  id:         string
  publicPort: number
  proto:      Protocol
  destIp:     string
  destPort:   number
  comment:    string
  enabled:    boolean
}

// ── Fail2ban ──────────────────────────────────────────────
export interface Fail2banJail {
  name:        string
  status:      'active' | 'inactive'
  banned:      number
  failed:      number
  totalFailed: number
  filter:      string
}

export interface BannedIP {
  ip:       string
  jail:     string
  since:    string
  attempts: number
  country:  string
}

// ── Firewall Log Entry ─────────────────────────────────────
export interface FWLogEntry {
  id:      string
  ts:      string
  type:    LogType
  iface:   string
  srcIp:   string
  dstIp:   string
  srcPort: number
  dstPort: number
  proto:   string
  rule?:   string
}
