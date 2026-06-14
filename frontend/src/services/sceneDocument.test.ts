import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildStylePreset,
  applyStylePreset,
  buildSceneDocument,
  applySceneDocument,
  parseDocument,
} from './sceneDocument';
import { useStructureStore } from '../store/useStructureStore';

const doc = () =>
  ({
    structure: {
      symbols: ['O', 'H', 'H'],
      positions: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
    },
  }) as never;

describe('style preset round-trip', () => {
  beforeEach(() => useStructureStore.setState({ tabs: [], activeTabId: null }));

  it('build → apply restores element styles and bond style', () => {
    const st = useStructureStore.getState();
    st.setElementStyle('C', { color: '#101010' });
    // The slider drives visParams.bondRadius (source of truth) + the mirror.
    st.setVisParams({ bondRadius: 0.2 });
    st.setBondsStyle({ radius: 0.2 });
    const preset = buildStylePreset(useStructureStore.getState());
    expect(preset.kind).toBe('atomcanvas-style');
    useStructureStore.getState().replacePreset({
      presetName: 'x',
      elements: {},
      bondsStyle: { style: 'cylinder', radius: 0.12, colorMode: 'element-split' },
    });
    applyStylePreset(preset);
    expect(useStructureStore.getState().elements['C']).toEqual({ color: '#101010' });
    expect(useStructureStore.getState().bondsStyle.radius).toBe(0.2);
  });

  it('buildStylePreset serializes visParams.bondRadius (source of truth), not a stale mirror', () => {
    const st = useStructureStore.getState();
    st.setVisParams({ bondRadius: 0.3 });
    // Diverge the bondsStyle.radius mirror, as setDisplayMode would, to prove the
    // source of truth is what gets persisted.
    st.setBondsStyle({ radius: 0.1 });
    const preset = buildStylePreset(useStructureStore.getState());
    expect(preset.bondsStyle.radius).toBe(0.3);
  });

  it('applyStylePreset hydrates visParams.bondRadius from the saved bond radius', () => {
    const st = useStructureStore.getState();
    st.setVisParams({ bondRadius: 0.2 });
    const preset = buildStylePreset(useStructureStore.getState());
    // Diverge the live viewport radius from the saved one before re-applying.
    st.setVisParams({ bondRadius: 0.08 });
    applyStylePreset(preset);
    // The viewport reads visParams.bondRadius, so loading a preset must hydrate it.
    expect(useStructureStore.getState().visParams.bondRadius).toBe(0.2);
  });

  it('round-trips background and lighting through the scene store', () => {
    const st = useStructureStore.getState();
    st.setBackground({ type: 'solid', solidColor: '#abcdef' });
    st.setGlobalBrightness(1.5);
    const preset = buildStylePreset(useStructureStore.getState());
    expect(preset.background.color).toBe('#abcdef');
    expect(preset.lighting.intensity).toBe(1.5);
    st.setBackground({ type: 'solid', solidColor: '#000000' });
    st.setGlobalBrightness(1.0);
    applyStylePreset(preset);
    expect(useStructureStore.getState().sceneSettings.background.solidColor).toBe('#abcdef');
    expect(useStructureStore.getState().sceneSettings.globalBrightness).toBe(1.5);
  });
});

describe('scene document round-trip', () => {
  beforeEach(() => useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} }));

  it('captures structures + overrides and restores them', () => {
    useStructureStore.getState().addTab(doc(), 'w1');
    useStructureStore.getState().setTopologyOverride('0-1', 'delete');
    const scene = buildSceneDocument(useStructureStore.getState());
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    applySceneDocument(scene);
    const s = useStructureStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].name).toBe('w1');
    expect(s.topologyOverrides).toEqual({ '0-1': 'delete' });
  });

  it('persists per-atom radiusOverrides through a scene round-trip', () => {
    useStructureStore.getState().addTab(doc(), 'w1');
    useStructureStore.getState().setRadiusOverrides({ 0: 1.7 });
    const scene = buildSceneDocument(useStructureStore.getState());
    useStructureStore.setState({
      tabs: [],
      activeTabId: null,
      topologyOverrides: {},
      radiusOverrides: null,
    });
    applySceneDocument(scene);
    expect(useStructureStore.getState().radiusOverrides).toEqual({ 0: 1.7 });
  });

  it('restores multiple tabs and the active index', () => {
    useStructureStore.getState().addTab(doc(), 'w1');
    useStructureStore.getState().addTab(doc(), 'w2');
    useStructureStore.getState().setTopologyOverride('1-2', 'delete');
    const scene = buildSceneDocument(useStructureStore.getState());
    expect(scene.structures).toHaveLength(2);
    expect(scene.activeIndex).toBe(1);
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    applySceneDocument(scene);
    const s = useStructureStore.getState();
    expect(s.tabs.map((t) => t.name)).toEqual(['w1', 'w2']);
    expect(s.tabs[1].id).toBe(s.activeTabId);
    expect(s.topologyOverrides).toEqual({ '1-2': 'delete' });
  });
});

describe('parseDocument validation', () => {
  it('rejects unknown kind', () => {
    expect(() => parseDocument(JSON.stringify({ kind: 'nope', schemaVersion: 1 }))).toThrow(/kind/);
  });
  it('rejects newer schemaVersion', () => {
    expect(() =>
      parseDocument(JSON.stringify({ kind: 'atomcanvas-style', schemaVersion: 99 })),
    ).toThrow(/schemaVersion/);
  });
  it('accepts a current style document', () => {
    const parsed = parseDocument(
      JSON.stringify({ kind: 'atomcanvas-style', schemaVersion: 1, elements: {} }),
    );
    expect(parsed.kind).toBe('atomcanvas-style');
  });
});
