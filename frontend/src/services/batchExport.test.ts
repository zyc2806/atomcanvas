import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { batchExportGlb, buildSceneForDoc, computeCaptureSize, captureCanvasPng } from './batchExport';
import { setCaptureHandle } from './captureHandle';
import type { CaptureHandle } from './captureHandle';
import { useStructureStore } from '../store/useStructureStore';
import * as dl from './download';

vi.mock('./glbExporter', async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  exportGlb: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
}));

const doc = () =>
  ({
    structure: { symbols: ['O'], positions: [[0, 0, 0]] },
    visualization: { bonds: [] },
  }) as never;

describe('batchExportGlb', () => {
  beforeEach(() => {
    useStructureStore.setState({ tabs: [], activeTabId: null });
    dl.resetUniqueNames();
  });

  it('emits one download per tab named after the tab', async () => {
    const spy = vi.spyOn(dl, 'downloadBlob').mockImplementation(() => {});
    useStructureStore.getState().addTab(doc(), 'water');
    useStructureStore.getState().addTab(doc(), 'slab');
    await batchExportGlb();
    const names = spy.mock.calls.map((c) => c[1]);
    expect(names).toEqual(['water.glb', 'slab.glb']);
    spy.mockRestore();
  });
});

// The viewport (Bonds.tsx) renders bonds at visParams.bondRadius, NOT at the
// StylePanel-driven bondsStyle.radius. For the exported glb to match the view,
// buildSceneForDoc must size bond geometry from visParams.bondRadius.
describe('buildSceneForDoc bond radius source', () => {
  const doubleBondDoc = () =>
    ({
      structure: { symbols: ['C', 'C'], positions: [[0, 0, 0], [1.5, 0, 0]] },
      visualization: { bonds: [[0, 1, 2]], rings: [] },
    }) as never;

  // Perpendicular extent of the bond geometry (the double-bond split widens this).
  function bondPerpExtent(scene: THREE.Scene): number {
    const bonds = scene.getObjectByName('bonds');
    if (!bonds) return 0;
    const box = new THREE.Box3();
    bonds.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) {
        m.geometry.computeBoundingBox();
        box.union(m.geometry.boundingBox!);
      }
    });
    return Math.max(box.max.y - box.min.y, box.max.z - box.min.z);
  }

  function sceneWith(bondRadius: number): THREE.Scene {
    const vp = useStructureStore.getState().visParams;
    useStructureStore.setState({
      visParams: { ...vp, bondRadius, atomScale: 1 },
      bondsStyle: { style: 'cylinder', colorMode: 'uniform' },
      elements: {},
      atomStyles: {},
    });
    return buildSceneForDoc(doubleBondDoc());
  }

  it('sizes bond geometry from visParams.bondRadius (the single source of truth)', () => {
    // bondsStyle no longer carries a radius field; buildSceneForDoc threads
    // visParams.bondRadius directly into the exporter.
    const base = bondPerpExtent(sceneWith(0.08));
    const wider = bondPerpExtent(sceneWith(0.2));
    expect(wider).toBeGreaterThan(base + 1e-3);
  });

  it('honors visParams.bondRadius — increasing it widens the double-bond split', () => {
    const base = bondPerpExtent(sceneWith(0.08));
    const wider = bondPerpExtent(sceneWith(0.2));
    expect(wider).toBeGreaterThan(base + 1e-3);
  });
});

// "Show unit cell" must reach the exported glb (issue #4): the toggle is a
// global view control and the cell comes from the document.
describe('buildSceneForDoc unit cell forwarding', () => {
  const cellDoc = () =>
    ({
      structure: {
        symbols: ['O'],
        positions: [[0, 0, 0]],
        cell: [
          [3, 0, 0],
          [0, 3, 0],
          [0, 0, 3],
        ],
      },
      visualization: { bonds: [], rings: [] },
    }) as never;

  beforeEach(() => {
    useStructureStore.setState({ tabs: [], activeTabId: null, elements: {}, atomStyles: {} });
  });

  it('forwards the live showUnitCell control and the document cell into the glb', () => {
    const vc = useStructureStore.getState().viewControls;
    useStructureStore.setState({ viewControls: { ...vc, showUnitCell: true } });
    expect(buildSceneForDoc(cellDoc()).getObjectByName('unitcell')).toBeDefined();

    useStructureStore.setState({ viewControls: { ...vc, showUnitCell: false } });
    expect(buildSceneForDoc(cellDoc()).getObjectByName('unitcell')).toBeUndefined();
  });
});

