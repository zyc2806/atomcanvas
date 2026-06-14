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
