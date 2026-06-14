import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import BondedTab from './BondedTab';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';

vi.mock('../../../../store/useStructureStore');
vi.mock('../../../../services/selectionService', () => ({
  selectionService: { parseExpression: vi.fn() },
}));

describe('BondedTab', () => {
  const onSelect = vi.fn();
  const structure = { symbols: ['C', 'C', 'C'] };
  beforeEach(() => {
    vi.clearAllMocks();
    (useStructureStore as unknown as Mock).mockReturnValue({
      structureData: { structure },
      selectedAtoms: [0],
      bondOverrides: { '0-1': 'single' },
      visParams: { bondThreshold: 1.2 },
    });
  });

  it('disables actions with no selection', () => {
    (useStructureStore as unknown as Mock).mockReturnValue({
      structureData: { structure }, selectedAtoms: [], bondOverrides: {}, visParams: {},
    });
    render(<BondedTab onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /Replace/i })).toBeDisabled();
  });

  it('emits bonded:@0 and forwards indices on Replace', async () => {
    (selectionService.parseExpression as Mock).mockResolvedValue({ indices: [0, 1, 2] });
    render(<BondedTab onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Replace/i }));
    await waitFor(() => {
      expect(selectionService.parseExpression).toHaveBeenCalledWith(
        structure, 'bonded:@0', { '0-1': 'single' }, 1.2,
      );
      expect(onSelect).toHaveBeenCalledWith([0, 1, 2], 'replace', 'bonded:@0', null);
    });
  });
});
