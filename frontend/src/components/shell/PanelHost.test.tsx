import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { PanelHost } from './PanelHost';
import { useStructureStore } from '../../store/useStructureStore';

const doc = () =>
  ({ structure: { symbols: ['O', 'H', 'H'], positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] } }) as never;

describe('PanelHost', () => {
  beforeEach(() => {
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().addTab(doc(), 'w');
  });

  it('renders the Selection panel when activePanel is "selection"', async () => {
    render(<PanelHost activePanel="selection" onClose={() => {}} />);
    expect(await screen.findByText(/atoms selected/)).toBeInTheDocument();
  });
});
