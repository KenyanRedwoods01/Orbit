# Contributing to Orbit VPS

Thank you for your interest in contributing to Orbit VPS! This document covers everything you need to get started.

## Repository

**GitHub:** [https://github.com/KenyanRedwoods01/Orbit](https://github.com/KenyanRedwoods01/Orbit)

## Development Setup

### Prerequisites
- Go 1.22+
- Node 20+
- Git

### Getting started

```bash
git clone https://github.com/KenyanRedwoods01/Orbit.git
cd Orbit

# Install frontend dependencies and run in dev mode
cd web && npm install && npm run dev &

# Run backend (builds and serves on :5000)
bash scripts/run-backend.sh
```

The Vite dev server proxies `/api` and `/ws` to the Go backend.

### First login
Complete the setup wizard at `http://localhost:5000` to create the admin account.

---

## Project Structure

```
Orbit/
├── cmd/orbit/           # Entry point (main.go)
├── internal/
│   ├── api/             # HTTP handlers (one file per feature module)
│   ├── auth/            # JWT session handling, bcrypt, TOTP
│   ├── collector/       # OS metric collection via gopsutil
│   ├── config/          # orbit.toml configuration loading
│   └── db/              # SQLite + BoltDB init, migrations, schema
├── web/                 # React 18 + Vite 5 + TypeScript frontend
│   └── src/
│       ├── components/  # Shared UI components (XtermTerminal, etc.)
│       ├── lib/         # API client (api.ts)
│       ├── pages/       # One directory per route/feature
│       └── stores/      # Zustand global state
├── scripts/             # Build and run scripts
├── orbit.dev.toml       # Development configuration
└── docs/                # Extended documentation
```

---

## Making Changes

### Backend (Go)

1. Handlers live in `internal/api/` — one file per feature
2. Add new routes in `internal/api/server.go` inside `registerRoutes()`
3. DB schema changes go in `internal/db/db.go` using `CREATE TABLE IF NOT EXISTS`
4. Run: `bash scripts/run-backend.sh` to test

### Frontend (React + TypeScript)

1. New pages go in `web/src/pages/<feature>/`
2. API functions go in `web/src/lib/api.ts`
3. Use `useQuery` from TanStack Query for data fetching
4. Use `useMutation` for state-changing operations
5. Run: `cd web && npm run dev` for hot-reload dev

### Code style

- **Go**: Run `golangci-lint run` before submitting
- **Frontend**: Run `cd web && npm run lint` before submitting
- No emojis in UI — use SVG icons only
- All border radii in the UI: 7px
- Keep components small and focused

---

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and test locally
4. Run linters:
   ```bash
   golangci-lint run
   cd web && npm run lint && npm run build
   ```
5. Write a clear PR description explaining what changed and why
6. Link any related issues

### PR checklist
- [ ] Backend builds cleanly (`go build ./...`)
- [ ] Frontend builds cleanly (`npm run build`)
- [ ] No new lint errors
- [ ] No mock data left in production paths
- [ ] New API endpoints are authenticated (`requireAuth` middleware)
- [ ] New DB tables use `CREATE TABLE IF NOT EXISTS`

---

## Reporting Bugs

Open an issue at [github.com/KenyanRedwoods01/Orbit/issues](https://github.com/KenyanRedwoods01/Orbit/issues) with:

- **Summary**: One-line description of the bug
- **Steps to reproduce**: Numbered list
- **Expected vs actual behavior**
- **Environment**: OS, Go version, browser

---

## Feature Requests

Open an issue with the label `enhancement`. Describe:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives considered

---

## License

By contributing, you agree that your contributions will be licensed under the project's [AGPL-3.0 License](LICENSE).
