#!/usr/bin/env bash
# Runs on first boot. Keep this minimal so SSM stays reachable;
# bootstrap.sh installs Docker after the instance is confirmed Online.
set -euo pipefail

APP_DIR="/opt/hodidit"

if id ubuntu >/dev/null 2>&1; then
  install -d -o ubuntu -g ubuntu "$APP_DIR"
else
  install -d "$APP_DIR"
fi
