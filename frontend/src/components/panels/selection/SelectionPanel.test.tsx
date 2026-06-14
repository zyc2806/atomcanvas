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
