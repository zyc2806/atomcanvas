import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SelectionActionBar } from './SelectionActionBar';
import { useStructureStore } from '../../store/useStructureStore';

// refreshTopology hits the backend; stub it so the bar's store-mutation
// behaviour can be tested without a server.
// Returns true (success) by default so useBondEdits emits a success toast.
vi.mock('../../services/topologyRefresh', () => ({
  refreshTopology: vi.fn().mockResolvedValue(undefined),
  refreshTopologyOrNotify: vi.fn().mockResolvedValue(true),
  default: vi.fn().mockResolvedValue(undefined),
}));

describe('SelectionActionBar', () => {
  beforeEach(() => useStructureStore.setState({
    selectedAtoms: [],
    selectedBonds: [],
    structureData: null,
    bondOpacityOverrides: null,
    topologyOverrides: {},
    colorOverrides: null,
    opacityOverrides: null,
    radiusOverrides: null,
    perAtomColorOverrides: null,
    perAtomOpacityOverrides: null,
  }));

  it('renders nothing when no atoms and no bonds are selected', () => {
    render(<SelectionActionBar />);
    expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();
  });

  it('shows the selection count when atoms are selected', () => {
    useStructureStore.setState({ selectedAtoms: [0, 1, 2] });
    render(<SelectionActionBar />);
    expect(screen.getByText(/3 atoms selected/i)).toBeInTheDocument();
  });

  // Bottom offset clears the TrajectoryBar (also bottom-center) once a real
  // multi-frame trajectory is loaded, so the two bars don't overlap.
  const barBottomPx = () => {
    const bar = screen.getByTestId('selection-action-bar');
    return parseFloat(getComputedStyle(bar).bottom);
  };

  it('sits low (no trajectory) so it does not waste vertical space', () => {
    useStructureStore.setState({ selectedAtoms: [0, 1], structureData: null });
    render(<SelectionActionBar />);
    expect(barBottomPx()).toBeGreaterThan(0);
  });

  it('lifts its bottom offset when a multi-frame trajectory is present', () => {
    // Single-frame: offset stays low.
    useStructureStore.setState({
      selectedAtoms: [0, 1],
      structureData: { trajectory: [{}] } as never,
    });
    const { unmount } = render(<SelectionActionBar />);
    const single = barBottomPx();
    unmount();

    // Multi-frame: offset rises to clear the TrajectoryBar.
    useStructureStore.setState({
      selectedAtoms: [0, 1],
      structureData: { trajectory: [{}, {}, {}] } as never,
    });
    render(<SelectionActionBar />);
    const multi = barBottomPx();

    expect(multi).toBeGreaterThan(single);
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

  it('colour control opens a hex picker (matches the sidebar), not preset swatches', () => {
    useStructureStore.setState({ selectedAtoms: [0, 1] });
    render(<SelectionActionBar />);
    // The old fixed preset swatches (aria-label "color #rrggbb") are gone.
    expect(screen.queryByLabelText(/^color #/i)).toBeNull();
    fireEvent.click(screen.getByTestId('selection-color'));
    expect(document.querySelector('.react-colorful')).not.toBeNull();
  });

  it('colour swatch reflects the first selected atom colour override', () => {
    useStructureStore.setState({ selectedAtoms: [0, 1], colorOverrides: { 0: '#123456' } });
    render(<SelectionActionBar />);
    // jsdom normalises the hex background to rgb().
    expect(screen.getByTestId('selection-color')).toHaveStyle({
      backgroundColor: 'rgb(18, 52, 86)',
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Bond-selection tests
  // ──────────────────────────────────────────────────────────────────────────

  it('bar renders for a bond-only selection: shows bond controls, hides atom controls', () => {
    useStructureStore.setState({ selectedAtoms: [], selectedBonds: ['0-1'] });
    render(<SelectionActionBar />);
    // Bond controls present
    expect(screen.getByRole('button', { name: /set order/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /bond order/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decrease bond opacity/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /increase bond opacity/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete bond/i })).toBeInTheDocument();
    // Atom-only controls absent
    expect(screen.queryByRole('button', { name: /decrease size/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('selection-color')).not.toBeInTheDocument();
  });

  it('bond opacity − button decreases bondOpacityOverrides by ~0.2', () => {
    useStructureStore.setState({ selectedAtoms: [], selectedBonds: ['0-1'] });
    render(<SelectionActionBar />);
    fireEvent.click(screen.getByRole('button', { name: /decrease bond opacity/i }));
    const overrides = useStructureStore.getState().bondOpacityOverrides;
    expect(overrides?.['0-1']).toBeCloseTo(0.8, 5);
  });

  it('bond opacity + button increases bondOpacityOverrides', () => {
    // Start at 0.6, clicking + should go to 0.8
    useStructureStore.setState({
      selectedAtoms: [],
      selectedBonds: ['0-1'],
      bondOpacityOverrides: { '0-1': 0.6 },
    });
    render(<SelectionActionBar />);
    fireEvent.click(screen.getByRole('button', { name: /increase bond opacity/i }));
    const overrides = useStructureStore.getState().bondOpacityOverrides;
    expect(overrides?.['0-1']).toBeCloseTo(0.8, 5);
  });

  it('Set order sets topologyOverrides for every selected bond', async () => {
    useStructureStore.setState({ selectedAtoms: [], selectedBonds: ['0-1', '1-2'] });
    render(<SelectionActionBar />);
    // Default bond order is '1.0'; click Set order
    fireEvent.click(screen.getByRole('button', { name: /set order/i }));
    await waitFor(() => {
      const o = useStructureStore.getState().topologyOverrides;
      expect(o['0-1']).toBe('1.0');
      expect(o['1-2']).toBe('1.0');
    });
  });

  it('Delete bond sets topologyOverrides to "delete" for every selected bond', async () => {
    useStructureStore.setState({ selectedAtoms: [], selectedBonds: ['0-1', '1-2'] });
    render(<SelectionActionBar />);
    fireEvent.click(screen.getByRole('button', { name: /delete bond/i }));
    await waitFor(() => {
      const o = useStructureStore.getState().topologyOverrides;
      expect(o['0-1']).toBe('delete');
      expect(o['1-2']).toBe('delete');
    });
  });

  it('label shows both counts and renders BOTH control groups for a mixed selection', () => {
    useStructureStore.setState({ selectedAtoms: [0, 1], selectedBonds: ['0-1'] });
    render(<SelectionActionBar />);
    expect(screen.getByText(/2 atoms \+ 1 bond selected/i)).toBeInTheDocument();
    // Atom controls present...
    expect(screen.getByRole('button', { name: /decrease size/i })).toBeInTheDocument();
    expect(screen.getByTestId('selection-color')).toBeInTheDocument();
    // ...alongside the bond controls.
    expect(screen.getByRole('button', { name: /set order/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decrease bond opacity/i })).toBeInTheDocument();
  });

  it('label uses singular "atom" and "bond" correctly', () => {
    useStructureStore.setState({ selectedAtoms: [0], selectedBonds: ['0-1'] });
    render(<SelectionActionBar />);
    expect(screen.getByText(/1 atom \+ 1 bond selected/i)).toBeInTheDocument();
  });

  it('label uses plural "bonds" correctly', () => {
    useStructureStore.setState({ selectedAtoms: [], selectedBonds: ['0-1', '1-2'] });
    render(<SelectionActionBar />);
    expect(screen.getByText(/2 bonds selected/i)).toBeInTheDocument();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Size-bump mutation + undo coverage (replaces removed StylePanel tests)
  // ──────────────────────────────────────────────────────────────────────────

  it('increase size button writes radiusOverrides for every selected atom', () => {
    // Seed two selected atoms with no prior radius override (defaults to 1.0).
    useStructureStore.setState({ selectedAtoms: [0, 2], radiusOverrides: null });
    render(<SelectionActionBar />);
    fireEvent.click(screen.getByRole('button', { name: /increase size/i }));
    const overrides = useStructureStore.getState().radiusOverrides;
    // bumpSize(+0.2): currentScale = avg([1.0, 1.0]) = 1.0, next = clamp(1.0+0.2, 0.2, 3) = 1.2
    expect(overrides).not.toBeNull();
    expect(overrides![0]).toBeCloseTo(1.2, 5);
    expect(overrides![2]).toBeCloseTo(1.2, 5);
  });

  it('decrease size button writes radiusOverrides for every selected atom', () => {
    // Start at an existing override of 1.4 so decrease doesn't hit the 0.2 clamp.
    useStructureStore.setState({ selectedAtoms: [1, 3], radiusOverrides: { 1: 1.4, 3: 1.4 } });
    render(<SelectionActionBar />);
    fireEvent.click(screen.getByRole('button', { name: /decrease size/i }));
    const overrides = useStructureStore.getState().radiusOverrides;
    // bumpSize(-0.2): currentScale = avg([1.4, 1.4]) = 1.4, next = clamp(1.4-0.2, 0.2, 3) = 1.2
    expect(overrides![1]).toBeCloseTo(1.2, 5);
    expect(overrides![3]).toBeCloseTo(1.2, 5);
  });

  it('one size bump push exactly one undo frame onto past', () => {
    // pushHistory requires structureData to be non-null to save a frame.
    const minimalStructureData = {
      structure: {
        symbols: ['H', 'O'],
        positions: [[0, 0, 0], [1, 0, 0]],
        cell: [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
        pbc: [false, false, false],
      },
      visualization: { bonds: [], h_bond_geometries: [], unwrapped_h_bonds: [], wrapped_ghost_bonds: [] },
    };
    useStructureStore.setState({
      selectedAtoms: [0, 1],
      radiusOverrides: null,
      structureData: minimalStructureData as never,
      past: [],
      future: [],
    });
    render(<SelectionActionBar />);
    const pastBefore = useStructureStore.getState().past.length;
    fireEvent.click(screen.getByRole('button', { name: /increase size/i }));
    const pastAfter = useStructureStore.getState().past.length;
    expect(pastAfter).toBe(pastBefore + 1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Task 3: no double-notify — bond order/delete success toast is now owned by
// the hook (useBondEdits). SelectionActionBar must NOT emit a second toast.
// ──────────────────────────────────────────────────────────────────────────────
describe('SelectionActionBar — bond notify (Task 3: single toast per action)', () => {
  let notifySpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    useStructureStore.setState({
      selectedAtoms: [],
      selectedBonds: [],
      structureData: null,
      bondOpacityOverrides: null,
      topologyOverrides: {},
      colorOverrides: null,
      opacityOverrides: null,
      radiusOverrides: null,
      perAtomColorOverrides: null,
      perAtomOpacityOverrides: null,
    });
    notifySpy = vi.fn();
    useStructureStore.setState({ notify: notifySpy } as never);
  });

  it('Set order button produces exactly one success toast (from hook, not from SelectionActionBar)', async () => {
    useStructureStore.setState({ selectedAtoms: [], selectedBonds: ['0-1', '1-2'] });
    render(<SelectionActionBar />);

    fireEvent.click(screen.getByRole('button', { name: /set order/i }));

    await waitFor(() => {
      // Exactly one notify call total — the success toast from useBondEdits
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(notifySpy).toHaveBeenCalledWith('Set order for 2 bond(s)', 'success');
    });
  });

  it('Delete bond button produces exactly one success toast (from hook, not from SelectionActionBar)', async () => {
    useStructureStore.setState({ selectedAtoms: [], selectedBonds: ['0-1'] });
    render(<SelectionActionBar />);

    fireEvent.click(screen.getByRole('button', { name: /delete bond/i }));

    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(notifySpy).toHaveBeenCalledWith('Deleted 1 bond(s)', 'success');
    });
  });
});
