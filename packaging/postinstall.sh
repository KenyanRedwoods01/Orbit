#!/bin/bash
set -e
# Create orbit system user if it doesn't exist
if ! id -u orbit >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin orbit
fi
mkdir -p /var/lib/orbit /run/orbit
chown orbit:orbit /var/lib/orbit /run/orbit
systemctl daemon-reload
echo "Run: systemctl enable --now orbit"
