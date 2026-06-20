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
      topologyOverrides: { '0-1': 'single' },
      visParams: { bondThreshold: 1.2 },
    });
  });

  it('disables actions with no selection and instructs the user to click in the viewer', () => {
    (useStructureStore as unknown as Mock).mockReturnValue({
      structureData: { structure }, selectedAtoms: [], topologyOverrides: {}, visParams: {},
    });
    render(<BondedTab onSelect={onSelect} operation="replace" />);
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
    expect(screen.getByText(/click an atom in the viewer, then apply/i)).toBeInTheDocument();
  });

  it('labels the action with the active mode so Apply describes what it does', () => {
    render(<BondedTab onSelect={onSelect} operation="add" />);
    expect(screen.getByRole('button', { name: /add to selection/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^apply$/i })).not.toBeInTheDocument();
  });

  it('makes the first-atom truncation explicit when several atoms are selected', () => {
    (useStructureStore as unknown as Mock).mockReturnValue({
      structureData: { structure }, selectedAtoms: [2, 5, 7], topologyOverrides: {}, visParams: {},
    });
    render(<BondedTab onSelect={onSelect} operation="replace" />);
    expect(screen.getByText(/atom 2.*uses the first/i)).toBeInTheDocument();
  });

  it('emits bonded:@0 and forwards indices on Apply', async () => {
    (selectionService.parseExpression as Mock).mockResolvedValue({ indices: [0, 1, 2] });
    render(<BondedTab onSelect={onSelect} operation="replace" />);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    await waitFor(() => {
      expect(selectionService.parseExpression).toHaveBeenCalledWith(
        structure, 'bonded:@0', { '0-1': 'single' }, 1.2,
      );
      expect(onSelect).toHaveBeenCalledWith([0, 1, 2], 'replace', 'bonded:@0', null);
    });
  });
});
