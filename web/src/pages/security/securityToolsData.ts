// ── Fail2Ban ────────────────────────────────────────────────────
export interface BannedIP {
  id: string; ip: string; country: string; countryCode: string
  jail: string; bannedAt: string; expiresAt: string; attempts: number
}
export interface F2BanJail {
  id: string; name: string; status: 'active' | 'inactive'
  logPath: string; maxRetry: number; findTime: number; banTime: number
  failedAttempts: number; currentBans: number
}
export const BANNED_IPS: BannedIP[] = [
  { id:'b1', ip:'203.0.113.45',  country:'United States', countryCode:'US', jail:'sshd',     bannedAt:'2026-05-03 09:14',  expiresAt:'2026-05-03 11:14',  attempts:12 },
  { id:'b2', ip:'198.51.100.3',  country:'China',         countryCode:'CN', jail:'sshd',     bannedAt:'2026-05-02 17:44',  expiresAt:'2026-05-03 17:44',  attempts:38 },
  { id:'b3', ip:'192.0.2.67',    country:'Russia',        countryCode:'RU', jail:'sshd',     bannedAt:'2026-05-03 07:22',  expiresAt:'2026-05-03 09:22',  attempts:25 },
  { id:'b4', ip:'104.21.44.129', country:'Germany',       countryCode:'DE', jail:'nginx-req', bannedAt:'2026-05-03 10:01', expiresAt:'2026-05-03 10:31',  attempts:301 },
  { id:'b5', ip:'185.220.101.8', country:'Netherlands',   countryCode:'NL', jail:'nginx-req', bannedAt:'2026-05-03 09:55', expiresAt:'2026-05-03 10:25',  attempts:218 },
  { id:'b6', ip:'45.33.32.156',  country:'Brazil',        countryCode:'BR', jail:'postfix',  bannedAt:'2026-05-02 14:10',  expiresAt:'2026-05-03 14:10',  attempts:8 },
]
export const F2B_JAILS: F2BanJail[] = [
  { id:'j1', name:'sshd',      status:'active',   logPath:'/var/log/auth.log',       maxRetry:5,  findTime:600,  banTime:7200,  failedAttempts:247, currentBans:3 },
  { id:'j2', name:'nginx-req', status:'active',   logPath:'/var/log/nginx/access.log', maxRetry:100, findTime:60, banTime:1800, failedAttempts:519, currentBans:2 },
  { id:'j3', name:'postfix',   status:'active',   logPath:'/var/log/mail.log',        maxRetry:5,  findTime:600,  banTime:86400, failedAttempts:31,  currentBans:1 },
  { id:'j4', name:'dovecot',   status:'inactive', logPath:'/var/log/dovecot.log',     maxRetry:5,  findTime:600,  banTime:86400, failedAttempts:0,   currentBans:0 },
  { id:'j5', name:'recidive',  status:'active',   logPath:'/var/log/fail2ban.log',    maxRetry:5,  findTime:86400,banTime:604800,failedAttempts:14,  currentBans:0 },
]
export const F2B_ATTACK_TREND = [
  { time:'00:00', count:12 }, { time:'02:00', count:8  }, { time:'04:00', count:31 },
  { time:'06:00', count:55 }, { time:'08:00', count:42 }, { time:'10:00', count:71 },
  { time:'12:00', count:38 }, { time:'14:00', count:22 }, { time:'16:00', count:19 },
  { time:'18:00', count:28 }, { time:'20:00', count:44 }, { time:'22:00', count:62 },
]

