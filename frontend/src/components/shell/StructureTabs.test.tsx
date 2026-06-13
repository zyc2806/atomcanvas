import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StructureTabs } from './StructureTabs';
import { useStructureStore } from '../../store/useStructureStore';

const fakeDoc = () => ({ structure: { symbols: ['O'], positions: [[0, 0, 0]] } }) as never;

describe('StructureTabs', () => {
  beforeEach(() => useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} }));

  it('renders a chip per tab and switches on click', () => {
    const a = useStructureStore.getState().addTab(fakeDoc(), 'water');
    useStructureStore.getState().addTab(fakeDoc(), 'slab');
    render(<StructureTabs />);
    fireEvent.click(screen.getByText('water'));
    expect(useStructureStore.getState().activeTabId).toBe(a);
  });
});
