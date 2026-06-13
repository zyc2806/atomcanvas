# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository.

## Project purpose

**AtomCanvas** is a visualization-only atomic-structure viewer, extracted from
the larger `ase-view` project. It does exactly one job: load a structure, render
it well, let the user tune bonds / styling / scene, and export the result
(figures + scene/style documents + 3D models). It deliberately contains **no**
measurement tools, no isosurfaces, no trajectory playback, and no
calculation / HPC / MD code — those live in the parent `ase-view` project and
were intentionally left behind.

## Environment

The backend requires the `ase-view-env` conda environment (it ships ASE, RDKit,
NumPy, SciPy, etc.). Do **not** invoke a bare `python`; always use the exact
interpreter:

```
/Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python
```

`backend/run.sh` already points at this interpreter.

## Commands

### Backend (FastAPI, port 8000)

```bash
cd backend
./run.sh                                                        # uvicorn dev server (--reload, port 8000)
/Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python -m pytest -q   # run all tests
```

### Frontend (React 19 + Vite, port 3000)

```bash
cd frontend
npm run dev          # Vite dev server on port 3000 (proxies /api -> :8000)
npm run build        # tsc -b && vite build (production bundle)
npm run test         # vitest run (unit tests)
npm run lint         # eslint
npm run e2e          # playwright (upload -> edit bond -> export e2e)
```

### Full stack

```bash
scripts/start.sh     # start backend + frontend (logs in ./logs)
scripts/stop.sh      # stop both
```

> **Proxy note:** this machine has a system HTTP proxy
> (`http_proxy=127.0.0.1:15236`) that intercepts localhost. The dev scripts and
> `playwright.config.ts` already strip/bypass it (`--no-proxy-server`,
> `NO_PROXY` for 127.0.0.1/localhost). The Playwright browser **must** keep its
> `--no-proxy-server --proxy-bypass-list=*` launch args or it cannot reach the
> dev server (`ERR_PROXY_CONNECTION_FAILED`).

## Architecture map

```
backend/
  app/
    main.py                 # FastAPI app + CORS; mounts routers under /api/*
    models.py               # Pydantic request/response schemas
    routers/
      structure.py          # /api/structure: parse upload, update visualization, export structure files
      bonds.py              # /api/edit:      create_bond / delete_bonds (bond-override ops)
      selection.py          # /api/selection: parse selection DSL expressions
    services/               # pure, stateless logic (no FastAPI imports)
      geometry.py           # bond detection, ghost atoms (PBC), hydrogen-bond geometry
      heuristics.py         # element/valence heuristics for bonding
      rdkit_bridge.py       # OPTIONAL, lazily imported RDKit perception (bond orders, aromaticity)
      kekule.py             # Kekulé / aromatic ring handling
      bond_override_ops.py  # apply manual bond overrides (delete / set-order) on top of detection
      selection_parser.py   # selection-DSL grammar (pyparsing) -> AST
      selection_ops.py      # evaluate the selection AST against a structure
      structure_utils.py    # ASE Atoms <-> dict/response conversion, atom labels
      export_ops.py         # structure-file export helpers
      format_capabilities.py# which structure formats support cell/charge/etc. (export warnings)
      chem_utils.py
  tests/                    # pytest, FastAPI TestClient; conftest.py fixtures
  requirements.txt          # fastapi, uvicorn, ase, numpy, scipy, scikit-learn, rdkit, pyparsing, networkx

frontend/
  src/
    App.tsx, main.tsx       # canvas-first shell entry
    components/
      r3f/                  # React Three Fiber viewer: Atoms (InstancedMesh), Bonds, HBonds,
                            #   UnitCell, AromaticRings, ViewerCanvas, AxesGizmo, Scene/ (lighting, bg)
      panels/               # StylePanel, BondEditPanel, ScenePanel, SelectionInput
      shell/                # TopBar, PanelHost, StructureTabs, ExportMenu
    store/                  # Zustand sliced store
      useStructureStore.ts  #   composite store
      slices/               #   data / ui / style / scene / tabs / preset / history slices
    services/               # API clients + export pipeline
      structureService.ts   #   upload / update / export structure
      bondService.ts        #   bond override round-trip
      selectionService.ts   #   selection-DSL parse
      sceneDocument.ts      #   scene.json / style.json (de)serialization + schemaVersion gate
      glbExporter.ts        #   build a .glb from structure + style (PowerPoint-compatible)
      imageExport*.ts        #  PNG export pipeline (DPI metadata, legend composite)
      batchExport.ts        #   all-tabs -> PNG / glb
    types/, hooks/, utils/
  e2e/                      # playwright spec (upload -> edit bond -> export)

fixtures/water.xyz          # 3-atom water; backend bonds it O-H1, O-H2 (2 bonds)
scripts/start.sh, stop.sh   # dev-stack lifecycle
```

## Conventions

- **Stateless backend.** There is no in-memory Atoms cache and no database. The
  full structure (atoms, cell, overrides, threshold) **travels with every
  request** and the chosen representation comes back in the response. Restarting
  the backend loses nothing because it holds nothing. Do not reintroduce
  server-side session state.
- **Bond ids are `min-max`.** A bond between atoms `i` and `j` is always keyed
  `${Math.min(i,j)}-${Math.max(i,j)}` (e.g. `0-1`). Both the frontend bond panel
  and the backend override ops rely on this canonical ordering — never emit
  `j-i` when `j > i`.
- **scene/style JSON has a `schemaVersion` gate.** `scene.json` and `style.json`
  carry `kind` + `schemaVersion` (currently `SCHEMA_VERSION = 1`,
  `frontend/src/services/sceneDocument.ts`). Import is all-or-nothing: reject an
  unknown `kind` and reject any `schemaVersion` newer than the running app.
  Bump `SCHEMA_VERSION` when you make a breaking change to the document shape.
- **Language.** Chinese for conversation; English for code, comments, and docs.
- **Paths.** Prefer relative paths inside the repo for portability; the conda
  interpreter path is the one machine-specific exception.

## Anti-patterns (carried over from ase-view — do not reintroduce)

- **No heavy ASE/RDKit work inside `async def` route handlers.** Blocking
  CPU-bound ASE/RDKit calls stall the event loop. Keep the science in plain
  (sync) service functions; if a route must do real work, hand it to a
  threadpool. RDKit is imported lazily so its cost is paid only when bond-order
  perception is actually requested.
- **Never leak Python tracebacks in HTTP responses.** Translate failures into
  `HTTPException` with a clean message; log the stacktrace server-side
  (`logger.exception`). A raw traceback in a 500 body is a bug.
- **Routers stay thin.** HTTP/validation in `routers/`, logic in `services/`.
  Services must not import FastAPI.
- **Frontend: no API calls in components, no single mega-store, no direct DOM /
  Three.js mutation.** Use the `services/` layer, the sliced Zustand store, and
  R3F abstractions (refs, `useFrame`, `InstancedMesh`, drei helpers).

## Out of scope (left in ase-view on purpose)

Measurement, isosurfaces, trajectory playback, MD/optimization, and any
HPC/supercomputer integration. If a task asks for these here, it belongs in the
parent `ase-view` project instead.
