# Orbit — Testing Guide

## Quick Start (Run Immediately)

```bash
# Frontend unit tests (fastest — no Go required)
cd web && npx vitest run

# Frontend tests with coverage report
cd web && npx vitest run --coverage

# TypeScript type checking (catches broken imports, wrong types)
cd web && npx tsc --noEmit

# Go unit tests (requires Go in PATH)
export PATH="/home/runner/.nix-profile/bin:$PATH"
go test ./... -v -race -count=1

# Go tests for a specific package
go test ./internal/api/... -v -run TestValidate

# Go fuzz tests (limited run)
go test ./internal/api/... -fuzz=FuzzValidateIP -fuzztime=10s
```

---

## Test Pyramid

Orbit uses 14 levels of testing, ordered from cheapest to most expensive. Start at Level 1 and work down.

---

## Level 1 — Static Checks (Run First, Zero Cost)

Catch issues before any code runs.

### TypeScript Type Checking

```bash
cd web && npx tsc --noEmit
```

Catches: wrong types, undefined values, broken imports, API shape mismatches.

### Linting

```bash
cd web && npx eslint . --ext ts,tsx --max-warnings 0
```

Catches: unused variables, React hook misuse, async errors, bad patterns.

### Go Vet

```bash
export PATH="/home/runner/.nix-profile/bin:$PATH"
go vet ./...
```

Catches: common Go mistakes (suspicious printf calls, unreachable code, etc.).

**Run these on every PR. They catch 30% of bugs for free.**

---

## Level 2 — Unit Tests (Start Here for Real Tests)

Test the smallest pieces in complete isolation. Fast, stable, high ROI.

### Frontend Unit Tests

**Location:** `web/src/__tests__/`

| File | What It Tests |
|---|---|
| `validators.test.ts` | IP validation, CIDR, DB identifiers, port specs |
| `utils.test.ts` | formatBytes, fmtRel, slugify, clamp, truncate, parsePort |
| `profile.test.ts` | Security score, avatar initials, password strength, session expiry |
| `permissions.test.ts` | scopeAllowsWrite, isAdmin, route guards |
| `metrics.test.ts` | CPU/memory formatters, status thresholds, aggregation helpers |
| `auth.test.ts` | Auth store: setUser, logout, persistence |
| `security-checklist.test.ts` | Score computation, filter logic, trend seeding |

```bash
cd web && npx vitest run
# or watch mode during development:
cd web && npx vitest
```

### Go Unit Tests

**Location:** `internal/api/*_test.go`, `internal/auth/`

| File | What It Tests |
|---|---|
| `validators_test.go` | validateIP, validateIPOrCIDR, validateDBIdentifier, validatePortSpec |
| `profile_test.go` | requireAuth middleware, scopeAllowsWrite, unauthenticated rejections |
| `helpers_test.go` | hashSHA256Hex, safeRoot path traversal prevention |
| `auth_test.go` | JWT issuance, expiry, wrong-secret rejection |
| `fuzz_test.go` | Fuzz inputs for validators (never panics, rejects injection) |

```bash
export PATH="/home/runner/.nix-profile/bin:$PATH"
go test ./internal/api/... -v
go test ./internal/auth/... -v
```

**Priority:** Validators, auth helpers, permission checks — these protect the server.

---

## Level 3 — Component / UI Tests

Test that React components render, respond to user interactions, and show correct states.

**Stack:** Vitest + React Testing Library + jsdom + MSW (mock service worker)

**Location:** `web/src/__tests__/` (add `*.test.tsx` files)

### Example: Testing a button click

```tsx
// web/src/__tests__/RestartButton.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import RestartButton from '@/components/RestartButton'

test('shows spinner after click', () => {
  render(<RestartButton serviceName="nginx" />)
  fireEvent.click(screen.getByRole('button'))
  expect(screen.getByTestId('spinner')).toBeInTheDocument()
})
```

### Priority Components to Test

- Login form (validation, error messages)
- Firewall rule form (input validation, submit)
- Destructive action modals (confirm dialog)
- Loading / error states on data pages

```bash
cd web && npx vitest run --reporter=verbose
```

---

## Level 4 — Integration Tests

Test that multiple layers work together: HTTP handler + auth middleware + DB.

**Stack:** Go's `net/http/httptest` + in-memory SQLite

### Example: Full auth flow

