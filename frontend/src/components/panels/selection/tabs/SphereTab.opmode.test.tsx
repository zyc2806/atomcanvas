import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStructureStore } from '../../../../store/useStructureStore';

vi.mock('../../../../services/selectionService', () => ({
  selectionService: {
    parseExpression: vi.fn().mockResolvedValue({ indices: [0, 1] }),
    clearCache: vi.fn(),
  },
}));

import SphereTab from './SphereTab';

const doc = () =>
  ({ structure: { symbols: ['O', 'H', 'H'], positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] } }) as never;

describe('SphereTab op-mode prop', () => {
  beforeEach(() => {
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().addTab(doc(), 'w');
  });

  it('renders a single action button, labelled by the active mode, and applies with that operation', async () => {
    const onSelect = vi.fn();
    render(<SphereTab onSelect={onSelect} operation="filter" />);
    expect(screen.queryByRole('button', { name: 'Replace' })).not.toBeInTheDocument();
    // The single action button now reflects the active mode (filter → Intersect).
    fireEvent.click(screen.getByRole('button', { name: /intersect/i }));
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith([0, 1], 'filter', expect.any(String), expect.anything());
    });
  });
});
