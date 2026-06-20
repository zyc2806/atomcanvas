import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import SelectionPanel from './SelectionPanel';
import { useStructureStore } from '../../../store/useStructureStore';
import { selectionService } from '../../../services/selectionService';

vi.mock('../../../services/selectionService', () => ({
  selectionService: {
    parseLabels: vi.fn(),
    filterPosition: vi.fn(),
    analyzeClusters: vi.fn(),
    parseExpression: vi.fn(),
    clearCache: vi.fn(),
  },
}));

const doc = () =>
  ({ structure: { symbols: ['O', 'H', 'H'], positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] } }) as never;

describe('SelectionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().addTab(doc(), 'w');
    useStructureStore.getState().clearSelection();
    useStructureStore.getState().clearNotification?.();
  });

  it('constrains the panel to the shared 340px drawer width and pads like the other panels', () => {
    // Every other drawer panel pins its root Box to `{ p: 2, width: 340 }`
    // (StylePanel, ScenePanel, BondEditPanel). Without the width the persistent
    // Drawer shrink-wraps to SelectionPanel's widest intrinsic content; without
    // the padding its content sits flush to the drawer edges, unlike the others.
    const { container } = render(<SelectionPanel />);
    expect(container.firstChild).toHaveStyle({ width: '340px', padding: '16px' });
  });

  it('shows the live selected-atom count', () => {
    useStructureStore.getState().updateSelection([0, 2], 'replace');
    render(<SelectionPanel />);
    expect(screen.getByText(/2 atoms selected/)).toBeInTheDocument();
  });

  it('Element method Apply selects all atoms of that element', async () => {
    render(<SelectionPanel />);
    // Element method is the default active chip; default element is the first symbol 'H'.
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
    await waitFor(() => {
      // H atoms are indices 1 and 2.
      expect(useStructureStore.getState().selectedAtoms.sort()).toEqual([1, 2]);
      expect(useStructureStore.getState().selectionExpression).toBe('elem:H');
    });
  });

  it('fires a selection toast after applying a method', async () => {
    render(<SelectionPanel />);
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
    await waitFor(() => {
      expect(useStructureStore.getState().notification?.message).toMatch(/selected/i);
    });
  });

  it('retains per-atom colors after a slab Apply', () => {
    render(<SelectionPanel />);
    // Activate the Slab method first; the mount effect clears cluster/slab state for
    // non-slab methods, so seed cluster/target state only once 'slab' is active.
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    act(() => {
      useStructureStore.setState({
        clusterIndices: [0, 1, 0],
        slabTarget: 0,
        perAtomColorOverrides: { 0: '#abcdef' },
        colorOverrides: { 0: '#abcdef', 1: '#111111', 2: '#abcdef' },
      });
    });
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
    expect(useStructureStore.getState().colorOverrides).toEqual({ 0: '#abcdef' });
  });

  it('shows method chips with no Advanced toggle', () => {
    render(<SelectionPanel />);
    expect(screen.queryByLabelText('Advanced Selection')).not.toBeInTheDocument();
    ['Element', 'Label', 'Position', 'Layers', 'Sphere', 'Bonded', 'Percentile', 'Extend', 'Fixed', 'Connected']
      .forEach((m) => expect(screen.getByRole('button', { name: m })).toBeInTheDocument());
  });

  it('keeps the expression editor collapsed behind an Advanced disclosure', () => {
    render(<SelectionPanel />);
    expect(screen.getByText(/expression/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Selection Expression')).not.toBeInTheDocument();
  });

  it('surfaces the active operation mode in the summary area', () => {
    render(<SelectionPanel />);
    // Default mode is Replace (summary caption "Mode: Replace").
    expect(screen.getByText(/Mode:\s*Replace/i)).toBeInTheDocument();
    // Switch to the Intersect (internal "filter") mode. MUI's Tooltip overrides
    // the button's accessible name, so click via the visible label text.
    fireEvent.click(screen.getByText('Intersect'));
    expect(screen.getByText(/Mode:\s*Intersect/i)).toBeInTheDocument();
  });

  it('includes the active mode in the post-apply toast', async () => {
    render(<SelectionPanel />);
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
    await waitFor(() => {
      expect(useStructureStore.getState().notification?.message).toMatch(/mode:\s*replace/i);
    });
  });

  it('notifies with an error when a label selection request fails', async () => {
    (selectionService.parseLabels as Mock).mockRejectedValue(new Error('bad labels'));
    render(<SelectionPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Label' }));
    fireEvent.change(screen.getByLabelText(/Labels/i), { target: { value: 'C1' } });
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
    await waitFor(() => {
      const note = useStructureStore.getState().notification;
      expect(note?.severity).toBe('error');
      expect(note?.message).toMatch(/label selection failed/i);
      expect(note?.message).toMatch(/bad labels/i);
    });
  });

  it('warns when a position selection matches zero atoms', async () => {
    (selectionService.filterPosition as Mock).mockResolvedValue({ indices: [] });
    render(<SelectionPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Position' }));
    fireEvent.change(screen.getByLabelText(/Criteria/i), { target: { value: 'z > 999' } });
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
    await waitFor(() => {
      const note = useStructureStore.getState().notification;
      expect(note?.severity).toBe('warning');
      expect(note?.message).toMatch(/no atoms matched/i);
    });
  });

  // ── Task 6: Theme 11 + Theme 7c ─────────────────────────────────────────────

  it('slab block renders all three numbered step labels', () => {
    render(<SelectionPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    expect(screen.getByText(/1\.\s*Analyze layers/i)).toBeInTheDocument();
    expect(screen.getByText(/2\.\s*Click a layer in the viewer/i)).toBeInTheDocument();
    expect(screen.getByText(/3\.\s*Apply/i)).toBeInTheDocument();
  });

  it('shows the persistent step-2 instruction before Analyze runs (no analysisMessage)', () => {
    render(<SelectionPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    // No Analyze called yet — analysisMessage is null.
    // The standing "Click a layer in the viewer" caption must still be visible.
    expect(screen.getByText(/click a layer in the viewer/i)).toBeInTheDocument();
  });

  it('Analyze button is outlined, Apply is contained and disabled without a target', () => {
    render(<SelectionPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    // In MUI, outlined variant → class MuiButton-outlined; contained → MuiButton-contained.
    const analyzeBtn = screen.getByRole('button', { name: /Analyze/i });
    expect(analyzeBtn.className).toMatch(/MuiButton-outlined/);
    const applyBtn = screen.getByRole('button', { name: /^Apply$/i });
    expect(applyBtn.className).toMatch(/MuiButton-contained/);
    expect(applyBtn).toBeDisabled();
  });

  it('Apply is enabled when slabTarget is set', () => {
    render(<SelectionPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    act(() => {
      useStructureStore.setState({ clusterIndices: [0, 1, 0], slabTarget: 0 });
    });
    expect(screen.getByRole('button', { name: /^Apply$/i })).not.toBeDisabled();
  });

  it('slab Apply success routes through notify (no inline residual message)', async () => {
    render(<SelectionPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    act(() => {
      useStructureStore.setState({
        clusterIndices: [0, 1, 0],
        slabTarget: 0,
        perAtomColorOverrides: null,
        colorOverrides: {},
      });
    });
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
    await waitFor(() => {
      // processSelection fires a "Selected N atoms" toast on success
      expect(useStructureStore.getState().notification?.message).toMatch(/selected/i);
      expect(useStructureStore.getState().notification?.severity).not.toBe('error');
    });
  });

  it('slab Apply with no matching atoms notifies via warning (not silent)', async () => {
    render(<SelectionPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    // clusterIndices: all atoms are in layer 1 (id=1), slabTarget=0 (layer 0)
    // → 0 indices match → processSelection fires 'warning' toast
    act(() => {
      useStructureStore.setState({
        clusterIndices: [1, 1, 1],
        slabTarget: 0,
      });
    });
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
    await waitFor(() => {
      const note = useStructureStore.getState().notification;
      expect(note?.severity).toBe('warning');
      expect(note?.message).toMatch(/no atoms matched/i);
    });
  });

  it('Analyze failure does NOT render inline "Analysis failed." text', async () => {
    (selectionService.analyzeClusters as Mock).mockRejectedValue(new Error('network error'));
    render(<SelectionPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    fireEvent.click(screen.getByRole('button', { name: /Analyze/i }));
    await waitFor(() => {
      // The failure must route to notify (toast), not an inline message
      const note = useStructureStore.getState().notification;
      expect(note?.severity).toBe('error');
      expect(note?.message).toMatch(/layer analysis failed/i);
    });
    // "Analysis failed." must NOT appear as inline text
    expect(screen.queryByText('Analysis failed.')).not.toBeInTheDocument();
  });

  // ── FIX 2: handleSlabSelection null-guard ────────────────────────────────────
  it('slab Apply with no structureData does NOT wipe clusterIndices or slabTarget', () => {
    // Render with slab method and seed cluster state, then remove structureData.
    // Clicking Apply must early-return without wiping slab state.
    render(<SelectionPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    // The mount effect for a non-slab activeMethod resets cluster state, so we must
    // re-seed AFTER the component mounts with slab active. Also clear structureData
    // to trigger the null-guard path in handleSlabSelection.
    act(() => {
      useStructureStore.setState({
        clusterIndices: [0, 1, 0],
        slabTarget: 0,
        structureData: null,
      });
    });
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
    // Because structureData is null, handleSlabSelection must return immediately,
    // leaving clusterIndices and slabTarget unchanged.
    expect(useStructureStore.getState().clusterIndices).toEqual([0, 1, 0]);
    expect(useStructureStore.getState().slabTarget).toBe(0);
  });
});
