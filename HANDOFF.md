# HANDOFF — AtomCanvas: restore 5 viewer/UI features lost/broken in the ase-view-web split  (updated 2026-06-14)

## Goal
AtomCanvas was extracted from the larger **ase-view-web** project; four viewer/UI
features were dropped or mis-wired in the split (#1-#4), plus one small new request
(#5). Fix them all. Every one is **frontend-only** — the backend and the 3D renderer
already support each; what's missing is UI controls or correct store wiring. Findings
below are **verified against both repos' source** (file:line), not guesses.

> Read-only reference repo (NEVER edit it): the parent frontend lives at
> `/Users/zhangyichen/Desktop/Scripts/ase-view/ase-view-web/frontend/src`. Port
> FROM it INTO atomcanvas. The `ase-view` repo is a separate WIP — read only.

## Previously completed (this is done — don't redo)
- Prior handoff's 4 steps (glb bond-order/ring fidelity, one-command distribution,
  headless CLI, pip packaging) are **implemented, reviewed, committed, and pushed**:
  commit `d6853fc` on `main` → https://github.com/zyc2806/atomcanvas (PRIVATE).
- A "frontend shows nothing after upload" report was investigated: the prod build
  + single-process server render correctly in headless Chromium (both proxy-bypassed
  and through the system proxy) — `/api` 200, no JS errors, atoms drawn. So that was
  **browser-side** (stale cache / WebGL), not a code bug; presumed resolved by a hard
  reload (the user now sees panels, so the app is working for them).

## Completed THIS session (2026-06-14) — issues #2/#3/#4/#5 done; only #1 remains
All four were implemented test-first (RED→GREEN), then put through a multi-agent
adversarial review whose 7 confirmed findings were all fixed (also TDD). Final state:
**84 frontend unit tests pass (2 pre-existing skips), `npm run lint` clean,
`tsc -b && vite build` clean.** NOT yet committed — working tree only.
- **#3 colour swatch** — `StylePanel` subscribes `atomStyles`; `elementColor` =
  `elements[sym]?.color ?? atomStyles?.[sym]?.color ?? DEFAULT`. `ColorSwatch` gained an
  inline `style={{backgroundColor}}` + optional `testId`.
- **#4 bond thickness** — the StylePanel "Radius" slider now reads/writes
  `visParams.bondRadius` (the field the viewport reads) and keeps `bondsStyle.radius` in
  sync; preset default unified 0.12→0.08; `applyStylePreset` hydrates `visParams.bondRadius`
  on load; `buildStylePreset` now serialises `visParams.bondRadius` (source of truth, not the
  mirror — matches `batchExport`).
- **#5 resize selected atoms** — NEW `radiusOverrides` per-atom store field + setter, merged
  in `ViewerCanvas` over the per-element radius, driven by a "Size" slider in StylePanel's
  selected block. **Threaded with full parity to `colorOverrides`** across UISlice (init/
  setter/resetUIState/resetSlabState/setSelectionMode), DataSlice (structure-change clear),
  HistorySlice (undo/redo), TabsSlice (per-tab snapshot/restore — fixes a cross-tab
  index-leak bug), and sceneDocument (scene save/load, with `?? null` back-compat). The
  selected-atoms colour swatch also now reflects live state (override→CPK→gray) instead of a
  static gray placeholder.
- **#2 cartoon render style** — `ScenePanel` gained a "Rendering" ToggleButtonGroup
  (Standard/Cartoon/Soft → `setVisParams({renderStyle})`) + 4 cartoon-param sliders (shown
  when `renderStyle==='cartoon'`). Renderer already supported it.
- **Architectural note for the next session:** any new index-keyed per-atom override must be
  mirrored across ALL of: UISlice, DataSlice (clear on atom-count change — index maps else
  apply to the wrong atoms), HistorySlice, TabsSlice (`StructureTab` type + snapshot/addTab/
  switchTab), and sceneDocument. Gotcha: StylePanel's mount effect recomputes
  `colorOverrides` from `elements`, so a store-only colour override gets wiped on mount unless
  it lives in `perAtomColorRef`.

## The four issues (each verified; fix is frontend-only)

### #1 — Advanced selection UI is missing (biggest port)  ⚠️
- **Symptom:** ase-view-web had an "Advanced Selection" *window* with a tabbed UI of
  many atom-pick methods; atomcanvas only has a single expression box.
- **atomcanvas today:** `frontend/src/components/panels/SelectionInput.tsx` (~197 lines)
  — free-form DSL box (`elem:`, `pos:`, `slab:`, AND/OR/NOT) + Invert + Apply only.
  No tabs, no per-method GUI, no AST/logic-tree preview.
- **Parent (port FROM):**
  - `ase-view-web/frontend/src/components/editor/SelectionPanel.tsx` (~334 lines) —
    "Advanced Selection" toggle (L239-243) → 11 tabs (L258-260): Element, Label,
    Position, Slab(interactive layer clustering), Sphere, Bonded, Percentile, Extend,
    Special(fixed atoms), Connected, Style. 4 op-modes per tab (Replace/Add/Filter/
    Exclude, L89-115) combined via `combineExpressions` (L25-39).
  - `ase-view-web/.../editor/SelectionInput.tsx` (~296 lines) — autocomplete + Invert +
    Apply + **logic-tree (AST) preview** toggle (L270-278) + `SelectionExpressionTree`.
  - Tab components under `ase-view-web/.../editor/`: `tabs/SphereTab.tsx`,
    `BondedTab.tsx`, `PercentileTab.tsx`, `ExtendTab.tsx`, `SpecialTab.tsx`,
    `ConnectedTab.tsx`, `StyleTab.tsx`, plus `SelectionExpressionTree.tsx`.
- **Backend already supports all of it** (no backend work): atomcanvas
  `backend/app/services/selection_parser.py` has select_by_element/label/position/
  slab/sphere/bonded/percentile/extend/connected/fixed/id + `parse_selection_expression`,
  exposed via `backend/app/routers/selection.py` (parse_expression, parse_labels,
  filter_position, analyze_clusters, detect_ring).
- **Effort:** Largest item (~10 components, ~1,500-1,900 lines). Suggest porting the
  tabbed `SelectionPanel` + the tabs incrementally (Element/Position/Slab/Sphere first —
  the most-used), adapting MUI + the atomcanvas Drawer/PanelHost pattern. Check that
  store fields the tabs need (slab cluster indices, color/opacity overrides) exist;
  `colorOverrides`/`setColorOverrides` already do (StylePanel uses them).

### #2 — Cartoon render style gone (UI control only; renderer already supports it)  ✅ DONE
- **Symptom:** the user's favourite "cartoon" style can't be selected.
- **Root cause:** the RENDERER already supports it — `renderStyle` is typed
  `'soft' | 'cartoon' | 'standard'` (`frontend/src/types/store.ts:5`), defaults to
  `'standard'` (`store/slices/createUISlice.ts:133`), `cartoonParams` defined
  (createUISlice.ts:134-139), and `Atoms.tsx`/`Bonds.tsx`/`AromaticRings.tsx`/
  `Scene/Lighting.tsx` all branch on `renderStyle === 'cartoon'` (ToonHighlightMaterial).
  **There is simply NO UI control** that calls `setVisParams({ renderStyle })` — checked
  ScenePanel/StylePanel/BondEditPanel/TopBar.
- **Parent (port FROM):** `ase-view-web/.../components/ViewOptionsPanel.tsx` —
  ToggleButtonGroup Standard/Cartoon/Soft (L396-400), handler `handleRenderStyleChange`
  (L142-146), and 4 conditional cartoon sliders (outlineThickness/highlightThreshold/
  shadowThreshold/shadowBrightness, L418-476).
- **Fix (LOW effort):** add a ToggleButtonGroup (→ `setVisParams({ renderStyle })`) plus
  the cartoon-param sliders into atomcanvas `components/panels/ScenePanel.tsx` (rendering
  controls belong there). All store wiring + rendering already present.

### #3 — Per-element colour swatch shows gray after import (bug, ~1-line fix)  ✅ DONE
- **Symptom:** after loading a structure the StylePanel colour box is gray, not the
  element's actual (CPK) colour.
- **Root cause:** `frontend/src/components/panels/StylePanel.tsx:143-144`
  `elementColor = (sym) => elements[sym]?.color ?? DEFAULT_ATOM_COLOR` reads only the
  user OVERRIDE (`elements`, empty right after import) → falls back to gray
  (`DEFAULT_ATOM_COLOR` `#cccccc`, L27). It never reads the effective CPK colour.
- **Effective colour source:** `atomStyles` in the store (loaded from `/public/atom.json`
  by `hooks/useLoadAtomStyles.ts:22-38`; the 3D path uses it via
  `hooks/useAtomColors.ts:12-20`).
- **Fix (LOW):** subscribe `atomStyles` at the StylePanel top (it currently does NOT —
  it subscribes structureData/elements/bondsStyle/… but not atomStyles), then:
  `elementColor = (sym) => elements[sym]?.color ?? atomStyles?.[sym]?.color ?? DEFAULT_ATOM_COLOR`.
  Do NOT call `useStructureStore` inside `elementColor` (React hooks rule) — add the
  subscription with the other `const … = useStructureStore(s => s.atomStyles)` lines (~L74-92).

### #4 — Bond-thickness slider has no visible effect (mis-wired; same root as the glb [1] fix)  ✅ DONE
- **Symptom:** changing bond thickness doesn't change the on-screen bonds.
- **Root cause:** the StylePanel "Radius" slider IS rendered (StylePanel.tsx:243-254) but
  writes `bondsStyle.radius` (PresetSlice, default 0.12 — createPresetSlice.ts:7), while
  the viewport `Bonds.tsx` reads `visParams.bondRadius` (default 0.08 — createUISlice.ts:123,
  used at Bonds.tsx:62/218/321/546). **No control writes `visParams.bondRadius`**, so the
  slider is inert. (This is the same divergence already documented for the glb export, which
  the export now correctly reads from `visParams.bondRadius` — see batchExport.ts:29-34.)
- **Parent (correct wiring):** `ase-view-web/.../ViewOptionsPanel.tsx:347-360` — the bond
  slider writes `visParams.bondRadius` directly (`handleParamChange('bondRadius')` → L129
  `setVisParams`). Parent has ONE field, so it works.
- **Fix (LOW):** make the StylePanel slider write `visParams.bondRadius`
  (`setVisParams({ bondRadius: v })`) — either in addition to or instead of `bondsStyle.radius`.
  Then viewport + glb export both honour it AND finally agree (closes the [1] gap end-to-end).
  Note the 0.08↔0.12 default mismatch: unify on one value (recommend 0.08, the current viewer
  value) and keep `style.json`/`schemaVersion` in mind if you drop/repurpose `bondsStyle.radius`.

### #5 — Resize the SELECTED atoms (NEW feature; renderer already supports it)  ✅ DONE
- **Symptom:** can't change the size of just the currently-selected atoms.
- **Status:** NOT a regression — ase-view-web didn't have this either (its
  `editor/tabs/StyleTab.tsx` only does colour+opacity for the selection, and its
  `r3f/Atoms.tsx` has no per-atom radius at all). But it's **cheap in atomcanvas**
  because the refactor already plumbed per-atom radius:
  - `frontend/src/components/r3f/Atoms.tsx` ACCEPTS `radiusOverrides?: {[i]:number}`
    (L20/25) and applies it: `radius = (radiiData[Z]||0.5) * (radiusOverrides?.[i] ?? 1)`
    (L70, L116). **Renderer ready.**
  - `frontend/src/components/r3f/ViewerCanvas.tsx` (L506-527) currently fills
    `radiusOverrides` ONLY from per-element `radiusScale` (via
    `services/elementStyleApply.ts:21`) and passes it straight to Atoms — it does NOT
    merge a per-atom store override (compare colour/opacity, which DO merge
    `storeColorOverrides`/`storeOpacityOverrides`, L525-526).
  - The store has `colorOverrides` + `opacityOverrides` per-atom maps (types/store.ts
    L149-150) but **no `radiusOverrides`** map/setter.
