/**
 * Module-scoped registry that bridges the live r3f render objects (renderer,
 * scene, camera, and the active EffectComposer) out to the imperative PNG export
 * service in batchExport.ts. The export service has no React context, so a
 * `CaptureRegistrar` child mounted inside <Canvas> publishes the live objects
 * here via useThree(); the exporter reads them to render one synchronous hi-res
 * frame through the real pipeline (preserving AO + transparent background) and
 * then restores the on-screen size.
 *
 * `composer` is the @react-three/postprocessing EffectComposer instance (which
 * exposes .render() and .setSize(w, h)) when the post-pass is mounted, and null
 * otherwise — letting the exporter choose composer.render() vs gl.render().
 */

import type { WebGLRenderer, Scene, Camera } from 'three';

export interface CaptureHandle {
  gl: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  composer?: { render: () => void; setSize: (w: number, h: number) => void } | null;
}

let current: CaptureHandle | null = null;

export const setCaptureHandle = (h: CaptureHandle | null) => {
  current = h;
};

export const getCaptureHandle = () => current;
