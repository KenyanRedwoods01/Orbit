export type ContainerState = 'running' | 'exited' | 'paused' | 'restarting'
export type HealthStatus = 'healthy' | 'unhealthy' | 'starting' | 'none'

export interface PortMapping {
  hostIp: string
  hostPort: string
  containerPort: string
  protocol: 'tcp' | 'udp'
}

export interface ContainerMount {
  type: 'bind' | 'volume' | 'tmpfs'
  host: string
  container: string
  mode: 'rw' | 'ro'
}

export interface ContainerEnv {
  key: string
  value: string
  secret: boolean
}

export interface ContainerEvent {
  id: number
  ts: number
  type: 'start' | 'stop' | 'restart' | 'kill' | 'exec' | 'health' | 'attach' | 'die'
  message: string
}

export interface ContainerProcess {
  pid: number
  user: string
  cpu: string
  mem: string
  command: string
}

export interface ContainerMock {
  id: string
  name: string
  image: string
  imageId: string
  state: ContainerState
  status: string
  health: HealthStatus
  cpu_pct: number
  mem_bytes: number
  mem_limit: number
  net_rx_bps: number
  net_tx_bps: number
  disk_read_bps: number
  disk_write_bps: number
  pids: number
  pid_limit: number
  ports: PortMapping[]
  network: string
  ip: string
  uptime: string
  created: number
  restartPolicy: string
  restartCount: number
  env: ContainerEnv[]
  mounts: ContainerMount[]
  labels: Record<string, string>
  command: string
  entrypoint: string
  hostname: string
  logs: string[]
  events: ContainerEvent[]
  processes: ContainerProcess[]
}

export interface DockerImage {
  id: string
  repository: string
  tag: string
  size: string
  sizeBytes: number
  created: string
  inUse: boolean
}

export interface DockerVolume {
  name: string
  driver: string
  mountpoint: string
  size: string
  usedBy: string[]
  created: string
}

export interface DockerNetwork {
  id: string
  name: string
  driver: string
  subnet: string
  gateway: string
  containers: number
  created: string
  internal: boolean
}

