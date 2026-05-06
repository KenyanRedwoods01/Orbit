export type ServerStatus = 'connected' | 'disconnected' | 'error' | 'maintenance' | 'unknown'
export type ServerRole = 'web' | 'database' | 'cache' | 'worker' | 'loadbalancer' | 'backup' | 'monitoring'
export type ServerEnvironment = 'production' | 'staging' | 'development' | 'testing'
export type ServerRegion = 'us-east-1' | 'us-west-1' | 'eu-west-1' | 'ap-southeast-1'

export interface ServerMetrics {
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

export interface ServerAlert {
  id: number
  server_id?: number
  severity: 'critical' | 'warning' | 'resolved'
  message: string
  resolved?: boolean
  ts?: number
  time: string
}

export interface ServerService {
  name: string
  status: 'active' | 'inactive' | 'failed'
}

export interface ServerGroup {
  id?: number
  name: string
  color: string
  servers: string[]
}

export interface ServerRecord {
  id: number
  name: string
  host: string
  user: string
  key_file: string
  port: number
  auth_method?: string
  jump_host?: string
  status: ServerStatus
  latency_ms?: number
  role: ServerRole
  environment: ServerEnvironment
  region: ServerRegion
  os: string
  kernel: string
  uptime: string
  tags: string[]
  description: string
  metrics?: ServerMetrics
  alerts: ServerAlert[]
  services: ServerService[]
  last_backup?: string
  backup_size?: string
  last_seen?: string
  order: number
  created_at?: number
}
