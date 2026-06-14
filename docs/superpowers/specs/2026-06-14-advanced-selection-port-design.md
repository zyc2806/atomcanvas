# Advanced Selection tabbed UI — port into AtomCanvas (design)

**Date:** 2026-06-14
**Status:** approved (design) → implementation plan next
**Issue:** #1 of the 5 viewer/UI features dropped in the ase-view → atomcanvas split
(see repo `HANDOFF.md`). #2–#5 are already done; this is the last and largest.

## Goal

Restore the full **Advanced Selection** experience in atomcanvas: a tabbed panel of
atom-pick methods (Element, Label, Position, Slab, Sphere, Bonded, Percentile, Extend,
Special/fixed, Connected) layered on a rich expression box (autocomplete + Invert + Apply
+ AST/logic-tree preview), with four operation modes (Replace/Add/Filter/Exclude). Port it
faithfully from the parent ase-view, adapted to atomcanvas's panel/store idiom, and make the
same selection power reachable from the headless CLI.

## Context (verified against both repos)

- **Port source (READ-ONLY):** `/Users/zhangyichen/Desktop/Scripts/ase-view/ase-view-web/frontend/src`
  - `components/editor/SelectionPanel.tsx` (~334 lines) — tabbed container; `combineExpressions`
    helper (L25–39); 4 op-modes (L89–115); Advanced toggle (L239–243); tab list (L258–260).
  - `components/editor/SelectionInput.tsx` (~296 lines) — expression box + autocomplete + Invert
    (L182–201) + Apply + AST preview toggle (L270–278).
  - `components/editor/SelectionExpressionTree.tsx` — collapsible AST logic tree.
  - `components/editor/tabs/{SphereTab,BondedTab,PercentileTab,ExtendTab,SpecialTab,ConnectedTab,StyleTab}.tsx`
    (Element/Label/Position/Slab are inline in SelectionPanel).
  - `components/editor/tabs/__tests__/`, `SelectionPanel.test.tsx`, `SelectionInput.test.tsx`,
    `SelectionExpressionTree.spec.tsx` — tests to port alongside.
- **Already present in atomcanvas (NO backend / service / type work needed):**
  - `frontend/src/services/selectionService.ts` — full client: `parseExpression` (with pinned-query
    rewrite + 256-entry LRU cache), `getAST`, `parseLabels`, `filterPosition`, `analyzeClusters`,
    `detectRing`, `clearCache`.
  - `frontend/src/types/selection.ts` — `ASTNode`, `SelectorNode`, `SelectionASTResponse`, etc.
  - `backend/app/routers/selection.py` — `/selection/{parse_labels,parse_expression,parse_ast,
    filter_position,analyze_clusters,detect_ring}`.
  - `backend/app/services/selection_parser.py` — pyparsing grammar with `elem:`, `label:`, `pos:`,
    `frac:`, `slab:`, `sphere:`, `bonded:`, `connected:`, `pct:`, `extend:`, `fixed`, `pin(...)`,
    `ids:`, `*`, and `AND`/`OR`/`NOT`; exports `parse_selection_expression` and `get_selection_ast`
    (both pure, web-and-CLI shared).
- **atomcanvas panel system:** right `Drawer` (`components/shell/PanelHost.tsx`,
  `ActivePanel = 'style' | 'bonds' | 'scene' | null`); `App.tsx` owns `activePanel` + `PANEL_KEYS`
  (`s`/`b`/`c`); `TopBar.tsx` has the toggle buttons. The current simple `SelectionInput` lives
  **inside `BondEditPanel.tsx`** (L66).
- **CLI:** `backend/app/cli.py` — `info` / `bonds` / `select` / `convert`, all wrapping the pure
  service layer; `select FILE EXPR` already evaluates the full DSL via `parse_selection_expression`.

## Decisions (locked with the user)

1. **Port all 10 selection-method tabs; DROP the Style tab.** atomcanvas's Style panel already
   styles the selection (color/opacity/size), so a selection-side Style tab would duplicate it.
2. **Enhance the CLI:** add `convert --select 'EXPR'` (export the selected subset) and a
   `select --ast` flag (print the expression AST). Parity of plain selection is already automatic.
