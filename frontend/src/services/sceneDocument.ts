import type {
  StructureState,
  StylePresetState,
  StructureTab,
  CameraSnapshot,
} from '../types/store';
import { useStructureStore } from '../store/useStructureStore';

export const SCHEMA_VERSION = 1;

export interface StylePresetDoc extends StylePresetState {
  schemaVersion: number;
  kind: 'atomcanvas-style';
  background: { color: string; transparent: boolean };
  lighting: { intensity: number };
}

export interface SceneDoc {
  schemaVersion: number;
  kind: 'atomcanvas-scene';
  structures: Array<
    Pick<
      StructureTab,
      'name' | 'doc' | 'bondOverrides' | 'colorOverrides' | 'opacityOverrides' | 'radiusOverrides'
    >
  >;
  style: Omit<StylePresetDoc, 'kind' | 'schemaVersion'>;
  camera: CameraSnapshot | null;
  activeIndex: number;
}

// --- Adapters over the real scene/UI store fields ---------------------------
// Background lives in sceneSettings.background.solidColor; the viewer paints a
// solid color unless forceTransparentBackground is set on the view controls.
function readBackground(s: StructureState): { color: string; transparent: boolean } {
  return {
    color: s.sceneSettings.background.solidColor,
    transparent: Boolean(s.viewControls.forceTransparentBackground),
  };
}

function writeBackground(bg: { color: string; transparent: boolean }): void {
  const st = useStructureStore.getState();
  st.setBackground({ type: 'solid', solidColor: bg.color });
  st.setViewControls({ forceTransparentBackground: bg.transparent });
}

// "Lighting intensity" maps onto the global brightness scalar (0..2).
function readLighting(s: StructureState): { intensity: number } {
  return { intensity: s.sceneSettings.globalBrightness };
}

function writeLighting(light: { intensity: number }): void {
  useStructureStore.getState().setGlobalBrightness(light.intensity);
}

// Camera is captured as a CameraSnapshot (the same shape applyCameraSnapshot
// consumes), assembled from cameraType + viewTarget + cameraState.
function readCamera(s: StructureState): CameraSnapshot | null {
  if (!s.cameraState) return null;
  return {
    type: s.cameraType,
    target: s.viewTarget ? ([...s.viewTarget] as [number, number, number]) : [0, 0, 0],
    state: {
      position: [...s.cameraState.position] as [number, number, number],
      up: s.cameraState.up ? ([...s.cameraState.up] as [number, number, number]) : undefined,
      zoom: s.cameraState.zoom,
    },
  };
}

function writeCamera(camera: CameraSnapshot): void {
  useStructureStore.getState().applyCameraSnapshot(camera);
}

// --- Style preset (style.json) ----------------------------------------------
export function buildStylePreset(s: StructureState): StylePresetDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'atomcanvas-style',
    presetName: s.presetName,
    elements: s.elements,
    // visParams.bondRadius is the rendering source of truth; bondsStyle.radius is
    // only a mirror and can go stale (e.g. setDisplayMode writes bondRadius alone),
    // so persist the source of truth — matching the same substitution batchExport uses.
    bondsStyle: { ...s.bondsStyle, radius: s.visParams.bondRadius },
    background: readBackground(s),
    lighting: readLighting(s),
  };
}

export function applyStylePreset(p: StylePresetDoc): void {
  const st = useStructureStore.getState();
  st.replacePreset({ presetName: p.presetName, elements: p.elements, bondsStyle: p.bondsStyle });
  // The viewport sizes bonds from visParams.bondRadius, not bondsStyle.radius,
  // so mirror the saved radius onto it or the loaded preset would not take effect.
  st.setVisParams({ bondRadius: p.bondsStyle.radius });
  writeBackground(p.background);
  writeLighting(p.lighting);
}

// --- Scene document (scene.json) --------------------------------------------
export function buildSceneDocument(s: StructureState): SceneDoc {
  // Fold the active tab's live overrides back into its snapshot so every tab
  // carries an up-to-date copy of its edits.
  const tabs = s.tabs.map((t) =>
    t.id === s.activeTabId
      ? {
          ...t,
          bondOverrides: { ...s.topologyOverrides },
          colorOverrides: s.colorOverrides,
          opacityOverrides: s.opacityOverrides,
          radiusOverrides: s.radiusOverrides,
          doc: s.structureData ?? t.doc,
        }
      : t,
  );
  const { kind: _k, schemaVersion: _v, ...style } = buildStylePreset(s);
  void _k;
  void _v;
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'atomcanvas-scene',
    structures: tabs.map(({ name, doc, bondOverrides, colorOverrides, opacityOverrides, radiusOverrides }) => ({
      name,
      doc,
      bondOverrides,
      colorOverrides,
      opacityOverrides,
      radiusOverrides,
    })),
    style,
    camera: readCamera(s),
    activeIndex: Math.max(
      0,
      tabs.findIndex((t) => t.id === s.activeTabId),
    ),
  };
}

export function applySceneDocument(scene: SceneDoc): void {
  useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });

  scene.structures.forEach((entry) => {
    useStructureStore.getState().addTab(entry.doc, entry.name);
    const id = useStructureStore.getState().activeTabId!;
    useStructureStore.setState((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              bondOverrides: entry.bondOverrides,
              colorOverrides: entry.colorOverrides,
              opacityOverrides: entry.opacityOverrides,
              // Older scene files (pre-size-override) lack this field.
              radiusOverrides: entry.radiusOverrides ?? null,
            }
          : t,
      ),
    }));
  });

  const target = useStructureStore.getState().tabs[scene.activeIndex];
  if (target) {
    // switchTab is a no-op when target is already active (single tab / last
    // added). Either way we hydrate the live override fields from the active
    // tab so the viewer reflects the restored edits immediately.
    useStructureStore.getState().switchTab(target.id);
    useStructureStore.setState({
      activeTabId: target.id,
      topologyOverrides: { ...target.bondOverrides },
      colorOverrides: target.colorOverrides ? { ...target.colorOverrides } : null,
      opacityOverrides: target.opacityOverrides ? { ...target.opacityOverrides } : null,
      radiusOverrides: target.radiusOverrides ? { ...target.radiusOverrides } : null,
    });
    useStructureStore.getState().setStructureData(target.doc);
  }

  applyStylePreset({
    ...scene.style,
    kind: 'atomcanvas-style',
    schemaVersion: scene.schemaVersion,
  });
  if (scene.camera) writeCamera(scene.camera);
}

// --- Validation -------------------------------------------------------------
// All-or-nothing gate: reject unknown kinds and schemaVersions newer than this
// build understands.
export function parseDocument(json: string): StylePresetDoc | SceneDoc {
  const obj = JSON.parse(json);
  if (obj.kind !== 'atomcanvas-style' && obj.kind !== 'atomcanvas-scene') {
    throw new Error(`Unsupported document kind: ${obj.kind}`);
  }
  if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`Unsupported schemaVersion: ${obj.schemaVersion}`);
  }
  return obj as StylePresetDoc | SceneDoc;
}
