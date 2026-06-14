import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import SphereTab from './SphereTab';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';

vi.mock('../../../../store/useStructureStore');
vi.mock('../../../../services/selectionService', () => ({
  selectionService: { parseExpression: vi.fn() },
}));

describe('SphereTab', () => {
  const onSelect = vi.fn();
  const structure = { symbols: ['C', 'C', 'C'] };
  beforeEach(() => {
    vi.clearAllMocks();
    (useStructureStore as unknown as Mock).mockReturnValue({ structureData: { structure } });
  });

  it('emits sphere:@0,5 (default atom mode, radius 5) on Apply', async () => {
    (selectionService.parseExpression as Mock).mockResolvedValue({ indices: [0, 1] });
    render(<SphereTab onSelect={onSelect} operation="replace" />);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    await waitFor(() => {
      expect(selectionService.parseExpression).toHaveBeenCalledWith(structure, 'sphere:@0,5');
      expect(onSelect).toHaveBeenCalledWith([0, 1], 'replace', 'sphere:@0,5', null);
    });
  });
});
