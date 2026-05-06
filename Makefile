# =============================================================================
#  Orbit — Development Makefile
# =============================================================================

BINARY        := orbit
BUILD_DIR     := dist
GO_CMD        := go
WEB_DIR       := web
DEFAULT_PORT  := 5000

.PHONY: help build run dev test lint clean docker-build docker-run \
        web-install web-build web-dev release-snapshot

help: ## Show available commands
        @echo ""
        @echo "  Orbit Development Commands"
        @echo "  ════════════════════════════════"
        @awk 'BEGIN{FS=":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
        @echo ""

# ── Go backend ────────────────────────────────────────────────────────────────

build: web-build ## Build the full binary (frontend + backend)
        @mkdir -p $(BUILD_DIR)
        CGO_ENABLED=1 $(GO_CMD) build -ldflags="-s -w -X main.version=$$(git describe --tags --always --dirty)" \
                -o $(BUILD_DIR)/$(BINARY) ./cmd/orbit
        @echo "  ✓ Binary → $(BUILD_DIR)/$(BINARY)"

run: ## Run Orbit in development mode (auto-detects config)
        $(GO_CMD) run ./cmd/orbit --config orbit.example.toml

dev: web-dev ## Start the Go backend with live-reload (requires 'air')
        air -c .air.toml

test: ## Run all Go tests
        $(GO_CMD) test ./... -v -race -count=1

lint: ## Run golangci-lint
        golangci-lint run ./...

vet: ## Run go vet
        $(GO_CMD) vet ./...

clean: ## Remove build artefacts
        rm -rf $(BUILD_DIR)
        rm -rf $(WEB_DIR)/dist

# ── Frontend ──────────────────────────────────────────────────────────────────

web-install: ## Install Node dependencies
        cd $(WEB_DIR) && npm ci

web-build: web-install ## Build the React frontend (output embedded in binary)
        cd $(WEB_DIR) && npm run build

web-dev: web-install ## Start the Vite dev server (proxies to Go backend)
        cd $(WEB_DIR) && npm run dev

# ── Docker ────────────────────────────────────────────────────────────────────

docker-build: build ## Build the production Docker image
        docker build -t orbit:dev .

docker-run: ## Run Orbit via Docker on port 5000
        docker run --rm -it \
                --cap-add NET_ADMIN --cap-add SYS_PTRACE \
                -p $(DEFAULT_PORT):$(DEFAULT_PORT) \
                -v orbit-data:/var/lib/orbit \
                -e ORBIT_LISTEN_ADDR=0.0.0.0:$(DEFAULT_PORT) \
                orbit:dev

docker-compose-up: ## Start the full stack via Docker Compose
        docker compose up -d

docker-compose-down: ## Stop all Docker Compose services
        docker compose down

# ── Releases ──────────────────────────────────────────────────────────────────

release-snapshot: ## Build a local GoReleaser snapshot (no publish)
        goreleaser release --snapshot --clean

install-local: build ## Install the binary to /usr/local/bin
        sudo install -m 0755 $(BUILD_DIR)/$(BINARY) /usr/local/bin/$(BINARY)
        @echo "  ✓ Installed /usr/local/bin/$(BINARY)"
