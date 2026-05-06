#!/bin/bash
set -e

GOBIN=""
for dir in \
    /nix/store/p6b8p1jq18c60g0nv0xbmzdwi9z3n0ba-go-1.22.9/bin \
    /nix/store/00mg4vlhzmm7gi9bd5v5ydjlgrywpc3n-go-1.22.3/bin \
    /usr/local/go/bin \
    /usr/bin; do
    if [ -x "$dir/go" ]; then
        GOBIN="$dir/go"
        break
    fi
done

if [ -z "$GOBIN" ]; then
    echo "ERROR: go binary not found"
    exit 1
fi

echo "Using Go at: $GOBIN"
export GOPATH=/tmp/gopath
export GOCACHE=/home/runner/workspace/.cache/go-build
export CGO_ENABLED=1

# Build frontend if node_modules exist
if [ -d "/home/runner/workspace/web/node_modules" ]; then
    echo "Building frontend..."
    cd /home/runner/workspace/web
    node_modules/.bin/vite build --logLevel silent 2>&1 | tail -3 || true
    cd /home/runner/workspace
else
    echo "Skipping frontend build (node_modules not installed)"
fi

echo "Building orbit backend..."
"$GOBIN" build -o /tmp/orbit ./cmd/orbit

echo "Starting orbit backend on :5000..."
exec /tmp/orbit --config /home/runner/workspace/orbit.dev.toml
