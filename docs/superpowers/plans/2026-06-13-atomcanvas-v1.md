# AtomCanvas v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build AtomCanvas — a standalone visualization-only atomic structure viewer extracted from ase-view, with redesigned canvas-first UI, bond curation, style presets, and PNG/glb/scene-JSON export.

**Architecture:** Copy-then-trim migration. A stateless FastAPI backend (structure parsing, bond topology, selection DSL, ASE export — all copied from ase-view and trimmed) plus a React 19 + R3F frontend that reuses ase-view's rendering components and store slices under a new minimal shell. New code: tabs slice, element-style preset slice, scene/style JSON documents, glb exporter, batch export.

**Tech Stack:** FastAPI + ASE + RDKit (conda env `ase-view-env`), React 19 + TypeScript + Vite + Zustand + React Three Fiber + MUI v7.

**Source repo (read-only reference):** `/Users/zhangyichen/Desktop/Scripts/ase-view/ase-view-web/` — referred to below as `$SRC`.
**Target repo:** `/Users/zhangyichen/Desktop/Scripts/atomcanvas/` — referred to below as `$DST`. Already a git repo (main branch) containing the spec.

**Conventions for all tasks:**

- Backend Python runs ONLY via `/Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python` (do NOT use bare `python`/`pytest`; do NOT use the `~/.conda` env — it lacks pytest-asyncio deps).
- Spec: `$DST/docs/superpowers/specs/2026-06-13-atomcanvas-design.md`. When a trim decision is unclear, the spec wins.
- NEVER modify anything inside `$SRC` (it contains the user's uncommitted WIP). Copy only.
- Commit at the end of every task at minimum; commit messages in conventional-commit style.
- The new repo gets `AGENTS.md` (NOT `CLAUDE.md`) per user's global rule.

---

## Phase A — Backend

### Task 1: Backend scaffold + copied services, tests green

**Files:**
- Create: `$DST/backend/requirements.txt`, `$DST/backend/run.sh`, `$DST/.gitignore`
- Create (copy): `$DST/backend/app/services/{geometry,chem_utils,rdkit_bridge,heuristics,kekule,bond_override_ops,structure_utils,selection_parser,selection_ops,format_capabilities,export_ops}.py`
- Create: `$DST/backend/app/__init__.py`, `$DST/backend/app/services/__init__.py`
- Test (copy): `$DST/backend/tests/` — see step 4 list, plus `conftest.py`

- [ ] **Step 1: Scaffold directories and metadata**

```bash
mkdir -p $DST/backend/app/{routers,services} $DST/backend/tests
touch $DST/backend/app/__init__.py $DST/backend/app/routers/__init__.py $DST/backend/app/services/__init__.py
```

`$DST/.gitignore`:

```
__pycache__/
*.pyc
.pytest_cache/
node_modules/
dist/
playwright-report/
test-results/
.DS_Store
```

`$DST/backend/requirements.txt` (trimmed from ase-view: drop `tblite`, `asyncssh`, `scikit-image`; add explicit `scipy` — `geometry.py` imports `scipy.sparse`):

```
fastapi
uvicorn
python-multipart
ase
numpy
scipy
scikit-learn
rdkit
```

`$DST/backend/run.sh` (mode 755):

```bash
#!/bin/bash
cd "$(dirname "$0")"
exec /Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python -m uvicorn app.main:app --reload --port 8000
```

- [ ] **Step 2: Copy service modules verbatim**

```bash
SRC=/Users/zhangyichen/Desktop/Scripts/ase-view/ase-view-web/backend
DST=/Users/zhangyichen/Desktop/Scripts/atomcanvas/backend
for f in geometry chem_utils rdkit_bridge heuristics kekule bond_override_ops \
         structure_utils selection_parser selection_ops format_capabilities export_ops; do
  cp $SRC/app/services/$f.py $DST/app/services/$f.py
done
```

Do NOT copy: `calculations.py`, `calculators.py`, `building_ops.py`, `editing_ops.py`, `measurement_ops.py`, `surface_ops.py`, `remote_workspace.py`, `ssh_connection.py`, `slurm_adapter.py`, any `workflow_*.py`, `supercomputer_*.py`, `run_manifest.py`, `calculation_ops.py`.

- [ ] **Step 3: Trim copied services of out-of-scope imports**

Run `grep -n "import" $DST/app/services/*.py | grep -vE "ase|numpy|scipy|rdkit|sklearn|typing|collections|logging|app.services|__future__|dataclasses|enum|re$|re\b|itertools|math|json"` and inspect. `structure_utils.py` may import editing/calculation helpers — delete those imports and the functions that use them ONLY if they are not needed by `atoms_from_dict`/structure parsing (check call sites with grep before deleting). Verification is step 5's pytest run.

- [ ] **Step 4: Copy backend tests + conftest**

```bash
for t in conftest.py test_geometry_inference.py test_structure_topology.py \
         test_bond_overrides_feature.py test_selection_parser.py test_selection_ast.py \
         test_selection_overrides.py test_selection_api_overrides.py \
         test_selection_parser_bugs.py test_selection_parser_span.py \
         test_advanced_selection.py test_structure_export.py \
         test_update_visualization_bond_mode.py test_editing_bonds.py \
         test_editing_create_bond.py; do
  cp $SRC/tests/$t $DST/tests/$t 2>/dev/null || echo "MISSING: $t"
done
```

`conftest.py` may reference routers that don't exist yet (Task 2). If so, tests that need the FastAPI app will fail at import — that is expected until Task 2. Run only the pure-service tests now:

- [ ] **Step 5: Run service-level tests**

```bash
cd $DST/backend && /Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python -m pytest \
  tests/test_geometry_inference.py tests/test_selection_parser.py tests/test_selection_ast.py -v
```

Expected: PASS (these exercise services only). If conftest import errors block collection, temporarily guard the app import in conftest with a comment `# enabled in Task 2` and re-run.

- [ ] **Step 6: Commit**

```bash
cd $DST && git add -A && git commit -m "feat(backend): copy bond/selection/export services from ase-view"
```

### Task 2: Trimmed models, routers, main.py — full backend API green

**Files:**
- Create: `$DST/backend/app/models.py` (trim of `$SRC/app/models.py`)
- Create: `$DST/backend/app/routers/structure.py` (trim of `$SRC/app/routers/structure.py`)
- Create: `$DST/backend/app/routers/bonds.py` (bond-edit endpoints extracted from `$SRC/app/routers/editing.py`)
- Create: `$DST/backend/app/routers/selection.py` (copy of `$SRC/app/routers/selection.py`)
- Create: `$DST/backend/app/main.py`
- Test: copied tests from Task 1 step 4, now all green

- [ ] **Step 1: models.py — copy then delete out-of-scope classes**

Copy `$SRC/app/models.py`, then DELETE these classes: `UpdateStructureRequest`, `MeasurementRequest`, `MeasurementResponse`, `IsosurfaceRequest`, `IsosurfaceMeshResponse`. KEEP: `BondDiagnostics`, `Structure`, `Visualization`, `StandardStructureObject`, `VisualizationParams`, `DetectRingRequest`, `DetectRingResponse`, `DeleteBondsRequest`, `CreateBondRequest`, `ExportWarning`, `ExportRequest`.

- [ ] **Step 2: routers/structure.py — copy then trim**

Copy `$SRC/app/routers/structure.py`. DELETE endpoints `load_demo` and `generate_isosurface` (and their imports, e.g. anything from scikit-image/isosurface services). KEEP: `/upload`, `/update_visualization`, `/export` with their helpers (`_build_atoms_with_constraints`, `_serialize_export_warning`, temp-file cleanup pattern). Keep `run_in_threadpool` usage exactly as in source.

- [ ] **Step 3: routers/bonds.py — extract bond endpoints from editing.py**

Find the bond endpoints in `$SRC/app/routers/editing.py` (grep for `DeleteBondsRequest` and `CreateBondRequest` to locate them — they call `app.services.bond_override_ops`). Create `bonds.py` containing ONLY: the router, those two endpoints, and their imports. Same response models as the source.

- [ ] **Step 4: routers/selection.py — copy verbatim**

```bash
cp $SRC/app/routers/selection.py $DST/app/routers/selection.py
```

Fix any relative import that referenced deleted models (it imports `DetectRingRequest/Response` from `..models` — kept, so should be clean).

- [ ] **Step 5: main.py — write fresh (no lifespan/workflow monitor)**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import structure, bonds, selection

app = FastAPI(
    title="AtomCanvas Backend",
    description="Visualization-only backend: parsing, bonding, selection, export.",
    version="0.1.0",
)

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(structure.router, prefix="/api/structure", tags=["structure"])
app.include_router(bonds.router, prefix="/api/bonds", tags=["bonds"])
app.include_router(selection.router, prefix="/api", tags=["selection"])
```

IMPORTANT: check the prefixes used in `$SRC/app/main.py` for these routers first and match them exactly (the copied tests and the frontend `apiClient` paths depend on them — e.g. selection endpoints are `/selection/...` under some prefix). Adjust the three `include_router` lines to reproduce the original URL paths.

- [ ] **Step 6: Re-enable conftest app import, run the whole suite**

```bash
cd $DST/backend && /Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python -m pytest -v
```

Expected: ALL copied tests PASS. Fix import/trim fallout until green. If a copied test exercises a deleted feature (e.g. references measurement or isosurface), delete that single test function — not the whole file — and note it in the commit message.

- [ ] **Step 7: Smoke-boot the server**

```bash
cd $DST/backend && timeout 10 /Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python -c "from app.main import app; print('OK', [r.path for r in app.routes])"
```

Expected: prints OK + route list including `/api/structure/upload`.

- [ ] **Step 8: Commit**

```bash
cd $DST && git add -A && git commit -m "feat(backend): trimmed structure/bonds/selection routers, full test suite green"
```

### Task 3: Backend improvement — defer RDKit import

`rdkit_bridge.py` imports RDKit at module top level; `geometry.py` imports `rdkit_bridge`, so every server boot pays the RDKit import cost. Defer it.

**Files:**
- Modify: `$DST/backend/app/services/rdkit_bridge.py`
- Test: `$DST/backend/tests/test_lazy_rdkit.py`

- [ ] **Step 1: Write the failing test**

```python
import importlib
import subprocess
import sys

PY = "/Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python"

def test_importing_app_does_not_import_rdkit():
    code = (
        "import sys; import app.main; "
        "assert not any(m == 'rdkit' or m.startswith('rdkit.') for m in sys.modules), "
        "'rdkit imported at startup'"
    )
    result = subprocess.run([PY, "-c", code], capture_output=True, text=True,
                            cwd="/Users/zhangyichen/Desktop/Scripts/atomcanvas/backend")
    assert result.returncode == 0, result.stderr
```

- [ ] **Step 2: Run it — expect FAIL** (`rdkit imported at startup`).

- [ ] **Step 3: Implement lazy import in rdkit_bridge.py**

Replace the top-level block:

```python
try:
    from rdkit import Chem
    from rdkit.Chem import rdDetermineBonds
    HAS_RDKIT = True
except ImportError:
    HAS_RDKIT = False
    Chem = None
    rdDetermineBonds = None
```

with:

```python
_RDKIT = None  # (Chem, rdDetermineBonds) once loaded; False if unavailable


def _load_rdkit():
    global _RDKIT
    if _RDKIT is None:
        try:
            from rdkit import Chem
            from rdkit.Chem import rdDetermineBonds
            _RDKIT = (Chem, rdDetermineBonds)
        except ImportError:
            _RDKIT = False
    return _RDKIT
```

Then inside every function that used `Chem`/`rdDetermineBonds`/`HAS_RDKIT`, call `loaded = _load_rdkit()` first; `if not loaded: <existing HAS_RDKIT-False behavior>`; else unpack `Chem, rdDetermineBonds = loaded`. Preserve existing fallback semantics exactly. If other services also check `rdkit_bridge.HAS_RDKIT` (grep first!), add a module-level function `has_rdkit() -> bool: return bool(_load_rdkit())` and update those call sites.

- [ ] **Step 4: Run new test + full suite — expect PASS**

```bash
cd $DST/backend && /Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python -m pytest -v
```

- [ ] **Step 5: Commit** — `perf(backend): defer rdkit import to first bond-order inference`

---

## Phase B — Frontend foundation

### Task 4: Frontend scaffold (Vite + React 19 + TS)

**Files:**
- Create: `$DST/frontend/` via Vite scaffold; `package.json` dependencies aligned to ase-view versions

- [ ] **Step 1: Scaffold**

```bash
cd $DST && npm create vite@latest frontend -- --template react-ts
cd frontend && npm install
```

- [ ] **Step 2: Install runtime deps (same major versions as ase-view; do NOT add 3dmol/recharts)**

```bash
npm i zustand@^5 three@0.181.2 @react-three/fiber@^9 @react-three/drei@^10 \
  @react-three/postprocessing@^3 @types/three@^0.182 @mui/material@^7 \
  @mui/icons-material@^7 @emotion/react@^11 @emotion/styled@^11 axios@^1 \
  react-colorful@^5 maath@^0.10
npm i -D vitest @testing-library/react @testing-library/jest-dom @testing-library/dom jsdom @playwright/test
```

Add to `package.json` (copy the `overrides` block from `$SRC/frontend/package.json` pinning `stats-gl`→`three 0.181.2`). Add scripts: `"test": "vitest run"`, `"e2e": "playwright test"`.

- [ ] **Step 3: Vite proxy + port (match backend CORS)**

In `vite.config.ts` add:

```ts
server: {
  port: 3000,
  proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } },
},
test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' },
```

(reference `$SRC/frontend/vite.config.ts` and `playwright.config.ts` for the exact shapes; copy `$SRC/frontend/src/test/setup.ts`).

- [ ] **Step 4: Verify build + commit**

```bash
npm run build
cd $DST && git add -A && git commit -m "chore(frontend): vite react-ts scaffold with r3f/mui/zustand deps"
```

### Task 5: Copy types, atom.json, apiClient, services

**Files:**
- Create (copy+trim): `$DST/frontend/src/types/{store.ts,selection.ts,global.d.ts}`
- Create (copy): `$DST/frontend/public/atom.json`
- Create (copy+trim): `$DST/frontend/src/services/{apiClient,structureService,selectionService,editService,cameraRotation,imageExportExecutor,imageExportFlow,imageExportOptions,imageLegendComposite,pngDpiMetadata}.ts` (+ `renderParams*.ts` ONLY if `imageExport*` imports them — check with grep)

- [ ] **Step 1: Copy files**

```bash
SRCF=/Users/zhangyichen/Desktop/Scripts/ase-view/ase-view-web/frontend
DSTF=/Users/zhangyichen/Desktop/Scripts/atomcanvas/frontend
mkdir -p $DSTF/src/{types,services,store/slices,components/r3f,components/shell,components/panels}
cp $SRCF/public/atom.json $DSTF/public/atom.json
cp $SRCF/src/types/{store.ts,selection.ts,global.d.ts} $DSTF/src/types/
cp $SRCF/src/services/{apiClient.ts,structureService.ts,selectionService.ts,editService.ts,cameraRotation.ts,imageExportExecutor.ts,imageExportFlow.ts,imageExportOptions.ts,imageLegendComposite.ts,pngDpiMetadata.ts} $DSTF/src/services/
cp $SRCF/src/services/{imageExportExecutor,imageExportOptions}.test.ts $DSTF/src/services/ 2>/dev/null || true
```

Do NOT copy: `buildService.ts`, `calculationService.ts`, `measurementService.ts`, `supercomputerService.ts`, `threeDmol.ts` type, `supercomputer.ts` type.

- [ ] **Step 2: Trim types/store.ts**

Delete every interface/type and slice-interface member related to: calculation, workspace/documents, supercomputer, measurement, isosurface, builder/adsorbate, trajectory (v1 is single-frame). Keep: `Structure`, `StandardStructureObject`, `Visualization`, `VisualizationParams`, `ViewControls`, `CameraSnapshot`, selection types, color/opacity/bond override fields, `DataSlice`, `UISlice`, `SceneSlice`, `StyleSlice`, `HistorySlice` and the `StructureState` composite (trim its union to the kept slices).

- [ ] **Step 3: Trim services**

- `structureService.ts`: keep `uploadStructure`, `updateVisualization`, `exportStructure` (and helpers); delete trajectory/demo/isosurface functions.
- `editService.ts`: keep ONLY the visualization-update + bond-related calls (the ones posting `bond_overrides`, `bond_scale`, h-bond params); delete atom-editing calls (`delete_atoms`, `add_atom`, `translate_*`, `rotate_*`, `change_elements`, `fix_atoms`, adsorbate). Rename file to `bondService.ts` and update imports.
- `selectionService.ts`: copy as-is (its LRU cache is already bounded).

- [ ] **Step 4: Typecheck loop**

```bash
cd $DSTF && npx tsc --noEmit
```

Fix dangling references by deleting further dead code (never by adding stubs). Repeat until clean.

- [ ] **Step 5: Run copied service unit tests**

```bash
npm run test -- src/services
```

Expected: PASS (image-export tests are self-contained).

- [ ] **Step 6: Commit** — `feat(frontend): copy types, atom.json, api/services layer (trimmed)`

### Task 6: Copy store slices + composite store

**Files:**
- Create (copy+trim): `$DST/frontend/src/store/slices/{createDataSlice,createUISlice,createSceneSlice,createStyleSlice,createHistorySlice}.ts` and copied tests `createUISlice.test.ts`, `createHistorySlice.test.ts`
- Create: `$DST/frontend/src/store/useStructureStore.ts`

- [ ] **Step 1: Copy the five slices + their tests** (NOT `createCalculationSlice`, `createWorkspaceSlice`, `supercomputer*`).

- [ ] **Step 2: Trim createUISlice.ts** — delete imports of `buildService` and every action whose body calls it; delete measurement-mode state/actions. Keep: selection state/actions (`selectedAtoms`, `selectedBonds`, `toggleSelection`, `toggleBondSelection`, `selectionExpression`, expression-apply actions), `visParams`/`setVisParams` + the named setters (`setBondThreshold`, `setShowHBonds`, …), `viewControls`/`setViewControls`, color/opacity/bond override state + setters.

- [ ] **Step 3: Trim createDataSlice.ts** — keep `structureData`/`setStructureData` and upload/parse status; delete trajectory + calculation-result state.

- [ ] **Step 4: Write composite store**

```ts
import { create } from 'zustand';
import type { StructureState } from '../types/store';
import { createDataSlice } from './slices/createDataSlice';
import { createUISlice } from './slices/createUISlice';
import { createSceneSlice } from './slices/createSceneSlice';
import { createStyleSlice } from './slices/createStyleSlice';
import { createHistorySlice } from './slices/createHistorySlice';

