import type { StateCreator } from 'zustand';
import type { StructureState, TabsSlice, StructureTab } from '../../types/store';

const snapshot = (s: StructureState, tab: StructureTab): StructureTab => ({
  ...tab,
  doc: s.structureData ?? tab.doc,
  bondOverrides: { ...s.topologyOverrides },
  colorOverrides: s.colorOverrides ? { ...s.colorOverrides } : null,
  opacityOverrides: s.opacityOverrides ? { ...s.opacityOverrides } : null,
  radiusOverrides: s.radiusOverrides ? { ...s.radiusOverrides } : null,
  perAtomColorOverrides: s.perAtomColorOverrides ? { ...s.perAtomColorOverrides } : null,
  perAtomOpacityOverrides: s.perAtomOpacityOverrides ? { ...s.perAtomOpacityOverrides } : null,
});

export const createTabsSlice: StateCreator<StructureState, [], [], TabsSlice> = (set, get) => ({
  tabs: [],
  activeTabId: null,
  topologyOverrides: {},

  addTab: (doc, name) => {
    const id = crypto.randomUUID();
    const tab: StructureTab = { id, name, doc, bondOverrides: {}, colorOverrides: null, opacityOverrides: null, radiusOverrides: null, perAtomColorOverrides: null, perAtomOpacityOverrides: null, camera: null };
    set((s) => ({
      tabs: [...s.tabs.map(t => (t.id === s.activeTabId ? snapshot(s, t) : t)), tab],
      activeTabId: id,
      topologyOverrides: {},
      colorOverrides: null,
      opacityOverrides: null,
      radiusOverrides: null,
      perAtomColorOverrides: null,
      perAtomOpacityOverrides: null,
      selectedAtoms: [],
      selectedBonds: [],
    }));
    get().setStructureData(doc);
    return id;
  },

  switchTab: (id) => {
    const s = get();
    const target = s.tabs.find(t => t.id === id);
    if (!target || id === s.activeTabId) return;
    set({
      tabs: s.tabs.map(t => (t.id === s.activeTabId ? snapshot(s, t) : t)),
      activeTabId: id,
      topologyOverrides: { ...target.bondOverrides },
      colorOverrides: target.colorOverrides ? { ...target.colorOverrides } : null,
      opacityOverrides: target.opacityOverrides ? { ...target.opacityOverrides } : null,
      radiusOverrides: target.radiusOverrides ? { ...target.radiusOverrides } : null,
      perAtomColorOverrides: target.perAtomColorOverrides ? { ...target.perAtomColorOverrides } : null,
      perAtomOpacityOverrides: target.perAtomOpacityOverrides ? { ...target.perAtomOpacityOverrides } : null,
      selectedAtoms: [],
      selectedBonds: [],
    });
    get().setStructureData(target.doc);
  },

  closeTab: (id) => {
    const s = get();
    const idx = s.tabs.findIndex(t => t.id === id);
    if (idx < 0) return;
    const tabs = s.tabs.filter(t => t.id !== id);
    if (id !== s.activeTabId) { set({ tabs }); return; }
    const next = tabs[Math.max(0, idx - 1)] ?? null;
    set({ tabs, activeTabId: next?.id ?? null, topologyOverrides: next ? { ...next.bondOverrides } : {} });
    if (next) get().setStructureData(next.doc);
  },

  renameTab: (id, name) => set((s) => ({ tabs: s.tabs.map(t => (t.id === id ? { ...t, name } : t)) })),

  setTopologyOverride: (bondId, value) => set((s) => {
    const next = { ...s.topologyOverrides };
    if (value === null) delete next[bondId]; else next[bondId] = value;
    return { topologyOverrides: next };
  }),

  clearTopologyOverrides: () => set({ topologyOverrides: {} }),
});