// ── CrowdSec ────────────────────────────────────────────────────
export interface CrowdSecAlert {
  id: string; sourceIp: string; scenario: string; severity: 'critical'|'high'|'medium'|'low'
  country: string; timestamp: string; decisions: number
}
export interface CrowdSecDecision {
  id: string; type: 'ban'|'captcha'|'throttle'; ip: string
  origin: string; scope: string; duration: string; expiresAt: string
}
export const CROWDSEC_ALERTS: CrowdSecAlert[] = [
  { id:'ca1', sourceIp:'203.0.113.45',  scenario:'crowdsecurity/ssh-bf',         severity:'critical', country:'US', timestamp:'2026-05-03 10:38', decisions:1 },
  { id:'ca2', sourceIp:'198.51.100.3',  scenario:'crowdsecurity/http-bf',         severity:'high',     country:'CN', timestamp:'2026-05-03 10:22', decisions:1 },
  { id:'ca3', sourceIp:'192.0.2.67',    scenario:'crowdsecurity/http-crawl',      severity:'medium',   country:'RU', timestamp:'2026-05-03 09:55', decisions:1 },
  { id:'ca4', sourceIp:'185.220.101.8', scenario:'crowdsecurity/nginx-req-limit', severity:'high',     country:'NL', timestamp:'2026-05-03 09:44', decisions:1 },
  { id:'ca5', sourceIp:'45.33.32.156',  scenario:'crowdsecurity/postfix-spam',    severity:'medium',   country:'BR', timestamp:'2026-05-02 18:10', decisions:1 },
  { id:'ca6', sourceIp:'104.21.44.129', scenario:'crowdsecurity/iptables-scan',   severity:'critical', country:'DE', timestamp:'2026-05-02 14:02', decisions:1 },
]
export const CROWDSEC_DECISIONS: CrowdSecDecision[] = [
  { id:'cd1', type:'ban',      ip:'203.0.113.45',  origin:'CAPI',  scope:'ip', duration:'4h',  expiresAt:'2026-05-03 14:38' },
  { id:'cd2', type:'ban',      ip:'198.51.100.3',  origin:'CAPI',  scope:'ip', duration:'24h', expiresAt:'2026-05-04 10:22' },
  { id:'cd3', type:'captcha',  ip:'192.0.2.67',    origin:'local', scope:'ip', duration:'1h',  expiresAt:'2026-05-03 10:55' },
  { id:'cd4', type:'throttle', ip:'185.220.101.8', origin:'CAPI',  scope:'ip', duration:'6h',  expiresAt:'2026-05-03 15:44' },
  { id:'cd5', type:'ban',      ip:'104.21.44.129', origin:'CAPI',  scope:'ip', duration:'48h', expiresAt:'2026-05-05 14:02' },
]
export const CROWDSEC_FEED = [
  { time:'10:38', ip:'203.0.113.45', action:'ssh-bf → ban',         country:'US' },
  { time:'10:22', ip:'198.51.100.3', action:'http-bf → ban',        country:'CN' },
  { time:'10:01', ip:'104.21.44.129',action:'req-limit → throttle', country:'DE' },
  { time:'09:55', ip:'192.0.2.67',   action:'http-crawl → captcha', country:'RU' },
  { time:'09:44', ip:'185.220.101.8',action:'nginx-limit → ban',    country:'NL' },
]

// ── Wazuh ───────────────────────────────────────────────────────
export interface WazuhAgent {
  id: string; hostname: string; ip: string; os: string
  status: 'online'|'offline'|'never_connected'
  lastHeartbeat: string; agentVersion: string; groups: string[]
}
export interface WazuhEvent {
  id: string; ruleId: number; level: number; description: string
  source: string; timestamp: string; category: string
}
export const WAZUH_AGENTS: WazuhAgent[] = [
  { id:'wa1', hostname:'web-01.prod',    ip:'10.0.1.10', os:'Ubuntu 22.04', status:'online',  lastHeartbeat:'2s ago',   agentVersion:'4.7.0', groups:['production','web'] },
  { id:'wa2', hostname:'db-01.prod',     ip:'10.0.1.20', os:'Ubuntu 22.04', status:'online',  lastHeartbeat:'4s ago',   agentVersion:'4.7.0', groups:['production','db']  },
  { id:'wa3', hostname:'cache-01.prod',  ip:'10.0.1.30', os:'Debian 12',    status:'online',  lastHeartbeat:'8s ago',   agentVersion:'4.6.0', groups:['production']       },
  { id:'wa4', hostname:'worker-01.stg',  ip:'10.0.2.10', os:'Ubuntu 20.04', status:'offline', lastHeartbeat:'3h ago',   agentVersion:'4.5.4', groups:['staging']          },
  { id:'wa5', hostname:'backup-01',      ip:'10.0.3.10', os:'CentOS 8',     status:'offline', lastHeartbeat:'2d ago',   agentVersion:'4.4.1', groups:['backup']           },
]
export const WAZUH_EVENTS: WazuhEvent[] = [
  { id:'we1', ruleId:5710, level:7,  description:'SSH authentication failure',      source:'10.0.1.10', timestamp:'10:38:12', category:'Authentication' },
  { id:'we2', ruleId:2502, level:3,  description:'Log file rotated',               source:'10.0.1.20', timestamp:'10:30:00', category:'System' },
  { id:'we3', ruleId:550,  level:7,  description:'Integrity checksum changed',      source:'10.0.1.10', timestamp:'10:22:44', category:'File Integrity' },
  { id:'we4', ruleId:5501, level:10, description:'User added to privileged group',  source:'10.0.1.10', timestamp:'10:10:05', category:'System' },
  { id:'we5', ruleId:31165,level:6,  description:'Web attack: XSS attempt blocked', source:'10.0.1.10', timestamp:'09:58:33', category:'Web' },
  { id:'we6', ruleId:2932, level:4,  description:'PAM: Login session opened',       source:'10.0.1.20', timestamp:'09:45:11', category:'Authentication' },
]

