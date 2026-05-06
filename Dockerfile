# =============================================================================
#  Orbit — Multi-stage build Dockerfile
#  Builds the full stack from source (frontend + Go binary).
#
#  Usage:
#    docker build -t orbit .
#    docker run -d --name orbit \
#      --cap-add NET_ADMIN --cap-add SYS_PTRACE \
#      -p 5000:5000 \
#      -v orbit-data:/var/lib/orbit \
#      orbit
#
#  Or with Docker Compose:
#    cp .env.example .env
#    docker compose up -d
# =============================================================================

# ── Stage 1: Build React frontend ──────────────────────────────────────────
FROM node:20-alpine AS web-build
WORKDIR /app

COPY web/package*.json ./web/
RUN cd web && npm ci --prefer-offline

COPY web/ ./web/
RUN cd web && npm run build

# ── Stage 2: Build Go binary ────────────────────────────────────────────────
FROM golang:1.22-alpine AS go-build

RUN apk add --no-cache gcc musl-dev git

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Bring in the compiled frontend so go:embed picks it up
COPY --from=web-build /app/web/dist ./web/dist

ARG VERSION=docker
ENV CGO_ENABLED=1

RUN go build \
    -ldflags="-s -w -X main.version=${VERSION}" \
    -o /orbit \
    ./cmd/orbit

# ── Stage 3: Minimal production image ──────────────────────────────────────
FROM alpine:3.19

LABEL org.opencontainers.image.source="https://github.com/KenyanRedwoods01/Orbit"
LABEL org.opencontainers.image.description="Orbit — Security-First Server Management Platform"
LABEL org.opencontainers.image.licenses="AGPL-3.0"
LABEL maintainer="KenyanRedwoods01"

# Runtime dependencies
RUN apk add --no-cache ca-certificates tzdata wget && \
    addgroup -S orbit && \
    adduser  -S -G orbit orbit

COPY --from=go-build /orbit /usr/local/bin/orbit
RUN chmod +x /usr/local/bin/orbit

# Persistent volumes for config and data
VOLUME ["/etc/orbit", "/var/lib/orbit"]

# Default port 5000 — all Orbit ports must be in range 5000-6000
EXPOSE 5000

USER orbit
ENTRYPOINT ["/usr/local/bin/orbit"]
CMD ["--config", "/etc/orbit/orbit.toml"]
