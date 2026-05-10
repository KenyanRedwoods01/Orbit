# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |
| < 0.1   | No        |

---

## Reporting a Vulnerability

**Do not report security vulnerabilities through public GitHub issues.**

Please report security issues privately by opening a [GitHub Security Advisory](https://github.com/KenyanRedwoods01/Orbit/security/advisories/new).

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce (proof of concept if available)
- Affected versions
- Any suggested mitigations

You will receive an acknowledgment within **72 hours** and a resolution timeline within **7 days**.

---

## Security Architecture

### Authentication
- Session tokens are JWT (HMAC-SHA256), stored as `httpOnly`, `SameSite=Strict` cookies — not accessible from JavaScript
- Passwords are hashed with bcrypt (cost factor 12)
- TOTP/2FA is supported via `pquerna/otp`; backup codes are supported
- First admin account is created via a one-time setup wizard
- Login rate limiting: **5 attempts per IP per 15 minutes** (sliding window); global limiter 300 req/min/IP
- Auth endpoints also protected by `authRateLimiter` (10 req/min/IP)
- Brute-force protection: dummy bcrypt call on failed login prevents timing-based username enumeration

### Authorization
- All API routes require the `requireAuth` middleware
- Destructive/sensitive routes require the `requireAdmin` middleware (110+ endpoints hardened)
- MCP tokens use hashed storage — raw token is shown only at creation time
- Token scopes are enforced per request (`read-only`, `write`, `admin`, `deploy`, `mcp_read`)
- Unknown scopes default to read-only

### Session Security
- JWT: 24h TTL, `Issuer: "orbit"`, `Audience: ["orbit-ui"]`, client IP claim included
- Server-side session DB check on every authenticated request (revocation support)
- Maximum 10 concurrent sessions enforced per user; oldest evicted on new login
- Logout invalidates the session server-side immediately
- Zustand state persisted to `sessionStorage` (not `localStorage`)

### Transport
- All traffic should be served over TLS in production
- The app generates a self-signed cert by default; bring your own cert via `tls_cert_file` / `tls_key_file`

### Data Storage
- SQLite database at `{data_dir}/orbit.db` (WAL mode, foreign keys enabled)
- Database file permissions should be `0600`
- Sensitive fields (passwords, token hashes) are never returned in API responses
- All SQL queries use parameterized `?` placeholders — no string interpolation in SQL

### Input Validation
- Central `security_validators.go` validates all user-supplied values before use in SQL identifiers, shell commands, and filesystem paths
- SQL identifiers validated against strict `^[A-Za-z_][A-Za-z0-9_$\-]{0,127}$` allowlist before interpolation
- Shell commands validated via regex; `bash -c` eliminated from all handlers
- Path traversal prevented via `safeRoot` guard on all filesystem operations

### Firewall / Network
- UFW integration uses graceful fallback if unavailable
- iptables rules are applied via the `ports` module
- Port access rules are persisted in SQLite and reapplied on startup

---

## Known Limitations (v0.1)

- MCP tokens do not yet enforce IP allowlist at the network level (stored but not enforced in v0.1)
- Session tokens do not support per-session IP binding (planned)

---

## Security Hardening Recommendations

For production deployments:

1. **Run behind a reverse proxy** (Nginx/Caddy) with rate limiting
2. **Use TLS** with a valid certificate (Let's Encrypt recommended)
3. **Restrict firewall access** — only expose port 5000 to trusted IPs
4. **Enable Fail2ban** integration for automated SSH brute-force protection
5. **Rotate MCP tokens** regularly using the token management UI
6. **Run as a non-root user** — the systemd service drops privileges after startup
7. **Set a strong JWT secret** — minimum 32 characters; the app panics on weak keys

---

## Disclosure Timeline

| Step | Timeline |
|------|----------|
| Initial acknowledgment | Within 72 hours |
| Severity assessment | Within 5 days |
| Fix development | Within 30 days (critical: 7 days) |
| Public disclosure | After fix is released |
