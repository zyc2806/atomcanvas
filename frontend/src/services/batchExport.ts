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
import { downloadBlob, uniqueName } from './download';
import { buildSceneDocument, buildStylePreset } from './sceneDocument';
import type { StandardStructureObject } from '../types/store';

// Resolve the document a tab should export: the active tab uses the live
// structureData (it carries the freshest edits), inactive tabs use their snapshot.
function docForTab(tabId: string): StandardStructureObject {
  const s = useStructureStore.getState();
  const tab = s.tabs.find((t) => t.id === tabId)!;
  return tab.id === s.activeTabId ? (s.structureData ?? tab.doc) : tab.doc;
}

function buildSceneForDoc(doc: StandardStructureObject) {
  const s = useStructureStore.getState();
  const symbols = doc.structure.symbols;
  const elementData = getElementData(symbols, s.atomStyles, s.visParams.atomScale);
  return buildExportScene(
    { symbols, positions: doc.structure.positions },
    { bonds: doc.visualization.bonds },
    { elements: s.elements, bondsStyle: s.bondsStyle },
    elementData,
  );
}

// --- glb -------------------------------------------------------------------

export async function exportCurrentGlb(): Promise<void> {
  const s = useStructureStore.getState();
  if (!s.structureData) return;
  const name =
    s.tabs.find((t) => t.id === s.activeTabId)?.name ?? s.presetName ?? 'structure';
  const scene = buildSceneForDoc(s.structureData);
  const buf = await exportGlb(scene);
  downloadBlob(buf, uniqueName(name, 'glb'), 'model/gltf-binary');
}

export async function batchExportGlb(): Promise<void> {
  const tabs = [...useStructureStore.getState().tabs];
  for (const tab of tabs) {
    const doc = docForTab(tab.id);
    const scene = buildSceneForDoc(doc);
    const buf = await exportGlb(scene);
    downloadBlob(buf, uniqueName(tab.name, 'glb'), 'model/gltf-binary');
  }
}

// --- PNG -------------------------------------------------------------------

function captureCanvasPng(): string | null {
  const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
  if (!canvas) return null;
  return canvas.toDataURL('image/png');
}

export function exportCurrentPng(): void {
  const s = useStructureStore.getState();
  const dataUrl = captureCanvasPng();
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

export async function batchExportPng(): Promise<void> {
  const store = useStructureStore.getState();
  const tabs = [...store.tabs];
  const previousActive = store.activeTabId;
  for (const tab of tabs) {
    useStructureStore.getState().switchTab(tab.id);
    // Two RAF ticks let r3f commit the tab switch and paint before capture.
    await nextFrame();
    await nextFrame();
    const dataUrl = captureCanvasPng();
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