// ── Suricata ────────────────────────────────────────────────────
export interface SuricataAlert {
  id: string; signature: string; srcIp: string; dstIp: string
  protocol: string; severity: 'critical'|'high'|'medium'|'low'
  category: string; timestamp: string; action: 'alert'|'drop'
}
export const SURICATA_ALERTS: SuricataAlert[] = [
  { id:'sa1', signature:'ET SCAN Nmap OS Detection',   srcIp:'203.0.113.45', dstIp:'10.0.1.10', protocol:'TCP',  severity:'high',     category:'Reconnaissance', timestamp:'10:37:22', action:'alert' },
  { id:'sa2', signature:'ET DROP Known Tor Exit Node', srcIp:'185.220.101.8',dstIp:'10.0.1.10', protocol:'TCP',  severity:'critical', category:'Tor',            timestamp:'10:28:11', action:'drop'  },
  { id:'sa3', signature:'ET WEB_SERVER SQL Injection', srcIp:'192.0.2.67',   dstIp:'10.0.1.10', protocol:'HTTP', severity:'critical', category:'Web Attack',     timestamp:'10:14:05', action:'drop'  },
  { id:'sa4', signature:'ET POLICY SSH brute force',  srcIp:'198.51.100.3', dstIp:'10.0.1.10', protocol:'SSH',  severity:'high',     category:'Brute Force',    timestamp:'09:55:44', action:'alert' },
  { id:'sa5', signature:'GPL ICMP Ping Flood',        srcIp:'203.0.113.50', dstIp:'10.0.1.10', protocol:'ICMP', severity:'medium',   category:'Denial of Svc',  timestamp:'09:40:18', action:'alert' },
  { id:'sa6', signature:'ET DNS Query to Malicious',  srcIp:'10.0.1.30',    dstIp:'8.8.8.8',   protocol:'DNS',  severity:'high',     category:'Malware',        timestamp:'09:22:09', action:'drop'  },
]
export const SURICATA_STATS = [
  { label:'Packets', value:'4.2M',  sub:'last 24h',   color:'#63b3ed' },
  { label:'Alerts',  value:'148',   sub:'last 24h',   color:'#f6ad55' },
  { label:'Drops',   value:'31',    sub:'last 24h',   color:'#ff4d4d' },
  { label:'Rules',   value:'31,842',sub:'loaded',     color:'#68d391' },
]

// ── ClamAV ──────────────────────────────────────────────────────
export interface MalwareFinding {
  id: string; filePath: string; signature: string; severity: 'critical'|'high'|'medium'|'low'
  action: 'quarantined'|'deleted'|'ignored'; timestamp: string; size: string
}
export const MALWARE_FINDINGS: MalwareFinding[] = [
  { id:'mf1', filePath:'/var/www/html/uploads/shell.php', signature:'Php.Webshell.Agent-6',  severity:'critical', action:'quarantined', timestamp:'2026-05-03 08:12', size:'4.2 KB'  },
  { id:'mf2', filePath:'/tmp/.hidden/cryptominer',        signature:'Unix.Malware.Miner-7',  severity:'critical', action:'deleted',     timestamp:'2026-05-02 22:44', size:'1.1 MB'  },
  { id:'mf3', filePath:'/home/deploy/scripts/backdoor.sh',signature:'Unix.Backdoor.Shell-3', severity:'high',     action:'quarantined', timestamp:'2026-05-02 18:30', size:'812 B'   },
  { id:'mf4', filePath:'/var/tmp/dropper.elf',            signature:'Unix.Trojan.Dropper-2', severity:'high',     action:'deleted',     timestamp:'2026-05-01 11:18', size:'88 KB'   },
]
export const CLAMAV_STATS = [
  { label:'Scans done',    value:'128',    sub:'last 7 days',   color:'#63b3ed' },
  { label:'Infected',      value:'4',      sub:'total found',   color:'#ff4d4d' },
  { label:'Quarantined',   value:'2',      sub:'in quarantine', color:'#f6ad55' },
  { label:'DB version',    value:'27023',  sub:'updated today', color:'#68d391' },
]

