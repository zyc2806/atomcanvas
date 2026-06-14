import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { batchExportGlb, buildSceneForDoc } from './batchExport';
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

  function sceneWith(bondRadius: number, bondsStyleRadius: number): THREE.Scene {
    const vp = useStructureStore.getState().visParams;
    useStructureStore.setState({
      visParams: { ...vp, bondRadius, atomScale: 1 },
      bondsStyle: { style: 'cylinder', radius: bondsStyleRadius, colorMode: 'uniform' },
      elements: {},
      atomStyles: {},
    });
    return buildSceneForDoc(doubleBondDoc());
  }

  it('ignores bondsStyle.radius — changing it leaves the geometry unchanged', () => {
    const base = bondPerpExtent(sceneWith(0.08, 0.12));
    const fatStyle = bondPerpExtent(sceneWith(0.08, 0.99));
    expect(fatStyle).toBeCloseTo(base, 6);
  });

  it('honors visParams.bondRadius — increasing it widens the double-bond split', () => {
    const base = bondPerpExtent(sceneWith(0.08, 0.12));
    const wider = bondPerpExtent(sceneWith(0.2, 0.12));
    expect(wider).toBeGreaterThan(base + 1e-3);
  });
});
