# Contributing to Orbit

Thanks for wanting to help! Here's how to get started.

## Development setup

**Prerequisites:** Go 1.22+, Node 20+, gcc (for CGO/sqlite3)

```bash
git clone https://github.com/KenyanRedwoods01/Orbit.git
cd Orbit

# Install frontend dependencies and start in watch mode
cd web && npm install && npm run dev &

# Build frontend once (required for first run)
cd web && npm run build && cd ..

# Run backend (serves panel on port 5000)
go run ./cmd/orbit --config orbit.example.toml
```

The Vite dev server runs on port 5173 and proxies `/api` and `/ws` to the Go daemon on port 5000.

## Before opening a PR

```bash
# Go
golangci-lint run
go test ./...

# Frontend
cd web && npm run lint && npm run typecheck
```

## Adding a module

1. Create `internal/modules/<name>/<name>.go` implementing `plugin.Module`.
2. Register it in `cmd/orbit/main.go`.
3. Add a page under `web/src/pages/<name>/`.
4. Add a route in `web/src/App.tsx` and a nav link in `web/src/components/layout/Layout.tsx`.
5. Document it in `README.md`.

## Commit style

```
feat: add uptime monitor HTTP check
fix: firewall rule not persisting after reload
docs: update MCP scope table
chore: bump goreleaser to v2
```

## License

By contributing you agree your code is licensed under AGPL-3.0.
