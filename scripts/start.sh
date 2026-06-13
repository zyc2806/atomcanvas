#!/bin/bash
#
# Start the AtomCanvas dev stack: FastAPI backend (port 8000) + Vite frontend
# (port 3000). PIDs are recorded in /tmp/atomcanvas.pids and in the logs dir so
# stop.sh can tear the stack down. Logs land in <project>/logs.
#
set -u

PROJECT_DIR=$(cd "$(dirname "$0")/.." && pwd)
LOGS_DIR="$PROJECT_DIR/logs"
PID_FILE="/tmp/atomcanvas.pids"
BACKEND_PID_FILE="$LOGS_DIR/backend.pid"
FRONTEND_PID_FILE="$LOGS_DIR/frontend.pid"

LOCAL_NO_PROXY="localhost,127.0.0.1,::1"

mkdir -p "$LOGS_DIR"

build_no_proxy() {
    local current="$1"
    if [ -n "$current" ]; then
        echo "$current,$LOCAL_NO_PROXY"
    else
        echo "$LOCAL_NO_PROXY"
    fi
}

# ----------------------------------------------------------------------------
# Pre-flight checks
# ----------------------------------------------------------------------------
if [ ! -d "$PROJECT_DIR/frontend/node_modules" ]; then
    echo "❌ Error: Frontend dependencies not found."
    echo "Please run: cd frontend && npm install"
    exit 1
fi

if lsof -i :8000 > /dev/null 2>&1; then
    echo "❌ Error: Port 8000 is already in use (Backend)."
    exit 1
fi

if lsof -i :3000 > /dev/null 2>&1; then
    echo "❌ Error: Port 3000 is already in use (Frontend)."
    echo "Vite requires port 3000 to match the API proxy configuration."
    exit 1
fi

# Reset the shared PID file.
: > "$PID_FILE"

# ----------------------------------------------------------------------------
# Backend
# ----------------------------------------------------------------------------
echo "🚀 Starting AtomCanvas backend..."
cd "$PROJECT_DIR/backend"
nohup ./run.sh > "$LOGS_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$BACKEND_PID_FILE"
echo "$BACKEND_PID" >> "$PID_FILE"
echo "✅ Backend started (PID: $BACKEND_PID)"

echo "⏳ Waiting for backend to be ready..."
for i in $(seq 1 30); do
    if curl --noproxy "*" -s http://127.0.0.1:8000/docs > /dev/null 2>&1; then
        echo "✅ Backend is ready!"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "❌ Backend failed to start within 30 seconds."
        echo "Check logs: cat $LOGS_DIR/backend.log"
        exit 1
    fi
    sleep 1
done

# ----------------------------------------------------------------------------
# Frontend
# ----------------------------------------------------------------------------
echo "🚀 Starting AtomCanvas frontend..."
cd "$PROJECT_DIR/frontend"

FRONTEND_NO_PROXY=$(build_no_proxy "${NO_PROXY:-}")
FRONTEND_no_proxy=$(build_no_proxy "${no_proxy:-}")

nohup env \
    -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
    -u http_proxy -u https_proxy -u all_proxy \
    NO_PROXY="$FRONTEND_NO_PROXY" \
    no_proxy="$FRONTEND_no_proxy" \
    npm run dev > "$LOGS_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$FRONTEND_PID_FILE"
echo "$FRONTEND_PID" >> "$PID_FILE"
echo "✅ Frontend started (PID: $FRONTEND_PID)"

echo "⏳ Waiting for frontend to be ready..."
for i in $(seq 1 45); do
    if curl --noproxy "*" --max-time 5 -fsS http://127.0.0.1:3000/@vite/client > /dev/null 2>&1; then
        echo "✅ Frontend is ready!"
        break
    fi
    if [ "$i" -eq 45 ]; then
        echo "❌ Frontend failed to serve the Vite client within 45 seconds."
        echo "Check logs: cat $LOGS_DIR/frontend.log"
        exit 1
    fi
    sleep 1
done

# ----------------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------------
echo ""
echo "🎉 AtomCanvas services started successfully!"
echo "---------------------------------------------"
echo "🌍 Web App:  http://localhost:3000"
echo "🔌 API Docs: http://localhost:8000/docs"
echo "---------------------------------------------"
echo "📋 To view logs:"
echo "   tail -f $LOGS_DIR/backend.log"
echo "   tail -f $LOGS_DIR/frontend.log"
echo "🛑 To stop:  scripts/stop.sh"
echo "---------------------------------------------"
