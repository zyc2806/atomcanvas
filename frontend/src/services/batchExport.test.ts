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

  it('exports an inactive tab with the LIVE element color, not the stale snapshot', () => {
    useStructureStore.setState({ tabs: [], activeTabId: null, atomStyles: {} });
    const aId = useStructureStore.getState().addTab(atomDoc(), 'A');
    // Simulate StylePanel baking element O=green into the visible colorOverrides
    // while tab A is active (perAtom map stays empty — this is element styling).
    useStructureStore.setState({
      elements: { O: { color: '#00ff00' } },
      colorOverrides: { 0: '#00ff00' },
      perAtomColorOverrides: null,
    });
    useStructureStore.getState().addTab(atomDoc(), 'B'); // snapshots A's green colorOverrides
    // Element O is restyled globally to red while on tab B.
    useStructureStore.setState({ elements: { O: { color: '#ff0000' } } });

    const colorsA = atomColors(buildSceneForDoc(atomDoc(), aId));
    expect(colorsA).toContain('ff0000'); // live element color, as the viewport would show
    expect(colorsA).not.toContain('00ff00'); // not the stale snapshot color
  });
});
