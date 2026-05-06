import type { Service } from '@/lib/api'

// ── Icon components as strings for rendering ──────────────
// Stored as factory functions — import and call as JSX in the page
export type IconComp = () => JSX.Element

export interface ProcessEntry { pid: number; name: string; cpu: number; mem: number; indent: number }
export interface LogLine       { time: string; pri: number; msg: string }
export interface Deps          { requires: string[]; wants: string[]; after: string[]; before: string[]; conflicts: string[]; bindsTo: string[] }
export interface SecSetting    { key: string; val: string; pass: boolean; warn: boolean }

export interface ExtService {
  pid?:            number
  substate:        string
  loadState:       string
  enabled:         'enabled' | 'disabled' | 'static' | 'generated' | 'masked'
  restarts?:       number
  restartLimit?:   number
  uptimeSecs?:     number
  unitPath?:       string
  execStart?:      string
  user?:           string
  workingDir?:     string
  restartPolicy?:  string
  cpuTime?:        string
  tasks?:          number
  envFile?:        string
  socketUnit?:     string
  processTree?:    ProcessEntry[]
  logLines?:       LogLine[]
  deps?:           Deps
  securityScore?:  number
  securitySettings?: SecSetting[]
  unitFile?:       string
  IconComponent:   IconComp
  accentColor:     string
}

// ── Demo services (when API is offline) ───────────────────
export const DEMO_SERVICES: Service[] = [
  { name: 'nginx',         description: 'A high performance web server and reverse proxy', status: 'active',   cpu_pct: 0.2,  mem_bytes: 44_040_192  },
  { name: 'postgresql',    description: 'PostgreSQL 15 relational database server',        status: 'active',   cpu_pct: 1.1,  mem_bytes: 88_080_384  },
  { name: 'redis',         description: 'Redis in-memory data structure store',            status: 'active',   cpu_pct: 0.4,  mem_bytes:  8_388_608  },
  { name: 'node-api',      description: 'Node.js application API server (port 3000)',      status: 'active',   cpu_pct: 3.2,  mem_bytes: 125_829_120 },
  { name: 'mysql',         description: 'MySQL 8 community database server',               status: 'active',   cpu_pct: 0.8,  mem_bytes: 62_914_560  },
  { name: 'docker',        description: 'Docker application container engine',             status: 'active',   cpu_pct: 2.5,  mem_bytes: 47_185_920  },
  { name: 'sshd',          description: 'OpenSSH server daemon',                           status: 'active',   cpu_pct: 0.0,  mem_bytes:  3_145_728  },
  { name: 'fail2ban',      description: 'Ban hosts causing multiple auth errors',          status: 'failed',   cpu_pct: 0.0,  mem_bytes:          0  },
  { name: 'cron',          description: 'Regular background program processing daemon',    status: 'active',   cpu_pct: 0.0,  mem_bytes:  1_048_576  },
  { name: 'php8.2-fpm',    description: 'PHP 8.2 FastCGI Process Manager',                status: 'active',   cpu_pct: 0.5,  mem_bytes: 29_360_128  },
  { name: 'containerd',    description: 'Container runtime used by Docker',               status: 'active',   cpu_pct: 1.8,  mem_bytes: 36_700_160  },
  { name: 'ufw',           description: 'Uncomplicated Firewall service',                 status: 'active',   cpu_pct: 0.0,  mem_bytes:    524_288  },
  { name: 'python-worker', description: 'Celery async task worker (production)',          status: 'inactive', cpu_pct: 0.0,  mem_bytes:          0  },
  { name: 'logrotate',     description: 'Log file rotation and compression utility',      status: 'inactive', cpu_pct: 0.0,  mem_bytes:          0  },
  { name: 'rsyslog',       description: 'System logging service (syslog)',                status: 'active',   cpu_pct: 0.1,  mem_bytes:  2_097_152  },
  { name: 'atd',           description: 'Deferred execution scheduler',                  status: 'active',   cpu_pct: 0.0,  mem_bytes:    786_432  },
]

const COMMON_DEPS: Deps = {
  requires:  ['basic.target', 'network.target'],
  wants:     ['multi-user.target'],
  after:     ['network.target', 'nss-lookup.target', 'syslog.target'],
  before:    [],
  conflicts: ['shutdown.target'],
  bindsTo:   [],
}

