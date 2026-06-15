# HANDOFF — AtomCanvas: 7 viewer/edit/export fixes  (updated 2026-06-15)

## Status: ALL 7 DONE — implemented, TDD-tested, gated, visually smoke-tested
Branch `fix/viewer-export-7issues` (off `main` after PR #1 `9d5ed23`), 7 commits
(one per issue). NOT pushed / no PR yet — awaiting the user's call on integration.

Full gate GREEN on the branch: `tsc -b`, `eslint .`, `vitest run`
(35 files, 167 passed / 2 pre-existing skips), `vite build`.

### The 7 fixes (each its own commit, easiest→hardest)
| # | Commit | What |
|---|--------|------|
| #3 | `d1560fd` | Orthographic/perspective camera toggle in ScenePanel (store+renderer were already wired; UI was missing). |
| #6 | `89eeb6a` | Aromatic-ring torus tube now scales with bond radius via shared `utils/ringGeometry.ts` (viewport + glb). |
| #1 | `6ba3c73` | Selection floating bar uses the full react-colorful picker (extracted shared `components/common/ColorSwatch`); presets removed. |
| #4 | `65b1d43` | "Show unit cell" now exports to .glb (`buildUnitCell` — 12 edge cylinders; `cell`+`showUnitCell` threaded from batchExport). |
| #2 | `67ebc17` | Persistent atom labels (`buildAtomLabels` + `AtomLabels` sprite layer, gated on `showLabels`). |
| #5 | `2268004` | Opacity-aware bond trim (`getOpacityAwareBondTrim`): opaque→center (no "ball-on-cylinder" protrusion), transparent→surface trim. |
| #7 | `a436f07` | Render style baked into the .glb: per-style roughness + cartoon emissive + black inverted-hull outline (standard+cartoon, opaque-only). |

### Visual smoke test (live app, Playwright, /tmp/atomcanvas-shots)
- #3 ✅ Projection PERSPECTIVE/ORTHOGRAPHIC toggle present; clicking re-renders in parallel projection.
- #2 ✅ Labels "O1/H1/H2" render as sprites when toggled on (off by default).
- #1 ✅ Selecting an atom shows the floating bar; the colour swatch opens the react-colorful wheel.
- #4/#6/#7/#5(glb) — verified by the glbExporter/batchExport unit+integration tests (the scene-graph output IS the deliverable; not opened in a glTF viewer).

## Remaining follow-ups (NOT blocking)
1. **PR / merge**: decide single PR for the branch (or per-cluster). Not pushed yet.
2. **e2e re-golden**: #5 changed opaque-atom bond geometry (surface→center). Any
   Playwright screenshot baselines (`transparency-cartoon`, image-export specs)
   may need regoldening. The repo's only e2e spec (`visualize-edit-export.spec.ts`)
   references a selection combobox in the *bonds* panel that no longer exists there
   — stale, unrelated to these fixes, worth a separate look.
3. **#5 glb parity (optional)**: viewport surface-trims transparent atoms; the glb
   stays center-to-center for them (a minor fidelity gap, not a protrusion bug).
4. **#7 tuning (optional)**: cartoon emissive factor (0.3) and outline world offset
   (0.012/thickness) are approximations — the live pixel-constant outline, toon
   banding, AO and soft shadows cannot round-trip to static glTF.

## Env (READ before running) — unchanged from prior session
- A single-process uvicorn serves the app on **http://localhost:8000** (rebuilt
  from this branch, bundle staged into `backend/static`). Restart after any
  frontend edit with `ATOMCANVAS_REBUILD=1 scripts/serve.sh`; stop `scripts/stop.sh`.
- Tests/build HANG unless ALL proxy vars unset:
  `env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY NO_PROXY=localhost,127.0.0.1,::1 …`
- vitest via `node_modules/.bin/vitest run <path>` (not npx; don't pipe to tail).
- Playwright recipe: a `.mjs` INSIDE `frontend/` (ESM), `chromium.launch({args:['--no-proxy-server','--proxy-bypass-list=*','--use-gl=swiftshader']})`;
  upload via `[data-testid="file-input"]` with `../fixtures/water.xyz`; panels via
  `[aria-label="toggle scene panel"]` / `toggle bonds panel` / `toggle selection panel` / `toggle style panel`;
  select an atom by clicking the canvas (no selection-expression combobox in the panels).
- IDE/LSP shows phantom `@mui/react-colorful … is not a module` / `unmountOnExit` /
  JSX-intrinsic / "no default export" errors (iCloud eviction) — trust the `tsc -b`
  exit code, NOT the live diagnostics. Watch for case-only filename collisions on
  macOS (e.g. `AtomLabels.tsx` vs `atomLabels.ts`) — tsc catches these.

## Artifacts
- repo / cwd: `/Users/zhangyichen/Desktop/Scripts/atomcanvas`, branch
  `fix/viewer-export-7issues` — GitHub https://github.com/zyc2806/atomcanvas (PRIVATE).
- Reference (READ ONLY): `/Users/zhangyichen/Desktop/Scripts/ase-view/ase-view-web`
- Backend python: `/Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python`.