- **Fix (LOW; mirror the existing colour/opacity selected-atom pattern):**
  1. Store: add `radiusOverrides: {[index]:number} | null` + `setRadiusOverrides` to
     UISlice (`types/store.ts` ~L149-150 & ~L230-231; `store/slices/createUISlice.ts`
     init ~L145 + setter ~L231 + the reset paths). Mirror `colorOverrides` exactly.
  2. ViewerCanvas: subscribe `storeRadiusOverrides` and merge it ON TOP of the
     per-element one (like `mergedColorOverrides`): rename the existing local to
     `elRadius`, then `radiusOverrides={{ ...elRadius, ...(storeRadiusOverrides ?? {}) }}`.
  3. StylePanel: in the `selectedAtoms.length > 0` block (next to the selected-atom
     colour control ~L220-236) add a "Size" slider (e.g. 0.3–2.0, step 0.05) that writes
     `setRadiusOverrides({ ...(radiusOverrides ?? {}), [each selected idx]: v })`, and
     include it in the selection-style Reset.

## What Worked / What Didn't
- ✅ Backend selection + cartoon renderer + CPK `atomStyles` all already exist in atomcanvas —
  these are UI/wiring restorations, not new features. Don't rebuild the backend.
- ✅ Use the parent `ase-view-web/frontend/src` as the port source (verified to contain the
  working versions). Read-only.