// ── Docker Security ─────────────────────────────────────────────
export interface DockerContainer {
  id: string; name: string; image: string; status: 'running'|'stopped'|'paused'
  privileged: boolean; rootUser: boolean; exposedPorts: string[]
  capabilities: string[]; vulnerabilities: number; riskLevel: 'critical'|'high'|'medium'|'low'
}
export const DOCKER_CONTAINERS: DockerContainer[] = [
  { id:'dc1', name:'nginx-proxy',     image:'nginx:1.24',        status:'running', privileged:false, rootUser:true,  exposedPorts:['80/tcp','443/tcp'], capabilities:['NET_BIND_SERVICE'],             vulnerabilities:3,  riskLevel:'medium'   },
  { id:'dc2', name:'postgres-db',     image:'postgres:15.2',     status:'running', privileged:false, rootUser:false, exposedPorts:['5432/tcp'],         capabilities:[],                               vulnerabilities:1,  riskLevel:'low'      },
  { id:'dc3', name:'redis-cache',     image:'redis:7.0',         status:'running', privileged:false, rootUser:false, exposedPorts:['6379/tcp'],         capabilities:[],                               vulnerabilities:0,  riskLevel:'low'      },
  { id:'dc4', name:'monitoring-agent',image:'grafana/agent:0.39', status:'running', privileged:true,  rootUser:true,  exposedPorts:[],                   capabilities:['SYS_ADMIN','NET_ADMIN','SYS_PTRACE'], vulnerabilities:8, riskLevel:'critical' },
  { id:'dc5', name:'legacy-app',      image:'node:14-slim',      status:'running', privileged:false, rootUser:true,  exposedPorts:['3000/tcp'],         capabilities:['SYS_CHROOT'],                  vulnerabilities:22, riskLevel:'critical' },
  { id:'dc6', name:'backup-cron',     image:'alpine:3.18',       status:'stopped', privileged:false, rootUser:false, exposedPorts:[],                   capabilities:[],                               vulnerabilities:0,  riskLevel:'low'      },
]
export const DOCKER_STATS = [
  { label:'Vulnerable',   value:'3',  sub:'containers',     color:'#ff4d4d' },
  { label:'Privileged',   value:'1',  sub:'containers',     color:'#ff8c00' },
  { label:'Root user',    value:'3',  sub:'running as root', color:'#f6ad55' },
  { label:'Total CVEs',   value:'34', sub:'across images',   color:'#63b3ed' },
]

