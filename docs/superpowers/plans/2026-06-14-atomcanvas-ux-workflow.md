# AtomCanvas UX Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AtomCanvas selection→styling intuitive: a viewport floating action bar (recolor/resize/hide a selection with zero panel switching), a single-screen Selection panel (shared op-mode + method chip grid, no Advanced toggle), top-bar text labels, and toast feedback.

**Architecture:** Frontend-only. Reuse existing Zustand store override channels (`colorOverrides` / `opacityOverrides` / `radiusOverrides`) and the existing `selectionService`. The floating bar relocates StylePanel's existing per-selection styling logic; to keep both consistent, the per-atom color/opacity "truth" is lifted from StylePanel local refs into the store.

**Tech Stack:** React 19, TypeScript, MUI v7, Zustand (sliced store), React Three Fiber, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-14-atomcanvas-ux-design.md`

**Conventions (apply to every task):**
- Test runner (proxy MUST be unset or it hangs): from `frontend/`, run
  `env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY NO_PROXY=localhost,127.0.0.1,::1 node_modules/.bin/vitest run <path>`
- Green gate after each task (from `frontend/`, same env prefix): `node_modules/.bin/eslint <changed files>` then `npx tsc -b`. Run the full suite `node_modules/.bin/vitest run` + `npx vite build` at the end of each phase.
- Icons: import per-path (`import X from '@mui/icons-material/X'`), never the barrel.
- Effects: never call `setState` synchronously in a `useEffect` body (ESLint `react-hooks/set-state-in-effect` fails the build). Use render-time adjustment or debounce.

---

## File Structure

| File | Responsibility | Tasks |
|------|----------------|-------|
| `frontend/src/types/store.ts` | Add `notification` + `notify`; add `perAtomColorOverrides`/`perAtomOpacityOverrides` + selection-style actions | 1, 6 |
| `frontend/src/store/slices/createUISlice.ts` | Implement the above | 1, 6 |
| `frontend/src/components/shell/Toaster.tsx` (new) | Global MUI Snackbar bound to `notification` | 1 |
| `frontend/src/components/shell/TopBar.tsx` | Text labels on panel buttons | 2 |
| `frontend/src/components/panels/selection/OperationModeSelector.tsx` (new) | Shared Replace/Add/Filter/Exclude segmented control | 3 |
| `frontend/src/components/panels/selection/tabs/*.tsx` (6 files) | Drop own 4 buttons; take `operation` prop + single Apply | 4 |
| `frontend/src/components/panels/selection/SelectionPanel.tsx` | Op-mode state, chip-grid method picker, remove Advanced toggle, collapse expression, inline-method Apply | 3, 4, 5 |
| `frontend/src/components/overlay/SelectionActionBar.tsx` (new) | Viewport floating bar acting on the selection | 7 |
| `frontend/src/components/panels/StylePanel.tsx` | Use store per-atom maps instead of local refs | 6 |
| `frontend/src/App.tsx` | Mount `<Toaster/>` and `<SelectionActionBar/>` | 1, 8 |

---

## PHASE 1 — Feedback + discoverability foundation

### Task 1: Toast notification channel (痛点 E)

**Files:**
- Modify: `frontend/src/types/store.ts` (UISlice interface, ~line 162)
- Modify: `frontend/src/store/slices/createUISlice.ts` (initial state ~line 159; actions ~line 412)
- Create: `frontend/src/components/shell/Toaster.tsx`
- Create: `frontend/src/components/shell/Toaster.test.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add the store types**

In `frontend/src/types/store.ts`, inside `interface UISlice`, after `cameraApplyRevision: number;` (line 162) add:

```typescript
    notification: { message: string; severity: 'success' | 'info' | 'error'; key: number } | null;
    notify: (message: string, severity?: 'success' | 'info' | 'error') => void;
    clearNotification: () => void;
```

- [ ] **Step 2: Write the failing store test**

Create the test in `frontend/src/store/slices/createUISlice.notify.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useStructureStore } from '../useStructureStore';

describe('UISlice notify', () => {
  beforeEach(() => useStructureStore.getState().clearNotification());

  it('notify sets a notification with message, severity and an incrementing key', () => {
    useStructureStore.getState().notify('hello');
    const first = useStructureStore.getState().notification;
    expect(first?.message).toBe('hello');
    expect(first?.severity).toBe('info');

    useStructureStore.getState().notify('done', 'success');
    const second = useStructureStore.getState().notification;
    expect(second?.message).toBe('done');
    expect(second?.severity).toBe('success');
    expect(second!.key).not.toBe(first!.key);
  });

  it('clearNotification resets to null', () => {
    useStructureStore.getState().notify('x');
    useStructureStore.getState().clearNotification();
    expect(useStructureStore.getState().notification).toBeNull();
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY NO_PROXY=localhost,127.0.0.1,::1 node_modules/.bin/vitest run src/store/slices/createUISlice.notify.test.ts`
Expected: FAIL — `notify is not a function`.

- [ ] **Step 4: Implement in the slice**

In `frontend/src/store/slices/createUISlice.ts`, add to the initial state object (after `cameraApplyRevision: 0,` near line 159):

```typescript
    notification: null,
```

Add these actions (place near `setSelectionExpression`, ~line 412). Use a monotonic counter module-level constant at top of file (after the imports) to avoid `Date.now()`:

```typescript
// module scope, after imports:
let notificationCounter = 0;
```

```typescript
    notify: (message, severity = 'info') => set({
        notification: { message, severity, key: ++notificationCounter },
    }),
    clearNotification: () => set({ notification: null }),
```

- [ ] **Step 5: Run the store test, verify pass**

Run: `... node_modules/.bin/vitest run src/store/slices/createUISlice.notify.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Write the failing Toaster component test**

Create `frontend/src/components/shell/Toaster.test.tsx`:

```typescript
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { Toaster } from './Toaster';
import { useStructureStore } from '../../store/useStructureStore';

describe('Toaster', () => {
  beforeEach(() => useStructureStore.getState().clearNotification());

  it('shows the latest notification message', () => {
    render(<Toaster />);
    act(() => { useStructureStore.getState().notify('Selected 12 atoms', 'success'); });
    expect(screen.getByText('Selected 12 atoms')).toBeInTheDocument();
  });

  it('renders nothing when there is no notification', () => {
    render(<Toaster />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run it, verify it fails**

Run: `... node_modules/.bin/vitest run src/components/shell/Toaster.test.tsx`
Expected: FAIL — cannot find module `./Toaster`.

- [ ] **Step 8: Implement Toaster**

Create `frontend/src/components/shell/Toaster.tsx`:

```tsx
import { Snackbar, Alert } from '@mui/material';
import useStructureStore from '../../store/useStructureStore';

export function Toaster() {
  const notification = useStructureStore((s) => s.notification);
  const clearNotification = useStructureStore((s) => s.clearNotification);

  return (
    <Snackbar
      key={notification?.key}
      open={!!notification}
      autoHideDuration={2500}
      onClose={clearNotification}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    >
      {notification ? (
        <Alert severity={notification.severity} variant="filled" onClose={clearNotification}>
          {notification.message}
        </Alert>
      ) : undefined}
    </Snackbar>
  );
}

export default Toaster;
```

- [ ] **Step 9: Run the Toaster test, verify pass**

Run: `... node_modules/.bin/vitest run src/components/shell/Toaster.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 10: Mount in App**

In `frontend/src/App.tsx`, add the import after the PanelHost import (line 4):

```tsx
import { Toaster } from './components/shell/Toaster';
```

Inside the returned `<div>`, after `<PanelHost .../>` (line 71), add:

```tsx
      <Toaster />
```

- [ ] **Step 11: Lint + typecheck + commit**

Run: `... node_modules/.bin/eslint src/components/shell/Toaster.tsx src/store/slices/createUISlice.ts src/App.tsx && npx tsc -b`
Expected: clean (exit 0).

```bash
git add frontend/src/types/store.ts frontend/src/store/slices/createUISlice.ts frontend/src/store/slices/createUISlice.notify.test.ts frontend/src/components/shell/Toaster.tsx frontend/src/components/shell/Toaster.test.tsx frontend/src/App.tsx
git commit -m "feat(ux): add global toast notification channel"
```

---

### Task 2: Top-bar panel buttons get text labels (痛点 A)

**Files:**
- Modify: `frontend/src/components/shell/TopBar.tsx`
- Create: `frontend/src/components/shell/TopBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/shell/TopBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TopBar } from './TopBar';

describe('TopBar', () => {
  it('renders readable text labels for each panel button', () => {
    render(<TopBar activePanel={null} onTogglePanel={vi.fn()} onOpenFiles={vi.fn()} />);
    expect(screen.getByRole('button', { name: /style/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bonds/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scene/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `... node_modules/.bin/vitest run src/components/shell/TopBar.test.tsx`
Expected: FAIL — the current icon-only buttons have aria-labels like "toggle style panel" but no visible "Style" text; the `/style/i` name still matches aria-label "toggle style panel", so this test may PASS prematurely. To make it meaningful, assert visible text instead. Replace each assertion body with: `expect(screen.getByText('Style')).toBeVisible();` etc. Re-run; expected FAIL — no visible "Style" text node yet.

- [ ] **Step 3: Implement labeled buttons**

In `frontend/src/components/shell/TopBar.tsx`, replace each `<IconButton>` block (lines 43–82) with a `<Button>` carrying both icon and text. Example for Style (apply the same shape to Bonds/Scene/Selection with their icon + label "Bonds"/"Scene"/"Select"):

```tsx
        <Tooltip title="Style (s)">
          <Button
            size="small"
            startIcon={<PaletteIcon fontSize="small" />}
            color={activePanel === 'style' ? 'primary' : 'inherit'}
            onClick={() => onTogglePanel('style')}
            aria-label="toggle style panel"
          >
            Style
          </Button>
        </Tooltip>
```

Keep the existing icon imports. Change the named import on line 2 from `IconButton` to `Button` (Button is already imported; remove the now-unused `IconButton`). Labels: Style, Bonds, Scene, Select.

- [ ] **Step 4: Run it, verify pass**

Run: `... node_modules/.bin/vitest run src/components/shell/TopBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint + typecheck + commit**

Run: `... node_modules/.bin/eslint src/components/shell/TopBar.tsx && npx tsc -b`
Expected: clean.

```bash
git add frontend/src/components/shell/TopBar.tsx frontend/src/components/shell/TopBar.test.tsx
git commit -m "feat(ux): label top-bar panel buttons with text"
```

- [ ] **Step 6: Phase 1 gate**

Run: `... node_modules/.bin/vitest run && npx vite build`
Expected: all tests pass; build clean.

---

## PHASE 2 — Selection panel redesign (痛点 B/C/D)

### Task 3: Shared operation-mode selector (痛点 D, part 1)

**Files:**
- Create: `frontend/src/components/panels/selection/OperationModeSelector.tsx`
- Create: `frontend/src/components/panels/selection/OperationModeSelector.test.tsx`

Shared type used by Tasks 3–5. Define it in this file and import elsewhere:

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/panels/selection/OperationModeSelector.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OperationModeSelector } from './OperationModeSelector';

describe('OperationModeSelector', () => {
  it('renders the four modes and reports the clicked one', () => {
    const onChange = vi.fn();
    render(<OperationModeSelector value="replace" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(onChange).toHaveBeenCalledWith('filter');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `... node_modules/.bin/vitest run src/components/panels/selection/OperationModeSelector.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/components/panels/selection/OperationModeSelector.tsx`:

```tsx
import { ToggleButton, ToggleButtonGroup } from '@mui/material';

export type OpMode = 'replace' | 'add' | 'filter' | 'exclude';

const MODES: { value: OpMode; label: string }[] = [
  { value: 'replace', label: 'Replace' },
  { value: 'add', label: 'Add' },
  { value: 'filter', label: 'Filter' },
  { value: 'exclude', label: 'Exclude' },
];

interface Props {
  value: OpMode;
  onChange: (mode: OpMode) => void;
}

export function OperationModeSelector({ value, onChange }: Props) {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      fullWidth
      value={value}
      onChange={(_, v) => { if (v) onChange(v as OpMode); }}
      aria-label="selection operation mode"
    >
      {MODES.map((m) => (
        <ToggleButton key={m.value} value={m.value}>{m.label}</ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

export default OperationModeSelector;
```

- [ ] **Step 4: Run it, verify pass**

Run: `... node_modules/.bin/vitest run src/components/panels/selection/OperationModeSelector.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint + typecheck + commit**

Run: `... node_modules/.bin/eslint src/components/panels/selection/OperationModeSelector.tsx && npx tsc -b`

```bash
git add frontend/src/components/panels/selection/OperationModeSelector.tsx frontend/src/components/panels/selection/OperationModeSelector.test.tsx
git commit -m "feat(selection): add shared operation-mode selector"
```

---

### Task 4: Tabs take an `operation` prop + single Apply button (痛点 D, part 2)

The six tab components currently render their own four buttons (`Replace/Add/Filter/Exclude`) each calling `handleSelect('<mode>')`. Replace that four-button `Box` with a single Apply button driven by a new `operation` prop, identical edit in every file.

**Files (apply the SAME edit to each):**
- Modify: `frontend/src/components/panels/selection/tabs/SphereTab.tsx`
- Modify: `frontend/src/components/panels/selection/tabs/BondedTab.tsx`
- Modify: `frontend/src/components/panels/selection/tabs/PercentileTab.tsx`
- Modify: `frontend/src/components/panels/selection/tabs/ExtendTab.tsx`
- Modify: `frontend/src/components/panels/selection/tabs/SpecialTab.tsx`
- Modify: `frontend/src/components/panels/selection/tabs/ConnectedTab.tsx`
- Test: `frontend/src/components/panels/selection/tabs/SphereTab.opmode.test.tsx` (new)

- [ ] **Step 1: Write the failing test (SphereTab as representative)**

Create `frontend/src/components/panels/selection/tabs/SphereTab.opmode.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStructureStore } from '../../../../store/useStructureStore';

vi.mock('../../../../services/selectionService', () => ({
  selectionService: { parseExpression: vi.fn().mockResolvedValue({ indices: [0, 1] }) },
}));

import SphereTab from './SphereTab';

const doc = () =>
  ({ structure: { symbols: ['O', 'H', 'H'], positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] } }) as never;

describe('SphereTab op-mode prop', () => {
  beforeEach(() => {
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().addTab(doc(), 'w');
  });

  it('renders a single Apply button and applies with the current operation', async () => {
    const onSelect = vi.fn();
    render(<SphereTab onSelect={onSelect} operation="filter" />);
    expect(screen.queryByRole('button', { name: 'Replace' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith([0, 1], 'filter', expect.any(String), expect.anything());
    });
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `... node_modules/.bin/vitest run src/components/panels/selection/tabs/SphereTab.opmode.test.tsx`
Expected: FAIL — four buttons still present / `operation` prop not accepted.

- [ ] **Step 3: Edit each tab — add prop, replace buttons**

In EACH of the six tab files: (a) add `operation: 'replace' | 'add' | 'filter' | 'exclude';` to the `*TabProps` interface; (b) destructure `operation` in the component signature (`({ onSelect, operation })`); (c) replace the four-button `<Box sx={{ display: 'flex', gap: 1 }}>…</Box>` block at the end of the JSX with this single Apply button (keep `disabled` conditions where a tab already had them — SpecialTab keeps `disabled={loading}`):

```tsx
            <Button fullWidth variant="contained" size="small" onClick={() => handleSelect(operation)}>
                Apply
            </Button>
```

Note: in SpecialTab the handler is `handleSelectFixed`; use `onClick={() => handleSelectFixed(operation)} disabled={loading}`. In every other tab the handler is `handleSelect`.

- [ ] **Step 4: Run the representative test, verify pass**

Run: `... node_modules/.bin/vitest run src/components/panels/selection/tabs/SphereTab.opmode.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the existing tab tests, fix props**

Run: `... node_modules/.bin/vitest run src/components/panels/selection/tabs/`
The pre-existing `*Tab.test.tsx` render each tab without `operation`. For each, pass `operation="replace"` to the render and change any `getByRole('button', { name: 'Replace' })` assertion to `getByRole('button', { name: /apply/i })`. Re-run until green.

- [ ] **Step 6: Lint + typecheck + commit**

Run: `... node_modules/.bin/eslint src/components/panels/selection/tabs && npx tsc -b`

```bash
git add frontend/src/components/panels/selection/tabs
git commit -m "feat(selection): tabs use shared operation prop with single Apply"
```

---

### Task 5: SelectionPanel — op-mode state, chip-grid methods, no Advanced toggle, collapsed expression (痛点 B/C)

This rewrites `SelectionPanel.tsx`'s rendering while preserving all existing handlers (`processSelection`, `handleSelectByElement/Label/Position`, `handleAnalyzeClusters`, `handleSlabSelection`, `combineExpressions`) and the slab side-effects.

**Files:**
- Modify: `frontend/src/components/panels/selection/SelectionPanel.tsx`
- Modify: `frontend/src/components/panels/selection/SelectionPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/components/panels/selection/SelectionPanel.test.tsx` (keep existing tests). These assert: no Advanced toggle, all method chips visible, expression collapsed by default.

```tsx
it('shows method chips with no Advanced toggle', () => {
  render(<SelectionPanel />);
  expect(screen.queryByLabelText('Advanced Selection')).not.toBeInTheDocument();
  ['Element', 'Label', 'Position', 'Slab', 'Sphere', 'Bonded', 'Percentile', 'Extend', 'Special', 'Connected']
    .forEach((m) => expect(screen.getByRole('button', { name: m })).toBeInTheDocument());
});

it('keeps the expression editor collapsed behind an Advanced disclosure', () => {
  render(<SelectionPanel />);
  expect(screen.getByText(/expression/i)).toBeInTheDocument();
  // The expression TextField is not visible until the disclosure is expanded
  expect(screen.queryByLabelText('Selection Expression')).not.toBeInTheDocument();
});
```

Note: the existing `SelectionPanel.test.tsx` `beforeEach` must seed a tab (mirror `PanelHost.test.tsx`: `useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} }); addTab(doc(), 'w');`). Add it if absent.

- [ ] **Step 2: Run it, verify it fails**

Run: `... node_modules/.bin/vitest run src/components/panels/selection/SelectionPanel.test.tsx`
Expected: FAIL — Advanced toggle still present; chips absent.

- [ ] **Step 3: Rewrite the render + state**

In `SelectionPanel.tsx`:

(a) Add imports:
```tsx
import Collapse from '@mui/material/Collapse';
import Chip from '@mui/material/Chip';
import { OperationModeSelector, type OpMode } from './OperationModeSelector';
```

(b) Replace state `const [advancedSelection, setAdvancedSelection] = useState(false);` and `const [selectionTabValue, setSelectionTabValue] = useState(0);` with:
```tsx
const [operation, setOperation] = useState<OpMode>('replace');
const [activeMethod, setActiveMethod] = useState<string>('element');
const [showExpression, setShowExpression] = useState(false);
```

(c) Define the method list (module scope, above the component):
```tsx
const METHODS = [
  { id: 'element', label: 'Element' }, { id: 'label', label: 'Label' },
  { id: 'position', label: 'Position' }, { id: 'slab', label: 'Slab' },
  { id: 'sphere', label: 'Sphere' }, { id: 'bonded', label: 'Bonded' },
  { id: 'percentile', label: 'Percentile' }, { id: 'extend', label: 'Extend' },
  { id: 'special', label: 'Special' }, { id: 'connected', label: 'Connected' },
] as const;
```

(d) Replace the slab/mode `useEffect` (lines 87–112) so it keys on `activeMethod` instead of `advancedSelection`+`selectionTabValue`. The panel is always "advanced" now, so:
```tsx
useEffect(() => {
  if (activeMethod === 'slab') {
    setSelectionMode('slab');
  } else {
    // setSelectionMode('disabled') already drops slab/cluster coloring and
    // restores per-atom styling (see Task 6 hardening) — do NOT null colorOverrides here.
    setSelectionMode('disabled');
    setClusterIndices(null);
    setSlabTarget(null);
  }
}, [activeMethod, setSelectionMode, setClusterIndices, setSlabTarget]);
```
Delete `handleAdvancedSelectionChange` and `handleSelectionTabChange`; replace tab-change call sites with `setActiveMethod(id)`. Keep `setClusterIndices` in the store destructure. The previous `isCartoon`/`setColorOverrides(null)` branch is intentionally removed — per-atom coloring must survive method switches.

(e) Replace the JSX from the `<FormControlLabel ... Advanced Selection />` through the end of the `{advancedSelection && (…)}` block with the always-on layout:

```tsx
<Box sx={{ mt: 2 }}>
  <OperationModeSelector value={operation} onChange={setOperation} />
</Box>

<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 2 }}>
  {METHODS.map((m) => (
    <Chip
      key={m.id}
      label={m.label}
      size="small"
      color={activeMethod === m.id ? 'primary' : 'default'}
      variant={activeMethod === m.id ? 'filled' : 'outlined'}
      onClick={() => setActiveMethod(m.id)}
    />
  ))}
</Box>

<Box sx={{ mt: 2 }}>
  {activeMethod === 'element' && (/* existing Element FormControl + a single Apply */)}
  {activeMethod === 'label' && (/* existing Label TextField + Apply */)}
  {activeMethod === 'position' && (/* existing Position controls + Apply */)}
  {activeMethod === 'slab' && (/* existing Slab analyze/select block */)}
  {activeMethod === 'sphere' && <SphereTab onSelect={processSelection} operation={operation} />}
  {activeMethod === 'bonded' && <BondedTab onSelect={processSelection} operation={operation} />}
  {activeMethod === 'percentile' && <PercentileTab onSelect={processSelection} operation={operation} />}
  {activeMethod === 'extend' && <ExtendTab onSelect={processSelection} operation={operation} />}
  {activeMethod === 'special' && <SpecialTab onSelect={processSelection} operation={operation} />}
  {activeMethod === 'connected' && <ConnectedTab onSelect={processSelection} operation={operation} />}
