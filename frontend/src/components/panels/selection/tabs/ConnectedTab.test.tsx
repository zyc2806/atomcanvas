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
      topologyOverrides: { '0-1': 'single' },
      visParams: { bondThreshold: 1.2 },
    });
  });

  it('disables actions with no selection and instructs the user to click in the viewer', () => {
    (useStructureStore as unknown as Mock).mockReturnValue({
      structureData: { structure }, selectedAtoms: [], topologyOverrides: {}, visParams: {},
    });
    render(<ConnectedTab onSelect={onSelect} operation="replace" />);
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
    expect(screen.getByText(/click an atom in the viewer, then apply/i)).toBeInTheDocument();
  });

  it('emits connected:@0,@1 and forwards indices on Apply', async () => {
    (selectionService.parseExpression as Mock).mockResolvedValue({ indices: [0, 1, 2] });
    render(<ConnectedTab onSelect={onSelect} operation="replace" />);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    await waitFor(() => {
      expect(selectionService.parseExpression).toHaveBeenCalledWith(
        structure, 'connected:@0,@1', { '0-1': 'single' }, 1.2,
      );
      expect(onSelect).toHaveBeenCalledWith([0, 1, 2], 'replace', 'connected:@0,@1', null);
    });
  });
});
