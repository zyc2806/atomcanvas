import { describe, it, expect, beforeEach } from 'vitest';
import { useStructureStore } from '../useStructureStore';

describe('selection styling actions', () => {
  beforeEach(() => useStructureStore.setState({
    colorOverrides: null, opacityOverrides: null, radiusOverrides: null,
    perAtomColorOverrides: null, perAtomOpacityOverrides: null,
  }));

  it('applySelectionColor merges into both perAtom and visible colorOverrides', () => {
    useStructureStore.getState().applySelectionColor([0, 2], '#ff0000');
    expect(useStructureStore.getState().perAtomColorOverrides).toEqual({ 0: '#ff0000', 2: '#ff0000' });
    expect(useStructureStore.getState().colorOverrides).toMatchObject({ 0: '#ff0000', 2: '#ff0000' });
  });

  it('applySelectionSize writes radiusOverrides for selected indices', () => {
    useStructureStore.getState().applySelectionSize([1], 1.8);
    expect(useStructureStore.getState().radiusOverrides).toMatchObject({ 1: 1.8 });
  });

  it('toggleSelectionHidden hides then shows (opacity 0 then removed)', () => {
    useStructureStore.getState().toggleSelectionHidden([0]);
    expect(useStructureStore.getState().opacityOverrides).toMatchObject({ 0: 0 });
    useStructureStore.getState().toggleSelectionHidden([0]);
    expect(useStructureStore.getState().opacityOverrides?.[0]).toBeUndefined();
  });

  it('setSelectionMode(non-slab) preserves per-atom color/opacity/size, not slab coloring', () => {
    useStructureStore.getState().applySelectionColor([0], '#ff0000');
    useStructureStore.getState().applySelectionSize([0], 1.5);
    useStructureStore.getState().toggleSelectionHidden([1]); // hide atom 1
    useStructureStore.getState().setSelectionMode('disabled');
    expect(useStructureStore.getState().colorOverrides).toMatchObject({ 0: '#ff0000' });
    expect(useStructureStore.getState().opacityOverrides).toMatchObject({ 1: 0 });
    expect(useStructureStore.getState().radiusOverrides).toMatchObject({ 0: 1.5 });
  });
});
