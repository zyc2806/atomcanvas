import { describe, it, expect, beforeEach } from 'vitest';
import { useStructureStore } from '../useStructureStore';

describe('preset slice', () => {
  beforeEach(() => useStructureStore.getState().replacePreset({
    presetName: 'default', elements: {}, bondsStyle: { style: 'cylinder', radius: 0.12, colorMode: 'element-split' },
  }));

  it('setElementStyle merges per-element style', () => {
    useStructureStore.getState().setElementStyle('C', { color: '#222222' });
    useStructureStore.getState().setElementStyle('C', { radiusScale: 0.8 });
    expect(useStructureStore.getState().elements['C']).toEqual({ color: '#222222', radiusScale: 0.8 });
  });

  it('clearElementStyle removes the entry', () => {
    useStructureStore.getState().setElementStyle('C', { color: '#222222' });
    useStructureStore.getState().clearElementStyle('C');
    expect(useStructureStore.getState().elements['C']).toBeUndefined();
  });
});
