# Advanced Selection tabbed-UI port — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the parent ase-view "Advanced Selection" panel in atomcanvas — a tabbed UI of 10 atom-pick methods over a rich expression box (Invert/Apply/AST-tree) with 4 op-modes (Replace/Add/Filter/Exclude) — plus subset/AST CLI flags.

**Architecture:** Faithful component port. atomcanvas already has the backend DSL, the `selectionService` (incl. `getAST` + pinned-query cache), and `types/selection.ts`; only the React components are missing. Port them into a new `components/panels/selection/` dir, swap the parent's `activeStructureId` race-guard for atomcanvas's `activeTabId`, drop the Style tab (atomcanvas's StylePanel owns selection styling), and register a dedicated "Selection" Drawer panel.

**Tech Stack:** React 19 + TypeScript + Vite + Zustand (`useStructureStore`) + MUI v7 + Vitest/RTL (frontend); Python + Click + pytest (CLI).

---

## Conventions for the executor

- **Port source (READ-ONLY, never edit):** `/Users/zhangyichen/Desktop/Scripts/ase-view/ase-view-web/frontend/src/components/editor/`. Copy each file, then apply the listed transforms.
- **Standard tab/component transforms** (apply to every ported file unless noted):
  1. Keep the `import useStructureStore from '<rel>/store/useStructureStore'` default import (atomcanvas exports both default and named).
  2. Replace the race-guard: every `activeStructureId` → `activeTabId`, and the `getLatestActiveStructureId()` helper reads `snapshot.activeTabId`. Rename the helper to `getLatestActiveTabId()`.
  3. Fix relative import depth for the new location (`panels/selection/...` and `panels/selection/tabs/...`).
  4. No other behavior changes.
- **Run tests from** `frontend/` with `NO_PROXY=localhost,127.0.0.1,::1 npx vitest run <path>`; backend from `backend/` with the env python `/Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python -m pytest`.
- **Commit idiom (avoids a known git-write hang in sandboxed shells):** run each commit as a single clean command with stdin redirected, e.g.
  `git add <paths> && git commit --no-verify < /dev/null -m "msg"` . If `.git/index.lock` exists from a prior interrupted run, `rm -f .git/index.lock` first. Do NOT run concurrent git commands.
- **Branch:** work on `restore-viewer-ui-features` (already checked out; the design spec `c2e6077` is the first commit).
- **Green gate:** the existing 84 frontend tests + all backend tests must stay green after every task.

---

## File structure

**New (all under `frontend/src/components/panels/selection/`):**
- `SelectionExpressionTree.tsx` — AST logic-tree renderer (pure, no store).
- `SelectionInput.tsx` — rich expression box: autocomplete + Invert + Apply + AST toggle.
- `SelectionPanel.tsx` — tabbed container: op-modes + `combineExpressions` + `processSelection` + inline Element/Label/Position/Slab tabs.
- `tabs/SphereTab.tsx`, `tabs/BondedTab.tsx`, `tabs/PercentileTab.tsx`, `tabs/ExtendTab.tsx`, `tabs/SpecialTab.tsx`, `tabs/ConnectedTab.tsx`.
- Co-located `*.test.tsx` for each.

**Edited:**
- `frontend/src/components/shell/PanelHost.tsx` — add `'selection'` to `ActivePanel`, render `<SelectionPanel/>`.
- `frontend/src/App.tsx` — add `a: 'selection'` to `PANEL_KEYS`.
- `frontend/src/components/shell/TopBar.tsx` — add a Selection toggle button.
- `frontend/src/components/panels/BondEditPanel.tsx` — remove the embedded `<SelectionInput/>`.
- `backend/app/cli.py` + `backend/tests/test_cli.py` — `convert --select`, `select --ast`.

**Deleted:**
- `frontend/src/components/panels/SelectionInput.tsx` (superseded by `selection/SelectionInput.tsx`).

**Reused unchanged:** `services/selectionService.ts`, `types/selection.ts`, `backend/app/routers/selection.py`, `backend/app/services/selection_parser.py`.

---

## Task 1: Port SelectionExpressionTree

**Files:**
- Create: `frontend/src/components/panels/selection/SelectionExpressionTree.tsx`
- Source: `…/editor/SelectionExpressionTree.tsx` (356 lines)
- Test: `frontend/src/components/panels/selection/SelectionExpressionTree.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// SelectionExpressionTree.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SelectionExpressionTree from './SelectionExpressionTree';
import type { ASTNode } from '../../../types/selection';

describe('SelectionExpressionTree', () => {
  it('renders a logic node with its operands', () => {
    const ast: ASTNode = {
      type: 'logic',
      op: 'AND',
      operands: [
        { type: 'selector', kind: 'element', value: 'C', span: [0, 6] },
        { type: 'selector', kind: 'position', value: 'z>10', span: [11, 19] },
      ],
      span: [0, 19],
    } as unknown as ASTNode;
    render(<SelectionExpressionTree ast={ast} onNodeDoubleClick={vi.fn()} />);
    expect(screen.getByText(/AND/i)).toBeInTheDocument();
  });

  it('renders nothing when ast is null', () => {
    const { container } = render(
      <SelectionExpressionTree ast={null} onNodeDoubleClick={vi.fn()} />,
    );
    expect(container.textContent ?? '').not.toContain('AND');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NO_PROXY=localhost,127.0.0.1,::1 npx vitest run src/components/panels/selection/SelectionExpressionTree.test.tsx`
Expected: FAIL — `Cannot find module './SelectionExpressionTree'`.

- [ ] **Step 3: Port the component**

Copy `…/editor/SelectionExpressionTree.tsx` to the Create path verbatim. Apply only: fix the `types/selection` import to `../../../types/selection`. This component has no store/service deps. Confirm the props are `{ ast: ASTNode | null; onNodeDoubleClick: (node: ASTNode) => void }`; if the actual prop names differ, match the real file (it is the source of truth) and adjust the test's prop names to match.

- [ ] **Step 4: Run test to verify it passes**

Run the same vitest command. Expected: PASS (2 tests). If the AST node shape in the test doesn't match the real `ASTNode` type, fix the test's literal to satisfy the type (read `types/selection.ts`).

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangyichen/Desktop/Scripts/atomcanvas && git add frontend/src/components/panels/selection/SelectionExpressionTree.tsx frontend/src/components/panels/selection/SelectionExpressionTree.test.tsx && git commit --no-verify < /dev/null -m "feat(selection): port SelectionExpressionTree (AST logic-tree)"
```

---

## Task 2: Port the rich SelectionInput

**Files:**
- Create: `frontend/src/components/panels/selection/SelectionInput.tsx`
- Source: `…/editor/SelectionInput.tsx` (296 lines)
- Test: `frontend/src/components/panels/selection/SelectionInput.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// SelectionInput.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStructureStore } from '../../../store/useStructureStore';

vi.mock('../../../services/selectionService', () => ({
  selectionService: {
    parseExpression: vi.fn().mockResolvedValue({ indices: [1, 2] }),
    getAST: vi.fn().mockResolvedValue({ ast: null }),
  },
}));

import SelectionInput from './SelectionInput';
import { selectionService } from '../../../services/selectionService';

const doc = () =>
  ({ structure: { symbols: ['O', 'H', 'H'], positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] } }) as never;

