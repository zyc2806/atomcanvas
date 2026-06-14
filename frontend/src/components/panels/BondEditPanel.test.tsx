import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import BondEditPanel from './BondEditPanel';
import { useStructureStore } from '../../store/useStructureStore';

const doc = () =>
  ({ structure: { symbols: ['O', 'H', 'H'], positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] } }) as never;

describe('BondEditPanel', () => {
  beforeEach(() => {
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().addTab(doc(), 'w');
  });

  it('renders without the selection expression box (moved to Selection panel)', () => {
    const { container } = render(<BondEditPanel />);
    expect(container.querySelector('[aria-label="Apply Selection"]')).toBeNull();
  });
});