// ── Mock Containers ────────────────────────────────────────────────
export const MOCK_CONTAINERS: ContainerMock[] = [
  {
    id: 'a3f2b1d4c5e6',
    name: 'nginx-prod',
    image: 'nginx:alpine',
    imageId: 'sha256:4f1d2c3e',
    state: 'running',
    status: 'Up 3 days',
    health: 'healthy',
    cpu_pct: 0.2,
    mem_bytes: 134217728,
    mem_limit: 536870912,
    net_rx_bps: 46080,
    net_tx_bps: 122880,
    disk_read_bps: 2457600,
    disk_write_bps: 1126400,
    pids: 4,
    pid_limit: 100,
    ports: [
      { hostIp: '0.0.0.0', hostPort: '80', containerPort: '80', protocol: 'tcp' },
      { hostIp: '0.0.0.0', hostPort: '443', containerPort: '443', protocol: 'tcp' },
    ],
    network: 'bridge',
    ip: '172.17.0.2',
    uptime: '3 days',
    created: Date.now() - 259200000,
    restartPolicy: 'unless-stopped',
    restartCount: 0,
    env: [
      { key: 'NGINX_HOST', value: 'example.com', secret: false },
      { key: 'NGINX_PORT', value: '80', secret: false },
    ],
    mounts: [
      { type: 'bind', host: '/var/www/html', container: '/usr/share/nginx/html', mode: 'rw' },
      { type: 'bind', host: '/etc/nginx/conf.d', container: '/etc/nginx/conf.d', mode: 'ro' },
    ],
    labels: { 'com.example.environment': 'production', 'com.example.version': '1.24.0' },
    command: 'nginx -g daemon off;',
    entrypoint: '/docker-entrypoint.sh',
    hostname: 'nginx-prod',
    logs: [
      '172.17.0.1 - - [03/May/2026:14:32:15 +0000] "GET / HTTP/1.1" 200 612',
      '172.17.0.1 - - [03/May/2026:14:32:16 +0000] "GET /styles.css HTTP/1.1" 200 2345',
      '203.0.113.45 - - [03/May/2026:14:32:17 +0000] "GET /admin HTTP/1.1" 404 169',
      '[error] 12346#12346: *1 connect() failed (111: Connection refused)',
      '172.17.0.1 - - [03/May/2026:14:32:19 +0000] "POST /api/login HTTP/1.1" 200 845',
      '[warn] 12346#12346: *1 upstream server temporarily disabled',
      '192.168.1.100 - - [03/May/2026:14:32:21 +0000] "GET /images/logo.png HTTP/1.1" 200 45678',
      '172.17.0.1 - - [03/May/2026:14:32:22 +0000] "GET /api/health HTTP/1.1" 200 24',
    ],
    events: [
      { id: 1, ts: Date.now() - 259200000, type: 'start', message: 'Container started' },
      { id: 2, ts: Date.now() - 259190000, type: 'health', message: 'Health check succeeded' },
      { id: 3, ts: Date.now() - 172800000, type: 'exec', message: 'Exec: admin ran nginx -t' },
      { id: 4, ts: Date.now() - 86400000, type: 'attach', message: 'Attach: admin connected to logs' },
    ],
    processes: [
      { pid: 12345, user: 'root', cpu: '0.1', mem: '2.1', command: 'nginx: master process' },
      { pid: 12346, user: 'nginx', cpu: '0.05', mem: '1.8', command: 'nginx: worker process' },
      { pid: 12347, user: 'nginx', cpu: '0.05', mem: '1.8', command: 'nginx: worker process' },
    ],
  },
  {
    id: 'b5c4e3d2f1a0',
    name: 'postgres-db',
    image: 'postgres:15',
    imageId: 'sha256:b4c5d6e7',
    state: 'running',
    status: 'Up 2 weeks',
    health: 'healthy',
    cpu_pct: 1.5,
    mem_bytes: 536870912,
    mem_limit: 2147483648,
    net_rx_bps: 20480,
    net_tx_bps: 81920,
    disk_read_bps: 512000,
    disk_write_bps: 1024000,
    pids: 12,
    pid_limit: 200,
    ports: [
      { hostIp: '127.0.0.1', hostPort: '5432', containerPort: '5432', protocol: 'tcp' },
    ],
    network: 'webapp_network',
    ip: '10.0.1.2',
    uptime: '2 weeks',
    created: Date.now() - 1209600000,
    restartPolicy: 'always',
    restartCount: 0,
    env: [
      { key: 'POSTGRES_DB', value: 'appdb', secret: false },
      { key: 'POSTGRES_USER', value: 'admin', secret: false },
      { key: 'POSTGRES_PASSWORD', value: '••••••••', secret: true },
    ],
    mounts: [
      { type: 'volume', host: 'postgres-data', container: '/var/lib/postgresql/data', mode: 'rw' },
    ],
    labels: { 'com.example.environment': 'production', 'com.example.service': 'database' },
    command: 'postgres',
    entrypoint: 'docker-entrypoint.sh',
    hostname: 'postgres-db',
    logs: [
      '2026-05-03 14:30:00.123 UTC [1] LOG:  database system is ready to accept connections',
      '2026-05-03 14:30:05.456 UTC [24] LOG:  checkpoint complete: wrote 142 buffers',
      '2026-05-03 14:30:10.789 UTC [1] LOG:  autovacuum: processing database "appdb"',
      '2026-05-03 14:31:00.321 UTC [25] LOG:  connection received: host=10.0.1.3 port=54312',
      '2026-05-03 14:31:00.400 UTC [25] LOG:  connection authorized: user=admin database=appdb',
    ],
    events: [
      { id: 1, ts: Date.now() - 1209600000, type: 'start', message: 'Container started' },
      { id: 2, ts: Date.now() - 1209590000, type: 'health', message: 'Health check succeeded' },
    ],
    processes: [
      { pid: 23456, user: 'postgres', cpu: '0.8', mem: '12.4', command: 'postgres: main' },
      { pid: 23457, user: 'postgres', cpu: '0.3', mem: '3.2', command: 'postgres: checkpointer' },
      { pid: 23458, user: 'postgres', cpu: '0.2', mem: '2.8', command: 'postgres: background writer' },
      { pid: 23459, user: 'postgres', cpu: '0.1', mem: '2.1', command: 'postgres: walwriter' },
    ],
  },
  {
    id: 'c6d5f4e3a2b1',
    name: 'redis-cache',
    image: 'redis:7-alpine',
    imageId: 'sha256:c5d6e7f8',
    state: 'running',
    status: 'Up 4 hours (unhealthy)',
    health: 'unhealthy',
    cpu_pct: 0.8,
    mem_bytes: 47185920,
    mem_limit: 134217728,
    net_rx_bps: 10240,
    net_tx_bps: 20480,
    disk_read_bps: 0,
    disk_write_bps: 204800,
    pids: 3,
    pid_limit: 50,
    ports: [
      { hostIp: '127.0.0.1', hostPort: '6379', containerPort: '6379', protocol: 'tcp' },
    ],
    network: 'webapp_network',
    ip: '10.0.1.3',
    uptime: '4 hours',
    created: Date.now() - 14400000,
    restartPolicy: 'unless-stopped',
    restartCount: 2,
    env: [
      { key: 'REDIS_PASSWORD', value: '••••••••', secret: true },
      { key: 'REDIS_MAX_MEMORY', value: '128mb', secret: false },
    ],
    mounts: [
      { type: 'volume', host: 'redis-data', container: '/data', mode: 'rw' },
    ],
    labels: { 'com.example.environment': 'production', 'com.example.service': 'cache' },
    command: 'redis-server --requirepass $REDIS_PASSWORD',
    entrypoint: 'docker-entrypoint.sh',
    hostname: 'redis-cache',
    logs: [
      '1:M 03 May 2026 14:28:00.123 * Ready to accept connections',
      '1:M 03 May 2026 14:28:05.456 # Could not connect to Redis at 127.0.0.1:6379: Connection refused',
      '1:M 03 May 2026 14:28:10.789 # PING failed',
      '1:M 03 May 2026 14:28:15.321 * PONG',
      '1:M 03 May 2026 14:29:00.654 # Health check failed',
    ],
    events: [
      { id: 1, ts: Date.now() - 14400000, type: 'start', message: 'Container started' },
      { id: 2, ts: Date.now() - 14390000, type: 'health', message: 'Health check failed: PING failed' },
      { id: 3, ts: Date.now() - 7200000, type: 'restart', message: 'Container restarted (restart policy)' },
      { id: 4, ts: Date.now() - 3600000, type: 'health', message: 'Health check failed: Connection refused' },
    ],
    processes: [
      { pid: 34567, user: 'redis', cpu: '0.8', mem: '35.2', command: 'redis-server *:6379' },
    ],
  },
  {
    id: 'd7e6a5b4c3f2',
    name: 'app-worker',
    image: 'myapp:latest',
    imageId: 'sha256:f8a9b0c1',
    state: 'running',
    status: 'Up 1 hour',
    health: 'healthy',
    cpu_pct: 45.2,
    mem_bytes: 1288490188,
    mem_limit: 2147483648,
    net_rx_bps: 2048,
    net_tx_bps: 5120,
    disk_read_bps: 102400,
    disk_write_bps: 51200,
    pids: 18,
    pid_limit: 100,
    ports: [],
    network: 'webapp_network',
    ip: '10.0.1.4',
    uptime: '1 hour',
    created: Date.now() - 3600000,
    restartPolicy: 'on-failure',
    restartCount: 0,
    env: [
      { key: 'APP_ENV', value: 'production', secret: false },
      { key: 'DB_HOST', value: 'postgres-db', secret: false },
      { key: 'DB_PASSWORD', value: '••••••••', secret: true },
      { key: 'API_KEY', value: '••••••••', secret: true },
      { key: 'WORKERS', value: '4', secret: false },
    ],
    mounts: [
      { type: 'bind', host: '/app/uploads', container: '/app/uploads', mode: 'rw' },
    ],
    labels: { 'com.example.environment': 'production', 'com.example.version': '2.1.0' },
    command: 'node dist/worker.js',
    entrypoint: 'docker-entrypoint.sh',
    hostname: 'app-worker',
    logs: [
      '[2026-05-03 13:32:00] Worker started, processing queue...',
      '[2026-05-03 13:32:01] Processing job #8721: send_email',
      '[2026-05-03 13:32:01] Job #8721 completed in 124ms',
      '[2026-05-03 13:32:02] Processing job #8722: resize_image',
      '[2026-05-03 13:32:04] Job #8722 completed in 2140ms',
      '[2026-05-03 13:32:05] Processing job #8723: generate_report',
      '[2026-05-03 14:32:05] ERROR: Failed to connect to database after 3 retries',
    ],
    events: [
      { id: 1, ts: Date.now() - 3600000, type: 'start', message: 'Container started' },
      { id: 2, ts: Date.now() - 3599000, type: 'health', message: 'Health check succeeded' },
    ],
    processes: [
      { pid: 45678, user: 'node', cpu: '38.5', mem: '48.2', command: 'node dist/worker.js' },
      { pid: 45679, user: 'node', cpu: '6.7', mem: '12.1', command: 'node: worker thread' },
    ],
  },
  {
    id: 'e8f7b6a5d4c3',
    name: 'mysql-old',
    image: 'mysql:8.0',
    imageId: 'sha256:e7f8a9b0',
    state: 'exited',
    status: 'Exited (1) 2 days ago',
    health: 'none',
    cpu_pct: 0,
    mem_bytes: 0,
    mem_limit: 1073741824,
    net_rx_bps: 0,
    net_tx_bps: 0,
    disk_read_bps: 0,
    disk_write_bps: 0,
    pids: 0,
    pid_limit: 100,
    ports: [],
    network: 'bridge',
    ip: '',
    uptime: 'Exited',
    created: Date.now() - 604800000,
    restartPolicy: 'no',
    restartCount: 5,
    env: [
      { key: 'MYSQL_ROOT_PASSWORD', value: '••••••••', secret: true },
      { key: 'MYSQL_DATABASE', value: 'legacy_db', secret: false },
    ],
    mounts: [
      { type: 'volume', host: 'mysql-data', container: '/var/lib/mysql', mode: 'rw' },
    ],
    labels: {},
    command: 'mysqld',
    entrypoint: 'docker-entrypoint.sh',
    hostname: 'mysql-old',
    logs: [
      '2026-05-01 08:00:00+00:00 [ERROR] [Entrypoint]: Unknown MySQL error',
      '2026-05-01 08:00:01+00:00 [ERROR] [Server]: Could not open file /var/lib/mysql/ib_logfile0',
      '2026-05-01 08:00:01+00:00 [ERROR] [Server]: InnoDB: Cannot continue operation.',
    ],
    events: [
      { id: 1, ts: Date.now() - 604800000, type: 'start', message: 'Container started' },
      { id: 2, ts: Date.now() - 172800000, type: 'die', message: 'Container died: exit code 1' },
    ],
    processes: [],
  },
  {
    id: 'f9a8c7b6e5d4',
    name: 'testing',
    image: 'alpine:latest',
    imageId: 'sha256:a1b2c3d4',
    state: 'paused',
    status: 'Paused',
    health: 'none',
    cpu_pct: 0,
    mem_bytes: 4194304,
    mem_limit: 134217728,
    net_rx_bps: 0,
    net_tx_bps: 0,
    disk_read_bps: 0,
    disk_write_bps: 0,
    pids: 1,
    pid_limit: 50,
    ports: [],
    network: 'bridge',
    ip: '172.17.0.5',
    uptime: 'Paused',
    created: Date.now() - 7200000,
    restartPolicy: 'no',
    restartCount: 0,
    env: [],
    mounts: [],
    labels: { 'purpose': 'testing' },
    command: '/bin/sh',
    entrypoint: '',
    hostname: 'testing',
    logs: [],
    events: [
      { id: 1, ts: Date.now() - 7200000, type: 'start', message: 'Container started' },
      { id: 2, ts: Date.now() - 3600000, type: 'stop', message: 'Container paused' },
    ],
    processes: [{ pid: 56789, user: 'root', cpu: '0.0', mem: '0.1', command: '/bin/sh' }],
  },
  {
    id: 'a1b2c3d4e5f6',
    name: 'certbot',
    image: 'certbot/certbot:latest',
    imageId: 'sha256:b2c3d4e5',
    state: 'restarting',
    status: 'Restarting (1) 30 seconds ago',
    health: 'starting',
    cpu_pct: 3.2,
    mem_bytes: 20971520,
    mem_limit: 134217728,
    net_rx_bps: 1024,
    net_tx_bps: 512,
    disk_read_bps: 0,
    disk_write_bps: 0,
    pids: 2,
    pid_limit: 50,
    ports: [],
    network: 'bridge',
    ip: '172.17.0.6',
    uptime: 'Restarting',
    created: Date.now() - 86400000,
    restartPolicy: 'on-failure',
    restartCount: 8,
    env: [
      { key: 'DOMAIN', value: 'example.com', secret: false },
      { key: 'EMAIL', value: 'admin@example.com', secret: false },
    ],
    mounts: [
      { type: 'bind', host: '/etc/letsencrypt', container: '/etc/letsencrypt', mode: 'rw' },
      { type: 'bind', host: '/var/www/certbot', container: '/var/www/certbot', mode: 'rw' },
    ],
    labels: {},
    command: 'certonly --webroot -w /var/www/certbot -d example.com',
    entrypoint: '/entrypoint.sh',
    hostname: 'certbot',
    logs: [
      'Saving debug log to /var/log/letsencrypt/letsencrypt.log',
      'Requesting a certificate for example.com',
      'An unexpected error occurred: Error connecting to ACME server',
      'Please see the logfiles in /var/log/letsencrypt for more details.',
    ],
    events: [
      { id: 1, ts: Date.now() - 86400000, type: 'start', message: 'Container started' },
      { id: 2, ts: Date.now() - 3600000, type: 'restart', message: 'Container restarted (exit code 1)' },
      { id: 3, ts: Date.now() - 1800000, type: 'restart', message: 'Container restarted (exit code 1)' },
      { id: 4, ts: Date.now() - 30000, type: 'restart', message: 'Container restarted (exit code 1)' },
    ],
    processes: [],
  },
  {
    id: 'b2c3d4e5f6a1',
    name: 'monitoring-agent',
    image: 'prom/node-exporter:v1.7.0',
    imageId: 'sha256:c3d4e5f6',
    state: 'running',
    status: 'Up 5 days',
    health: 'healthy',
    cpu_pct: 0.5,
    mem_bytes: 20971520,
    mem_limit: 268435456,
    net_rx_bps: 512,
    net_tx_bps: 10240,
    disk_read_bps: 0,
    disk_write_bps: 0,
    pids: 2,
    pid_limit: 50,
    ports: [
      { hostIp: '127.0.0.1', hostPort: '9100', containerPort: '9100', protocol: 'tcp' },
    ],
    network: 'bridge',
    ip: '172.17.0.7',
    uptime: '5 days',
    created: Date.now() - 432000000,
    restartPolicy: 'unless-stopped',
    restartCount: 0,
    env: [],
    mounts: [
      { type: 'bind', host: '/proc', container: '/host/proc', mode: 'ro' },
      { type: 'bind', host: '/sys', container: '/host/sys', mode: 'ro' },
      { type: 'bind', host: '/', container: '/rootfs', mode: 'ro' },
    ],
    labels: { 'org.opencontainers.image.title': 'node-exporter', 'com.example.environment': 'production' },
    command: '--path.procfs=/host/proc --path.sysfs=/host/sys',
    entrypoint: '/bin/node_exporter',
    hostname: 'monitoring-agent',
    logs: [
      'time="2026-05-03T14:30:00Z" level=info msg="Starting node_exporter" version="1.7.0"',
      'time="2026-05-03T14:30:00Z" level=info msg="Listening on" address=:9100',
    ],
    events: [
      { id: 1, ts: Date.now() - 432000000, type: 'start', message: 'Container started' },
      { id: 2, ts: Date.now() - 432000000 + 1000, type: 'health', message: 'Health check succeeded' },
    ],
    processes: [
      { pid: 67890, user: 'root', cpu: '0.5', mem: '7.8', command: '/bin/node_exporter' },
    ],
  },
]