const NGINX_UNIT = `# /lib/systemd/system/nginx.service
[Unit]
Description=A high performance web server and reverse proxy server
Documentation=man:nginx(8)
After=network.target nss-lookup.target

[Service]
Type=forking
PIDFile=/run/nginx.pid
ExecStartPre=/usr/sbin/nginx -t -q -g 'daemon on; master_process on;'
ExecStart=/usr/sbin/nginx -g 'daemon on; master_process on;'
ExecReload=/bin/kill -s HUP $MAINPID
ExecStop=/bin/kill -s QUIT $MAINPID
PrivateTmp=yes
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target`

const PG_UNIT = `# /lib/systemd/system/postgresql.service
[Unit]
Description=PostgreSQL RDBMS
After=network.target

[Service]
Type=forking
User=postgres
Group=postgres
Environment=PGDATA=/var/lib/postgresql/15/main
ExecStart=/usr/lib/postgresql/15/bin/pg_ctl start -D \${PGDATA}
ExecStop=/usr/lib/postgresql/15/bin/pg_ctl stop -D \${PGDATA}
ExecReload=/usr/lib/postgresql/15/bin/pg_ctl reload -D \${PGDATA}
TimeoutStartSec=270
TimeoutStopSec=270
Restart=on-failure
PrivateTmp=true
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target`

const REDIS_UNIT = `# /lib/systemd/system/redis.service
[Unit]
Description=Advanced key-value store
After=network.target
Documentation=http://redis.io/documentation

[Service]
Type=notify
ExecStart=/usr/bin/redis-server /etc/redis/redis.conf --supervised systemd
ExecStop=/bin/kill -s TERM \$MAINPID
TimeoutStartSec=100
TimeoutStopSec=100
Restart=on-failure
RestartSec=3
User=redis
Group=redis
RuntimeDirectory=redis
RuntimeDirectoryMode=2755
PrivateTmp=true
PrivateDevices=yes
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes

[Install]
WantedBy=multi-user.target`

const genericUnit = (name: string, desc: string, exec: string) => `# /lib/systemd/system/${name}.service
[Unit]
Description=${desc}
After=network.target

[Service]
Type=simple
ExecStart=${exec}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target`

function nginxIcon(): JSX.Element {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="16,3 28,10 28,22 16,29 4,22 4,10"/><path d="M10 22V11l12 11V11" strokeWidth="2"/></svg>
}
function pgIcon(): JSX.Element {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 9c1.8.6 3.5 2.2 3.5 5s-1.7 4.4-3.5 5"/><ellipse cx="13" cy="11" rx="8" ry="9"/><path d="M13 20v7"/><path d="M10 27h6"/><circle cx="10.5" cy="7.5" r="1.4" fill="currentColor" stroke="none"/></svg>
}
function redisIcon(): JSX.Element {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="16" cy="23" rx="10" ry="4"/><path d="M6 23v-5.5"/><path d="M26 23v-5.5"/><ellipse cx="16" cy="17.5" rx="10" ry="4"/><path d="M6 17.5V12"/><path d="M26 17.5V12"/><ellipse cx="16" cy="12" rx="10" ry="4"/><path d="M10 9l6-3 6 3" strokeWidth="1.5"/></svg>
}
function nodeIcon(): JSX.Element {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3L4 10v14l12 7 12-7V10z"/><path d="M11 13v6l5 3 5-3v-6" strokeWidth="1.6"/><line x1="11" y1="16" x2="16" y2="16" strokeWidth="1.6"/></svg>
}
function mysqlIcon(): JSX.Element {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="16" cy="8" rx="9" ry="3.5"/><path d="M7 8v8c0 1.93 4.03 3.5 9 3.5s9-1.57 9-3.5V8"/><path d="M7 16v5c0 1.93 4.03 3.5 9 3.5s9-1.57 9-3.5v-5"/><path d="M22 21l3 3-3 3" strokeWidth="1.6"/></svg>
}
function dockerIcon(): JSX.Element {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="13" width="6" height="6" rx="1"/><rect x="9" y="13" width="6" height="6" rx="1"/><rect x="16" y="13" width="6" height="6" rx="1"/><rect x="9" y="6" width="6" height="6" rx="1"/><rect x="16" y="6" width="6" height="6" rx="1"/><path d="M24 15.5c1.5-.5 4-.3 5 1.5.5 1 .3 2.5-1.5 4H4c-3-1.5-2.5-4-1-5 .8-.6 1.8-.6 1.8-.6"/><path d="M24 15.5c.2-2 1.5-2.5 2.8-1.5"/></svg>
}
function sshdIcon(): JSX.Element {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="16" width="22" height="13" rx="2"/><path d="M11 16V11a5 5 0 0 1 10 0v5"/><circle cx="16" cy="23" r="1.8" fill="currentColor" stroke="none"/></svg>
}
function genericIcon(): JSX.Element {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="16" cy="16" r="4.5"/><path d="M16 4v4M16 24v4M4 16h4M24 16h4M7.5 7.5l2.8 2.8M21.7 21.7l2.8 2.8M7.5 24.5l2.8-2.8M21.7 10.3l2.8-2.8"/></svg>
}
function phpIcon(): JSX.Element {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="16" cy="16" rx="13" ry="8"/><path d="M8 21c0-3 1-7 2.5-8M24 11c0 3-1 7-2.5 8"/><circle cx="16" cy="16" r="2.5" fill="currentColor" stroke="none"/></svg>
}
function pythonIcon(): JSX.Element {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4h7a5 5 0 0 1 5 5v5H13a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2z"/><path d="M20 28h-7a5 5 0 0 1-5-5v-5h11a3 3 0 0 1 3 3v5a2 2 0 0 1-2 2z"/><line x1="16" y1="14" x2="16" y2="18"/><circle cx="14" cy="8" r="1.5" fill="currentColor" stroke="none"/><circle cx="18" cy="24" r="1.5" fill="currentColor" stroke="none"/></svg>
}
function syslogIcon(): JSX.Element {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="24" height="24" rx="3"/><line x1="10" y1="12" x2="22" y2="12"/><line x1="10" y1="17" x2="22" y2="17"/><line x1="10" y1="22" x2="16" y2="22"/></svg>
}
function cronIcon(): JSX.Element {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="16" cy="16" r="12"/><polyline points="16,8 16,16 21,19"/></svg>
}
function firewallIcon(): JSX.Element {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3L5 8v8c0 7 5 11 11 13 6-2 11-6 11-13V8z"/><path d="M11 16l3.5 3.5L21 12.5"/></svg>
}

