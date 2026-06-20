import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import ExtendTab from './ExtendTab';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';

vi.mock('../../../../store/useStructureStore');
vi.mock('../../../../services/selectionService', () => ({
  selectionService: { parseExpression: vi.fn() },
}));

describe('ExtendTab', () => {
  const onSelect = vi.fn();
  const structure = { symbols: ['C', 'C', 'C'] };
  beforeEach(() => {
    vi.clearAllMocks();
    (useStructureStore as unknown as Mock).mockReturnValue({
      structureData: { structure },
      selectedAtoms: [0],
      topologyOverrides: { '0-1': 'single' },
      visParams: { bondThreshold: 1.2 },
    });
  });

  it('disables actions with no selection and instructs the user to click in the viewer', () => {
    (useStructureStore as unknown as Mock).mockReturnValue({
      structureData: { structure }, selectedAtoms: [], topologyOverrides: {}, visParams: {},
    });
    render(<ExtendTab onSelect={onSelect} operation="replace" />);
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
    expect(screen.getByText(/click an atom in the viewer, then apply/i)).toBeInTheDocument();
  });

  it('emits extend:@0;1 (default 1 hop) and forwards indices on Apply', async () => {
    (selectionService.parseExpression as Mock).mockResolvedValue({ indices: [0, 1] });
    render(<ExtendTab onSelect={onSelect} operation="replace" />);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    await waitFor(() => {
      expect(selectionService.parseExpression).toHaveBeenCalledWith(
        structure, 'extend:@0;1', { '0-1': 'single' }, 1.2,
      );
      expect(onSelect).toHaveBeenCalledWith([0, 1], 'replace', 'extend:@0;1', null);
    });
  });
});