export const useStructureStore = create<StructureState>()((...a) => ({
  ...createDataSlice(...a),
  ...createUISlice(...a),
  ...createSceneSlice(...a),
  ...createStyleSlice(...a),
  ...createHistorySlice(...a),
}));
```

(match the source store's middleware wrappers if the copied slices rely on them — check `$SRCF/src/store/useStructureStore.ts` first and reproduce its `create` call shape minus removed slices.)

- [ ] **Step 5: Typecheck + run slice tests; note known-failing baseline**

```bash
npx tsc --noEmit && npm run test -- src/store
```

NOTE: 2 `useStructureStore` tests fail at ase-view HEAD (pre-existing, not real bugs). If the same two fail here for the same reason, mark them `it.skip` with comment `// pre-existing failure at ase-view HEAD, see memory/preexisting-test-failures` and move on.

- [ ] **Step 6: Commit** — `feat(frontend): zustand store with data/ui/scene/style/history slices`

### Task 7: New slices — tabs, element-style presets, topology overrides

**Files:**
- Create: `$DST/frontend/src/store/slices/createTabsSlice.ts`
- Create: `$DST/frontend/src/store/slices/createPresetSlice.ts`
- Test: `$DST/frontend/src/store/slices/createTabsSlice.test.ts`, `createPresetSlice.test.ts`
- Modify: `$DST/frontend/src/types/store.ts`, `$DST/frontend/src/store/useStructureStore.ts`

