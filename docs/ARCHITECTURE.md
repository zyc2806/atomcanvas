# Architecture

AtomCanvas is a two-part app: a **stateless** FastAPI backend that does the
chemistry, and a React 19 + React Three Fiber frontend that does the rendering,
interaction, and export. They share one origin in the single-process
(`scripts/serve.sh`) deployment.

## High-level

```
┌─────────────────────────────┐         ┌──────────────────────────────────┐
│ Frontend (React 19 + R3F)   │  /api/* │ Backend (FastAPI, stateless)     │
│                             │ ───────▶│                                  │
│  services/ ── API clients   │         │  routers/ ── thin HTTP layer     │
│  store/    ── Zustand slices│ ◀─────── │  services/ ── pure ASE/RDKit     │
│  components/r3f ── viewer   │  JSON    │            logic (no FastAPI)    │
└─────────────────────────────┘         └──────────────────────────────────┘
```

## Backend (`backend/`)

A thin router layer over a pure, stateless service layer.

- **`app/main.py`** — the FastAPI app + CORS; mounts the routers and (in the
  single-process deployment) serves the built SPA from `backend/static/` at `/`.
- **`app/routers/`** — HTTP + validation only:
  - `structure.py` → `/api/structure` — parse an upload, update visualization,
    export structure files.
  - `bonds.py` → `/api/edit` — manual bond overrides (create / delete).
  - `editing.py` → `/api/edit` — periodic translate + supercell.
  - `selection.py` → `/api` — parse and evaluate selection-DSL expressions.
- **`app/services/`** — the science, as pure functions with **no FastAPI
  imports** (so the same code backs the [CLI](CLI.md)): bond detection and PBC
  ghost atoms (`geometry.py`), bonding heuristics (`heuristics.py`), optional
  lazily-imported RDKit perception (`rdkit_bridge.py`, `kekule.py`), bond
  overrides (`bond_override_ops.py`), the selection grammar/evaluator
  (`selection_parser.py`, `selection_ops.py`), structure export (`export_ops.py`),
  and ASE ↔ dict conversion (`structure_utils.py`).
- **`app/cli.py`** — a headless [CLI](CLI.md) over the same services.

**Stateless by design.** There is no in-memory `Atoms` cache and no database. The
full structure (atoms, cell, overrides, threshold) travels with every request and
the chosen representation comes back in the response, so restarting the backend
loses nothing and concurrent users never clobber shared state.

## Frontend (`frontend/src/`)

- **`components/r3f/`** — the React Three Fiber viewer: `Atoms` (an
  `InstancedMesh`), `Bonds`, `HBonds`, `UnitCell`, `AromaticRings`,
  `ViewerCanvas`, `AxesGizmo`, and the `Scene/` lighting + background.
- **`components/`** (panels / shell) — the style / bond / scene panels, the
  selection builder, top bar, tabs, and the export menu.
- **`store/`** — a sliced [Zustand](https://github.com/pmndrs/zustand) store
  (`useStructureStore.ts` composing data / ui / style / scene / tabs / preset /
  history / playback slices). No single mega-store.
- **`services/`** — the only place that talks to the API or builds exports:
  structure / bond / selection clients, the scene/style document
  (de)serializer, the `.glb` exporter, and the PNG/glb/JSON batch export
  pipeline. **Components never call the API directly.**

## Data flow

**Upload.** `structureService` posts the file → `structure.py` parses it with
ASE → `geometry.py` computes bonds and ghost atoms → the JSON response lands in
the Zustand data slice → the R3F components render from store state.

**Edit / select.** Bond overrides and selection expressions round-trip through
`/api/edit` and `/api/selection`; the backend recomputes from the structure that
travels with the request and returns the new representation.

**Export.** PNG (canvas capture), `.glb`, and scene/style JSON are built
entirely client-side in the `services/` export pipeline — see [EXPORT.md](EXPORT.md).

## Conventions worth knowing

- **Bond ids are `min-max`** — a bond between `i` and `j` is keyed
  `${Math.min(i,j)}-${Math.max(i,j)}`, on both ends of the wire.
- **`scene.json` / `style.json` carry a `schemaVersion`** — imports from a newer
  schema than the running app are rejected, not silently misread.
- **No heavy ASE/RDKit work inside `async def` handlers** — keep blocking science
  in sync service functions. RDKit is imported lazily.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full set of conventions and
anti-patterns.
