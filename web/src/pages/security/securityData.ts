export type Severity      = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type SSHCheckStatus = 'pass' | 'fail' | 'warn'
export type FirewallStatus = 'open' | 'blocked' | 'restricted' | 'loopback'
export type PortRisk       = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type CVEStatus      = 'unpatched' | 'update-available' | 'backport' | 'acknowledged'

export const SEV_META: Record<Severity, { color: string; bg: string; border: string; label: string; short: string }> = {
  critical: { color: '#ff4d4d', bg: 'rgba(255,77,77,0.1)',    border: 'rgba(255,77,77,0.25)',    label: 'Critical', short: 'CRIT' },
  high:     { color: '#ff8c00', bg: 'rgba(255,140,0,0.1)',    border: 'rgba(255,140,0,0.25)',    label: 'High',     short: 'HIGH' },
  medium:   { color: '#f6ad55', bg: 'rgba(246,173,85,0.1)',   border: 'rgba(246,173,85,0.25)',   label: 'Medium',   short: 'MED'  },
  low:      { color: '#68d391', bg: 'rgba(104,211,145,0.1)',  border: 'rgba(104,211,145,0.2)',   label: 'Low',      short: 'LOW'  },
  info:     { color: '#63b3ed', bg: 'rgba(99,179,237,0.1)',   border: 'rgba(99,179,237,0.2)',    label: 'Info',     short: 'INFO' },
}

// ── SSH Hardening ─────────────────────────────────────────
export interface SSHCheck {
  id:           string
  param:        string
  description:  string
  currentValue: string
  desiredValue: string
  severity:     Severity
  status:       SSHCheckStatus
  category:     string
  command:      string
  remediation:  string
  impact:       string
}