function serviceIcon(name: string): IconComp {
  const n = name.toLowerCase()
  if (n.includes('nginx') || n.includes('apache') || n.includes('caddy')) return nginxIcon
  if (n.includes('postgres')) return pgIcon
  if (n.includes('redis'))    return redisIcon
  if (n.includes('node'))     return nodeIcon
  if (n.includes('mysql') || n.includes('mariadb')) return mysqlIcon
  if (n.includes('docker'))   return dockerIcon
  if (n.includes('ssh'))      return sshdIcon
  if (n.includes('php'))      return phpIcon
  if (n.includes('python') || n.includes('celery') || n.includes('worker')) return pythonIcon
  if (n.includes('rsyslog') || n.includes('syslog')) return syslogIcon
  if (n.includes('cron') || n.includes('atd')) return cronIcon
  if (n.includes('ufw') || n.includes('firewall') || n.includes('fail2ban')) return firewallIcon
  if (n.includes('contain')) return dockerIcon
  return genericIcon
}

function serviceColor(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('nginx') || n.includes('apache'))  return '#22c55e'
  if (n.includes('postgres'))                        return '#63b3ed'
  if (n.includes('redis'))                           return '#fc8181'
  if (n.includes('node'))                            return '#68d391'
  if (n.includes('mysql') || n.includes('mariadb'))  return '#f6ad55'
  if (n.includes('docker') || n.includes('contain')) return '#60a5fa'
  if (n.includes('ssh'))                             return '#a78bfa'
  if (n.includes('php'))                             return '#818cf8'
  if (n.includes('python') || n.includes('celery'))  return '#fde68a'
  if (n.includes('ufw') || n.includes('fail2ban'))   return '#f87171'
  return '#9ca3af'
}

