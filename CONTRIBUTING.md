# Contributing to AtomCanvas

AtomCanvas is a **visualization-only** atomic-structure viewer. This document
covers the developer workflow: environment setup, running the gate, test
conventions, branch flow, and key anti-patterns to avoid.

## Scope guardrail

AtomCanvas is **visualization-only** and deliberately contains **no**
calculation, MD, or HPC code. If a task involves trajectory *generation*,
geometry optimization, or running simulations, it is out of scope — playing back
an already-loaded trajectory (a viewing feature) is in scope, generating one is
not. Keep contributions focused on rendering, editing, selection, and export.

## Environment setup

### Backend

The backend requires ASE, RDKit, NumPy, SciPy, and friends, on **Python
3.10–3.13**. Install them into any virtual environment (conda works too, but is
not required):

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
pip install -r backend/requirements-dev.txt   # pytest + httpx, to run the tests
```

The helper scripts pick the interpreter from `$ATOMCANVAS_PYTHON` if it is set,
otherwise fall back to `python` (then `python3`) on your PATH — so activate your
environment, or point the scripts at a specific interpreter:

```bash
export ATOMCANVAS_PYTHON=/path/to/your/python
scripts/check.sh
```

### Frontend

```bash
cd frontend
npm install   # first time only
```

No global installs needed — all tools (eslint, tsc, vitest, vite) run via
`npx` / `npm run`.

## Running the local gate

**Before pushing or opening a PR, run the full gate:**

```bash
scripts/check.sh
```

This mirrors exactly what CI checks: frontend lint → tsc -b → vitest → build,
then backend pytest.

### Proxy caveat (localhost HTTP proxy)

If your machine routes localhost through an HTTP proxy (common with some
corporate or VPN setups), vitest, tsc, eslint, and vite can **hang
indefinitely** when the proxy vars are set. `scripts/check.sh` bakes in the
required unset prefix automatically:

```
env -u http_proxy -u https_proxy -u all_proxy \
    -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
    NO_PROXY=localhost,127.0.0.1,::1
```

Setting `NO_PROXY` alone is **not** sufficient — all proxy vars must be unset.
Hosted CI runners have no proxy, so this only matters for local development.

## Dev commands

### Dev stack (two processes)

```bash
scripts/start.sh    # backend :8000 + frontend :3000; logs in ./logs
scripts/stop.sh     # tear both down
```

Then open http://localhost:3000.

### Single-process (sharing / no Vite)

```bash
scripts/serve.sh                        # builds if bundle missing, then API + SPA at :8000
ATOMCANVAS_REBUILD=1 scripts/serve.sh   # force a frontend rebuild first
```

### Backend only

```bash
cd backend
./run.sh     # uvicorn --reload :8000
```

### Frontend only

```bash
cd frontend
npm run dev     # Vite :3000 (proxies /api -> :8000)
```

## Node version

CI and `.nvmrc` pin **Node 22 LTS** for portability on hosted runners. A newer
local Node is usually fine for day-to-day dev, but if you hit tool-version
issues, switch to Node 22 via `nvm use 22` or `nvm use` (which reads `.nvmrc`).

## Test conventions

### Backend (pytest)

- Location: `backend/tests/`
- Runner: `python -m pytest -q` (activate your env, or set `$ATOMCANVAS_PYTHON`)
- Fixtures live in `backend/tests/conftest.py`
- Use FastAPI `TestClient` for route tests; pure functions in `services/` get
  plain unit tests

### Frontend (vitest)

- Location: `frontend/src/**/*.test.ts(x)`
- Runner: `npm run test` (vitest run)
- Setup: `frontend/src/test/setup.ts`
- Environment: jsdom

**NEVER mount `<Canvas>` in vitest tests.** React Three Fiber's `<Canvas>`
requires a real WebGL context; jsdom provides none. The test runner hangs
forever (or segfaults) if you attempt it. Test store logic, service functions,
and non-Canvas components in isolation; use the Playwright e2e suite
(`npm run e2e`) for anything that needs the real 3D canvas.

### End-to-end (Playwright)

```bash
cd frontend
npm run e2e
```

`playwright.config.ts` auto-starts both servers and bypasses the proxy. Run
with the proxy-unset prefix if your machine has a localhost proxy:

```bash
env -u http_proxy -u https_proxy -u all_proxy \
    -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
    NO_PROXY=localhost,127.0.0.1,::1 \
    npm run e2e
```

## Pre-commit hook (optional but recommended)

Install a fast local gate (eslint + tsc on staged `.ts`/`.tsx` files) with:

```bash
scripts/install-hooks.sh
```

The hook template is at `scripts/hooks/pre-commit` (tracked in version control).
The hook does NOT run vitest or the full build — those are in `scripts/check.sh`.
To skip the hook once: `git commit --no-verify`.

## Branch and PR flow

1. Branch off `main` as `feat/*` or `fix/*`:
   ```bash
   git checkout main && git pull
   git checkout -b feat/my-feature
   ```
2. Make changes; run `scripts/check.sh` until the gate is green.
3. Open a PR against `main`. CI runs the same gate automatically.
4. The PR must have a passing CI run before merging.

## Key anti-patterns (do not reintroduce)

- **No heavy ASE/RDKit work inside `async def` route handlers.** Blocking
  CPU-bound calls stall the event loop. Keep the science in plain (sync) service
  functions; hand work to a threadpool if a route must do real work.
- **Never leak Python tracebacks in HTTP responses.** Translate failures into
  `HTTPException` with a clean message; log the stacktrace server-side.
- **Routers stay thin.** HTTP/validation in `routers/`, logic in `services/`.
  Services must not import FastAPI.
- **Frontend: no API calls in components.** Use the `services/` layer.
- **No single mega-store.** Use the sliced Zustand store (`store/slices/`).
- **No direct DOM / Three.js mutations.** Use R3F abstractions (refs, `useFrame`,
  `InstancedMesh`, drei helpers).
- **Stateless backend.** There is no in-memory Atoms cache. The full structure
  travels with every request. Do not reintroduce server-side session state.
- **Bond ids are `min-max`.** A bond between atoms `i` and `j` is always keyed
  `${Math.min(i,j)}-${Math.max(i,j)}`. Never emit `j-i` when `j > i`.
- **`scene.json`/`style.json` schema gate.** Bump `SCHEMA_VERSION` in
  `frontend/src/services/sceneDocument.ts` for breaking document-shape changes;
  reject imports from a newer schema rather than silently misreading them.