export const SSH_CHECKS: SSHCheck[] = [
  {
    id: 'ssh-01', param: 'PermitRootLogin', category: 'Authentication',
    description: 'Allows the root account to log in directly via SSH, which is a significant security risk.',
    currentValue: 'yes', desiredValue: 'no or prohibit-password',
    severity: 'critical', status: 'fail',
    command: 'grep PermitRootLogin /etc/ssh/sshd_config',
    remediation: "sed -i 's/^PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config && systemctl restart sshd",
    impact: 'Disabling root login eliminates a major attack vector. Attackers cannot brute-force root directly.',
  },
  {
    id: 'ssh-02', param: 'PasswordAuthentication', category: 'Authentication',
    description: 'Password-based authentication is enabled, making the server vulnerable to brute-force attacks.',
    currentValue: 'yes', desiredValue: 'no',
    severity: 'high', status: 'fail',
    command: 'grep PasswordAuthentication /etc/ssh/sshd_config',
    remediation: "sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && systemctl restart sshd",
    impact: 'Switching to key-only authentication eliminates brute-force password attacks entirely.',
  },
  {
    id: 'ssh-03', param: 'Protocol', category: 'Protocol',
    description: 'SSH Protocol version is correctly set to 2 only. SSHv1 has known vulnerabilities.',
    currentValue: '2', desiredValue: '2',
    severity: 'critical', status: 'pass',
    command: 'grep Protocol /etc/ssh/sshd_config',
    remediation: "Ensure 'Protocol 2' is in sshd_config.",
    impact: 'Protocol 2 provides significantly stronger cryptographic guarantees.',
  },
  {
    id: 'ssh-04', param: 'X11Forwarding', category: 'Tunneling',
    description: 'X11 forwarding is enabled. This can be exploited to hijack graphical sessions.',
    currentValue: 'yes', desiredValue: 'no',
    severity: 'medium', status: 'fail',
    command: 'grep X11Forwarding /etc/ssh/sshd_config',
    remediation: "sed -i 's/^X11Forwarding yes/X11Forwarding no/' /etc/ssh/sshd_config && systemctl restart sshd",
    impact: 'Disabling X11 forwarding prevents a class of graphical session hijacking attacks.',
  },
  {
    id: 'ssh-05', param: 'MaxAuthTries', category: 'Authentication',
    description: 'Maximum number of authentication attempts per connection is too high, facilitating brute-force.',
    currentValue: '10', desiredValue: '3-6',
    severity: 'medium', status: 'warn',
    command: 'grep MaxAuthTries /etc/ssh/sshd_config',
    remediation: "sed -i 's/^MaxAuthTries.*/MaxAuthTries 4/' /etc/ssh/sshd_config && systemctl restart sshd",
    impact: 'Lowering MaxAuthTries limits the number of password guesses per TCP connection.',
  },
  {
    id: 'ssh-06', param: 'PubkeyAuthentication', category: 'Authentication',
    description: 'Public key authentication is properly enabled. Required for key-only access.',
    currentValue: 'yes', desiredValue: 'yes',
    severity: 'high', status: 'pass',
    command: 'grep PubkeyAuthentication /etc/ssh/sshd_config',
    remediation: "Set 'PubkeyAuthentication yes' in sshd_config.",
    impact: 'Public key auth is the foundation of modern SSH security.',
  },
  {
    id: 'ssh-07', param: 'PermitEmptyPasswords', category: 'Authentication',
    description: 'Empty passwords are correctly forbidden.',
    currentValue: 'no', desiredValue: 'no',
    severity: 'critical', status: 'pass',
    command: 'grep PermitEmptyPasswords /etc/ssh/sshd_config',
    remediation: "Set 'PermitEmptyPasswords no' in sshd_config.",
    impact: 'Prevents accounts with no passwords from being accessible over SSH.',
  },
  {
    id: 'ssh-08', param: 'Ciphers', category: 'Cryptography',
    description: 'Weak ciphers (aes128-cbc, aes256-cbc, 3des-cbc) are enabled, susceptible to BEAST and Lucky 13 attacks.',
    currentValue: 'includes CBC', desiredValue: 'AES-CTR, AES-GCM, ChaCha20 only',
    severity: 'high', status: 'fail',
    command: 'sshd -T | grep ciphers',
    remediation: "Add to sshd_config: Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr,aes192-ctr,aes128-ctr",
    impact: 'Removes CBC-mode ciphers vulnerable to padding oracle attacks.',
  },
  {
    id: 'ssh-09', param: 'MACs', category: 'Cryptography',
    description: 'Weak MAC algorithms (hmac-sha1, hmac-md5) are enabled.',
    currentValue: 'includes hmac-sha1', desiredValue: 'HMAC-SHA2-256/512, UMAC-128',
    severity: 'high', status: 'fail',
    command: 'sshd -T | grep macs',
    remediation: "Add to sshd_config: MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,umac-128-etm@openssh.com",
    impact: 'Removes SHA-1 and MD5 based MACs which have known collision vulnerabilities.',
  },
  {
    id: 'ssh-10', param: 'KexAlgorithms', category: 'Cryptography',
    description: 'Key exchange algorithms include diffie-hellman-group1-sha1 (1024-bit, deprecated).',
    currentValue: 'includes group1-sha1', desiredValue: 'curve25519, group16+, ecdh-sha2-*',
    severity: 'high', status: 'fail',
    command: 'sshd -T | grep kexalgorithms',
    remediation: "Add to sshd_config: KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512",
    impact: 'Removes broken Diffie-Hellman group1 (Logjam-vulnerable).',
  },
  {
    id: 'ssh-11', param: 'LoginGraceTime', category: 'Session',
    description: 'Login grace time is too long (120s), allowing slow brute-force connection attempts.',
    currentValue: '120', desiredValue: '30-60',
    severity: 'medium', status: 'warn',
    command: 'grep LoginGraceTime /etc/ssh/sshd_config',
    remediation: "Set 'LoginGraceTime 30' in sshd_config.",
    impact: 'Reduces window of unauthenticated connections.',
  },
  {
    id: 'ssh-12', param: 'ClientAliveInterval', category: 'Session',
    description: 'Client keep-alive is not configured, idle sessions will never time out.',
    currentValue: '0', desiredValue: '300',
    severity: 'low', status: 'fail',
    command: 'grep ClientAliveInterval /etc/ssh/sshd_config',
    remediation: "Set 'ClientAliveInterval 300' and 'ClientAliveCountMax 3' in sshd_config.",
    impact: 'Automatically disconnects idle sessions, reducing exposure of orphaned connections.',
  },
  {
    id: 'ssh-13', param: 'AllowUsers', category: 'Access Control',
    description: 'No AllowUsers restriction is set. Any system user can attempt SSH login.',
    currentValue: '(not set)', desiredValue: 'admin deploy (explicit whitelist)',
    severity: 'high', status: 'warn',
    command: 'grep AllowUsers /etc/ssh/sshd_config',
    remediation: "Add 'AllowUsers admin deploy' to sshd_config to whitelist only required users.",
    impact: 'Restricts SSH access to a known set of users, reducing attack surface.',
  },
  {
    id: 'ssh-14', param: 'Banner', category: 'Compliance',
    description: 'No legal warning banner is configured. Required by PCI-DSS and many compliance standards.',
    currentValue: 'none', desiredValue: '/etc/issue.net',
    severity: 'medium', status: 'fail',
    command: 'grep Banner /etc/ssh/sshd_config',
    remediation: "Create /etc/issue.net with legal warning text, then set 'Banner /etc/issue.net' in sshd_config.",
    impact: 'Satisfies compliance requirements and establishes legal standing for unauthorized access prosecution.',
  },
  {
    id: 'ssh-15', param: 'LogLevel', category: 'Monitoring',
    description: 'SSH log level is set to INFO — verbose logging is recommended for forensic analysis.',
    currentValue: 'INFO', desiredValue: 'VERBOSE',
    severity: 'low', status: 'warn',
    command: 'grep LogLevel /etc/ssh/sshd_config',
    remediation: "Set 'LogLevel VERBOSE' in sshd_config.",
    impact: 'VERBOSE logs include key fingerprints and additional audit data for forensics.',
  },
  {
    id: 'ssh-16', param: 'IgnoreRhosts', category: 'Authentication',
    description: 'Rhost-based authentication is correctly ignored.',
    currentValue: 'yes', desiredValue: 'yes',
    severity: 'low', status: 'pass',
    command: 'grep IgnoreRhosts /etc/ssh/sshd_config',
    remediation: "Set 'IgnoreRhosts yes' in sshd_config.",
    impact: 'Prevents weak rhost-based authentication methods.',
  },
  {
    id: 'ssh-17', param: 'HostbasedAuthentication', category: 'Authentication',
    description: 'Host-based authentication is correctly disabled.',
    currentValue: 'no', desiredValue: 'no',
    severity: 'medium', status: 'pass',
    command: 'grep HostbasedAuthentication /etc/ssh/sshd_config',
    remediation: "Set 'HostbasedAuthentication no' in sshd_config.",
    impact: 'Prevents weak host-based authentication.',
  },
  {
    id: 'ssh-18', param: 'Port', category: 'Exposure',
    description: 'SSH is running on the default port 22, making it a primary scan target for automated attacks.',
    currentValue: '22', desiredValue: 'non-standard (e.g. 2222)',
    severity: 'info', status: 'warn',
    command: 'grep ^Port /etc/ssh/sshd_config',
    remediation: "Change 'Port 22' to a non-standard port in sshd_config. Update firewall rules accordingly.",
    impact: 'Security by obscurity — reduces automated scan hits. Not a substitute for strong auth.',
  },
  {
    id: 'ssh-19', param: 'MaxSessions', category: 'Session',
    description: 'Maximum sessions per connection is within acceptable range.',
    currentValue: '10', desiredValue: '10 or lower',
    severity: 'low', status: 'pass',
    command: 'grep MaxSessions /etc/ssh/sshd_config',
    remediation: "Set 'MaxSessions 10' or lower in sshd_config.",
    impact: 'Limits concurrent sessions to reduce resource abuse.',
  },
  {
    id: 'ssh-20', param: 'UsePAM', category: 'Authentication',
    description: 'PAM is enabled, required for 2FA and account lockout integration.',
    currentValue: 'yes', desiredValue: 'yes',
    severity: 'medium', status: 'pass',
    command: 'grep UsePAM /etc/ssh/sshd_config',
    remediation: "Set 'UsePAM yes' in sshd_config.",
    impact: 'Enables integration with PAM modules including 2FA (google-authenticator) and fail2ban.',
  },
]

