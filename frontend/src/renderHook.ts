import React from 'react';
import { useFrame } from '@react-three/fiber';
import { useStructureStore } from './store/useStructureStore';
import { applySceneDocument } from './services/sceneDocument';
import { captureCanvasPng, buildSceneForDoc } from './services/batchExport';
import { exportGlb } from './services/glbExporter';
import { getCaptureHandle } from './services/captureHandle';
import type { ViewControls, VisualizationParams, BackgroundConfig } from './types/store';
import type { SceneDoc } from './services/sceneDocument';

// A monotonically increasing frame counter. The Playwright render driver waits
// for this to advance after loading a structure, which guarantees the WebGL
// canvas has actually drawn (no blank captures).
let frameCount = 0;
export const bumpRenderFrame = (): void => { frameCount += 1; };

// Sits inside <Canvas> (r3f). useFrame fires once per rendered frame.
export const RenderProbe: React.FC = () => {
  useFrame(() => { bumpRenderFrame(); });
  return null;
};

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Install a small, stable scripting surface on window for the headless render
// CLI. Intentionally global (harmless, also handy for debugging). Keep it thin:
// it only forwards to existing store actions / services.
export function installRenderHook(): void {
  if (typeof window === 'undefined') return;
  const store = useStructureStore;
  window.__atomcanvas = {
    version: '1',
    getState: () => store.getState(),
    setStructureData: (doc: Parameters<ReturnType<typeof store.getState>['setStructureData']>[0]) =>
      store.getState().setStructureData(doc),
    setDisplayMode: (mode: 'ball-stick' | 'vdw' | 'wireframe') => store.getState().setDisplayMode(mode),
    setVisParams: (partial: Partial<VisualizationParams>) => store.getState().setVisParams(partial),
    setViewControls: (partial: Partial<ViewControls>) => store.getState().setViewControls(partial),
    setBackground: (partial: Partial<BackgroundConfig>) => store.getState().setBackground(partial),
    setGlobalBrightness: (value: number) => store.getState().setGlobalBrightness(value),
    applyScene: (doc: SceneDoc) => applySceneDocument(doc),
    capturePng: (scale = 1) => captureCanvasPng(scale),
    exportGlbBase64: async (): Promise<string | null> => {
      const s = store.getState();
      if (!s.structureData) return null;
      const scene = buildSceneForDoc(s.structureData, s.activeTabId ?? undefined);
      const buf = await exportGlb(scene);
      return arrayBufferToBase64(buf);
    },
    forceRender: (): boolean => {
      const h = getCaptureHandle();
      if (!h) return false;
      if (h.composer) h.composer.render();
      else h.gl.render(h.scene, h.camera);
      return true;
    },
    frames: () => frameCount,
  };
}

declare global {
  interface Window { __atomcanvas?: Record<string, unknown>; }
}