describe('SelectionInput (rich)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().addTab(doc(), 'w');
    useStructureStore.getState().setSelectionExpression('');
  });

  it('Apply parses the expression and updates the selection', async () => {
    useStructureStore.getState().setSelectionExpression('elem:O');
    render(<SelectionInput />);
    fireEvent.click(screen.getByLabelText('Apply Selection'));
    await waitFor(() => {
      expect(selectionService.parseExpression).toHaveBeenCalled();
      expect(useStructureStore.getState().selectedAtoms).toEqual([1, 2]);
    });
  });

  it('Invert wraps a bare expression in NOT(...)', async () => {
    useStructureStore.getState().setSelectionExpression('elem:O');
    render(<SelectionInput />);
    fireEvent.click(screen.getByLabelText('Invert Selection'));
    await waitFor(() => {
      expect(useStructureStore.getState().selectionExpression).toBe('NOT (elem:O)');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NO_PROXY=localhost,127.0.0.1,::1 npx vitest run src/components/panels/selection/SelectionInput.test.tsx`
Expected: FAIL — module `./SelectionInput` not found.

- [ ] **Step 3: Port the component**

Copy `…/editor/SelectionInput.tsx` to the Create path. Apply the standard transforms:
- `import useStructureStore from '../../../store/useStructureStore'` (depth 3 from `panels/selection/`).
- `import { selectionService } from '../../../services/selectionService'`.
- `import SelectionExpressionTree from './SelectionExpressionTree'`.
- `import type { ASTNode, SelectorNode } from '../../../types/selection'`.
- Replace every `activeStructureId` → `activeTabId`; rename `getLatestActiveStructureId` → `getLatestActiveTabId` reading `snapshot.activeTabId`.
- Leave the Invert logic (`*`↔`NOT *`, wrap/unwrap `NOT (...)`), the Apply path (`parseExpression` → `updateSelection(result.indices, 'replace')`), and the AST debounce exactly as in the source.

- [ ] **Step 4: Run test to verify it passes**

Run the same vitest command. Expected: PASS (2 tests). (`Apply Selection` / `Invert Selection` are the `aria-label`s in the source.)

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangyichen/Desktop/Scripts/atomcanvas && git add frontend/src/components/panels/selection/SelectionInput.tsx frontend/src/components/panels/selection/SelectionInput.test.tsx && git commit --no-verify < /dev/null -m "feat(selection): port rich SelectionInput (Invert/Apply/AST)"
```

---

## Tab port recipe (applies to Tasks 3a–3f)

Each tab is a `React.FC<{ onSelect: (indices, op, expression, originTabId?) => void }>` that builds a DSL fragment, calls `selectionService.parseExpression`, and forwards `onSelect(data.indices, operation, expr, originTabId)`. Port recipe per tab:
- Copy `…/editor/tabs/<Name>.tsx` → `frontend/src/components/panels/selection/tabs/<Name>.tsx`.
- Imports: `useStructureStore from '../../../../store/useStructureStore'`, `{ selectionService } from '../../../../services/selectionService'`.
- Standard transform: `activeStructureId` → `activeTabId`; `getLatestActiveStructureId` → `getLatestActiveTabId` (reads `snapshot.activeTabId`).
- Test file co-located: `tabs/<Name>.test.tsx`, mocking the store-as-function and the service (pattern below). The store mock omits `activeTabId`, so `originTabId` resolves to `null`.

---

## Task 3a: Port ConnectedTab

**Files:** Create `…/selection/tabs/ConnectedTab.tsx`; Source `…/editor/tabs/ConnectedTab.tsx`; Test `…/selection/tabs/ConnectedTab.test.tsx`. Emits `connected:@0,@1`.

- [ ] **Step 1: Write the failing test**

```tsx
// ConnectedTab.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import ConnectedTab from './ConnectedTab';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';

vi.mock('../../../../store/useStructureStore');
vi.mock('../../../../services/selectionService', () => ({
  selectionService: { parseExpression: vi.fn() },
}));

describe('ConnectedTab', () => {
  const onSelect = vi.fn();
  const structure = { symbols: ['C', 'C'] };
  beforeEach(() => {
    vi.clearAllMocks();
    (useStructureStore as unknown as Mock).mockReturnValue({
      structureData: { structure },
      selectedAtoms: [0, 1],
      bondOverrides: { '0-1': 'single' },
      visParams: { bondThreshold: 1.2 },
    });
  });

  it('disables actions with no selection', () => {
    (useStructureStore as unknown as Mock).mockReturnValue({
      structureData: { structure }, selectedAtoms: [], bondOverrides: {}, visParams: {},
    });
    render(<ConnectedTab onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /Replace/i })).toBeDisabled();
  });

  it('emits connected:@0,@1 and forwards indices on Replace', async () => {
    (selectionService.parseExpression as Mock).mockResolvedValue({ indices: [0, 1, 2] });
    render(<ConnectedTab onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Replace/i }));
    await waitFor(() => {
      expect(selectionService.parseExpression).toHaveBeenCalledWith(
        structure, 'connected:@0,@1', { '0-1': 'single' }, 1.2,
      );
      expect(onSelect).toHaveBeenCalledWith([0, 1, 2], 'replace', 'connected:@0,@1', null);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `…/tabs/ConnectedTab.test.tsx`; Expected FAIL (module not found).
- [ ] **Step 3: Port** ConnectedTab.tsx per the recipe (4-dot import depth; `activeStructureId`→`activeTabId`).
- [ ] **Step 4: Run to verify it passes** — Expected PASS (2 tests).
- [ ] **Step 5: Commit** — `git add …/tabs/ConnectedTab.tsx …/tabs/ConnectedTab.test.tsx && git commit --no-verify < /dev/null -m "feat(selection): port ConnectedTab"`

---

## Task 3b: Port BondedTab

**Emits `bonded:@0`** (uses `selectedAtoms[0]`; passes bond args). Source `…/editor/tabs/BondedTab.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// BondedTab.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import BondedTab from './BondedTab';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';

vi.mock('../../../../store/useStructureStore');
vi.mock('../../../../services/selectionService', () => ({
  selectionService: { parseExpression: vi.fn() },
}));

describe('BondedTab', () => {
  const onSelect = vi.fn();
  const structure = { symbols: ['C', 'C', 'C'] };
  beforeEach(() => {
    vi.clearAllMocks();
    (useStructureStore as unknown as Mock).mockReturnValue({
      structureData: { structure },
      selectedAtoms: [0],
      bondOverrides: { '0-1': 'single' },
      visParams: { bondThreshold: 1.2 },
    });
  });

  it('disables actions with no selection', () => {
    (useStructureStore as unknown as Mock).mockReturnValue({
      structureData: { structure }, selectedAtoms: [], bondOverrides: {}, visParams: {},
    });
    render(<BondedTab onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /Replace/i })).toBeDisabled();
  });

  it('emits bonded:@0 and forwards indices on Replace', async () => {
    (selectionService.parseExpression as Mock).mockResolvedValue({ indices: [0, 1, 2] });
    render(<BondedTab onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Replace/i }));
    await waitFor(() => {
      expect(selectionService.parseExpression).toHaveBeenCalledWith(
        structure, 'bonded:@0', { '0-1': 'single' }, 1.2,
      );
      expect(onSelect).toHaveBeenCalledWith([0, 1, 2], 'replace', 'bonded:@0', null);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails** (module not found).
- [ ] **Step 3: Port** BondedTab.tsx per recipe.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit** — `… -m "feat(selection): port BondedTab"`

---

## Task 3c: Port ExtendTab

**Emits `extend:@0;1`** (uses `selectedAtoms[0]` + hops field default 1; passes bond args). Source `…/editor/tabs/ExtendTab.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// ExtendTab.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import ExtendTab from './ExtendTab';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';

vi.mock('../../../../store/useStructureStore');
vi.mock('../../../../services/selectionService', () => ({
  selectionService: { parseExpression: vi.fn() },
}));

describe('ExtendTab', () => {
  const onSelect = vi.fn();
  const structure = { symbols: ['C', 'C', 'C'] };
  beforeEach(() => {
    vi.clearAllMocks();
    (useStructureStore as unknown as Mock).mockReturnValue({
      structureData: { structure },
      selectedAtoms: [0],
      bondOverrides: { '0-1': 'single' },
      visParams: { bondThreshold: 1.2 },
    });
  });

  it('disables actions with no selection', () => {
    (useStructureStore as unknown as Mock).mockReturnValue({
      structureData: { structure }, selectedAtoms: [], bondOverrides: {}, visParams: {},
    });
    render(<ExtendTab onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /Replace/i })).toBeDisabled();
  });

  it('emits extend:@0;1 (default 1 hop) and forwards indices on Replace', async () => {
    (selectionService.parseExpression as Mock).mockResolvedValue({ indices: [0, 1] });
    render(<ExtendTab onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Replace/i }));
    await waitFor(() => {
      expect(selectionService.parseExpression).toHaveBeenCalledWith(
        structure, 'extend:@0;1', { '0-1': 'single' }, 1.2,
      );
      expect(onSelect).toHaveBeenCalledWith([0, 1], 'replace', 'extend:@0;1', null);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Port** ExtendTab.tsx per recipe.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit** — `… -m "feat(selection): port ExtendTab"`

---

## Task 3d: Port SphereTab

**Emits `sphere:@0,5`** in default (atom) mode; calls `parseExpression(structure, expr)` with **no** bond args. Source `…/editor/tabs/SphereTab.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// SphereTab.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import SphereTab from './SphereTab';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';

vi.mock('../../../../store/useStructureStore');
vi.mock('../../../../services/selectionService', () => ({
  selectionService: { parseExpression: vi.fn() },
}));

describe('SphereTab', () => {
  const onSelect = vi.fn();
  const structure = { symbols: ['C', 'C', 'C'] };
  beforeEach(() => {
    vi.clearAllMocks();
    (useStructureStore as unknown as Mock).mockReturnValue({ structureData: { structure } });
  });

  it('emits sphere:@0,5 (default atom mode, radius 5) on Replace', async () => {
    (selectionService.parseExpression as Mock).mockResolvedValue({ indices: [0, 1] });
    render(<SphereTab onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Replace/i }));
    await waitFor(() => {
      expect(selectionService.parseExpression).toHaveBeenCalledWith(structure, 'sphere:@0,5');
      expect(onSelect).toHaveBeenCalledWith([0, 1], 'replace', 'sphere:@0,5', null);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Port** SphereTab.tsx per recipe.
- [ ] **Step 4: Run to verify it passes.** If the default radius in the source differs from 5, set the test expression to match the source's defaults (read the file).
- [ ] **Step 5: Commit** — `… -m "feat(selection): port SphereTab"`

---

## Task 3e: Port PercentileTab

**Emits `pct:z,0,100`** (default axis z, 0–100); `parseExpression(structure, expr)` with no bond args. Source `…/editor/tabs/PercentileTab.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// PercentileTab.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import PercentileTab from './PercentileTab';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';

vi.mock('../../../../store/useStructureStore');
vi.mock('../../../../services/selectionService', () => ({
  selectionService: { parseExpression: vi.fn() },
}));

describe('PercentileTab', () => {
  const onSelect = vi.fn();
  const structure = { symbols: ['C', 'C', 'C'] };
  beforeEach(() => {
    vi.clearAllMocks();
    (useStructureStore as unknown as Mock).mockReturnValue({ structureData: { structure } });
  });

  it('emits pct:z,0,100 (default axis z, 0–100) on Replace', async () => {
    (selectionService.parseExpression as Mock).mockResolvedValue({ indices: [2] });
    render(<PercentileTab onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Replace/i }));
    await waitFor(() => {
      expect(selectionService.parseExpression).toHaveBeenCalledWith(structure, 'pct:z,0,100');
      expect(onSelect).toHaveBeenCalledWith([2], 'replace', 'pct:z,0,100', null);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Port** PercentileTab.tsx per recipe.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit** — `… -m "feat(selection): port PercentileTab"`

---

## Task 3f: Port SpecialTab

**Emits `fixed`**; `parseExpression(structure, 'fixed')` with no bond args. Source `…/editor/tabs/SpecialTab.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// SpecialTab.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import SpecialTab from './SpecialTab';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';

vi.mock('../../../../store/useStructureStore');
vi.mock('../../../../services/selectionService', () => ({
  selectionService: { parseExpression: vi.fn() },
}));

describe('SpecialTab', () => {
  const onSelect = vi.fn();
  const structure = { symbols: ['C', 'C', 'C'] };
  beforeEach(() => {
    vi.clearAllMocks();
    (useStructureStore as unknown as Mock).mockReturnValue({ structureData: { structure } });
  });

  it('emits fixed and forwards indices on Replace', async () => {
    (selectionService.parseExpression as Mock).mockResolvedValue({ indices: [0] });
    render(<SpecialTab onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Replace/i }));
    await waitFor(() => {
      expect(selectionService.parseExpression).toHaveBeenCalledWith(structure, 'fixed');
      expect(onSelect).toHaveBeenCalledWith([0], 'replace', 'fixed', null);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Port** SpecialTab.tsx per recipe.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit** — `… -m "feat(selection): port SpecialTab"`

---

## Task 4: Port the SelectionPanel container (drop Style tab)

**Files:**
- Create: `frontend/src/components/panels/selection/SelectionPanel.tsx`
- Source: `…/editor/SelectionPanel.tsx` (334 lines)
- Test: `frontend/src/components/panels/selection/SelectionPanel.test.tsx`

The container renders the rich `SelectionInput`, an "Advanced Selection" switch, the tab bar, the inline Element/Label/Position/Slab tabs, and `<SphereTab|BondedTab|PercentileTab|ExtendTab|SpecialTab|ConnectedTab onSelect={processSelection} />`. It owns `combineExpressions` and `processSelection`.

- [ ] **Step 1: Write the failing test**

```tsx
// SelectionPanel.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import SelectionPanel from './SelectionPanel';
import { useStructureStore } from '../../../store/useStructureStore';

const doc = () =>
  ({ structure: { symbols: ['O', 'H', 'H'], positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] } }) as never;

describe('SelectionPanel', () => {
  beforeEach(() => {
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().addTab(doc(), 'w');
    useStructureStore.getState().clearSelection();
  });

  it('shows the live selected-atom count', () => {
    useStructureStore.getState().updateSelection([0, 2], 'replace');
    render(<SelectionPanel />);
    expect(screen.getByText(/2 atoms selected/)).toBeInTheDocument();
  });

  it('Element tab Replace selects all atoms of that element', async () => {
    render(<SelectionPanel />);
    fireEvent.click(screen.getByLabelText('Advanced Selection'));
    // Element tab is index 0 and shown by default; default element is the first symbol 'H'.
    fireEvent.click(screen.getByRole('button', { name: /^Replace$/i }));
    await waitFor(() => {
      // H atoms are indices 1 and 2.
      expect(useStructureStore.getState().selectedAtoms.sort()).toEqual([1, 2]);
      expect(useStructureStore.getState().selectionExpression).toBe('elem:H');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NO_PROXY=localhost,127.0.0.1,::1 npx vitest run src/components/panels/selection/SelectionPanel.test.tsx`
Expected: FAIL — module `./SelectionPanel` not found.

- [ ] **Step 3: Port + adapt the container**

Copy `…/editor/SelectionPanel.tsx` to the Create path, then apply exactly these edits:
1. Imports: `useStructureStore from '../../../store/useStructureStore'`; `{ selectionService } from '../../../services/selectionService'`; `SelectionInput from './SelectionInput'`; the six tabs from `./tabs/<Name>`. **Remove** `import StyleTab from './tabs/StyleTab'`.
2. Store destructure: change `activeStructureId` → `activeTabId`; rename `getLatestActiveStructureId` → `getLatestActiveTabId` (reads `snapshot.activeTabId`). Keep `structureData, selectedAtoms, updateSelection, setClusterIndices, setColorOverrides, clusterIndices, slabTarget, setSlabTarget, setSelectionMode, selectionExpression, setSelectionExpression, visParams` (all exist in atomcanvas).
3. **Drop the Style tab:** delete `<Tab label="Style" disabled={isCartoon} />` (the 11th tab) and `<TabPanel value={…} index={10}><StyleTab /></TabPanel>`. Delete the `isCartoon` const and the `effectiveSelectionTabValue` cartoon special-case (set `const effectiveSelectionTabValue = selectionTabValue;`). The remaining tabs are indices 0–9.
4. Keep `combineExpressions`, `processSelection`, `handleSelectByElement/Label/Position`, `handleAnalyzeClusters`, `handleSlabSelection` unchanged (they already use only atomcanvas-present store actions).
5. Keep `export default SelectionPanel`.

- [ ] **Step 4: Run test to verify it passes**

Run the same vitest command. Expected: PASS (2 tests). Note: the default `selectElement` in the source is `'H'`; with symbols `['O','H','H']`, `effectiveSelectElement` resolves to `'H'`, so `elem:H` selects indices 1,2. If the source default differs, update the test's expected element/indices to match.

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangyichen/Desktop/Scripts/atomcanvas && git add frontend/src/components/panels/selection/SelectionPanel.tsx frontend/src/components/panels/selection/SelectionPanel.test.tsx && git commit --no-verify < /dev/null -m "feat(selection): port SelectionPanel container, drop Style tab"
```

---

## Task 5: Register the Selection panel (PanelHost + App + TopBar)

**Files:**
- Modify: `frontend/src/components/shell/PanelHost.tsx`
- Modify: `frontend/src/App.tsx:10-13` (PANEL_KEYS)
- Modify: `frontend/src/components/shell/TopBar.tsx`
- Test: `frontend/src/components/shell/PanelHost.test.tsx` (create if absent)

- [ ] **Step 1: Write the failing test**

```tsx
// PanelHost.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { PanelHost } from './PanelHost';
import { useStructureStore } from '../../store/useStructureStore';

const doc = () =>
  ({ structure: { symbols: ['O', 'H', 'H'], positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] } }) as never;

describe('PanelHost', () => {
  beforeEach(() => {
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().addTab(doc(), 'w');
  });

  it('renders the Selection panel when activePanel is "selection"', () => {
    render(<PanelHost activePanel="selection" onClose={() => {}} />);
    expect(screen.getByText(/atoms selected/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NO_PROXY=localhost,127.0.0.1,::1 npx vitest run src/components/shell/PanelHost.test.tsx`
Expected: FAIL — TS error: `"selection"` not assignable to `ActivePanel`, or nothing rendered.

- [ ] **Step 3: Implement the wiring**

In `PanelHost.tsx`:
```tsx
// 1. import:
import SelectionPanel from '../panels/selection/SelectionPanel';
// 2. type:
export type ActivePanel = 'style' | 'bonds' | 'scene' | 'selection' | null;
// 3. inside the <Drawer>, add:
{activePanel === 'selection' && <SelectionPanel />}
```
In `App.tsx` `PANEL_KEYS` (around line 10):
```tsx
const PANEL_KEYS: Record<string, Exclude<ActivePanel, null>> = {
  s: 'style',
  b: 'bonds',
  c: 'scene',
  a: 'selection',
};
```
In `TopBar.tsx`, add a button mirroring the existing ones (use any MUI icon already imported, e.g. a selection/cursor icon), highlighting when `activePanel === 'selection'` and calling `onTogglePanel('selection')`:
```tsx
<IconButton
  size="small"
  color={activePanel === 'selection' ? 'primary' : 'default'}
  onClick={() => onTogglePanel('selection')}
  aria-label="Selection"
  title="Selection (a)"
>
  <HighlightAltIcon />
</IconButton>
```
(Import `HighlightAltIcon from '@mui/icons-material/HighlightAlt'`.)

- [ ] **Step 4: Run test to verify it passes**

Run the same vitest command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangyichen/Desktop/Scripts/atomcanvas && git add frontend/src/components/shell/PanelHost.tsx frontend/src/components/shell/PanelHost.test.tsx frontend/src/App.tsx frontend/src/components/shell/TopBar.tsx && git commit --no-verify < /dev/null -m "feat(selection): register dedicated Selection panel (hotkey a)"
```

---

## Task 6: Remove the old SelectionInput from BondEditPanel and delete it

**Files:**
- Modify: `frontend/src/components/panels/BondEditPanel.tsx:20,66`
- Delete: `frontend/src/components/panels/SelectionInput.tsx`
- Test: `frontend/src/components/panels/BondEditPanel.test.tsx` (if one exists, update; else add a minimal render test)

- [ ] **Step 1: Write/Update the failing test**

```tsx
// BondEditPanel.test.tsx (add if missing)
import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import BondEditPanel from './BondEditPanel';
import { useStructureStore } from '../../store/useStructureStore';

const doc = () =>
  ({ structure: { symbols: ['O', 'H', 'H'], positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] } }) as never;

describe('BondEditPanel', () => {
  beforeEach(() => {
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().addTab(doc(), 'w');
  });

  it('renders without the selection expression box (moved to Selection panel)', () => {
    const { container } = render(<BondEditPanel />);
    expect(container.querySelector('[aria-label="Apply Selection"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NO_PROXY=localhost,127.0.0.1,::1 npx vitest run src/components/panels/BondEditPanel.test.tsx`
Expected: FAIL — the old `SelectionInput` still renders an "Apply Selection" control (or, if the simple SelectionInput has no such label, the test fails because the box is still present — adjust the assertion to a stable marker the simple box renders, then re-run).

- [ ] **Step 3: Remove and delete**

In `BondEditPanel.tsx`: delete `import { SelectionInput } from './SelectionInput';` (line ~20) and the `<SelectionInput />` usage (line ~66). Then delete the file `frontend/src/components/panels/SelectionInput.tsx`. Grep to confirm no other importer:
`grep -rn "panels/SelectionInput\|from './SelectionInput'" frontend/src` must return nothing outside the deleted file.

- [ ] **Step 4: Run test to verify it passes + full suite**

Run: `NO_PROXY=localhost,127.0.0.1,::1 npx vitest run` (whole suite). Expected: all green (was 84, now higher with the new tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangyichen/Desktop/Scripts/atomcanvas && git add -A frontend/src/components/panels/BondEditPanel.tsx frontend/src/components/panels/BondEditPanel.test.tsx && git rm frontend/src/components/panels/SelectionInput.tsx && git commit --no-verify < /dev/null -m "refactor(selection): move expression box out of BondEditPanel into Selection panel"
```

---

## Task 7: CLI — `convert --select 'EXPR'` subset export

**Files:**
- Modify: `backend/app/cli.py` (the `convert` command, ~L152-175; import at L29)
- Test: `backend/tests/test_cli.py`

- [ ] **Step 1: Write the failing test**

```python
# in backend/tests/test_cli.py
from click.testing import CliRunner
from ase import Atoms
from ase.io import read, write
from app.cli import cli


def _write_ch4(path):
    # 1 C + 4 H
    atoms = Atoms('CH4', positions=[
        (0, 0, 0), (0.6, 0.6, 0.6), (-0.6, -0.6, 0.6),
        (-0.6, 0.6, -0.6), (0.6, -0.6, -0.6),
    ])
    write(str(path), atoms)


def test_convert_select_exports_subset(tmp_path):
    src = tmp_path / "ch4.xyz"
    out = tmp_path / "carbons.xyz"
    _write_ch4(src)
    runner = CliRunner()
    result = runner.invoke(cli, ["convert", str(src), str(out), "--select", "elem:C"])
    assert result.exit_code == 0, result.output
    assert len(read(str(out))) == 1  # only the carbon survives


def test_convert_select_empty_match_errors(tmp_path):
    src = tmp_path / "ch4.xyz"
    out = tmp_path / "none.xyz"
    _write_ch4(src)
    runner = CliRunner()
    result = runner.invoke(cli, ["convert", str(src), str(out), "--select", "elem:Xe"])
    assert result.exit_code != 0
    assert "0 atoms" in result.output
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && /Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python -m pytest tests/test_cli.py -k convert_select -v`
Expected: FAIL — `no such option: --select`.

- [ ] **Step 3: Implement**

In `cli.py`, ensure the import line includes the selection parser (it already imports `parse_selection_expression`). Modify `convert`:
```python
@cli.command(help="Re-export the structure to another file format (CIF/XYZ/extXYZ/VASP/traj).")
@click.argument("input_path", type=click.Path())
@click.argument("output_path", type=click.Path())
@click.option("--format", "fmt", default=None, help="ASE format name (inferred from the output extension if omitted).")
@click.option("--select", "selection", default=None, help='Export only atoms matching a selection DSL expression, e.g. "elem:C".')
@click.option("--bond-scale", default=1.2, show_default=True, help="Bond scale for bonded/connected selectors used by --select.")
def convert(input_path: str, output_path: str, fmt: str | None, selection: str | None, bond_scale: float) -> None:
    atoms = _read_atoms(input_path)
    if selection is not None:
        try:
            idx = parse_selection_expression(atoms, selection, bond_scale=bond_scale)
        except Exception as exc:
            raise click.ClickException(f"Selection failed: {exc}")
        idx = sorted(int(i) for i in idx)
        if not idx:
            raise click.ClickException("selection matched 0 atoms")
        atoms = atoms[idx]
    out = Path(output_path)
    format_name = _infer_format(out, fmt)
    try:
        result = export_atoms_to_file(
            images=[atoms],
            output_path=out,
            format_name=format_name,
            scope="current_frame",
        )
    except click.ClickException:
        raise
    except Exception as exc:
        raise click.ClickException(str(exc))
    frames = result.exported_frames
    click.echo(
        f"wrote {result.output_path} ({result.format_name}, "
        f"{frames} frame{'s' if frames != 1 else ''})"
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run the same pytest command. Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangyichen/Desktop/Scripts/atomcanvas && git add backend/app/cli.py backend/tests/test_cli.py && git commit --no-verify < /dev/null -m "feat(cli): convert --select exports the selected atom subset"
```

---

## Task 8: CLI — `select --ast` flag

**Files:**
- Modify: `backend/app/cli.py` (`select` command ~L137-149; import at L29)
- Test: `backend/tests/test_cli.py`

- [ ] **Step 1: Write the failing test**

```python
# in backend/tests/test_cli.py
import json

def test_select_ast_prints_ast_json(tmp_path):
    src = tmp_path / "ch4.xyz"
    out = tmp_path  # unused
    _write_ch4(src)
    runner = CliRunner()
    result = runner.invoke(cli, ["select", str(src), "elem:C AND pos:z>0", "--ast"])
    assert result.exit_code == 0, result.output
    parsed = json.loads(result.output)
    assert isinstance(parsed, dict)  # an AST node object
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && /Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python -m pytest tests/test_cli.py -k select_ast -v`
Expected: FAIL — `no such option: --ast`.

- [ ] **Step 3: Implement**

In `cli.py`, extend the import:
```python
from .services.selection_parser import parse_selection_expression, get_selection_ast
```
Modify `select`:
```python
@cli.command(help='Evaluate a selection DSL expression, e.g. "elem:C AND pos:z>10".')
@click.argument("path", type=click.Path())
@click.argument("expression")
@click.option("--bond-scale", default=1.2, show_default=True, help="Bond scale used by bonded/connected selectors.")
@click.option("--ast", "as_ast", is_flag=True, help="Print the parsed expression AST instead of evaluating it.")
def select(path: str, expression: str, bond_scale: float, as_ast: bool) -> None:
    if as_ast:
        try:
            ast = get_selection_ast(expression)
        except Exception as exc:
            raise click.ClickException(f"Parse failed: {exc}")
        click.echo(json.dumps(ast, indent=2))
        return
    atoms = _read_atoms(path)
    try:
        indices = parse_selection_expression(atoms, expression, bond_scale=bond_scale)
    except click.ClickException:
        raise
    except Exception as exc:
        raise click.ClickException(f"Selection failed: {exc}")
    click.echo(json.dumps(sorted(int(i) for i in indices)))
```
(Note: `get_selection_ast` does not need the structure, matching the web `parse_ast` endpoint. If its return value isn't a plain dict, coerce with the same shape the router returns.)

- [ ] **Step 4: Run test to verify it passes**

Run the same pytest command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangyichen/Desktop/Scripts/atomcanvas && git add backend/app/cli.py backend/tests/test_cli.py && git commit --no-verify < /dev/null -m "feat(cli): select --ast prints the expression AST"
```

---

## Task 9: Full regression, lint, build, docstring

**Files:** none new — verification + the `cli.py` module docstring usage block.

- [ ] **Step 1: Update the CLI docstring** in `cli.py` to document the new options:
```
    atomcanvas select   structure.cif "elem:C" --ast
    atomcanvas convert   POSCAR carbons.xyz --select "elem:C"
```

- [ ] **Step 2: Frontend full check**

Run from `frontend/`:
```
NO_PROXY=localhost,127.0.0.1,::1 npm run test
NO_PROXY=localhost,127.0.0.1,::1 npm run lint
NO_PROXY=localhost,127.0.0.1,::1 npm run build
```
Expected: all tests green (84 + the new selection tests), lint clean, `tsc -b && vite build` clean.

- [ ] **Step 3: Backend full check**

Run from `backend/`: `/Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python -m pytest -q`
Expected: all green (note pre-existing pytest-asyncio skips/failures per repo memory are unrelated).

- [ ] **Step 4: Manual smoke (optional but recommended)** — `scripts/serve.sh`, open `http://localhost:8000` (proxy-bypassed), press `a`, toggle "Advanced Selection", exercise each tab; run `atomcanvas convert sample.cif out.xyz --select 'elem:C'` and `atomcanvas select sample.cif 'elem:C' --ast`.

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangyichen/Desktop/Scripts/atomcanvas && git add backend/app/cli.py && git commit --no-verify < /dev/null -m "docs(cli): document --select and --ast in the CLI help"
```

---

## Self-review notes (author)

- **Spec coverage:** All 10 tabs (Tasks 3a–3f + the 4 inline tabs in Task 4), rich SelectionInput (Task 2), AST tree (Task 1), op-modes/`combineExpressions` (Task 4), dedicated panel + integration (Task 5), BondEditPanel cleanup (Task 6), CLI `--select`/`--ast` (Tasks 7–8), regression (Task 9). Style tab intentionally omitted (spec decision). ✔
- **Type consistency:** the tab `onSelect` signature `(indices, op, expression, originTabId?)` matches `processSelection` in Task 4; `combineExpressions` op union `'replace'|'add'|'filter'|'exclude'` is consistent throughout; `ActivePanel` adds exactly `'selection'`. ✔
- **Known adjustment points called out inline:** exact default radius (Sphere) and default element (Panel) are taken from the source files — the executor verifies and matches the test literal to the source if defaults differ.