// ── Open Ports ────────────────────────────────────────────
export interface OpenPort {
  id:             string
  port:           number
  protocol:       'TCP' | 'UDP'
  service:        string
  process:        string
  pid:            number
  listenAddr:     string
  firewallStatus: FirewallStatus
  risk:           PortRisk
  description:    string
  recommendation: string
  serviceColor:   string
}

export const OPEN_PORTS: OpenPort[] = [
  {
    id: 'p-22',    port: 22,    protocol: 'TCP', service: 'SSH',      process: 'sshd',              pid: 892,   listenAddr: '0.0.0.0',
    firewallStatus: 'restricted', risk: 'low',
    description: 'OpenSSH 8.9p1 — secure shell access, restricted to known IPs via firewall.',
    recommendation: 'Monitor for brute-force attempts. Consider key-only auth and port knocking.',
    serviceColor: '#a78bfa',
  },
  {
    id: 'p-80',    port: 80,    protocol: 'TCP', service: 'HTTP',     process: 'nginx',             pid: 1234,  listenAddr: '0.0.0.0',
    firewallStatus: 'open', risk: 'low',
    description: 'nginx/1.24.0 — web server, should redirect all traffic to HTTPS on 443.',
    recommendation: 'Ensure all HTTP traffic redirects to HTTPS. Add HSTS header.',
    serviceColor: '#22c55e',
  },
  {
    id: 'p-443',   port: 443,   protocol: 'TCP', service: 'HTTPS',    process: 'nginx',             pid: 1235,  listenAddr: '0.0.0.0',
    firewallStatus: 'open', risk: 'low',
    description: 'nginx/1.24.0 — TLS-encrypted HTTPS. TLS 1.3 enabled.',
    recommendation: 'Verify TLS certificate expiry. Enforce strong cipher suites. Enable OCSP stapling.',
    serviceColor: '#22c55e',
  },
  {
    id: 'p-3306',  port: 3306,  protocol: 'TCP', service: 'MySQL',    process: 'mysqld',            pid: 2210,  listenAddr: '0.0.0.0',
    firewallStatus: 'open', risk: 'critical',
    description: 'MySQL 8.0.36 — database server exposed to all interfaces. No firewall restriction.',
    recommendation: 'Bind MySQL to 127.0.0.1 only. Block port 3306 in firewall immediately.',
    serviceColor: '#f6ad55',
  },
  {
    id: 'p-5432',  port: 5432,  protocol: 'TCP', service: 'PostgreSQL', process: 'postgres',        pid: 1456,  listenAddr: '127.0.0.1',
    firewallStatus: 'loopback', risk: 'info',
    description: 'PostgreSQL 15 — bound to loopback only. Not externally accessible.',
    recommendation: 'Good configuration. Verify pg_hba.conf only allows local connections.',
    serviceColor: '#63b3ed',
  },
  {
    id: 'p-6379',  port: 6379,  protocol: 'TCP', service: 'Redis',    process: 'redis-server',      pid: 789,   listenAddr: '127.0.0.1',
    firewallStatus: 'loopback', risk: 'info',
    description: 'Redis 7.2 — bound to loopback. No external exposure.',
    recommendation: 'Verify requirepass is set in redis.conf. Rename dangerous commands (DEBUG, CONFIG).',
    serviceColor: '#fc8181',
  },
  {
    id: 'p-8080',  port: 8080,  protocol: 'TCP', service: 'HTTP-Alt', process: 'java',              pid: 4521,  listenAddr: '0.0.0.0',
    firewallStatus: 'open', risk: 'high',
    description: 'Apache Tomcat 10.1 admin interface exposed on all interfaces. No authentication required.',
    recommendation: 'Restrict to internal network only. Add IP-based firewall rule (10.0.0.0/8). Enable authentication.',
    serviceColor: '#f6ad55',
  },
  {
    id: 'p-9090',  port: 9090,  protocol: 'TCP', service: 'Prometheus', process: 'prometheus',      pid: 5634,  listenAddr: '0.0.0.0',
    firewallStatus: 'open', risk: 'high',
    description: 'Prometheus metrics endpoint exposed publicly. Exposes system internals.',
    recommendation: 'Move behind reverse proxy with authentication. Block external access via firewall.',
    serviceColor: '#ff8c00',
  },
  {
    id: 'p-53',    port: 53,    protocol: 'UDP', service: 'DNS',      process: 'systemd-resolved',  pid: 111,   listenAddr: '127.0.0.53',
    firewallStatus: 'loopback', risk: 'info',
    description: 'systemd-resolved DNS stub listener. Loopback only.',
    recommendation: 'No action needed. Verify DNS resolver is not acting as open resolver.',
    serviceColor: '#9ca3af',
  },
  {
    id: 'p-25',    port: 25,    protocol: 'TCP', service: 'SMTP',     process: 'postfix',            pid: 3321,  listenAddr: '0.0.0.0',
    firewallStatus: 'open', risk: 'medium',
    description: 'Postfix SMTP server. Open relay check required.',
    recommendation: 'Verify not an open relay. Enable TLS. Configure SPF/DKIM/DMARC. Add rate limiting.',
    serviceColor: '#60a5fa',
  },
  {
    id: 'p-2375',  port: 2375,  protocol: 'TCP', service: 'Docker API', process: 'dockerd',         pid: 1890,  listenAddr: '0.0.0.0',
    firewallStatus: 'open', risk: 'critical',
    description: 'Docker daemon API exposed on TCP (unencrypted). Full container control for anyone who connects.',
    recommendation: 'CLOSE IMMEDIATELY. Use Unix socket (/var/run/docker.sock) instead. Or enable TLS mutual auth.',
    serviceColor: '#60a5fa',
  },
]