- [ ] **Step 1: Add types to types/store.ts**

```ts
export interface ElementStyle { color?: string; radiusScale?: number; opacity?: number }

export interface BondStyleSettings {
  style: 'cylinder';
  radius: number;
  colorMode: 'element-split' | 'uniform';
  uniformColor?: string;
}

export interface StylePresetState {
  presetName: string;
  elements: Record<string, ElementStyle>;
  bondsStyle: BondStyleSettings;
}

export interface PresetSlice extends StylePresetState {
  setElementStyle: (symbol: string, style: ElementStyle) => void;
  clearElementStyle: (symbol: string) => void;
  setBondsStyle: (s: Partial<BondStyleSettings>) => void;
  setPresetName: (name: string) => void;
  replacePreset: (p: StylePresetState) => void;
}

export interface StructureTab {
  id: string;
  name: string;
  doc: StandardStructureObject;
  bondOverrides: Record<string, string>;   // "i-j" -> "delete" | "1.0" | "2.0" | ...
  colorOverrides: { [index: number]: string } | null;
  opacityOverrides: { [index: number]: number } | null;
  camera: CameraSnapshot | null;
}

export interface TabsSlice {
  tabs: StructureTab[];
  activeTabId: string | null;
  topologyOverrides: Record<string, string>;  // overrides of the ACTIVE structure
  addTab: (doc: StandardStructureObject, name: string) => string;
  switchTab: (id: string) => void;
  closeTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
  setTopologyOverride: (bondId: string, value: string | null) => void;
  clearTopologyOverrides: () => void;
}
```

Add `PresetSlice & TabsSlice` to the `StructureState` composite type.

- [ ] **Step 2: Write failing tests for tabs slice**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStructureStore } from '../useStructureStore';

const fakeDoc = (n: string) => ({ structure: { symbols: ['O','H','H'], positions: [[0,0,0],[0.96,0,0],[-0.24,0.93,0]] } }) as never;

