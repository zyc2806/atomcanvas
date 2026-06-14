import { describe, it, expect, beforeEach } from 'vitest';
import { useStructureStore } from '../useStructureStore';

const fakeDoc = (name: string) => ({ name, structure: { symbols: ['O','H','H'], positions: [[0,0,0],[0.96,0,0],[-0.24,0.93,0]] } }) as never;

describe('tabs slice', () => {
  beforeEach(() => useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} }));

  it('addTab stores doc, activates it, and pushes structureData', () => {
    const id = useStructureStore.getState().addTab(fakeDoc('a'), 'a');
    const s = useStructureStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.activeTabId).toBe(id);
    expect(s.structureData).toBe(s.tabs[0].doc);
  });

  it('switchTab snapshots overrides into the old tab and restores the new one', () => {
    const st = useStructureStore.getState();
    const a = st.addTab(fakeDoc('a'), 'a');
    const b = useStructureStore.getState().addTab(fakeDoc('b'), 'b');
    useStructureStore.getState().setTopologyOverride('0-1', 'delete');
    useStructureStore.getState().switchTab(a);
    expect(useStructureStore.getState().topologyOverrides).toEqual({});
    const tabB = useStructureStore.getState().tabs.find(t => t.id === b)!;
    expect(tabB.bondOverrides).toEqual({ '0-1': 'delete' });
  });

  it('snapshots and restores radiusOverrides per tab without leaking across tabs', () => {
    const a = useStructureStore.getState().addTab(fakeDoc('a'), 'a');
    const b = useStructureStore.getState().addTab(fakeDoc('b'), 'b');
    // Tab B is active; give it a per-atom size override.
    useStructureStore.getState().setRadiusOverrides({ 0: 1.8 });
    // Switching to A must snapshot B's sizes into B and NOT leak onto A.
    useStructureStore.getState().switchTab(a);
    expect(useStructureStore.getState().radiusOverrides).toBeNull();
    const tabB = useStructureStore.getState().tabs.find((t) => t.id === b)!;
    expect(tabB.radiusOverrides).toEqual({ 0: 1.8 });
    // Switching back to B restores its sizes.
    useStructureStore.getState().switchTab(b);
    expect(useStructureStore.getState().radiusOverrides).toEqual({ 0: 1.8 });
  });

  it('snapshots and restores perAtomColorOverrides per tab without leaking across tabs', () => {
    const a = useStructureStore.getState().addTab(fakeDoc('a'), 'a');
    const b = useStructureStore.getState().addTab(fakeDoc('b'), 'b');
    // Tab B is active; give it a per-atom color override.
    useStructureStore.getState().applySelectionColor([0], '#ff0000');
    // Switching to A must snapshot B's colors into B and NOT leak onto A.
    useStructureStore.getState().switchTab(a);
    expect(useStructureStore.getState().perAtomColorOverrides).toBeNull();
    const tabB = useStructureStore.getState().tabs.find((t) => t.id === b)!;
    expect(tabB.perAtomColorOverrides).toEqual({ 0: '#ff0000' });
    // Switching back to B restores its colors.
    useStructureStore.getState().switchTab(b);
    expect(useStructureStore.getState().perAtomColorOverrides).toEqual({ 0: '#ff0000' });
  });

  it('closeTab of active tab activates a neighbor', () => {
    const a = useStructureStore.getState().addTab(fakeDoc('a'), 'a');
    useStructureStore.getState().addTab(fakeDoc('b'), 'b');
    useStructureStore.getState().closeTab(useStructureStore.getState().activeTabId!);
    expect(useStructureStore.getState().activeTabId).toBe(a);
  });
});
