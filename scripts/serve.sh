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
# Also detect a STALE bundle: if index.html exists but any file under frontend/src/
# is newer, the bundle is out of date. In that case we rebuild automatically unless
# ATOMCANVAS_FORCE_STALE=1 is set (which skips the freshness check and serves the
# existing bundle as-is — use only when a rebuild is intentionally deferred).
if [ ! -f "$STATIC_DIR/index.html" ] || [ "${ATOMCANVAS_REBUILD:-0}" = "1" ]; then
    echo "ℹ️  Building frontend bundle..."
    "$PROJECT_DIR/scripts/build.sh"
elif [ "${ATOMCANVAS_FORCE_STALE:-0}" != "1" ]; then
    # Freshness check: find any frontend/src file newer than the bundle.
    STALE_FILE=$(find "$PROJECT_DIR/frontend/src" -newer "$STATIC_DIR/index.html" -type f | head -1)
    if [ -n "$STALE_FILE" ]; then
        echo "⚠️  Bundle is stale (frontend/src has changes since last build)."
        echo "    Newest changed file: ${STALE_FILE#$PROJECT_DIR/}"
        echo "ℹ️  Rebuilding frontend bundle... (set ATOMCANVAS_FORCE_STALE=1 to skip)"
        "$PROJECT_DIR/scripts/build.sh"
    fi
fi

# Same python resolution as backend/run.sh: env override -> local conda ->
# `python` on PATH, else `python3` (many machines ship only python3).
DEFAULT_CONDA_PY="$HOME/miniconda3/envs/ase-view-env/bin/python"
PY="${ATOMCANVAS_PYTHON:-}"
if [ -z "$PY" ]; then
    if [ -x "$DEFAULT_CONDA_PY" ]; then PY="$DEFAULT_CONDA_PY"
    elif command -v python >/dev/null 2>&1; then PY="python"
    else PY="python3"; fi
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
