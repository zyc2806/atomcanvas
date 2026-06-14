import { describe, it, expect, beforeEach } from 'vitest';
import { useStructureStore } from '../../store/useStructureStore';

describe('floating-bar color survives element restyle', () => {
  beforeEach(() => useStructureStore.setState({
    selectedAtoms: [0], colorOverrides: null, perAtomColorOverrides: null,
  }));

  it('perAtomColorOverrides persists so StylePanel re-merge keeps the color', () => {
    useStructureStore.getState().applySelectionColor([0], '#abcdef');
    // Simulate StylePanel element-restyle merge: element colors + perAtom truth.
    const elColors = { 0: '#000000', 1: '#000000' };
    const merged = { ...elColors, ...(useStructureStore.getState().perAtomColorOverrides ?? {}) };
    expect(merged[0]).toBe('#abcdef'); // per-atom wins
  });
});
