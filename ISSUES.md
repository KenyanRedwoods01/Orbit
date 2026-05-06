# Issue Tracker

All issues and feature requests for Orbit VPS are tracked on GitHub:

**[github.com/KenyanRedwoods01/Orbit/issues](https://github.com/KenyanRedwoods01/Orbit/issues)**

---

## Filing a Bug Report

Use the **Bug Report** template when something isn't working as expected.

**Required information:**
- Orbit version (visible in Settings → About)
- Host OS and kernel version (`uname -a`)
- Browser and version (for UI issues)
- Steps to reproduce — numbered, specific
- Expected behavior
- Actual behavior
- Relevant logs (backend: `journalctl -u orbit`, browser: DevTools → Console)

---

## Filing a Feature Request

Use the **Feature Request** template to propose a new capability.

**Describe:**
- The problem you want to solve
- Your proposed solution
- Why this fits the scope of Orbit (see [PROJECT_SCOPE.md](PROJECT_SCOPE.md))
- Any alternatives you've considered

---

## Issue Labels

| Label | Meaning |
|-------|---------|
| `bug` | Something isn't working correctly |
| `enhancement` | A new feature or improvement |
| `question` | Usage question or clarification needed |
| `documentation` | Docs are missing or incorrect |
| `good first issue` | Suitable for new contributors |
| `help wanted` | Core team is requesting community help |
| `security` | Security vulnerability — report privately instead |
| `wontfix` | Out of scope or intentionally not supported |
| `v0.2` / `v0.3` | Targeted for a future milestone |

---

## Issue Triage Process

1. Issues are triaged within **72 hours** of filing
2. A severity and milestone label will be applied
3. `good first issue` tags are added to approachable items
4. Security issues must be filed as a [Security Advisory](https://github.com/KenyanRedwoods01/Orbit/security/advisories/new), not a public issue

---

## Current Known Limitations

These are known gaps in v0.1 that are already planned:

- No built-in rate limiting on `/login` endpoint (v0.2)
- Session-level IP binding for tokens (v0.2)
- DNS management UI (v0.3)
- Public status page (v0.3)
- OIDC / SSO login (v0.4)
- Windows support (not planned)

See [PROJECT_SCOPE.md](PROJECT_SCOPE.md) for the full roadmap.
