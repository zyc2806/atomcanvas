#!/bin/bash
cd "$(dirname "$0")"
exec /Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python -m uvicorn app.main:app --reload --port 8000