</Box>

<Box sx={{ mt: 2, borderTop: 1, borderColor: 'divider', pt: 1 }}>
  <Button size="small" onClick={() => setShowExpression((v) => !v)}>
    {showExpression ? '▾' : '▸'} Expression (advanced)
  </Button>
  <Collapse in={showExpression}><Box sx={{ p: 1 }}><SelectionInput /></Box></Collapse>
</Box>
```

(f) For the four inline methods (Element/Label/Position/Slab), replace their four-button rows with a single Apply button using the shared `operation`, e.g. Element:
```tsx
<Button fullWidth variant="contained" size="small" onClick={() => handleSelectByElement(operation)}>Apply</Button>
```
Slab keeps its existing per-button `disabled={slabTarget === null}` on its Apply (Analyze button stays as-is); use `onClick={() => handleSlabSelection(operation)}`.

(g) Ensure `SelectionInput`'s TextField has `label="Selection Expression"` so the collapsed-by-default test is meaningful (add the label in `SelectionInput.tsx` if missing).

(h) `isCartoon` (line 78) is now only referenced by the deleted effect branch — remove the `const isCartoon = …` line if eslint reports it unused. Likewise drop `setColorOverrides` from the destructure if no longer used in this file.

- [ ] **Step 4: Run SelectionPanel tests, verify pass**

Run: `... node_modules/.bin/vitest run src/components/panels/selection/SelectionPanel.test.tsx`
Expected: PASS (old + new).

- [ ] **Step 5: Lint + typecheck + commit**

Run: `... node_modules/.bin/eslint src/components/panels/selection && npx tsc -b`

```bash
git add frontend/src/components/panels/selection/SelectionPanel.tsx frontend/src/components/panels/selection/SelectionPanel.test.tsx frontend/src/components/panels/selection/SelectionInput.tsx
git commit -m "feat(selection): chip-grid methods, shared op-mode, collapsible expression"
```

- [ ] **Step 6: Phase 2 gate**

Run: `... node_modules/.bin/vitest run && npx vite build`
Expected: all green.

---

## PHASE 3 — Floating selection action bar (痛点 F)

### Task 6: Lift per-atom color/opacity truth into the store (mitigates the colorOverrides merge risk)

Currently `StylePanel` keeps per-atom selection colors/opacities in local refs (`perAtomColorRef`, `perAtomOpacityRef`) and merges them over element styling in an effect. The floating bar must share that truth so element re-styling never wipes floating-bar edits, and floating-bar edits never wipe StylePanel edits.

**Files:**
- Modify: `frontend/src/types/store.ts`
- Modify: `frontend/src/store/slices/createUISlice.ts`
- Modify: `frontend/src/components/panels/StylePanel.tsx`
- Create: `frontend/src/store/slices/createUISlice.selstyle.test.ts`

- [ ] **Step 1: Add store types**

In `interface UISlice` (types/store.ts) add near the override fields (after line 151):

```typescript
    perAtomColorOverrides: { [index: number]: string } | null;
    perAtomOpacityOverrides: { [index: number]: number } | null;
    applySelectionColor: (indices: number[], color: string) => void;
    applySelectionSize: (indices: number[], scale: number) => void;
    toggleSelectionHidden: (indices: number[]) => void;
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/store/slices/createUISlice.selstyle.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useStructureStore } from '../useStructureStore';

