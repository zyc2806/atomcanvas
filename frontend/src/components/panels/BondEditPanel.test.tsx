import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import BondEditPanel from './BondEditPanel';
import { useStructureStore } from '../../store/useStructureStore';

// refreshTopology hits the backend; stub it so the panel's store-mutation
// behaviour can be tested without a server.
vi.mock('../../services/topologyRefresh', () => ({
  refreshTopology: vi.fn().mockResolvedValue(undefined),
  default: vi.fn().mockResolvedValue(undefined),
}));

const doc = () =>
  ({ structure: { symbols: ['O', 'H', 'H'], positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] } }) as never;

describe('BondEditPanel', () => {
  beforeEach(() => {
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().addTab(doc(), 'w');
    useStructureStore.getState().clearSelection();
  });

  it('renders without the selection expression box (moved to Selection panel)', () => {
    const { container } = render(<BondEditPanel />);
    expect(container.querySelector('[aria-label="Apply Selection"]')).toBeNull();
  });

  it('enables Set order / Delete when a bond is clicked (selectedBonds set)', () => {
    useStructureStore.setState({ selectedBonds: ['0-1'] });
    render(<BondEditPanel />);
    expect(screen.getByRole('button', { name: /set order/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /delete bond/i })).toBeEnabled();
  });

  it('sets the chosen order on every selected bond', async () => {
    useStructureStore.setState({ selectedBonds: ['0-1', '1-2'] });
    render(<BondEditPanel />);
    fireEvent.click(screen.getByRole('button', { name: /set order/i }));
    await waitFor(() => {
      const o = useStructureStore.getState().topologyOverrides;
      expect(o['0-1']).toBe('1.0');
      expect(o['1-2']).toBe('1.0');
    });
  });

  it('deletes every selected bond', async () => {
    useStructureStore.setState({ selectedBonds: ['0-1', '1-2'] });
    render(<BondEditPanel />);
    fireEvent.click(screen.getByRole('button', { name: /delete bond/i }));
    await waitFor(() => {
      const o = useStructureStore.getState().topologyOverrides;
      expect(o['0-1']).toBe('delete');
      expect(o['1-2']).toBe('delete');
    });
  });

  it('falls back to the two-atom pair when no bond is clicked (create/edit)', async () => {
    useStructureStore.setState({ selectedAtoms: [0, 1], selectedBonds: [] });
    render(<BondEditPanel />);
    fireEvent.click(screen.getByRole('button', { name: /set order/i }));
    await waitFor(() => {
      expect(useStructureStore.getState().topologyOverrides['0-1']).toBe('1.0');
    });
  });

  it('shows guidance and disables nothing-to-act-on when selection is empty', () => {
    render(<BondEditPanel />);
    expect(screen.queryByRole('button', { name: /set order/i })).toBeNull();
    expect(screen.getByText(/click a bond/i)).toBeInTheDocument();
  });
});
