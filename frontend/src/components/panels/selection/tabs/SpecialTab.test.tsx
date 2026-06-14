import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import SpecialTab from './SpecialTab';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';

vi.mock('../../../../store/useStructureStore');
vi.mock('../../../../services/selectionService', () => ({
  selectionService: { parseExpression: vi.fn() },
}));

describe('SpecialTab', () => {
  const onSelect = vi.fn();
  const structure = { symbols: ['C', 'C', 'C'] };
  beforeEach(() => {
    vi.clearAllMocks();
    (useStructureStore as unknown as Mock).mockReturnValue({ structureData: { structure } });
  });

  it('emits fixed and forwards indices on Replace', async () => {
    (selectionService.parseExpression as Mock).mockResolvedValue({ indices: [0] });
    render(<SpecialTab onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Replace/i }));
    await waitFor(() => {
      expect(selectionService.parseExpression).toHaveBeenCalledWith(structure, 'fixed');
      expect(onSelect).toHaveBeenCalledWith([0], 'replace', 'fixed', null);
    });
  });
});