- ❌ Don't "fix" the glb exporter to read `bondsStyle.radius` — the viewport uses
  `visParams.bondRadius`; #4 fixes the slider to match, not the exporter.
- ❌ Don't put the color-source lookup inside a render-time helper as a hook call.

## Next Steps — ONLY #1 remains
1.–4. **#3 / #4 / #5 / #2** — ✅ DONE this session (see "Completed THIS session" above).
5. **#1 advanced selection** (the big one — its own session) — port `SelectionPanel` + tabs
   from the parent incrementally (Element/Position/Slab/Sphere first), wiring to the existing
   selection service/store (`backend/app/routers/selection.py` already supports every method).
   Adapt MUI + the atomcanvas Drawer/PanelHost pattern. The per-atom override plumbing the
   StyleTab needs (`colorOverrides`/`opacityOverrides`/`radiusOverrides`) now all exist and
   persist correctly.

## Next session should invoke
- `superpowers:brainstorming` before #1 to scope which tabs to port first.
- Then `superpowers:test-driven-development` + frontend work (React + MUI + Zustand).
  No backend, no hpc.

## Artifacts
- repo / cwd: `/Users/zhangyichen/Desktop/Scripts/atomcanvas` (branch `main`, pushed at `d6853fc`)
- GitHub: https://github.com/zyc2806/atomcanvas (PRIVATE)
- Port-source (READ ONLY): `/Users/zhangyichen/Desktop/Scripts/ase-view/ase-view-web/frontend/src`
  (key files: `components/editor/SelectionPanel.tsx` + `editor/tabs/*` + `SelectionInput.tsx` +
  `SelectionExpressionTree.tsx`; `components/ViewOptionsPanel.tsx` for render-style + bond-radius UI)
- atomcanvas targets: `components/panels/StylePanel.tsx` (#3,#4), `components/panels/ScenePanel.tsx`
  (#2), new `components/panels/SelectionPanel.tsx` + tabs (#1); store slices `createUISlice.ts`
  (visParams/renderStyle/bondRadius/cartoonParams), `createPresetSlice.ts` (bondsStyle.radius)
- Constraints: backend python = `/Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python`;
  frontend tests/build need proxy bypass (`NO_PROXY=localhost,127.0.0.1,::1`); NEVER edit the
  `ase-view` repo; one-process app: `scripts/serve.sh` (http://localhost:8000).