describe('tabs slice', () => {
  beforeEach(() => useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} }));

  it('addTab stores doc, activates it, and pushes structureData', () => {
    const id = useStructureStore.getState().addTab(fakeDoc('a'), 'a');
    const s = useStructureStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.activeTabId).toBe(id);
    expect(s.structureData).toBe(s.tabs[0].doc);
  });

  it('switchTab snapshots overrides into the old tab and restores the new one', () => {
    const st = useStructureStore.getState();
    const a = st.addTab(fakeDoc('a'), 'a');
    const b = useStructureStore.getState().addTab(fakeDoc('b'), 'b');
    useStructureStore.getState().setTopologyOverride('0-1', 'delete');
    useStructureStore.getState().switchTab(a);
    expect(useStructureStore.getState().topologyOverrides).toEqual({});
    const tabB = useStructureStore.getState().tabs.find(t => t.id === b)!;
    expect(tabB.bondOverrides).toEqual({ '0-1': 'delete' });
  });

  it('closeTab of active tab activates a neighbor', () => {
    const a = useStructureStore.getState().addTab(fakeDoc('a'), 'a');
    useStructureStore.getState().addTab(fakeDoc('b'), 'b');
    useStructureStore.getState().closeTab(useStructureStore.getState().activeTabId!);
    expect(useStructureStore.getState().activeTabId).toBe(a);
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (`addTab is not a function`).

- [ ] **Step 4: Implement createTabsSlice.ts**

```ts
import type { StateCreator } from 'zustand';
import type { StructureState, TabsSlice, StructureTab } from '../../types/store';

const snapshot = (s: StructureState, tab: StructureTab): StructureTab => ({
  ...tab,
  doc: s.structureData ?? tab.doc,
  bondOverrides: { ...s.topologyOverrides },
  colorOverrides: s.colorOverrides ? { ...s.colorOverrides } : null,
  opacityOverrides: s.opacityOverrides ? { ...s.opacityOverrides } : null,
});

export const createTabsSlice: StateCreator<StructureState, [], [], TabsSlice> = (set, get) => ({
  tabs: [],
  activeTabId: null,
  topologyOverrides: {},

  addTab: (doc, name) => {
    const id = crypto.randomUUID();
    const tab: StructureTab = { id, name, doc, bondOverrides: {}, colorOverrides: null, opacityOverrides: null, camera: null };
    set((s) => ({
      tabs: [...s.tabs.map(t => (t.id === s.activeTabId ? snapshot(s, t) : t)), tab],
      activeTabId: id,
      topologyOverrides: {},
      colorOverrides: null,
      opacityOverrides: null,
      selectedAtoms: [],
      selectedBonds: [],
    }));
    get().setStructureData(doc);
    return id;
  },

  switchTab: (id) => {
    const s = get();
    const target = s.tabs.find(t => t.id === id);
    if (!target || id === s.activeTabId) return;
    set({
      tabs: s.tabs.map(t => (t.id === s.activeTabId ? snapshot(s, t) : t)),
      activeTabId: id,
      topologyOverrides: { ...target.bondOverrides },
      colorOverrides: target.colorOverrides ? { ...target.colorOverrides } : null,
      opacityOverrides: target.opacityOverrides ? { ...target.opacityOverrides } : null,
      selectedAtoms: [],
      selectedBonds: [],
    });
    get().setStructureData(target.doc);
  },

  closeTab: (id) => {
    const s = get();
    const idx = s.tabs.findIndex(t => t.id === id);
    if (idx < 0) return;
    const tabs = s.tabs.filter(t => t.id !== id);
    if (id !== s.activeTabId) { set({ tabs }); return; }
    const next = tabs[Math.max(0, idx - 1)] ?? null;
    set({ tabs, activeTabId: next?.id ?? null, topologyOverrides: next ? { ...next.bondOverrides } : {} });
    if (next) get().setStructureData(next.doc);
  },

  renameTab: (id, name) => set((s) => ({ tabs: s.tabs.map(t => (t.id === id ? { ...t, name } : t)) })),

  setTopologyOverride: (bondId, value) => set((s) => {
    const next = { ...s.topologyOverrides };
    if (value === null) delete next[bondId]; else next[bondId] = value;
    return { topologyOverrides: next };
  }),

  clearTopologyOverrides: () => set({ topologyOverrides: {} }),
});
```

(If `setStructureData` clears overrides internally — check the copied data slice — reorder so overrides are set AFTER `setStructureData`.)

- [ ] **Step 5: Write failing tests for preset slice**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStructureStore } from '../useStructureStore';

describe('preset slice', () => {
  beforeEach(() => useStructureStore.getState().replacePreset({
    presetName: 'default', elements: {}, bondsStyle: { style: 'cylinder', radius: 0.12, colorMode: 'element-split' },
  }));

  it('setElementStyle merges per-element style', () => {
    useStructureStore.getState().setElementStyle('C', { color: '#222222' });
    useStructureStore.getState().setElementStyle('C', { radiusScale: 0.8 });
    expect(useStructureStore.getState().elements['C']).toEqual({ color: '#222222', radiusScale: 0.8 });
  });

  it('clearElementStyle removes the entry', () => {
    useStructureStore.getState().setElementStyle('C', { color: '#222222' });
    useStructureStore.getState().clearElementStyle('C');
    expect(useStructureStore.getState().elements['C']).toBeUndefined();
  });
});
```

- [ ] **Step 6: Implement createPresetSlice.ts**

```ts
import type { StateCreator } from 'zustand';
import type { StructureState, PresetSlice } from '../../types/store';

export const createPresetSlice: StateCreator<StructureState, [], [], PresetSlice> = (set) => ({
  presetName: 'default',
  elements: {},
  bondsStyle: { style: 'cylinder', radius: 0.12, colorMode: 'element-split' },

  setElementStyle: (symbol, style) => set((s) => ({
    elements: { ...s.elements, [symbol]: { ...s.elements[symbol], ...style } },
  })),
  clearElementStyle: (symbol) => set((s) => {
    const next = { ...s.elements };
    delete next[symbol];
    return { elements: next };
  }),
  setBondsStyle: (b) => set((s) => ({ bondsStyle: { ...s.bondsStyle, ...b } })),
  setPresetName: (presetName) => set({ presetName }),
  replacePreset: (p) => set({ presetName: p.presetName, elements: p.elements, bondsStyle: p.bondsStyle }),
});
```

Register both slices in `useStructureStore.ts`.

- [ ] **Step 7: Run tests + typecheck — expect PASS. Commit** — `feat(frontend): tabs, style-preset and topology-override slices`

### Task 8: Element styles drive rendering

Element-level styles must translate to the per-atom override mechanism the copied renderer already understands, and radiusScale needs renderer support.

**Files:**
- Create: `$DST/frontend/src/services/elementStyleApply.ts`
- Test: `$DST/frontend/src/services/elementStyleApply.test.ts`
- Modify: `$DST/frontend/src/components/r3f/Atoms.tsx` (Task 9 verifies visually; unit-testable parts here)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { elementStylesToAtomOverrides } from './elementStyleApply';

describe('elementStylesToAtomOverrides', () => {
  const symbols = ['C', 'H', 'C', 'O'];

  it('maps element color/opacity to atom-index overrides', () => {
    const r = elementStylesToAtomOverrides(symbols, { C: { color: '#112233', opacity: 0.5 } });
    expect(r.colorOverrides).toEqual({ 0: '#112233', 2: '#112233' });
    expect(r.opacityOverrides).toEqual({ 0: 0.5, 2: 0.5 });
    expect(r.radiusOverrides).toEqual({});
  });

  it('returns radius overrides separately', () => {
    const r = elementStylesToAtomOverrides(symbols, { H: { radiusScale: 0.6 } });
    expect(r.radiusOverrides).toEqual({ 1: 0.6 });
  });
});
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement**

```ts
import type { ElementStyle } from '../types/store';

export interface AtomOverrides {
  colorOverrides: { [i: number]: string };
  opacityOverrides: { [i: number]: number };
  radiusOverrides: { [i: number]: number };
}

export function elementStylesToAtomOverrides(
  symbols: string[],
  elements: Record<string, ElementStyle>,
): AtomOverrides {
  const colorOverrides: AtomOverrides['colorOverrides'] = {};
  const opacityOverrides: AtomOverrides['opacityOverrides'] = {};
  const radiusOverrides: AtomOverrides['radiusOverrides'] = {};
  symbols.forEach((sym, i) => {
    const st = elements[sym];
    if (!st) return;
    if (st.color !== undefined) colorOverrides[i] = st.color;
    if (st.opacity !== undefined) opacityOverrides[i] = st.opacity;
    if (st.radiusScale !== undefined) radiusOverrides[i] = st.radiusScale;
  });
  return { colorOverrides, opacityOverrides, radiusOverrides };
}
```

- [ ] **Step 4: Run — PASS.**

- [ ] **Step 5: Add `radiusOverrides` prop to Atoms.tsx**

In the copied `Atoms.tsx`, find where each atom instance's scale is computed from its element radius (the instance matrix composition). Add an optional prop `radiusOverrides?: { [i: number]: number }` and multiply the base radius by `radiusOverrides[i] ?? 1`. Keep the prop optional so existing call sites compile.

- [ ] **Step 6: Typecheck + commit** — `feat(frontend): element-level styles mapped onto per-atom overrides, radius scaling in Atoms`

### Task 9: Copy r3f components, minimal canvas App

**Files:**
- Create (copy+trim): `$DST/frontend/src/components/r3f/{Atoms.tsx,Bonds.tsx,HBonds.tsx,AromaticRings.tsx,aromaticRingsUtils.ts,bondRenderability.ts,UnitCell.tsx,AxesGizmo.tsx,axesGizmoUtils.ts,ViewerCanvas.tsx}` + `materials/` + `Scene/` subdirs
- Create: `$DST/frontend/src/App.tsx` (minimal: full-screen ViewerCanvas + hidden file input)
- Modify: `$DST/frontend/src/main.tsx` (dark MUI theme)

- [ ] **Step 1: Copy r3f files** (NOT `Measurement.tsx`, NOT `Isosurface.tsx`):

```bash
cp $SRCF/src/components/r3f/{Atoms.tsx,Bonds.tsx,HBonds.tsx,AromaticRings.tsx,aromaticRingsUtils.ts,bondRenderability.ts,UnitCell.tsx,AxesGizmo.tsx,axesGizmoUtils.ts,ViewerCanvas.tsx} $DSTF/src/components/r3f/
cp -R $SRCF/src/components/r3f/materials $SRCF/src/components/r3f/Scene $DSTF/src/components/r3f/ 2>/dev/null || true
```

- [ ] **Step 2: Trim ViewerCanvas.tsx** — remove Measurement/Isosurface imports and JSX, calculation overlays, anything referencing deleted slices. Wire `radiusOverrides` (from Task 8: `elementStylesToAtomOverrides` of the preset slice state, merged with per-atom overrides where per-atom wins) into `<Atoms/>`.

- [ ] **Step 3: Minimal App.tsx**

```tsx
import { useCallback, useRef } from 'react';
import { ViewerCanvas } from './components/r3f/ViewerCanvas';
import { useStructureStore } from './store/useStructureStore';
import { structureService } from './services/structureService';

export default function App() {
  const fileRef = useRef<HTMLInputElement>(null);
  const addTab = useStructureStore((s) => s.addTab);

  const onFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const doc = await structureService.uploadStructure(file);
      addTab(doc, file.name.replace(/\.[^.]+$/, ''));
    }
  }, [addTab]);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <ViewerCanvas />
      <input ref={fileRef} type="file" multiple hidden data-testid="file-input"
             onChange={(e) => onFiles(e.target.files)} />
      <button style={{ position: 'absolute', top: 8, left: 8 }} onClick={() => fileRef.current?.click()}>
        Open
      </button>
    </div>
  );
}
```

(Adapt the `structureService.uploadStructure` signature to the copied source — check it before writing. The toolbar replaces this button in Task 10.)

In `main.tsx` wrap with MUI `ThemeProvider` + `createTheme({ palette: { mode: 'dark' } })` + `CssBaseline`.

- [ ] **Step 4: Manual smoke test**

```bash
cd $DST/backend && ./run.sh &          # port 8000
cd $DSTF && npm run dev &              # port 3000
```

Create `$DST/fixtures/water.xyz`:

```
3
water
O 0.000 0.000 0.119
H 0.000 0.763 -0.477
H 0.000 -0.763 -0.477
```

Open http://localhost:3000, click Open, choose `water.xyz`. Expected: red O + two white H with two bonds on dark background. Use agent-browser/Playwright MCP to verify and screenshot. Kill both servers after.

- [ ] **Step 5: Typecheck, build, commit** — `feat(frontend): r3f viewer renders uploaded structures`

---

## Phase C — Shell UI (canvas-first)

### Task 10: Toolbar + structure tabs

**Files:**
- Create: `$DST/frontend/src/components/shell/TopBar.tsx`, `$DST/frontend/src/components/shell/StructureTabs.tsx`, `$DST/frontend/src/components/shell/PanelHost.tsx`
- Modify: `$DST/frontend/src/App.tsx`
- Test: `$DST/frontend/src/components/shell/StructureTabs.test.tsx`

- [ ] **Step 1: Failing test for tabs UI**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StructureTabs } from './StructureTabs';
import { useStructureStore } from '../../store/useStructureStore';

const fakeDoc = () => ({ structure: { symbols: ['O'], positions: [[0,0,0]] } }) as never;

describe('StructureTabs', () => {
  it('renders a chip per tab and switches on click', () => {
    const a = useStructureStore.getState().addTab(fakeDoc(), 'water');
    useStructureStore.getState().addTab(fakeDoc(), 'slab');
    render(<StructureTabs />);
    fireEvent.click(screen.getByText('water'));
    expect(useStructureStore.getState().activeTabId).toBe(a);
  });
});
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement StructureTabs.tsx**

```tsx
import { Chip, Stack } from '@mui/material';
import { useStructureStore } from '../../store/useStructureStore';

