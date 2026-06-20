/**
 * Batch / single-document export helpers driven from the export menu.
 *
 * glb and PNG exports both honor the live store state. For glb we replicate the
 * viewer's element styling (atomStyles colors + the radii.json * atomScale
 * radius formula) so the exported model matches the viewport; for PNG we capture
 * the live, already-rendered WebGL canvas (the r3f Canvas runs with
 * preserveDrawingBuffer, so toDataURL is valid without a re-render).
 */

import { useStructureStore } from '../store/useStructureStore';
import { buildExportScene, exportGlb, getElementData } from './glbExporter';
import type { ExportOverrides } from './glbExporter';
import { downloadBlob, uniqueName } from './download';
import { buildSceneDocument, buildStylePreset } from './sceneDocument';
import type { StandardStructureObject, StructureState, ElementStyle } from '../types/store';
import { getCaptureHandle } from './captureHandle';
import { Vector2 } from 'three';
import type { PerspectiveCamera } from 'three';

// Resolve the document a tab should export: the active tab uses the live
// structureData (it carries the freshest edits), inactive tabs use their snapshot.
function docForTab(tabId: string): StandardStructureObject {
  const s = useStructureStore.getState();
  const tab = s.tabs.find((t) => t.id === tabId)!;
  return tab.id === s.activeTabId ? (s.structureData ?? tab.doc) : tab.doc;
}

// Resolve the per-atom / per-bond style overrides for a tab. We forward the
// *pure-selection* per-atom maps (perAtomColorOverrides / perAtomOpacityOverrides
// / radiusOverrides). The exporter applies per-element styling separately via the
// per-tab `elements` map resolved in elementsForTab — so an inactive tab exports
// its OWN element styling, exactly like the viewport would when switched to it
// (both are now per-tab; see createTabsSlice). The active tab uses the live store
// maps; an inactive tab uses its own snapshot so one tab's selection overrides
// never leak onto another's geometry. renderStyle is a global view setting;
// bondOpacityOverrides is not snapshotted per-tab, so it applies only to the
// active tab (empty for inactive tabs, never leaked).
function overridesForTab(s: StructureState, tabId?: string): ExportOverrides {
  const renderStyle = s.visParams.renderStyle;
  // showUnitCell is a global view control (like renderStyle), so it applies to
  // every tab's export.
  const showUnitCell = s.viewControls.showUnitCell;
  if (!tabId || tabId === s.activeTabId) {
    return {
      colorOverrides: s.perAtomColorOverrides ?? {},
      opacityOverrides: s.perAtomOpacityOverrides ?? {},
      radiusOverrides: s.radiusOverrides ?? {},
      bondOpacityOverrides: s.bondOpacityOverrides ?? {},
      renderStyle,
      showUnitCell,
    };
  }
  const tab = s.tabs.find((t) => t.id === tabId);
  return {
    colorOverrides: tab?.perAtomColorOverrides ?? {},
    opacityOverrides: tab?.perAtomOpacityOverrides ?? {},
    radiusOverrides: tab?.radiusOverrides ?? {},
    bondOpacityOverrides: {},
    renderStyle,
    showUnitCell,
  };
}

// Resolve the per-element style map for a tab: the active tab uses the live store
// map; an inactive tab uses its own per-tab snapshot, so a batch export of all
// tabs never paints one tab with another's element colors (matches the per-tab
// viewport; see createTabsSlice).
function elementsForTab(s: StructureState, tabId?: string): Record<string, ElementStyle> {
  if (!tabId || tabId === s.activeTabId) return s.elements;
  return s.tabs.find((t) => t.id === tabId)?.elements ?? {};
}

export function buildSceneForDoc(doc: StandardStructureObject, tabId?: string) {
  const s = useStructureStore.getState();
  const symbols = doc.structure.symbols;
  const elementData = getElementData(symbols, s.atomStyles, s.visParams.atomScale);
  // Thread visParams.bondRadius explicitly as the single source of truth for bond
  // sizing. Per-atom color/size/opacity, per-bond opacity, and the render style
  // are forwarded so the glb matches the live, edited scene.
  return buildExportScene(
    { symbols, positions: doc.structure.positions, cell: doc.structure.cell },
    { bonds: doc.visualization.bonds, rings: doc.visualization.rings },
    { elements: elementsForTab(s, tabId), bondsStyle: s.bondsStyle, bondRadius: s.visParams.bondRadius },
    elementData,
    overridesForTab(s, tabId),
  );
}

// --- glb -------------------------------------------------------------------

export async function exportCurrentGlb(): Promise<void> {
  const s = useStructureStore.getState();
  if (!s.structureData) return;
  const name =
    s.tabs.find((t) => t.id === s.activeTabId)?.name ?? s.presetName ?? 'structure';
  const scene = buildSceneForDoc(s.structureData, s.activeTabId ?? undefined);
  const buf = await exportGlb(scene);
  downloadBlob(buf, uniqueName(name, 'glb'), 'model/gltf-binary');
}

export async function batchExportGlb(): Promise<void> {
  const tabs = [...useStructureStore.getState().tabs];
  for (const tab of tabs) {
    const doc = docForTab(tab.id);
    const scene = buildSceneForDoc(doc, tab.id);
    const buf = await exportGlb(scene);
    downloadBlob(buf, uniqueName(tab.name, 'glb'), 'model/gltf-binary');
  }
}

// --- PNG -------------------------------------------------------------------

