# AtomCanvas — Visualization-Only Atomic Structure Viewer

**Date:** 2026-06-13
**Status:** Approved by user (measurement feature explicitly excluded)
**Origin:** Extracted from `~/Desktop/Scripts/ase-view` (ase-view-web), reduced to visualization only, with a redesigned UI.

## 1. Purpose & Scope

A standalone web app that does one thing well: load atomic structures, render them beautifully, let the user curate bonding and styling, and export consistent, publication/presentation-ready artifacts.

**In scope:**

- Structure upload and parsing via ASE (CIF, POSCAR/CONTCAR, xyz/extxyz, mol, and anything `ase.io.read` handles).
- 3D rendering: atoms, covalent bonds (with bond order), hydrogen bonds, unit cell, PBC ghost atoms/bonds.
- Bond detection with adjustable threshold (covalent radii × multiplier, default 1.2), reusing the existing `geometry.py` pipeline (NeighborList, ghost bonds, aromatic rings, bond-order inference via RDKit/Kekulé/heuristics).
- Manual bond editing: add bond, delete bond, set bond order, between any two selected atoms. Overrides are listed and individually revertible. Undo/redo covers bond edits and style changes.
- Per-element style customization: color, radius scale, opacity. Per-atom color override is also supported (the mechanism already exists in the copied store slices). Plus bond style (thickness, color mode), background, lighting, camera presets.
- Style presets (`*.style.json`): named, structure-independent, applicable to any structure — the vehicle for uniform styling across many figures.
- Scene documents (`*.scene.json`): full-fidelity save/restore of structures + bond overrides + style + camera.
- Exports: PNG (with DPI/transparency options), glb (PowerPoint-compatible 3D model), scene JSON, plus pass-through ASE format export (cif/poscar/xyz/ase-json) via backend.
- Multiple structures open as tabs; batch export of all open structures with the active style (PNG/glb/scene.json), filenames numbered by structure name.

**Out of scope (explicitly):**

- Calculations (optimization, MD), HPC integration, workflows.
- Atom-level structure editing (add/delete/move atoms, adsorbates, surfaces).
- Measurement/annotation (bond length, angles) — excluded by user decision.
- Persistence beyond in-memory backend state (no database; restart clears server state, scene JSON is the durable artifact).

## 2. Architecture

New independent repository: `~/Desktop/Scripts/atomcanvas/`.

```
atomcanvas/
├── backend/          # FastAPI, minimal
│   └── app/
│       ├── main.py
│       ├── state.py             # in-memory Atoms cache (same pattern as ase-view)
│       ├── models.py            # Pydantic schemas (trimmed)
│       ├── routers/
│       │   ├── structure.py     # upload/parse, ASE-format export
│       │   └── bonds.py         # topology recompute (threshold, overrides), H-bonds
│       └── services/
│           ├── geometry.py      # copied from ase-view (bond pipeline, PBC, ghosts)
│           ├── bond_override_ops.py
│           └── structure_utils.py
└── frontend/         # React 19 + TypeScript + Vite + Zustand + R3F + MUI v7
    └── src/
        ├── components/
        │   ├── r3f/             # Atoms, Bonds, HBonds, AromaticRings, UnitCell,
        │   │                    # AxesGizmo, ViewerCanvas (copied & trimmed; no Measurement, no Isosurface)
        │   ├── shell/           # top toolbar, structure tabs, floating drawers
        │   └── panels/          # StylePanel, BondEditPanel, ScenePanel
        ├── store/               # Zustand slices: data, ui, scene, style, history
        ├── services/            # structureService, bondService, exporters
        │   ├── glbExporter.ts   # NEW: clean-scene glb export
        │   ├── sceneDocument.ts # NEW: scene/style JSON serialize + import
        │   └── imageExport*.ts  # copied from ase-view
        └── public/atom.json     # element colors/radii (copied)
```

**Backend principles (carried over from ase-view):** async routers delegate to sync services via `run_in_threadpool`; no heavy ASE work on the event loop; errors surface as `HTTPException`, never raw tracebacks; routers never touch the atoms cache directly (go through `state.py`).

**Migration strategy:** copy-then-trim. Every copied file is stripped of calculation/HPC/editing dead code at copy time. Existing backend tests for bonds/topology/overrides/export come along and must pass from the start.

## 3. UI Design — canvas-first minimal

- Full-screen 3D canvas; dark theme by default.
- One slim top toolbar: open file(s), structure tabs (multi-structure switching), style-preset dropdown, export button.
- Right-side floating drawer panels, at most one open at a time:
  - **Style panel** — element table (click an element to set color/radius/opacity), bond thickness/style, background, lighting.
  - **Bond edit panel** — with 2 atoms selected: add/delete/set order; lists all active overrides with per-item revert.
  - **Scene panel** — camera presets, toggles for unit cell / ghost atoms / H-bonds, bond-detection threshold slider (triggers backend topology recompute).