export function StructureTabs() {
  const tabs = useStructureStore((s) => s.tabs);
  const activeTabId = useStructureStore((s) => s.activeTabId);
  const switchTab = useStructureStore((s) => s.switchTab);
  const closeTab = useStructureStore((s) => s.closeTab);
  if (tabs.length === 0) return null;
  return (
    <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', maxWidth: '50vw' }}>
      {tabs.map((t) => (
        <Chip key={t.id} label={t.name} size="small"
          color={t.id === activeTabId ? 'primary' : 'default'}
          onClick={() => switchTab(t.id)} onDelete={() => closeTab(t.id)} />
      ))}
    </Stack>
  );
}
```

- [ ] **Step 4: Implement TopBar.tsx** — one slim fixed bar: Open button (file input), `<StructureTabs/>`, spacer, panel toggle icons (Palette → `style`, Link → `bonds`, Tune → `scene` via MUI icons), Export menu button (menu items wired in Task 14/15; render disabled until then). Panel toggles write to a local `activePanel: 'style' | 'bonds' | 'scene' | null` state owned by App and passed down.

- [ ] **Step 5: Implement PanelHost.tsx** — `<Drawer anchor="right" variant="persistent" open={!!activePanel}>` rendering the matching panel (panels are Tasks 11–13; render `null` placeholders for now, replaced as panels land).

- [ ] **Step 6: Wire into App.tsx** (replace Task 9's button). Keyboard shortcuts: `s`/`b`/`c` toggle panels, `Escape` closes (add `keydown` listener in App; ignore when focus is in input/textarea).

- [ ] **Step 7: Tests + typecheck + visual smoke (same flow as Task 9 step 4). Commit** — `feat(frontend): canvas-first shell with toolbar, tabs, drawer host`

### Task 11: Style panel

**Files:**
- Create: `$DST/frontend/src/components/panels/StylePanel.tsx`
- Test: `$DST/frontend/src/components/panels/StylePanel.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StylePanel } from './StylePanel';
import { useStructureStore } from '../../store/useStructureStore';

const doc = () => ({ structure: { symbols: ['O','H','H'], positions: [[0,0,0],[1,0,0],[0,1,0]] } }) as never;

describe('StylePanel', () => {
  beforeEach(() => { useStructureStore.setState({ tabs: [], activeTabId: null }); useStructureStore.getState().addTab(doc(), 'w'); });

  it('lists each distinct element once', () => {
    render(<StylePanel />);
    expect(screen.getByText('O')).toBeInTheDocument();
    expect(screen.getByText('H')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + O + H
  });

  it('element opacity slider writes preset slice', () => {
    render(<StylePanel />);
    fireEvent.change(screen.getByTestId('opacity-O'), { target: { value: '0.4' } });
    expect(useStructureStore.getState().elements['O']?.opacity).toBeCloseTo(0.4);
  });
});
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement StylePanel.tsx**

Structure: a table with one row per distinct element of the active structure (derive `Array.from(new Set(symbols))`). Per row: element symbol, color swatch button opening `react-colorful` `<HexColorPicker>` in a Popover (writes `setElementStyle(sym, {color})`), radiusScale slider (0.3–2.0, step 0.05), opacity slider (0–1, step 0.05, `data-testid={'opacity-'+sym}` as native input via MUI Slider `slotProps`), reset IconButton calling `clearElementStyle(sym)`. Below the table: bond radius slider + colorMode toggle (writes `setBondsStyle`), background color picker + transparent checkbox and lighting intensity slider (write to the copied scene slice — check its actual setter names with grep and use those). A `useEffect` watching `[elements, structureData]` recomputes `elementStylesToAtomOverrides(symbols, elements)` and pushes `setColorOverrides`/`setOpacityOverrides` (merging on top of any per-atom overrides stored in the active tab — per-atom wins).

Per-atom override entry point: when `selectedAtoms.length > 0`, show a small section "Selected atoms (N)" with a color picker writing those indices directly via `setColorOverrides({...existing, ...fromSelection})`.

- [ ] **Step 4: Tests pass; register in PanelHost; visual smoke. Commit** — `feat(frontend): style panel (element colors/radius/opacity, bonds, background)`

### Task 12: Bond edit panel + SelectionInput

**Files:**
- Create (copy+trim): `$DST/frontend/src/components/panels/SelectionInput.tsx` (from `$SRCF/src/components/editor/SelectionInput.tsx`)
- Create: `$DST/frontend/src/components/panels/BondEditPanel.tsx`
- Create: `$DST/frontend/src/services/topologyRefresh.ts`
- Test: `$DST/frontend/src/services/topologyRefresh.test.ts`

- [ ] **Step 1: Copy SelectionInput.tsx, trim** imports referencing removed slices/services; it should keep the expression field + apply button wired to `selectionService.parseExpression` and the selection actions in the UI slice.

- [ ] **Step 2: Failing test for topologyRefresh**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshTopology } from './topologyRefresh';
import { useStructureStore } from '../store/useStructureStore';
import { bondService } from './bondService';