// ── Trivy ───────────────────────────────────────────────────────
export interface TrivyVuln {
  id: string; image: string; pkg: string; installedVersion: string
  fixedVersion: string; cveId: string; severity: 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'
  title: string
}
export const TRIVY_VULNS: TrivyVuln[] = [
  { id:'tv1', image:'node:14-slim',      pkg:'zlib1g',       installedVersion:'1:1.2.11.dfsg-1', fixedVersion:'1:1.2.11.dfsg-1+deb10u2', cveId:'CVE-2022-37434', severity:'CRITICAL', title:'zlib: heap-based buffer over-read/overflow' },
  { id:'tv2', image:'node:14-slim',      pkg:'libssl1.1',    installedVersion:'1.1.1d-0+deb10u8', fixedVersion:'1.1.1n-0+deb10u3',       cveId:'CVE-2022-0778',  severity:'HIGH',     title:'OpenSSL: infinite loop in BN_mod_sqrt()' },
  { id:'tv3', image:'node:14-slim',      pkg:'libexpat1',    installedVersion:'2.2.6-2+deb10u4', fixedVersion:'2.2.6-2+deb10u6',         cveId:'CVE-2022-40674', severity:'CRITICAL', title:'expat: use-after-free in doContent' },
  { id:'tv4', image:'grafana/agent:0.39',pkg:'golang.org/x/net', installedVersion:'v0.7.0',    fixedVersion:'v0.17.0',                 cveId:'CVE-2023-44487', severity:'HIGH',     title:'HTTP/2 Rapid Reset Attack' },
  { id:'tv5', image:'nginx:1.24',        pkg:'libpcre3',     installedVersion:'2:8.39-13',       fixedVersion:'none',                    cveId:'CVE-2017-7244',  severity:'MEDIUM',   title:'PCRE: stack-based buffer overflow' },
  { id:'tv6', image:'postgres:15.2',     pkg:'libgnutls30',  installedVersion:'3.7.1-5+deb11u3', fixedVersion:'3.7.1-5+deb11u4',        cveId:'CVE-2023-5981',  severity:'MEDIUM',   title:'GnuTLS: timing side-channel in RSA-PSK' },
]
export const TRIVY_STATS = [
  { label:'Images scanned', value:'5',  sub:'of 6 total',   color:'#63b3ed' },
  { label:'Critical CVEs',  value:'2',  sub:'need action',  color:'#ff4d4d' },
  { label:'High CVEs',      value:'2',  sub:'need action',  color:'#ff8c00' },
  { label:'Total CVEs',     value:'6',  sub:'across images', color:'#f6ad55' },
]

// ── Auth / MFA ──────────────────────────────────────────────────
export interface UserSession {
  id: string; username: string; ip: string; device: string
  location: string; browser: string; lastSeen: string
  mfaEnabled: boolean; current: boolean
}
export interface FailedLogin {
  id: string; username: string; ip: string; country: string
  timestamp: string; reason: 'wrong_password'|'account_locked'|'mfa_failed'|'ip_blocked'
}
export const USER_SESSIONS: UserSession[] = [
  { id:'us1', username:'admin',   ip:'192.168.1.50',  device:'MacBook Pro',   location:'New York, US',    browser:'Chrome 124',  lastSeen:'just now',    mfaEnabled:true,  current:true  },
  { id:'us2', username:'admin',   ip:'10.0.0.25',     device:'iPhone 15 Pro', location:'New York, US',    browser:'Safari 17',   lastSeen:'2m ago',      mfaEnabled:true,  current:false },
  { id:'us3', username:'deploy',  ip:'10.0.1.50',     device:'Linux Server',  location:'Internal',        browser:'curl/8.5.0',  lastSeen:'14m ago',     mfaEnabled:false, current:false },
  { id:'us4', username:'monitor', ip:'10.0.0.10',     device:'Linux Server',  location:'Internal',        browser:'Python/3.11', lastSeen:'5m ago',      mfaEnabled:false, current:false },
]
export const FAILED_LOGINS: FailedLogin[] = [
  { id:'fl1', username:'root',   ip:'203.0.113.45',  country:'US', timestamp:'10:38:12', reason:'wrong_password' },
  { id:'fl2', username:'admin',  ip:'198.51.100.3',  country:'CN', timestamp:'10:29:55', reason:'wrong_password' },
  { id:'fl3', username:'ubuntu', ip:'192.0.2.67',    country:'RU', timestamp:'09:44:38', reason:'wrong_password' },
  { id:'fl4', username:'admin',  ip:'192.168.1.200', country:'US', timestamp:'08:12:01', reason:'mfa_failed'     },
  { id:'fl5', username:'deploy', ip:'185.220.101.8', country:'NL', timestamp:'07:55:22', reason:'ip_blocked'     },
]
export const AUTH_STATS = [
  { label:'MFA Enabled',      value:'2/4',  sub:'user accounts',    color:'#68d391' },
  { label:'Active Sessions',  value:'4',    sub:'right now',        color:'#63b3ed' },
  { label:'Failed Logins',    value:'5',    sub:'last 24h',         color:'#f6ad55' },
  { label:'Locked Accounts',  value:'0',    sub:'currently locked', color:'#68d391' },
]
