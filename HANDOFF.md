# HANDOFF — AtomCanvas  (updated 2026-06-14)

## Status: viewer-UI restoration + UX overhaul COMPLETE

Both phases are finished, reviewed, and merged to `main`. There is no outstanding task.
This file is a record of what shipped; start a fresh handoff if new work begins.

## Phase 1 — feature restoration (done)
Five viewer/UI features lost/broken in the ase-view-web split were restored (frontend-only):
- #1 Advanced Selection panel (rich `SelectionInput` + AST tree + 6 method tabs + inline
  Element/Label/Position/Slab), dedicated right-Drawer panel, hotkey `a`, CLI `convert --select`
  / `select --ast`.
- #2 cartoon render style, #3 colour swatch, #4 bond thickness, #5 resize selected atoms.
- A reconstructed `SpecialTab` had its loading/disabled UX restored to match the parent source.

## Phase 2 — UX overhaul (done)
Spec: `docs/superpowers/specs/2026-06-14-atomcanvas-ux-design.md`
Plan: `docs/superpowers/plans/2026-06-14-atomcanvas-ux-workflow.md`
Six changes addressing 6 confirmed pain points (discoverability / Advanced toggle hiding
everything / 10 scrolling tabs / repeated op buttons / weak feedback / select→recolor needing
a panel switch):
1. Global toast channel (`notification`/`notify` + `Toaster`); selection actions now toast.
2. Top-bar panel buttons get text labels.
3. Shared `OperationModeSelector` (Replace/Add/Filter/Exclude) — kills the 10×4 button repetition.
4. Selection tabs take an `operation` prop + a single Apply.
5. `SelectionPanel` redesign: chip-grid methods (all visible), no Advanced toggle, expression
   editor demoted to a collapsible advanced section.
6. Viewport floating `SelectionActionBar` (recolor/resize/hide/clear) — zero panel switching.
   Backed by per-atom styling truth lifted into the store (`perAtomColorOverrides` /
   `perAtomOpacityOverrides` + `applySelectionColor/Size/toggleSelectionHidden`), a hardened
   `setSelectionMode`, and history+tabs snapshots so per-atom styling survives undo/redo,
   method switches, and tab switches (no cross-tab leak).

Verified green: `eslint .`, `tsc -b`, `vite build`, vitest **31 files / 122 passed / 2 skipped**.

## Known minor follow-ups (optional, not blocking)
- Floating-bar colour swatch shows a fixed primary square, not the selection's current colour.
- Switching tabs mid-slab-Analyze (before picking a layer) can snapshot transient cluster colours.
- Store import style is mixed (named vs default `useStructureStore`) across components.

## Env gotchas (still apply)
- Tests/build HANG unless ALL proxy vars are unset: prefix with
  `env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY NO_PROXY=localhost,127.0.0.1,::1`.
- Run vitest via `node_modules/.bin/vitest run <path>` (not npx; don't pipe to tail).
- iCloud "Optimize Mac Storage" can evict files under `~/Desktop` → empty reads / git bus errors,
  and the IDE/LSP shows phantom `@mui ... is not a module` errors; trust the `tsc -b` exit code.
- Backend python: `/Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python`. Run app: `scripts/serve.sh`.

## Artifacts
- repo: `/Users/zhangyichen/Desktop/Scripts/atomcanvas` — GitHub: https://github.com/zyc2806/atomcanvas (PRIVATE)
- Port-source (READ ONLY): `/Users/zhangyichen/Desktop/Scripts/ase-view/ase-view-web/frontend/src`