vi.mock('./bondService', () => ({ bondService: { updateVisualization: vi.fn() } }));

const doc = () => ({ structure: { symbols: ['O','H'], positions: [[0,0,0],[1,0,0]] }, visualization: { bonds: [[0,1,1]] } }) as never;

describe('refreshTopology', () => {
  beforeEach(() => { useStructureStore.setState({ tabs: [], activeTabId: null }); useStructureStore.getState().addTab(doc(), 'w'); });

  it('posts current structure + overrides + threshold, stores returned visualization', async () => {
    (bondService.updateVisualization as ReturnType<typeof vi.fn>).mockResolvedValue({ bonds: [] });
    useStructureStore.getState().setTopologyOverride('0-1', 'delete');
    await refreshTopology();
    const call = (bondService.updateVisualization as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.bond_overrides).toEqual({ '0-1': 'delete' });
    expect(useStructureStore.getState().structureData?.visualization?.bonds).toEqual([]);
  });
});
```

- [ ] **Step 3: Run — FAIL. Step 4: Implement topologyRefresh.ts**

```ts
import { useStructureStore } from '../store/useStructureStore';
import { bondService } from './bondService';

export async function refreshTopology(): Promise<void> {
  const s = useStructureStore.getState();
  if (!s.structureData) return;
  const vis = await bondService.updateVisualization({
    structure: s.structureData.structure,
    bond_overrides: s.topologyOverrides,
    bond_scale: s.visParams.bondThreshold,
    h_bond_distance_cutoff: s.visParams.hBondMaxDist,
    h_bond_angle_cutoff: s.visParams.hBondMinAngle,
  });
  s.setStructureData({ ...s.structureData, visualization: vis });
}
```

(Match `bondService.updateVisualization`'s real payload/return shape from the copied service — adjust field names to the actual code, the test mirrors whatever shape is real.)

- [ ] **Step 5: Implement BondEditPanel.tsx**

Sections:
1. `<SelectionInput/>` (reused).
2. "Selected pair" — enabled iff `selectedAtoms.length === 2`: shows the pair, buttons **Add/Set order** (order select: 1/1.5/2/3 → `setTopologyOverride('i-j', order)`) and **Delete bond** (→ `setTopologyOverride('i-j', 'delete')`); both then `await refreshTopology()`.
3. "Manual overrides" list — one row per entry of `topologyOverrides`: `3–17 → delete` with a revert IconButton (`setTopologyOverride(id, null)` + refresh), plus "Clear all".

Bond id is always `${Math.min(i,j)}-${Math.max(i,j)}`.

- [ ] **Step 6: Tests + typecheck; visual smoke: select two atoms in canvas, delete bond, see it disappear. Commit** — `feat(frontend): bond edit panel with selection DSL and per-override revert`

### Task 13: Scene panel

**Files:**
- Create: `$DST/frontend/src/components/panels/ScenePanel.tsx`

- [ ] **Step 1: Implement** — camera preset buttons (front/top/side → write the corresponding `CameraSnapshot` via the copied view-controls action; check `cameraRotation.ts` for existing preset helpers and reuse), toggles bound to `visParams`/`viewControls`: show unit cell, show ghost atoms (PBC), show H-bonds, show axes gizmo; bond threshold slider (0.8–1.6, step 0.02) bound to `setBondThreshold` with a debounced (300 ms) `refreshTopology()` on change.

- [ ] **Step 2: Typecheck + visual smoke (threshold slider visibly re-bonds a structure). Commit** — `feat(frontend): scene panel (camera presets, toggles, bond threshold)`

---

## Phase D — Documents & export

### Task 14: style.json / scene.json documents

**Files:**
- Create: `$DST/frontend/src/services/sceneDocument.ts`
- Test: `$DST/frontend/src/services/sceneDocument.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { buildStylePreset, applyStylePreset, buildSceneDocument, applySceneDocument, parseDocument } from './sceneDocument';
import { useStructureStore } from '../store/useStructureStore';

const doc = () => ({ structure: { symbols: ['O','H','H'], positions: [[0,0,0],[1,0,0],[0,1,0]] } }) as never;

describe('style preset round-trip', () => {
  beforeEach(() => useStructureStore.setState({ tabs: [], activeTabId: null }));

  it('build → apply restores element styles and bond style', () => {
    const st = useStructureStore.getState();
    st.setElementStyle('C', { color: '#101010' });
    st.setBondsStyle({ radius: 0.2 });
    const preset = buildStylePreset(useStructureStore.getState());
    expect(preset.kind).toBe('atomcanvas-style');
    useStructureStore.getState().replacePreset({ presetName: 'x', elements: {}, bondsStyle: { style: 'cylinder', radius: 0.12, colorMode: 'element-split' } });
    applyStylePreset(preset);
    expect(useStructureStore.getState().elements['C']).toEqual({ color: '#101010' });
    expect(useStructureStore.getState().bondsStyle.radius).toBe(0.2);
  });
});

describe('scene document round-trip', () => {
  it('captures structures + overrides and restores them', () => {
    useStructureStore.getState().addTab(doc(), 'w1');
    useStructureStore.getState().setTopologyOverride('0-1', 'delete');
    const scene = buildSceneDocument(useStructureStore.getState());
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    applySceneDocument(scene);
    const s = useStructureStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].name).toBe('w1');
    expect(s.topologyOverrides).toEqual({ '0-1': 'delete' });
  });
});

describe('parseDocument validation', () => {
  it('rejects unknown kind', () => {
    expect(() => parseDocument(JSON.stringify({ kind: 'nope', schemaVersion: 1 }))).toThrow(/kind/);
  });
  it('rejects newer schemaVersion', () => {
    expect(() => parseDocument(JSON.stringify({ kind: 'atomcanvas-style', schemaVersion: 99 }))).toThrow(/schemaVersion/);
  });
});
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement sceneDocument.ts**

```ts
import type { StructureState, StylePresetState, StructureTab, CameraSnapshot } from '../types/store';
import { useStructureStore } from '../store/useStructureStore';

export const SCHEMA_VERSION = 1;

export interface StylePresetDoc extends StylePresetState {
  schemaVersion: number;
  kind: 'atomcanvas-style';
  background: { color: string; transparent: boolean };
  lighting: { intensity: number };
}

export interface SceneDoc {
  schemaVersion: number;
  kind: 'atomcanvas-scene';
  structures: Array<Pick<StructureTab, 'name' | 'doc' | 'bondOverrides' | 'colorOverrides' | 'opacityOverrides'>>;
  style: Omit<StylePresetDoc, 'kind' | 'schemaVersion'>;
  camera: CameraSnapshot | null;
  activeIndex: number;
}

export function buildStylePreset(s: StructureState): StylePresetDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'atomcanvas-style',
    presetName: s.presetName,
    elements: s.elements,
    bondsStyle: s.bondsStyle,
    background: readBackground(s),
    lighting: readLighting(s),
  };
}

export function applyStylePreset(p: StylePresetDoc): void {
  const st = useStructureStore.getState();
  st.replacePreset({ presetName: p.presetName, elements: p.elements, bondsStyle: p.bondsStyle });
  writeBackground(p.background);
  writeLighting(p.lighting);
}

export function buildSceneDocument(s: StructureState): SceneDoc {
  const tabs = s.tabs.map((t) =>
    t.id === s.activeTabId
      ? { ...t, bondOverrides: { ...s.topologyOverrides }, colorOverrides: s.colorOverrides, opacityOverrides: s.opacityOverrides, doc: s.structureData ?? t.doc }
      : t,
  );
  const { kind: _k, schemaVersion: _v, ...style } = buildStylePreset(s);
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'atomcanvas-scene',
    structures: tabs.map(({ name, doc, bondOverrides, colorOverrides, opacityOverrides }) =>
      ({ name, doc, bondOverrides, colorOverrides, opacityOverrides })),
    style,
    camera: readCamera(s),
    activeIndex: Math.max(0, tabs.findIndex((t) => t.id === s.activeTabId)),
  };
}

export function applySceneDocument(scene: SceneDoc): void {
  const st = useStructureStore.getState();
  useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
  scene.structures.forEach((entry) => {
    useStructureStore.getState().addTab(entry.doc, entry.name);
    const id = useStructureStore.getState().activeTabId!;
    useStructureStore.setState((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, bondOverrides: entry.bondOverrides, colorOverrides: entry.colorOverrides, opacityOverrides: entry.opacityOverrides } : t)),
    }));
  });
  const target = useStructureStore.getState().tabs[scene.activeIndex];
  if (target) useStructureStore.getState().switchTab(target.id);
  applyStylePreset({ ...scene.style, kind: 'atomcanvas-style', schemaVersion: scene.schemaVersion });
  if (scene.camera) writeCamera(scene.camera);
}

export function parseDocument(json: string): StylePresetDoc | SceneDoc {
  const obj = JSON.parse(json);
  if (obj.kind !== 'atomcanvas-style' && obj.kind !== 'atomcanvas-scene') {
    throw new Error(`Unsupported document kind: ${obj.kind}`);
  }
  if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`Unsupported schemaVersion: ${obj.schemaVersion}`);
  }
  return obj;
}
```

