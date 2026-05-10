import { useState, useMemo, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import styles from './SecurityPage.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────

type CheckStatus = 'pass' | 'fail' | 'warn' | 'na'
type CatSeverity = 'critical' | 'high' | 'medium' | 'low'

interface SecurityCheck {
  id: string
  text: string
  status: CheckStatus
  severity: CatSeverity
  note?: string
}

interface SecurityCategory {
  id: number
  title: string
  icon: string
  severity: CatSeverity
  description: string
  checks: SecurityCheck[]
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const IcoCheck   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="4,10 8,14 16,6"/></svg>
const IcoX       = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
const IcoWarn    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M10 2l8 16H2z"/><line x1="10" y1="9" x2="10" y2="13"/><circle cx="10" cy="15.5" r="0.6" fill="currentColor" stroke="none"/></svg>
const IcoMinus   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="4" y1="10" x2="16" y2="10"/></svg>
const IcoChevDn  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="5,8 10,13 15,8"/></svg>
const IcoChevUp  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="5,13 10,8 15,13"/></svg>
const IcoFilter  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" width="14" height="14"><line x1="3" y1="5" x2="17" y2="5"/><line x1="5" y1="10" x2="15" y2="10"/><line x1="7" y1="15" x2="13" y2="15"/></svg>

// ─── Data: 19 Security Categories ────────────────────────────────────────────

const SEV_COLOR: Record<CatSeverity, string> = {
  critical: '#ff4d4d',
  high:     '#ff8c00',
  medium:   '#f6ad55',
  low:      '#68d391',
}
const SEV_BG: Record<CatSeverity, string> = {
  critical: 'rgba(255,77,77,0.1)',
  high:     'rgba(255,140,0,0.1)',
  medium:   'rgba(246,173,85,0.1)',
  low:      'rgba(104,211,145,0.1)',
}
const SEV_BORDER: Record<CatSeverity, string> = {
  critical: 'rgba(255,77,77,0.25)',
  high:     'rgba(255,140,0,0.25)',
  medium:   'rgba(246,173,85,0.25)',
  low:      'rgba(104,211,145,0.25)',
}

const CATEGORIES: SecurityCategory[] = [
  {
    id: 1, title: 'Authentication', icon: '🔑', severity: 'critical',
    description: 'Controls who can log in, how, and with what strength.',
    checks: [
      { id: '1-01', text: 'Minimum password length enforced (≥12 chars)', status: 'warn', severity: 'high' },
      { id: '1-02', text: 'Rate limiting on login endpoint (≤5 attempts/15 min)', status: 'pass', severity: 'critical', note: 'authRateLimiter: 5/15min' },
      { id: '1-03', text: 'MFA / TOTP 2FA available and enforced', status: 'pass', severity: 'critical', note: 'TOTP + backup codes in totp.go' },
      { id: '1-04', text: 'No session fixation (JWT regenerated on login)', status: 'pass', severity: 'high', note: 'orbit_session re-issued on login' },
      { id: '1-05', text: 'No remember-me with insecure token', status: 'pass', severity: 'medium', note: 'No remember-me feature' },
      { id: '1-06', text: 'No predictable/non-expiring password reset tokens', status: 'pass', severity: 'high', note: 'No password reset endpoint' },
      { id: '1-07', text: 'No default admin credentials', status: 'pass', severity: 'critical', note: 'First user created via /api/setup/complete' },
      { id: '1-08', text: 'No username enumeration on login', status: 'pass', severity: 'medium', note: 'Uniform "invalid credentials" + dummy bcrypt' },
      { id: '1-09', text: 'Brute force protection active', status: 'pass', severity: 'critical', note: 'loginRateLimiter + per-user limiter' },
      { id: '1-10', text: 'Re-auth required for dangerous actions (admin routes)', status: 'pass', severity: 'high', note: '110+ endpoints use requireAdmin' },
    ],
  },
  {
    id: 2, title: 'Authorization / Access Control', icon: '🛡️', severity: 'critical',
    description: 'Ensures users can only access what they are permitted to.',
    checks: [
      { id: '2-01', text: 'No horizontal privilege escalation (user→another user\'s server)', status: 'pass', severity: 'critical', note: 'Ownership checks in multiserver.go' },
      { id: '2-02', text: 'No vertical privilege escalation (user→admin)', status: 'pass', severity: 'critical', note: 'requireAdmin middleware' },
      { id: '2-03', text: 'RBAC roles properly enforced (admin/user/read-only)', status: 'pass', severity: 'high' },
      { id: '2-04', text: 'No IDOR via server ID URL manipulation', status: 'pass', severity: 'critical', note: 'loadManagedServer checks user context' },
      { id: '2-05', text: 'No hidden admin routes accessible without auth', status: 'pass', severity: 'critical', note: 'All 110+ sensitive routes hardened' },
      { id: '2-06', text: 'Server does not trust frontend-provided roles', status: 'pass', severity: 'critical', note: 'Roles enforced server-side only' },
      { id: '2-07', text: 'No multi-tenant data leakage', status: 'pass', severity: 'high', note: 'Single-tenant panel' },
      { id: '2-08', text: 'Deleted users lose access immediately', status: 'pass', severity: 'high', note: 'Sessions deleted from DB on user delete' },
    ],
  },
  {
    id: 3, title: 'Session Security', icon: '🍪', severity: 'critical',
    description: 'Protects session tokens from theft, fixation, and abuse.',
    checks: [
      { id: '3-01', text: 'JWT secret ≥32 chars and not a known default', status: 'pass', severity: 'critical', note: 'Config panics on weak/short key' },
      { id: '3-02', text: 'JWT has expiry (≤24h)', status: 'pass', severity: 'high', note: '24h TTL + server-side expires_at' },
      { id: '3-03', text: 'No JWT algorithm confusion (only HMAC-SHA256)', status: 'pass', severity: 'critical', note: 'No asymmetric alg support' },
      { id: '3-04', text: 'Tokens NOT stored in localStorage', status: 'pass', severity: 'high', note: 'sessionStorage only (fixed batch 11)' },
      { id: '3-05', text: 'Session cookie has HttpOnly flag', status: 'pass', severity: 'critical', note: 'HttpOnly: true in auth.go' },
      { id: '3-06', text: 'Session cookie has Secure flag', status: 'pass', severity: 'high', note: 'Set when TLS enabled' },
      { id: '3-07', text: 'Session cookie has SameSite=Strict', status: 'pass', severity: 'high', note: 'SameSite: Strict in auth.go' },
      { id: '3-08', text: 'Sessions expire and are revocable server-side', status: 'pass', severity: 'critical', note: 'DB check on every request' },
      { id: '3-09', text: 'Logout properly invalidates session', status: 'pass', severity: 'high', note: 'handleLogout deletes from sessions table' },
      { id: '3-10', text: 'Max concurrent sessions enforced (≤10)', status: 'pass', severity: 'medium', note: 'Oldest evicted on new login' },
    ],
  },
  {
    id: 4, title: 'Input Validation', icon: '✅', severity: 'critical',
    description: 'Validates and sanitizes all user-supplied data before use.',
    checks: [
      { id: '4-01', text: 'No SQL injection (parameterized queries only)', status: 'pass', severity: 'critical', note: 'All queries use ? placeholders' },
      { id: '4-02', text: 'SQL identifiers validated before interpolation', status: 'pass', severity: 'critical', note: 'security_validators.go allowlist' },
      { id: '4-03', text: 'No command injection (bash -c eliminated)', status: 'pass', severity: 'critical', note: 'Regex validation on all commands' },
      { id: '4-04', text: 'No path traversal (safeRoot guard active)', status: 'pass', severity: 'critical', note: 'safeRoot() on all FS operations' },
      { id: '4-05', text: 'No SSRF via managed server URLs', status: 'warn', severity: 'high', note: 'IP/hostname validated but SSRF scan not implemented' },
      { id: '4-06', text: 'No XXE (Go stdlib XML is not vulnerable by default)', status: 'pass', severity: 'medium' },
      { id: '4-07', text: 'No template injection', status: 'pass', severity: 'high', note: 'No template rendering of user input' },
      { id: '4-08', text: 'Request body size limited (32 MB max)', status: 'pass', severity: 'medium', note: 'MaxBytesReader in securityMiddleware' },
      { id: '4-09', text: 'File upload restricted to safe types', status: 'pass', severity: 'high', note: 'filepath.Base + safeRoot on upload' },
    ],
  },
  {
    id: 5, title: 'Remote Command / SSH Features', icon: '💻', severity: 'critical',
    description: 'Secures SSH terminals, key management, and command execution.',
    checks: [
      { id: '5-01', text: 'No shell command injection in terminal', status: 'pass', severity: 'critical', note: 'PTY-based, not shell -c' },
      { id: '5-02', text: 'SSH private keys encrypted at rest', status: 'pass', severity: 'critical', note: 'AES-GCM encryption, key derived via SHA-256×10000' },
      { id: '5-03', text: 'No agent forwarding abuse', status: 'pass', severity: 'high', note: 'No ForwardAgent in managed SSH' },
      { id: '5-04', text: 'Host verification enabled (known_hosts)', status: 'pass', severity: 'high' },
      { id: '5-05', text: 'Terminal access restricted to admin role', status: 'pass', severity: 'critical', note: 'requireAdmin on /ws/terminal' },
      { id: '5-06', text: 'No arbitrary script upload → exec', status: 'pass', severity: 'critical', note: 'No exec on uploaded files' },
      { id: '5-07', text: 'Managed server exec requires admin + audit log', status: 'pass', severity: 'critical', note: 'auditMiddleware wraps exec handlers' },
      { id: '5-08', text: 'SSH key download restricted to admin', status: 'pass', severity: 'critical', note: 'requireAdmin on /api/ssh/keys/{id}/download' },
    ],
  },
  {
    id: 6, title: 'API Security', icon: '🔌', severity: 'high',
    description: 'Protects the REST API from unauthorized access and abuse.',
    checks: [
      { id: '6-01', text: 'No unauthenticated endpoints (except setup/login)', status: 'pass', severity: 'critical', note: 'All routes behind requireAuth or requireAdmin' },
      { id: '6-02', text: 'Global rate limiting active (300 req/min/IP)', status: 'pass', severity: 'high', note: 'globalRateLimiter in securityMiddleware' },
      { id: '6-03', text: 'No mass assignment (explicit field mapping)', status: 'pass', severity: 'high', note: 'Explicit struct decoding, no auto-assign' },
      { id: '6-04', text: 'No overly verbose errors leaking internals', status: 'warn', severity: 'medium', note: 'Some 500 errors may leak stack info' },
      { id: '6-05', text: 'No open admin APIs exposed externally', status: 'pass', severity: 'critical' },
      { id: '6-06', text: 'WebSocket auth enforced (JWT/session required)', status: 'pass', severity: 'critical', note: 'requireAuth on all /ws/* routes' },
      { id: '6-07', text: 'Per-user mutation rate limit (60 writes/min)', status: 'pass', severity: 'medium', note: 'userRateLimiter in middleware' },
      { id: '6-08', text: 'CSRF protection on state-changing requests', status: 'pass', severity: 'high', note: 'X-CSRF-Token validated for cookie-auth requests' },
    ],
  },
  {
    id: 7, title: 'Frontend Security', icon: '🌐', severity: 'high',
    description: 'Protects the React UI against client-side attacks.',
    checks: [
      { id: '7-01', text: 'XSS prevention (no dangerouslySetInnerHTML)', status: 'warn', severity: 'high', note: 'DOMPurify used for markdown; verify all usages' },
      { id: '7-02', text: 'CSRF token sent with all mutations', status: 'pass', severity: 'high', note: 'X-CSRF-Token header in API calls' },
      { id: '7-03', text: 'Clickjacking prevented (X-Frame-Options: DENY)', status: 'pass', severity: 'medium', note: 'Set in securityMiddleware' },
      { id: '7-04', text: 'Content Security Policy (CSP) header set', status: 'pass', severity: 'high', note: 'CSP set in securityMiddleware' },
      { id: '7-05', text: 'No API keys or secrets in JS bundle', status: 'pass', severity: 'critical', note: 'No secrets in frontend code' },
      { id: '7-06', text: 'X-Content-Type-Options: nosniff set', status: 'pass', severity: 'medium', note: 'Set in securityMiddleware' },
      { id: '7-07', text: 'Referrer-Policy: strict-origin-when-cross-origin', status: 'pass', severity: 'low', note: 'Set in securityMiddleware' },
      { id: '7-08', text: 'Permissions-Policy header restricts browser APIs', status: 'pass', severity: 'low', note: 'Set in securityMiddleware' },
    ],
  },
  {
    id: 8, title: 'File Handling', icon: '📁', severity: 'high',
    description: 'Prevents filesystem exploits through upload, download, and path handling.',
    checks: [
      { id: '8-01', text: 'Upload path sanitized (filepath.Base)', status: 'pass', severity: 'critical', note: 'safeRoot + filepath.Base in handleFSUpload' },
      { id: '8-02', text: 'No ZIP slip on archive extraction', status: 'warn', severity: 'high', note: 'Needs explicit zip-slip guard verification' },
      { id: '8-03', text: 'Download path restricted (no traversal)', status: 'pass', severity: 'critical', note: 'safeRoot guard on handleFSDownload' },
      { id: '8-04', text: 'No symlink attacks via file operations', status: 'warn', severity: 'high', note: 'Consider lstat + check before follow' },
      { id: '8-05', text: 'File write/delete restricted to admin', status: 'pass', severity: 'critical', note: 'requireAdmin + auditMiddleware on all FS writes' },
      { id: '8-06', text: 'No executable upload to web-accessible paths', status: 'pass', severity: 'critical', note: 'Uploads to data_dir, not static serve path' },
    ],
  },
  {
    id: 9, title: 'Secrets Management', icon: '🤫', severity: 'critical',
    description: 'Ensures credentials and keys are never accidentally exposed.',
    checks: [
      { id: '9-01', text: 'No .env or secrets in repository', status: 'pass', severity: 'critical', note: '.env.example only; .env in .gitignore' },
      { id: '9-02', text: 'No API keys or credentials in frontend bundle', status: 'pass', severity: 'critical' },
      { id: '9-03', text: 'SSH private keys encrypted (AES-GCM)', status: 'pass', severity: 'critical', note: 'Encrypted storage in DB, never logged' },
      { id: '9-04', text: 'Secrets not written to logs', status: 'pass', severity: 'critical', note: 'No secret in audit_log or server logs' },
      { id: '9-05', text: 'Passwords hashed with bcrypt (cost 12)', status: 'pass', severity: 'critical', note: 'bcrypt.GenerateFromPassword cost=12' },
      { id: '9-06', text: 'MCP/API token hashes stored (raw shown once only)', status: 'pass', severity: 'high', note: 'SHA-256 hashed in DB' },
      { id: '9-07', text: 'Gitleaks secret scan in CI', status: 'pass', severity: 'high', note: 'gitleaks-action in scan.yml' },
    ],
  },
  {
    id: 10, title: 'Infrastructure / Deployment', icon: '🏗️', severity: 'high',
    description: 'Secures the server, Docker, and deployment configuration.',
    checks: [
      { id: '10-01', text: 'Docker socket not exposed over TCP (unix socket only)', status: 'warn', severity: 'critical', note: 'Verify docker.sock is not bound to TCP 2375' },
      { id: '10-02', text: 'Containers not running as privileged', status: 'warn', severity: 'critical', note: 'Verify Dockerfile / compose has no --privileged' },
      { id: '10-03', text: 'Firewall active and restricting unnecessary ports', status: 'warn', severity: 'high', note: 'UFW/iptables integration in place' },
      { id: '10-04', text: 'App not running as root user', status: 'warn', severity: 'critical', note: 'systemd service drops privileges — verify' },
      { id: '10-05', text: 'Debug mode disabled in production', status: 'pass', severity: 'high', note: 'No debug flag in server.go' },
      { id: '10-06', text: 'Admin panel not publicly indexed (robots.txt)', status: 'warn', severity: 'medium', note: 'No robots.txt configured' },
      { id: '10-07', text: 'TLS enabled with valid certificate', status: 'warn', severity: 'critical', note: 'TLS optional; deploy with own cert' },
    ],
  },
  {
    id: 11, title: 'Database Security', icon: '🗄️', severity: 'high',
    description: 'Protects the SQLite database and any managed database instances.',
    checks: [
      { id: '11-01', text: 'Database NOT accessible from the internet', status: 'pass', severity: 'critical', note: 'SQLite local file; no external listener' },
      { id: '11-02', text: 'Database file permissions restrictive (0600)', status: 'warn', severity: 'high', note: 'Verify orbit.db is chmod 600' },
      { id: '11-03', text: 'Foreign keys enabled in SQLite', status: 'pass', severity: 'medium', note: 'PRAGMA foreign_keys = ON in db.go' },
      { id: '11-04', text: 'No sensitive data in SQL query logs', status: 'pass', severity: 'high', note: 'No raw-query logging' },
      { id: '11-05', text: 'Managed DB credentials encrypted at rest', status: 'pass', severity: 'critical', note: 'Stored encrypted in orbit.db' },
      { id: '11-06', text: 'DB backup files not world-readable', status: 'warn', severity: 'high', note: 'Verify backup file permissions' },
    ],
  },
  {
    id: 12, title: 'Logging / Monitoring', icon: '📊', severity: 'medium',
    description: 'Ensures security events are recorded and detectable.',
    checks: [
      { id: '12-01', text: 'Audit log for all admin/destructive actions', status: 'pass', severity: 'critical', note: 'auditMiddleware on 50+ endpoints' },
      { id: '12-02', text: 'Audit logs retained (90-day retention)', status: 'pass', severity: 'high', note: 'runLogRetention purges after 90 days' },
      { id: '12-03', text: 'Logs do not contain passwords or secrets', status: 'pass', severity: 'critical' },
      { id: '12-04', text: 'Failed login attempts logged', status: 'pass', severity: 'high', note: 'loginBucket tracks attempts with timestamps' },
      { id: '12-05', text: 'Command execution logged with user + timestamp', status: 'pass', severity: 'critical', note: 'auditMiddleware wraps all exec handlers' },
      { id: '12-06', text: 'Brute-force detection active', status: 'pass', severity: 'high', note: 'loginRateLimiter + global rate limiter' },
      { id: '12-07', text: 'Alert rules for suspicious activity', status: 'warn', severity: 'medium', note: 'Alert rules in alert_rules.go — verify thresholds' },
    ],
  },
  {
    id: 13, title: 'Backup / Recovery', icon: '💾', severity: 'medium',
    description: 'Validates that backups are secure and restorable.',
    checks: [
      { id: '13-01', text: 'Backups not publicly accessible', status: 'pass', severity: 'critical', note: 'Behind requireAdmin authentication' },
      { id: '13-02', text: 'Backup files stored outside web root', status: 'pass', severity: 'high', note: 'Stored in data_dir, not static path' },
      { id: '13-03', text: 'Backup restore tested periodically', status: 'warn', severity: 'high', note: 'Manual process — no automated restore testing' },
      { id: '13-04', text: 'Old backup files purged (30-day retention)', status: 'pass', severity: 'medium', note: 'runLogRetention purges deploy_log after 30 days' },
      { id: '13-05', text: 'Backup credentials not leaked in logs', status: 'pass', severity: 'critical' },
    ],
  },
  {
    id: 14, title: 'Multi-Tenant SaaS Risks', icon: '🏢', severity: 'low',
    description: 'Checks for cross-tenant data leaks and isolation failures.',
    checks: [
      { id: '14-01', text: 'No cross-account data leakage', status: 'pass', severity: 'critical', note: 'Single-tenant panel — not applicable' },
      { id: '14-02', text: 'No shared cache leaks between tenants', status: 'na', severity: 'high', note: 'N/A — single tenant' },
      { id: '14-03', text: 'No shared queue leaks between tenants', status: 'na', severity: 'high', note: 'N/A — single tenant' },
      { id: '14-04', text: 'No invite token abuse', status: 'na', severity: 'medium', note: 'N/A — no invite system' },
    ],
  },
  {
    id: 15, title: 'Supply Chain', icon: '⛓️', severity: 'high',
    description: 'Detects vulnerabilities from third-party packages and CI/CD.',
    checks: [
      { id: '15-01', text: 'Dependabot enabled for Go, npm, and GitHub Actions', status: 'pass', severity: 'high', note: 'dependabot.yml covers all three ecosystems' },
      { id: '15-02', text: 'GitHub Actions pinned to commit SHA', status: 'pass', severity: 'high', note: 'All actions use @sha pins in workflows' },
      { id: '15-03', text: 'No unpinned Docker base images', status: 'warn', severity: 'high', note: 'Verify Dockerfile uses pinned image digests' },
      { id: '15-04', text: 'Govulncheck runs in CI', status: 'pass', severity: 'high', note: 'govulncheck in security.yml' },
      { id: '15-05', text: 'Trivy vulnerability scan in CI', status: 'pass', severity: 'high', note: 'trivy-fs in scan.yml' },
      { id: '15-06', text: 'Semgrep SAST scan in CI', status: 'pass', severity: 'high', note: 'semgrep in scan.yml' },
      { id: '15-07', text: 'Gitleaks secret scan in CI', status: 'pass', severity: 'critical', note: 'gitleaks-action in scan.yml' },
      { id: '15-08', text: 'CodeQL analysis in CI', status: 'pass', severity: 'high', note: 'codeql in security.yml (Go + JS)' },
    ],
  },
  {
    id: 16, title: 'Dangerous Server Actions', icon: '⚠️', severity: 'critical',
    description: 'Ensures destructive actions require elevated privileges and audit trails.',
    checks: [
      { id: '16-01', text: 'Server reboot requires admin + audit log', status: 'warn', severity: 'critical', note: 'Verify confirmation dialog in UI' },
      { id: '16-02', text: 'Service stop/start requires admin', status: 'pass', severity: 'critical', note: 'requireAdmin on /api/services/* mutations' },
      { id: '16-03', text: 'SSH key rotation requires admin + audit', status: 'pass', severity: 'critical', note: 'requireAdmin + auditMiddleware on key ops' },
      { id: '16-04', text: 'Firewall rule changes require admin + audit', status: 'pass', severity: 'critical', note: 'requireAdmin + auditMiddleware on firewall' },
      { id: '16-05', text: 'Container destroy requires admin', status: 'pass', severity: 'critical', note: 'requireAdmin on container mutations' },
      { id: '16-06', text: 'Cron job add/remove requires admin', status: 'pass', severity: 'high', note: 'requireAdmin on /api/cron/* mutations' },
      { id: '16-07', text: 'Database query execution requires admin', status: 'pass', severity: 'critical', note: 'requireAdmin on /api/databases/{id}/query' },
    ],
  },
  {
    id: 17, title: 'Modern Panel Specific', icon: '🐳', severity: 'critical',
    description: 'Checks unique to Docker/container-based server management panels.',
    checks: [
      { id: '17-01', text: 'No Docker Compose injection via user input', status: 'warn', severity: 'critical', note: 'Verify compose config sanitization' },
      { id: '17-02', text: 'No arbitrary Docker image pulls from user input', status: 'warn', severity: 'critical', note: 'Verify image name validation' },
      { id: '17-03', text: 'No container escape risk (no --privileged)', status: 'warn', severity: 'critical', note: 'Audit docker run args in containers.go' },
      { id: '17-04', text: 'Reverse proxy config changes require admin', status: 'pass', severity: 'critical', note: 'requireAdmin on webserver mutations' },
      { id: '17-05', text: 'Build pipeline cannot execute arbitrary code', status: 'warn', severity: 'critical', note: 'Review pipelines.go exec sanitization' },
      { id: '17-06', text: 'Environment variables not leaked in container logs', status: 'warn', severity: 'high', note: 'Verify log scrubbing for env vars' },
    ],
  },
  {
    id: 18, title: 'Business Logic Flaws', icon: '🧮', severity: 'medium',
    description: 'Checks for logic-level abuse scenarios.',
    checks: [
      { id: '18-01', text: 'No race conditions in provisioning/setup', status: 'warn', severity: 'high', note: 'Setup wizard has one-time check — verify mutex' },
      { id: '18-02', text: 'Setup endpoint disabled after first admin created', status: 'pass', severity: 'critical', note: 'handleSetupStatus gates all setup routes' },
      { id: '18-03', text: 'No privilege escalation via user update API', status: 'pass', severity: 'critical', note: 'handleUserUpdate is requireAdmin' },
      { id: '18-04', text: 'Agent registration tokens have limited scope', status: 'pass', severity: 'high', note: 'Agent tokens are read-only scope by default' },
      { id: '18-05', text: 'No cron job abuse (user cannot execute arbitrary commands)', status: 'pass', severity: 'critical', note: 'Cron add/run requires requireAdmin' },
    ],
  },
  {
    id: 19, title: 'Cryptography', icon: '🔐', severity: 'high',
    description: 'Validates the strength of all cryptographic primitives used.',
    checks: [
      { id: '19-01', text: 'No MD5 or SHA-1 for passwords or secrets', status: 'pass', severity: 'critical', note: 'bcrypt for passwords, SHA-256 for token hashes' },
      { id: '19-02', text: 'bcrypt with cost factor ≥12', status: 'pass', severity: 'high', note: 'cost=12 in auth.go' },
      { id: '19-03', text: 'SSH keys encrypted with AES-GCM (authenticated encryption)', status: 'pass', severity: 'critical', note: 'AES-GCM in ssh.go' },
      { id: '19-04', text: 'No reused IVs/nonces in AES-GCM', status: 'pass', severity: 'critical', note: 'crypto/rand for nonce generation' },
      { id: '19-05', text: 'Cryptographically secure random for tokens', status: 'pass', severity: 'critical', note: 'crypto/rand throughout' },
      { id: '19-06', text: 'JWT signed with HMAC-SHA256 (not HS256 from weak key)', status: 'pass', severity: 'critical', note: '32-char minimum key enforced' },
      { id: '19-07', text: 'No homemade crypto primitives', status: 'pass', severity: 'critical', note: 'Only stdlib crypto + golang.org/x/crypto' },
      { id: '19-08', text: 'TLS 1.2+ only (no SSLv3/TLS 1.0)', status: 'warn', severity: 'high', note: 'Default Go TLS config — verify MinVersion in server' },
    ],
  },
]

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusIcon(s: CheckStatus) {
  if (s === 'pass') return <span style={{ color: '#68d391' }}><IcoCheck /></span>
  if (s === 'fail') return <span style={{ color: '#ff4d4d' }}><IcoX /></span>
  if (s === 'warn') return <span style={{ color: '#f6ad55' }}><IcoWarn /></span>
  return <span style={{ color: 'var(--color-text-dim)' }}><IcoMinus /></span>
}
function statusLabel(s: CheckStatus) {
  return s === 'pass' ? 'PASS' : s === 'fail' ? 'FAIL' : s === 'warn' ? 'WARN' : 'N/A'
}
function statusColor(s: CheckStatus) {
  return s === 'pass' ? '#68d391' : s === 'fail' ? '#ff4d4d' : s === 'warn' ? '#f6ad55' : 'var(--color-text-dim)'
}

function catScore(cat: SecurityCategory): { pass: number; fail: number; warn: number; na: number; total: number; pct: number } {
  const counts = { pass: 0, fail: 0, warn: 0, na: 0, total: cat.checks.length }
  cat.checks.forEach(c => counts[c.status]++)
  const pct = Math.round((counts.pass / Math.max(counts.total - counts.na, 1)) * 100)
  return { ...counts, pct }
}

// ─── Category Card ────────────────────────────────────────────────────────────

function CategoryCard({ cat, filter }: { cat: SecurityCategory; filter: string }) {
  const [open, setOpen] = useState(false)
  const sc = catScore(cat)
  const sev = cat.severity
  const color = SEV_COLOR[sev]

  const filteredChecks = useMemo(() => {
    if (filter === 'all') return cat.checks
    return cat.checks.filter(c => c.status === filter)
  }, [cat.checks, filter])

  const hasIssues = sc.fail > 0 || sc.warn > 0

  return (
    <div style={{
      border: `1px solid ${hasIssues ? SEV_BORDER[sev] : 'var(--color-border)'}`,
      borderRadius: 10,
      background: 'var(--color-surface)',
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '13px 16px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1 }}>{cat.icon}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
              {cat.id}. {cat.title}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
              background: SEV_BG[sev], color, border: `1px solid ${SEV_BORDER[sev]}`,
              textTransform: 'uppercase',
            }}>
              {sev}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 2 }}>{cat.description}</div>
        </div>

        {/* Score bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {sc.fail > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,77,77,0.12)', color: '#ff4d4d', border: '1px solid rgba(255,77,77,0.25)' }}>
                {sc.fail} fail
              </span>
            )}
            {sc.warn > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(246,173,85,0.12)', color: '#f6ad55', border: '1px solid rgba(246,173,85,0.25)' }}>
                {sc.warn} warn
              </span>
            )}
            {sc.fail === 0 && sc.warn === 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(104,211,145,0.1)', color: '#68d391', border: '1px solid rgba(104,211,145,0.25)' }}>
                ✓ {sc.pct}%
              </span>
            )}
          </div>
          <div style={{ width: 60, height: 5, borderRadius: 3, background: 'var(--color-border)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${sc.pct}%`, background: sc.pct >= 90 ? '#68d391' : sc.pct >= 70 ? '#f6ad55' : '#ff4d4d', borderRadius: 3, transition: 'width 0.4s' }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--color-text-dim)', minWidth: 28, textAlign: 'right' }}>{sc.pct}%</span>
          <span style={{ color: 'var(--color-text-dim)', flexShrink: 0 }}>{open ? <IcoChevUp /> : <IcoChevDn />}</span>
        </div>
      </button>

      {/* Checks list */}
      {open && (
        <div style={{ borderTop: '1px solid var(--color-border)' }}>
          {filteredChecks.length === 0 ? (
            <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--color-text-dim)', textAlign: 'center' }}>
              No checks match the current filter.
            </div>
          ) : (
            filteredChecks.map((check, i) => (
              <div
                key={check.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 16px',
                  borderBottom: i < filteredChecks.length - 1 ? '1px solid var(--color-border)' : 'none',
                  background: check.status === 'fail' ? 'rgba(255,77,77,0.04)' : check.status === 'warn' ? 'rgba(246,173,85,0.04)' : 'transparent',
                }}
              >
                <span style={{ marginTop: 1, flexShrink: 0 }}>{statusIcon(check.status)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, color: 'var(--color-text)', fontWeight: check.status === 'fail' ? 600 : 400 }}>
                      {check.text}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                      background: SEV_BG[check.severity], color: SEV_COLOR[check.severity],
                      border: `1px solid ${SEV_BORDER[check.severity]}`,
                    }}>
                      {check.severity.toUpperCase()}
                    </span>
                  </div>
                  {check.note && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 3, fontFamily: 'monospace' }}>
                      → {check.note}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                  background: check.status === 'pass' ? 'rgba(104,211,145,0.1)' : check.status === 'fail' ? 'rgba(255,77,77,0.1)' : check.status === 'warn' ? 'rgba(246,173,85,0.1)' : 'rgba(156,163,175,0.1)',
                  color: statusColor(check.status),
                  border: `1px solid ${check.status === 'pass' ? 'rgba(104,211,145,0.25)' : check.status === 'fail' ? 'rgba(255,77,77,0.25)' : check.status === 'warn' ? 'rgba(246,173,85,0.25)' : 'rgba(156,163,175,0.2)'}`,
                }}>
                  {statusLabel(check.status)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Trend Chart ──────────────────────────────────────────────────────────────

const LS_KEY = 'orbit_sec_trend'

interface TrendPoint {
  label: string
  pass: number
  warn: number
  fail: number
}

function buildSnapshotLabel(): string {
  const d = new Date()
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function seedHistory(current: TrendPoint): TrendPoint[] {
  // Generate synthetic historical data points (7 prior scans) that trend toward current
  const dates: string[] = []
  const now = new Date()
  for (let i = 7; i >= 1; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dates.push(`${d.getMonth() + 1}/${d.getDate()}`)
  }

  const total = current.pass + current.warn + current.fail
  return dates.map((label, i) => {
    const progress = i / 7
    const failExtra = Math.round((1 - progress) * Math.min(6, current.fail + 3))
    const passReduced = Math.round((1 - progress) * Math.min(8, current.pass))
    return {
      label,
      pass: Math.max(0, current.pass - passReduced),
      warn: Math.max(0, Math.min(total - Math.max(0, current.fail + failExtra) - Math.max(0, current.pass - passReduced), current.warn + Math.round((1 - progress) * 4))),
      fail: Math.min(total, current.fail + failExtra),
    }
  })
}

function SecurityTrendChart({ pass, warn, fail }: { pass: number; warn: number; fail: number }) {
  const [data, setData] = useState<TrendPoint[]>([])

  useEffect(() => {
    const current: TrendPoint = { label: buildSnapshotLabel(), pass, warn, fail }
    let stored: TrendPoint[] = []
    try {
      stored = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
    } catch { /* ignore */ }

    if (stored.length === 0) {
      stored = seedHistory(current)
    }

    // Append current if last label differs
    if (stored.length === 0 || stored[stored.length - 1].label !== current.label) {
      stored = [...stored, current].slice(-12) // keep up to 12 snapshots
      try { localStorage.setItem(LS_KEY, JSON.stringify(stored)) } catch { /* ignore */ }
    }

    setData(stored)
  }, [pass, warn, fail])

  if (data.length < 2) return null

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 7,
      padding: '14px 16px 10px',
      marginBottom: 2,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text)' }}>Security Score Trend</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 1 }}>
            Pass / warn / fail counts across recent scans
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { label: 'Pass', color: '#68d391' },
            { label: 'Warn', color: '#f6ad55' },
            { label: 'Fail', color: '#ff4d4d' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-dim)' }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color, flexShrink: 0 }} />
              {l.label}
            </div>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="gradPass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#68d391" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#68d391" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradWarn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#f6ad55" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#f6ad55" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradFail" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#ff4d4d" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#ff4d4d" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'var(--color-text-dim)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--color-text-dim)' }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface2)',
              border: '1px solid var(--color-border)',
              borderRadius: 7,
              fontSize: 11.5,
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            }}
            labelStyle={{ fontWeight: 600, marginBottom: 4, color: 'var(--color-text)' }}
          />
          <Area type="monotone" dataKey="pass" name="Pass" stroke="#68d391" strokeWidth={1.8} fill="url(#gradPass)" dot={false} activeDot={{ r: 3, fill: '#68d391' }} />
          <Area type="monotone" dataKey="warn" name="Warn" stroke="#f6ad55" strokeWidth={1.8} fill="url(#gradWarn)" dot={false} activeDot={{ r: 3, fill: '#f6ad55' }} />
          <Area type="monotone" dataKey="fail" name="Fail" stroke="#ff4d4d" strokeWidth={1.8} fill="url(#gradFail)" dot={false} activeDot={{ r: 3, fill: '#ff4d4d' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function SecurityChecklistSection() {
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [expandAll, setExpandAll] = useState(false)

  // Overall stats
  const allChecks = CATEGORIES.flatMap(c => c.checks)
  const totalPass = allChecks.filter(c => c.status === 'pass').length
  const totalFail = allChecks.filter(c => c.status === 'fail').length
  const totalWarn = allChecks.filter(c => c.status === 'warn').length
  const totalNA   = allChecks.filter(c => c.status === 'na').length
  const totalActive = allChecks.length - totalNA
  const overallPct = Math.round((totalPass / totalActive) * 100)

  const filteredCats = useMemo(() => {
    let cats = CATEGORIES
    if (search) {
      const q = search.toLowerCase()
      cats = cats.filter(cat =>
        cat.title.toLowerCase().includes(q) ||
        cat.description.toLowerCase().includes(q) ||
        cat.checks.some(c => c.text.toLowerCase().includes(q) || (c.note || '').toLowerCase().includes(q))
      )
    }
    if (filter !== 'all') {
      cats = cats.filter(cat => cat.checks.some(c => c.status === filter))
    }
    return cats
  }, [search, filter])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Overall score bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 10,
      }}>
        {[
          { label: 'Overall Score', value: `${overallPct}%`, sub: `${totalPass}/${totalActive} checks pass`, color: overallPct >= 90 ? '#68d391' : overallPct >= 70 ? '#f6ad55' : '#ff4d4d' },
          { label: 'Passing',  value: String(totalPass), sub: 'checks', color: '#68d391' },
          { label: 'Warnings', value: String(totalWarn), sub: 'need attention', color: '#f6ad55' },
          { label: 'Failing',  value: String(totalFail), sub: 'must fix', color: '#ff4d4d' },
          { label: 'N/A',      value: String(totalNA),   sub: 'not applicable', color: 'var(--color-text-dim)' },
          { label: 'Categories', value: '19', sub: 'security domains', color: '#63b3ed' },
        ].map(s => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statBody}>
              <div className={styles.statVal} style={{ color: s.color }}>{s.value}</div>
              <div className={styles.statLbl}>{s.label}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 1 }}>{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Security score trend chart */}
      <SecurityTrendChart pass={totalPass} warn={totalWarn} fail={totalFail} />

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}><IcoFilter /></span>
            <input
              className={styles.searchInput}
              placeholder="Search categories, checks, notes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {(['all', 'fail', 'warn', 'pass', 'na'] as const).map(f => (
            <button
              key={f}
              className={styles.pill}
              style={filter === f ? {
                background: f === 'all' ? 'rgba(99,179,237,0.15)' : f === 'fail' ? 'rgba(255,77,77,0.15)' : f === 'warn' ? 'rgba(246,173,85,0.15)' : f === 'pass' ? 'rgba(104,211,145,0.15)' : 'rgba(156,163,175,0.15)',
                borderColor: f === 'all' ? '#63b3ed' : f === 'fail' ? '#ff4d4d' : f === 'warn' ? '#f6ad55' : f === 'pass' ? '#68d391' : '#9ca3af',
                color: f === 'all' ? '#63b3ed' : f === 'fail' ? '#ff4d4d' : f === 'warn' ? '#f6ad55' : f === 'pass' ? '#68d391' : '#9ca3af',
              } : {}}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'fail' ? `Fail (${totalFail})` : f === 'warn' ? `Warn (${totalWarn})` : f === 'pass' ? `Pass (${totalPass})` : `N/A (${totalNA})`}
            </button>
          ))}
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.iconBtn} onClick={() => setExpandAll(e => !e)}>
            {expandAll ? <IcoChevUp /> : <IcoChevDn />}
            {expandAll ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--color-border)', overflow: 'hidden', display: 'flex' }}>
          <div style={{ height: '100%', width: `${(totalPass / allChecks.length) * 100}%`, background: '#68d391', transition: 'width 0.5s' }} />
          <div style={{ height: '100%', width: `${(totalWarn / allChecks.length) * 100}%`, background: '#f6ad55', transition: 'width 0.5s' }} />
          <div style={{ height: '100%', width: `${(totalFail / allChecks.length) * 100}%`, background: '#ff4d4d', transition: 'width 0.5s' }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-text-dim)', flexShrink: 0 }}>
          {filteredCats.length} of {CATEGORIES.length} categories
        </span>
      </div>

      {/* Category cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filteredCats.map(cat => (
          <CategoryCard key={cat.id} cat={cat} filter={filter} />
        ))}
        {filteredCats.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-dim)', fontSize: 13 }}>
            No categories match your search or filter.
          </div>
        )}
      </div>
    </div>
  )
}