// ── Docker system info ──────────────────────────────────────────────
export const DOCKER_INFO = {
  version: '27.0.3',
  buildHash: 'abc1234',
  apiVersion: '1.46',
  goVersion: 'go1.21.9',
  os: 'linux',
  arch: 'amd64',
  kernelVersion: '6.6.30-orbitos',
  diskUsage: '24.5 GB',
  imagesCount: 12,
  volumesCount: 6,
  networksCount: 4,
  diskTotal: 26214400000,
  diskUsed: 24328806400,
}

// ── Mock Images ─────────────────────────────────────────────────────
export const MOCK_IMAGES: DockerImage[] = [
  { id: 'sha256:4f1d2c3e', repository: 'nginx', tag: 'alpine', size: '23.5 MB', sizeBytes: 24641536, created: '2 weeks ago', inUse: true },
  { id: 'sha256:4c5d6e7f', repository: 'nginx', tag: 'latest', size: '142 MB', sizeBytes: 148897792, created: '3 months ago', inUse: false },
  { id: 'sha256:f8a9b0c1', repository: 'myapp', tag: 'latest', size: '1.2 GB', sizeBytes: 1288490188, created: '2 days ago', inUse: true },
  { id: 'sha256:d1e2f3a4', repository: 'myapp', tag: '2.1.0', size: '1.2 GB', sizeBytes: 1288490188, created: '2 days ago', inUse: false },
  { id: 'sha256:b4c5d6e7', repository: 'postgres', tag: '15', size: '378 MB', sizeBytes: 396361728, created: '1 month ago', inUse: true },
  { id: 'sha256:c5d6e7f8', repository: 'redis', tag: '7-alpine', size: '41 MB', sizeBytes: 42991616, created: '1 month ago', inUse: true },
  { id: 'sha256:e7f8a9b0', repository: 'mysql', tag: '8.0', size: '578 MB', sizeBytes: 606076928, created: '6 months ago', inUse: true },
  { id: 'sha256:a1b2c3d4', repository: 'alpine', tag: 'latest', size: '7.8 MB', sizeBytes: 8179712, created: '1 month ago', inUse: true },
  { id: 'sha256:b2c3d4e5', repository: 'certbot/certbot', tag: 'latest', size: '96 MB', sizeBytes: 100663296, created: '2 months ago', inUse: true },
  { id: 'sha256:c3d4e5f6', repository: 'prom/node-exporter', tag: 'v1.7.0', size: '22 MB', sizeBytes: 23068672, created: '3 months ago', inUse: true },
  { id: 'sha256:d4e5f6a7', repository: '<none>', tag: '<none>', size: '89 MB', sizeBytes: 93323264, created: '3 days ago', inUse: false },
  { id: 'sha256:e5f6a7b8', repository: 'ubuntu', tag: '22.04', size: '77.8 MB', sizeBytes: 81575936, created: '2 months ago', inUse: false },
]