// Per-atom overrides are snapshotted per-tab; a batch export must source each
// tab's own overrides so one tab's selection colors never leak onto another.
describe('buildSceneForDoc per-tab override isolation', () => {
  const atomDoc = () =>
    ({
      structure: { symbols: ['O'], positions: [[0, 0, 0]] },
      visualization: { bonds: [], rings: [] },
    }) as never;

  function atomColors(scene: THREE.Scene): string[] {
    const g = scene.getObjectByName('atoms');
    const out: string[] = [];
    g?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) out.push((m.material as THREE.MeshStandardMaterial).color.getHexString());
    });
    return out;
  }

  it("uses each tab's own color overrides, not the active tab's", () => {
    useStructureStore.setState({ tabs: [], activeTabId: null, elements: {}, atomStyles: {} });
    const aId = useStructureStore.getState().addTab(atomDoc(), 'A');
    // A selection recolor writes the per-atom (pure-selection) map.
    useStructureStore.setState({
      perAtomColorOverrides: { 0: '#ff0000' },
      colorOverrides: { 0: '#ff0000' },
    });
    const bId = useStructureStore.getState().addTab(atomDoc(), 'B'); // snapshots A, B active, no override

    const colorsA = atomColors(buildSceneForDoc(atomDoc(), aId));
    const colorsB = atomColors(buildSceneForDoc(atomDoc(), bId));

    expect(colorsA).toContain('ff0000'); // A keeps its red selection override
    expect(colorsB).not.toContain('ff0000'); // B did not inherit A's override
  });

  it("exports an inactive tab with its OWN per-element styling, not the active tab's", () => {
    useStructureStore.setState({ tabs: [], activeTabId: null, atomStyles: {} });
    const aId = useStructureStore.getState().addTab(atomDoc(), 'A');
    // Style element O=green while tab A is active (perAtom map stays empty — this
    // is per-element styling, which is now captured per tab).
    useStructureStore.setState({
      elements: { O: { color: '#00ff00' } },
      perAtomColorOverrides: null,
    });
    useStructureStore.getState().addTab(atomDoc(), 'B'); // snapshots A's green element style
    // Element O is restyled to red while on tab B — this belongs to B only now.
    useStructureStore.setState({ elements: { O: { color: '#ff0000' } } });

    const colorsA = atomColors(buildSceneForDoc(atomDoc(), aId));
    expect(colorsA).toContain('00ff00'); // A keeps its own green element style
    expect(colorsA).not.toContain('ff0000'); // B's red element style does not leak onto A
  });
});

// --- hi-res PNG capture ----------------------------------------------------

describe('computeCaptureSize', () => {
  it('multiplies CSS size by dpr and scale, rounding each axis', () => {
    expect(computeCaptureSize(800, 600, 2, 2)).toEqual({ width: 3200, height: 2400 });
    expect(computeCaptureSize(800, 600, 1, 1)).toEqual({ width: 800, height: 600 });
    expect(computeCaptureSize(800, 600, 1, 4)).toEqual({ width: 3200, height: 2400 });
  });

  it('rounds fractional results to the nearest integer', () => {
    // 100 * 1.5 * 1 = 150 (exact); 101 * 1.5 = 151.5 -> 152
    expect(computeCaptureSize(101, 100, 1.5, 1)).toEqual({ width: 152, height: 150 });
  });

  it('clamps each axis to a minimum of 1 so a 0-sized canvas never yields 0', () => {
    expect(computeCaptureSize(0, 0, 1, 1)).toEqual({ width: 1, height: 1 });
    expect(computeCaptureSize(0.1, 0.1, 1, 1)).toEqual({ width: 1, height: 1 });
  });
});

