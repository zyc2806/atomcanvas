#!/bin/bash
#
# Build the frontend and stage it into backend/static so one uvicorn process can
# serve the whole app (API + SPA). Run scripts/serve.sh afterwards — or just run
# serve.sh, which calls this for you when the bundle is missing.
#
set -euo pipefail

PROJECT_DIR=$(cd "$(dirname "$0")/.." && pwd)
FRONTEND_DIR="$PROJECT_DIR/frontend"
STATIC_DIR="$PROJECT_DIR/backend/static"

cd "$FRONTEND_DIR"
if [ ! -d node_modules ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
fi

echo "🏗️  Building frontend (tsc -b && vite build)..."
npm run build

echo "📂 Staging dist -> backend/static ..."
rm -rf "$STATIC_DIR"
mkdir -p "$STATIC_DIR"
cp -R "$FRONTEND_DIR/dist/." "$STATIC_DIR/"

echo "✅ Built. Serve the single-process app with: scripts/serve.sh"
