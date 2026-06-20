import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStructureStore } from '../../../store/useStructureStore';

vi.mock('../../../services/selectionService', () => ({
  selectionService: {
    parseExpression: vi.fn().mockResolvedValue({ indices: [1, 2] }),
    getAST: vi.fn().mockResolvedValue({ ast: null }),
    clearCache: vi.fn(),
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
    fireEvent.click(screen.getByRole('button', { name: 'Apply Selection' }));
    await waitFor(() => {
      expect(selectionService.parseExpression).toHaveBeenCalled();
      expect(useStructureStore.getState().selectedAtoms).toEqual([1, 2]);
    });
  });

  it('Invert wraps a bare expression in NOT(...)', async () => {
    useStructureStore.getState().setSelectionExpression('elem:O');
    render(<SelectionInput />);
    fireEvent.click(screen.getByRole('button', { name: 'Invert Selection' }));
    await waitFor(() => {
      expect(useStructureStore.getState().selectionExpression).toBe('NOT (elem:O)');
    });
  });

  it('logic tree toggle button has an accessible name', () => {
    render(<SelectionInput />);
    // Initially the tree is hidden, so the button should say "Show logic tree"
    expect(screen.getByRole('button', { name: /show logic tree/i })).toBeInTheDocument();
  });

  it('logic tree toggle button aria-label flips when clicked', () => {
    render(<SelectionInput />);
    const btn = screen.getByRole('button', { name: /show logic tree/i });
    fireEvent.click(btn);
    expect(screen.getByRole('button', { name: /hide logic tree/i })).toBeInTheDocument();
  });
});

