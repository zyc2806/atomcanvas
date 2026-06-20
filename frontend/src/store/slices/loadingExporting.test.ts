/**
 * Tests for loading (DataSlice) and exporting (UISlice) flags introduced in T4-8.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStructureStore } from '../useStructureStore';
import type { StandardStructureObject } from '../../types/store';

const makeDoc = (): StandardStructureObject => ({
  structure: {
    symbols: ['O'],
    positions: [[0, 0, 0]],
    wrapped_positions: [[0, 0, 0]],
  },
  visualization: {
    bonds: [],
    wrapped_ghost_bonds: [],
    h_bond_geometries: [],
    unwrapped_h_bonds: [],
  },
});

describe('DataSlice — loading flag', () => {
  beforeEach(() => {
    useStructureStore.setState({ loading: false });
  });

  it('setLoading(true) sets loading to true', () => {
    useStructureStore.getState().setLoading(true);
    expect(useStructureStore.getState().loading).toBe(true);
  });

  it('setLoading(false) sets loading to false', () => {
    useStructureStore.setState({ loading: true });
    useStructureStore.getState().setLoading(false);
    expect(useStructureStore.getState().loading).toBe(false);
  });

  it('setStructureData clears loading to false', () => {
    useStructureStore.setState({ loading: true });
    useStructureStore.getState().setStructureData(makeDoc());
    expect(useStructureStore.getState().loading).toBe(false);
  });
});

describe('UISlice — exporting flag', () => {
  beforeEach(() => {
    useStructureStore.setState({ exporting: false });
  });

  it('setExporting(true) sets exporting to true', () => {
    useStructureStore.getState().setExporting(true);
    expect(useStructureStore.getState().exporting).toBe(true);
  });

  it('setExporting(false) sets exporting to false', () => {
    useStructureStore.setState({ exporting: true });
    useStructureStore.getState().setExporting(false);
    expect(useStructureStore.getState().exporting).toBe(false);
  });

});
