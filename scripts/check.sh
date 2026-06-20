#!/bin/bash
#
# Local dev gate — mirrors exactly what CI checks.
# Run from the repo root before pushing / opening a PR.
#
# Usage:
#   scripts/check.sh
#
# All frontend tool invocations unset system proxy variables first, because on
# this machine the system HTTP proxy (127.0.0.1:15236) intercepts localhost and
# causes vitest / tsc / eslint / vite to hang indefinitely. CI runners have no
# proxy so no unset is needed there.
#
set -euo pipefail

PROJECT_DIR=$(cd "$(dirname "$0")/.." && pwd)

# Proxy-unset prefix for all frontend invocations.
NOPROXY="env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY NO_PROXY=localhost,127.0.0.1,::1"

# Python interpreter resolution: same order as backend/run.sh and scripts/serve.sh.
DEFAULT_CONDA_PY="$HOME/miniconda3/envs/ase-view-env/bin/python"
PY="${ATOMCANVAS_PYTHON:-}"
if [ -z "$PY" ]; then
    if [ -x "$DEFAULT_CONDA_PY" ]; then PY="$DEFAULT_CONDA_PY"
    elif command -v python >/dev/null 2>&1; then PY="python"
    else PY="python3"; fi
fi

echo "========================================"
echo " AtomCanvas local gate"
echo "========================================"
echo "  Python : $PY"
echo "  Node   : $(node --version 2>/dev/null || echo 'not found')"
echo "========================================"

# ----------------------------------------------------------------------------
# Frontend checks
# ----------------------------------------------------------------------------
echo ""
echo "──────────────────────────────────────────"
echo " Frontend: lint"
echo "──────────────────────────────────────────"
cd "$PROJECT_DIR/frontend"
$NOPROXY npm run lint

echo ""
echo "──────────────────────────────────────────"
echo " Frontend: type-check (tsc -b)"
echo "──────────────────────────────────────────"
$NOPROXY npx tsc -b

echo ""
echo "──────────────────────────────────────────"
echo " Frontend: unit tests (vitest run)"
echo "──────────────────────────────────────────"
$NOPROXY npm run test

echo ""
echo "──────────────────────────────────────────"
echo " Frontend: production build"
echo "──────────────────────────────────────────"
$NOPROXY npm run build

# ----------------------------------------------------------------------------
# Backend checks
# ----------------------------------------------------------------------------
echo ""
echo "──────────────────────────────────────────"
echo " Backend: pytest"
echo "──────────────────────────────────────────"
cd "$PROJECT_DIR/backend"
"$PY" -m pytest -q

# ----------------------------------------------------------------------------
# Done
# ----------------------------------------------------------------------------
echo ""
echo "========================================"
echo " All checks passed."
echo "========================================"