```go
// Create test server with real DB
s := newTestServer(t)

// Login to get session cookie
loginReq := httptest.NewRequest("POST", "/api/auth/login", body)
w := httptest.NewRecorder()
s.mux.ServeHTTP(w, loginReq)
cookie := w.Result().Cookies()[0]

// Use session cookie to access profile
profileReq := httptest.NewRequest("GET", "/api/profile", nil)
profileReq.AddCookie(cookie)
w2 := httptest.NewRecorder()
s.mux.ServeHTTP(w2, profileReq)
// assert w2.Code == 200 and JSON body
```

### Priority Integration Tests

1. Login → session cookie → authenticated request
2. Add firewall rule → rule appears in list
3. Restart service → audit log entry created
4. Revoke session → subsequent request returns 401

```bash
go test ./internal/api/... -run TestIntegration -v
```

---

## Level 5 — API Contract Tests

Verify the frontend and backend agree on JSON response shapes. Catches mismatches before they reach users.

**Location:** `web/src/__tests__/apiContract.test.ts`

### What is tested

- `/api/csrf-token` returns `{ csrf_token: string }`
- `/api/profile` returns JSON (not HTML — the SPA catch-all bug)
- 401 responses produce "Unauthorized" errors (not JSON parse failures)
- 403 responses produce "Access denied" errors
- HTML responses from catch-all throw a clear error message

```bash
cd web && npx vitest run src/__tests__/apiContract.test.ts
```

### The Profile Bug (Fixed)

**Root cause:** The pre-built Go binary was missing `/api/profile` routes. Unmatched requests fell through to the SPA catch-all, which served `index.html` (HTML with 200 status). The frontend's `fetch` wrapper then called `res.json()` on HTML, causing:

```
Failed to execute 'json' on 'Response': Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

**Fix applied in `web/src/lib/api.ts`:** Added a `content-type` check before calling `res.json()`. If the server returns HTML instead of `application/json`, a clear error is thrown:

```
API endpoint unavailable or not responding with JSON. The server may still be starting up.
```

**Fix applied in `start-dev.sh`:** Added `/home/runner/.nix-profile/bin` to `PATH` so Go is found and the binary is rebuilt fresh on every start.

---

## Level 6 — End-to-End (E2E) Tests

Real browser, real user flows. Highest confidence, slowest to run.

**Stack:** Playwright

**Setup:**

```bash
cd web && npm install -D @playwright/test
npx playwright install chromium
```

**Example test:**

```ts
// e2e/login.spec.ts
import { test, expect } from '@playwright/test'

test('login and view dashboard', async ({ page }) => {
  await page.goto('/')
  await page.fill('[name=username]', 'admin')
  await page.fill('[name=password]', 'changeme')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL('/dashboard')
  await expect(page.locator('h1')).toContainText('Overview')
})
```

**Priority Flows (implement in order):**

1. Login → Dashboard
2. Login → Profile page (no errors)
3. Login → Firewall → Add rule → Rule appears
4. Login → Services → Restart service
5. Login → Logout → Session cleared

```bash
npx playwright test
npx playwright test --headed    # watch in browser
npx playwright test e2e/login.spec.ts
```

---

## Level 7 — Smoke Tests

Minimal checks after every deploy. Run in under 30 seconds.

**Location:** `web/src/__tests__/smoke.test.ts`

```bash
cd web && npx vitest run src/__tests__/smoke.test.ts
```

**Manual smoke checklist (post-deploy):**

```bash
# Backend health
curl -f http://localhost:3000/api/csrf-token

# Frontend loads
curl -f http://localhost:5000/ | grep -q "<title>"

# API returns JSON (not HTML)
curl -I http://localhost:3000/api/profile | grep "content-type"

# WebSocket connects
wscat -c ws://localhost:3000/ws/metrics
```

---

## Level 8 — Regression Tests

Write a test immediately when a bug is found so it never returns.

**Process:**

1. Bug found → write a failing test that reproduces it
2. Fix the bug → test passes
3. Test stays in the suite forever

**Documented regressions:**

| Bug | Test File | Test Name |
|---|---|---|
| Profile page returns HTML instead of JSON (SPA catch-all) | `apiContract.test.ts` | "throws a clear message when server returns HTML instead of JSON" |
| JWT with wrong secret accepted | `auth_test.go` | `TestVerifyToken_WrongSecret` |
| Path traversal via safeRoot | `helpers_test.go` | `TestSafeRootMethod` |
| SQL injection via DB identifier | `validators_test.go` | `TestValidateDBIdentifier_Invalid` |

---

## Level 9 — Security Tests

Critical for Orbit. These protect your infrastructure.

### Dependency Audit

```bash
# Frontend
cd web && npm audit

