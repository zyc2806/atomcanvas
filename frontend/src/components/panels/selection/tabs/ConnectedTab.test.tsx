import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import ConnectedTab from './ConnectedTab';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';

vi.mock('../../../../store/useStructureStore');
vi.mock('../../../../services/selectionService', () => ({
  selectionService: { parseExpression: vi.fn() },
}));

describe('ConnectedTab', () => {
  const onSelect = vi.fn();
  const structure = { symbols: ['C', 'C'] };
  beforeEach(() => {
    vi.clearAllMocks();
    (useStructureStore as unknown as Mock).mockReturnValue({
      structureData: { structure },
      selectedAtoms: [0, 1],
      bondOverrides: { '0-1': 'single' },
      visParams: { bondThreshold: 1.2 },
    });
  });

  it('disables actions with no selection', () => {
    (useStructureStore as unknown as Mock).mockReturnValue({
      structureData: { structure }, selectedAtoms: [], bondOverrides: {}, visParams: {},
    });
    render(<ConnectedTab onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /Replace/i })).toBeDisabled();
  });

  it('emits connected:@0,@1 and forwards indices on Replace', async () => {
    (selectionService.parseExpression as Mock).mockResolvedValue({ indices: [0, 1, 2] });
    render(<ConnectedTab onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Replace/i }));
    await waitFor(() => {
      expect(selectionService.parseExpression).toHaveBeenCalledWith(
        structure, 'connected:@0,@1', { '0-1': 'single' }, 1.2,
      );
      expect(onSelect).toHaveBeenCalledWith([0, 1, 2], 'replace', 'connected:@0,@1', null);
    });
  });
});