// ── Mock Volumes ────────────────────────────────────────────────────
export const MOCK_VOLUMES: DockerVolume[] = [
  { name: 'postgres-data', driver: 'local', mountpoint: '/var/lib/docker/volumes/postgres-data/_data', size: '18.4 GB', usedBy: ['postgres-db'], created: '2 weeks ago' },
  { name: 'redis-data', driver: 'local', mountpoint: '/var/lib/docker/volumes/redis-data/_data', size: '124 MB', usedBy: ['redis-cache'], created: '2 weeks ago' },
  { name: 'mysql-data', driver: 'local', mountpoint: '/var/lib/docker/volumes/mysql-data/_data', size: '5.8 GB', usedBy: ['mysql-old'], created: '6 months ago' },
  { name: 'app-uploads', driver: 'local', mountpoint: '/var/lib/docker/volumes/app-uploads/_data', size: '2.1 GB', usedBy: ['app-worker'], created: '2 weeks ago' },
  { name: 'backup-storage', driver: 'nfs', mountpoint: '/mnt/nfs/backups', size: '45.2 GB', usedBy: [], created: '3 months ago' },
  { name: 'nginx-certs', driver: 'local', mountpoint: '/var/lib/docker/volumes/nginx-certs/_data', size: '12 KB', usedBy: ['nginx-prod', 'certbot'], created: '1 month ago' },
]

