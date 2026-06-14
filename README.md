# AtomCanvas

A focused, canvas-first viewer for atomic structures. Drop in a structure file,
get a clean, correctly-colored 3D rendering, fine-tune the bonds, styling, and
scene, then export publication-ready figures, portable scene/style presets, and
3D models you can drop straight into a slide deck.

AtomCanvas is the **visualization-only** extraction of the larger `ase-view`
project — no calculations, no MD, no HPC, just rendering and export done well.

## What it does

- **Load structures** — upload common formats (XYZ/extXYZ, CIF, VASP POSCAR,
  PDB, …); the backend parses them with ASE and infers bonding.
- **Automatic bonding** — covalent-radius bond detection with a tunable
  threshold, PBC-aware ghost atoms, hydrogen bonds, and (when RDKit perceives
  them) bond orders and aromatic rings.
- **Manual bond editing** — select exactly two atoms to create, set the order
  of, or delete a bond; every override round-trips through the backend and can
  be reverted individually or cleared all at once.
- **Selection DSL** — express selections like `elem:C AND pos:z>10`,
  `label:O1,H1`, with `AND` / `OR` / `NOT` and parentheses; invert with one
  click.
- **Styling** — per-element and per-atom colors/radii (CPK by default), plus
  scene controls: camera presets, background, lighting presets, unit-cell /
  H-bond / ghost toggles, and bond threshold.
- **Multiple structures in tabs** with batch export across all of them.

## Quickstart

Prerequisite: the `ase-view-env` conda environment (ASE, RDKit, NumPy, SciPy).

```bash
# 1. Backend (FastAPI, port 8000)
cd backend
./run.sh

# 2. Frontend (Vite, port 3000) — in a second terminal
cd frontend
npm install        # first time only
npm run dev

# then open http://localhost:3000
```

Or start both at once:

```bash
scripts/start.sh   # backend + frontend; logs in ./logs
scripts/stop.sh    # tear it down
```

There is a tiny sample structure at `fixtures/water.xyz` to try the
upload → edit-bond → export flow.

### One command, one port (sharing / production)

For everyone who isn't actively developing the frontend, skip the two-process
dance — build the SPA once and let the FastAPI process serve it:

```bash
scripts/serve.sh   # builds the frontend if needed, then serves API + SPA
                   # from a single uvicorn process at http://localhost:8000
```

`scripts/build.sh` does just the build step (frontend → `backend/static/`), and
`serve.sh` calls it automatically when the bundle is missing. One process, one
port, one URL — no Vite dev server and no `/api` proxy. Override host/port/python
with `ATOMCANVAS_HOST` / `ATOMCANVAS_PORT` / `ATOMCANVAS_PYTHON`.

## Command line (headless)

The chemistry core — parsing, bond/order/ring detection, the selection DSL, and
structure-file export — is scriptable without the browser:

```bash
cd backend
python -m app.cli info    ../fixtures/water.xyz
python -m app.cli bonds   ../fixtures/water.xyz --mode full --json
python -m app.cli select  ../fixtures/water.xyz "elem:O"
python -m app.cli convert ../fixtures/water.xyz out.cif
```

After `pip install .` (see below) the same commands are available as the
`atomcanvas` console script. The *visual* exports (PNG screenshot, `.glb` model)
stay browser-only — they depend on the live WebGL canvas.

### Install the package

```bash
cd backend
pip install .          # installs the backend + the `atomcanvas` CLI
atomcanvas bonds structure.cif
```

Install into an **isolated virtualenv**: the import package is the generic name
`app`, so a system-wide install would shadow anything else named `app`. (Or skip
installing and use `python -m app.cli` as shown above.)

## Export formats

From the **Export** menu in the top bar:

| Export | What you get |
| --- | --- |
| **PNG (current)** | A PNG snapshot of the current view, captured directly from the WebGL canvas. |
| **glb (current)** | A `.glb` 3D model built from the current structure + styling. |
| **style.json** | The element/atom styling preset (portable, re-importable). |
| **scene.json** | The full scene: styling + camera + scene toggles. |
| **Batch: all tabs → PNG / glb** | One file per open structure tab. |
| **Structure file…** | Re-export the structure itself as CIF, POSCAR (VASP), XYZ, extXYZ, or PDB. |
| **Open scene.json / style.json…** | Import a previously exported preset/scene back into the app. |

`scene.json` and `style.json` carry a `schemaVersion`; importing a document from
a newer schema than the running app is rejected rather than silently misread.

### Inserting a `.glb` into PowerPoint

The exported `.glb` is a standard 3D model. In PowerPoint:

1. Export **glb (current)** and save the `.glb` file.
2. In PowerPoint, go to **Insert → 3D Models → This Device…** and pick the
   `.glb`.
3. The structure appears as a rotatable 3D object — drag the on-model handle to
   spin it, and use **Animations → 3D** (e.g. Turntable) if you want it to
   rotate during the slide.

## Project layout

See [AGENTS.md](AGENTS.md) for the full architecture map, conventions, and
developer notes. In short: a stateless FastAPI backend (`backend/`, parse /
bond / selection / export) and a React 19 + React Three Fiber frontend
(`frontend/`, canvas-first shell with style / bond / scene panels and the export
pipeline).

## Tests

```bash
# Backend
cd backend
/Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python -m pytest -q

# Frontend
cd frontend
npx tsc -b          # type-check
npm run test        # vitest unit tests
npm run build       # production build
npm run e2e         # playwright: upload -> edit bond -> export
```