3. **Dedicated "Selection" panel.** New `ActivePanel = 'selection'` with its own TopBar button +
   hotkey; **move the simple expression box out of `BondEditPanel` into it** (no duplicate box).

## Approach

**Faithful port + store/ID adaptation** (chosen over a from-scratch rewrite or a partial reimpl,
both of which would forfeit parity the user explicitly wants). Copy the parent components, then:
swap `activeStructureId` → `activeTabId` (atomcanvas's race-guard field), retarget imports to
atomcanvas's `useStructureStore` / `selectionService` / MUI, and omit the Style tab.

## Architecture

### Frontend file layout — new `frontend/src/components/panels/selection/`

```
SelectionPanel.tsx            # container: op-mode ToggleButtonGroup (Replace/Add/Filter/Exclude)
                              #   + tab nav + <SelectionInput/> + the active tab body
SelectionInput.tsx            # rich: expression text box, element/label autocomplete, Invert,
                              #   Apply, AST-preview toggle (renders <SelectionExpressionTree/>)
SelectionExpressionTree.tsx   # collapsible, colour-coded AST logic tree
tabs/
  ElementTab.tsx              # pick by element symbol(s)            -> elem:
  LabelTab.tsx                # pick by atom label(s) / ranges       -> label: (via parseLabels)
  PositionTab.tsx             # cartesian / fractional criteria      -> pos: / frac: (filterPosition)
  SlabTab.tsx                 # K-means layer clustering             -> slab: (analyzeClusters)
  SphereTab.tsx               # centre coords or @index + radius     -> sphere:
  BondedTab.tsx               # atoms bonded to the first selected   -> bonded:@i
  PercentileTab.tsx           # coordinate percentile on an axis     -> pct:
  ExtendTab.tsx               # expand by N bond hops                -> extend:@i;N
  SpecialTab.tsx              # fixed atoms (constraints)            -> fixed
  ConnectedTab.tsx            # connected component of selection     -> connected:@i
```
The existing `frontend/src/components/panels/SelectionInput.tsx` is **replaced** by
`selection/SelectionInput.tsx` and deleted.

### Integration points (four touch points — three edits + one removal)

1. `components/shell/PanelHost.tsx` — add `'selection'` to `ActivePanel`; render `<SelectionPanel/>`.
2. `App.tsx` — add `a: 'selection'` to `PANEL_KEYS` (mnemonic: **a**dvanced selection).
3. `components/shell/TopBar.tsx` — add a Selection toggle button (active-highlight like the others).
4. `components/panels/BondEditPanel.tsx` — remove the `import`/`<SelectionInput/>` (L20, L66).

### Data flow

```
Tab control ──produces──> DSL fragment string
        │
        ├─ combineExpressions(currentExpr, fragment, opMode):
        │     Replace → fragment
        │     Add     → (currentExpr) or (fragment)
        │     Filter  → (currentExpr) and (fragment)
        │     Exclude → (currentExpr) and not (fragment)
        ▼
selectionService.parseExpression(structure, combinedExpr, bondOverrides, bondScale)
        │   (HTTP → backend parse_expression; getAST + pinned-cache rewrite happen inside)
        ▼
store.setSelectionExpression(combinedExpr); store.updateSelection(indices, 'replace')
        ▼  (selectedAtoms / selectedBonds update → viewport highlights)
```
- Slab tab additionally calls `analyzeClusters` → `setClusterIndices` / `setSlabTarget`, reusing
  the existing slab store fields and `selectionMode = 'slab'`.
- Race-guard: capture `activeTabId` before an await; ignore the result if `activeTabId` changed
  (the parent's `activeStructureId` guard, renamed).
- The rich `SelectionInput` Apply/Invert path writes `selectionExpression` and calls
  `updateSelection`; the AST toggle calls `getAST` and feeds `SelectionExpressionTree`.

### CLI additions — `backend/app/cli.py` (pure-service, no web coupling)

- `convert IN OUT [--format] [--select 'EXPR'] [--bond-scale 1.2]`:
  when `--select` is given, `idx = parse_selection_expression(atoms, expr, bond_scale=...)`,
  then `atoms = atoms[sorted(int(i) for i in idx)]` before export. Empty selection → clean
  `ClickException("selection matched 0 atoms")`. Without `--select`, behaviour is unchanged.
- `select FILE EXPR [--bond-scale] [--ast]`:
  with `--ast`, print `json.dumps(get_selection_ast(EXPR), indent=2)` instead of evaluating;
  add `from .services.selection_parser import get_selection_ast`.
- Update the module docstring usage examples.

## Error handling

- Frontend: every service call guards `structureData != null`; a backend `400` surfaces as an
  inline panel error string (never a raw traceback), matching existing panel conventions.
- CLI: wrap selection/subset failures in `ClickException` (the file's existing pattern); invalid
  expressions and empty subsets produce a clean one-line error, non-zero exit.

## Testing (TDD — RED before GREEN for every unit)

- **Frontend (Vitest + RTL), one focused test per unit:**
  - Each tab: given a structure + inputs, it produces the expected DSL fragment / calls the
    expected service and the store updates (selectedAtoms / clusterIndices) accordingly.
  - `SelectionPanel`: the four op-modes combine fragments correctly (`combineExpressions`).
  - `SelectionInput`: Invert wraps/unwraps `NOT`, Apply parses + updates, AST toggle renders the
    tree.
  - `SelectionExpressionTree`: renders nested logic/selector nodes.
  - Port the parent's corresponding tests where they transfer cleanly.
- **Backend CLI (pytest, `backend/tests/test_cli.py`):**
  - `convert --select 'elem:C'` writes a file whose atom count equals the selection size.
  - `convert --select` with a 0-match expression exits non-zero with a clean message.
  - `select --ast 'elem:C AND pos:z>0'` prints parseable AST JSON.
- **Regression:** the existing 84 frontend tests and all CLI/backend tests stay green; `npm run
  lint` and `tsc -b && vite build` clean. ("兼容所有内容" = no existing behaviour regresses.)

## Scope / non-goals

- **In:** all 10 selection-method tabs, the rich expression box (Invert/Apply/AST), the op-modes,
  the dedicated panel + integration, the two CLI enhancements, tests.
- **Out:** the Style tab (StylePanel owns selection styling); per-tab/persisted "named selections"
  or selection presets (YAGNI — not in the parent); per-tab-scoped selection history. Selection
  stays global and resets on structure-tab switch, matching current atomcanvas behaviour.

## Risks & mitigations

- **Selection vs Slab mode interaction** — `setSelectionMode` zeroes slab fields on mode change;
  the Slab tab must set `selectionMode='slab'` before writing `clusterIndices`/`slabTarget`
  (parent already sequences this; preserve the order).
- **Bond-dependent selectors** (Bonded/Extend/Connected) need current bond topology; pass the same
  `bondOverrides` + `bondScale` the geometry path uses, so UI and CLI agree.
- **`SelectionInput` removal from `BondEditPanel`** — verify no other consumer imports it and that
  BondEditPanel still functions without it (selection now lives in its own panel).
- **Hotkey collision** — `a` is currently unused by `PANEL_KEYS` (s/b/c); confirm no global `a`
  binding before claiming it.
- **Subset export edge cases** (CLI) — preserve cell/pbc on `atoms[idx]` (ASE does); guard empty
  selection.

## File manifest (for the plan)

- **New:** `components/panels/selection/SelectionPanel.tsx`, `SelectionInput.tsx`,
  `SelectionExpressionTree.tsx`, `tabs/{Element,Label,Position,Slab,Sphere,Bonded,Percentile,
  Extend,Special,Connected}Tab.tsx`, plus their tests.
- **Edited:** `components/shell/PanelHost.tsx`, `App.tsx`, `components/shell/TopBar.tsx`,
  `components/panels/BondEditPanel.tsx`, `backend/app/cli.py`, `backend/tests/test_cli.py`.
- **Deleted:** `components/panels/SelectionInput.tsx` (superseded).
- **Unchanged (reused as-is):** `services/selectionService.ts`, `types/selection.ts`,
  `backend/app/routers/selection.py`, `backend/app/services/selection_parser.py`.
