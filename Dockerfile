# AtomCanvas — single-image, single-process build.
#
# This packages the exact "one command, one port" recipe from scripts/serve.sh:
# build the React SPA, stage it into the backend's static dir, and serve both the
# API and the SPA from one uvicorn process. It is the no-toolchain way to run
# AtomCanvas on your own machine — you need only Docker, not Node/Python/conda —
# and the Linux runtime always pulls a manylinux rdkit wheel, so it works even on
# Intel Macs (where the rdkit x86_64 macOS wheel is missing).
#
#   docker build -t atomcanvas .
#   docker run --rm -p 8000:8000 atomcanvas      # then open http://localhost:8000
#
# Override the in-container port with -e ATOMCANVAS_PORT=9000 -p 9000:9000.

# ── Stage 1: build the frontend bundle ──────────────────────────────────────
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend

# Install deps against the lockfile first (cached unless the lockfile changes).
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Build the SPA (tsc -b && vite build) -> /app/frontend/dist
COPY frontend/ ./
RUN npm run build

# ── Stage 2: python runtime serving API + SPA ───────────────────────────────
FROM python:3.12-slim-bookworm AS runtime

# Runtime shared libraries some scientific wheels dlopen at import time:
# libgomp1 (scikit-learn OpenMP), libxrender1/libxext6 (rdkit).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libxrender1 libxext6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install pinned Python deps first (cached unless requirements.txt changes).
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Backend source + a sample structure for the headless CLI.
COPY backend/ ./backend/
COPY fixtures/ ./fixtures/

# Drop the built SPA where FastAPI mounts it (backend/static), matching build.sh.
COPY --from=frontend-build /app/frontend/dist/ ./backend/static/

# Run as a non-root user.
RUN useradd --create-home --uid 10001 appuser && chown -R appuser:appuser /app
USER appuser

# uvicorn runs with backend/ as CWD so the `app` package is importable, exactly
# like scripts/serve.sh. Binding 0.0.0.0 is correct *inside* the container; you
# still reach it on your host at http://localhost:<published-port>.
WORKDIR /app/backend
EXPOSE 8000
ENV ATOMCANVAS_PORT=8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${ATOMCANVAS_PORT:-8000}"]
