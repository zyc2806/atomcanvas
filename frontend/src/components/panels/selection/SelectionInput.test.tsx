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
});
