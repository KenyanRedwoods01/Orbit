// Typed wrappers around the Orbit REST API.

const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...init,
  })
  if (!res.ok) {
    const text = (await res.text()).trim()
    if (res.status === 501) throw new Error('This feature is not yet implemented on the server.')
    if (res.status === 503) throw new Error('Service unavailable — please try again shortly.')
    if (res.status === 401) throw new Error('Invalid username or password.')
    if (res.status === 403) throw new Error('Access denied.')
    throw new Error(text || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

// ---- Auth ----

export interface LoginResponse {
  username: string
  scope: string
}

export function login(username: string, password: string) {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function logout() {
  return request<void>('/auth/logout', { method: 'POST' })
}

// ---- Metrics ----

export interface MetricsSnapshot {
  time: string
  cpu: { total_pct: number; per_core_pct: number[] }
  memory: {
    total_bytes: number
    used_bytes: number
    used_pct: number
    swap_total_bytes: number
    swap_used_bytes: number
  }
  disk: Array<{ device: string; mount: string; total_bytes: number; used_bytes: number; used_pct: number; read_bps: number; write_bps: number }>
  network: Array<{ iface: string; bytes_sent: number; bytes_recv: number; sent_bps: number; recv_bps: number }>
  processes: Array<{ pid: number; name: string; cpu_pct: number; mem_pct: number; mem_rss: number; status: string }>
  load?: { load1: number; load5: number; load15: number }
  host?: { uptime_seconds: number; uptime_human: string; boot_time: number; procs: number }
}

export interface MetricsSummary {
  period: string
  data_points: number
  avg_cpu_pct: number
  peak_cpu_pct: number
  avg_mem_pct: number
  peak_mem_pct: number
  avg_disk_pct: number
  peak_disk_pct: number
  avg_net_sent_bps: number
  avg_net_recv_bps: number
  peak_net_sent_bps: number
  peak_net_recv_bps: number
  load_avg_1: number
  load_avg_5: number
  load_avg_15: number
  uptime_human: string
  uptime_seconds: number
  host_procs: number
}

export interface ServerInfo {
  hostname: string
  ip: string
  private_ip: string
  os: string
  kernel: string
  arch: string
  cpu_model: string
  cpu_cores: number
  total_ram: string
  uptime: string
  load: string
  region: string
  provider: string
  status: 'online' | 'degraded' | 'offline'
}

export const fetchMetrics = () => request<MetricsSnapshot>('/metrics/snapshot')
export const fetchMetricsSummary = () => request<MetricsSummary>('/metrics/summary')
export const fetchServerInfo = () => request<ServerInfo>('/server/info')
export const fetchMetricsHistory = (from: number, to: number, limit = 360) =>
  request<MetricsSnapshot[]>(`/metrics/history?from=${from}&to=${to}&limit=${limit}`)

// ---- Services ----

export interface Service {
  name: string
  description: string
  status: 'active' | 'inactive' | 'failed' | 'unknown'
  cpu_pct: number
  mem_bytes: number
}

export const fetchServices = () => request<Service[]>('/services')
export const startService = (name: string) => request<void>(`/services/${name}/start`, { method: 'POST' })
export const stopService = (name: string) => request<void>(`/services/${name}/stop`, { method: 'POST' })
export const restartService = (name: string) => request<void>(`/services/${name}/restart`, { method: 'POST' })

// ---- Logs ----

export interface LogFile {
  name: string
  path: string
  kind: 'file' | 'journald'
  size_bytes: number
}

export const fetchLogFiles = () => request<LogFile[]>('/logs')

export interface ApiLogSource {
  id: string
  label: string
  kind: 'journald' | 'file' | 'kernel'
  color: string
}

export interface ApiLogEntry {
  id: string
  ts: number
  unit: string
  pid: number
  priority: number
  message: string
  host: string
  comm: string
  exe: string
  uid: number
  transport: string
  bootId: string
  fields: Record<string, string>
}

export interface ApiLogStats {
  total: number
  by_priority: Record<string, number>
  by_unit: Record<string, number>
}

export const fetchLogSources = () => request<ApiLogSource[]>('/logs/sources')

export const fetchLogEntries = (params: {
  source?: string
  range?: string
  search?: string
  priorities?: string
  unit?: string
  limit?: number
}) => {
  const qs = new URLSearchParams()
  if (params.source && params.source !== 'all') qs.set('source', params.source)
  if (params.range) qs.set('range', params.range)
  if (params.search) qs.set('search', params.search)
  if (params.priorities) qs.set('priorities', params.priorities)
  if (params.unit && params.unit !== 'all') qs.set('unit', params.unit)
  if (params.limit) qs.set('limit', String(params.limit))
  return request<ApiLogEntry[]>(`/logs/entries?${qs}`)
}

export const fetchLogStats = (params: { source?: string; range?: string }) => {
  const qs = new URLSearchParams()
  if (params.source && params.source !== 'all') qs.set('source', params.source)
  if (params.range) qs.set('range', params.range)
  return request<ApiLogStats>(`/logs/stats?${qs}`)
}

// ---- Firewall ----

export interface FWRuleApi {
  id: string
  order: number
  direction: 'in' | 'out' | 'fwd'
  protocol: 'tcp' | 'udp' | 'both' | 'icmp'
  port: string
  portLabel: string
  sourceIp: string
  destIp: string
  iface: string
  action: 'allow' | 'deny' | 'reject' | 'limit'
  logging: 'off' | 'on' | 'all'
  comment: string
  created: string
  hits: number
  serviceColor?: string
}

export interface FWRuleInput {
  direction: string
  protocol: string
  port: string
  portLabel?: string
  sourceIp?: string
  destIp?: string
  iface?: string
  action: string
  logging?: string
  comment?: string
  serviceColor?: string
}

export interface FWStatusApi {
  backend: string
  status: 'active' | 'inactive'
  ipv6: boolean
  defaultIn: string
  defaultOut: string
  defaultFwd: string
  activeRules: number
  packetsAllowed: number
  packetsBlocked: number
  lastLog: string
}

export interface FWStatsApi {
  totalRules: number
  allowRules: number
  denyRules: number
  limitRules: number
  natRules: number
  bannedIPs: number
  packetsAllowed: number
  packetsBlocked: number
  packetsLimited: number
  topBlockedIPs: { ip: string; hits: number; jail?: string }[]
  logsByType: Record<string, number>
  hitsTimeline: { ts: string; allowed: number; blocked: number }[]
}

export interface FWNATRuleApi {
  id: string
  publicPort: number
  proto: string
  destIp: string
  destPort: number
  comment: string
  enabled: boolean
}

export interface FWAppProfileApi {
  id: string
  name: string
  ports: string
  proto: string
  service: string
  enabled: boolean
  color: string
}

export interface FWJailApi {
  name: string
  status: string
  banned: number
  failed: number
  totalFailed: number
  filter: string
}

export interface FWBannedIPApi {
  ip: string
  jail: string
  since: string
  attempts: number
  country: string
}

export interface FWLogEntryApi {
  id: string
  ts: string
  type: 'BLOCK' | 'ALLOW' | 'LIMIT'
  iface: string
  srcIp: string
  dstIp: string
  srcPort: number
  dstPort: number
  proto: string
  rule?: string
}

// Status & Control
export const fetchFirewallStatus = () => request<FWStatusApi>('/firewall/status')
export const enableFirewall = () => request<void>('/firewall/enable', { method: 'POST' })
export const disableFirewall = () => request<void>('/firewall/disable', { method: 'POST' })
export const resetFirewall = () => request<void>('/firewall/reset', { method: 'POST' })
export const setFirewallDefault = (policy: string, direction: string) =>
  request<void>('/firewall/default', { method: 'POST', body: JSON.stringify({ policy, direction }) })

// Rules CRUD
export const fetchFirewallRules = () => request<FWRuleApi[]>('/firewall/rules')
export const fetchFirewallRule = (id: string) => request<FWRuleApi>(`/firewall/rules/${id}`)
export const addFirewallRule = (rule: FWRuleInput) =>
  request<FWRuleApi>('/firewall/rules', { method: 'POST', body: JSON.stringify(rule) })
export const updateFirewallRule = (id: string, rule: FWRuleInput) =>
  request<FWRuleApi>(`/firewall/rules/${id}`, { method: 'PUT', body: JSON.stringify(rule) })
export const deleteFirewallRule = (id: string) =>
  request<void>(`/firewall/rules/${id}`, { method: 'DELETE' })
export const reorderFirewallRules = (ids: string[]) =>
  request<void>('/firewall/rules/reorder', { method: 'POST', body: JSON.stringify({ ids }) })
export const exportFirewallRules = () => `${BASE}/firewall/rules/export`
export const importFirewallRules = (rules: FWRuleInput[]) =>
  request<FWRuleApi[]>('/firewall/rules/import', { method: 'POST', body: JSON.stringify({ rules }) })

// App Profiles
export const fetchFirewallProfiles = () => request<FWAppProfileApi[]>('/firewall/profiles')
export const createFirewallProfile = (data: Omit<FWAppProfileApi, 'id'>) =>
  request<FWAppProfileApi>('/firewall/profiles', { method: 'POST', body: JSON.stringify(data) })
export const updateFirewallProfile = (id: string, data: Omit<FWAppProfileApi, 'id'>) =>
  request<FWAppProfileApi>(`/firewall/profiles/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteFirewallProfile = (id: string) =>
  request<void>(`/firewall/profiles/${id}`, { method: 'DELETE' })
export const toggleFirewallProfile = (id: string) =>
  request<{ id: string; enabled: boolean }>(`/firewall/profiles/${id}/toggle`, { method: 'POST' })

// NAT / Port Forwarding
export const fetchFirewallNAT = () => request<FWNATRuleApi[]>('/firewall/nat')
export const createFirewallNAT = (data: Omit<FWNATRuleApi, 'id'>) =>
  request<FWNATRuleApi>('/firewall/nat', { method: 'POST', body: JSON.stringify(data) })
export const updateFirewallNAT = (id: string, data: Omit<FWNATRuleApi, 'id'>) =>
  request<FWNATRuleApi>(`/firewall/nat/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteFirewallNAT = (id: string) =>
  request<void>(`/firewall/nat/${id}`, { method: 'DELETE' })
export const toggleFirewallNAT = (id: string) =>
  request<{ id: string; enabled: boolean }>(`/firewall/nat/${id}/toggle`, { method: 'POST' })

// Fail2ban
export const fetchFirewallJails = () => request<FWJailApi[]>('/firewall/f2b/jails')
export const toggleFirewallJail = (name: string) =>
  request<{ name: string; status: string }>(`/firewall/f2b/jails/${name}/toggle`, { method: 'POST' })
export const fetchFirewallBanned = () => request<FWBannedIPApi[]>('/firewall/f2b/banned')
export const banFirewallIP = (ip: string, jail: string, country?: string) =>
  request<FWBannedIPApi>('/firewall/f2b/banned', { method: 'POST', body: JSON.stringify({ ip, jail, country }) })
export const unbanFirewallIP = (ip: string, jail?: string) =>
  request<void>(`/firewall/f2b/banned/${encodeURIComponent(ip)}${jail ? `?jail=${jail}` : ''}`, { method: 'DELETE' })

// Logs & Stats
export const fetchFirewallLogs = (params?: { type?: string; src?: string; dst?: string; limit?: number; offset?: number }) => {
  const qs = new URLSearchParams()
  if (params?.type) qs.set('type', params.type)
  if (params?.src) qs.set('src', params.src)
  if (params?.dst) qs.set('dst', params.dst)
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  return request<FWLogEntryApi[]>(`/firewall/logs${qs.toString() ? '?' + qs : ''}`)
}
export const clearFirewallLogs = () => request<void>('/firewall/logs', { method: 'DELETE' })
export const fetchFirewallStats = () => request<FWStatsApi>('/firewall/stats')
export const buildFirewallCommand = (rule: FWRuleInput) =>
  request<{ command: string }>('/firewall/command', { method: 'POST', body: JSON.stringify(rule) })

// ---- Web Server ----

export interface WebServerSite {
  name: string
  enabled: boolean
  root: string
  server_name: string
  listen: string
  config: string
}

export const fetchWebServerSites = () => request<WebServerSite[]>('/webserver/sites')
export const updateWebServerSite = (name: string, config: string) =>
  request<void>(`/webserver/sites/${name}`, { method: 'PUT', body: JSON.stringify({ config }) })

// ---- Web Server (extended) ----

export interface NginxSiteAPI {
  name: string
  enabled: boolean
  root: string
  server_name: string
  aliases: string[]
  listen: string
  ssl: string
  ssl_cert_path: string
  proxy: string
  access_log: string
  error_log: string
  gzip: boolean
  brotli: boolean
  php: boolean
  rate_limit: boolean
  basic_auth: boolean
  hsts: boolean
  config: string
  status: string
  config_file: string
}

export interface NginxStatusAPI {
  running: boolean
  version: string
  pid: number
  config_file: string
  config_ok: boolean
  config_test: string
  workers: number
  uptime: string
  binary: string
}

export interface NginxPerfAPI {
  active_conns: number
  reading: number
  writing: number
  waiting: number
  accepts: number
  handled: number
  requests: number
}

export interface NginxGlobalAPI {
  worker_processes: string
  worker_connections: string
  keepalive_timeout: string
  client_max_body_size: string
  server_tokens_off: boolean
  tcp_nopush: boolean
  gzip: boolean
  raw: string
}

export interface AccessLogLineAPI {
  id: string
  ts: string
  ip: string
  method: string
  path: string
  status: number
  bytes: number
  ua: string
}

export const fetchWebServerSitesExt  = () => request<NginxSiteAPI[]>('/webserver/sites')
export const fetchWebServerStatus    = () => request<NginxStatusAPI>('/webserver/status')
export const fetchWebServerPerf      = () => request<NginxPerfAPI>('/webserver/performance')
export const fetchWebServerGlobal    = () => request<NginxGlobalAPI>('/webserver/global')
export const fetchWebServerLogs      = (site?: string, limit?: number) => {
  const params = new URLSearchParams()
  if (site) params.set('site', site)
  if (limit) params.set('limit', String(limit))
  return request<AccessLogLineAPI[]>(`/webserver/logs${params.toString() ? '?' + params.toString() : ''}`)
}

export const createWebServerSite = (data: {
  name?: string; domain: string; aliases?: string; doc_root?: string
  php?: boolean; php_version?: string; ssl?: string; hsts?: boolean
  http_redirect?: boolean; gzip?: boolean; proxy?: string; rate_limit?: boolean
  rate_limit_rate?: string; sec_headers?: boolean; config?: string
}) => request<NginxSiteAPI>('/webserver/sites', { method: 'POST', body: JSON.stringify(data) })

export const deleteWebServerSite  = (name: string) =>
  fetch(`/api/webserver/sites/${encodeURIComponent(name)}`, { method: 'DELETE', credentials: 'include' })

export const toggleWebServerSite  = (name: string) =>
  request<NginxSiteAPI>(`/webserver/sites/${encodeURIComponent(name)}/toggle`, { method: 'POST' })

export const reloadWebServer      = () => request<{ ok: boolean; output: string }>('/webserver/reload', { method: 'POST' })
export const testWebServerConfig  = () => request<{ ok: boolean; output: string }>('/webserver/test',   { method: 'POST' })
export const startWebServer       = () => request<{ ok: boolean; output: string }>('/webserver/start',  { method: 'POST' })
export const stopWebServer        = () => request<{ ok: boolean; output: string }>('/webserver/stop',   { method: 'POST' })
export const restartWebServer     = () => request<{ ok: boolean; output: string }>('/webserver/restart',{ method: 'POST' })

export const saveWebServerGlobal  = (raw: string) =>
  request<{ ok: boolean; output: string }>('/webserver/global', { method: 'PUT', body: JSON.stringify({ raw }) })

// ---- Deploy ----

export interface DeployHook {
  id: number
  name: string
  project: string
  strategy: 'exec' | 'blue-green'
  created_at: number
}

export interface DeployLog {
  id: number
  hook_id: number
  status: 'running' | 'ok' | 'error'
  output: string
  started_at: number
  ended_at?: number
}

export const fetchDeployHooks = () => request<DeployHook[]>('/deploy/hooks')
export const createDeployHook = (data: { name: string; project: string; script_path: string; strategy: string }) =>
  request<DeployHook>('/deploy/hooks', { method: 'POST', body: JSON.stringify(data) })
export const triggerDeploy = (id: number) => request<DeployLog>(`/deploy/hooks/${id}/trigger`, { method: 'POST' })

// ---- Uptime ----

export interface UptimeMonitor {
  id: number
  name: string
  kind: 'http' | 'tcp' | 'icmp'
  target: string
  interval_s: number
  enabled: boolean
  created_at: number
  status: 'up' | 'down' | 'unknown'
  latency_ms: number
  http_code?: number
  ssl_days_left?: number
  last_check_at?: number
  sla_24h: number
  sla_7d: number
  sla_30d: number
  sla_90d: number
  history_90d: ('up' | 'down' | 'degraded' | 'nodata')[]
  sparkline_24h: number[]
}

export interface UptimeStats {
  overall_sla: number
  up_count: number
  down_count: number
  total_count: number
  avg_latency_ms: number
  active_incident_count: number
  total_incident_90d: number
  mttr_avg_min: number
}

export interface UptimeTimelineEvent {
  offset_min: number
  type: string
  actor: string
  message: string
}

export interface UptimeCheckEntry {
  offset_min: number
  status: 'pass' | 'fail' | 'timeout' | 'degraded'
  latency_ms: number | null
  http_code?: number
  note?: string
}

export interface UptimeIncident {
  id: number
  monitor_id: number
  monitor_name: string
  monitor_kind: string
  target: string
  ref: string
  cause: string
  category: string
  severity: 'critical' | 'major' | 'minor'
  started_at: number
  resolved_at: number | null
  duration_min: number | null
  failed_checks: number
  mttd_sec: number
  mttr_min: number | null
  error_code: string
  error_detail: string
  root_cause: string
  log_excerpt: string
  resolution: string
  prevention: string[]
  impact_summary: string
  latency_baseline: number
  latency_peak: number
  responder_name: string
  affected_regions: string[]
  timeline: UptimeTimelineEvent[]
  check_log: UptimeCheckEntry[]
}

export interface CreateMonitorPayload {
  name: string
  kind: 'http' | 'tcp' | 'icmp'
  target: string
  interval_s: number
}

export const fetchUptimeMonitors = () => request<UptimeMonitor[]>('/uptime')
export const fetchUptimeStats    = () => request<UptimeStats>('/uptime-stats')
export const fetchUptimeIncidents = () => request<UptimeIncident[]>('/uptime-incidents')
export const fetchUptimeIncident  = (id: number) => request<UptimeIncident>(`/uptime-incidents/${id}`)
export const resolveUptimeIncident = (id: number) =>
  request<void>(`/uptime-incidents/${id}/resolve`, { method: 'POST' })
export const deleteUptimeIncident = (id: number) =>
  request<void>(`/uptime-incidents/${id}`, { method: 'DELETE' })
export const createUptimeMonitor = (data: CreateMonitorPayload) =>
  request<UptimeMonitor>('/uptime', { method: 'POST', body: JSON.stringify(data) })
export const updateUptimeMonitor = (id: number, data: Partial<CreateMonitorPayload & { enabled: boolean }>) =>
  request<UptimeMonitor>(`/uptime/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteUptimeMonitor = (id: number) => request<void>(`/uptime/${id}`, { method: 'DELETE' })
export const pingUptimeMonitor   = (id: number) => request<{ status: string; latency_ms: number; ts: number }>(`/uptime/${id}/ping`, { method: 'POST' })

// ---- Containers ----

export interface Container {
  id: string
  name: string
  image: string
  status: string
  state: 'running' | 'exited' | 'paused' | 'restarting' | 'unknown'
  cpu_pct: number
  mem_bytes: number
  mem_limit: number
}

export const fetchContainers = () => request<Container[]>('/containers')
export const startContainer = (id: string) => request<void>(`/containers/${id}/start`, { method: 'POST' })
export const stopContainer = (id: string) => request<void>(`/containers/${id}/stop`, { method: 'POST' })
export const restartContainer = (id: string) => request<void>(`/containers/${id}/restart`, { method: 'POST' })
export const removeContainer = (id: string, force = false) => request<void>(`/containers/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' })

export interface ContainerImage {
  id: string
  repository: string
  tag: string
  size: string
  created: string
}

export interface ContainerVolume {
  name: string
  driver: string
  mountpoint: string
  size: string
  usedBy: string[]
  created: string
}

export interface ContainerNetwork {
  id: string
  name: string
  driver: string
  subnet: string
  gateway: string
  containers: number
  created: string
  internal: boolean
}

export interface DockerSystemInfo {
  version: string
  apiVersion: string
  goVersion?: string
  buildHash?: string
  os: string
  arch: string
  kernelVersion: string
  diskUsage: string
  imagesCount: number
  volumesCount: number
  networksCount: number
  diskTotal?: number
  diskUsed?: number
}

export const fetchContainerImages = () => request<ContainerImage[]>('/containers/images')
export const removeContainerImage = (id: string, force = false) => request<void>(`/containers/images/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' })
export const pullContainerImage = (image: string) => request<{ status: string; output: string }>('/containers/images/pull', { method: 'POST', body: JSON.stringify({ image }) })
export const fetchContainerVolumes = () => request<ContainerVolume[]>('/containers/volumes')
export const fetchContainerNetworks = () => request<ContainerNetwork[]>('/containers/networks')
export const fetchDockerInfo = () => request<DockerSystemInfo>('/docker/info')
export const pruneDockerSystem = (all = false) => request<{ reclaimed: string }>(`/containers/prune${all ? '?all=true' : ''}`, { method: 'POST' })
export const createContainer = (opts: { image: string; name?: string; ports?: string[]; env?: string[]; volumes?: string[]; restart?: string; command?: string[] }) =>
  request<{ id: string }>('/containers', { method: 'POST', body: JSON.stringify(opts) })

// ---- Security ----

export interface SecurityFinding {
  id: string
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  category: string
  remediation?: string
}

export interface SecurityAudit {
  score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  findings: SecurityFinding[]
  scanned_at: string
}

export const fetchSecurityAudit = () => request<SecurityAudit>('/security/audit')

// ---- Security Stats ----

export interface SecurityStats {
  failed_logins: number
  banned_ips: number
  blocked_attacks: number
  malware_found: number
  period: string
}

export const fetchSecurityStats = () => request<SecurityStats>('/security/stats')

// ---- Alert Events ----

export interface AlertEvent {
  id: number
  rule_id: number
  rule_name: string
  metric: string
  value: number
  threshold: number
  ts: number
}

export const fetchAlertEvents = () => request<AlertEvent[]>('/alerts/events')

// ---- Notification Channels ----

export interface NotificationChannel {
  id: number
  name: string
  type: 'email' | 'slack' | 'discord' | 'telegram' | 'pagerduty' | 'webhook'
  config: string
  enabled: boolean
  created_at: number
}

export interface NotificationEvent {
  id: number
  channel_id: number | null
  severity: string
  title: string
  message: string
  sent: boolean
  created_at: number
}

export const fetchNotificationChannels = () => request<NotificationChannel[]>('/notifications/channels')
export const createNotificationChannel = (data: { name: string; type: string; config: string; enabled: boolean }) =>
  request<NotificationChannel>('/notifications/channels', { method: 'POST', body: JSON.stringify(data) })
export const updateNotificationChannel = (id: number, data: { name: string; type: string; config: string; enabled: boolean }) =>
  request<void>(`/notifications/channels/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteNotificationChannel = (id: number) =>
  fetch(`/api/notifications/channels/${id}`, { method: 'DELETE', credentials: 'include' }).then(() => {})
export const toggleNotificationChannel = (id: number) =>
  fetch(`/api/notifications/channels/${id}/toggle`, { method: 'POST', credentials: 'include' }).then(() => {})
export const testNotificationChannel = (id: number) =>
  request<{ ok: boolean; channel: string; type: string; error: string }>(`/notifications/channels/${id}/test`, { method: 'POST' })
export const fetchNotificationEvents = () => request<NotificationEvent[]>('/notifications/events')

// ---- Audit Log ----

export interface AuditEntry {
  id: number
  user: string
  method: string
  path: string
  status: number
  ip: string
  body_hash?: string
  ts: number
}

export interface AuditLog {
  entries: AuditEntry[]
  total: number
}

export const fetchAuditLog = (limit = 50) => request<AuditLog>(`/audit/logs?limit=${limit}`)

// ---- Multi-server Fleet ----

export interface ManagedServerMetrics {
  cpu_pct: number
  mem_pct: number
  mem_used_gb: number
  mem_total_gb: number
  disk_pct: number
  disk_used_gb: number
  disk_total_gb: number
  net_in_mbps: number
  net_out_mbps: number
  load_avg: number
}

export interface ManagedServerAlert {
  id: number
  server_id: number
  severity: 'critical' | 'warning' | 'resolved'
  message: string
  resolved: boolean
  ts: number
  time: string
}

export interface ManagedServerService {
  name: string
  status: 'active' | 'inactive' | 'failed'
}

export interface ManagedServer {
  id: number
  name: string
  host: string
  port: number
  user: string
  auth_method: string
  key_file: string
  jump_host: string
  role: string
  environment: string
  region: string
  tags: string[]
  description: string
  order: number
  status: 'connected' | 'disconnected' | 'unknown'
  latency_ms?: number
  last_ping_at?: number
  last_seen?: string
  os: string
  kernel: string
  uptime: string
  metrics?: ManagedServerMetrics
  alerts: ManagedServerAlert[]
  services: ManagedServerService[]
  created_at: number
}

export interface ServerGroup {
  id: number
  name: string
  color: string
  servers: string[]
}

export interface ServerCommand {
  id: number
  name: string
  command: string
  role: string
  sudo: boolean
  created_at: number
}

export interface ExecResult {
  server_id: number
  server_name: string
  host: string
  status: 'ok' | 'error' | 'timeout'
  output: string
  exit_code: number
  duration_ms: number
}

export const fetchManagedServers = () => request<ManagedServer[]>('/servers')
export const createManagedServer = (data: object) =>
  request<ManagedServer>('/servers', { method: 'POST', body: JSON.stringify(data) })
export const getManagedServer = (id: number) => request<ManagedServer>(`/servers/${id}`)
export const updateManagedServer = (id: number, data: object) =>
  request<ManagedServer>(`/servers/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteManagedServer = (id: number) =>
  request<void>(`/servers/${id}`, { method: 'DELETE' })
export const pingManagedServer = (id: number) =>
  request<{ online: boolean; status: string; latency_ms?: number }>(`/servers/${id}/ping`, { method: 'POST' })
export const testServerConnection = (data: { host: string; port: number; user: string; key_file: string }) =>
  request<{ online: boolean; latency_ms?: number; error?: string }>('/servers/test-connection', { method: 'POST', body: JSON.stringify(data) })
export const execServerCommand = (id: number, data: { command: string; sudo?: boolean; timeout_sec?: number }) =>
  request<ExecResult>(`/servers/${id}/exec`, { method: 'POST', body: JSON.stringify(data) })
export const bulkExecCommand = (data: {
  server_ids?: number[]
  role?: string
  command: string
  sudo?: boolean
  timeout_sec?: number
  parallelism?: number
  stop_on_fail?: boolean
}) => request<ExecResult[]>('/servers/bulk/exec', { method: 'POST', body: JSON.stringify(data) })
export const reorderServers = (ids: number[]) =>
  request<void>('/servers/reorder', { method: 'POST', body: JSON.stringify({ ids }) })
export const fetchServerGroups = () => request<ServerGroup[]>('/server-groups')
export const createServerGroup = (data: { name: string; color: string }) =>
  request<ServerGroup>('/server-groups', { method: 'POST', body: JSON.stringify(data) })
export const updateServerGroup = (id: number, data: { name?: string; color?: string }) =>
  request<ServerGroup>(`/server-groups/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteServerGroup = (id: number) =>
  request<void>(`/server-groups/${id}`, { method: 'DELETE' })
export const addServerGroupMember = (groupId: number, serverId: number) =>
  request<void>(`/server-groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ server_id: serverId }) })
export const removeServerGroupMember = (groupId: number, serverId: number) =>
  request<void>(`/server-groups/${groupId}/members/${serverId}`, { method: 'DELETE' })
export const fetchAllServerAlerts = () => request<ManagedServerAlert[]>('/server-alerts')
export const fetchServerAlerts = (serverId: number) => request<ManagedServerAlert[]>(`/servers/${serverId}/alerts`)
export const createServerAlert = (serverId: number, data: { severity: string; message: string }) =>
  request<ManagedServerAlert>(`/servers/${serverId}/alerts`, { method: 'POST', body: JSON.stringify(data) })
export const resolveServerAlert = (alertId: number) =>
  request<void>(`/server-alerts/${alertId}/resolve`, { method: 'POST' })
export const fetchServerCommands = () => request<ServerCommand[]>('/server-commands')
export const createServerCommand = (data: { name: string; command: string; role: string; sudo: boolean }) =>
  request<ServerCommand>('/server-commands', { method: 'POST', body: JSON.stringify(data) })
export const updateServerCommand = (id: number, data: object) =>
  request<ServerCommand>(`/server-commands/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteServerCommand = (id: number) =>
  request<void>(`/server-commands/${id}`, { method: 'DELETE' })

// ---- MCP ----

export interface MCPToken {
  id: number
  label: string
  scope: 'read-only' | 'deploy' | 'admin'
  created_at: number
  last_used?: number
}

export const fetchMCPTokens = () => request<MCPToken[]>('/mcp/tokens')
export const createMCPToken = (label: string, scope: MCPToken['scope']) =>
  request<{ token: string } & MCPToken>('/mcp/tokens', { method: 'POST', body: JSON.stringify({ label, scope }) })
export const revokeMCPToken = (id: number) => request<void>(`/mcp/tokens/${id}`, { method: 'DELETE' })

export interface MCPAuditEntry {
  id: number
  token_id: number | null
  tool: string
  args: string
  result: string
  ts: number
}
export const fetchMCPAuditLog = () => request<MCPAuditEntry[]>('/mcp/audit')

export interface MCPStats {
  rate_limit_hits_24h: number
  scope_denials_today: number
}
export const fetchMCPStats = () => request<MCPStats>('/mcp/stats')

// ---- FTP ----

export interface FtpUserApi {
  id: number
  username: string
  home_dir: string
  upload_limit: number
  download_limit: number
  chroot: boolean
  enabled: boolean
  created_at: number
  last_login?: number
}

export interface FtpQuotaApi {
  id: number
  username: string
  soft_bytes: number
  hard_bytes: number
  grace_days: number
}

export interface FtpServiceStatus {
  active: boolean
  status: string
  service: string
}

export const fetchFtpUsers = () => request<FtpUserApi[]>('/ftp/users')
export const createFtpUser = (data: {
  username: string; password: string; home_dir?: string
  upload_limit?: number; download_limit?: number; chroot?: boolean
}) => request<FtpUserApi>('/ftp/users', { method: 'POST', body: JSON.stringify(data) })
export const updateFtpUser = (id: number, data: {
  password?: string; home_dir?: string; upload_limit?: number
  download_limit?: number; chroot?: boolean; enabled?: boolean
}) => request<void>(`/ftp/users/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteFtpUser = (id: number) => request<void>(`/ftp/users/${id}`, { method: 'DELETE' })
export const toggleFtpUser = (id: number) => request<void>(`/ftp/users/${id}/toggle`, { method: 'POST' })

export const fetchFtpQuotas = () => request<FtpQuotaApi[]>('/ftp/quotas')
export const setFtpQuota = (data: { username: string; soft_bytes: number; hard_bytes: number; grace_days?: number }) =>
  request<FtpQuotaApi>('/ftp/quotas', { method: 'POST', body: JSON.stringify(data) })
export const deleteFtpQuota = (username: string) => request<void>(`/ftp/quotas/${username}`, { method: 'DELETE' })

export const fetchFtpServiceStatus = () => request<FtpServiceStatus>('/ftp/service/status')
export const controlFtpService = (action: 'start' | 'stop' | 'restart') =>
  request<{ ok: boolean; output: string }>(`/ftp/service/${action}`, { method: 'POST' })

export const fetchFtpMounts = () => request<{ remotes: string[] }>('/ftp/mounts')
export const controlFtpMount = (remote: string, mount_path: string, action: 'mount' | 'unmount') =>
  request<{ ok: boolean; output: string }>('/ftp/mounts', {
    method: 'POST',
    body: JSON.stringify({ remote, mount_path, action }),
  })

// ---- FTP Config ----

export interface FtpConfig {
  raw: string
  parsed: Record<string, string>
  exists: boolean
}

export const fetchFtpConfig = () => request<FtpConfig>('/ftp/config')
export const saveFtpConfig = (parsed: Record<string, string>) =>
  request<{ ok: boolean }>('/ftp/config', {
    method: 'PUT',
    body: JSON.stringify({ parsed }),
  })

// ---- File System ----

export interface FSEntry {
  name: string
  path: string
  size: number
  mode: string
  mode_octal: string
  is_dir: boolean
  is_symlink: boolean
  link_target?: string
  owner: string
  group: string
  mod_time: number
  mime_type?: string
}

export interface FSListResponse {
  path: string
  files: FSEntry[]
}

export interface FSReadResponse {
  path: string
  content: string
  size: number
  mode: string
}

export const fetchFSList = (path: string) =>
  request<FSListResponse>(`/files/list?path=${encodeURIComponent(path)}`)

export const fetchFSRead = (path: string) =>
  request<FSReadResponse>(`/files/read?path=${encodeURIComponent(path)}`)

export const writeFSFile = (path: string, content: string) =>
  request<{ ok: boolean; path: string; size: number }>('/files/write', {
    method: 'POST',
    body: JSON.stringify({ path, content }),
  })

export const mkdirFS = (path: string) =>
  request<{ ok: boolean; path: string }>('/files/mkdir', {
    method: 'POST',
    body: JSON.stringify({ path }),
  })

export const deleteFS = (path: string, recursive = false) =>
  fetch(`/api/files`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ path, recursive }),
  }).then(() => {})

export const renameFS = (old_path: string, new_path: string) =>
  request<{ ok: boolean; path: string }>('/files/rename', {
    method: 'POST',
    body: JSON.stringify({ old_path, new_path }),
  })

export const chmodFS = (path: string, mode: string) =>
  request<{ ok: boolean }>('/files/chmod', {
    method: 'POST',
    body: JSON.stringify({ path, mode }),
  })

export const chownFS = (path: string, uid: number, gid: number) =>
  request<{ ok: boolean }>('/files/chown', {
    method: 'POST',
    body: JSON.stringify({ path, uid, gid }),
  })

export const uploadFSFile = (dir: string, file: File) => {
  const form = new FormData()
  form.append('path', dir)
  form.append('file', file)
  return fetch('/api/files/upload', { method: 'POST', credentials: 'include', body: form })
    .then(r => r.json())
}

// ---- File System (hex + archive list) ----

export interface HexRow {
  addr: string
  bytes: string
  ascii: string
}

export const fetchFSHex = (path: string) =>
  request<HexRow[]>(`/files/hex?path=${encodeURIComponent(path)}`)

export interface ArchiveEntry {
  name: string
  type: 'file' | 'folder'
  size: string
  size_bytes: number
  modified: string
}

export const fetchFSArchiveList = (path: string) =>
  request<ArchiveEntry[]>(`/files/archive-list?path=${encodeURIComponent(path)}`)

export const extractFSArchive = (path: string, output?: string) =>
  request<{ ok: boolean; output: string }>('/files/extract', {
    method: 'POST',
    body: JSON.stringify({ path, output }),
  })

// ---- SSH ----

export interface ApiSshSession {
  id: number
  server: string
  user: string
  port: number
  status: string
  started_at: number
  ended_at?: number
  bytes_sent: number
  bytes_recv: number
}

export interface ApiSshKey {
  id: number
  name: string
  type: string
  public_key: string
  fingerprint: string
  comment: string
  created_at: number
}

export interface ApiSshSaved {
  id: number
  name: string
  host: string
  port: number
  user: string
  auth_type: string
  key_id?: number
  jump_host?: string
  tags?: string
  created_at: number
  last_used?: number
}

export interface ApiSshSnippet {
  id: number
  name: string
  command: string
  description: string
  category: string
  tags: string
  used_count: number
  created_at: number
}

export interface ApiSshPortForward {
  id: number
  session_id?: number
  type: string
  local_port: number
  remote_host: string
  remote_port: number
  status: string
  created_at: number
}

export interface ApiSshRecording {
  id: number
  session_id: number
  server: string
  path: string
  duration_s: number
  size_bytes: number
  created_at: number
}

export const fetchSSHSessions = () => request<ApiSshSession[]>('/ssh/sessions')

export const fetchSSHKeys = () => request<ApiSshKey[]>('/ssh/keys')

export const generateSSHKey = (name: string, type: string, bits: number, comment: string) =>
  request<ApiSshKey & { private_key: string }>('/ssh/keys/generate', {
    method: 'POST',
    body: JSON.stringify({ name, type, bits, comment }),
  })

export const importSSHKey = (name: string, public_key: string, private_key: string, comment: string) =>
  request<ApiSshKey>('/ssh/keys/import', {
    method: 'POST',
    body: JSON.stringify({ name, public_key, private_key, comment }),
  })

export const deleteSSHKey = (id: number) =>
  fetch(`/api/ssh/keys/${id}`, { method: 'DELETE', credentials: 'include' }).then(() => {})

export const fetchSSHSaved = () => request<ApiSshSaved[]>('/ssh/saved')

export const createSSHSaved = (data: Omit<ApiSshSaved, 'id' | 'created_at' | 'last_used'>) =>
  request<ApiSshSaved>('/ssh/saved', { method: 'POST', body: JSON.stringify(data) })

export const deleteSSHSaved = (id: number) =>
  fetch(`/api/ssh/saved/${id}`, { method: 'DELETE', credentials: 'include' }).then(() => {})

export const fetchSSHSnippets = (q?: string) =>
  request<ApiSshSnippet[]>(`/ssh/snippets${q ? `?q=${encodeURIComponent(q)}` : ''}`)

export const createSSHSnippet = (data: Pick<ApiSshSnippet, 'name' | 'command' | 'description' | 'category' | 'tags'>) =>
  request<ApiSshSnippet>('/ssh/snippets', { method: 'POST', body: JSON.stringify(data) })

export const deleteSSHSnippet = (id: number) =>
  fetch(`/api/ssh/snippets/${id}`, { method: 'DELETE', credentials: 'include' }).then(() => {})

export const fetchSSHPortForwards = () => request<ApiSshPortForward[]>('/ssh/port-forwards')

export const createSSHPortForward = (data: Pick<ApiSshPortForward, 'type' | 'local_port' | 'remote_host' | 'remote_port'>) =>
  request<ApiSshPortForward>('/ssh/port-forwards', { method: 'POST', body: JSON.stringify(data) })

export const deleteSSHPortForward = (id: number) =>
  fetch(`/api/ssh/port-forwards/${id}`, { method: 'DELETE', credentials: 'include' }).then(() => {})

export const fetchSSHRecordings = () => request<ApiSshRecording[]>('/ssh/recordings')

// ---- SSH Collaborative Sessions ----

export interface CollabSession {
  id: number
  name: string
  token?: string
  created_by: string
  created_at: number
}

export interface CollabParticipant {
  id: number
  session_id: number
  username: string
  email: string
  role: string
  joined_at: number
}

export const fetchCollabSessions = () => request<CollabSession[]>('/ssh/collab')
export const createCollabSession = (name: string, created_by: string) =>
  request<CollabSession>('/ssh/collab', { method: 'POST', body: JSON.stringify({ name, created_by }) })
export const deleteCollabSession = (id: number) =>
  fetch(`/api/ssh/collab/${id}`, { method: 'DELETE', credentials: 'include' }).then(() => {})
export const fetchCollabParticipants = (sessionId: number) =>
  request<CollabParticipant[]>(`/ssh/collab/${sessionId}/participants`)
export const addCollabParticipant = (sessionId: number, data: { username: string; email: string; role: string }) =>
  request<CollabParticipant>(`/ssh/collab/${sessionId}/participants`, { method: 'POST', body: JSON.stringify(data) })
export const updateCollabParticipant = (sessionId: number, pid: number, role: string) =>
  request<void>(`/ssh/collab/${sessionId}/participants/${pid}`, { method: 'PUT', body: JSON.stringify({ role }) })
export const removeCollabParticipant = (sessionId: number, pid: number) =>
  fetch(`/api/ssh/collab/${sessionId}/participants/${pid}`, { method: 'DELETE', credentials: 'include' }).then(() => {})

// ---- Alert Rules ----

export interface AlertRule {
  id: number
  name: string
  metric: string
  operator: string
  threshold: number
  channel: string
  channel_cfg?: string
  enabled: boolean
  created_at: number
}

export interface AlertEvent {
  id: number
  rule_id: number
  rule_name: string
  metric: string
  value: number
  threshold: number
  operator: string
  channel: string
  fired_at: number
}

export const fetchAlertRules = () => request<AlertRule[]>('/alerts/rules')

export const createAlertRule = (data: Omit<AlertRule, 'id' | 'created_at'>) =>
  request<AlertRule>('/alerts/rules', { method: 'POST', body: JSON.stringify(data) })

export const updateAlertRule = (id: number, data: Partial<AlertRule>) =>
  request<AlertRule>(`/alerts/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteAlertRule = (id: number) =>
  fetch(`/api/alerts/rules/${id}`, { method: 'DELETE', credentials: 'include' }).then(() => {})

export const toggleAlertRule = (id: number) =>
  fetch(`/api/alerts/rules/${id}/toggle`, { method: 'POST', credentials: 'include' }).then(() => {})

// ---- Deploy Runs (all hooks) ----

export interface DeployRun {
  id: number
  hook_id: number
  hook_name: string
  project: string
  status: string
  output: string
  started_at: number
  ended_at?: number
  duration: string
}

export interface DeployStats {
  total: number
  today: number
  success: number
  failed: number
  running: number
  success_rate: number
}

export const fetchAllDeployRuns = () => request<DeployRun[]>('/deploy/runs')
export const fetchDeployStats = () => request<DeployStats>('/deploy/stats')
export const fetchDeployHookRuns = (hookId: number) => request<DeployRun[]>(`/deploy/hooks/${hookId}/runs`)
export const fetchDeployRun = (runId: number) => request<DeployRun>(`/deploy/runs/${runId}`)
export const deleteDeployHook = (id: number) =>
  fetch(`/api/deploy/hooks/${id}`, { method: 'DELETE', credentials: 'include' }).then(() => {})

// ---- Firewall NAT (add) ----

export const addFirewallNAT = (data: {
  publicPort: number
  proto: string
  destIp: string
  destPort: number
  comment?: string
}) => request<FWNATRuleApi>('/firewall/nat', { method: 'POST', body: JSON.stringify(data) })

// ---- Plugins ----

export interface ApiPlugin {
  id: number
  plugin_id: string
  name: string
  description: string
  version: string
  author: string
  category: string
  enabled: boolean
  config: string
  installed_at: number
  install_status: string // installed | not_installed | error | installing
}

export const fetchPlugins    = () => request<ApiPlugin[]>('/plugins')
export const fetchPlugin     = (id: string) => request<ApiPlugin>(`/plugins/${id}`)
export const togglePlugin    = (id: number) => request<{ok:boolean}>(`/plugins/${id}/toggle`, { method: 'POST' })
export const enablePlugin    = (id: string) => request<{ok:boolean}>(`/plugins/${id}/enable`, { method: 'POST' })
export const disablePlugin   = (id: string) => request<{ok:boolean}>(`/plugins/${id}/disable`, { method: 'POST' })
export const restartPlugin   = (id: string) => request<{ok:boolean;output:string}>(`/plugins/${id}/restart`, { method: 'POST' })
export const installPlugin   = (id: string) => request<{status:string}>(`/plugins/${id}/install`, { method: 'POST' })
export const uninstallPlugin = (id: string) => request<{ok:boolean;output:string}>(`/plugins/${id}`, { method: 'DELETE' })
export const fetchPluginLogs = (id: string, lines = 100) => request<{time:string;level:string;message:string;unit:string}[]>(`/plugins/${id}/logs?lines=${lines}`)
export const updatePluginConfig = (id: string, config: Record<string, unknown>) =>
  request<void>(`/plugins/${id}/config`, { method: 'PUT', body: JSON.stringify(config) })
export const updatePluginPortConfig = (id: string, portConfig: Record<string, unknown>) =>
  request<{ok:boolean}>(`/plugins/${id}/port-config`, { method: 'PUT', body: JSON.stringify(portConfig) })

// ── Apps (Marketplace) ────────────────────────────────────────────────────────
export interface AppResponse {
  id: string
  name: string
  tagline: string
  description: string
  long_desc: string
  category: string
  version: string
  author: string
  license: string
  website: string
  github: string
  docs: string
  install_method: string
  install_command: string
  docker_image?: string
  docker_compose?: string
  container_name: string
  min_ram_mb: number
  min_cpu: number
  min_disk_gb: number
  required_ports: number[]
  default_port: number
  health_endpoint: string
  features: string[]
  tags: string[]
  pricing: string
  // DB / live fields
  status: string // not_installed | installing | running | stopped | error
  port: number
  container_id: string
  config_json: string
  error: string
  installed_at?: number
  updated_at: number
  db_record_id?: number
}

export interface AppStatusResponse {
  status: string
  container_id: string
  port: number
  error?: string
  installed_at?: number
}

export interface AppPreflightCheck {
  name: string
  passed: boolean
  detail: string
}

export interface AppPreflightResult {
  all_passed: boolean
  checks: AppPreflightCheck[]
}

export interface AppLogEntry {
  line: string
}

export const fetchApps           = () => request<AppResponse[]>('/apps')
export const fetchApp            = (id: string) => request<AppResponse>(`/apps/${id}`)
export const fetchAppStatus      = (id: string) => request<AppStatusResponse>(`/apps/${id}/status`)
export const fetchAppLogs        = (id: string, lines = 200) => request<AppLogEntry[]>(`/apps/${id}/logs?lines=${lines}`)
export const fetchAppPreflight   = (id: string) => request<AppPreflightResult>(`/apps/${id}/preflight`)
export const installApp          = (id: string, opts: { port: number }) =>
  request<{ status: string; message: string }>(`/apps/${id}/install`, { method: 'POST', body: JSON.stringify(opts) })
export const uninstallApp        = (id: string) => request<{ ok: boolean; output: string }>(`/apps/${id}`, { method: 'DELETE' })
export const controlApp          = (id: string, action: 'start' | 'stop' | 'restart') =>
  request<{ ok: boolean; action: string; output: string }>(`/apps/${id}/${action}`, { method: 'POST' })
export const updateAppConfig     = (id: string, config: Record<string, unknown>) =>
  request<void>(`/apps/${id}/config`, { method: 'PUT', body: JSON.stringify(config) })

// ---- Certificates ----
export interface CertEntryAPI {
  id:         number
  domain:     string
  issuer:     string
  cert_path:  string
  key_path:   string
  expires_at: number | null
  auto_renew: boolean
  status:     string
  created_at: number
  days_left:  number
}

export const fetchCerts = () => request<CertEntryAPI[]>('/certs')

export const addCert = (data: { domain: string; cert_path: string; key_path?: string; issuer?: string; auto_renew?: boolean }) =>
  request<{ id: number; domain: string; status: string }>('/certs', { method: 'POST', body: JSON.stringify(data) })

export const issueCert = (data: { domain: string; sans?: string[]; email: string; auto_renew?: boolean; staging?: boolean }) =>
  request<{ ok: boolean; domain: string; output: string }>('/certs/issue', { method: 'POST', body: JSON.stringify(data) })

export const selfSignedCert = (data: { domain: string; out_dir?: string; days?: number }) =>
  request<{ ok: boolean; domain: string; cert_path: string; key_path: string }>('/certs/self-signed', { method: 'POST', body: JSON.stringify(data) })

export const renewCert = (domain: string) =>
  request<{ ok: boolean; domain: string; output: string }>(`/certs/${encodeURIComponent(domain)}/renew`, { method: 'POST' })

export const deleteCert = (domain: string) =>
  request<void>(`/certs/${encodeURIComponent(domain)}/untrack`, { method: 'DELETE' })

// (togglePlugin is defined with the plugin section above)

// ---- Fail2Ban ----

export interface F2bStatus {
  installed: boolean
  running: boolean
  version: string
  active_jails: string[]
  total_banned: number
  total_failed: number
  jail_count: number
  socket_path: string
  db_path: string
  config_file: string
}

export interface F2bJail {
  name: string
  enabled: boolean
  filter: string
  log_path: string
  max_retry: number
  find_time: number
  ban_time: number
  banned_ips: string[]
  total_banned: number
  currently_failed: number
  total_failed: number
  actions: string[]
}

export interface F2bBan {
  ip: string
  jail: string
  timestamp: number
  expires: number
  failures: number
  country: string
}

export interface F2bLogEntry {
  id: string
  timestamp: string
  level: string
  jail: string
  ip: string
  message: string
  action: string
}

export interface F2bConfig {
  ban_time: string
  find_time: string
  max_retry: string
  backend: string
  ignore_self: boolean
  ignore_ip: string
  action: string
  use_dns: string
  log_level: string
  log_file: string
  db_file: string
  raw: string
}

export interface F2bStat { date: string; bans: number }

export const fetchF2bStatus    = () => request<F2bStatus>('/fail2ban/status')
export const fetchF2bJails     = () => request<F2bJail[]>('/fail2ban/jails')
export const fetchF2bJail      = (name: string) => request<F2bJail>(`/fail2ban/jails/${name}`)
export const fetchF2bBans      = () => request<F2bBan[]>('/fail2ban/bans')
export const fetchF2bLogs      = (limit = 200) => request<F2bLogEntry[]>(`/fail2ban/logs?limit=${limit}`)
export const fetchF2bConfig    = () => request<F2bConfig>('/fail2ban/config')
export const fetchF2bWhitelist = () => request<{ ips: string[]; raw: string }>('/fail2ban/whitelist')
export const fetchF2bStats     = () => request<F2bStat[]>('/fail2ban/stats')
export const fetchF2bFilters   = () => request<string[]>('/fail2ban/filters')

export const f2bBanIP   = (jail: string, ip: string) =>
  request<{ok:boolean}>(`/fail2ban/jails/${jail}/ban`,   { method: 'POST', body: JSON.stringify({ ip }) })
export const f2bUnbanIP = (jail: string, ip: string) =>
  request<{ok:boolean}>(`/fail2ban/jails/${jail}/unban`, { method: 'POST', body: JSON.stringify({ ip }) })
export const f2bUnbanGlobal = (ip: string, jail?: string) =>
  request<{ok:boolean}>('/fail2ban/bans', { method: 'DELETE', body: JSON.stringify({ ip, jail: jail ?? '' }) })
export const f2bService = (action: string) =>
  request<{ok:boolean;output:string}>(`/fail2ban/service/${action}`, { method: 'POST' })
export const f2bSaveConfig = (raw: string) =>
  request<{ok:boolean;output:string}>('/fail2ban/config', { method: 'PUT', body: JSON.stringify({ raw }) })
export const f2bAddWhitelist = (ip: string) =>
  request<{ok:boolean}>('/fail2ban/whitelist', { method: 'POST', body: JSON.stringify({ ip }) })
export const f2bRemoveWhitelist = (ip: string) =>
  request<{ok:boolean}>(`/fail2ban/whitelist/${encodeURIComponent(ip)}`, { method: 'DELETE' })
export const f2bInstall = () =>
  request<{ok:boolean;output:string}>('/fail2ban/install', { method: 'POST' })

// ---- CrowdSec ----

export interface CsStatus {
  installed: boolean
  running: boolean
  version: string
  api_running: boolean
  api_url: string
  total_alerts: number
  total_decisions: number
  hub_status: string
  log_file: string
  db_path: string
  config_path: string
}

export interface CsDecision {
  id: number
  origin: string
  type: string
  scope: string
  value: string
  duration: string
  scenario: string
  simulated: boolean
}

export interface CsAlert {
  id: number
  scenario: string
  source: { ip: string; range: string; as_name: string; cn: string }
  start_at: string
  stop_at: string
  events_count: number
  message: string
  capacity: number
}

export interface CsBouncer {
  name: string
  api_key: string
  revoked: boolean
  ip_address: string
  type: string
  version: string
  last_pull: string
  auth_type: string
  created_at: string
}

export interface CsHubItem {
  name: string
  author: string
  version: string
  status: string
  description: string
  type: string
}

export interface CsMetrics {
  active_decisions: number
  alerts_24h: number
  origin_crowdsec: number
  origin_capi: number
  origin_list: number
}

export interface CsLogEntry {
  id: string
  timestamp: string
  level: string
  component: string
  ip: string
  scenario: string
  message: string
  action: string
}

export const fetchCsStatus    = () => request<CsStatus>('/crowdsec/status')
export const fetchCsAlerts    = (limit = 50) => request<CsAlert[]>(`/crowdsec/alerts?limit=${limit}`)
export const fetchCsDecisions = () => request<CsDecision[]>('/crowdsec/decisions')
export const fetchCsBouncers  = () => request<CsBouncer[]>('/crowdsec/bouncers')
export const fetchCsHub       = (type?: string) => request<CsHubItem[]>(`/crowdsec/hub${type ? `?type=${type}` : ''}`)
export const fetchCsMetrics   = () => request<CsMetrics>('/crowdsec/metrics')
export const fetchCsLogs      = (limit = 200) => request<CsLogEntry[]>(`/crowdsec/logs?limit=${limit}`)
export const fetchCsConfig    = () => request<{ raw: string; path: string }>('/crowdsec/config')
export const fetchCsAcquis    = () => request<{ raw: string; path: string }>('/crowdsec/acquis')

export const csAddDecision = (data: { ip: string; duration?: string; reason?: string; type?: string }) =>
  request<{ok:boolean;output:string}>('/crowdsec/decisions', { method: 'POST', body: JSON.stringify(data) })
export const csDeleteDecision = (id: number) =>
  request<{ok:boolean}>(`/crowdsec/decisions/${id}`, { method: 'DELETE' })
export const csDeleteDecisionByIP = (ip: string) =>
  request<{ok:boolean}>('/crowdsec/decisions', { method: 'DELETE', body: JSON.stringify({ ip }) })
export const csService = (action: string) =>
  request<{ok:boolean;output:string}>(`/crowdsec/service/${action}`, { method: 'POST' })
export const csHubUpdate = () =>
  request<{ok:boolean;output:string}>('/crowdsec/hub/update', { method: 'POST' })
export const csHubUpgrade = () =>
  request<{ok:boolean;output:string}>('/crowdsec/hub/upgrade', { method: 'POST' })
export const csInstallCollection = (name: string) =>
  request<{ok:boolean;output:string}>('/crowdsec/collections/install', { method: 'POST', body: JSON.stringify({ name }) })
export const csRemoveCollection = (name: string) =>
  request<{ok:boolean}>(`/crowdsec/collections/${encodeURIComponent(name)}`, { method: 'DELETE' })
export const csSaveConfig = (raw: string, path?: string) =>
  request<{ok:boolean}>('/crowdsec/config', { method: 'PUT', body: JSON.stringify({ raw, path }) })
export const csSaveAcquis = (raw: string) =>
  request<{ok:boolean}>('/crowdsec/acquis', { method: 'PUT', body: JSON.stringify({ raw }) })
export const csAllowlistAdd = (ip: string, comment?: string) =>
  request<{ok:boolean}>('/crowdsec/allowlist', { method: 'POST', body: JSON.stringify({ ip, comment }) })
export const csInstall = () =>
  request<{ok:boolean;output:string}>('/crowdsec/install', { method: 'POST' })

// ---- Settings (key-value store) ----
export const fetchAllSettings = () => request<Record<string, string>>('/settings')
export const putSettings = (data: Record<string, string>) =>
  request<void>('/settings', { method: 'PUT', body: JSON.stringify(data) })

// ---- Users (Settings page) ----
export interface BackendUser {
  id: number
  username: string
  email: string
  role: string
  created_at: number
}
export const fetchUsers = () => request<BackendUser[]>('/users')
export const createUser = (data: { username: string; email: string; password: string; role: string }) =>
  request<BackendUser>('/users', { method: 'POST', body: JSON.stringify(data) })
export const updateUser = (id: number, data: { email: string; role: string }) =>
  request<void>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteUser = (id: number) =>
  request<void>(`/users/${id}`, { method: 'DELETE' })

// ---- API Tokens (Settings page) ----
export interface BackendToken {
  id: number
  name: string
  scopes: string
  ip_restrict: string
  expires_at: number | null
  created_at: number
  last_used: number | null
}
export const fetchAPITokens = () => request<BackendToken[]>('/tokens')
export const createAPIToken = (data: { name: string; scopes: string; ip_restrict: string; expiry_days: number }) =>
  request<{ id: number; name: string; token: string; scopes: string; expires_at: number | null; created_at: number }>('/tokens', { method: 'POST', body: JSON.stringify(data) })
export const revokeAPIToken = (id: number) =>
  request<void>(`/tokens/${id}`, { method: 'DELETE' })

// ---- Settings (structured sections) ----

export interface AppearanceSettings {
  theme: string; sidebar: string; density: string; refreshInterval: string; itemsPerPage: string
  language: string; timezone: string; dateFormat: string; weekStart: string
  showResourceBars: boolean; animations: boolean; tooltips: boolean; compactNumbers: boolean
}
export interface AuthPolicySettings {
  minLen: number; maxAge: number; history: number; lockAttempts: number; lockDuration: number; sessionTimeout: number
  require2FAAdmin: boolean; allow2FAOptIn: boolean; recoveryCodes: boolean; totpEnabled: boolean; smsEnabled: boolean; webauthnEnabled: boolean
  bindSessionIP: boolean; forceLogoutPwdChange: boolean; concurrentSessions: boolean
  ldapServer: string; ldapPort: string; ldapBindDN: string; ldapBaseDN: string
  ldapTLS: boolean; ldapAutoCreate: boolean; ldapSyncGroups: boolean; ldapFallback: boolean
}
export interface NotifConfig {
  smtpHost: string; smtpPort: string; smtpFrom: string; smtpFromName: string; smtpUsername: string; smtpPassword: string; smtpTLS: boolean; smtpVerifySSL: boolean
  slackWebhook: string; slackChannel: string; slackUsername: string
  webhookURL: string; webhookMethod: string; webhookHeader: string; webhookRetry: boolean
}
export interface NotifMatrixEvent { id: string; label: string; email: boolean; slack: boolean; webhook: boolean }
export interface NotifMatrix { events: NotifMatrixEvent[] }
export interface BackupConfigSettings {
  backupTime: string; frequency: string; keepDaily: number; keepWeekly: number
  autoBackup: boolean; beforeChanges: boolean; encrypt: boolean
  destination: string; localDir: string; sftpUrl: string; s3Bucket: string
}
export interface BackupFileInfo { id: string; filename: string; date: string; size: string; auto: boolean }
export interface AuthMethodEntry { id: string; priority: number; method: string; status: string; config: string }
export interface AuthMethodsList { methods: AuthMethodEntry[] }
export interface SystemInfoResponse {
  version: string; goVersion: string; os: string; arch: string; updateChannel: string; autoCheck: boolean; buildDate: string
}

export const fetchSettingsAppearance  = () => request<AppearanceSettings>('/settings/appearance')
export const saveSettingsAppearance   = (data: AppearanceSettings) => request<void>('/settings/appearance', { method: 'PUT', body: JSON.stringify(data) })
export const fetchSettingsAuthPolicy  = () => request<AuthPolicySettings>('/settings/auth-policy')
export const saveSettingsAuthPolicy   = (data: Partial<AuthPolicySettings>) => request<void>('/settings/auth-policy', { method: 'PUT', body: JSON.stringify(data) })
export const fetchSettingsAuthMethods = () => request<AuthMethodsList>('/settings/auth-methods')
export const saveSettingsAuthMethods  = (data: AuthMethodsList) => request<void>('/settings/auth-methods', { method: 'PUT', body: JSON.stringify(data) })
export const fetchSettingsNotifConfig = () => request<NotifConfig>('/settings/notif-config')
export const saveSettingsNotifConfig  = (data: NotifConfig) => request<void>('/settings/notif-config', { method: 'PUT', body: JSON.stringify(data) })
export const fetchSettingsNotifMatrix = () => request<NotifMatrix>('/settings/notif-matrix')
export const saveSettingsNotifMatrix  = (data: NotifMatrix) => request<void>('/settings/notif-matrix', { method: 'PUT', body: JSON.stringify(data) })
export const fetchSettingsBackupConfig= () => request<BackupConfigSettings>('/settings/backup-config')
export const saveSettingsBackupConfig = (data: BackupConfigSettings) => request<void>('/settings/backup-config', { method: 'PUT', body: JSON.stringify(data) })
export const fetchSettingsBackupFiles = () => request<BackupFileInfo[]>('/settings/backup-files')
export const fetchSettingsSystemInfo  = () => request<SystemInfoResponse>('/settings/system-info')
export const settingsBackupNow        = () => request<{ run_id: number }>('/settings/backup-now', { method: 'POST' })
export const exportSettingsConfig     = () => request<Record<string, unknown>>('/settings/export')
export const restoreSettingsDefaults  = () => request<{ ok: boolean }>('/settings/restore-defaults', { method: 'POST' })

// ── Wazuh ─────────────────────────────────────────────────────────────────────

export interface WazuhStatus {
  installed: boolean; running: boolean; version: string
  manager_running: boolean; agent_running: boolean; indexer_running: boolean
  api_url: string; api_port: number; cluster_name: string; cluster_status: string
  total_agents: number; active_agents: number; total_alerts: number; alerts_today: number
  log_file: string; config_path: string; mode: string
}
export interface WazuhAgent {
  id: string; name: string; ip: string; status: string
  os: string; os_platform: string; version: string
  last_keepalive: string; group: string; registered_at: string
  manager: string; node_name: string
}
export interface WazuhAlert {
  id: string; timestamp: string; agent_id: string; agent_name: string; agent_ip: string
  rule_id: string; rule_level: number; rule_desc: string; rule_groups: string
  mitre_id: string; mitre_tactic: string; location: string; full_log: string
  severity: string; src_ip: string
}
export interface WazuhRule {
  id: string; level: number; description: string; groups: string[]
  filename: string; status: string; mitre_ids: string[]; enabled: boolean
}
export interface WazuhFIMEntry {
  file: string; agent: string; agent_id: string; event: string
  timestamp: string; size: number; perm: string; owner: string
  group: string; md5: string; sha256: string
}
export interface WazuhVuln {
  agent: string; agent_id: string; cve: string; package: string
  version: string; severity: string; cvss: string; title: string
}
export interface WazuhGroup {
  name: string; agent_count: number; config_sum: string; merged_sum: string; agent_names: string[]
}
export interface WazuhLogEntry {
  timestamp: string; level: string; tag: string; message: string
}
export interface WazuhStats {
  date: string; total_alerts: number; critical: number; high: number; medium: number; low: number
}

export const fetchWazuhStatus       = () => request<WazuhStatus>('/wazuh/status')
export const fetchWazuhAgents       = () => request<WazuhAgent[]>('/wazuh/agents')
export const fetchWazuhAgent        = (id: string) => request<WazuhAgent>(`/wazuh/agents/${id}`)
export const fetchWazuhAlerts       = (limit = 100) => request<WazuhAlert[]>(`/wazuh/alerts?limit=${limit}`)
export const fetchWazuhRules        = () => request<WazuhRule[]>('/wazuh/rules')
export const fetchWazuhFIM          = (limit = 50) => request<WazuhFIMEntry[]>(`/wazuh/fim?limit=${limit}`)
export const fetchWazuhVulns        = () => request<WazuhVuln[]>('/wazuh/vulnerabilities')
export const fetchWazuhGroups       = () => request<WazuhGroup[]>('/wazuh/groups')
export const fetchWazuhLogs         = (limit = 200) => request<WazuhLogEntry[]>(`/wazuh/logs?limit=${limit}`)
export const fetchWazuhConfig       = () => request<{ raw: string; path: string }>('/wazuh/config')
export const fetchWazuhStats        = () => request<WazuhStats[]>('/wazuh/stats')
export const fetchWazuhAgentScript  = (params: { manager_ip: string; agent_name: string; os?: string }) =>
  request<{ script: string; manager_ip: string; agent_name: string }>(
    `/wazuh/agent-install-script?manager_ip=${params.manager_ip}&agent_name=${params.agent_name}&os=${params.os || 'deb'}`
  )

export const wazuhService           = (action: string) =>
  request<{ok:boolean;output:string;action:string}>(`/wazuh/service/${action}`, { method: 'POST' })
export const wazuhInstall           = (data: { mode: string; manager_ip?: string; agent_name?: string }) =>
  request<{ok:boolean;output:string}>('/wazuh/install', { method: 'POST', body: JSON.stringify(data) })
export const wazuhAddAgent          = (data: { name: string; ip: string; group?: string }) =>
  request<{ok:boolean;result:unknown}>('/wazuh/agents', { method: 'POST', body: JSON.stringify(data) })
export const wazuhDeleteAgent       = (id: string) =>
  request<{ok:boolean}>(`/wazuh/agents/${id}`, { method: 'DELETE' })
export const wazuhRestartAgent      = (id: string) =>
  request<{ok:boolean;output:string}>(`/wazuh/agents/${id}/restart`, { method: 'POST' })
export const wazuhActiveResponse    = (agentId: string, command: string) =>
  request<{ok:boolean}>(`/wazuh/active-response/${agentId}`, { method: 'PUT', body: JSON.stringify({ command }) })
export const wazuhCreateRule        = (data: { id: string; level: number; description: string; match: string; group: string }) =>
  request<{ok:boolean;filename:string}>('/wazuh/rules', { method: 'POST', body: JSON.stringify(data) })
export const wazuhCreateGroup       = (name: string) =>
  request<{ok:boolean}>('/wazuh/groups', { method: 'POST', body: JSON.stringify({ name }) })
export const wazuhSaveConfig        = (raw: string, path: string) =>
  request<{ok:boolean;output:string}>('/wazuh/config', { method: 'PUT', body: JSON.stringify({ raw, path }) })
export const wazuhTestAPI           = (data: { url: string; port: number; username: string; password: string }) =>
  request<{ok:boolean;status:number;error?:string}>('/wazuh/api-test', { method: 'POST', body: JSON.stringify(data) })

// ── Suricata ──────────────────────────────────────────────────────────────────

export interface SuricataStatus {
  installed: boolean; running: boolean; version: string
  mode: string; interface: string; rules_loaded: number
  alerts_today: number; total_alerts: number
  packets_total: number; packets_drop: number; bytes_total: number
  flows_active: number; config_path: string; log_path: string
  eve_log_path: string; rules_path: string; socket_path: string
  uptime: number; pid: number
}
export interface SuricataAlert {
  id: string; timestamp: string; src_ip: string; src_port: number
  dest_ip: string; dest_port: number; proto: string
  sig_id: number; signature: string; category: string
  severity: number; sev_label: string; action: string
  rev: number; gid: number; app_proto: string; flow_id: number
  direction: string
}
export interface SuricataRule {
  id: string; enabled: boolean; action: string; proto: string
  src_ip: string; src_port: string; direction: string
  dest_ip: string; dest_port: string; options: string
  sid: string; rev: string; msg: string; classtype: string
  severity: number; tags: string[]; file: string; raw: string
}
export interface SuricataHTTPEvent {
  timestamp: string; src_ip: string; dest_ip: string; dest_port: number
  method: string; hostname: string; url: string; status: number
  length: number; user_agent: string; proto: string
}
export interface SuricataDNSEvent {
  timestamp: string; src_ip: string; dest_ip: string; rrname: string
  rrtype: string; type: string; rcode: string; ttl: number
}
export interface SuricataTLSEvent {
  timestamp: string; src_ip: string; dest_ip: string; dest_port: number
  subject: string; issuer: string; serial: string; version: string
  fingerprint: string; sni: string; notbefore: string; notafter: string
}
export interface SuricataStats {
  date: string; alerts: number; packets: number; drops: number; bytes: number
}
export interface SuricataLogEntry {
  timestamp: string; level: string; message: string
}
export interface SuricataHostbit {
  ip: string; name: string; expire: number; added: string
}

export const fetchSuricataStatus    = () => request<SuricataStatus>('/suricata/status')
export const fetchSuricataAlerts    = (limit = 200) => request<SuricataAlert[]>(`/suricata/alerts?limit=${limit}`)
export const fetchSuricataRules     = () => request<SuricataRule[]>('/suricata/rules')
export const fetchSuricataHTTP      = (limit = 100) => request<SuricataHTTPEvent[]>(`/suricata/http?limit=${limit}`)
export const fetchSuricataDNS       = (limit = 100) => request<SuricataDNSEvent[]>(`/suricata/dns?limit=${limit}`)
export const fetchSuricataTLS       = (limit = 100) => request<SuricataTLSEvent[]>(`/suricata/tls?limit=${limit}`)
export const fetchSuricataLogs      = (limit = 300) => request<SuricataLogEntry[]>(`/suricata/logs?limit=${limit}`)
export const fetchSuricataStats     = () => request<SuricataStats[]>('/suricata/stats')
export const fetchSuricataConfig    = () => request<{raw:string;path:string}>('/suricata/config')
export const fetchSuricataHostbits  = () => request<SuricataHostbit[]>('/suricata/hostbits')

export const suricataService        = (action: string) =>
  request<{ok:boolean;output:string;action:string}>(`/suricata/service/${action}`, { method: 'POST' })
export const suricataReloadRules    = () =>
  request<{ok:boolean;output:string}>('/suricata/reload-rules', { method: 'POST' })
export const suricataUpdateRules    = () =>
  request<{ok:boolean;output:string}>('/suricata/update-rules', { method: 'POST' })
export const suricataInstall        = (data: {mode:string;interface:string}) =>
  request<{ok:boolean;output:string}>('/suricata/install', { method: 'POST', body: JSON.stringify(data) })
export const suricataCreateRule     = (rule: string) =>
  request<{ok:boolean;output:string;error?:string}>('/suricata/rules', { method: 'POST', body: JSON.stringify({ rule }) })
export const suricataToggleRule     = (sid: string, enable: boolean) =>
  request<{ok:boolean}>('/suricata/rules/toggle', { method: 'PUT', body: JSON.stringify({ sid, enable }) })
export const suricataDropIP         = (ip: string, comment?: string) =>
  request<{ok:boolean;output:string}>('/suricata/drop-ip', { method: 'POST', body: JSON.stringify({ ip, comment }) })
export const suricataAddHostbit     = (ip: string, name: string, expire = 3600) =>
  request<{ok:boolean}>('/suricata/hostbits', { method: 'POST', body: JSON.stringify({ ip, name, expire }) })
export const suricataRemoveHostbit  = (ip: string, name: string) =>
  request<{ok:boolean}>('/suricata/hostbits', { method: 'DELETE', body: JSON.stringify({ ip, name }) })
export const suricataSaveConfig     = (raw: string, path: string) =>
  request<{ok:boolean;output:string;error?:string}>('/suricata/config', { method: 'PUT', body: JSON.stringify({ raw, path }) })
export const suricataSocket         = (command: string, args?: unknown) =>
  request<{ok:boolean;result:unknown}>('/suricata/socket', { method: 'POST', body: JSON.stringify({ command, arguments: args }) })

// ── Git Actions ───────────────────────────────────────────────────────────────

export interface GitActionsStatus {
  enabled: boolean
  workflow_count: number
  total_runs: number
  success_runs: number
  failed_runs: number
  running_runs: number
  success_rate: number
  version: string
}

export interface GitWorkflow {
  id: string
  name: string
  description: string
  repo_url: string
  branch: string
  provider: string
  trigger_type: string
  build_command: string
  deploy_command: string
  pre_commands: string
  post_commands: string
  env_vars: string
  timeout_secs: number
  retry_count: number
  notify_on_success: boolean
  notify_on_failure: boolean
  enabled: boolean
  webhook_secret: string
  created_at: number
  last_run_status: string
  last_run_at: number
  total_runs: number
}

export interface GitRun {
  id: string
  workflow_id: string
  workflow_name: string
  status: string
  trigger_type: string
  commit_sha: string
  commit_message: string
  author: string
  branch: string
  started_at: number
  finished_at: number | null
  duration_secs: number
  error_msg: string
}

export interface GitRunLog {
  ts: number
  level: string
  message: string
}

export interface GitSettings {
  github_token: string
  gitlab_token: string
  gitea_token: string
  work_dir: string
  max_concurrent: number
  default_timeout: number
}

export interface GitWebhookInfo {
  base_url: string
  providers: Record<string, { url: string; secret: string }>
}

export const fetchGitActionsStatus  = () => request<GitActionsStatus>('/git-actions/status')
export const fetchGitWorkflows      = () => request<GitWorkflow[]>('/git-actions/workflows')
export const createGitWorkflow      = (wf: Partial<GitWorkflow>) => request<GitWorkflow>('/git-actions/workflows', { method: 'POST', body: JSON.stringify(wf) })
export const updateGitWorkflow      = (id: string, wf: Partial<GitWorkflow>) => request<{ok:boolean}>(`/git-actions/workflows/${id}`, { method: 'PUT', body: JSON.stringify(wf) })
export const deleteGitWorkflow      = (id: string) => request<{ok:boolean}>(`/git-actions/workflows/${id}`, { method: 'DELETE' })
export const triggerGitWorkflow     = (id: string) => request<{run_id:string}>(`/git-actions/trigger/${id}`, { method: 'POST' })
export const fetchGitRuns           = (wf?: string, status?: string) => request<GitRun[]>(`/git-actions/runs${wf ? `?workflow_id=${wf}` : ''}${status ? `${wf ? '&' : '?'}status=${status}` : ''}`)
export const fetchGitRun            = (id: string) => request<GitRun>(`/git-actions/runs/${id}`)
export const fetchGitRunLogs        = (id: string) => request<GitRunLog[]>(`/git-actions/runs/${id}/logs`)
export const cancelGitRun           = (id: string) => request<{ok:boolean}>(`/git-actions/runs/${id}/cancel`, { method: 'POST' })
export const retryGitRun            = (id: string) => request<{run_id:string}>(`/git-actions/runs/${id}/retry`, { method: 'POST' })
export const fetchGitWebhookInfo    = () => request<GitWebhookInfo>('/git-actions/webhooks')
export const updateGitWebhookSecret = (provider: string, secret: string) => request<{ok:boolean}>('/git-actions/webhooks/secret', { method: 'PUT', body: JSON.stringify({ provider, secret }) })
export const fetchGitSettings       = () => request<GitSettings>('/git-actions/settings')
export const updateGitSettings      = (cfg: Partial<GitSettings>) => request<{ok:boolean}>('/git-actions/settings', { method: 'PUT', body: JSON.stringify(cfg) })

// ── Ports Management ──────────────────────────────────────────────────────────

export interface PortEntry {
  port: number
  protocol: string
  state: string
  service_name: string
  process_name: string
  process_pid: number
  bind_address: string
  port_type: string
  risk_level: string
  description: string
}

export interface ConnectionEntry {
  local_addr: string
  local_port: number
  remote_addr: string
  remote_port: number
  state: string
  process_name: string
  process_pid: number
  protocol: string
}

export interface ProcessPort {
  process_name: string
  pid: number
  port_count: number
  ports: number[]
}

export interface PortRule {
  id: string
  port: number
  protocol: string
  action: string
  source: string
  comment: string
  created_at: string
  enabled: boolean
}

export interface PortSummary {
  total_listening: number
  total_tcp: number
  total_udp: number
  total_established: number
  risk_breakdown: Record<string, number>
  top_processes: ProcessPort[]
  ports_by_type: Record<string, number>
  public_ports: number[]
  private_ports: number[]
}

export interface PortRuleInput {
  port: number
  protocol: string
  action: 'allow' | 'block'
  source: string
  comment: string
}

export interface PortScanResult {
  results: { port: number; protocol: string; state: string; service_name: string }[]
  target: string
  scanned_at: string
}

export const fetchPortsSummary    = () => request<PortSummary>('/ports/summary')
export const fetchPortsListening  = () => request<PortEntry[]>('/ports/listening')
export const fetchPortsConnections = () => request<ConnectionEntry[]>('/ports/connections')
export const fetchPortsProcesses  = () => request<ProcessPort[]>('/ports/processes')
export const fetchPortsRules      = () => request<PortRule[]>('/ports/rules')
export const createPortRule       = (inp: PortRuleInput) => request<{ok:boolean; id:string}>('/ports/rules', { method: 'POST', body: JSON.stringify(inp) })
export const deletePortRule       = (id: string) => request<{ok:boolean}>(`/ports/rules/${id}`, { method: 'DELETE' })
export const togglePortRule       = (id: string) => request<{ok:boolean; enabled:boolean}>(`/ports/rules/${id}/toggle`, { method: 'POST' })
export const scanPorts            = (opts: { target: string; port_range: string }) => request<PortScanResult>('/ports/scan', { method: 'POST', body: JSON.stringify(opts) })

// ---- Database Management ----

export interface DBConnection {
  id: number
  name: string
  type: string
  host: string
  port: number
  username: string
  database_name: string
  ssl_mode: string
  extra: string
  status: string
  version: string
  database_count: number
  active_connections: number
  size_bytes: number
  uptime_seconds: number
  created_at: number
  last_connected_at: number | null
}

export interface DBDatabase {
  name: string
  size_bytes: number
  size_human: string
  table_count: number
  encoding: string
  collation: string
  owner: string
}

export interface DBTable {
  name: string
  schema: string
  type: string
  row_count: number
  size_bytes: number
  size_human: string
  has_pk: boolean
}

export interface DBColumn {
  name: string
  data_type: string
  nullable: boolean
  default_value: string
  is_primary: boolean
  is_unique: boolean
  max_length: number | null
  comment: string
}

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  row_count: number
  affected_rows: number
  execution_time_ms: number
  query: string
  error?: string
  type: string
}

export interface QueryHistoryEntry {
  id: number
  connection_id: number
  connection_name: string
  database_name: string
  query: string
  row_count: number
  execution_time_ms: number
  success: boolean
  error: string
  executed_at: number
}

export interface DBStats {
  total_connections: number
  active_connections: number
  total_databases: number
  total_tables: number
  total_size_bytes: number
  queries_executed: number
  queries_success: number
  queries_failed: number
  slow_queries: number
}

export const fetchDBConnections   = () => request<DBConnection[]>('/database/connections')
export const createDBConnection   = (d: Partial<DBConnection> & { password?: string }) => request<{id:number}>('/database/connections', { method: 'POST', body: JSON.stringify(d) })
export const updateDBConnection   = (id: number, d: Partial<DBConnection> & { password?: string }) => request<void>(`/database/connections/${id}`, { method: 'PUT', body: JSON.stringify(d) })
export const deleteDBConnection   = (id: number) => request<void>(`/database/connections/${id}`, { method: 'DELETE' })
export const testDBConnection     = (id: number) => request<{ok:boolean;status:string;version:string;error:string;latency_ms:number}>(`/database/connections/${id}/test`, { method: 'POST' })
export const refreshDBConnection  = (id: number) => request<{ok:boolean}>(`/database/connections/${id}/refresh`, { method: 'POST' })
export const fetchDBDatabases     = (id: number) => request<{databases: DBDatabase[]}>(`/database/connections/${id}/databases`)
export const fetchDBTables        = (id: number, db: string) => request<{tables: DBTable[]}>(`/database/connections/${id}/databases/${encodeURIComponent(db)}/tables`)
export const fetchDBColumns       = (id: number, db: string, table: string) => request<{columns: DBColumn[]}>(`/database/connections/${id}/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}/columns`)
export const fetchDBTableData     = (id: number, db: string, table: string, limit = 100, offset = 0) =>
  request<QueryResult>(`/database/connections/${id}/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}/data?limit=${limit}&offset=${offset}`)
export const executeDBQuery       = (opts: { connection_id: number; database: string; query: string }) =>
  request<QueryResult>('/database/query', { method: 'POST', body: JSON.stringify(opts) })
export const fetchDBQueryHistory  = () => request<QueryHistoryEntry[]>('/database/query/history')
export const deleteDBQueryHistory = (id: string) => request<{ok:boolean}>(`/database/query/history/${id}`, { method: 'DELETE' })
export const fetchDBStats         = () => request<DBStats>('/database/stats')

// ---- Settings — Security / API / Audit Config ----

export interface SecurityConfig {
  allowedIPRanges: string
  blockedIPRanges: string
  bruteForceEnabled: boolean
  bruteForceNotify: boolean
  logFailedLogins: boolean
  autoBanIP: boolean
  minTLSVersion: string
  hstsMaxAge: string
  redirectHTTPS: boolean
  hstsEnabled: boolean
  hstsSubdomains: boolean
  hstsPreload: boolean
  cspHeader: string
  xFrameOptions: boolean
  xContentTypeOptions: boolean
  referrerPolicy: boolean
}

export interface APIConfig {
  rateLimit: number
  burstLimit: number
  corsOrigins: string
  apiEnabled: boolean
  rateLimitEnabled: boolean
  corsEnabled: boolean
  legacyV0: boolean
}

export interface AuditConfig {
  logAuth: boolean
  logConfigChange: boolean
  logServerAction: boolean
  logCmdExec: boolean
  logAPIAccess: boolean
  logExports: boolean
  retentionDays: number
  maxSizeMB: number
  logLevel: string
  forwardSyslog: boolean
  immutableLog: boolean
  hashChain: boolean
  forwardRemote: boolean
}

export const fetchSettingsSecurityConfig = () => request<SecurityConfig>('/settings/security-config')
export const saveSettingsSecurityConfig  = (d: SecurityConfig) => request<void>('/settings/security-config', { method: 'PUT', body: JSON.stringify(d) })
export const fetchSettingsAPIConfig      = () => request<APIConfig>('/settings/api-config')
export const saveSettingsAPIConfig       = (d: APIConfig) => request<void>('/settings/api-config', { method: 'PUT', body: JSON.stringify(d) })
export const fetchSettingsAuditConfig    = () => request<AuditConfig>('/settings/audit-config')
export const saveSettingsAuditConfig     = (d: AuditConfig) => request<void>('/settings/audit-config', { method: 'PUT', body: JSON.stringify(d) })

// ---- Settings: Notification Test ----

export function testSettingsNotification(channel: 'email' | 'slack' | 'webhook') {
  return request<{ ok: boolean }>('/settings/notif-test', {
    method: 'POST',
    body: JSON.stringify({ channel }),
  })
}

// ---- Settings: List All Releases ----

export interface ReleaseInfo {
  tag_name: string
  name: string
  html_url: string
  body: string
  published_at: string
  is_current: boolean
  is_latest: boolean
  prerelease: boolean
}

export function fetchSettingsReleases() {
  return request<ReleaseInfo[]>('/settings/releases')
}

// ---- Settings: Check Updates ----

export interface UpdateCheckResult {
  current_version: string
  latest_version: string
  release_name: string
  up_to_date: boolean
  release_url: string
  release_notes: string
  release_date: string
  checked_at: number
}

export function checkSettingsUpdates() {
  return request<UpdateCheckResult>('/settings/check-updates')
}

// ---- Settings: Backup File Actions ----

export function deleteSettingsBackupFile(id: string) {
  return request<{ ok: boolean }>(`/settings/backup-files/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function restoreSettingsBackupFile(id: string, opts: { components: string[]; conflict: string }) {
  return request<{ ok: boolean; message: string }>(`/settings/backup-files/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
    body: JSON.stringify(opts),
  })
}

export function downloadSettingsBackupFileURL(id: string) {
  return `/api/settings/backup-files/${encodeURIComponent(id)}/download`
}

// ---- Database: Saved Queries ----

export interface SavedQuery {
  id: number
  name: string
  description: string
  query: string
  connection_id: number
  database_name: string
  created_at: number
  updated_at: number
}

export function fetchDBSavedQueries() {
  return request<SavedQuery[]>('/database/saved-queries')
}

export function createDBSavedQuery(d: Omit<SavedQuery, 'id' | 'created_at' | 'updated_at'>) {
  return request<{ id: number }>('/database/saved-queries', { method: 'POST', body: JSON.stringify(d) })
}

export function updateDBSavedQuery(id: number, d: Partial<Omit<SavedQuery, 'id' | 'created_at' | 'updated_at'>>) {
  return request<{ ok: boolean }>(`/database/saved-queries/${id}`, { method: 'PUT', body: JSON.stringify(d) })
}

export function deleteDBSavedQuery(id: number) {
  return request<{ ok: boolean }>(`/database/saved-queries/${id}`, { method: 'DELETE' })
}

// ---- Database: Table Indexes ----

export interface DBIndex {
  name: string
  columns: string[]
  unique: boolean
  primary: boolean
  type: string
}

export function fetchDBTableIndexes(connId: number, db: string, table: string) {
  return request<{ indexes: DBIndex[] }>(
    `/database/connections/${connId}/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}/indexes`,
  )
}