// ── CVE Findings ─────────────────────────────────────────
export interface CVEFinding {
  id:               string
  cveId:            string
  package:          string
  currentVersion:   string
  fixedVersion:     string
  severity:         Severity
  cvssScore:        number
  cvssVector:       string
  exploitAvailable: boolean
  exploitSource?:   string
  epssScore:        number
  cisaKev:          boolean
  status:           CVEStatus
  description:      string
  publishedDate:    string
  affectedPackages: string[]
  workaround?:      string
  nvdUrl:           string
  ageDays:          number
}

export const CVE_FINDINGS: CVEFinding[] = [
  {
    id: 'cve-01', cveId: 'CVE-2024-6387', package: 'openssh-server', currentVersion: '1:9.2p1-2',
    fixedVersion: '1:9.6p1-1', severity: 'critical', cvssScore: 8.1,
    cvssVector: 'AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H',
    exploitAvailable: true, exploitSource: 'Metasploit (msf/auxiliary/scanner/ssh/regreSSHion)',
    epssScore: 0.42, cisaKev: true,
    status: 'unpatched',
    description: 'A race condition in OpenSSH\'s signal handler (regreSSHion) allows an unauthenticated remote attacker to execute arbitrary code as root on glibc-based Linux systems.',
    publishedDate: '2024-07-01',
    affectedPackages: ['openssh-server (9.2p1-2)', 'openssh-client (9.2p1-2)'],
    workaround: 'Set LoginGraceTime 0 in sshd_config (prevents exploitation but also prevents legitimate login grace period).',
    nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2024-6387',
    ageDays: 306,
  },
  {
    id: 'cve-02', cveId: 'CVE-2024-3094', package: 'xz-utils', currentVersion: '5.6.0',
    fixedVersion: '5.4.6', severity: 'critical', cvssScore: 10.0,
    cvssVector: 'AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H',
    exploitAvailable: true, exploitSource: 'Public PoC (backdoor condition)',
    epssScore: 0.89, cisaKev: true,
    status: 'update-available',
    description: 'Backdoor discovered in XZ Utils 5.6.0 and 5.6.1 that targets OpenSSH authentication via systemd. Allows unauthenticated remote code execution.',
    publishedDate: '2024-03-29',
    affectedPackages: ['xz-utils (5.6.0)', 'liblzma5 (5.6.0)'],
    nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2024-3094',
    ageDays: 400,
  },
  {
    id: 'cve-03', cveId: 'CVE-2023-44487', package: 'nginx', currentVersion: '1.24.0',
    fixedVersion: '1.24.0-2ubuntu7.1', severity: 'high', cvssScore: 7.5,
    cvssVector: 'AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H',
    exploitAvailable: true, exploitSource: 'Exploit-DB #51991 (Rapid Reset HTTP/2)',
    epssScore: 0.71, cisaKev: true,
    status: 'update-available',
    description: 'HTTP/2 Rapid Reset Attack allows a remote attacker to cause denial of service by sending a large number of HTTP/2 HEADERS frames followed immediately by RST_STREAM.',
    publishedDate: '2023-10-10',
    affectedPackages: ['nginx (1.24.0)', 'libnginx-mod-http2 (1.24.0)'],
    workaround: 'Set http2_max_concurrent_streams 1 in nginx.conf (reduces performance). Or disable HTTP/2.',
    nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2023-44487',
    ageDays: 570,
  },
  {
    id: 'cve-04', cveId: 'CVE-2024-28757', package: 'libexpat1', currentVersion: '2.5.0-1',
    fixedVersion: '2.6.0-1', severity: 'high', cvssScore: 7.5,
    cvssVector: 'AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H',
    exploitAvailable: false, epssScore: 0.12, cisaKev: false,
    status: 'update-available',
    description: 'Integer overflow in libexpat 2.5.0 and before allows a remote attacker to cause a denial of service or execute arbitrary code via a crafted XML document.',
    publishedDate: '2024-03-10',
    affectedPackages: ['libexpat1 (2.5.0-1)', 'python3-xml (3.11.x)'],
    nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2024-28757',
    ageDays: 418,
  },
  {
    id: 'cve-05', cveId: 'CVE-2024-2961', package: 'libc6', currentVersion: '2.37-15',
    fixedVersion: '2.37-16', severity: 'high', cvssScore: 7.3,
    cvssVector: 'AV:N/AC:L/PR:L/UI:R/S:U/C:H/I:N/A:H',
    exploitAvailable: true, exploitSource: 'Qualys Research (PHP filter chain)',
    epssScore: 0.55, cisaKev: false,
    status: 'update-available',
    description: 'An out-of-bounds write in glibc\'s iconv() function (ISO-2022-CN-EXT codec) allows remote code execution via PHP stream filters.',
    publishedDate: '2024-04-17',
    affectedPackages: ['libc6 (2.37-15)', 'libc-bin (2.37-15)'],
    nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2024-2961',
    ageDays: 381,
  },
  {
    id: 'cve-06', cveId: 'CVE-2023-5678', package: 'openssl', currentVersion: '3.0.11',
    fixedVersion: '3.0.12', severity: 'medium', cvssScore: 5.3,
    cvssVector: 'AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L',
    exploitAvailable: false, epssScore: 0.05, cisaKev: false,
    status: 'backport',
    description: 'Generating excessively long X9.42 DH keys or checking excessively long X9.42 DH keys or parameters may be very slow.',
    publishedDate: '2023-11-06',
    affectedPackages: ['openssl (3.0.11)', 'libssl3 (3.0.11)'],
    nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2023-5678',
    ageDays: 543,
  },
  {
    id: 'cve-07', cveId: 'CVE-2024-1086', package: 'linux-image-6.8', currentVersion: '6.8.0-38',
    fixedVersion: '6.8.0-40', severity: 'high', cvssScore: 7.8,
    cvssVector: 'AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H',
    exploitAvailable: true, exploitSource: 'Exploit-DB #51999 (local privilege escalation)',
    epssScore: 0.38, cisaKev: false,
    status: 'update-available',
    description: 'Use-after-free vulnerability in the Linux kernel netfilter nf_tables component allows a local attacker to achieve local privilege escalation.',
    publishedDate: '2024-01-31',
    affectedPackages: ['linux-image-6.8.0-38-generic', 'linux-modules-6.8.0-38-generic'],
    nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2024-1086',
    ageDays: 462,
  },
  {
    id: 'cve-08', cveId: 'CVE-2024-21626', package: 'containerd', currentVersion: '1.7.12',
    fixedVersion: '1.7.14', severity: 'high', cvssScore: 8.6,
    cvssVector: 'AV:L/AC:L/PR:N/UI:R/S:C/C:H/I:H/A:H',
    exploitAvailable: true, exploitSource: 'GitHub Advisory (runc container escape)',
    epssScore: 0.31, cisaKev: false,
    status: 'update-available',
    description: 'Container escape vulnerability in runc through 1.1.11 allows a malicious container to break out to the host filesystem via process.cwd leaking a file descriptor.',
    publishedDate: '2024-01-31',
    affectedPackages: ['runc (1.1.12)', 'containerd (1.7.12)', 'docker.io (24.0.5)'],
    nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2024-21626',
    ageDays: 462,
  },
  {
    id: 'cve-09', cveId: 'CVE-2023-38408', package: 'openssh-client', currentVersion: '1:9.2p1-2',
    fixedVersion: '1:9.3p2-1', severity: 'critical', cvssScore: 9.8,
    cvssVector: 'AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
    exploitAvailable: true, exploitSource: 'Qualys (ssh-agent RCE)',
    epssScore: 0.67, cisaKev: true,
    status: 'unpatched',
    description: 'A remote code execution vulnerability in OpenSSH\'s ssh-agent allows a remote attacker who has control of the forwarded agent socket to execute arbitrary code.',
    publishedDate: '2023-07-19',
    affectedPackages: ['openssh-client (9.2p1-2)'],
    workaround: 'Disable SSH agent forwarding: set ForwardAgent no in ~/.ssh/config.',
    nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2023-38408',
    ageDays: 654,
  },
  {
    id: 'cve-10', cveId: 'CVE-2024-4577', package: 'php8.2', currentVersion: '8.2.18',
    fixedVersion: '8.2.20', severity: 'critical', cvssScore: 9.8,
    cvssVector: 'AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
    exploitAvailable: true, exploitSource: 'Exploit-DB #52065 (CGI argument injection)',
    epssScore: 0.79, cisaKev: true,
    status: 'update-available',
    description: 'PHP CGI argument injection vulnerability affects all PHP versions before 8.3.8, 8.2.20, 8.1.29. Allows remote unauthenticated code execution on Windows systems (or Linux with CGI handler).',
    publishedDate: '2024-06-09',
    affectedPackages: ['php8.2 (8.2.18)', 'php8.2-fpm (8.2.18)', 'php8.2-cli (8.2.18)'],
    nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2024-4577',
    ageDays: 328,
  },
  {
    id: 'cve-11', cveId: 'CVE-2023-47108', package: 'golang-1.21', currentVersion: '1.21.3',
    fixedVersion: '1.21.5', severity: 'medium', cvssScore: 5.9,
    cvssVector: 'AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:H',
    exploitAvailable: false, epssScore: 0.03, cisaKev: false,
    status: 'update-available',
    description: 'OTel Go Contrib uses context.Background() as a fallback and blocks forever if the passed context is nil. A remote attacker can cause a denial of service.',
    publishedDate: '2023-11-20',
    affectedPackages: ['golang-1.21 (1.21.3)'],
    nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2023-47108',
    ageDays: 529,
  },
  {
    id: 'cve-12', cveId: 'CVE-2024-23897', package: 'jenkins', currentVersion: '2.441',
    fixedVersion: '2.442', severity: 'critical', cvssScore: 9.8,
    cvssVector: 'AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
    exploitAvailable: true, exploitSource: 'Shodan confirmed exploitation in wild',
    epssScore: 0.91, cisaKev: true,
    status: 'unpatched',
    description: 'Arbitrary file read vulnerability in Jenkins allows unauthenticated attackers to read arbitrary files on the Jenkins controller file system, leading to RCE.',
    publishedDate: '2024-01-24',
    affectedPackages: ['jenkins (2.441)'],
    workaround: 'Disable CLI access: JENKINS_OPTS="--argumentsRealm.passwd.admin=secret --argumentsRealm.roles.admin=admin"',
    nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2024-23897',
    ageDays: 469,
  },
]

