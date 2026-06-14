#!/bin/bash
#
# One-command production run. Builds the frontend if needed, then serves the API
# and the bundled SPA from a SINGLE uvicorn process — one port, one URL:
#
#     http://localhost:8000
#
# Override with ATOMCANVAS_HOST / ATOMCANVAS_PORT / ATOMCANVAS_PYTHON.
#
set -euo pipefail

PROJECT_DIR=$(cd "$(dirname "$0")/.." && pwd)
STATIC_DIR="$PROJECT_DIR/backend/static"

# Build when the bundle is missing, or when ATOMCANVAS_REBUILD=1 forces a refresh.
# An EXISTING bundle is reused as-is — set ATOMCANVAS_REBUILD=1 after editing the
# frontend, or run scripts/build.sh yourself.
if [ ! -f "$STATIC_DIR/index.html" ] || [ "${ATOMCANVAS_REBUILD:-0}" = "1" ]; then
    echo "ℹ️  Building frontend bundle..."
    "$PROJECT_DIR/scripts/build.sh"
fi

# Same python resolution as backend/run.sh: env override -> local conda -> PATH.
DEFAULT_CONDA_PY="/Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python"
PY="${ATOMCANVAS_PYTHON:-}"
if [ -z "$PY" ]; then
    if [ -x "$DEFAULT_CONDA_PY" ]; then PY="$DEFAULT_CONDA_PY"; else PY="python"; fi
fi

# Bind to loopback by default. The backend has no auth, so only expose it on the
# LAN deliberately: ATOMCANVAS_HOST=0.0.0.0 scripts/serve.sh (trusted networks only).
HOST="${ATOMCANVAS_HOST:-127.0.0.1}"
PORT="${ATOMCANVAS_PORT:-8000}"

cd "$PROJECT_DIR/backend"
echo "🚀 AtomCanvas (API + SPA) on http://${HOST}:${PORT}"
if [ "$HOST" = "0.0.0.0" ]; then
    echo "⚠️  Bound to 0.0.0.0 — reachable on your LAN (no auth). Use a trusted network."
fi
exec "$PY" -m uvicorn app.main:app --host "$HOST" --port "$PORT"