- MUI v7 used for input controls only; the shell (toolbar, drawers, tabs) is custom-styled.
- Keyboard shortcuts for panel toggles, undo/redo, export.

## 4. Data Flow

1. Upload: frontend sends file → `routers/structure.py` parses with ASE → `geometry.py` computes bonds/ghosts/H-bonds → structured JSON response → Zustand data slice → R3F renders.
2. Bond edit: panel action updates `bondOverrides` in store → POST to `routers/bonds.py` with overrides + threshold → recomputed topology returned → store updated. Override dict format follows ase-view: `"min(i)-max(j)" → "delete" | "1.0" | "2.0" | ...`.
3. Style change: pure frontend; store style slice drives R3F materials directly. No backend round-trip.
4. Export PNG/glb/scene.json: pure frontend. Export cif/poscar/xyz: backend `ase.io.write` (existing `/export` logic, trimmed of trajectory scope).

## 5. JSON Document Design

Current ase-view JSON export is bare `ase.io.write(format="json")` — structure only, no style. AtomCanvas adds two frontend-generated document types:

**Style preset — `<name>.style.json`** (structure-independent, reusable):

```json
{
  "schemaVersion": 1,
  "kind": "atomcanvas-style",
  "name": "paper-dark",
  "elements": { "C": { "color": "#909090", "radiusScale": 1.0, "opacity": 1.0 } },
  "bonds": { "style": "cylinder", "radius": 0.12, "colorMode": "element-split" },
  "background": { "color": "#111418", "transparent": false },
  "lighting": { "preset": "studio", "intensity": 1.0 },
  "cameraPreset": "front"
}
```

Elements absent from `elements` fall back to `atom.json` defaults. Applying a preset to any structure yields uniform styling across a figure set.

**Scene document — `<name>.scene.json`** (full restore):

```json
{
  "schemaVersion": 1,
  "kind": "atomcanvas-scene",
  "structures": [
    {
      "name": "slab-1",
      "structure": { "...": "same fields as the existing Structure pydantic model" },
      "bondOverrides": { "3-17": "delete", "5-9": "2.0" },
      "perAtomOverrides": { "12": { "color": "#ff0000" } }
    }
  ],
  "style": { "...": "embedded style preset object" },
  "camera": { "position": [], "target": [], "zoom": 1 },
  "activeIndex": 0
}
```

Importing a scene document restores everything, including manual bond edits. `schemaVersion` gates future migrations. Unknown `kind` or newer `schemaVersion` → clear user-facing error, no partial import.

## 6. glb / PowerPoint Export

R3F's InstancedMesh-based scene is NOT serialized directly (PowerPoint's glb subset handles instancing extensions poorly). Instead `glbExporter.ts` rebuilds a clean `three.Scene` from structure + active style:

- Atoms: one merged sphere `BufferGeometry` per element, vertex-colored or per-material, standard PBR (`MeshStandardMaterial`).
- Bonds: cylinder geometry per bond (split-color cylinders for element-split mode); H-bonds optional dashed-equivalent (thin cylinders) toggle.
- No lights baked in (PowerPoint supplies its own environment); materials tuned so the model reads well in PowerPoint's viewer.
- Output via `GLTFExporter` (binary `.glb`).

Insertion into PPT uses the existing `ppt` skill's `model3d` sub-skill, which consumes `.glb` files.

**Batch export:** for each open structure tab, apply the active style and emit PNG/glb/scene.json; downloads named `<structure-name>.<ext>`, with numeric suffixes on collision.

## 7. Error Handling

- Backend: invalid/unparseable files → 400 with format guidance; oversized structures → 413; all ASE failures wrapped, no tracebacks in responses.
- Frontend: failed upload/topology calls surface as toast with the backend message; glb/PNG export failures (e.g., WebGL context loss) surface as toast and never leave the app in a broken state.
- Scene/style JSON import validates `kind` + `schemaVersion` before applying anything (all-or-nothing).

## 8. Testing

- **Backend (pytest):** copied bond/topology/override/export tests adapted to the trimmed app; must pass from day one. Run inside the `ase-view-env` conda environment.
- **Frontend (vitest):** store slices (style/bond override logic), `sceneDocument` serialize→import round-trip, glbExporter produces a parseable glb (three's GLTFLoader round-trip in jsdom/node).
- **E2E (Playwright, 1–2 specs):** upload → render → select two atoms → add bond → export PNG and scene.json.

## 9. Open Items (deferred, not blockers)

- Project name `atomcanvas` is provisional; rename is a find-replace before first release.
- Light theme is a follow-up; dark-only at v1.
- Trajectory/multi-frame support is intentionally absent at v1 (single frame per structure; ASE files with multiple frames load frame 0 with a notice).