describe('selection styling actions', () => {
  beforeEach(() => useStructureStore.setState({
    colorOverrides: null, opacityOverrides: null, radiusOverrides: null,
    perAtomColorOverrides: null, perAtomOpacityOverrides: null,
  }));

  it('applySelectionColor merges into both perAtom and visible colorOverrides', () => {
    useStructureStore.getState().applySelectionColor([0, 2], '#ff0000');
    expect(useStructureStore.getState().perAtomColorOverrides).toEqual({ 0: '#ff0000', 2: '#ff0000' });
    expect(useStructureStore.getState().colorOverrides).toMatchObject({ 0: '#ff0000', 2: '#ff0000' });
  });

  it('applySelectionSize writes radiusOverrides for selected indices', () => {
    useStructureStore.getState().applySelectionSize([1], 1.8);
    expect(useStructureStore.getState().radiusOverrides).toMatchObject({ 1: 1.8 });
  });

  it('toggleSelectionHidden hides then shows (opacity 0 then removed)', () => {
    useStructureStore.getState().toggleSelectionHidden([0]);
    expect(useStructureStore.getState().opacityOverrides).toMatchObject({ 0: 0 });
    useStructureStore.getState().toggleSelectionHidden([0]);
    expect(useStructureStore.getState().opacityOverrides?.[0]).toBeUndefined();
  });

  it('setSelectionMode(non-slab) preserves per-atom color/opacity/size, not slab coloring', () => {
    useStructureStore.getState().applySelectionColor([0], '#ff0000');
    useStructureStore.getState().applySelectionSize([0], 1.5);
    useStructureStore.getState().toggleSelectionHidden([1]); // hide atom 1
    useStructureStore.getState().setSelectionMode('disabled');
    expect(useStructureStore.getState().colorOverrides).toMatchObject({ 0: '#ff0000' });
    expect(useStructureStore.getState().opacityOverrides).toMatchObject({ 1: 0 });
    expect(useStructureStore.getState().radiusOverrides).toMatchObject({ 0: 1.5 });
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `... node_modules/.bin/vitest run src/store/slices/createUISlice.selstyle.test.ts`
Expected: FAIL — actions undefined.

- [ ] **Step 4: Implement actions + initial state in createUISlice.ts**

Add to initial state (near `radiusOverrides: null,`):
```typescript
    perAtomColorOverrides: null,
    perAtomOpacityOverrides: null,
```

Add actions (near `setColorOverrides`):
```typescript
    applySelectionColor: (indices, color) => set((state) => {
        if (indices.length === 0) return {};
        const perAtom = { ...(state.perAtomColorOverrides ?? {}) };
        const visible = { ...(state.colorOverrides ?? {}) };
        indices.forEach((i) => { perAtom[i] = color; visible[i] = color; });
        return { perAtomColorOverrides: perAtom, colorOverrides: visible };
    }),
    applySelectionSize: (indices, scale) => set((state) => {
        if (indices.length === 0) return {};
        const next = { ...(state.radiusOverrides ?? {}) };
        indices.forEach((i) => { next[i] = scale; });
        return { radiusOverrides: next };
    }),
    toggleSelectionHidden: (indices) => set((state) => {
        if (indices.length === 0) return {};
        const perAtom = { ...(state.perAtomOpacityOverrides ?? {}) };
        const visible = { ...(state.opacityOverrides ?? {}) };
        // If every selected atom is currently hidden, show them; else hide all.
        const allHidden = indices.every((i) => perAtom[i] === 0);
        indices.forEach((i) => {
            if (allHidden) { delete perAtom[i]; delete visible[i]; }
            else { perAtom[i] = 0; visible[i] = 0; }
        });
        return {
            perAtomOpacityOverrides: Object.keys(perAtom).length ? perAtom : null,
            opacityOverrides: Object.keys(visible).length ? visible : null,
        };
    }),
```

Also extend `resetUIState` and `resetSlabState` to null `perAtomColorOverrides`/`perAtomOpacityOverrides`.

Harden `setSelectionMode` (currently lines ~404–411) so switching to a non-slab mode restores the per-atom truth instead of nulling all styling, and never auto-clears per-atom size. Replace it with:

```typescript
    setSelectionMode: (mode) => set((state) => ({
        selectionMode: mode,
        clusterIndices: mode === 'slab' ? state.clusterIndices : null,
        // Non-slab: drop transient slab/cluster coloring but keep per-atom styling.
        colorOverrides: mode === 'slab' ? state.colorOverrides : (state.perAtomColorOverrides ?? null),
        opacityOverrides: mode === 'slab' ? state.opacityOverrides : (state.perAtomOpacityOverrides ?? null),
        // radiusOverrides is purely per-atom user styling — never auto-cleared by mode.
        slabTarget: mode === 'slab' ? state.slabTarget : null,
        cameraViewTrigger: null,
    })),
```

(Note: this drops the previous `radiusOverrides: mode === 'slab' ? … : null` line — per-atom size now persists across method switches.)

- [ ] **Step 5: Run it, verify pass**

Run: `... node_modules/.bin/vitest run src/store/slices/createUISlice.selstyle.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Refactor StylePanel to use store per-atom maps**

In `StylePanel.tsx`:
- Remove `perAtomColorRef` / `perAtomOpacityRef` (lines 123–124).
- Pull from store: `const { perAtomColorOverrides, perAtomOpacityOverrides, applySelectionColor } = useStructureStore();` (add to the existing destructure).
- In the element effect (lines 130–142), read store maps instead of refs:
```tsx
    const mergedColors = { ...elColors, ...(perAtomColorOverrides ?? {}) };
    const mergedOpacities = { ...elOpacities, ...(perAtomOpacityOverrides ?? {}) };
```
  and add `perAtomColorOverrides, perAtomOpacityOverrides` to that effect's dependency array (remove the eslint-disable if no longer needed).
- Replace `handleSelectedColor` body (lines 146–157) with `applySelectionColor(selectedAtoms, color);`.
- `handleSelectedSize` can stay (it writes radiusOverrides directly) or call `applySelectionSize`.

- [ ] **Step 7: Run StylePanel's existing tests, verify pass**

Run: `... node_modules/.bin/vitest run src/components/panels/StylePanel.test.tsx`
Expected: PASS. If a test referenced the refs internally, update it to assert store state instead.

- [ ] **Step 8: Lint + typecheck + commit**

Run: `... node_modules/.bin/eslint src/store/slices/createUISlice.ts src/components/panels/StylePanel.tsx && npx tsc -b`

```bash
git add frontend/src/types/store.ts frontend/src/store/slices/createUISlice.ts frontend/src/store/slices/createUISlice.selstyle.test.ts frontend/src/components/panels/StylePanel.tsx
git commit -m "refactor(style): lift per-atom selection styling truth into the store"
```

---

### Task 7: SelectionActionBar component (痛点 F core)

**Files:**
- Create: `frontend/src/components/overlay/SelectionActionBar.tsx`
- Create: `frontend/src/components/overlay/SelectionActionBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/overlay/SelectionActionBar.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionActionBar } from './SelectionActionBar';
import { useStructureStore } from '../../store/useStructureStore';

describe('SelectionActionBar', () => {
  beforeEach(() => useStructureStore.setState({
    selectedAtoms: [], colorOverrides: null, opacityOverrides: null,
    radiusOverrides: null, perAtomColorOverrides: null, perAtomOpacityOverrides: null,
  }));

  it('renders nothing when no atoms are selected', () => {
    render(<SelectionActionBar />);
    expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();
  });

  it('shows the selection count when atoms are selected', () => {
    useStructureStore.setState({ selectedAtoms: [0, 1, 2] });
    render(<SelectionActionBar />);
    expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
  });

  it('hide button hides the selected atoms', () => {
    useStructureStore.setState({ selectedAtoms: [0, 1] });
    render(<SelectionActionBar />);
    fireEvent.click(screen.getByRole('button', { name: /hide/i }));
    expect(useStructureStore.getState().opacityOverrides).toMatchObject({ 0: 0, 1: 0 });
  });

  it('clear button empties the selection', () => {
    useStructureStore.setState({ selectedAtoms: [0, 1] });
    render(<SelectionActionBar />);
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(useStructureStore.getState().selectedAtoms).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `... node_modules/.bin/vitest run src/components/overlay/SelectionActionBar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/components/overlay/SelectionActionBar.tsx`:

```tsx
import { useState } from 'react';
import { Paper, Stack, Typography, IconButton, Tooltip, Popover, Box, Button, Divider } from '@mui/material';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import ClearIcon from '@mui/icons-material/Clear';
import useStructureStore from '../../store/useStructureStore';

const SWATCHES = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#ffffff'];

export function SelectionActionBar() {
  const selectedAtoms = useStructureStore((s) => s.selectedAtoms);
  const radiusOverrides = useStructureStore((s) => s.radiusOverrides);
  const applySelectionColor = useStructureStore((s) => s.applySelectionColor);
  const applySelectionSize = useStructureStore((s) => s.applySelectionSize);
  const toggleSelectionHidden = useStructureStore((s) => s.toggleSelectionHidden);
  const clearSelection = useStructureStore((s) => s.clearSelection);
  const notify = useStructureStore((s) => s.notify);
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);

  if (selectedAtoms.length === 0) return null;
  const n = selectedAtoms.length;

  const currentScale = () => {
    const vals = selectedAtoms.map((i) => radiusOverrides?.[i] ?? 1.0);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  const bumpSize = (delta: number) => {
    const next = Math.max(0.2, Math.min(3, +(currentScale() + delta).toFixed(2)));
    applySelectionSize(selectedAtoms, next);
    notify(`Resized ${n} atom${n > 1 ? 's' : ''}`);
  };

  return (
    <Paper
      elevation={6}
      sx={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', px: 2, py: 1, borderRadius: 3, zIndex: 5 }}
    >
      <Stack direction="row" spacing={2} alignItems="center">
        <Typography variant="body2" color="primary">{n} selected</Typography>
        <Divider orientation="vertical" flexItem />
        <Tooltip title="Color">
          <IconButton size="small" aria-label="color" onClick={(e) => setColorAnchor(e.currentTarget)}>
            <Box sx={{ width: 18, height: 18, borderRadius: 1, bgcolor: 'primary.main', border: '1px solid #888' }} />
          </IconButton>
        </Tooltip>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Tooltip title="Smaller"><IconButton size="small" aria-label="decrease size" onClick={() => bumpSize(-0.2)}><RemoveIcon fontSize="small" /></IconButton></Tooltip>
          <Typography variant="caption">Size</Typography>
          <Tooltip title="Larger"><IconButton size="small" aria-label="increase size" onClick={() => bumpSize(0.2)}><AddIcon fontSize="small" /></IconButton></Tooltip>
        </Stack>
        <Tooltip title="Hide / show">
          <IconButton size="small" aria-label="hide" onClick={() => { toggleSelectionHidden(selectedAtoms); notify(`Toggled visibility of ${n} atom${n > 1 ? 's' : ''}`); }}>
            <VisibilityOffIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Clear selection">
          <IconButton size="small" aria-label="clear" onClick={() => clearSelection()}><ClearIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>

      <Popover open={!!colorAnchor} anchorEl={colorAnchor} onClose={() => setColorAnchor(null)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Box sx={{ display: 'flex', gap: 1, p: 1.5, maxWidth: 200, flexWrap: 'wrap' }}>
          {SWATCHES.map((c) => (
            <Button key={c} sx={{ minWidth: 28, height: 28, p: 0, bgcolor: c, border: '1px solid #888', '&:hover': { bgcolor: c } }}
              aria-label={`color ${c}`}
              onClick={() => { applySelectionColor(selectedAtoms, c); notify(`Recolored ${n} atom${n > 1 ? 's' : ''}`, 'success'); setColorAnchor(null); }} />
          ))}
        </Box>
      </Popover>
    </Paper>
  );
}

export default SelectionActionBar;
```

- [ ] **Step 4: Run it, verify pass**

Run: `... node_modules/.bin/vitest run src/components/overlay/SelectionActionBar.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint + typecheck + commit**

Run: `... node_modules/.bin/eslint src/components/overlay/SelectionActionBar.tsx && npx tsc -b`

```bash
git add frontend/src/components/overlay/SelectionActionBar.tsx frontend/src/components/overlay/SelectionActionBar.test.tsx
git commit -m "feat(ux): viewport floating selection action bar"
```

---

### Task 8: Mount the action bar + regression test for the merge risk

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/overlay/SelectionActionBar.regression.test.tsx`

- [ ] **Step 1: Write the failing regression test**

Create `frontend/src/components/overlay/SelectionActionBar.regression.test.tsx`. This guards the flagged risk: a floating-bar color must survive a later element re-style.

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { useStructureStore } from '../../store/useStructureStore';

describe('floating-bar color survives element restyle', () => {
  beforeEach(() => useStructureStore.setState({
    selectedAtoms: [0], colorOverrides: null, perAtomColorOverrides: null,
  }));

  it('perAtomColorOverrides persists so StylePanel re-merge keeps the color', () => {
    useStructureStore.getState().applySelectionColor([0], '#abcdef');
    // Simulate StylePanel element-restyle merge: element colors + perAtom truth.
    const elColors = { 0: '#000000', 1: '#000000' };
    const merged = { ...elColors, ...(useStructureStore.getState().perAtomColorOverrides ?? {}) };
    expect(merged[0]).toBe('#abcdef'); // per-atom wins
  });
});
```

- [ ] **Step 2: Run it, verify pass (this is a guard, not new code)**

Run: `... node_modules/.bin/vitest run src/components/overlay/SelectionActionBar.regression.test.tsx`
Expected: PASS — confirms Task 6 made the truth durable. If it FAILS, Task 6 is incomplete.

- [ ] **Step 3: Mount in App**

In `frontend/src/App.tsx`: add import after the Toaster import:
```tsx
import { SelectionActionBar } from './components/overlay/SelectionActionBar';
```
Inside the root `<div>`, after `<ViewerCanvas />` (line 65), add:
```tsx
      <SelectionActionBar />
```
(The bar is `position: absolute`; the root `<div>` is `position: fixed; inset: 0`, so it anchors to the viewport.)

- [ ] **Step 4: Lint + typecheck + commit**

Run: `... node_modules/.bin/eslint src/App.tsx && npx tsc -b`

```bash
git add frontend/src/App.tsx frontend/src/components/overlay/SelectionActionBar.regression.test.tsx
git commit -m "feat(ux): mount SelectionActionBar + guard color-merge regression"
```

- [ ] **Step 5: Final full gate**

Run: `... node_modules/.bin/eslint . && npx tsc -b && node_modules/.bin/vitest run && npx vite build`
Expected: eslint clean, tsc clean, all vitest green, build clean.

```bash
git commit --allow-empty -m "chore(ux): phase 3 green gate verified"
```

---

## Out of scope / future
- **Focus-to-selection** camera action on the floating bar (store has `triggerCameraView`; needs centroid + sensible distance). Add as a follow-up once the core bar ships.
- Native color picker (current bar uses a fixed swatch palette; full picker can reuse StylePanel's `ColorSwatch`).