`readBackground/writeBackground/readLighting/writeLighting/readCamera/writeCamera` are small adapters over the copied scene/UI slices — implement against the REAL field names found in `createSceneSlice.ts` / `ViewControls` (grep first; e.g. background color and lighting intensity live in scene settings, camera snapshot in view controls). The switchTab-after-addTab dance ensures the active tab's overrides land in the live fields.

- [ ] **Step 4: Run tests — PASS. Step 5: Commit** — `feat(frontend): style preset and scene document serialization with validation`

### Task 15: glb exporter (PowerPoint-compatible)

**Files:**
- Create: `$DST/frontend/src/services/glbExporter.ts`
- Test: `$DST/frontend/src/services/glbExporter.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildExportScene, exportGlb } from './glbExporter';

const structure = { symbols: ['O', 'H'], positions: [[0, 0, 0], [0.96, 0, 0]] };
const vis = { bonds: [[0, 1, 1]] as [number, number, number][] };
const style = { elements: {}, bondsStyle: { style: 'cylinder' as const, radius: 0.12, colorMode: 'element-split' as const } };

describe('glbExporter', () => {
  it('builds one mesh group per element plus bonds', () => {
    const scene = buildExportScene(structure, vis, style, { O: { color: [1, 0, 0], radius: 0.66 }, H: { color: [1, 1, 1], radius: 0.31 } });
    const names = scene.children.map((c) => c.name).sort();
    expect(names).toContain('atoms-O');
    expect(names).toContain('atoms-H');
    expect(names).toContain('bonds');
  });

  it('produces a binary glb (magic bytes glTF)', async () => {
    const scene = buildExportScene(structure, vis, style, { O: { color: [1, 0, 0], radius: 0.66 }, H: { color: [1, 1, 1], radius: 0.31 } });
    const buf = await exportGlb(scene);
    expect(new TextDecoder().decode(new Uint8Array(buf, 0, 4))).toBe('glTF');
  });
});
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement glbExporter.ts**

```ts
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ElementStyle, BondStyleSettings } from '../types/store';

interface ElementData { color: [number, number, number]; radius: number }
interface MinimalStructure { symbols: string[]; positions: number[][] }
interface MinimalVis { bonds: [number, number, number][] }
interface MinimalStyle { elements: Record<string, ElementStyle>; bondsStyle: BondStyleSettings }

const SPHERE_SEGMENTS = 24;
const CYL_SEGMENTS = 16;

function hexToRgb(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

export function buildExportScene(
  structure: MinimalStructure,
  vis: MinimalVis,
  style: MinimalStyle,
  elementData: Record<string, ElementData>,
): THREE.Scene {
  const scene = new THREE.Scene();
  const bySymbol = new Map<string, number[]>();
  structure.symbols.forEach((s, i) => {
    if (!bySymbol.has(s)) bySymbol.set(s, []);
    bySymbol.get(s)!.push(i);
  });

  for (const [sym, indices] of bySymbol) {
    const st = style.elements[sym] ?? {};
    const base = elementData[sym] ?? { color: [0.8, 0.4, 0.8] as [number, number, number], radius: 0.5 };
    const radius = base.radius * (st.radiusScale ?? 1);
    const color = st.color ? hexToRgb(st.color) : base.color;
    const geoms = indices.map((i) => {
      const g = new THREE.SphereGeometry(radius, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
      g.translate(structure.positions[i][0], structure.positions[i][1], structure.positions[i][2]);
      return g;
    });
    const mesh = new THREE.Mesh(
      mergeGeometries(geoms),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(...color),
        roughness: 0.35,
        metalness: 0.0,
        transparent: (st.opacity ?? 1) < 1,
        opacity: st.opacity ?? 1,
      }),
    );
    mesh.name = `atoms-${sym}`;
    scene.add(mesh);
  }

  const bondGeoms: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const [i, j] of vis.bonds) {
    const a = new THREE.Vector3(...(structure.positions[i] as [number, number, number]));
    const b = new THREE.Vector3(...(structure.positions[j] as [number, number, number]));
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-6) continue;
    const halves: Array<[THREE.Vector3, string]> = style.bondsStyle.colorMode === 'element-split'
      ? [[a.clone().addScaledVector(dir, 0.25), structure.symbols[i]], [a.clone().addScaledVector(dir, 0.75), structure.symbols[j]]]
      : [[a.clone().addScaledVector(dir, 0.5), '']];
    const segLen = style.bondsStyle.colorMode === 'element-split' ? len / 2 : len;
    for (const [center] of halves) {
      const g = new THREE.CylinderGeometry(style.bondsStyle.radius, style.bondsStyle.radius, segLen, CYL_SEGMENTS);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize()));
      g.translate(center.x, center.y, center.z);
      bondGeoms.push(g);
    }
  }
  if (bondGeoms.length > 0) {
    const mat = new THREE.MeshStandardMaterial({
      color: style.bondsStyle.colorMode === 'uniform' && style.bondsStyle.uniformColor
        ? new THREE.Color(style.bondsStyle.uniformColor) : new THREE.Color(0.55, 0.55, 0.55),
      roughness: 0.45,
    });
    const mesh = new THREE.Mesh(mergeGeometries(bondGeoms), mat);
    mesh.name = 'bonds';
    scene.add(mesh);
  }
  return scene;
}

export async function exportGlb(scene: THREE.Scene): Promise<ArrayBuffer> {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, { binary: true });
  return result as ArrayBuffer;
}
```

YAGNI note: v1 split-color bonds reuse a single grey material (true per-element split coloring of bond halves is a v2 nicety — splitting geometry by element color means one merged geometry per (element-color) group; implement only if trivial: group `halves` by symbol color and emit one mesh per color group. If you do, keep the test's `bonds` name on the group node).

- [ ] **Step 3b: element data source** — the caller reads `public/atom.json` (fetch at app start, already done by copied code — find where Atoms.tsx gets it and reuse that loader) and passes `{color, radius}` per element.

- [ ] **Step 4: Run tests — PASS** (if `GLTFExporter.parseAsync` fails under jsdom on `FileReader`, polyfill in `src/test/setup.ts`: jsdom provides FileReader/Blob — if a `TextEncoder`/`canvas` gap appears, set `// @vitest-environment node` on the test file and import `jsdom`-free; resolve whichever way is green).

- [ ] **Step 5: Commit** — `feat(frontend): PowerPoint-compatible glb exporter from structure + style`

### Task 16: Export menu + batch export + downloads

**Files:**
- Create: `$DST/frontend/src/services/download.ts`, `$DST/frontend/src/services/batchExport.ts`
- Create: `$DST/frontend/src/components/shell/ExportMenu.tsx`
- Modify: `$DST/frontend/src/components/shell/TopBar.tsx`
- Test: `$DST/frontend/src/services/batchExport.test.ts`

- [ ] **Step 1: download.ts**

