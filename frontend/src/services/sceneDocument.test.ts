import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildStylePreset,
  applyStylePreset,
  buildSceneDocument,
  applySceneDocument,
  parseDocument,
} from './sceneDocument';
import type { StylePresetDoc } from './sceneDocument';
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

  it('build → apply restores element styles and bond radius', () => {
    const st = useStructureStore.getState();
    st.setElementStyle('C', { color: '#101010' });
    // The slider drives visParams.bondRadius — the single source of truth.
    st.setVisParams({ bondRadius: 0.2 });
    const preset = buildStylePreset(useStructureStore.getState());
    expect(preset.kind).toBe('atomcanvas-style');
    useStructureStore.getState().replacePreset({
      presetName: 'x',
      elements: {},
      bondsStyle: { style: 'cylinder', colorMode: 'element-split' },
    });
    applyStylePreset(preset);
    expect(useStructureStore.getState().elements['C']).toEqual({ color: '#101010' });
    // bondRadius round-trips via the top-level StylePresetDoc.bondRadius field.
    expect(useStructureStore.getState().visParams.bondRadius).toBe(0.2);
  });

  it('buildStylePreset serializes visParams.bondRadius as the top-level bondRadius field', () => {
    const st = useStructureStore.getState();
    st.setVisParams({ bondRadius: 0.3 });
    const preset = buildStylePreset(useStructureStore.getState());
    // The source of truth is persisted directly — not inside bondsStyle.
    expect(preset.bondRadius).toBe(0.3);
  });

  it('setDisplayMode + buildStylePreset persists the CURRENT visParams.bondRadius (not a stale mirror)', () => {
    const st = useStructureStore.getState();
    // Start at a non-default radius, then switch to ball-stick, which DOES write
    // bondRadius (=0.08). Before T4-1 this updated visParams.bondRadius but left
    // the bondsStyle.radius mirror stale at 0.15; the preset would have serialized
    // the stale mirror. Now there is no mirror, so the preset must reflect 0.08.
    st.setVisParams({ bondRadius: 0.15 });
    st.setDisplayMode('ball-stick');
    expect(useStructureStore.getState().visParams.bondRadius).toBe(0.08);
    const preset = buildStylePreset(useStructureStore.getState());
    expect(preset.bondRadius).toBe(0.08);
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

  it('applyStylePreset back-compat: old docs without bondRadius fall back to bondsStyle.radius', () => {
    // Simulate an older serialized style document that has bondsStyle.radius but
    // no top-level bondRadius field (pre-T4-1 format).
    const oldPreset = {
      kind: 'atomcanvas-style' as const,
      schemaVersion: 1,
      presetName: 'legacy',
      elements: {},
      bondsStyle: { style: 'cylinder' as const, colorMode: 'element-split' as const },
      // No bondRadius field — old format stored it inside bondsStyle.radius.
      // The (as any) cast below simulates an old doc still carrying that field.
      background: { color: '#000000', transparent: false },
      lighting: { intensity: 1.0 },
    };
    // Inject the old radius via the back-compat path.
    (oldPreset.bondsStyle as Record<string, unknown>).radius = 0.25;
    applyStylePreset(oldPreset as StylePresetDoc);
    expect(useStructureStore.getState().visParams.bondRadius).toBe(0.25);
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

  it('back-compat: loads a scene with the OLD per-tab bondOverrides key into topologyOverrides', () => {
    // Pre-rename scene docs serialized the per-tab topology snapshot under the
    // `bondOverrides` key. Loading one must hydrate the live topologyOverrides.
    const legacyScene = {
      schemaVersion: 1,
      kind: 'atomcanvas-scene' as const,
      structures: [
        {
          name: 'legacy',
          doc: doc(),
          // OLD key — no bondTopologyOverrides field present.
          bondOverrides: { '0-1': 'delete' },
          colorOverrides: null,
          opacityOverrides: null,
          radiusOverrides: null,
        },
      ],
      style: {
        presetName: 'x',
        elements: {},
        bondsStyle: { style: 'cylinder' as const, colorMode: 'element-split' as const },
        bondRadius: 0.08,
        background: { color: '#000000', transparent: false },
        lighting: { intensity: 1.0 },
      },
      camera: null,
      activeIndex: 0,
    } as unknown as Parameters<typeof applySceneDocument>[0];

    applySceneDocument(legacyScene);
    const s = useStructureStore.getState();
    expect(s.tabs[0].bondTopologyOverrides).toEqual({ '0-1': 'delete' });
    expect(s.topologyOverrides).toEqual({ '0-1': 'delete' });
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
