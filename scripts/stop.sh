#!/bin/bash
#
# Stop the AtomCanvas dev stack started by start.sh. Kills the PIDs recorded in
# /tmp/atomcanvas.pids (and the per-service files), then sweeps ports 8000/3000
# as a failsafe.
#
set -u

PROJECT_DIR=$(cd "$(dirname "$0")/.." && pwd)
LOGS_DIR="$PROJECT_DIR/logs"
PID_FILE="/tmp/atomcanvas.pids"
BACKEND_PID_FILE="$LOGS_DIR/backend.pid"
FRONTEND_PID_FILE="$LOGS_DIR/frontend.pid"

echo "🛑 Stopping AtomCanvas services..."

kill_pid() {
    local pid="$1"
    local label="$2"
    if [ -z "$pid" ]; then
        return
    fi
    if ps -p "$pid" > /dev/null 2>&1; then
        kill -TERM "$pid" 2>/dev/null || true
        echo "✅ Sent TERM to $label (PID: $pid)"
        sleep 1
        if ps -p "$pid" > /dev/null 2>&1; then
            kill -KILL "$pid" 2>/dev/null || true
            echo "🧹 $label persisted, sent KILL (PID: $pid)"
        fi
    else
        echo "⚠️  $label PID $pid not running."
    fi
}

# Kill everything recorded in the shared PID file.
if [ -f "$PID_FILE" ]; then
    while read -r pid; do
        kill_pid "$pid" "service"
    done < "$PID_FILE"
    rm -f "$PID_FILE"
else
    echo "⚠️  PID file $PID_FILE not found."
fi

# Per-service PID files (in case the shared file was lost).
if [ -f "$FRONTEND_PID_FILE" ]; then
    kill_pid "$(cat "$FRONTEND_PID_FILE")" "frontend"
    rm -f "$FRONTEND_PID_FILE"
fi
if [ -f "$BACKEND_PID_FILE" ]; then
    kill_pid "$(cat "$BACKEND_PID_FILE")" "backend"
    rm -f "$BACKEND_PID_FILE"
fi

# Failsafe: sweep the ports if anything is still listening.
if lsof -i :8000 > /dev/null 2>&1; then
    echo "🧹 Cleaning up remaining processes on port 8000..."
    lsof -ti :8000 | xargs kill -TERM 2>/dev/null || true
    sleep 1
    lsof -ti :8000 | xargs kill -KILL 2>/dev/null || true
fi

if lsof -i :3000 > /dev/null 2>&1; then
    echo "🧹 Cleaning up remaining processes on port 3000..."
    lsof -ti :3000 | xargs kill -TERM 2>/dev/null || true
    sleep 1
    lsof -ti :3000 | xargs kill -KILL 2>/dev/null || true
fi

echo "✅ All services stopped."
