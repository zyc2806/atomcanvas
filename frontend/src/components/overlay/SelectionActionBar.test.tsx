import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SelectionActionBar } from './SelectionActionBar';
import { useStructureStore } from '../../store/useStructureStore';

// refreshTopology hits the backend; stub it so the bar's store-mutation
// behaviour can be tested without a server.
vi.mock('../../services/topologyRefresh', () => ({
  refreshTopology: vi.fn().mockResolvedValue(undefined),
  default: vi.fn().mockResolvedValue(undefined),
}));

describe('SelectionActionBar', () => {
  beforeEach(() => useStructureStore.setState({
    selectedAtoms: [],
    selectedBonds: [],
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
});
