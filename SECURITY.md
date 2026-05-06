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
- Session tokens are JWT, stored as `httpOnly` cookies — not accessible from JavaScript
- Passwords are hashed with bcrypt (cost factor 12)
- TOTP/2FA is supported via `pquerna/otp`
- First admin account is created via a one-time setup wizard

### Authorization
- All API routes require the `requireAuth` middleware
- MCP tokens use hashed storage — raw token is shown only at creation time
- Token scopes are enforced per request

### Transport
- All traffic should be served over TLS in production
- The app generates a self-signed cert by default; bring your own cert via `tls_cert_file` / `tls_key_file`

### Data Storage
- SQLite database at `{data_dir}/orbit.db` (WAL mode, foreign keys enabled)
- Database file permissions should be `0600`
- Sensitive fields (passwords, token hashes) are never returned in API responses

### Firewall / Network
- UFW integration uses graceful fallback if unavailable
- iptables rules are applied via the `ports` module
- Port access rules are persisted in SQLite and reapplied on startup

---

## Known Limitations (v0.1)

- No built-in rate limiting on authentication endpoints (planned for v0.2)
- Session tokens do not support per-session IP binding (planned)
- MCP tokens do not yet enforce IP allowlist at the network level (stored but not enforced in v0.1)

---

## Security Hardening Recommendations

For production deployments:

1. **Run behind a reverse proxy** (Nginx/Caddy) with rate limiting
2. **Use TLS** with a valid certificate (Let's Encrypt recommended)
3. **Restrict firewall access** — only expose port 5000 to trusted IPs
4. **Enable Fail2ban** integration for automated SSH brute-force protection
5. **Rotate MCP tokens** regularly using the token management UI
6. **Run as a non-root user** — the systemd service drops privileges after startup

---

## Disclosure Timeline

| Step | Timeline |
|------|----------|
| Initial acknowledgment | Within 72 hours |
| Severity assessment | Within 5 days |
| Fix development | Within 30 days (critical: 7 days) |
| Public disclosure | After fix is released |