// ── Task 8: Theme 14c — Expression Apply honors the operation mode ───────────
//
// The advanced expression input used to hard-code 'replace'. It must now funnel
// the typed expression through the SAME combine path the method tabs use, by
// calling the `onSelect` callback (SelectionPanel's processSelection) with the
// active `operation`. We assert it is called with the right operation; the
// store-level union/intersect/complement semantics are owned + tested in
// processSelection / updateSelection.
describe('SelectionInput honors the operation mode (Task 8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().addTab(doc(), 'w');
    useStructureStore.getState().setSelectionExpression('');
    (selectionService.parseExpression as ReturnType<typeof vi.fn>).mockResolvedValue({ indices: [1, 2] });
  });

  it('routes the typed expression through onSelect with operation=add', async () => {
    const onSelect = vi.fn();
    useStructureStore.getState().setSelectionExpression('elem:H');
    render(<SelectionInput onSelect={onSelect} operation="add" />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply Selection' }));
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith([1, 2], 'add', 'elem:H', expect.anything());
    });
  });

  it('routes the typed expression through onSelect with operation=filter', async () => {
    const onSelect = vi.fn();
    useStructureStore.getState().setSelectionExpression('elem:H');
    render(<SelectionInput onSelect={onSelect} operation="filter" />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply Selection' }));
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith([1, 2], 'filter', 'elem:H', expect.anything());
    });
  });

  it('routes the typed expression through onSelect with operation=exclude', async () => {
    const onSelect = vi.fn();
    useStructureStore.getState().setSelectionExpression('elem:H');
    render(<SelectionInput onSelect={onSelect} operation="exclude" />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply Selection' }));
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith([1, 2], 'exclude', 'elem:H', expect.anything());
    });
  });

  it('routes the typed expression through onSelect with operation=replace', async () => {
    const onSelect = vi.fn();
    useStructureStore.getState().setSelectionExpression('elem:H');
    render(<SelectionInput onSelect={onSelect} operation="replace" />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply Selection' }));
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith([1, 2], 'replace', 'elem:H', expect.anything());
    });
  });

  it('defaults to replace when no operation prop is given (backward compatible)', async () => {
    const onSelect = vi.fn();
    useStructureStore.getState().setSelectionExpression('elem:H');
    render(<SelectionInput onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply Selection' }));
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith([1, 2], 'replace', 'elem:H', expect.anything());
    });
  });

  it('clearing an empty expression resets the selection regardless of mode', async () => {
    // Seed a selection, then apply an empty expression with mode=add. Clearing to
    // empty is a sensible hard-reset; it must NOT corrupt the selection by trying
    // to "add empty".
    const onSelect = vi.fn();
    useStructureStore.getState().updateSelection([0, 1], 'replace');
    useStructureStore.getState().setSelectionExpression('');
    render(<SelectionInput onSelect={onSelect} operation="add" />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply Selection' }));
    await waitFor(() => {
      expect(useStructureStore.getState().selectedAtoms).toEqual([]);
      expect(useStructureStore.getState().selectionExpression).toBe('');
    });
    // The empty-clear path must not route through onSelect (which would warn /
    // build a malformed "(old) OR ()" expression).
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('falls back to plain replace when no onSelect callback is supplied', async () => {
    // Existing bare <SelectionInput /> usage (no props) must keep working: it
    // updates the selection directly with replace semantics.
    useStructureStore.getState().setSelectionExpression('elem:H');
    render(<SelectionInput operation="add" />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply Selection' }));
    await waitFor(() => {
      expect(useStructureStore.getState().selectedAtoms).toEqual([1, 2]);
    });
  });
});

// ── Task 8 integration: end-to-end through SelectionPanel's processSelection ──
//
// Render the real SelectionPanel (which wires processSelection into
// SelectionInput) and assert the ACTUAL store selection after applying a typed
// expression in each mode — proving the shared combine path is honored, not just
// that a callback fired.
describe('Expression Apply honors mode end-to-end (via SelectionPanel)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().addTab(doc(), 'w');
    useStructureStore.getState().clearSelection();
    useStructureStore.getState().clearNotification?.();
  });

  const openExpression = async (SelectionPanel: React.ComponentType) => {
    render(<SelectionPanel />);
    fireEvent.click(screen.getByText(/expression \(advanced\)/i));
    await screen.findByRole('button', { name: 'Apply Selection' });
  };

  const typeAndApply = (value: string) => {
    const input = screen.getByLabelText('Selection Expression');
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Selection' }));
  };

  it('Add mode unions the typed expression with the prior selection', async () => {
    const { default: SelectionPanel } = await import('./SelectionPanel');
    // parseExpression resolves to [1, 2]; prior selection is [0].
    (selectionService.parseExpression as ReturnType<typeof vi.fn>).mockResolvedValue({ indices: [1, 2] });
    useStructureStore.getState().updateSelection([0], 'replace');
    await openExpression(SelectionPanel);
    // Switch op mode to Add via its visible label (Tooltip overrides aria-name).
    fireEvent.click(screen.getByText('Add'));
    typeAndApply('elem:H');
    await waitFor(() => {
      expect(useStructureStore.getState().selectedAtoms.slice().sort()).toEqual([0, 1, 2]);
    });
  });

  it('Intersect mode keeps only atoms also in the prior selection', async () => {
    const { default: SelectionPanel } = await import('./SelectionPanel');
    (selectionService.parseExpression as ReturnType<typeof vi.fn>).mockResolvedValue({ indices: [1, 2] });
    useStructureStore.getState().updateSelection([0, 1], 'replace');
    await openExpression(SelectionPanel);
    fireEvent.click(screen.getByText('Intersect'));
    typeAndApply('elem:H');
    await waitFor(() => {
      expect(useStructureStore.getState().selectedAtoms.slice().sort()).toEqual([1]);
    });
  });

  it('Exclude mode selects the complement of the matched atoms', async () => {
    const { default: SelectionPanel } = await import('./SelectionPanel');
    // 3 atoms; expression matches [1,2] → complement is [0].
    (selectionService.parseExpression as ReturnType<typeof vi.fn>).mockResolvedValue({ indices: [1, 2] });
    await openExpression(SelectionPanel);
    fireEvent.click(screen.getByText('Exclude'));
    typeAndApply('elem:H');
    await waitFor(() => {
      expect(useStructureStore.getState().selectedAtoms.slice().sort()).toEqual([0]);
      // combineExpressions with operation='exclude' and empty prior expression → 'NOT (elem:H)'
      expect(useStructureStore.getState().selectionExpression).toBe('NOT (elem:H)');
    });
  });

  it('Replace mode replaces the selection with the matched atoms', async () => {
    const { default: SelectionPanel } = await import('./SelectionPanel');
    (selectionService.parseExpression as ReturnType<typeof vi.fn>).mockResolvedValue({ indices: [1, 2] });
    useStructureStore.getState().updateSelection([0], 'replace');
    await openExpression(SelectionPanel);
    // Replace is the default mode; apply directly.
    typeAndApply('elem:H');
    await waitFor(() => {
      expect(useStructureStore.getState().selectedAtoms.slice().sort()).toEqual([1, 2]);
    });
  });
});
