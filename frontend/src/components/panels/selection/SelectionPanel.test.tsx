import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
    fireEvent.click(screen.getByRole('button', { name: 'Slab' }));
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
    ['Element', 'Label', 'Position', 'Slab', 'Sphere', 'Bonded', 'Percentile', 'Extend', 'Special', 'Connected']
      .forEach((m) => expect(screen.getByRole('button', { name: m })).toBeInTheDocument());
  });

  it('keeps the expression editor collapsed behind an Advanced disclosure', () => {
    render(<SelectionPanel />);
    expect(screen.getByText(/expression/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Selection Expression')).not.toBeInTheDocument();
  });
});