// Pure, unit-testable: the hi-res capture dimensions in device pixels. CSS size
// is multiplied by the device pixel ratio (so 1x matches the on-screen drawing
// buffer) and then by the resolution scale; both axes are rounded and clamped
// to ≥1 so a degenerate canvas never produces a zero-sized render target.
export function computeCaptureSize(
  cssW: number,
  cssH: number,
  dpr: number,
  scale: number,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(cssW * dpr * scale)),
    height: Math.max(1, Math.round(cssH * dpr * scale)),
  };
}

function isPerspectiveCamera(cam: unknown): cam is PerspectiveCamera {
  return (cam as { isPerspectiveCamera?: boolean })?.isPerspectiveCamera === true;
}

// Capture the viewport as a PNG data URL. `scale` is the resolution multiplier
// (1x/2x/4x). At 1x — and whenever no live capture handle is registered — this
// is the original on-screen toDataURL snapshot, so the export is byte-for-byte
// the legacy behavior. For scale > 1 we temporarily resize the LIVE renderer
// (reusing its clear color/alpha, so transparent background comes for free),
// render one synchronous frame through the real pipeline (the EffectComposer
// when AO is active, else gl.render — so AO is never dropped), capture, then
// restore the on-screen size and repaint. The render→toDataURL pair is
// synchronous (no await/RAF between) so the continuous render loop cannot
// overwrite the drawing buffer before we read it.
export function captureCanvasPng(scale = 1): string | null {
  const handle = getCaptureHandle();
  if (!handle) {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return null;
    return canvas.toDataURL('image/png');
  }

  const { gl, scene, camera, composer } = handle;

  if (scale === 1) {
    // Current behavior: read the already-rendered on-screen drawing buffer.
    return gl.domElement.toDataURL('image/png');
  }

  // Read current CSS size + device pixel ratio so 1x maps to the live buffer.
  const sizeVec = gl.getSize(new Vector2());
  const origW = sizeVec.x;
  const origH = sizeVec.y;
  const origPixelRatio = gl.getPixelRatio();

  let { width, height } = computeCaptureSize(origW, origH, origPixelRatio, scale);

  // Clamp to the GPU's max renderable size so an over-large 4x request degrades
  // gracefully (still proceeds, just at the clamped resolution) instead of
  // producing a black/failed frame.
  const maxSize =
    gl.capabilities?.maxTextureSize ??
    (() => {
      const ctx = gl.getContext();
      return ctx?.getParameter(ctx.MAX_TEXTURE_SIZE) as number | undefined;
    })();
  if (typeof maxSize === 'number' && maxSize > 0) {
    const ratio = Math.min(1, maxSize / width, maxSize / height);
    width  = Math.max(1, Math.round(width  * ratio));
    height = Math.max(1, Math.round(height * ratio));
  }

  const persp = isPerspectiveCamera(camera) ? camera : null;
  const origAspect = persp ? persp.aspect : null;

  try {
    gl.setPixelRatio(1);
    gl.setSize(width, height, false);
    if (persp) {
      persp.aspect = width / height;
      persp.updateProjectionMatrix();
    }
    if (composer) {
      composer.setSize(width, height);
      composer.render();
    } else {
      gl.render(scene, camera);
    }
    return gl.domElement.toDataURL('image/png');
  } finally {
    gl.setPixelRatio(origPixelRatio);
    gl.setSize(origW, origH, false);
    if (persp && origAspect !== null) {
      persp.aspect = origAspect;
      persp.updateProjectionMatrix();
    }
    // Repaint at the restored on-screen size so the next on-screen frame is not
    // left showing the (now mis-sized) hi-res buffer.
    if (composer) {
      composer.setSize(origW, origH);
      composer.render();
    } else {
      gl.render(scene, camera);
    }
  }
}

export function exportCurrentPng(scale = 1): void {
  const s = useStructureStore.getState();
  const dataUrl = captureCanvasPng(scale);
  if (!dataUrl) return;
  const name =
    s.tabs.find((t) => t.id === s.activeTabId)?.name ?? s.presetName ?? 'structure';
  downloadBlob(dataUrlToBlob(dataUrl), uniqueName(name, 'png'), 'image/png');
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(() => resolve(), 0);
    }
  });
}

export async function batchExportPng(scale = 1): Promise<void> {
  const store = useStructureStore.getState();
  const tabs = [...store.tabs];
  const previousActive = store.activeTabId;
  for (const tab of tabs) {
    useStructureStore.getState().switchTab(tab.id);
    // Two RAF ticks let r3f commit the tab switch and paint before capture.
    await nextFrame();
    await nextFrame();
    const dataUrl = captureCanvasPng(scale);
    if (dataUrl) {
      downloadBlob(dataUrlToBlob(dataUrl), uniqueName(tab.name, 'png'), 'image/png');
    }
  }
  if (previousActive) useStructureStore.getState().switchTab(previousActive);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// --- JSON documents --------------------------------------------------------

export function exportSceneJson(): void {
  const sceneDoc = buildSceneDocument(useStructureStore.getState());
  const base = sceneDoc.structures[0]?.name ?? 'scene';
  downloadBlob(
    JSON.stringify(sceneDoc, null, 2),
    uniqueName(base, 'scene.json'),
    'application/json',
  );
}

export function exportStyleJson(): void {
  const styleDoc = buildStylePreset(useStructureStore.getState());
  const base = styleDoc.presetName || 'style';
  downloadBlob(
    JSON.stringify(styleDoc, null, 2),
    uniqueName(base, 'style.json'),
    'application/json',
  );
}