// ── Mock Networks ───────────────────────────────────────────────────
export const MOCK_NETWORKS: DockerNetwork[] = [
  { id: 'net1', name: 'bridge', driver: 'bridge', subnet: '172.17.0.0/16', gateway: '172.17.0.1', containers: 5, created: '6 months ago', internal: false },
  { id: 'net2', name: 'webapp_network', driver: 'bridge', subnet: '10.0.1.0/24', gateway: '10.0.1.1', containers: 3, created: '2 weeks ago', internal: false },
  { id: 'net3', name: 'host', driver: 'host', subnet: '—', gateway: '—', containers: 0, created: '6 months ago', internal: false },
  { id: 'net4', name: 'none', driver: 'null', subnet: '—', gateway: '—', containers: 1, created: '6 months ago', internal: true },
]

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export function getStateColor(state: ContainerState): string {
  switch (state) {
    case 'running':    return 'var(--color-success)'
    case 'exited':     return 'var(--color-danger)'
    case 'paused':     return 'var(--color-warning)'
    case 'restarting': return 'var(--color-accent)'
    default:           return 'var(--color-text-dim)'
  }
}

export function getHealthColor(h: HealthStatus): string {
  switch (h) {
    case 'healthy':   return 'var(--color-success)'
    case 'unhealthy': return 'var(--color-danger)'
    case 'starting':  return 'var(--color-warning)'
    default:          return 'var(--color-text-dim)'
  }
}
