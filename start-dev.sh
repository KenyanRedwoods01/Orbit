#!/usr/bin/env bash
set -e

echo "==> Building Orbit backend..."
# Try Go from nix profile first, then default PATH
GO_BIN=""
if [ -x "/home/runner/.nix-profile/bin/go" ]; then
  GO_BIN="/home/runner/.nix-profile/bin/go"
elif command -v go &>/dev/null; then
  GO_BIN="go"
fi

if [ -n "$GO_BIN" ]; then
  GOFLAGS="-buildvcs=false" "$GO_BIN" build -o orbit-linux-amd64 ./cmd/orbit/ 2>&1 && echo "  Built fresh binary" || {
    echo "  Build failed — falling back to pre-built binary"
    GO_BIN=""
  }
fi

if [ -z "$GO_BIN" ]; then
  echo "  go not available or build failed — using pre-built binary"
  if [ ! -f "./orbit-linux-amd64" ]; then
    if [ -f "./orbit" ]; then
      cp ./orbit ./orbit-linux-amd64
    else
      echo "ERROR: no orbit binary found and go is not available" >&2
      exit 1
    fi
  fi
  chmod +x ./orbit-linux-amd64
fi

echo "==> Starting Orbit backend on :3000..."
./orbit-linux-amd64 --config orbit.dev.toml &
BACKEND_PID=$!

echo "==> Installing web dependencies..."
cd web
if [ ! -d node_modules ]; then
  npm install --legacy-peer-deps
fi

echo "==> Starting Vite dev server on :5000..."
npm run dev

wait $BACKEND_PID
