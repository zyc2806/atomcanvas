import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import PercentileTab from './PercentileTab';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';

vi.mock('../../../../store/useStructureStore');
vi.mock('../../../../services/selectionService', () => ({
  selectionService: { parseExpression: vi.fn() },
}));

describe('PercentileTab', () => {
  const onSelect = vi.fn();
  const structure = { symbols: ['C', 'C', 'C'] };
  beforeEach(() => {
    vi.clearAllMocks();
    (useStructureStore as unknown as Mock).mockReturnValue({ structureData: { structure } });
  });

  it('emits pct:z,0,100 (default axis z, 0–100) on Apply', async () => {
    (selectionService.parseExpression as Mock).mockResolvedValue({ indices: [2] });
    render(<PercentileTab onSelect={onSelect} operation="replace" />);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    await waitFor(() => {
      expect(selectionService.parseExpression).toHaveBeenCalledWith(structure, 'pct:z,0,100');
      expect(onSelect).toHaveBeenCalledWith([2], 'replace', 'pct:z,0,100', null);
    });
  });
});
