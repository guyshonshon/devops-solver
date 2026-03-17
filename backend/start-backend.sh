#!/usr/bin/env bash
set -euo pipefail

PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/ms-playwright}"
export PLAYWRIGHT_BROWSERS_PATH

mkdir -p "${PLAYWRIGHT_BROWSERS_PATH}"

# Keep browser binaries out of the image layers. Install once into a mounted volume.
if ! find "${PLAYWRIGHT_BROWSERS_PATH}" -maxdepth 1 -type d -name 'chromium-*' | grep -q .; then
  echo "[startup] Installing Playwright Chromium into ${PLAYWRIGHT_BROWSERS_PATH}..."
  playwright install chromium
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
