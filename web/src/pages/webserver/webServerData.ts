// ── Types ─────────────────────────────────────────────────
export type SiteStatus    = 'active' | 'disabled' | 'error'
export type SSLType       = 'letsencrypt' | 'custom' | 'self-signed' | 'none'
export type PHPVersion    = '8.3' | '8.2' | '8.1' | '8.0' | '7.4' | 'none'
export type SSLCertStatus = 'valid' | 'expiring' | 'expired' | 'none'
export type LogType       = '2xx' | '3xx' | '4xx' | '5xx'

// ── Locations (URL routes) ────────────────────────────────
export interface SiteLocation {
  id:       string
  match:    string
  type:     'prefix' | 'exact' | 'regex'
  handler:  'static' | 'proxy' | 'php-fpm' | 'redirect'
  detail:   string
  root?:    string
}

// ── Rewrite Rules ─────────────────────────────────────────
export interface RewriteRule {
  id:       string
  from:     string
  to:       string
  flags:    string
  type:     'permanent' | 'temporary' | 'last' | 'break'
}

// ── Virtual Host ──────────────────────────────────────────
export interface VirtualHost {
  id:             string
  domain:         string
  aliases:        string[]
  docRoot:        string
  status:         SiteStatus
  ssl:            SSLType
  sslExpiry:      string | null
  sslDaysLeft:    number
  phpVersion:     PHPVersion
  traffic24h:     number
  trafficUnit:    string
  requests24h:    number
  bandwidth:      string
  php:            boolean
  proxy?:         string
  gzip:           boolean
  brotli:         boolean
  hsts:           boolean
  httpRedirect:   boolean
  accessLog:      string
  errorLog:       string
  created:        string
  locations:      SiteLocation[]
  rewrites:       RewriteRule[]
  errorCodes:     Record<string, string>
  rateLimit:      boolean
  rateLimitRate:  string
  secHeaders:     boolean
  basicAuth:      boolean
  ipWhitelist:    string[]
  ipBlacklist:    string[]
  workerConnType: string
  configFile:     string
  rawConfig:      string
}

// ── SSL Certificates ──────────────────────────────────────
export interface SSLCert {
  id:        string
  domain:    string
  issuer:    string
  type:      SSLType
  expiry:    string
  daysLeft:  number
  status:    SSLCertStatus
  keyType:   string
  autoRenew: boolean
  ocsp:      boolean
}

// ── Access Log Entries ────────────────────────────────────
export interface AccessLogEntry {
  id:         string
  ts:         string
  ip:         string
  method:     string
  path:       string
  status:     number
  bytes:      number
  referer:    string
  ua:         string
}

// ── Nginx Status ──────────────────────────────────────────
export interface NginxStatus {
  running:    boolean
  version:    string
  pid:        number
  configFile: string
  configOK:   boolean
  configTest: string
  workers:    number
  uptime:     string
  binary:     string
}

// ── Nginx Performance ─────────────────────────────────────
export interface NginxPerformance {
  activeConns:  number
  reading:      number
  writing:      number
  waiting:      number
  accepts:      number
  handled:      number
  requests:     number
}

// ── Nginx Global Config ───────────────────────────────────
export interface NginxGlobalConfig {
  workerProcesses:   string
  workerConnections: string
  keepaliveTimeout:  string
  clientMaxBodySize: string
  serverTokensOff:   boolean
  tcpNopush:         boolean
  gzip:              boolean
  raw:               string
}
