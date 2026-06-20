import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bondService } from './bondService';
import apiClient from './apiClient';
import type { Structure } from '../types/store';

vi.mock('./apiClient', () => ({ default: { post: vi.fn() } }));
const mockedPost = vi.mocked(apiClient.post);

const makeStructure = (): Structure => ({
  symbols: ['H', 'O'],
  positions: [[0, 0, 0], [0, 0, 0.96]],
  wrapped_positions: [[0, 0, 0], [0, 0, 0.96]],
  cell: [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
  pbc: [true, true, true],
});

const makeDoc = () => ({
  structure: makeStructure(),
  visualization: {
    bonds: [],
    wrapped_ghost_bonds: [],
    h_bond_geometries: [],
    unwrapped_h_bonds: [],
  },
});

describe('bondService.translateStructure', () => {
  beforeEach(() => mockedPost.mockReset());

  it('POSTs /edit/translate_structure with the expected body and returns .data', async () => {
    const doc = makeDoc();
    mockedPost.mockResolvedValueOnce({ data: doc });
    const structure = makeStructure();

    const result = await bondService.translateStructure(structure, [1, 2, 3], 'lattice', true);

    expect(mockedPost).toHaveBeenCalledWith('/edit/translate_structure', {
      structure,
      translation_vector: [1, 2, 3],
      vector_type: 'lattice',
      wrap: true,
    });
    expect(result).toBe(doc);
  });
});

describe('bondService.buildSupercell', () => {
  beforeEach(() => mockedPost.mockReset());

  it('POSTs /edit/supercell with the expected body and returns .data', async () => {
    const doc = makeDoc();
    mockedPost.mockResolvedValueOnce({ data: doc });
    const structure = makeStructure();

    const result = await bondService.buildSupercell(structure, [2, 2, 1]);

    expect(mockedPost).toHaveBeenCalledWith('/edit/supercell', {
      structure,
      repetitions: [2, 2, 1],
    });
    expect(result).toBe(doc);
  });
});
