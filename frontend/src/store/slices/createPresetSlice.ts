import type { StateCreator } from 'zustand';
import type { StructureState, PresetSlice } from '../../types/store';

export const createPresetSlice: StateCreator<StructureState, [], [], PresetSlice> = (set) => ({
  presetName: 'default',
  elements: {},
  // Default matches visParams.bondRadius (the field the viewport actually reads)
  // so a fresh structure renders bonds at the size the panel reports.
  bondsStyle: { style: 'cylinder', radius: 0.08, colorMode: 'element-split' },

  setElementStyle: (symbol, style) => set((s) => ({
    elements: { ...s.elements, [symbol]: { ...s.elements[symbol], ...style } },
  })),
  clearElementStyle: (symbol) => set((s) => {
    const next = { ...s.elements };
    delete next[symbol];
    return { elements: next };
  }),
  setBondsStyle: (b) => set((s) => ({ bondsStyle: { ...s.bondsStyle, ...b } })),
  setPresetName: (presetName) => set({ presetName }),
  replacePreset: (p) => set({ presetName: p.presetName, elements: p.elements, bondsStyle: p.bondsStyle }),
});