function makeLogLines(name: string, status: string): LogLine[] {
  const now = new Date()
  const ts = (offsetMin: number) => {
    const d = new Date(now.getTime() - offsetMin * 60000)
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`
  }
  if (status === 'failed') return [
    { time: ts(5),  pri: 6, msg: `Started ${name}.service.` },
    { time: ts(4),  pri: 6, msg: `[${name}] Loading configuration…` },
    { time: ts(4),  pri: 4, msg: `[${name}] Warning: deprecated option 'MaxRetry' in config` },
    { time: ts(3),  pri: 3, msg: `[${name}] ERROR: Failed to bind to address — port already in use` },
    { time: ts(3),  pri: 0, msg: `${name}.service: Main process exited, code=exited, status=1/FAILURE` },
    { time: ts(3),  pri: 0, msg: `${name}.service: Failed with result 'exit-code'.` },
    { time: ts(2),  pri: 3, msg: `Failed to start ${name}.service — See 'journalctl -xe' for details.` },
  ]
  return [
    { time: ts(60), pri: 6, msg: `Started ${name}.service.` },
    { time: ts(58), pri: 6, msg: `[${name}] Loaded configuration from /etc/${name}/${name}.conf` },
    { time: ts(55), pri: 6, msg: `[${name}] Listening on port ready` },
    { time: ts(40), pri: 6, msg: `[${name}] Worker processes: 4 spawned` },
    { time: ts(30), pri: 6, msg: `[${name}] Health check passed (200 OK, 3ms)` },
    { time: ts(20), pri: 4, msg: `[${name}] High connection count: 1024 active connections` },
    { time: ts(10), pri: 6, msg: `[${name}] Completed graceful reload (0 connections dropped)` },
    { time: ts(5),  pri: 6, msg: `[${name}] Health check passed (200 OK, 2ms)` },
    { time: ts(1),  pri: 6, msg: `[${name}] Request processed: GET /health 200 1ms` },
    { time: ts(0),  pri: 6, msg: `[${name}] Keepalive timeout 65s — connection closed` },
  ]
}

function makeSecSettings(score: number): SecSetting[] {
  return [
    { key: 'PrivateTmp',        val: score>=6?'yes':'no',    pass: score>=6, warn: false },
    { key: 'NoNewPrivileges',   val: score>=5?'yes':'no',    pass: score>=5, warn: false },
    { key: 'ProtectSystem',     val: score>=7?'strict':'no', pass: score>=7, warn: score>=4 },
    { key: 'ProtectHome',       val: score>=6?'yes':'no',    pass: score>=6, warn: false },
    { key: 'RestrictSUIDSGID',  val: score>=7?'yes':'no',    pass: score>=7, warn: false },
    { key: 'PrivateDevices',    val: score>=6?'yes':'no',    pass: score>=6, warn: false },
    { key: 'CapabilityBounding',val: score>=8?'~CAP_NET_RAW':'(none)', pass: score>=8, warn: false },
    { key: 'SystemCallFilter',  val: score>=8?'@system-service':'(none)', pass: score>=8, warn: false },
    { key: 'User',              val: score>=5?'(non-root)':'root', pass: score>=5, warn: score>=3 },
    { key: 'MemoryDenyWXP…',   val: score>=7?'yes':'no',    pass: score>=7, warn: false },
  ]
}

// Build extended data keyed by service name
const EXT_DATA_MAP: Record<string, Partial<ExtService>> = {
  nginx: {
    pid: 1234, substate: 'running', loadState: 'loaded', enabled: 'enabled',
    restarts: 0, restartLimit: 5, uptimeSecs: 259200, cpuTime: '18.4s', tasks: 5,
    unitPath: '/lib/systemd/system/nginx.service',
    execStart: '/usr/sbin/nginx -g "daemon on; master_process on;"',
    user: 'www-data', workingDir: '/', restartPolicy: 'on-failure',
    processTree: [
      { pid: 1234, name: 'nginx: master', cpu: 0.0, mem: 4_194_304,  indent: 0 },
      { pid: 1235, name: 'nginx: worker', cpu: 0.1, mem: 20_971_520, indent: 1 },
      { pid: 1236, name: 'nginx: worker', cpu: 0.1, mem: 19_922_944, indent: 1 },
      { pid: 1237, name: 'nginx: worker', cpu: 0.0, mem: 18_874_368, indent: 1 },
    ],
    deps: { ...COMMON_DEPS, before: ['php8.2-fpm.service'], requires: ['network.target'], bindsTo: [] },
    securityScore: 8,
    unitFile: NGINX_UNIT,
  },
  postgresql: {
    pid: 1456, substate: 'running', loadState: 'loaded', enabled: 'enabled',
    restarts: 0, restartLimit: 5, uptimeSecs: 432000, cpuTime: '1m 42s', tasks: 12,
    unitPath: '/lib/systemd/system/postgresql.service',
    execStart: '/usr/lib/postgresql/15/bin/postgres -D /var/lib/postgresql/15/main',
    user: 'postgres', workingDir: '/var/lib/postgresql', restartPolicy: 'on-failure',
    envFile: '/etc/postgresql/15/main/environment',
    processTree: [
      { pid: 1456, name: 'postgres: postmaster', cpu: 0.0, mem: 8_388_608,  indent: 0 },
      { pid: 1490, name: 'postgres: checkpointer', cpu: 0.0, mem: 4_194_304, indent: 1 },
      { pid: 1491, name: 'postgres: background writer', cpu: 0.0, mem: 4_194_304, indent: 1 },
      { pid: 1492, name: 'postgres: walwriter', cpu: 0.1, mem: 4_194_304, indent: 1 },
      { pid: 1501, name: 'postgres: autovacuum launcher', cpu: 0.0, mem: 4_194_304, indent: 1 },
    ],
    deps: { requires: ['network.target'], wants: ['multi-user.target'], after: ['network.target', 'syslog.target'], before: [], conflicts: ['shutdown.target'], bindsTo: [] },
    securityScore: 7,
    unitFile: PG_UNIT,
  },
  redis: {
    pid: 789, substate: 'running', loadState: 'loaded', enabled: 'enabled',
    restarts: 0, restartLimit: 5, uptimeSecs: 432000, cpuTime: '5.2s', tasks: 4,
    unitPath: '/lib/systemd/system/redis.service',
    execStart: '/usr/bin/redis-server /etc/redis/redis.conf',
    user: 'redis', workingDir: '/', restartPolicy: 'on-failure',
    processTree: [
      { pid: 789, name: 'redis-server *:6379', cpu: 0.4, mem: 8_388_608, indent: 0 },
    ],
    deps: { ...COMMON_DEPS, before: ['node-api.service'], bindsTo: [] },
    securityScore: 9,
    unitFile: REDIS_UNIT,
  },
  'node-api': {
    pid: 2345, substate: 'running', loadState: 'loaded', enabled: 'enabled',
    restarts: 1, restartLimit: 5, uptimeSecs: 86400, cpuTime: '4m 12s', tasks: 8,
    execStart: '/usr/bin/node /srv/app/server.js',
    user: 'appuser', workingDir: '/srv/app', restartPolicy: 'always',
    envFile: '/etc/node-api/production.env',
    processTree: [
      { pid: 2345, name: 'node /srv/app/server.js', cpu: 3.2, mem: 125_829_120, indent: 0 },
    ],
    deps: { requires: ['network.target', 'redis.service', 'postgresql.service'], wants: ['multi-user.target'], after: ['network.target', 'redis.service', 'postgresql.service'], before: [], conflicts: ['shutdown.target'], bindsTo: [] },
    securityScore: 4,
  },
  fail2ban: {
    pid: undefined, substate: 'failed', loadState: 'loaded', enabled: 'enabled',
    restarts: 3, restartLimit: 5, uptimeSecs: undefined, cpuTime: '—', tasks: 0,
    execStart: '/usr/bin/python3 /usr/bin/fail2ban-server -xf start',
    user: 'root', workingDir: '/', restartPolicy: 'on-failure',
    securityScore: 3,
  },
}

export function getExtService(svc: Service): ExtService {
  const base = EXT_DATA_MAP[svc.name] ?? {}
  const score = base.securityScore ?? 5
  return {
    pid:            base.pid,
    substate:       base.substate  ?? (svc.status === 'active' ? 'running' : svc.status === 'failed' ? 'failed' : 'dead'),
    loadState:      base.loadState ?? 'loaded',
    enabled:        base.enabled   ?? 'enabled',
    restarts:       base.restarts  ?? 0,
    restartLimit:   base.restartLimit ?? 5,
    uptimeSecs:     base.uptimeSecs,
    cpuTime:        base.cpuTime,
    tasks:          base.tasks,
    unitPath:       base.unitPath  ?? `/lib/systemd/system/${svc.name}.service`,
    execStart:      base.execStart ?? `(binary) --config /etc/${svc.name}.conf`,
    user:           base.user      ?? 'root',
    workingDir:     base.workingDir ?? '/',
    restartPolicy:  base.restartPolicy ?? 'on-failure',
    envFile:        base.envFile,
    socketUnit:     base.socketUnit,
    processTree:    base.processTree,
    logLines:       makeLogLines(svc.name, svc.status),
    deps:           base.deps      ?? COMMON_DEPS,
    securityScore:  score,
    securitySettings: makeSecSettings(score),
    unitFile:       base.unitFile  ?? genericUnit(svc.name, svc.description, base.execStart ?? `/usr/bin/${svc.name}`),
    IconComponent:  serviceIcon(svc.name),
    accentColor:    serviceColor(svc.name),
  }
}