```ts
export function downloadBlob(data: Blob | ArrayBuffer | string, filename: string, mime: string): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const seen = new Map<string, number>();
export function uniqueName(base: string, ext: string): string {
  const key = `${base}.${ext}`;
  const n = (seen.get(key) ?? 0) + 1;
  seen.set(key, n);
  return n === 1 ? key : `${base}-${n}.${ext}`;
}
```

- [ ] **Step 2: Failing test for batchExport naming/iteration**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { batchExportGlb } from './batchExport';
import { useStructureStore } from '../store/useStructureStore';
import * as dl from './download';

vi.mock('./glbExporter', async (orig) => ({ ...(await orig()), exportGlb: vi.fn().mockResolvedValue(new ArrayBuffer(8)) }));

const doc = () => ({ structure: { symbols: ['O'], positions: [[0,0,0]] }, visualization: { bonds: [] } }) as never;

describe('batchExportGlb', () => {
  beforeEach(() => { useStructureStore.setState({ tabs: [], activeTabId: null }); });

  it('emits one download per tab named after the tab', async () => {
    const spy = vi.spyOn(dl, 'downloadBlob').mockImplementation(() => {});
    useStructureStore.getState().addTab(doc(), 'water');
    useStructureStore.getState().addTab(doc(), 'slab');
    await batchExportGlb();
    const names = spy.mock.calls.map((c) => c[1]);
    expect(names).toEqual(['water.glb', 'slab.glb']);
  });
});
```

- [ ] **Step 3: Run — FAIL. Step 4: Implement batchExport.ts**

```ts
import { useStructureStore } from '../store/useStructureStore';
import { buildExportScene, exportGlb } from './glbExporter';
import { downloadBlob, uniqueName } from './download';
import { getElementData } from './elementData';   // the atom.json loader found in Task 15 step 3b; extract to its own module if it lives inside a component
import { buildSceneDocument } from './sceneDocument';

export async function batchExportGlb(): Promise<void> {
  const s = useStructureStore.getState();
  for (const tab of s.tabs) {
    const live = tab.id === s.activeTabId;
    const doc = live ? (s.structureData ?? tab.doc) : tab.doc;
    const scene = buildExportScene(
      doc.structure,
      doc.visualization,
      { elements: s.elements, bondsStyle: s.bondsStyle },
      await getElementData(),
    );
    const buf = await exportGlb(scene);
    downloadBlob(buf, uniqueName(tab.name, 'glb'), 'model/gltf-binary');
  }
}

export function exportSceneJson(): void {
  const sceneDoc = buildSceneDocument(useStructureStore.getState());
  downloadBlob(JSON.stringify(sceneDoc, null, 2), uniqueName(sceneDoc.structures[0]?.name ?? 'scene', 'scene.json'), 'application/json');
}

export function exportStyleJson(): void {
  const s = useStructureStore.getState();
  // buildStylePreset import: add at top
}
```

(Complete `exportStyleJson` with `buildStylePreset` + `downloadBlob(JSON.stringify(...), `${presetName}.style.json`, 'application/json')`. Batch PNG: iterate tabs with `switchTab`, await two `requestAnimationFrame` ticks, call the copied image-export executor capture for the active canvas; implement as `batchExportPng()` following the copied `imageExportFlow.ts` entry point — read it first and call its real API.)

- [ ] **Step 5: ExportMenu.tsx** — MUI Menu on the TopBar Export button: `PNG (current)`, `glb (current)`, `style.json`, `scene.json`, divider, `Batch: all tabs → PNG`, `Batch: all tabs → glb`, `Structure file (CIF/POSCAR/XYZ)…` (opens a small dialog with format select posting to backend `/export` via copied `structureService.exportStructure`). Import menu items too: `Open scene.json / style.json` — a file input that routes through `parseDocument` and `applySceneDocument`/`applyStylePreset`; on validation error show an MUI Snackbar with the message.

- [ ] **Step 6: Tests + typecheck + visual smoke (export a real glb of water, verify magic bytes with `xxd downloaded.glb | head -1`). Commit** — `feat(frontend): export menu with png/glb/json + batch export`

- [ ] **Step 7 (manual acceptance, optional but recommended):** open the exported `.glb` in macOS Quick Look (`qlmanage -p water.glb`) to eyeball geometry; if a PPT is handy, insert via the ppt skill's model3d flow to confirm PowerPoint accepts it.

---

## Phase E — E2E, docs, polish

### Task 17: Playwright e2e

**Files:**
- Create: `$DST/frontend/e2e/visualize-edit-export.spec.ts`, `$DST/frontend/playwright.config.ts`
- Create: `$DST/scripts/start.sh`, `$DST/scripts/stop.sh`

- [ ] **Step 1: start/stop scripts** (pattern-match `$SRC/scripts/start.sh`): start backend (run.sh) + `npm run dev`, write PIDs to `/tmp/atomcanvas.pids`; stop kills them.

- [ ] **Step 2: playwright.config.ts** — copy `$SRCF/playwright.config.ts` and trim to one chromium project, `webServer` entries for backend (`run.sh`, port 8000) and frontend (`npm run dev`, port 3000).

- [ ] **Step 3: The spec**

```ts
import { test, expect } from '@playwright/test';
import path from 'path';

test('upload → render → delete bond → export scene.json', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('[data-testid="file-input"]', path.resolve(__dirname, '../../fixtures/water.xyz'));
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('water')).toBeVisible();          // tab chip

  // open bond panel, use selection expression to select the two bonded atoms
  await page.keyboard.press('b');
  await page.getByRole('textbox', { name: /selection/i }).fill('label:O1,H1');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /delete bond/i }).click();
  await expect(page.getByText('0-1')).toBeVisible();             // override list entry

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /export/i }).click();
  await page.getByRole('menuitem', { name: /scene\.json/i }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.scene\.json$/);
});
```

(Adapt selectors to the real DOM after Tasks 10–16; keep the assertions' substance: tab appears, override registered, scene.json downloads.)

- [ ] **Step 4: Run** `cd $DSTF && npx playwright test` — expect PASS. Fix selector drift.

- [ ] **Step 5: Commit** — `test(e2e): upload→edit-bond→export flow`

### Task 18: Docs + final review

**Files:**
- Create: `$DST/AGENTS.md` (NOT CLAUDE.md — user's global rule), `$DST/README.md`

- [ ] **Step 1: AGENTS.md** — short: project purpose (visualization-only, extracted from ase-view), env (`ase-view-env` conda required, exact python path), commands (backend run.sh/pytest, frontend dev/test/e2e), architecture map (the Phase A/B file tree from the spec), conventions (stateless backend, structure travels with requests; bond id `min-max`; scene/style JSON schemaVersion gate), anti-patterns carried over from ase-view (no heavy ASE work in async routes, no tracebacks in HTTP responses).

- [ ] **Step 2: README.md** — user-facing: what it does, screenshots placeholder, quickstart, export formats incl. how to insert glb into PowerPoint (Insert → 3D Models).

- [ ] **Step 3: Full verification sweep**

```bash
cd $DST/backend && /Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python -m pytest -q
cd $DST/frontend && npx tsc --noEmit && npm run test && npm run build
```

All green. Then `npm run lint` if configured; fix.

- [ ] **Step 4: Commit** — `docs: AGENTS.md + README`. Then request code review per superpowers:requesting-code-review.

---

## Self-review notes (already applied)

- Spec coverage: upload/parse ✓(T2,T9), bond detection+threshold ✓(T1,T13), manual bond editing+revert ✓(T12), H-bonds/ghosts/cell toggles ✓(T13), selection system ✓(T2,T12), element+per-atom styling ✓(T8,T11), style preset JSON ✓(T14), scene JSON ✓(T14), PNG ✓(T5 copied + T16 menu), glb/PPT ✓(T15,T16), ASE format export ✓(T2,T16), tabs+batch ✓(T7,T16), improve-while-copying ✓(T1 requirements trim, T3 lazy rdkit, stateless backend carried over), e2e ✓(T17).
- Out of scope honored: no measurement, no isosurface, no trajectory, no calculation/HPC code copied.
- Known risk: copied-code field names (scene slice setters, camera snapshot, imageExportFlow API, upload response shape). Mitigation baked in: every such step says "grep the real name first"; tsc + copied tests are the safety net.