// ── Compliance ────────────────────────────────────────────
export interface ComplianceResult {
  standard:    string
  status:      'pass' | 'fail' | 'partial'
  passPercent: number
  totalChecks: number
  passingChecks: number
  failingItems: string[]
}

export const COMPLIANCE_RESULTS: ComplianceResult[] = [
  {
    standard: 'CIS Level 1', status: 'partial', passPercent: 71, totalChecks: 100,
    passingChecks: 71, failingItems: ['SSH PermitRootLogin', 'PasswordAuthentication', 'Weak ciphers', 'MySQL exposed'],
  },
  {
    standard: 'PCI-DSS v3.2.1', status: 'fail', passPercent: 52, totalChecks: 45,
    passingChecks: 23, failingItems: ['Req 2.2.1 SSH hardening', 'Req 11.2 vuln scan', 'Req 1.2.1 firewall'],
  },
  {
    standard: 'HIPAA', status: 'partial', passPercent: 78, totalChecks: 35,
    passingChecks: 27, failingItems: ['§164.312(a)(1) access control', '§164.312(e)(1) encryption'],
  },
  {
    standard: 'ISO 27001', status: 'partial', passPercent: 65, totalChecks: 60,
    passingChecks: 39, failingItems: ['A.12.6 technical vulnerabilities', 'A.9.4.2 secure logon'],
  },
]

// ── Overall score ─────────────────────────────────────────
export function computeScore(): { score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F' } {
  const sshFails   = SSH_CHECKS.filter(c => c.status === 'fail').length
  const critCVEs   = CVE_FINDINGS.filter(c => c.severity === 'critical').length
  const highCVEs   = CVE_FINDINGS.filter(c => c.severity === 'high').length
  const critPorts  = OPEN_PORTS.filter(p => p.risk === 'critical').length
  const highPorts  = OPEN_PORTS.filter(p => p.risk === 'high').length
  let score = 100
  score -= sshFails * 4
  score -= critCVEs * 8
  score -= highCVEs * 3
  score -= critPorts * 10
  score -= highPorts * 4
  score = Math.max(0, Math.min(100, score))
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : 'F'
  return { score, grade }
}
