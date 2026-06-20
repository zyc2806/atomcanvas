/**
 * Task 5 TDD test — caption for SphereTab.
 *
 * RED phase: this test must FAIL before the implementation is added.
 *
 * Assert that SphereTab renders a caption describing what sphere selection does.
 */
import { render, screen } from '@testing-library/react';
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

describe('SphereTab — Task 5: caption', () => {
  beforeEach(() => {
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().addTab(doc(), 'w');
  });

  it('renders a caption describing the sphere input format with an example', () => {
    const onSelect = vi.fn();
    render(<SphereTab onSelect={onSelect} operation="replace" />);
    // Caption must describe format (center + radius) with an example, not echo chip hint.
    const captions = screen.getAllByText(/center.*radius|radius.*center/i);
    expect(captions.length).toBeGreaterThan(0);
  });
});
