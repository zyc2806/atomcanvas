#!/bin/bash
# Dev server: uvicorn with --reload on port 8000.
#
# Python resolution (portable for collaborators, convenient locally):
#   1. $ATOMCANVAS_PYTHON if set
#   2. the local ase-view-env conda interpreter, if it exists
#   3. plain `python` on PATH, else `python3` (many machines ship only python3)
cd "$(dirname "$0")"

DEFAULT_CONDA_PY="$HOME/miniconda3/envs/ase-view-env/bin/python"
PY="${ATOMCANVAS_PYTHON:-}"
if [ -z "$PY" ]; then
    if [ -x "$DEFAULT_CONDA_PY" ]; then PY="$DEFAULT_CONDA_PY"
    elif command -v python >/dev/null 2>&1; then PY="python"
    else PY="python3"; fi
fi

exec "$PY" -m uvicorn app.main:app --reload --port 8000