describe('captureCanvasPng GL orchestration', () => {
  // Build a fake capture handle whose gl/camera/composer methods are spies so we
  // can assert the hi-res resize → render → toDataURL → restore sequence without
  // a real WebGL context (unavailable in jsdom).
  function makeHandle(opts: { withComposer: boolean; cssW?: number; cssH?: number; pixelRatio?: number; maxTextureSize?: number }) {
    const cssW = opts.cssW ?? 400;
    const cssH = opts.cssH ?? 300;
    let pixelRatio = opts.pixelRatio ?? 2;
    const calls: string[] = [];

    const toDataURL = vi.fn(() => {
      calls.push('toDataURL');
      return 'data:image/png;base64,QUJD';
    });
    const getSize = vi.fn((target: { x: number; y: number }) => {
      target.x = cssW;
      target.y = cssH;
      return target;
    });
    const getPixelRatio = vi.fn(() => pixelRatio);
    const setPixelRatio = vi.fn((r: number) => {
      pixelRatio = r;
      calls.push(`setPixelRatio:${r}`);
    });
    const setSize = vi.fn((w: number, h: number) => {
      calls.push(`setSize:${w}x${h}`);
    });
    const render = vi.fn(() => {
      calls.push('gl.render');
    });

    const gl = {
      getSize,
      getPixelRatio,
      setPixelRatio,
      setSize,
      render,
      domElement: { toDataURL },
      capabilities: { maxTextureSize: opts.maxTextureSize ?? 16384 },
      getContext: () => ({ MAX_TEXTURE_SIZE: 0x0DE1, getParameter: () => opts.maxTextureSize ?? 16384 }),
    };

    const camera = {
      isPerspectiveCamera: true,
      aspect: cssW / cssH,
      updateProjectionMatrix: vi.fn(() => {
        calls.push(`aspect:${(camera.aspect).toFixed(4)}`);
      }),
    };

    const composerSetSize = vi.fn((w: number, h: number) => {
      calls.push(`composer.setSize:${w}x${h}`);
    });
    const composerRender = vi.fn(() => {
      calls.push('composer.render');
    });
    const composer = opts.withComposer
      ? { setSize: composerSetSize, render: composerRender }
      : null;

    const handle = {
      gl: gl as unknown as CaptureHandle['gl'],
      scene: {} as CaptureHandle['scene'],
      camera: camera as unknown as CaptureHandle['camera'],
      composer,
    } as CaptureHandle;

    return { handle, calls, spies: { toDataURL, getSize, setPixelRatio, setSize, render, camera, composerSetSize, composerRender } };
  }

  afterEach(() => setCaptureHandle(null));

  it('resizes to the hi-res dims (cssW*dpr*scale) and captures once', () => {
    const { handle, spies } = makeHandle({ withComposer: false });
    setCaptureHandle(handle);

    captureCanvasPng(2); // 400*2*2 = 1600 x 300*2*2 = 1200

    expect(spies.setSize).toHaveBeenCalledWith(1600, 1200, false);
    expect(spies.toDataURL).toHaveBeenCalledTimes(1);
  });

  it('restores pixelRatio, on-screen size, and camera aspect after capture', () => {
    const { handle, calls, spies } = makeHandle({ withComposer: false });
    setCaptureHandle(handle);

    captureCanvasPng(2);

    // pixelRatio: set to 1 for capture, restored to the original 2 afterwards.
    expect(spies.setPixelRatio).toHaveBeenNthCalledWith(1, 1);
    expect(spies.setPixelRatio).toHaveBeenNthCalledWith(2, 2);
    // Final setSize call restores the on-screen CSS size.
    expect(spies.setSize).toHaveBeenLastCalledWith(400, 300, false);
    // The hi-res setSize precedes the toDataURL which precedes the restore setSize.
    const hiResIdx = calls.indexOf('setSize:1600x1200');
    const captureIdx = calls.indexOf('toDataURL');
    const restoreIdx = calls.lastIndexOf('setSize:400x300');
    expect(hiResIdx).toBeGreaterThanOrEqual(0);
    expect(hiResIdx).toBeLessThan(captureIdx);
    expect(captureIdx).toBeLessThan(restoreIdx);
    // Camera aspect ends restored to the original 400/300, and the projection
    // matrix was recomputed for both the capture set and the finally restore.
    expect(spies.camera.aspect).toBeCloseTo(400 / 300, 5);
    expect(spies.camera.updateProjectionMatrix).toHaveBeenCalledTimes(2);
  });

  it('renders through the composer when one is in the handle', () => {
    const { handle, spies } = makeHandle({ withComposer: true });
    setCaptureHandle(handle);

    captureCanvasPng(2);

    expect(spies.composerSetSize).toHaveBeenCalledWith(1600, 1200);
    expect(spies.composerRender).toHaveBeenCalled();
    // gl.render must NOT be used when the composer is active (would drop AO).
    expect(spies.render).not.toHaveBeenCalled();
  });

  it('renders via gl.render when no composer is in the handle', () => {
    const { handle, spies } = makeHandle({ withComposer: false });
    setCaptureHandle(handle);

    captureCanvasPng(2);

    expect(spies.render).toHaveBeenCalled();
  });

  it('does NOT resize at scale === 1 (1x is the legacy on-screen snapshot)', () => {
    const { handle, spies } = makeHandle({ withComposer: false });
    setCaptureHandle(handle);

    const url = captureCanvasPng(1);

    expect(url).toBe('data:image/png;base64,QUJD');
    expect(spies.setSize).not.toHaveBeenCalled();
    expect(spies.setPixelRatio).not.toHaveBeenCalled();
    expect(spies.toDataURL).toHaveBeenCalledTimes(1);
  });

  it('clamps the hi-res dims to the GPU max texture size but still proceeds', () => {
    // 400*2*4 = 3200 wide, 300*2*4 = 2400 tall, max texture size is 2048.
    // ratio = min(1, 2048/3200, 2048/2400) = 0.64 → 2048×1536 (aspect preserved).
    const { handle, spies } = makeHandle({ withComposer: false, maxTextureSize: 2048 });
    setCaptureHandle(handle);

    captureCanvasPng(4);

    expect(spies.setSize).toHaveBeenCalledWith(2048, 1536, false);
    expect(spies.toDataURL).toHaveBeenCalledTimes(1);
  });

  it('orthographic camera: captures hi-res but never calls updateProjectionMatrix', () => {
    // Build a handle whose camera does NOT have isPerspectiveCamera set (ortho).
    // The ortho frustum is size-independent so updateProjectionMatrix must not be
    // called — touching it would corrupt the ortho projection.
    const { handle, spies } = makeHandle({ withComposer: false });
    // Override camera to be orthographic (no isPerspectiveCamera flag).
    const orthoUpdateProjectionMatrix = vi.fn();
    const orthoCamera = {
      updateProjectionMatrix: orthoUpdateProjectionMatrix,
    };
    (handle as { camera: unknown }).camera = orthoCamera as unknown as CaptureHandle['camera'];
    setCaptureHandle(handle);

    captureCanvasPng(2); // 400*2*2 = 1600 × 300*2*2 = 1200

    // Hi-res resize must still happen.
    expect(spies.setSize).toHaveBeenCalledWith(1600, 1200, false);
    // Canvas must be captured.
    expect(spies.toDataURL).toHaveBeenCalledTimes(1);
    // updateProjectionMatrix must NEVER be called for an ortho camera.
    expect(orthoUpdateProjectionMatrix).not.toHaveBeenCalled();
  });

  it('restores the on-screen size even when toDataURL throws', () => {
    const { handle, spies } = makeHandle({ withComposer: false });
    spies.toDataURL.mockImplementationOnce(() => {
      throw new Error('capture boom');
    });
    setCaptureHandle(handle);

    expect(() => captureCanvasPng(2)).toThrow('capture boom');
    // finally block must still restore the on-screen CSS size + pixelRatio.
    expect(spies.setSize).toHaveBeenLastCalledWith(400, 300, false);
    expect(spies.setPixelRatio).toHaveBeenLastCalledWith(2);
  });

  it('falls back to document.querySelector when no handle is registered', () => {
    setCaptureHandle(null);
    const canvas = document.createElement('canvas');
    canvas.toDataURL = vi.fn(() => 'data:image/png;base64,RkFMTEJBQ0s=') as never;
    document.body.appendChild(canvas);

    const url = captureCanvasPng(2);
    expect(url).toBe('data:image/png;base64,RkFMTEJBQ0s=');

    document.body.removeChild(canvas);
  });
});