# Go dependencies
export PATH="/home/runner/.nix-profile/bin:$PATH"
go list -m all | nancy sleuth
```

### Static Security Scan (SAST)

```bash
# Go — gosec
go install github.com/securego/gosec/v2/cmd/gosec@latest
gosec ./...

# JavaScript
npx audit-ci --config audit-ci.json
```

### Manual Security Checklist (highest priority for Orbit)

| Check | Why Critical |
|---|---|
| SSH command injection | `multiserver.go` runs commands on remote hosts |
| Path traversal | `filesystem.go` serves files — `safeRoot` must block `../` |
| CSRF bypass | All state-changing endpoints require `X-CSRF-Token` |
| Auth bypass on API routes | Every `/api/*` route must return 401, not the SPA HTML |
| Shell injection in firewall rules | UFW commands are built from user input |
| JWT with wrong secret accepted | `internal/auth/auth.go` |
| Session revocation | Sessions must be checked in DB, not just JWT expiry |

### Tools

- **OWASP ZAP** — active scanner for auth bypass, XSS, SQLi
- **Trivy** — container and dependency CVE scan
- **govulncheck** — Go-specific vulnerability checker

```bash
govulncheck ./...
```

---

## Level 10 — Performance Tests

Check speed under load. Important for Orbit's log streaming and metrics endpoints.

**Stack:** k6

```js
// perf/logs.js
import http from 'k6/http'
export default function () {
  http.get('http://localhost:3000/api/logs/entries?limit=1000')
}
```

```bash
k6 run --vus 50 --duration 30s perf/logs.js
```

**Key targets:**

| Endpoint | Max Latency (p99) |
|---|---|
| `GET /api/metrics/snapshot` | < 100ms |
| `GET /api/logs/entries` (1000 lines) | < 500ms |
| `POST /api/firewall/rules` | < 200ms |
| WebSocket metrics stream | < 50ms per frame |

---

## Level 11 — Reliability / Chaos Tests

Orbit manages real infrastructure — it must degrade gracefully, not silently corrupt state.

**Scenarios to test manually:**

```bash
# DB disconnect mid-request
pkill -STOP orbit-linux-amd64 && sleep 1 && pkill -CONT orbit-linux-amd64

# SSH timeout (multiserver)
iptables -A OUTPUT -p tcp --dport 22 -j DROP
# Test that SSH command returns timeout error, not hang

# Disk full
fallocate -l 10G /tmp/fill && ls internal/api/static/
# Ensure server returns 503, not panic

# Container restart during deploy
docker restart orbit && curl -f http://localhost:3000/api/csrf-token
```

---

## Level 12 — Accessibility Tests

```bash
cd web && npx axe-core-npm/cli http://localhost:5000
```

**Manual checks:**

- All form inputs have visible labels
- Buttons have descriptive `aria-label` or text content
- Keyboard navigation works (Tab through all interactive elements)
- Focus indicators are visible
- Color is not the only way to convey status (check status badges)

---

## Level 13 — Visual Regression Tests

Detect accidental UI layout breaks.

**Stack:** Playwright screenshots + pixelmatch

```bash
npx playwright test --update-snapshots   # capture baseline
npx playwright test                       # compare against baseline
```

**Priority pages:**

- Dashboard / Overview
- Firewall rules table
- Profile page
- Login page

---

## Level 14 — Install / Upgrade Tests

Critical for self-hosted Orbit users.

```bash
# Fresh install
docker run --rm -v /tmp/orbit-test:/data ubuntu:22.04 bash -c \
  "curl -fsSL https://raw.githubusercontent.com/.../install.sh | bash"

# Upgrade test
# 1. Start v1 with real data
# 2. Run upgrade script
# 3. Verify config and data preserved
```

---

## Current Coverage Status

Run to see current coverage:

```bash
# Frontend coverage
cd web && npx vitest run --coverage
# Opens: web/coverage/index.html

# Go coverage
export PATH="/home/runner/.nix-profile/bin:$PATH"
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out
```

### Coverage Targets

| Layer | Now | Month 1 Target | Month 3 Target |
|---|---|---|---|
| Go validators | ~70% | 90% | 95% |
| Go auth | ~80% | 90% | 95% |
| Go API handlers | ~10% | 40% | 70% |
| Frontend utils | ~60% | 80% | 90% |
| Frontend components | 0% | 30% | 60% |
| Overall | ~20% | 50% | 70% |

---

## Recommended PR Checklist

Every pull request should pass:

```bash
# 1. TypeScript
cd web && npx tsc --noEmit

# 2. Lint
cd web && npx eslint . --ext ts,tsx --max-warnings 0

# 3. Frontend unit tests
cd web && npx vitest run

# 4. Go vet + tests
export PATH="/home/runner/.nix-profile/bin:$PATH"
go vet ./...
go test ./... -race -count=1

# 5. Build check
cd web && npx vite build --outDir /tmp/orbit-build-check
```

---

## Test Files Index

### Frontend (`web/src/__tests__/`)

| File | Level | Tests | Focus |
|---|---|---|---|
| `setup.ts` | — | (setup) | jsdom stubs, matchMedia, ResizeObserver, localStorage |
| `api.test.ts` | 5 | 3 | CSRF token fetch contract |
| `apiContract.test.ts` | 5 | 9 | JSON response shape, HTML guard, status codes |
| `auth.test.ts` | 2 | 4 | Auth store state management |
| `metrics.test.ts` | 2 | 15 | Metric formatters, status thresholds, aggregation |
| `permissions.test.ts` | 2 | 13 | Scope/role checks, route guards |
| `profile.test.ts` | 2 | 18 | Security score, initials, password strength |
| `security-checklist.test.ts` | 2 | 25 | Score computation, filters, trend seeding |
| `smoke.test.ts` | 7 | 4 | Critical path smoke checks |
| `utils.test.ts` | 2 | 19 | Byte formatting, timestamps, slugify, clamp |
| `validators.test.ts` | 2 | 18 | IP, CIDR, DB identifiers, port validation |

### Backend (`internal/api/`)

| File | Level | Tests | Focus |
|---|---|---|---|
| `auth_test.go` | 2 | 5+ | JWT issuance, expiry, wrong secret |
| `helpers_test.go` | 2 | 6 | hashSHA256Hex, safeRoot path traversal |
| `profile_test.go` | 2/4 | 4 | requireAuth middleware, scopeAllowsWrite |
| `validators_test.go` | 2 | 12 | validateIP, validateIPOrCIDR, validateDBIdentifier, validatePortSpec |
| `fuzz_test.go` | 2 | fuzz | FuzzValidateDBIdentifier, FuzzValidateIP |

---

## Security — Highest Risk Files (Test These First)

Per the Orbit threat model, these files have the highest blast radius:

1. **`internal/api/firewall.go`** — 1,641 lines, builds shell commands from user input
2. **`internal/api/multiserver.go`** — SSH command execution on remote hosts
3. **`internal/api/middleware.go`** — Auth, CSRF, rate limiting for every request
4. **`internal/auth/auth.go`** — JWT issuance and verification
5. **`internal/api/profile.go`** — User self-service, session revocation
6. **`internal/api/terminal.go`** — WebSocket terminal, direct shell access
7. **`internal/api/filesystem.go`** — File browser with path traversal risk

---

## Phased Rollout Plan

### Phase 1 — Now (Days 1–3)

Already done:
- TypeScript typecheck
- ESLint
- Go vet
- Frontend unit tests (140+ passing)
- Go unit tests (validators, auth, middleware, helpers)
- Profile page HTML bug fixed

### Phase 2 — Week 1

- Go integration tests (login + profile + sessions)
- Frontend component tests for LoginPage, forms
- Add Go `newTestServer` helper with in-memory SQLite
- Target: 60 Go tests, 160 frontend tests

### Phase 3 — Week 2

- Integration tests for firewall rule CRUD
- Integration tests for service restart + audit log
- API contract tests with MSW for all main endpoints
- Target: 100 Go tests

### Phase 4 — Week 3

- Playwright E2E: login, profile, firewall flows
- Visual regression snapshots for key pages
- Target: 10 E2E flows

### Phase 5 — Week 4+

- Security scans (gosec, npm audit, govulncheck)
- Performance tests for log streaming (k6)
- Chaos tests for DB disconnect and SSH timeout
